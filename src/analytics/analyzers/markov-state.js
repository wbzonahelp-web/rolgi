'use strict';

/**
 * Анализатор MarkovChainState.
 *
 * Источник: pkg6/revolutionary_spiral_model/analyzers/markov_analyzers.py:21
 *           (MarkovChainStateAnalyzer)
 *
 * Идея: дискретизуем ряд (xG_diff или goal_diff команды) в 4 квартильных
 * состояния LOW/MED_LOW/MED_HIGH/HIGH, строим матрицу переходов 4x4,
 * считаем энтропию H. Чем ниже H — тем «предсказуемее» команда.
 *
 *   predictability = 1 - H_system / log2(N_states)
 *
 * Возвращает predictability ∈ [0,1], где 1 = максимально предсказуема.
 */

const { quantiles, shannonEntropy } = require('../utils/stats.js');

const STATE_LABELS = ['LOW', 'MED_LOW', 'MED_HIGH', 'HIGH'];
const MIN_GAMES = 10;

function discretize(value, q25, q50, q75) {
  if (value <= q25) return 0; // LOW
  if (value <= q50) return 1; // MED_LOW
  if (value <= q75) return 2; // MED_HIGH
  return 3;                   // HIGH
}

/**
 * @param {Array<{xg_diff: number|null, gd: number|null}>} games
 *   Список матчей от свежих к старым (как из getTeamRecentGames).
 *   Использует xg_diff, fallback на gd, если xG нет.
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

  // Хронологический порядок: oldest → newest
  const chrono = games.slice().reverse();

  // Извлекаем числовой ряд: предпочитаем xg_diff, fallback на gd
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

  // Квартили
  const [q25, q50, q75] = quantiles(series, [0.25, 0.5, 0.75]);

  // Дискретизация ряда
  const stateSeq = series.map((v) => discretize(v, q25, q50, q75));

  // Матрица переходов 4x4
  const N = 4;
  const counts = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < stateSeq.length - 1; i++) {
    counts[stateSeq[i]][stateSeq[i + 1]] += 1;
  }
  const matrix = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    const rowSum = counts[i].reduce((a, b) => a + b, 0);
    if (rowSum === 0) {
      // Равномерное априори для отсутствующего состояния
      for (let j = 0; j < N; j++) matrix[i][j] = 1 / N;
    } else {
      for (let j = 0; j < N; j++) matrix[i][j] = counts[i][j] / rowSum;
    }
  }

  // Энтропия всех вероятностей переходов (логарифмическая мера хаоса)
  const flatProbs = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (matrix[i][j] > 0) flatProbs.push(matrix[i][j] / N); // взвешиваем по числу состояний
    }
  }
  // Альтернативно: энтропия каждой строки, потом усреднение
  let rowEntropies = [];
  for (let i = 0; i < N; i++) {
    const row = matrix[i];
    const probs = row.filter((p) => p > 0);
    rowEntropies.push(shannonEntropy(probs));
  }
  const avgRowEntropy = rowEntropies.reduce((a, b) => a + b, 0) / N;
  const maxEntropy = Math.log2(N); // log2(4) = 2

  const predictability = Math.max(0, Math.min(1, 1 - avgRowEntropy / maxEntropy));

  // Текущее (последнее) состояние
  const currentState = stateSeq[stateSeq.length - 1];

  // Вычисляем простое следующее состояние = argmax строки текущего
  let nextState = 0;
  let nextProb = -1;
  for (let j = 0; j < N; j++) {
    if (matrix[currentState][j] > nextProb) {
      nextProb = matrix[currentState][j];
      nextState = j;
    }
  }

  const confidence = Math.min(1, series.length / 20);

  return {
    value: predictability,
    confidence,
    details: {
      used_field: usedField,
      n_states: N,
      state_labels: STATE_LABELS,
      thresholds: { q25, q50, q75 },
      state_sequence: stateSeq,
      transition_matrix: matrix,
      row_entropies: rowEntropies,
      avg_row_entropy: avgRowEntropy,
      max_entropy: maxEntropy,
      current_state: STATE_LABELS[currentState],
      next_state: {
        prediction: STATE_LABELS[nextState],
        probability: nextProb,
      },
      counts: {
        LOW: stateSeq.filter((s) => s === 0).length,
        MED_LOW: stateSeq.filter((s) => s === 1).length,
        MED_HIGH: stateSeq.filter((s) => s === 2).length,
        HIGH: stateSeq.filter((s) => s === 3).length,
      },
    },
  };
}

module.exports = {
  name: 'markov_state',
  minGames: MIN_GAMES,
  analyze,
};
