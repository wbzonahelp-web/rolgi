'use strict';

/**
 * Job: verify_predictions
 *
 * Этап 12: для всех записей в predictions_log с пустым actual_outcome,
 * где соответствующий матч уже finished, заполняем actual_outcome,
 * is_hit и brier_component (многоклассовый Brier по home/draw/away score_pred).
 *
 * Игнорируем записи predicted_outcome IN ('PENDING','FAILED','NO_DATA') —
 * для них нет содержательного прогноза, но мы всё равно ставим actual,
 * чтобы исключить их из pending-выборки и видеть в статистике как
 * "no_forecast" (через NULL is_hit).
 *
 * Brier score формула (multi-class):
 *   p_home, p_draw, p_away = нормализованные scores (сумма = 1)
 *   actual = one-hot {home,draw,away}
 *   brier  = Σ_i (p_i - actual_i)^2     ∈ [0, 2]
 *   0   = идеальный прогноз
 *   2/3 = равновероятный baseline (1/3,1/3,1/3)
 *   2   = максимально неверный (уверенный прогноз на правильный исход)
 */

const logger = require('../monitoring/logger');

const BATCH_CONCUR = 16;

/**
 * Считает многоклассовый Brier component для одной записи.
 * Возвращает null если scores не заполнены (NO_DATA / FAILED).
 */
function computeBrier(homePred, drawPred, awayPred, actualOutcome) {
    if (homePred == null || drawPred == null || awayPred == null) return null;
    const sum = Number(homePred) + Number(drawPred) + Number(awayPred);
    if (!Number.isFinite(sum) || sum <= 0) return null;
    const pH = Number(homePred) / sum;
    const pD = Number(drawPred) / sum;
    const pA = Number(awayPred) / sum;
    const aH = actualOutcome === 'HOME' ? 1 : 0;
    const aD = actualOutcome === 'DRAW' ? 1 : 0;
    const aA = actualOutcome === 'AWAY' ? 1 : 0;
    return (pH - aH) ** 2 + (pD - aD) ** 2 + (pA - aA) ** 2;
}

/**
 * Главная функция.
 */
async function verifyPredictions(db) {
    const t0 = Date.now();

    // Все pending-записи, где матч уже сыгран и счёт известен
    const pendingRes = await db.query(`
        SELECT pl.id, pl.predicted_outcome,
               pl.home_score_pred, pl.draw_score_pred, pl.away_score_pred,
               g.home_score, g.away_score, g.status
        FROM predictions_log pl
        JOIN games g ON g.id = pl.game_id
        WHERE pl.actual_outcome IS NULL
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
        ORDER BY pl.id ASC
    `);

    const pending = pendingRes.rows;
    logger.info({
        job: 'verify_predictions',
        pending: pending.length,
    }, 'Pending predictions loaded');

    let verified = 0;
    let hits = 0;
    let misses = 0;
    let noForecast = 0;  // PENDING/FAILED/NO_DATA — verify, но без is_hit
    let errors = 0;

    for (let i = 0; i < pending.length; i += BATCH_CONCUR) {
        const batch = pending.slice(i, i + BATCH_CONCUR);

        await Promise.all(batch.map(async (row) => {
            try {
                const hs = row.home_score;
                const as = row.away_score;
                let actual;
                if (hs > as) actual = 'HOME';
                else if (hs < as) actual = 'AWAY';
                else actual = 'DRAW';

                const isForecast = ['HOME', 'DRAW', 'AWAY'].includes(row.predicted_outcome);
                const isHit = isForecast ? (row.predicted_outcome === actual) : null;
                const brier = isForecast
                    ? computeBrier(row.home_score_pred, row.draw_score_pred, row.away_score_pred, actual)
                    : null;

                await db.query(`
                    UPDATE predictions_log
                    SET actual_outcome    = $2,
                        actual_home_score = $3,
                        actual_away_score = $4,
                        is_hit            = $5,
                        brier_component   = $6,
                        verified_at       = now()
                    WHERE id = $1
                `, [row.id, actual, hs, as, isHit, brier]);

                if (!isForecast) noForecast++;
                else if (isHit) hits++;
                else misses++;
                verified++;
            } catch (err) {
                errors++;
                logger.warn({
                    job: 'verify_predictions',
                    prediction_id: row.id,
                    err: err.message,
                }, 'Verification failed');
            }
        }));
    }

    const duration = Date.now() - t0;
    return {
        pending: pending.length,
        verified,
        hits,
        misses,
        no_forecast: noForecast,
        accuracy: (hits + misses) > 0 ? hits / (hits + misses) : null,
        errors,
        duration_ms: duration,
    };
}

module.exports = { verifyPredictions };
