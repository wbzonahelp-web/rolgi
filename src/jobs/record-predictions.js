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

module.exports = { recordPredictions };
