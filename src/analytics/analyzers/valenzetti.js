'use strict';

/**
 * Valenzetti Football Equation Analyzer (Dixon-Coles + 6-Factor Model)
 *
 * Вдохновлён «Уравнением Валенцетти» (Lost, 4-8-15-16-23-42),
 * но построен как строгая вероятностная модель футбольного матча.
 *
 * Математика:
 *   S = (4, 8, 15, 16, 23, 42) — числа Lost
 *   w_i = s_i / 108 — нормализованные priors (fallback, НЕ мистика)
 *   θ = (0.12, 0.18, 0.16, 0.06, 0.08, 0.07) — обучаемые/default веса
 *
 *   6 факторов команды:
 *   F1 (base_strength):      pts/game + gd/game (strength rating)
 *   F2 (attack_power):       goals_for/game, shots or xG if available
 *   F3 (defensive_stability): clean_sheet_rate + inverse ga/game
 *   F4 (match_context):      home/away split, league normalization
 *   F5 (human_factor):       discipline (cards/red cards inverted)
 *   F6 (temporal_dynamics):  exponentially decayed recent form
 *
 *   eta_H = α + HA + Σ θ_i * factor_Hi - Σ θ_i * factor_Ai
 *   eta_A = α           + Σ θ_i * factor_Ai - Σ θ_i * factor_Hi
 *
 *   λ = exp(clamp(η, -8, 8)), clamped to [0.02, 5.5]
 *   P(G_H=x, G_A=y) = Poisson(x|λ_H) * Poisson(y|λ_A) * τ(x, y, λ_H, λ_A, ρ)
 *
 * Вход: массивы игр команд с полями { gf, ga, venue, outcome, ... }
 * Выход: { value, confidence, details }
 */

const DEFAULT_THETA = [0.12, 0.18, 0.16, 0.06, 0.08, 0.07];
const PRIOR_WEIGHTS = [4 / 108, 8 / 108, 15 / 108, 16 / 108, 23 / 108, 42 / 108];
const DEFAULT_ALPHA = Math.log(1.22);     // ln(1.22) ≈ 0.19885
const DEFAULT_HOME_ADV = 0.16;
const DEFAULT_RHO = -0.08;
const DEFAULT_MAX_GOALS = 7;
const MIN_GAMES = 6;
const ETA_CLAMP = 8;
const LAMBDA_MIN = 0.02;
const LAMBDA_MAX = 5.5;

// ─── Helpers ───

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

function safeNumber(v, fallback) {
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function poissonPMF(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    if (k === 0) return Math.exp(-lambda);
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p *= lambda / i;
    return p;
}

function factorial(n) {
    if (n <= 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
}

function dixonColesTau(h, a, lH, lA, rho) {
    if (h === 0 && a === 0) return 1 - lH * lA * rho;
    if (h === 0 && a === 1) return 1 + lH * rho;
    if (h === 1 && a === 0) return 1 + lA * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
}

function getTeamFactorBaseStrength(games) {
    // pts per game + gd per game, normalized
    const n = games.length;
    if (n === 0) return 0.5;
    let pts = 0, gdSum = 0, count = 0;
    for (const g of games) {
        const gf = safeNumber(g.gf, 0);
        const ga = safeNumber(g.ga, 0);
        if (g.gf != null && g.ga != null) {
            if (gf > ga) pts += 3;
            else if (gf === ga) pts += 1;
            gdSum += gf - ga;
            count++;
        }
    }
    if (count === 0) return 0.5;
    const ptsPerG = pts / count / 3; // normalize to ~0-1
    const gdPerG = (gdSum / count + 3) / 6; // normalize gd range to ~0-1
    return clamp((ptsPerG + gdPerG) / 2, 0, 1);
}

function getTeamFactorAttackPower(games) {
    // goals_for per game + shots/xG if available
    const n = games.length;
    if (n === 0) return 0.5;
    let gfSum = 0, shotsSum = 0, xgSum = 0, count = 0, shotsCount = 0, xgCount = 0;
    for (const g of games) {
        const gf = safeNumber(g.gf, 0);
        gfSum += gf;
        count++;
        if (g.shots != null && Number.isFinite(g.shots)) {
            shotsSum += Number(g.shots);
            shotsCount++;
        }
        if (g.xg_for != null && Number.isFinite(g.xg_for)) {
            xgSum += Number(g.xg_for);
            xgCount++;
        }
    }
    const goalsPerG = count > 0 ? gfSum / count : 0;
    const shotsPerG = shotsCount > 0 ? shotsSum / shotsCount : 0;
    const xgPerG = xgCount > 0 ? xgSum / xgCount : 0;

    // Normalize: typical goals ~0-3, shots ~0-25, xG ~0-3
    const goalsNorm = clamp(goalsPerG / 3.5, 0, 1);
    let attackRating = goalsNorm;
    if (shotsCount >= 3 && xgCount >= 3) {
        const shotsNorm = clamp(shotsPerG / 25, 0, 1);
        const xgNorm = clamp(xgPerG / 3.5, 0, 1);
        attackRating = (goalsNorm + shotsNorm + xgNorm) / 3;
    } else if (shotsCount >= 3) {
        const shotsNorm = clamp(shotsPerG / 25, 0, 1);
        attackRating = (goalsNorm + shotsNorm) / 2;
    } else if (xgCount >= 3) {
        const xgNorm = clamp(xgPerG / 3.5, 0, 1);
        attackRating = (goalsNorm + xgNorm) / 2;
    }
    return clamp(attackRating, 0, 1);
}

function getTeamFactorDefensiveStability(games) {
    // Clean sheet rate + inverse ga/game
    const n = games.length;
    if (n === 0) return 0.5;
    let gaSum = 0, cleanSheets = 0, count = 0;
    for (const g of games) {
        const ga = safeNumber(g.ga, 0);
        gaSum += ga;
        count++;
        if (g.ga != null && Number(g.ga) === 0) cleanSheets++;
    }
    const gaPerG = count > 0 ? gaSum / count : 2;
    const csRate = count > 0 ? cleanSheets / count : 0;
    // Invert ga: lower ga -> higher rating
    const gaInv = clamp(1 - gaPerG / 4, 0, 1);
    return clamp((csRate * 0.5 + gaInv * 0.5), 0, 1);
}

function getTeamFactorMatchContext(games, venueHint) {
    // If venue info available, normalize: home generally stronger
    const n = games.length;
    if (n === 0) return 0.5;
    let homeCount = 0, awayCount = 0;
    let homeWins = 0, awayWins = 0;
    for (const g of games) {
        const v = (g.venue || 'any').toLowerCase();
        const gf = safeNumber(g.gf, 0);
        const ga = safeNumber(g.ga, 0);
        if (v === 'home') {
            homeCount++;
            if (gf > ga) homeWins++;
        } else if (v === 'away') {
            awayCount++;
            if (gf > ga) awayWins++;
        } else {
            // If venue not clear, try to infer from teamId
            homeCount++;
            if (gf > ga) homeWins++;
        }
    }
    const homeWinRate = homeCount > 0 ? homeWins / homeCount : 0.4;
    const awayWinRate = awayCount > 0 ? awayWins / awayCount : 0.3;
    // Weighted by venueHint if provided
    let contextRating;
    if (venueHint === 'home') {
        contextRating = homeWinRate * 0.7 + awayWinRate * 0.3;
    } else if (venueHint === 'away') {
        contextRating = homeWinRate * 0.3 + awayWinRate * 0.7;
    } else {
        contextRating = (homeWinRate + awayWinRate) / 2;
    }
    return clamp(contextRating, 0, 1);
}

function getTeamFactorHumanFactor(games) {
    // Discipline: cards (inverted), red cards heavily penalized
    const n = games.length;
    if (n === 0) return 0.5;
    let totalCards = 0, redCards = 0, count = 0;
    let hasCardData = false;
    for (const g of games) {
        // Check raw game event data or cards_on_home/cards_on_away convention
        const cards = safeNumber(g.cards, 0);
        const reds = safeNumber(g.red_cards, 0);
        if (g.cards != null || g.red_cards != null) hasCardData = true;
        totalCards += cards;
        redCards += reds;
        count++;
    }
    if (!hasCardData) {
        // Fallback: use recent outcome volatility as proxy
        let outcomes = games.filter(g => g.outcome).map(g => g.outcome);
        if (outcomes.length < 3) return 0.5;
        let transitions = 0;
        for (let i = 1; i < outcomes.length; i++) {
            if (outcomes[i] !== outcomes[i - 1]) transitions++;
        }
        const stability = 1 - transitions / (outcomes.length - 1);
        return clamp(0.3 + stability * 0.4, 0, 1);
    }
    const avgCards = count > 0 ? totalCards / count : 0;
    const avgReds = count > 0 ? redCards / count : 0;
    // Discipline: fewer cards and reds = better (higher factor)
    const cardsPenalty = clamp(avgCards / 5, 0, 1);    // 5 cards per game = max penalty
    const redsPenalty = clamp(avgReds * 3, 0, 1);      // each red card is heavy
    const discipline = clamp(1 - (cardsPenalty * 0.4 + redsPenalty * 0.6), 0, 1);
    return discipline;
}

function getTeamFactorTemporalDynamics(games, decayBase) {
    // Exponentially decayed recent form with recency weighting
    const n = games.length;
    if (n === 0) return 0.5;
    const DECAY = decayBase || 0.85; // exponential decay factor
    let weightedForm = 0, weightSum = 0;
    for (let i = 0; i < n; i++) {
        const g = games[i];
        const gf = safeNumber(g.gf, 0);
        const ga = safeNumber(g.ga, 0);
        // Form value: win=1, draw=0.5, loss=0
        let formVal = 0.5;
        if (g.gf != null && g.ga != null) {
            if (gf > ga) formVal = 1;
            else if (gf < ga) formVal = 0;
        }
        // Recency: more recent = higher weight
        const w = Math.pow(DECAY, n - 1 - i);
        weightedForm += formVal * w;
        weightSum += w;
    }
    const average = weightSum > 0 ? weightedForm / weightSum : 0.5;
    // Streak bonus: 3+ consecutive same outcomes
    let streak = 0;
    if (games.length >= 3) {
        const recent = games.slice(0, 3);
        const outcomes = recent.map(g => {
            const gf = safeNumber(g.gf, 0);
            const ga = safeNumber(g.ga, 0);
            if (gf > ga) return 'W';
            if (gf < ga) return 'L';
            return 'D';
        });
        const first = outcomes[0];
        if (first && outcomes.every(o => o === first)) {
            streak = 0.1; // 10% bonus for streak
        }
    }
    return clamp(average + streak, 0, 1);
}

function getSixFactors(games, venueHint, decayBase) {
    if (!Array.isArray(games) || games.length === 0) {
        return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    }
    return [
        getTeamFactorBaseStrength(games),
        getTeamFactorAttackPower(games),
        getTeamFactorDefensiveStability(games),
        getTeamFactorMatchContext(games, venueHint),
        getTeamFactorHumanFactor(games),
        getTeamFactorTemporalDynamics(games, decayBase),
    ];
}

/**
 * Core function: predict match outcome probabilities using Valenzetti model.
 *
 * @param {Array} homeGames — home team's recent games
 * @param {Array} awayGames — away team's recent games
 * @param {Object} [options]
 * @param {number} [options.alpha] — intercept (default ln(1.22))
 * @param {number} [options.homeAdvantage] — home advantage boost (default 0.16)
 * @param {number[]} [options.theta] — 6 factor weights (default DEFAULT_THETA)
 * @param {number} [options.rho] — Dixon-Coles rho (default -0.08)
 * @param {number} [options.maxGoals] — max goals for score matrix (default 7)
 * @param {string} [options.homeVenueHint] — venue hint for home team ('home'|'away'|null)
 * @param {string} [options.awayVenueHint] — venue hint for away team
 * @returns {{value, confidence, details}}
 */
function analyze(homeGames, awayGames, options = {}) {
    const alpha = options.alpha != null ? options.alpha : DEFAULT_ALPHA;
    const homeAdv = options.homeAdvantage != null ? options.homeAdvantage : DEFAULT_HOME_ADV;
    const theta = Array.isArray(options.theta) && options.theta.length === 6
        ? options.theta.map(x => Number(x))
        : DEFAULT_THETA;
    const rho = options.rho != null ? options.rho : DEFAULT_RHO;
    const maxGoals = options.maxGoals || DEFAULT_MAX_GOALS;
    const decayBase = options.decayBase || 0.85;

    // Validate input
    if (!Array.isArray(homeGames) || homeGames.length < MIN_GAMES ||
        !Array.isArray(awayGames) || awayGames.length < MIN_GAMES) {
        return {
            value: 0,
            confidence: 0,
            details: {
                error: 'insufficient_data',
                home_games: homeGames ? homeGames.length : 0,
                away_games: awayGames ? awayGames.length : 0,
                required: MIN_GAMES,
            },
        };
    }

    // 1. Compute 6 factors for each team
    const homeVenue = options.homeVenueHint || 'home';
    const awayVenue = options.awayVenueHint || 'away';
    const F_H = getSixFactors(homeGames, homeVenue, decayBase);
    const F_A = getSixFactors(awayGames, awayVenue, decayBase);

    // 2. Compute eta (linear predictor)
    // eta_H = alpha + homeAdv + Σθ_i*(F_H_i - F_A_i)
    // eta_A = alpha           + Σθ_i*(F_A_i - F_H_i)
    let etaH = alpha + homeAdv;
    let etaA = alpha;
    for (let i = 0; i < 6; i++) {
        const diff = F_H[i] - F_A[i];
        etaH += theta[i] * diff;
        etaA += theta[i] * (-diff);
    }

    // 3. Apply lambda with clamping
    const lambdaHome = clamp(Math.exp(clamp(etaH, -ETA_CLAMP, ETA_CLAMP)), LAMBDA_MIN, LAMBDA_MAX);
    const lambdaAway = clamp(Math.exp(clamp(etaA, -ETA_CLAMP, ETA_CLAMP)), LAMBDA_MIN, LAMBDA_MAX);

    // 4. Score matrix: P(x,y) = Pois(x|λ_H) * Pois(y|λ_A) * τ(x,y)
    let pHome = 0, pDraw = 0, pAway = 0;
    let maxProb = 0;
    let predictedScore = { home: 0, away: 0, prob: 0 };
    const scoreMatrix = [];

    for (let h = 0; h <= maxGoals; h++) {
        const row = [];
        for (let a = 0; a <= maxGoals; a++) {
            const p = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
            let tau = dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
            // Clamp tau to non-negative
            tau = Math.max(0, tau);
            let prob = p * tau;
            prob = Math.max(0, prob); // ensure non-negative

            row.push(prob);

            if (h > a) pHome += prob;
            else if (h === a) pDraw += prob;
            else pAway += prob;

            if (prob > maxProb) {
                maxProb = prob;
                predictedScore = { home: h, away: a, prob };
            }
        }
        scoreMatrix.push(row);
    }

    // 5. Normalize outcome probabilities
    const totalProb = pHome + pDraw + pAway;
    if (totalProb > 0) {
        pHome /= totalProb;
        pDraw /= totalProb;
        pAway /= totalProb;
    }

    // 6. Entropy and confidence
    const H_val = -(pHome > 0 ? pHome * Math.log(pHome) : 0)
                  - (pDraw > 0 ? pDraw * Math.log(pDraw) : 0)
                  - (pAway > 0 ? pAway * Math.log(pAway) : 0);
    const H_norm = H_val / Math.log(3);
    const confidenceLevel = clamp(1 - H_norm, 0, 1);

    // 7. Prediction label
    let predicted, confidence;
    if (pHome >= pDraw && pHome >= pAway) {
        predicted = 'HOME';
        confidence = pHome;
    } else if (pAway >= pDraw) {
        predicted = 'AWAY';
        confidence = pAway;
    } else {
        predicted = 'DRAW';
        confidence = pDraw;
    }

    // 8. Data confidence factor
    const dataConfidence = Math.min(1, Math.min(homeGames.length, awayGames.length) / 20);
    const combinedConfidence = dataConfidence * 0.5 + confidenceLevel * 0.5;

    // 9. Calculate Over/Under totals
    const totals = calculateTotals(scoreMatrix, [1.5, 2.5, 3.5, 4.5]);

    return {
        value: Math.round(confidence * 10000) / 10000,
        confidence: Math.round(combinedConfidence * 10000) / 10000,
        details: {
            lambda_home: Math.round(lambdaHome * 100) / 100,
            lambda_away: Math.round(lambdaAway * 100) / 100,
            probabilities: {
                home: Math.round(pHome * 10000) / 10000,
                draw: Math.round(pDraw * 10000) / 10000,
                away: Math.round(pAway * 10000) / 10000,
            },
            predicted_outcome: predicted,
            predicted_confidence: Math.round(confidence * 10000) / 10000,
            predicted_score: predictedScore,
            factors: {
                home: F_H.map(v => Math.round(v * 1000) / 1000),
                away: F_A.map(v => Math.round(v * 1000) / 1000),
                labels: ['base_strength', 'attack_power', 'defensive_stability', 'match_context', 'human_factor', 'temporal_dynamics'],
            },
            entropy: Math.round(H_norm * 10000) / 10000,
            confidence_level: Math.round(confidenceLevel * 10000) / 10000,
            dixon_coles_rho: rho,
            max_goals: maxGoals,
            theta: theta.map(v => Math.round(v * 10000) / 10000),
            alpha: Math.round(alpha * 10000) / 10000,
            home_advantage: homeAdv,
            games_used: {
                home: homeGames.length,
                away: awayGames.length,
            },
            totals,
        },
    };
}

/**
 * Per-team analyze adapter: computes a simpler per-team metric
 * based on form entropy (like per-team analyzers).
 * Used in strategies per-team flow when pair isn't available.
 */
function analyzeTeam(games) {
    if (!Array.isArray(games) || games.length < MIN_GAMES) {
        return { value: 0, confidence: 0, details: { error: 'insufficient_data' } };
    }

    const F = getSixFactors(games, 'any', 0.85);
    const formEntropy = (() => {
        const outcomes = games
            .filter(g => g.outcome)
            .map(g => g.outcome);
        if (outcomes.length < 3) return 0.5;
        const counts = { W: 0, D: 0, L: 0 };
        for (const o of outcomes) counts[o]++;
        const n = outcomes.length;
        let H = 0;
        for (const c of Object.values(counts)) {
            const p = c / n;
            if (p > 0) H -= p * Math.log(p);
        }
        return n > 0 ? H / Math.log(3) : 1;
    })();

    const value = 1 - formEntropy; // predictability
    const confidence = Math.min(1, games.length / 20);

    return {
        value: Math.round(value * 10000) / 10000,
        confidence: Math.round(confidence * 10000) / 10000,
        details: {
            factors: F.map(v => Math.round(v * 1000) / 1000),
            labels: ['base_strength', 'attack_power', 'defensive_stability', 'match_context', 'human_factor', 'temporal_dynamics'],
            form_entropy: Math.round(formEntropy * 10000) / 10000,
            games_used: games.length,
        },
    };
}

/**
 * Calculates Over/Under probabilities for given total goals lines
 * based on the score matrix from the Valenzetti model.
 *
 * @param {number[][]} scoreMatrix - [h][a] probability matrix
 * @param {number[]} [lines=[1.5, 2.5, 3.5, 4.5]] - total goals lines to evaluate
 * @returns {object} totals by line: { line: { over, under, predicted, confidence } }
 */
function calculateTotals(scoreMatrix, lines = [1.5, 2.5, 3.5, 4.5]) {
    const totals = {};

    for (const line of lines) {
        let overProb = 0;
        let underProb = 0;

        for (let h = 0; h < scoreMatrix.length; h++) {
            for (let a = 0; a < scoreMatrix[h].length; a++) {
                const prob = scoreMatrix[h][a];
                const total = h + a;

                if (total > line) {
                    overProb += prob;
                } else if (total < line) {
                    underProb += prob;
                }
                // total === line: push (not counted in OVER/UNDER)
            }
        }

        const predicted = overProb > underProb ? 'OVER' : 'UNDER';
        const confidence = Math.max(overProb, underProb);

        totals[line] = {
            over: Math.round(overProb * 10000) / 10000,
            under: Math.round(underProb * 10000) / 10000,
            predicted,
            confidence: Math.round(confidence * 10000) / 10000,
        };
    }

    return totals;
}
module.exports = {
    name: 'valenzetti',
    minGames: MIN_GAMES,
    analyze,
    analyzeTeam,
    calculateTotals,
    // Exposed for testing
    getSixFactors,
    getTeamFactorBaseStrength,
    getTeamFactorAttackPower,
    getTeamFactorDefensiveStability,
    getTeamFactorMatchContext,
    getTeamFactorHumanFactor,
    getTeamFactorTemporalDynamics,
    poissonPMF,
    dixonColesTau,
};