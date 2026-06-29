'use strict';

/**
 * Анализатор MultiPeakDensity.
 *
 * Источник: pkg6/revolutionary_spiral_model/analyzers/coulomb_analyzers.py:15
 *           (MultiPeakDensityAnalyzer) — без эзотерики, чистый детектор
 *           мультимодальности гистограммы.
 *
 * Идея:
 *   1. Строим гистограмму xG_diff (или gd) в n_bins = max(5, sqrt(N)).
 *   2. Локальный максимум: hist[i] > hist[i-1] && hist[i] > hist[i+1]
 *                         && hist[i] > mean(hist) + std(hist)
 *   3. peak_strength    = mean(peaks_heights)
 *   4. peak_contrast    = max(hist) / mean(hist)
 *   5. value            = peak_count > 1 ? 1 - 1/peak_count : 0
 *                         (0 если 1 пик, 0.5 если 2, 0.67 если 3, …)
 *
 * Применение:
 *   - 1 peak  → команда стабильна (один режим игры)
 *   - 2 peaks → биполярная: домашний vs выездной режим, или фарт vs не фарт
 *   - 3+      → разнородные периоды формы
 *
 * Вход: массив матчей (newest first), используем xg_diff/gd.
 * Выход: {value, confidence, details}.
 */

const { mean, std, histogram } = require('../utils/stats.js');

const MIN_GAMES = 10;

function analyze(games) {
  if (!Array.isArray(games) || games.length < MIN_GAMES) {
    return {
      value: 0, confidence: 0,
      details: { error: 'insufficient_games', required: MIN_GAMES, got: games ? games.length : 0 },
    };
  }

  // Выбираем рабочий ряд
  let usedField = 'xg_diff';
  let series = games.map((g) => (g.xg_diff != null ? Number(g.xg_diff) : null))
                    .filter((v) => v != null && isFinite(v));
  if (series.length < MIN_GAMES) {
    usedField = 'gd';
    series = games.map((g) => (g.gd != null ? Number(g.gd) : null))
                  .filter((v) => v != null && isFinite(v));
  }
  if (series.length < MIN_GAMES) {
    return {
      value: 0, confidence: 0,
      details: { error: 'not_enough_numeric_data', got: series.length, required: MIN_GAMES },
    };
  }

  const N = series.length;
  const nBins = Math.min(20, Math.max(5, Math.round(Math.sqrt(N))));

  const { counts, edges, binWidth } = histogram(series, nBins);
  const histMean = mean(counts);
  const histStd = std(counts);
  // Soft threshold: пик должен быть выше среднего на половину std
  // И при этом значимым: share >= 15% от всех данных
  const thresholdHeight = histMean + 0.5 * histStd;
  const thresholdShare = 0.15;

  // Поиск локальных максимумов (включая boundary peaks)
  const peaks = [];
  for (let i = 0; i < nBins; i++) {
    const c = counts[i];
    const prev = i > 0 ? counts[i - 1] : -1;       // boundary OK
    const next = i < nBins - 1 ? counts[i + 1] : -1;
    const isLocalMax = c >= prev && c >= next && (c > prev || c > next);
    const meetsHeight = c > thresholdHeight;
    const meetsShare = c / N >= thresholdShare;
    if (isLocalMax && meetsHeight && meetsShare) {
      const binCenter = edges[i] + binWidth / 2;
      peaks.push({
        bin_index: i,
        bin_center: binCenter,
        height: c,
        share: c / N,
      });
    }
  }

  const peakCount = peaks.length;
  const peakStrength = peakCount > 0
    ? peaks.reduce((s, p) => s + p.height, 0) / peakCount
    : 0;
  const maxBin = Math.max(...counts);
  const peakContrast = histMean > 0 ? maxBin / histMean : 0;

  // Главное значение: 0 если ≤1 пик, иначе 1 - 1/peakCount
  // 2 peaks → 0.5, 3 peaks → 0.67, 4 → 0.75
  const multimodality = peakCount <= 1 ? 0 : 1 - 1 / peakCount;

  // Confidence: растёт с количеством данных
  const confidence = Math.min(1, N / 30);

  return {
    value: multimodality,
    confidence,
    details: {
      used_field: usedField,
      series_length: N,
      n_bins: nBins,
      bin_width: binWidth,
      hist_counts: Array.from(counts),
      hist_mean: histMean,
      hist_std: histStd,
      threshold_height: thresholdHeight,
      threshold_share: thresholdShare,
      peak_count: peakCount,
      peaks,
      peak_strength: peakStrength,
      peak_contrast: peakContrast,
      series_mean: mean(series),
      series_std: std(series),
      series_min: Math.min(...series),
      series_max: Math.max(...series),
      interpretation: peakCount === 0
        ? 'no_clear_peaks'
        : peakCount === 1
          ? 'unimodal_stable'
          : peakCount === 2
            ? 'bimodal_two_regimes'
            : 'multimodal_unstable',
    },
  };
}

module.exports = {
  name: 'multipeak_density',
  minGames: MIN_GAMES,
  analyze,
};
