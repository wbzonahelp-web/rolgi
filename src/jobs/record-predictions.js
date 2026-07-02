'use strict';

/**
 * Job: record_predictions
 *
 * Этап 12: для всех scheduled матчей в окне [now, now+48h], у которых
 * ещё нет записи в predictions_log с дефолтной конфигурацией,
 * вычисляет integrated forecast и сохраняет snapshot до начала матча.
 *
 * Защита от гонок: сначала INSERT ... ON CONFLICT DO NOTHING RETURNING id
 * (бронирование слота), и только если запись новая — считаем прогноз
 * и делаем UPDATE с заполнением полей.
 *
 * Параметры по умолчанию (фиксированы и одинаковы для всех):
 *   n_window      = 20
 *   league_filter = true
 *   venue_filter  = true
 */

const logger = require('../monitoring/logger');
const { computePrediction } = require('../analytics/compute-prediction.js');
const aMarkovOutcome = require('../analytics/analyzers/markov-outcome.js');
const aMarkovState   = require('../analytics/analyzers/markov-state.js');
const aShannonEntropy = require('../analytics/analyzers/shannon-entropy.js');
const aFormInertia   = require('../analytics/analyzers/form-inertia.js');
const aMultipeak     = require('../analytics/analyzers/multipeak-density.js');
const aPoisson       = require('../analytics/analyzers/poisson.js');
const aValenzetti    = require('../analytics/analyzers/valenzetti.js');
const pythonClient   = require('../analytics/python-client.js');
const { getLeagueParams } = require('../analytics/utils/league-params');

const N_WINDOW        = 20;
const LEAGUE_FILTER   = true;
const VENUE_FILTER    = true;
const WINDOW_HOURS    = 48;          // горизонт планирования
const BATCH_CONCUR    = 8;           // параллельные расчёты внутри батча
const STMT_TIMEOUT_MS = 5000;

/**
 * Маппинг predicted_outcome 'HOME'/'AWAY'/'DRAW' → markov формат W/D/L
 * (берётся из internal_scores: не нужен, оставлено для документации)
 */

/**
 * Главная функция job'а.
 * @param {Object} db — pg pool из getDatabase()
 * @returns {Promise<object>} статистика прогона
 */
async function recordPredictions(db) {
    const t0 = Date.now();

    // 1) Список матчей-кандидатов: scheduled в окне 48h, обе команды/лига заданы
    const candidatesRes = await db.query(`
        SELECT g.id, g.sstats_id, g.league_id, g.date,
               g.home_team_id, g.away_team_id
        FROM games g
        WHERE g.status = 'scheduled'
          AND g.is_deleted = false
          AND g.date >= now()
          AND g.date <= now() + ($1 || ' hours')::INTERVAL
          AND g.home_team_id IS NOT NULL
          AND g.away_team_id IS NOT NULL
        ORDER BY g.date ASC
    `, [String(WINDOW_HOURS)]);

    const candidates = candidatesRes.rows;
    logger.info({
        job: 'record_predictions',
        window_hours: WINDOW_HOURS,
        candidates: candidates.length,
    }, 'Candidates loaded');

    let reserved = 0;       // успешно забронировано слотов в predictions_log
    let alreadyExists = 0;  // уже есть запись (skip)
    let predicted = 0;      // успешно посчитано и записано
    let errors = 0;
    let noForecast = 0;     // вернулся прогноз без integrated_forecast (мало истории)

    // 2) Обработка батчами
    for (let i = 0; i < candidates.length; i += BATCH_CONCUR) {
        const batch = candidates.slice(i, i + BATCH_CONCUR);

        await Promise.all(batch.map(async (game) => {
            try {
                // Шаг 2a: бронирование слота с минимально-валидными полями.
                // predicted_outcome / confidence — обязательны (NOT NULL),
                // используем placeholders, потом UPDATE перепишет.
                const insRes = await db.query(`
                    INSERT INTO predictions_log
                        (game_id, game_sstats_id, league_id, game_date,
                         n_window, league_filter, venue_filter,
                         predicted_outcome, confidence)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 0)
                    ON CONFLICT (game_id, n_window, league_filter, venue_filter)
                    DO NOTHING
                    RETURNING id
                `, [
                    game.id, game.sstats_id, game.league_id, game.date,
                    N_WINDOW, LEAGUE_FILTER, VENUE_FILTER,
                ]);

                if (!insRes.rows.length) {
                    alreadyExists++;
                    return;
                }
                const predictionId = insRes.rows[0].id;
                reserved++;

                // Шаг 2b: считаем прогноз
                const result = await computePrediction({
                    db,
                    gameId: game.id,                 // используем internal id — самый надёжный
                    n: N_WINDOW,
                    leagueFilterFlag: LEAGUE_FILTER,
                    venueFilter: VENUE_FILTER,
                });

                if (result.error) {
                    // Не удалили запись — оставим её как маркер «попробовали, не вышло»
                    // и обновим только predicted_outcome на FAILED
                    await db.query(`
                        UPDATE predictions_log
                        SET predicted_outcome = 'FAILED',
                            confidence = 0,
                            analyzer_snapshot = $2
                        WHERE id = $1
                    `, [predictionId, JSON.stringify({ error: result.error, code: result.code })]);
                    errors++;
                    return;
                }

                const d = result.data;
                const f = d.integrated_forecast;
                const ha = d.home_analyzers;
                const aa = d.away_analyzers;

                // Проверка: есть ли вообще прогноз (markov может вернуть пусто если N<6)
                const hasForecast = ha.markov_outcome.details && ha.markov_outcome.details.next_outcome
                                 && aa.markov_outcome.details && aa.markov_outcome.details.next_outcome;
                if (!hasForecast) {
                    await db.query(`
                        UPDATE predictions_log
                        SET predicted_outcome = 'NO_DATA',
                            confidence = 0,
                            odds_snapshot = $2
                        WHERE id = $1
                    `, [predictionId, JSON.stringify(d.game.odds)]);
                    noForecast++;
                    return;
                }

                // Edges и recommendations для betting
                const edges = {
                    home: d.betting.home ? d.betting.home.details.edge_per_bet : null,
                    draw: d.betting.draw ? d.betting.draw.details.edge_per_bet : null,
                    away: d.betting.away ? d.betting.away.details.edge_per_bet : null,
                };
                const recs = {
                    home: d.betting.home ? d.betting.home.details.recommendation : null,
                    draw: d.betting.draw ? d.betting.draw.details.recommendation : null,
                    away: d.betting.away ? d.betting.away.details.recommendation : null,
                };

                // Snapshot — урезанный: только value/confidence каждого анализатора,
                // чтобы JSONB не разрастался. Полные details доступны на момент verify
                // через пересчёт, если понадобится.
                const snapshot = {
                    home: {
                        markov_outcome:  { value: ha.markov_outcome.value,  confidence: ha.markov_outcome.confidence,
                                           next: ha.markov_outcome.details && ha.markov_outcome.details.next_outcome },
                        markov_state:    { value: ha.markov_state.value,    confidence: ha.markov_state.confidence },
                        shannon_entropy: { value: ha.shannon_entropy.value, confidence: ha.shannon_entropy.confidence },
                        form_inertia:    { value: ha.form_inertia.value,    confidence: ha.form_inertia.confidence,
                                           trend: ha.form_inertia.details && ha.form_inertia.details.trend },
                        multipeak:       { value: ha.multipeak.value,       confidence: ha.multipeak.confidence,
                                           interpretation: ha.multipeak.details && ha.multipeak.details.interpretation },
                    },
                    away: {
                        markov_outcome:  { value: aa.markov_outcome.value,  confidence: aa.markov_outcome.confidence,
                                           next: aa.markov_outcome.details && aa.markov_outcome.details.next_outcome },
                        markov_state:    { value: aa.markov_state.value,    confidence: aa.markov_state.confidence },
                        shannon_entropy: { value: aa.shannon_entropy.value, confidence: aa.shannon_entropy.confidence },
                        form_inertia:    { value: aa.form_inertia.value,    confidence: aa.form_inertia.confidence,
                                           trend: aa.form_inertia.details && aa.form_inertia.details.trend },
                        multipeak:       { value: aa.multipeak.value,       confidence: aa.multipeak.confidence,
                                           interpretation: aa.multipeak.details && aa.multipeak.details.interpretation },
                    },
                    integrated: {
                        outcome: f.predicted_outcome,
                        confidence: f.confidence,
                        scores: f._scores,
                        reasons: f.reasons,
                    },
                    history_sizes: d.history_sizes,
                };

                const homeNext = ha.markov_outcome.details.next_outcome;
                const awayNext = aa.markov_outcome.details.next_outcome;

                await db.query(`
                    UPDATE predictions_log
                    SET predicted_outcome  = $2,
                        confidence         = $3,
                        home_score_pred    = $4,
                        draw_score_pred    = $5,
                        away_score_pred    = $6,
                        home_markov_pred   = $7,
                        home_markov_prob   = $8,
                        away_markov_pred   = $9,
                        away_markov_prob   = $10,
                        betting_edges      = $11,
                        betting_recs       = $12,
                        odds_snapshot      = $13,
                        analyzer_snapshot  = $14
                    WHERE id = $1
                `, [
                    predictionId,
                    f.predicted_outcome,
                    f.confidence,
                    f._scores.home, f._scores.draw, f._scores.away,
                    homeNext.prediction, homeNext.probability,
                    awayNext.prediction, awayNext.probability,
                    JSON.stringify(edges),
                    JSON.stringify(recs),
                    JSON.stringify(d.game.odds),
                    JSON.stringify(snapshot),
                ]);

                predicted++;

                // ── Шаг 2c: индивидуальные прогнозы анализаторов в model_predictions ──
                await saveModelPredictionsForGame(db, game, d);
            } catch (err) {
                errors++;
                logger.warn({
                    job: 'record_predictions',
                    game_id: game.id,
                    game_sstats_id: game.sstats_id,
                    err: err.message,
                }, 'Game prediction failed');
            }
        }));

        // Прогресс каждый N-й батч
        if ((i / BATCH_CONCUR) % 5 === 0) {
            logger.info({
                job: 'record_predictions',
                progress: `${Math.min(i + BATCH_CONCUR, candidates.length)}/${candidates.length}`,
                reserved, predicted, already_exists: alreadyExists,
                no_forecast: noForecast, errors,
            }, 'Progress');
        }
    }

    const duration = Date.now() - t0;
    return {
        candidates: candidates.length,
        reserved,
        predicted,
        already_exists: alreadyExists,
        no_forecast: noForecast,
        errors,
        duration_ms: duration,
    };
}

/**
 * Загружает историю команды для индивидуальных анализаторов.
 * @param {object} db — pg pool
 * @param {number} teamId — internal team id
 * @param {number} n — количество матчей
 * @param {Date} beforeDate —截止 дата (до даты матча)
 * @param {number|null} leagueInternal — league_id для фильтра
 * @returns {Promise<Array>} — массив матчей {outcome, gf, ga, ...}
 */
async function loadTeamHistory(db, teamId, n, beforeDate, leagueInternal) {
    const sql = `
        SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
               gs.expected_goals_home, gs.expected_goals_away
        FROM games g
        LEFT JOIN game_statistics gs ON gs.game_id = g.id
        WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
          AND g.is_deleted = false AND g.status = 'finished'
          AND g.date < $3
          ${leagueInternal ? 'AND g.league_id = $4' : ''}
        ORDER BY g.date DESC LIMIT $2`;
    const params = leagueInternal
        ? [teamId, n, beforeDate, leagueInternal]
        : [teamId, n, beforeDate];
    const { rows } = await db.query(sql, params);
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
        return { outcome, gf, ga, date: r.date };
    });
}

/**
 * Сохраняет индивидуальные прогнозы анализаторов в model_predictions.
 * Вызывается после успешной записи integrated прогноза.
 *
 * @param {object} db — pg pool
 * @param {object} game — строка кандидата {id, home_team_id, away_team_id, league_id, date}
 * @param {object} predictionData — result.data из computePrediction
 */
async function saveModelPredictionsForGame(db, game, predictionData) {
    const gameId = game.id; // internal game id
    const n = 20;
    const leagueInternal = game.league_id || null;

    // Загружаем историю для home и away
    const [homeHistory, awayHistory] = await Promise.all([
        loadTeamHistory(db, game.home_team_id, n, game.date, leagueInternal),
        loadTeamHistory(db, game.away_team_id, n, game.date, leagueInternal),
    ]);

    // Получаем leagueParams для Poisson/Valenzetti
    let leagueParams = null;
    try {
        if (game.league_id) {
            const leagueRes = await db.query(
                `SELECT sstats_id FROM leagues WHERE id = $1 LIMIT 1`, [game.league_id]
            );
            if (leagueRes.rows.length) {
                leagueParams = getLeagueParams(leagueRes.rows[0].sstats_id);
            }
        }
    } catch (_) {
        leagueParams = null;
    }

    // ─── Определяем список анализаторов и их вызовы ───
    const modelRuns = [];

    // 1. markov_outcome — per-team, комбинируем next_outcome в HOME/DRAW/AWAY
    modelRuns.push(() => {
        const home = aMarkovOutcome.analyze(homeHistory);
        const away = aMarkovOutcome.analyze(awayHistory);
        const hNext = home.details && home.details.next_outcome;
        const aNext = away.details && away.details.next_outcome;
        let predictedOutcome = 'DRAW';
        let confidence = 0;
        let homeScore = 0, drawScore = 0, awayScore = 0;
        if (hNext && hNext.prediction) {
            if (hNext.prediction === 'W') { homeScore += hNext.probability; }
            else if (hNext.prediction === 'D') { drawScore += hNext.probability * 0.5; }
            else { awayScore += hNext.probability; }
        }
        if (aNext && aNext.prediction) {
            if (aNext.prediction === 'W') { awayScore += aNext.probability; }
            else if (aNext.prediction === 'D') { drawScore += aNext.probability * 0.5; }
            else { homeScore += aNext.probability; }
        }
        if (homeScore >= drawScore && homeScore >= awayScore) { predictedOutcome = 'HOME'; confidence = homeScore; }
        else if (awayScore >= drawScore && awayScore >= homeScore) { predictedOutcome = 'AWAY'; confidence = awayScore; }
        else { predictedOutcome = 'DRAW'; confidence = drawScore; }
        confidence = Math.max(0, Math.min(1, confidence));
        return {
            modelName: 'markov_outcome',
            predictedOutcome,
            confidence: Math.round(confidence * 10000) / 10000,
            details: { home, away },
        };
    });

    // 2. markov_state — per-team, метрика
    modelRuns.push(() => {
        const home = aMarkovState.analyze(homeHistory);
        const away = aMarkovState.analyze(awayHistory);
        return {
            modelName: 'markov_state',
            predictedOutcome: 'PENDING',
            confidence: Math.max(home.confidence, away.confidence),
            details: { home, away },
        };
    });

    // 3. shannon_entropy — per-team, метрика
    modelRuns.push(() => {
        const home = aShannonEntropy.analyze(homeHistory);
        const away = aShannonEntropy.analyze(awayHistory);
        return {
            modelName: 'shannon_entropy',
            predictedOutcome: 'PENDING',
            confidence: Math.max(home.confidence, away.confidence),
            details: { home, away },
        };
    });

    // 4. form_inertia — per-team, метрика
    modelRuns.push(() => {
        const home = aFormInertia.analyze(homeHistory);
        const away = aFormInertia.analyze(awayHistory);
        return {
            modelName: 'form_inertia',
            predictedOutcome: 'PENDING',
            confidence: Math.max(home.confidence, away.confidence),
            details: { home, away },
        };
    });

    // 5. multipeak — per-team, метрика
    modelRuns.push(() => {
        const home = aMultipeak.analyze(homeHistory);
        const away = aMultipeak.analyze(awayHistory);
        return {
            modelName: 'multipeak',
            predictedOutcome: 'PENDING',
            confidence: Math.max(home.confidence, away.confidence),
            details: { home, away },
        };
    });

    // 6. poisson — имеет probs
    modelRuns.push(() => {
        const lp = leagueParams || {};
        const result = aPoisson.analyze(homeHistory, awayHistory, {
            avgHomeGoals: lp.avg_home_goals,
            avgAwayGoals: lp.avg_away_goals,
        });
        const probs = result.details && result.details.probabilities;
        const predictedOutcome = result.details && result.details.predicted_outcome
            ? result.details.predicted_outcome : 'DRAW';
        const confidence = result.details && result.details.predicted_confidence
            ? result.details.predicted_confidence : 0;
        return {
            modelName: 'poisson',
            predictedOutcome,
            confidence: Math.round(confidence * 10000) / 10000,
            homeProb: probs ? probs.home : null,
            drawProb: probs ? probs.draw : null,
            awayProb: probs ? probs.away : null,
            details: result,
        };
    });

    // 7. valenzetti — имеет probs
    modelRuns.push(() => {
        const result = aValenzetti.analyze(homeHistory, awayHistory, {});
        const probs = result.details && result.details.probabilities;
        const predictedOutcome = result.details && result.details.predicted_outcome
            ? result.details.predicted_outcome : 'DRAW';
        const confidence = result.details && result.details.predicted_confidence
            ? result.details.predicted_confidence : 0;
        return {
            modelName: 'valenzetti',
            predictedOutcome,
            confidence: Math.round(confidence * 10000) / 10000,
            homeProb: probs ? probs.home : null,
            drawProb: probs ? probs.draw : null,
            awayProb: probs ? probs.away : null,
            details: result,
        };
    });

    // 8. hmm — python client (асинхронный)
    modelRuns.push(async () => {
        let hmmHome = null, hmmAway = null;
        try {
            const [homeRes, awayRes] = await Promise.allSettled([
                pythonClient.getTeamAnalyzer('hmm', game.home_team_id, { nWindow: n }),
                pythonClient.getTeamAnalyzer('hmm', game.away_team_id, { nWindow: n }),
            ]);
            hmmHome = homeRes.status === 'fulfilled' ? homeRes.value : null;
            hmmAway = awayRes.status === 'fulfilled' ? awayRes.value : null;
        } catch (_) {}

        let predictedOutcome = 'PENDING';
        let confidence = 0;
        let homeProb = null, drawProb = null, awayProb = null;

        // Если HMM вернул home/draw/away probs
        if (hmmHome && hmmHome.probabilities) {
            const p = hmmHome.probabilities;
            homeProb = p.home;
            drawProb = p.draw;
            awayProb = p.away;
            if (homeProb >= drawProb && homeProb >= awayProb) { predictedOutcome = 'HOME'; confidence = homeProb; }
            else if (awayProb >= drawProb && awayProb >= homeProb) { predictedOutcome = 'AWAY'; confidence = awayProb; }
            else if (drawProb >= homeProb && drawProb >= awayProb) { predictedOutcome = 'DRAW'; confidence = drawProb; }
        }

        return {
            modelName: 'hmm',
            predictedOutcome,
            confidence: Math.round(confidence * 10000) / 10000,
            homeProb,
            drawProb,
            awayProb,
            details: { home: hmmHome, away: hmmAway },
        };
    });

    // ─── Выполняем и сохраняем ───
    for (const run of modelRuns) {
        let modelResult;
        try {
            modelResult = await run();
        } catch (runErr) {
            logger.warn({
                job: 'model_predictions',
                game_id: gameId,
                model: run.name || 'unknown',
                err: runErr.message,
            }, 'Analyzer run failed, skipping');
            continue;
        }

        try {
            await db.query(`
                INSERT INTO model_predictions
                    (model_name, game_id, predicted_outcome,
                     home_prob, draw_prob, away_prob,
                     confidence, details, prediction_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
                ON CONFLICT (game_id, model_name, prediction_date)
                DO UPDATE SET
                    predicted_outcome = EXCLUDED.predicted_outcome,
                    home_prob = EXCLUDED.home_prob,
                    draw_prob = EXCLUDED.draw_prob,
                    away_prob = EXCLUDED.away_prob,
                    confidence = EXCLUDED.confidence,
                    details = EXCLUDED.details,
                    predicted_at = NOW()
            `, [
                modelResult.modelName,
                gameId,
                modelResult.predictedOutcome,
                modelResult.homeProb != null ? modelResult.homeProb : null,
                modelResult.drawProb != null ? modelResult.drawProb : null,
                modelResult.awayProb != null ? modelResult.awayProb : null,
                modelResult.confidence,
                JSON.stringify(modelResult.details),
            ]);
        } catch (insErr) {
            logger.warn({
                job: 'model_predictions',
                game_id: gameId,
                model: modelResult.modelName,
                err: insErr.message,
            }, 'INSERT into model_predictions failed');
        }
    }
}

module.exports = { recordPredictions };
