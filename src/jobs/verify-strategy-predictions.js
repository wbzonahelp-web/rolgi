'use strict';

/**
 * Job: verify_strategy_predictions
 *
 * Для всех записей в strategy_predictions с пустым actual_outcome,
 * где матч уже finished — заполняем actual_outcome, is_hit, verified_at.
 * Обновляет агрегаты в user_strategies (predictions_count, hits_count, accuracy).
 */

const logger = require('../monitoring/logger');

const BATCH_CONCUR = 16;

async function verifyStrategyPredictions(db) {
    const t0 = Date.now();

    const pendingRes = await db.query(`
        SELECT sp.id, sp.strategy_id, sp.predicted_outcome,
               g.home_score, g.away_score, g.status
        FROM strategy_predictions sp
        JOIN games g ON g.id = sp.game_id
        WHERE sp.actual_outcome IS NULL
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
        ORDER BY sp.id ASC
    `);

    const pending = pendingRes.rows;
    logger.info({
        job: 'verify_strategy_predictions',
        pending: pending.length,
    }, 'Pending strategy predictions loaded');

    let verified = 0;
    let hits = 0;
    let misses = 0;
    let errors = 0;
    const strategyIds = new Set();

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

                const isHit = row.predicted_outcome === actual;

                await db.query(`
                    UPDATE strategy_predictions
                    SET actual_outcome = $2, is_hit = $3, verified_at = now()
                    WHERE id = $1
                `, [row.id, actual, isHit]);

                strategyIds.add(row.strategy_id);
                if (isHit) hits++;
                else misses++;
                verified++;
            } catch (err) {
                errors++;
                logger.warn({
                    job: 'verify_strategy_predictions',
                    prediction_id: row.id,
                    err: err.message,
                }, 'Verification failed');
            }
        }));
    }

    // Обновляем агрегаты в user_strategies
    for (const sid of strategyIds) {
        try {
            await db.query(`
                UPDATE user_strategies
                SET predictions_count = sub.total,
                    hits_count = sub.hits,
                    accuracy = CASE WHEN sub.total > 0
                                THEN sub.hits::numeric / sub.total
                                ELSE NULL END
                FROM (
                    SELECT
                        count(*) AS total,
                        count(*) FILTER (WHERE is_hit = true) AS hits
                    FROM strategy_predictions
                    WHERE strategy_id = $1 AND actual_outcome IS NOT NULL
                ) sub
                WHERE id = $1
            `, [sid]);
        } catch (err) {
            logger.warn({
                job: 'verify_strategy_predictions',
                strategy_id: sid,
                err: err.message,
            }, 'Aggregation update failed');
        }
    }

    const duration = Date.now() - t0;
    return {
        pending: pending.length,
        verified,
        hits,
        misses,
        strategies_updated: strategyIds.size,
        accuracy: (hits + misses) > 0 ? (hits / (hits + misses) * 100).toFixed(1) + '%' : 'N/A',
        errors,
        duration_ms: duration,
    };
}

module.exports = { verifyStrategyPredictions };
