'use strict';

/**
 * Strategy Prediction Service
 * 
 * Сервис для вычисления прогнозов по пользовательским стратегиям.
 * Извлечён из strategies-routes.js для использования в cron job'ах.
 */

const { getLeagueParams } = require('../analytics/utils/league-params');

/**
 * Вычисляет прогноз по стратегии (stateless).
 * Логика аналогична integrated forecast, но с кастомными весами.
 * 
 * @param {Object} db - Database connection pool
 * @param {string|number} gameId - Game ID (sstats_id or internal id)
 * @param {Object} config - Strategy configuration with analyzers and weights
 * @returns {Promise<Object>} Prediction result
 */
async function computeStrategyPrediction(db, gameId, config) {
    // Резолвим матч
    const gRes = await db.query(
`SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id,
        g.date, g.season, g.status
 FROM games g
 WHERE g.sstats_id = $1 OR g.id = $1
 ORDER BY (g.sstats_id = $1) DESC, g.id ASC LIMIT 1`, [gameId]
    );
    if (!gRes.rows.length) return { error: 'Game not found' };
    const game = gRes.rows[0];

    const n = config.n_window || 20;
    const leagueInternal = config.league_filter ? game.league_id : null;
    // Build weight map from config, fallback to defaults
    const defaultWeights = { poisson: 0.60, markov_outcome: 0.15, form_inertia: 0.10, hmm: 0.15, valenzetti: 0.15 };
    const _w = {};
    for (const a of (config?.analyzers || [])) { _w[a.name] = a.weight; }
    const w = (name) => _w[name] ?? defaultWeights[name] ?? 0;

    // Загрузка истории
    async function loadGames(teamId) {
        const sql = `
            SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                   gs.expected_goals_home, gs.expected_goals_away, g.date
            FROM games g
            LEFT JOIN game_statistics gs ON gs.game_id = g.id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_deleted = false AND g.status = 'finished'
              AND g.date < $3
              AND ($4::int IS NULL OR g.league_id = $4)
            ORDER BY g.date DESC LIMIT $2`;
        const { rows } = await db.query(sql, [teamId, n, game.date, leagueInternal]);
        return rows.map(r => {
            const isHome = r.home_team_id === teamId;
            const gf = isHome ? r.home_score : r.away_score;
            const ga = isHome ? r.away_score : r.home_score;
            let outcome = null;
            if (gf != null && ga != null) {
                if (gf > ga) outcome = 'W';
                else if (gf < ga) outcome = 'L';
                else outcome = 'D';
            }
            const xgH = r.expected_goals_home != null ? Number(r.expected_goals_home) : null;
            const xgA = r.expected_goals_away != null ? Number(r.expected_goals_away) : null;
            return {
                outcome, gf, ga,
                gd: gf != null && ga != null ? gf - ga : null,
                xg_for: isHome ? xgH : xgA,
                xg_against: isHome ? xgA : xgH,
                xg_diff: xgH != null && xgA != null ? (isHome ? xgH - xgA : xgA - xgH) : null,
                venue: isHome ? 'home' : 'away',
            };
        });
    }

    const [homeGames, awayGames] = await Promise.all([
        loadGames(game.home_team_id),
        loadGames(game.away_team_id),
    ]);

    // Прогон анализаторов
    const aPoisson = require('../analytics/analyzers/poisson.js');
    const aValenzetti = require('../analytics/analyzers/valenzetti.js');
    const modules = {
        markov_outcome:  require('../analytics/analyzers/markov-outcome.js'),
        markov_state:    require('../analytics/analyzers/markov-state.js'),
        shannon_entropy: require('../analytics/analyzers/shannon-entropy.js'),
        form_inertia:    require('../analytics/analyzers/form-inertia.js'),
        multipeak:       require('../analytics/analyzers/multipeak-density.js'),
        valenzetti:      require('../analytics/analyzers/valenzetti.js'),
    };

    const homeResults = {};
    const awayResults = {};
    for (const a of config.analyzers) {
        if (!a.enabled) continue;
        if (a.name === 'hmm') continue; // HMM — через Python, ниже
        if (a.name === 'poisson') continue; // Poisson requires both teams
        if (a.name === 'valenzetti') continue; // Valenzetti requires both teams
        const mod = modules[a.name];
        if (!mod) continue;
        homeResults[a.name] = mod.analyze(homeGames);
        awayResults[a.name] = mod.analyze(awayGames);
    }

    // Poisson needs both teams
    const poissonConfig = config.analyzers.find(a => a.name === 'poisson' && a.enabled);
    if (poissonConfig) {
        const leagueParams = getLeagueParams(game.league_id, game.season);
        homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
            avgHomeGoals: leagueParams.avg_home_goals,
            avgAwayGoals: leagueParams.avg_away_goals
        });
        awayResults.poisson = aPoisson.analyze(awayGames, homeGames, {
            avgHomeGoals: leagueParams.avg_home_goals,
            avgAwayGoals: leagueParams.avg_away_goals
        });
    }

    // Valenzetti needs both teams (like Poisson)
    const valenzettiConfig = config.analyzers.find(a => a.name === 'valenzetti' && a.enabled);
    if (valenzettiConfig) {
        const leagueParamsV = getLeagueParams(game.league_id, game.season);
        homeResults.valenzetti = aValenzetti.analyze(homeGames, awayGames, {
            alpha: leagueParamsV?.avg_home_goals ? Math.log(Number(leagueParamsV.avg_home_goals)) : undefined,
        });
        awayResults.valenzetti = aValenzetti.analyzeTeam(awayGames);
    }

    // HMM (async, graceful)
    const hmmConfig = config.analyzers.find(a => a.name === 'hmm' && a.enabled);
    if (hmmConfig) {
        const pythonClient = require('../analytics/python-client.js');
        const [homeHmm, awayHmm] = await Promise.allSettled([
            pythonClient.getTeamAnalyzer('hmm', game.home_team_id, { nWindow: n }),
            pythonClient.getTeamAnalyzer('hmm', game.away_team_id, { nWindow: n }),
        ]);
        homeResults.hmm = homeHmm.status === 'fulfilled' ? homeHmm.value : null;
        awayResults.hmm = awayHmm.status === 'fulfilled' ? awayHmm.value : null;
    }

    // === V4 Forecast: Poisson primary + corrections ===
    let homeScore = 0, drawScore = 0, awayScore = 0;

    // Poisson base (weight 0.60)
    const poissonRes = homeResults.poisson;
    if (poissonRes && poissonRes.details && !poissonRes.details.error) {
        const probs = poissonRes.details.probabilities || {};
        homeScore += (probs.home || 0.333) * w('poisson');
        drawScore += (probs.draw || 0.333) * w('poisson');
        awayScore += (probs.away || 0.333) * w('poisson');
    } else {
        homeScore += 0.333 * w('poisson');
        drawScore += 0.333 * w('poisson');
        awayScore += 0.333 * w('poisson');
    }

    // Momentum (weight 0.15)
    const homeStreak = homeResults.markov_outcome?.details?.streak || {};
    const awayStreak = awayResults.markov_outcome?.details?.streak || {};
    if (homeStreak.current_outcome === 'W' && homeStreak.current_length >= 3) homeScore += w('markov_outcome') * 0.5;
    else if (homeStreak.current_outcome === 'L' && homeStreak.current_length >= 3) awayScore += w('markov_outcome') * 0.5;
    if (awayStreak.current_outcome === 'W' && awayStreak.current_length >= 3) awayScore += w('markov_outcome') * 0.7;
    else if (awayStreak.current_outcome === 'L' && awayStreak.current_length >= 3) homeScore += w('markov_outcome') * 0.5;

    // HMM (weight 0.15)
    if (homeResults.hmm && awayResults.hmm && hmmConfig) {
        const homeExp = homeResults.hmm.details?.expected_next_level ?? 1;
        const awayExp = awayResults.hmm.details?.expected_next_level ?? 1;
        const hmmAdv = (homeExp - awayExp) / 3;
        if (hmmAdv > 0) homeScore += hmmAdv * w('hmm');
        else if (hmmAdv < 0) awayScore += Math.abs(hmmAdv) * w('hmm');
        if (Math.abs(hmmAdv) < 0.1) drawScore += w('hmm') * 0.2;
    }

    // Form inertia (weight 0.10)
    const homeFI = homeResults.form_inertia;
    const awayFI = awayResults.form_inertia;
    if (homeFI?.details && awayFI?.details) {
        const hLag1 = homeFI.details.lag1_corr || 0;
        const aLag1 = awayFI.details.lag1_corr || 0;
        const hMean = homeFI.details.mean_value || 0;
        const aMean = awayFI.details.mean_value || 0;
        if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean > 0.3) homeScore += w('form_inertia') * Math.min(hLag1, 1);
        else if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean < -0.3) awayScore += w('form_inertia') * Math.min(hLag1, 1);
        if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean > 0.3) awayScore += w('form_inertia') * Math.min(aLag1, 1);
        else if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean < -0.3) homeScore += w('form_inertia') * Math.min(aLag1, 1);
    }

    // Valenzetti probabilities (weight 0.15)
    const valenzettiRes = homeResults.valenzetti;
    if (valenzettiRes && valenzettiRes.details && !valenzettiRes.details.error && valenzettiRes.details.probabilities) {
        const probs = valenzettiRes.details.probabilities;
        homeScore += (probs.home || 0.333) * w('valenzetti');
        drawScore += (probs.draw || 0.333) * w('valenzetti');
        awayScore += (probs.away || 0.333) * w('valenzetti');
    } else {
        homeScore += 0.333 * w('valenzetti');
        drawScore += 0.333 * w('valenzetti');
        awayScore += 0.333 * w('valenzetti');
    }

    // Determine outcome
    let predictedOutcome, confidence;
    const totalScore = homeScore + drawScore + awayScore;
    if (totalScore > 0) {
        const normH = homeScore / totalScore;
        const normD = drawScore / totalScore;
        const normA = awayScore / totalScore;
        if (normH >= normD && normH >= normA) { predictedOutcome = 'HOME'; confidence = normH; }
        else if (normA >= normD) { predictedOutcome = 'AWAY'; confidence = normA; }
        else { predictedOutcome = 'DRAW'; confidence = normD; }
    } else {
        predictedOutcome = 'DRAW'; confidence = 0.33;
    }

    // Корректировка confidence по стабильности
    const enabledAnalyzers = config.analyzers.filter(a => a.enabled);
    let stabilitySum = 0, stabilityCount = 0;
    for (const a of enabledAnalyzers) {
        const hVal = homeResults[a.name]?.value;
        const aVal = awayResults[a.name]?.value;
        if (hVal != null) { stabilitySum += hVal; stabilityCount++; }
        if (aVal != null) { stabilitySum += aVal; stabilityCount++; }
    }
    const avgStability = stabilityCount > 0 ? stabilitySum / stabilityCount : 0.5;
    confidence = Math.max(0, Math.min(1, confidence * (0.5 + 0.5 * avgStability)));

    return {
        game_id: game.id,
        game_sstats_id: game.sstats_id,
        predicted_outcome: predictedOutcome,
        confidence: Math.round(confidence * 10000) / 10000,
        home_analyzers: homeResults,
        away_analyzers: awayResults,
        config_used: config,
    };
}

/**
 * Вычисляет прогноз на основе результатов анализаторов и весов стратегии.
 * Используется в backtest и других сценариях, где analyzer results уже есть.
 * 
 * @param {Object} homeResults - Analyzer results for home team
 * @param {Object} awayResults - Analyzer results for away team
 * @param {Array} homeGames - Home team game history
 * @param {Array} awayGames - Away team game history
 * @param {Object} leagueParams - League parameters (unused currently, for future)
 * @param {Object} strategyConfig - Strategy configuration with weights
 * @returns {Object} { predicted, confidence }
 */
function predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams = {}, strategyConfig) {
    // === V4 Forecast: Poisson primary + corrections ===
    // Build weight map from config, fallback to defaults
    const defaultWeights = { poisson: 0.60, markov_outcome: 0.15, form_inertia: 0.10, hmm: 0.15 };
    const _w = {};
    for (const a of (strategyConfig?.analyzers || [])) { _w[a.name] = a.weight; }
    const w = (name) => _w[name] ?? defaultWeights[name] ?? 0;
    let homeScore = 0, drawScore = 0, awayScore = 0;

    // Poisson base
    const poissonRes = homeResults.poisson;
    if (poissonRes && poissonRes.details && !poissonRes.details.error) {
        const probs = poissonRes.details.probabilities || {};
        homeScore += (probs.home || 0.333) * w('poisson');
        drawScore += (probs.draw || 0.333) * w('poisson');
        awayScore += (probs.away || 0.333) * w('poisson');
    } else {
        homeScore += 0.333 * w('poisson');
        drawScore += 0.333 * w('poisson');
        awayScore += 0.333 * w('poisson');
    }

    // Momentum
    const homeStreak = homeResults.markov_outcome?.details?.streak || {};
    const awayStreak = awayResults.markov_outcome?.details?.streak || {};
    if (homeStreak.current_outcome === 'W' && homeStreak.current_length >= 3) homeScore += w('markov_outcome') * 0.5;
    else if (homeStreak.current_outcome === 'L' && homeStreak.current_length >= 3) awayScore += w('markov_outcome') * 0.5;
    if (awayStreak.current_outcome === 'W' && awayStreak.current_length >= 3) awayScore += w('markov_outcome') * 0.7;
    else if (awayStreak.current_outcome === 'L' && awayStreak.current_length >= 3) homeScore += w('markov_outcome') * 0.5;

    // HMM
    const hmmConf = strategyConfig.analyzers.find(a => a.name === 'hmm' && a.enabled);
    if (homeResults.hmm && awayResults.hmm && hmmConf) {
        const homeExp = homeResults.hmm.details?.expected_next_level ?? 1;
        const awayExp = awayResults.hmm.details?.expected_next_level ?? 1;
        const hmmAdv = (homeExp - awayExp) / 3;
        if (hmmAdv > 0) homeScore += hmmAdv * w('hmm');
        else if (hmmAdv < 0) awayScore += Math.abs(hmmAdv) * w('hmm');
        if (Math.abs(hmmAdv) < 0.1) drawScore += w('hmm') * 0.2;
    }

    // Form inertia
    const homeFI = homeResults.form_inertia;
    const awayFI = awayResults.form_inertia;
    if (homeFI?.details && awayFI?.details) {
        const hLag1 = homeFI.details.lag1_corr || 0;
        const aLag1 = awayFI.details.lag1_corr || 0;
        const hMean = homeFI.details.mean_value || 0;
        const aMean = awayFI.details.mean_value || 0;
        if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean > 0.3) homeScore += w('form_inertia') * Math.min(hLag1, 1);
        else if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean < -0.3) awayScore += w('form_inertia') * Math.min(hLag1, 1);
        if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean > 0.3) awayScore += w('form_inertia') * Math.min(aLag1, 1);
        else if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean < -0.3) homeScore += w('form_inertia') * Math.min(aLag1, 1);
    }

    // Valenzetti probabilities (weighted from analyze())
    const valenzettiRes = homeResults.valenzetti;
    if (valenzettiRes && valenzettiRes.details && !valenzettiRes.details.error && valenzettiRes.details.probabilities) {
        const probs = valenzettiRes.details.probabilities;
        homeScore += (probs.home || 0.333) * w('valenzetti');
        drawScore += (probs.draw || 0.333) * w('valenzetti');
        awayScore += (probs.away || 0.333) * w('valenzetti');
    } else {
        homeScore += 0.333 * w('valenzetti');
        drawScore += 0.333 * w('valenzetti');
        awayScore += 0.333 * w('valenzetti');
    }

    // Determine outcome
    let predicted, confidence;
    const totalScore = homeScore + drawScore + awayScore;
    if (totalScore > 0) {
        const normH = homeScore / totalScore;
        const normD = drawScore / totalScore;
        const normA = awayScore / totalScore;
        if (normH >= normD && normH >= normA) { predicted = 'HOME'; confidence = normH; }
        else if (normA >= normD) { predicted = 'AWAY'; confidence = normA; }
        else { predicted = 'DRAW'; confidence = normD; }
    } else {
        predicted = 'DRAW'; confidence = 0.33;
    }
    return { predicted, confidence };
}

module.exports = {
    computeStrategyPrediction,
    predictFromAnalyzers,
};
