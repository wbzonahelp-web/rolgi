'use strict';

/**
 * Анализатор MarkovMatchOutcome.
 *
 * Источник идеи: pkg6/revolutionary_spiral_model/analyzers/markov_analyzers.py:331
 *  (MarkovMatchOutcomeAnalyzer). Адаптировано для футбола: 3 состояния W/D/L,
 *  матрица переходов 3x3, прогноз следующего исхода как argmax строки текущего
 *  состояния, "стабильность" через среднюю длину серий.
 *
 * Вход: массив последних матчей команды (от НОВЫХ к старым, как из
 *       team-history.getTeamRecentGames).
 * Выход: {value, confidence, details}.
 */

const STATES = ['W', 'D', 'L'];
const MIN_GAMES = 6;

/**
 * Главная функция анализатора.
 *
 * @param {Array<{outcome: 'W'|'D'|'L'|null, date: Date}>} games
 *   Список матчей в порядке от свежих к старым (как из SQL ORDER BY date DESC).
 *   Используется только поле .outcome.
 * @returns {{value: number, confidence: number, details: object}}
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

  // Хронологический порядок: oldest → newest (нужен для матрицы переходов)
  const chrono = games.slice().reverse();

  const seq = chrono
    .map((g) => g.outcome)
    .filter((o) => o === 'W' || o === 'D' || o === 'L');

  if (seq.length < MIN_GAMES) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'not_enough_decided_games',
        got: seq.length,
        required: MIN_GAMES,
      },
    };
  }

  // 1) Матрица переходов
  const counts = {
    W: { W: 0, D: 0, L: 0 },
    D: { W: 0, D: 0, L: 0 },
    L: { W: 0, D: 0, L: 0 },
  };
  for (let i = 0; i < seq.length - 1; i++) {
    counts[seq[i]][seq[i + 1]] += 1;
  }
  const matrix = {};
  for (const from of STATES) {
    const rowSum = counts[from].W + counts[from].D + counts[from].L;
    matrix[from] = {};
    if (rowSum === 0) {
      // Никаких переходов из этого состояния → равномерное априори
      for (const to of STATES) matrix[from][to] = 1 / 3;
    } else {
      for (const to of STATES) matrix[from][to] = counts[from][to] / rowSum;
    }
  }

  // 2) Текущее состояние = последний результат
  const currentState = seq[seq.length - 1];

  // 3) Предсказание следующего исхода: argmax строки текущего состояния
  const row = matrix[currentState];
  let bestOutcome = 'D';
  let bestProb = -1;
  for (const o of STATES) {
    if (row[o] > bestProb) {
      bestProb = row[o];
      bestOutcome = o;
    }
  }

  // 4) Серии (streaks) для streak_predictability
  const streaks = [];
  let curOutcome = seq[0];
  let curLen = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === curOutcome) {
      curLen++;
    } else {
      streaks.push({ outcome: curOutcome, length: curLen });
      curOutcome = seq[i];
      curLen = 1;
    }
  }
  streaks.push({ outcome: curOutcome, length: curLen });

  const avgStreakLen =
    streaks.reduce((s, x) => s + x.length, 0) / streaks.length;
  // Чем длиннее средняя серия — тем более «предсказуема» команда.
  // streak_predictability ∈ (0, 1], при avg=1 → 0.5, при avg→∞ → 1.
  const streakPredictability = 1 - 1 / (1 + avgStreakLen);

  // Текущая активная серия (последний блок)
  const lastStreak = streaks[streaks.length - 1];

  // 5) Counts
  const ctW = seq.filter((s) => s === 'W').length;
  const ctD = seq.filter((s) => s === 'D').length;
  const ctL = seq.filter((s) => s === 'L').length;

  // 6) Итоговое value: вероятность argmax × predictability серий
  const value = bestProb * streakPredictability;

  // 7) Confidence: насколько мы доверяем (растёт с объёмом данных)
  // При seq.length=6 → 0.30, при 20 → 1.0, насыщение.
  const confidence = Math.min(1, seq.length / 20);

  return {
    value,
    confidence,
    details: {
      sequence: seq,
      transition_matrix: matrix,
      current_state: currentState,
      next_outcome: {
        prediction: bestOutcome,
        probability: bestProb,
      },
      streak: {
        current_length: lastStreak.length,
        current_outcome: lastStreak.outcome,
        avg_length: avgStreakLen,
        all_streaks_count: streaks.length,
        predictability: streakPredictability,
      },
      counts: {
        W: ctW,
        D: ctD,
        L: ctL,
        total: seq.length,
      },
    },
  };
}

module.exports = {
  name: 'markov_outcome',
  minGames: MIN_GAMES,
  analyze,
};
