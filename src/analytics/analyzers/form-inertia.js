'use strict';

/**
 * Анализатор FormInertia (бывший ElasticSelfForceAnalyzer).
 *
 * Источник: pkg6/revolutionary_spiral_model/analyzers/bulyzhenkov_analyzers.py:77
 *           (ElasticSelfForceAnalyzer) — переименован, потому что под названием
 *           «эластичная самосила» скрывается обычная средняя автокорреляция.
 *
 * Идея: насколько прошлый матч предсказывает следующий?
 *   ρ_k       = corr(x[:-k], x[k:])  для k=1..min(9, N/2)
 *   inertia   = mean(|ρ_k|)
 *
 * Применяем к ряду gd (goal difference). Высокая инерционность = команда в
 * устойчивой полосе формы (хорошей или плохой). Низкая = форма нестабильная.
 */

const { meanAbsAutocorr, autocorr, mean, std } = require('../utils/stats.js');

const MIN_GAMES = 8;
const MAX_LAG = 9;

/**
 * @param {Array<{gd:number|null, xg_diff:number|null}>} games
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

  // Хронологический порядок: oldest → newest (важно для автокорреляции)
  const chrono = games.slice().reverse();

  // Предпочитаем xg_diff, fallback на gd
  let usedField = 'xg_diff';
  let series = chrono
    .map((g) => (g.xg_diff != null ? Number(g.xg_diff) : null))
    .filter((v) => v != null && isFinite(v));

  if (series.length < MIN_GAMES) {
    usedField = 'gd';
    series = chrono
      .map((g) => (g.gd != null ? Number(g.gd) : null))
      .filter((v) => v != null && isFinite(v));
  }

  if (series.length < MIN_GAMES) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'not_enough_numeric_data',
        got: series.length,
        required: MIN_GAMES,
      },
    };
  }

  // Среднее модулей автокорреляций на лагах 1..min(MAX_LAG, N/2)
  const lim = Math.min(MAX_LAG, Math.floor(series.length / 2));
  const lagCorrs = [];
  for (let k = 1; k <= lim; k++) {
    lagCorrs.push({ lag: k, corr: autocorr(series, k) });
  }
  const inertia = meanAbsAutocorr(series, MAX_LAG);

  // Знак ведущей автокорреляции (lag=1): + значит «устойчиво продолжается»,
  // − значит «осцилляция» (зигзаги).
  const lag1Corr = lagCorrs.length > 0 ? lagCorrs[0].corr : 0;
  const trend = lag1Corr > 0 ? 'persistent' : lag1Corr < 0 ? 'oscillating' : 'random';

  const confidence = Math.min(1, series.length / 20);

  return {
    value: inertia,
    confidence,
    details: {
      used_field: usedField,
      series_length: series.length,
      lag_correlations: lagCorrs,
      lag1_corr: lag1Corr,
      trend,
      mean_value: mean(series),
      std_value: std(series),
      max_lag: lim,
      series_sample: series.slice(-12), // последние 12 значений для спарклайна
    },
  };
}

module.exports = {
  name: 'form_inertia',
  minGames: MIN_GAMES,
  analyze,
};
