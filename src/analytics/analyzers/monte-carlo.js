'use strict';

/**
 * Анализатор MonteCarloBetting (rewrite v2).
 *
 * Источник идеи: pkg6/revolutionary_spiral_model/analyzers/enhanced_markov_analyzers.py:328
 *           (MonteCarloBettingAnalyzer)
 *
 * Главная метрика:
 *   edge_per_bet = posterior_p × odds - 1
 *   (>0 = есть value, <0 = букмекер занижает шансы → не брать)
 *
 * Дополнительные:
 *   Half-Kelly fraction (× 0.5, cap 0.10) — профессиональный стандарт
 *   EV per bet         = expected return per unit bet (в долях ставки)
 *   50-step projection — Monte Carlo для информации, не для принятия решения
 *
 * Конвейер:
 *   1. recent_p   = wins(target) / N_recent за последние 10
 *      empirical_p = wins(target) / total
 *      posterior_p = 0.5 × prior_or_empirical + 0.5 × recent_p
 *   2. edge       = posterior_p × odds - 1
 *   3. kelly      = max(0, ((b·p) - q) / b) × 0.5  (half-kelly), cap 0.10
 *   4. Monte Carlo bankroll проекция на 50 ставок — справочно
 *
 * Вход: { games: [{outcome}], odds: number, target: 'W'|'D'|'L', priorWinRate? }
 * Выход: { value, confidence, details }
 *
 *   value = edge_per_bet ∈ (-1, +∞)
 */

const { mean, std, quantile } = require('../utils/stats.js');

const MIN_GAMES = 8;
const N_RUNS = 5000;
const N_GAMES_PER_RUN = 50;
const KELLY_MULTIPLIER = 0.5;   // Half-Kelly
const KELLY_CAP = 0.10;          // не больше 10% банка на ставку

function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Half-Kelly fraction с capping.
 * Возвращает 0 если нет edge (p × odds ≤ 1).
 */
function halfKellyFraction(p, odds) {
  if (odds <= 1 || p <= 0 || p >= 1) return 0;
  const b = odds - 1;
  const fullKelly = (b * p - (1 - p)) / b;
  if (fullKelly <= 0) return 0;
  const half = fullKelly * KELLY_MULTIPLIER;
  return Math.min(KELLY_CAP, half);
}

function analyze(input) {
  const games = input && input.games;
  const odds = input && input.odds;
  const target = (input && input.target) || 'W';
  const priorWinRate = input && input.priorWinRate;

  if (!Array.isArray(games) || games.length < MIN_GAMES) {
    return {
      value: 0, confidence: 0,
      details: { error: 'insufficient_games', required: MIN_GAMES, got: games ? games.length : 0 },
    };
  }
  if (typeof odds !== 'number' || !isFinite(odds) || odds <= 1) {
    return {
      value: 0, confidence: 0,
      details: { error: 'invalid_odds', odds },
    };
  }

  const outcomes = games.map((g) => g.outcome).filter((o) => o === 'W' || o === 'D' || o === 'L');
  if (outcomes.length < MIN_GAMES) {
    return {
      value: 0, confidence: 0,
      details: { error: 'not_enough_decided', got: outcomes.length, required: MIN_GAMES },
    };
  }

  // Empirical (long-term) win rate of TARGET
  const totalWins = outcomes.filter((o) => o === target).length;
  const empiricalP = totalWins / outcomes.length;

  // Recent: последние 10 (или меньше, если короче)
  const recentN = Math.min(10, outcomes.length);
  const recentWins = outcomes.slice(0, recentN).filter((o) => o === target).length;
  const recentP = recentWins / recentN;

  // Prior: если передан явно — использовать, иначе empirical
  const prior = (typeof priorWinRate === 'number' && isFinite(priorWinRate))
    ? priorWinRate
    : empiricalP;

  // Posterior (взвешенное среднее) с safety bounds
  const wRecent = 0.5;
  const wPrior = 1 - wRecent;
  let posteriorP = wPrior * prior + wRecent * recentP;
  posteriorP = Math.max(0.01, Math.min(0.99, posteriorP));

  // Implied probability от букмекера (без vig)
  const impliedP = 1 / odds;

  // Главная метрика: edge per bet
  const edgePerBet = posteriorP * odds - 1;

  // Expected Value на 1 unit bet:
  //   если выиграл → +(odds-1), если проиграл → -1
  //   EV_per_unit = p*(odds-1) - (1-p) = p*odds - 1 = edge
  // То есть EV_per_unit == edge.
  // Но при ставке Kelly fraction от банка, "EV per stake unit" то же самое.
  const evPerUnit = edgePerBet;

  // Kelly (Half-Kelly с capping)
  const f = halfKellyFraction(posteriorP, odds);

  // Monte Carlo bankroll projection (50 ставок) — для информации
  const rng = makeRng(42);
  const profits = new Float64Array(N_RUNS);
  for (let r = 0; r < N_RUNS; r++) {
    let bk = 1.0;
    for (let g = 0; g < N_GAMES_PER_RUN; g++) {
      if (bk <= 0 || f === 0) break;
      const win = rng() < posteriorP;
      if (win) bk *= (1 + f * (odds - 1));
      else bk *= (1 - f);
    }
    profits[r] = bk - 1.0;
  }
  const profitsArr = Array.from(profits);
  const meanProfit = mean(profitsArr);
  const stdProfit = std(profitsArr);
  const median = quantile(profitsArr, 0.5);
  const var5 = quantile(profitsArr, 0.05);
  const var95 = quantile(profitsArr, 0.95);
  const sharpe = stdProfit > 1e-9 ? meanProfit / stdProfit : 0;

  // Рекомендация — на основе edge + Kelly
  let recommendation;
  if (edgePerBet <= 0 || f === 0) recommendation = 'SKIP';
  else if (edgePerBet < 0.03)     recommendation = 'CAUTIOUS';   // <3% edge — на грани шума
  else if (edgePerBet < 0.10)     recommendation = 'TAKE';
  else                            recommendation = 'STRONG_TAKE'; // >10% edge — серьёзный мисприс

  const confidence = Math.min(1, outcomes.length / 20);

  return {
    value: edgePerBet,
    confidence,
    details: {
      target,
      odds,
      implied_p: impliedP,
      empirical_win_rate: empiricalP,
      recent_win_rate: recentP,
      recent_n: recentN,
      prior_win_rate: prior,
      posterior_win_prob: posteriorP,
      edge_per_bet: edgePerBet,
      ev_per_unit: evPerUnit,
      kelly_fraction: f,
      kelly_type: 'half',
      kelly_cap: KELLY_CAP,
      recommendation,
      projection_50_bets: {
        n_simulations: N_RUNS,
        n_bets: N_GAMES_PER_RUN,
        mean_bankroll_growth: meanProfit,
        median_bankroll_growth: median,
        std_bankroll_growth: stdProfit,
        var_5_percent: var5,
        var_95_percent: var95,
        sharpe_ratio: sharpe,
        note: '50-bet compounding projection — for context only, NOT a guaranteed outcome',
      },
    },
  };
}

module.exports = {
  name: 'monte_carlo_betting',
  minGames: MIN_GAMES,
  analyze,
};
