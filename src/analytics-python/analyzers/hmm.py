"""
Hidden Markov Model — реконструкция скрытых состояний формы команды.

Модель: GaussianHMM с диагональной ковариацией, k=4 скрытых состояний.
Алгоритм: Baum-Welch для обучения (EM), Viterbi для декодирования
последовательности скрытых состояний на истории.

Фичи (multi-dim):
    1. gd          — реальный gd, основной сигнал
    2. xg_diff     — xG_for - xG_against (NaN-aware fallback на gd если xG нет)
    3. shots_diff_norm — (shots_for - shots_against) / (shots_for + shots_against + 1)
                        в [-1, 1], защита от деления на 0
    4. possession_diff — possession_for - 50 (центрировано вокруг 50%)
    5. btts        — both teams to score (1.0 если оба забили, 0.0 иначе)

Состояния (после сортировки по средней силе центроидов по gd):
    0 = WEAK
    1 = AVG
    2 = STRONG
    3 = EXCELLENT

Вывод:
    value = expected_level_normalized = E[next_state_index] / (k-1)
            где E[next_state_index] = sum(j * A[current, j]) для j in 0..k-1.
            ∈ [0,1], монотонно по ожидаемой силе формы:
              0.0 = ожидается WEAK (низшее состояние)
              0.33 = ожидается AVG
              0.66 = ожидается STRONG
              1.0 = ожидается EXCELLENT
            В отличие от P(stay-or-better), эта метрика однозначна:
            ↑value = ↑ожидаемая сила следующего матча, независимо от текущего состояния.

    confidence = min(1, N/30) × (1 - mean_row_entropy)
                — комбинация размера выборки и информативности матрицы переходов.

    details = {
        current_hidden_state: int 0..k-1 (последний матч в Viterbi-последовательности),
        current_state_label:  "WEAK"|"AVG"|"STRONG"|"EXCELLENT",
        expected_next_level:  float ∈ [0, k-1] — ожидаемый индекс следующего состояния,
        stability:            float ∈ [0,1] — 1 - normalized_entropy(A[current_state]),
                              насколько детерминирована траектория из текущего состояния,
        stay_or_better_prob:  float ∈ [0,1] — старая метрика, сохранена для совместимости,
        degenerate_fit:       bool — True если модель вырождена (см. ниже),
        degenerate_reasons:   список причин если degenerate_fit=True,
        state_means_standardized: [k×features] (после стандартизации, z-units),
        transition_matrix A,
        startprob: π,
        viterbi_sequence, viterbi_labels,
        log_likelihood, converged, n_iter_used,
        features_used, xg_available, n, mean_row_entropy,
        viterbi_state_distribution: {label: count} — распределение состояний в истории,
    }

Critерии degenerate_fit:
    - gd_centroid_spread (z-units) < 0.5: центроиды слиплись, состояния неразличимы;
    - dominant_state_share > 0.85: одно состояние поглотило >85% Viterbi-последовательности;
    - converged=False AND n_iter_used >= n_iter: модель не сошлась за лимит итераций.
"""
from __future__ import annotations

import logging
import warnings
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ..core.base import BaseAnalyzer, TeamGameRecord, register_analyzer

logger = logging.getLogger(__name__)

# Подавляем "Model is not converging" хам hmmlearn — мы это сами обрабатываем
warnings.filterwarnings("ignore", category=RuntimeWarning, module="hmmlearn")
warnings.filterwarnings("ignore", category=UserWarning, module="hmmlearn")

STATE_LABELS = ["WEAK", "AVG", "STRONG", "EXCELLENT"]


def _build_features(history: List[TeamGameRecord]) -> Tuple[np.ndarray, List[str], bool]:
    """
    Собирает матрицу фичей в **хронологическом** порядке (oldest→newest),
    т.к. HMM работает с временной последовательностью.

    Returns:
        X: np.ndarray shape (N, F)
        feature_names: список имён фичей
        xg_available: True если xG есть хотя бы в 50% матчей выборки
    """
    # history приходит newest→oldest, реверсируем
    seq = list(reversed(history))

    # xG доступность
    xg_count = sum(1 for r in seq if r.xg_diff is not None)
    xg_available = xg_count >= len(seq) * 0.5

    feature_names: List[str] = ["gd"]
    if xg_available:
        feature_names.append("xg_diff")
    feature_names.append("shots_diff_norm")
    feature_names.append("possession_diff")
    feature_names.append("btts")

    rows: List[List[float]] = []
    for r in seq:
        gd = float(r.gd if r.gd is not None else 0.0)

        vec: List[float] = [gd]
        if xg_available:
            # xg_diff: NaN-aware fallback на gd
            xg = r.xg_diff if r.xg_diff is not None else float(gd)
            vec.append(float(xg))

        sf = r.shots_for or 0
        sa = r.shots_against or 0
        denom = sf + sa
        sdn = (sf - sa) / denom if denom > 0 else 0.0
        vec.append(float(sdn))

        poss = r.possession if r.possession is not None else 50.0
        vec.append(float(poss) - 50.0)

        gf = r.gf if r.gf is not None else 0
        ga = r.ga if r.ga is not None else 0
        btts = 1.0 if (gf > 0 and ga > 0) else 0.0
        vec.append(btts)

        rows.append(vec)

    X = np.array(rows, dtype=np.float64)
    # Стандартизация по колонкам (HMM любит centered data)
    means = X.mean(axis=0)
    stds = X.std(axis=0)
    stds[stds < 1e-6] = 1.0
    X = (X - means) / stds
    return X, feature_names, xg_available


def _row_entropy(p: np.ndarray) -> float:
    """Энтропия одной строки матрицы переходов, нормированная на log2(k)."""
    p = p[p > 1e-12]
    if len(p) == 0:
        return 0.0
    return float(-np.sum(p * np.log2(p)) / np.log2(len(p)) if len(p) > 1 else 0.0)


@register_analyzer
class HiddenMarkovAnalyzer(BaseAnalyzer):
    name = "hmm"
    version = "1.1"
    min_games = 20  # HMM с k=4 и 5 фичами: нижняя граница работоспособности
    description = "Hidden Markov Model (Baum-Welch + Viterbi) for team form decomposition"

    def compute(self, history: List[TeamGameRecord], **params: Any) -> Dict[str, Any]:
        # Lazy import — чтобы модуль импортировался даже если hmmlearn не установлен
        # (это даст message error через AnalyzerResult.error, а не падение на регистрации)
        from hmmlearn import hmm as hmmlearn_hmm

        n_states = int(params.get("n_states", 4))
        n_iter = int(params.get("n_iter", 50))
        tol = float(params.get("tol", 1e-3))
        seed = int(params.get("seed", 42))

        if n_states != 4:
            # Лейблы под другое число состояний не определены; не падаем, генерим
            state_labels = [f"S{i}" for i in range(n_states)]
        else:
            state_labels = STATE_LABELS

        X, feature_names, xg_available = _build_features(history)
        N, F = X.shape

        model = hmmlearn_hmm.GaussianHMM(
            n_components=n_states,
            covariance_type="diag",
            n_iter=n_iter,
            tol=tol,
            random_state=seed,
            init_params="stmc",  # инициализация всех параметров
            params="stmc",
        )

        try:
            model.fit(X)
        except Exception as e:
            return {
                "value": None,
                "confidence": 0.0,
                "details": {
                    "error": f"fit_failed: {type(e).__name__}: {e}",
                    "n": N,
                    "features": feature_names,
                },
            }

        converged = bool(getattr(model.monitor_, "converged", False))
        n_iter_used = int(getattr(model.monitor_, "iter", 0))
        try:
            log_lik = float(model.score(X))
        except Exception:
            log_lik = float("nan")

        # Viterbi decoding
        try:
            viterbi_seq = model.predict(X).tolist()
        except Exception as e:
            return {
                "value": None,
                "confidence": 0.0,
                "details": {
                    "error": f"viterbi_failed: {type(e).__name__}: {e}",
                    "n": N,
                },
            }

        # Сортировка состояний по средней силе центроида (gd — первая фича)
        # чтобы 0=WEAK, ..., 3=EXCELLENT было детерминированно.
        means = model.means_  # shape (k, F)
        # primary score = mean of gd-column (после стандартизации)
        strength_score = means[:, 0]
        order = np.argsort(strength_score)  # weak→strong
        # Перенумеровка: old_idx → new_idx
        relabel = {int(old): int(new) for new, old in enumerate(order.tolist())}

        # Перенумерованные means, transition, startprob, viterbi_seq
        means_sorted = means[order].tolist()
        transmat_sorted = model.transmat_[np.ix_(order, order)]
        startprob_sorted = model.startprob_[order].tolist()
        viterbi_sorted = [relabel[s] for s in viterbi_seq]
        viterbi_labels = [state_labels[s] for s in viterbi_sorted]

        current_state = viterbi_sorted[-1]
        current_label = state_labels[current_state]

        # === НОВАЯ ОСНОВНАЯ МЕТРИКА value ===
        # value = E[next_state_index] / (k-1), ожидаемый нормированный уровень
        # следующего состояния. Монотонна по силе формы, в отличие от stay_or_better.
        a_row_cur = transmat_sorted[current_state]
        state_indices = np.arange(n_states, dtype=np.float64)
        expected_next_level = float(np.sum(state_indices * a_row_cur))
        if n_states > 1:
            value = expected_next_level / (n_states - 1)
        else:
            value = 0.0
        # клипуем на всякий случай (числовой шум)
        value = max(0.0, min(1.0, value))

        # Сохраняем старую метрику для совместимости и диагностики
        stay_or_better = float(np.sum(a_row_cur[current_state:]))

        # === stability — насколько детерминирована траектория из текущего состояния ===
        cur_row_entropy = _row_entropy(a_row_cur)
        stability = max(0.0, 1.0 - cur_row_entropy)

        # === confidence (без изменений) ===
        sample_factor = min(1.0, N / 30.0)
        mean_row_entropy = float(np.mean([_row_entropy(transmat_sorted[i]) for i in range(n_states)]))
        confidence = sample_factor * max(0.0, 1.0 - mean_row_entropy)

        # === degenerate_fit detection ===
        degenerate_reasons: List[str] = []
        # 1. Разброс центроидов по gd (первая фича, в z-units после стандартизации)
        gd_centroids = [row[0] for row in means_sorted]
        gd_spread = float(gd_centroids[-1] - gd_centroids[0]) if n_states >= 2 else 0.0
        if gd_spread < 0.5:
            degenerate_reasons.append(f"gd_spread_z={gd_spread:.3f}<0.5")
        # 2. Доминирование одного состояния в Viterbi
        viterbi_counts = Counter(viterbi_sorted)
        dominant_share = max(viterbi_counts.values()) / len(viterbi_sorted)
        if dominant_share > 0.85:
            degenerate_reasons.append(f"dominant_share={dominant_share:.3f}>0.85")
        # 3. Не сошлась
        if (not converged) and n_iter_used >= n_iter:
            degenerate_reasons.append(f"not_converged_at_iter={n_iter_used}")

        degenerate_fit = len(degenerate_reasons) > 0

        # Распределение состояний в истории — удобно для UI
        viterbi_state_distribution = {
            state_labels[i]: int(viterbi_counts.get(i, 0)) for i in range(n_states)
        }

        return {
            "value": value,
            "confidence": confidence,
            "details": {
                "current_hidden_state": current_state,
                "current_state_label": current_label,
                "state_labels": state_labels,
                "expected_next_level": expected_next_level,
                "stability": stability,
                "stay_or_better_prob": stay_or_better,
                "degenerate_fit": degenerate_fit,
                "degenerate_reasons": degenerate_reasons,
                "gd_centroid_spread_z": gd_spread,
                "dominant_state_share": float(dominant_share),
                "state_means_standardized": means_sorted,
                "transition_matrix": transmat_sorted.tolist(),
                "startprob": startprob_sorted,
                "viterbi_sequence": viterbi_sorted,
                "viterbi_labels": viterbi_labels,
                "viterbi_state_distribution": viterbi_state_distribution,
                "log_likelihood": log_lik,
                "converged": converged,
                "n_iter_used": n_iter_used,
                "features_used": feature_names,
                "xg_available": xg_available,
                "n": N,
                "mean_row_entropy": mean_row_entropy,
            },
        }
