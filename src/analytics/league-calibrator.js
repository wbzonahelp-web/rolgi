'use strict';

/**
 * League Calibrator v1.0
 *
 * Для каждой лиги находит оптимальные веса прогнозной формулы
 * через grid search по историческим матчам.
 *
 * Алгоритм:
 *   1. Берём N finished матчей лиги (последние 200)
 *   2. Для каждого матча загружаем историю команд (20 матчей)
 *   3. Прогоняем анализаторы ОДИН раз (кэшируем результаты)
 *   4. Grid search по пресетам весов — находим лучший
 *   5. Сохраняем в league_calibration
 *
 * Пресеты (12 комбинаций) вместо полного grid search (10000+ комбинаций):
 *   Каждый пресет — это набор весов для 5 факторов + threshold
 */

const logger = require('../monitoring/logger');

// Модули анализаторов
const aMarkovOut  = require('./analyzers/markov-outcome.js');
const aMarkovSt   = require('./analyzers/markov-state.js');
const aShannon    = require('./analyzers/shannon-entropy.js');
const aInertia    = require('./analyzers/form-inertia.js');
const aMultipeak  = require('./analyzers/multipeak-density.js');

// Пресеты весов для grid search
const PRESETS = [
    // Default (current)
    { name: 'default', strength: 0.40, momentum: 0.20, hmm: 0.15, inertia: 0.10, draw: 0.10, threshold: 0.30, min_conf: 0.40 },
    // High strength
    { name: 'strength_heavy', strength: 0.50, momentum: 0.15, hmm: 0.15, inertia: 0.05, draw: 0.10, threshold: 0.25, min_conf: 0.40 },
    // High momentum
    { name: 'momentum_heavy', strength: 0.30, momentum: 0.30, hmm: 0.15, inertia: 0.10, draw: 0.10, threshold: 0.30, min_conf: 0.40 },
    // High HMM
    { name: 'hmm_heavy', strength: 0.30, momentum: 0.15, hmm: 0.30, inertia: 0.10, draw: 0.10, threshold: 0.30, min_conf: 0.40 },
    // High draw signal
    { name: 'draw_heavy', strength: 0.30, momentum: 0.15, hmm: 0.10, inertia: 0.05, draw: 0.25, threshold: 0.35, min_conf: 0.40 },
    // Low threshold (more decisive)
    { name: 'decisive', strength: 0.45, momentum: 0.25, hmm: 0.15, inertia: 0.10, draw: 0.05, threshold: 0.20, min_conf: 0.35 },
    // High threshold (conservative)
    { name: 'conservative', strength: 0.35, momentum: 0.15, hmm: 0.10, inertia: 0.10, draw: 0.15, threshold: 0.45, min_conf: 0.50 },
    // Balanced
    { name: 'balanced', strength: 0.30, momentum: 0.20, hmm: 0.20, inertia: 0.15, draw: 0.15, threshold: 0.30, min_conf: 0.40 },
    // Inertia heavy
    { name: 'inertia_heavy', strength: 0.30, momentum: 0.15, hmm: 0.10, inertia: 0.25, draw: 0.10, threshold: 0.30, min_conf: 0.40 },
    // Aggressive (low min_conf)
    { name: 'aggressive', strength: 0.40, momentum: 0.20, hmm: 0.15, inertia: 0.10, draw: 0.10, threshold: 0.25, min_conf: 0.30 },
    // Ultra conservative (high min_conf)
    { name: 'ultra_conservative', strength: 0.40, momentum: 0.20, hmm: 0.15, inertia: 0.10, draw: 0.10, threshold: 0.30, min_conf: 0.60 },
    // Draw specialist
    { name: 'draw_specialist', strength: 0.25, momentum: 0.10, hmm: 0.10, inertia: 0.05, draw: 0.30, threshold: 0.40, min_conf: 0.45 },
];

const N_WINDOW = 20;
const MAX_MATCHES_PER_LEAGUE = 200;
const MIN_MATCHES_FOR_CALIBRATION = 50;

/**
 * Прогноз по пресету (stateless, без Python HMM для скорости)
 */
function predictWithPreset(homeGames, awayGames, preset, homeAnalyzers, awayAnalyzers) {
    let homeScore = 0, drawScore = 0, awayScore = 0;

    // Factor 1: Team strength
    const homeGD = homeGames.length > 0 ? homeGames.reduce((s, g) => s + (g.gd || 0), 0) / homeGames.length : 0;
    const awayGD = awayGames.length > 0 ? awayGames.reduce((s, g) => s + (g.gd || 0), 0) / awayGames.length : 0;
    const homeXGD = homeGames.length > 0 ? homeGames.reduce((s, g) => s + (g.xg_diff != null ? g.xg_diff : 0), 0) / homeGames.length : 0;
    const awayXGD = awayGames.length > 0 ? awayGames.reduce((s, g) => s + (g.xg_diff != null ? g.xg_diff : 0), 0) / awayGames.length : 0;
    const homeStrength = homeGD * 0.4 + homeXGD * 0.6;
    const awayStrength = awayGD * 0.4 + awayXGD * 0.6;
    const strengthDiff = homeStrength - awayStrength;

    if (strengthDiff > preset.threshold) {
        homeScore += preset.strength * Math.min(1, strengthDiff / 2);
    } else if (strengthDiff < -preset.threshold) {
        awayScore += preset.strength * Math.min(1, Math.abs(strengthDiff) / 2);
    } else {
        const closeness = 1 - Math.abs(strengthDiff) / preset.threshold;
        homeScore += preset.strength * 0.08;
        drawScore += preset.strength * (0.15 + closeness * 0.15);
        awayScore += preset.strength * 0.05;
    }

    // Factor 2: Momentum
    const homeStreak = homeAnalyzers.markov_outcome?.details?.streak || {};
    const awayStreak = awayAnalyzers.markov_outcome?.details?.streak || {};
    if (homeStreak.current_outcome === 'W' && homeStreak.current_length >= 3) homeScore += preset.momentum * 0.5;
    else if (homeStreak.current_outcome === 'L' && homeStreak.current_length >= 3) awayScore += preset.momentum * 0.5;
    if (awayStreak.current_outcome === 'W' && awayStreak.current_length >= 3) awayScore += preset.momentum * 0.7;
    else if (awayStreak.current_outcome === 'L' && awayStreak.current_length >= 3) homeScore += preset.momentum * 0.5;

    // Factor 3: HMM (skipped in calibration for speed — no Python calls)
    // HMM weight redistributed to strength
    // homeScore += preset.hmm * 0; // no-op

    // Factor 4: Form inertia direction
    const homeFI = homeAnalyzers.form_inertia;
    const awayFI = awayAnalyzers.form_inertia;
    if (homeFI?.details && awayFI?.details) {
        const hLag1 = homeFI.details.lag1_corr || 0;
        const aLag1 = awayFI.details.lag1_corr || 0;
        const hMean = homeFI.details.mean_value || 0;
        const aMean = awayFI.details.mean_value || 0;
        if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean > 0.3) homeScore += preset.inertia * Math.min(hLag1, 1);
        else if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean < -0.3) awayScore += preset.inertia * Math.min(hLag1, 1);
        if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean > 0.3) awayScore += preset.inertia * Math.min(aLag1, 1);
        else if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean < -0.3) homeScore += preset.inertia * Math.min(aLag1, 1);
    }

    // Factor 5: DRAW signals
    const avgEntropy = ((homeAnalyzers.shannon_entropy?.value || 0) + (awayAnalyzers.shannon_entropy?.value || 0)) / 2;
    const maxMP = Math.max(homeAnalyzers.multipeak?.value || 0, awayAnalyzers.multipeak?.value || 0);
    if (avgEntropy < 0.35) drawScore += preset.draw * (0.5 - avgEntropy);
    if (maxMP > 0.3) drawScore += preset.draw * maxMP * 0.3;
    if (Math.abs(strengthDiff) < preset.threshold * 0.5) {
        drawScore += preset.draw * 0.5 * (1 - Math.abs(strengthDiff) / (preset.threshold * 0.5));
    }
    const homeAvgG = homeGames.length > 0 ? homeGames.reduce((s, g) => s + ((g.gf || 0) + (g.ga || 0)), 0) / homeGames.length : 3;
    const awayAvgG = awayGames.length > 0 ? awayGames.reduce((s, g) => s + ((g.gf || 0) + (g.ga || 0)), 0) / awayGames.length : 3;
    if (homeAvgG < 2.5 && awayAvgG < 2.5) drawScore += preset.draw * 0.3;
    if (homeStreak.current_outcome === awayStreak.current_outcome && homeStreak.current_outcome && (homeStreak.current_length || 0) >= 2) {
        drawScore += preset.draw * 0.15;
    }

    // Determine outcome
    const totalScore = homeScore + drawScore + awayScore;
    if (totalScore <= 0) return { predicted: 'DRAW', confidence: 0.33 };

    const normH = homeScore / totalScore;
    const normD = drawScore / totalScore;
    const normA = awayScore / totalScore;

    let predicted, confidence;
    if (normH >= normD && normH >= normA) { predicted = 'HOME'; confidence = normH; }
    else if (normA >= normD) { predicted = 'AWAY'; confidence = normA; }
    else { predicted = 'DRAW'; confidence = normD; }

    return { predicted, confidence };
}

/**
 * Калибровка одной лиги
 */
async function calibrateLeague(db, leagueSstatsId) {
    const t0 = Date.now();

    // 1. Загружаем finished матчи лиги
    const gamesRes = await db.query(`
        SELECT g.id, g.sstats_id, g.date,
               g.home_team_id, g.away_team_id,
               g.home_score, g.away_score,
               ht.name AS home_name, at.name AS away_name,
               l.name AS league_name, l.country_name
        FROM games g
        JOIN teams ht ON ht.id = g.home_team_id
        JOIN teams at ON at.id = g.away_team_id
        JOIN leagues l ON l.id = g.league_id
        WHERE l.sstats_id = $1
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
          AND g.is_deleted = false
          AND g.date >= NOW() - INTERVAL '2 years'
        ORDER BY g.date DESC
        LIMIT $2
    `, [leagueSstatsId, MAX_MATCHES_PER_LEAGUE]);

    const games = gamesRes.rows;
    if (games.length < MIN_MATCHES_FOR_CALIBRATION) {
        return { skipped: true, reason: 'insufficient_matches', matches: games.length };
    }

    const leagueName = games[0].league_name;
    const countryName = games[0].country_name;

    // 2. Для каждого матча загружаем историю и прогоняем анализаторы ОДИН раз
    const gameData = [];
    for (const game of games) {
        // Загружаем историю home команды
        const homeHistRes = await db.query(`
            SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                   gs.expected_goals_home, gs.expected_goals_away, g.date
            FROM games g
            LEFT JOIN game_statistics gs ON gs.game_id = g.id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_deleted = false AND g.status = 'finished'
              AND g.date < $3
            ORDER BY g.date DESC LIMIT $2
        `, [game.home_team_id, N_WINDOW, game.date]);

        const awayHistRes = await db.query(`
            SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                   gs.expected_goals_home, gs.expected_goals_away, g.date
            FROM games g
            LEFT JOIN game_statistics gs ON gs.game_id = g.id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_deleted = false AND g.status = 'finished'
              AND g.date < $3
            ORDER BY g.date DESC LIMIT $2
        `, [game.away_team_id, N_WINDOW, game.date]);

        const homeGames = homeHistRes.rows.map(r => {
            const isHome = r.home_team_id === game.home_team_id;
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
            };
        });

        const awayGames = awayHistRes.rows.map(r => {
            const isHome = r.home_team_id === game.away_team_id;
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
            };
        });

        if (homeGames.length < 6 || awayGames.length < 6) continue;

        // Прогоняем анализаторы ОДИН раз (кэшируем)
        const homeAnalyzers = {
            markov_outcome:  aMarkovOut.analyze(homeGames),
            markov_state:    aMarkovSt.analyze(homeGames),
            shannon_entropy: aShannon.analyze(homeGames),
            form_inertia:    aInertia.analyze(homeGames),
            multipeak:       aMultipeak.analyze(homeGames),
        };
        const awayAnalyzers = {
            markov_outcome:  aMarkovOut.analyze(awayGames),
            markov_state:    aMarkovSt.analyze(awayGames),
            shannon_entropy: aShannon.analyze(awayGames),
            form_inertia:    aInertia.analyze(awayGames),
            multipeak:       aMultipeak.analyze(awayGames),
        };

        // Фактический исход
        let actual;
        if (game.home_score > game.away_score) actual = 'HOME';
        else if (game.home_score < game.away_score) actual = 'AWAY';
        else actual = 'DRAW';

        gameData.push({ homeGames, awayGames, homeAnalyzers, awayAnalyzers, actual });
    }

    if (gameData.length < MIN_MATCHES_FOR_CALIBRATION) {
        return { skipped: true, reason: 'insufficient_history', matches: gameData.length };
    }

    // 3. Grid search по пресетам
    let bestPreset = null;
    let bestAccuracy = 0;
    let bestFilteredAccuracy = 0;
    let bestCoverage = 0;
    let bestMinConf = 0.40;

    for (const preset of PRESETS) {
        let hits = 0, total = 0;
        let filteredHits = 0, filteredTotal = 0;

        for (const gd of gameData) {
            const pred = predictWithPreset(gd.homeGames, gd.awayGames, preset, gd.homeAnalyzers, gd.awayAnalyzers);
            total++;
            if (pred.predicted === gd.actual) hits++;

            // Filtered: only count if confidence >= min_conf
            if (pred.confidence >= preset.min_conf) {
                filteredTotal++;
                if (pred.predicted === gd.actual) filteredHits++;
            }
        }

        const accuracy = total > 0 ? (hits / total * 100) : 0;
        const filteredAccuracy = filteredTotal > 0 ? (filteredHits / filteredTotal * 100) : 0;
        const coverage = total > 0 ? (filteredTotal / total * 100) : 0;

        // Score: prioritize filtered accuracy, but penalize low coverage
        // Target: 70% filtered accuracy with >=30% coverage
        const score = filteredAccuracy * Math.min(1, coverage / 30);

        if (score > (bestPreset ? bestPreset.score : -1)) {
            bestPreset = { ...preset, score, accuracy, filteredAccuracy, coverage };
            bestAccuracy = accuracy;
            bestFilteredAccuracy = filteredAccuracy;
            bestCoverage = coverage;
            bestMinConf = preset.min_conf;
        }
    }

    // 4. Сохраняем в БД
    const weightsJson = {
        strength: bestPreset.strength,
        momentum: bestPreset.momentum,
        hmm: bestPreset.hmm,
        inertia: bestPreset.inertia,
        draw: bestPreset.draw,
        threshold: bestPreset.threshold,
        preset_name: bestPreset.name,
    };

    await db.query(`
        INSERT INTO league_calibration (league_id, league_name, country_name, weights, accuracy, accuracy_filtered, coverage, min_confidence, matches_calibrated, calibration_runs, last_calibrated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW())
        ON CONFLICT (league_id) DO UPDATE SET
            league_name = EXCLUDED.league_name,
            country_name = EXCLUDED.country_name,
            weights = EXCLUDED.weights,
            accuracy = EXCLUDED.accuracy,
            accuracy_filtered = EXCLUDED.accuracy_filtered,
            coverage = EXCLUDED.coverage,
            min_confidence = EXCLUDED.min_confidence,
            matches_calibrated = EXCLUDED.matches_calibrated,
            calibration_runs = league_calibration.calibration_runs + 1,
            last_calibrated_at = NOW()
    `, [
        leagueSstatsId, leagueName, countryName,
        JSON.stringify(weightsJson),
        Math.round(bestAccuracy * 100) / 100,
        Math.round(bestFilteredAccuracy * 100) / 100,
        Math.round(bestCoverage * 100) / 100,
        bestMinConf,
        gameData.length,
    ]);

    const duration = Date.now() - t0;
    return {
        league_id: leagueSstatsId,
        league_name: leagueName,
        matches: gameData.length,
        best_preset: bestPreset.name,
        accuracy: Math.round(bestAccuracy * 100) / 100,
        accuracy_filtered: Math.round(bestFilteredAccuracy * 100) / 100,
        coverage: Math.round(bestCoverage * 100) / 100,
        min_conf: bestMinConf,
        duration_ms: duration,
    };
}

/**
 * Калибровка всех лиг с достаточной историей
 */
async function calibrateAllLeagues(db, limit = 0) {
    const t0 = Date.now();

    // Получаем список лиг для калибровки
    const leaguesRes = await db.query(`
        SELECT l.sstats_id, l.name, l.country_name, count(*) AS games
        FROM leagues l
        JOIN games g ON g.league_id = l.id
        WHERE g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.is_deleted = false
          AND g.date >= NOW() - INTERVAL '2 years'
        GROUP BY l.sstats_id, l.name, l.country_name
        HAVING count(*) >= $1
        ORDER BY games DESC
        ${limit > 0 ? 'LIMIT $2' : ''}
    `, limit > 0 ? [MIN_MATCHES_FOR_CALIBRATION, limit] : [MIN_MATCHES_FOR_CALIBRATION]);

    const leagues = leaguesRes.rows;
    logger.info({
        job: 'league_calibration',
        leagues_count: leagues.length,
    }, 'Starting league calibration');

    let calibrated = 0, skipped = 0, errors = 0;
    const results = [];

    for (let i = 0; i < leagues.length; i++) {
        const league = leagues[i];
        try {
            const result = await calibrateLeague(db, league.sstats_id);
            if (result.skipped) {
                skipped++;
            } else {
                calibrated++;
                results.push(result);
                if (calibrated % 10 === 0) {
                    logger.info({
                        job: 'league_calibration',
                        progress: `${i + 1}/${leagues.length}`,
                        calibrated,
                        skipped,
                        errors,
                    }, 'Calibration progress');
                }
            }
        } catch (err) {
            errors++;
            logger.warn({
                job: 'league_calibration',
                league_id: league.sstats_id,
                err: err.message,
            }, 'League calibration failed');
        }
    }

    const duration = Date.now() - t0;
    const stats = {
        leagues_total: leagues.length,
        calibrated,
        skipped,
        errors,
        duration_ms: duration,
        avg_accuracy_filtered: results.length > 0
            ? Math.round(results.reduce((s, r) => s + r.accuracy_filtered, 0) / results.length * 100) / 100
            : null,
        best_accuracy_filtered: results.length > 0
            ? Math.max(...results.map(r => r.accuracy_filtered))
            : null,
    };
    logger.info({ job: 'league_calibration', ...stats }, 'Calibration complete');
    return stats;
}

module.exports = { calibrateLeague, calibrateAllLeagues, PRESETS };
