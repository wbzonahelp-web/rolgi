'use strict';

/**
 * Анализатор ShannonEntropy.
 *
 * Источник: pkg6/revolutionary_spiral_model/analyzers/base_analyzers.py:35
 *           (ShannonEntropyAnalyzer)
 *
 * Идея: нормализованная гистограммная энтропия одномерного ряда.
 *   H = -Σ p_i · log2(p_i) / log2(N_bins)
 *
 * Применяем к ряду total_goals (gf + ga) или xG_total за последние N матчей.
 * Результат ∈ [0, 1]:
 *   0   — все матчи одинаковые (например, всегда 2-1)
 *   1   — максимально разнообразные тоталы
 *
 * Полезно как ML-фича «непредсказуемость команды по тоталу».
 */

const { normalizedHistogramEntropy } = require('../utils/stats.js');

const MIN_GAMES = 6;
const N_BINS = 10; // адекватное число бинов для футбольных тоталов

/**
 * @param {Array<{gf:number|null, ga:number|null, xg_for:number|null, xg_against:number|null}>} games
 *   Список матчей.
 * @returns {{value, confidence, details}}
 */
function analyze(games) {
  if (!Array.isArray(games) || games.length < MIN_GAMES) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'insufficient_data',
        required: MIN_GAMES,
        got: games ? games.length : 0,
      },
    };
  }

  // Извлекаем тоталы голов
  const totalGoals = games
    .map((g) => (g.gf != null && g.ga != null ? g.gf + g.ga : null))
    .filter((v) => v != null && isFinite(v));

  // Извлекаем xG-тоталы (если есть)
  const xgTotals = games
    .map((g) =>
      g.xg_for != null && g.xg_against != null
        ? Number(g.xg_for) + Number(g.xg_against)
        : null
    )
    .filter((v) => v != null && isFinite(v));

  if (totalGoals.length < MIN_GAMES) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'not_enough_total_goals',
        got: totalGoals.length,
        required: MIN_GAMES,
      },
    };
  }

  const goalsEntropy = normalizedHistogramEntropy(totalGoals, N_BINS);
  const xgEntropy =
    xgTotals.length >= MIN_GAMES
      ? normalizedHistogramEntropy(xgTotals, N_BINS)
      : null;

  // Главное значение — энтропия по тоталам голов
  const value = goalsEntropy;

  // Confidence растёт с количеством данных, насыщение на 20 матчах
  const confidence = Math.min(1, totalGoals.length / 20);

  // Доп. статистика для UI
  const minG = Math.min(...totalGoals);
  const maxG = Math.max(...totalGoals);
  const meanG = totalGoals.reduce((a, b) => a + b, 0) / totalGoals.length;
  const varG =
    totalGoals.reduce((a, b) => a + (b - meanG) * (b - meanG), 0) /
    totalGoals.length;

  return {
    value,
    confidence,
    details: {
      n_bins: N_BINS,
      goals_entropy: goalsEntropy,
      xg_entropy: xgEntropy,
      games_with_goals: totalGoals.length,
      games_with_xg: xgTotals.length,
      total_goals_stats: {
        min: minG,
        max: maxG,
        mean: meanG,
        std: Math.sqrt(varG),
      },
      total_goals_series: totalGoals,
    },
  };
}

module.exports = {
  name: 'shannon_entropy',
  minGames: MIN_GAMES,
  analyze,
};
