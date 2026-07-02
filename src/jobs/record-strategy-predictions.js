'use strict';

/**
 * Job: record_strategy_predictions
 *
 * For all active user strategies, finds upcoming scheduled games
 * and generates predictions into the strategy_predictions table.
 */

const logger = require('../monitoring/logger');
const { computeStrategyPrediction } = require('../services/strategy-prediction-service');

const WINDOW_HOURS = 48;
const BATCH_CONCUR = 4;
const MAX_GAMES_PER_STRATEGY = 100;

async function loadStrategies(db) {
    const res = await db.query(`
        SELECT id, config, name
        FROM user_strategies
        ORDER BY id ASC
    `);
    return res.rows;
}

async function loadUpcomingGames(db) {
    const res = await db.query(`
        SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id, g.date
        FROM games g
        WHERE g.status = 'scheduled'
          AND g.is_deleted = false
          AND g.date >= now()
          AND g.date <= now() + ($1 || ' hours')::INTERVAL
          AND g.home_team_id IS NOT NULL
          AND g.away_team_id IS NOT NULL
        ORDER BY g.date ASC
        LIMIT $2
    `, [String(WINDOW_HOURS), String(MAX_GAMES_PER_STRATEGY)]);
    return res.rows;
}

async function recordStrategyPredictions(db) {
    const t0 = Date.now();

    // 1. Load active strategies
    const strategies = await loadStrategies(db);
    if (strategies.length === 0) {
        logger.info({ job: 'record_strategy_predictions' }, 'No active strategies found');
        return { strategies: 0, predicted: 0, skipped: 0, errors: 0, durationMs: 0 };
    }

    // 2. Load upcoming games once (shared across all strategies)
    const upcomingGames = await loadUpcomingGames(db);
    if (upcomingGames.length === 0) {
        logger.info({ job: 'record_strategy_predictions' }, 'No upcoming games found');
        return { strategies: strategies.length, predicted: 0, skipped: 0, errors: 0, durationMs: 0 };
    }

    logger.info({
        job: 'record_strategy_predictions',
        strategies: strategies.length,
        upcomingGames: upcomingGames.length,
    }, 'Starting strategy prediction run');

    let totalPredicted = 0;
    let totalErrors = 0;
    let totalSkipped = 0;

    // 3. Process each strategy
    for (const strategy of strategies) {
        let config;
        try {
            config = typeof strategy.config === 'string' ? JSON.parse(strategy.config) : strategy.config;
        } catch (e) {
            logger.warn({ job: 'record_strategy_predictions', strategyId: strategy.id, name: strategy.name }, 'Invalid strategy config, skipping');
            totalErrors++;
            continue;
        }

        const strategyPredictions = [];

        // Process games in parallel batches
        for (let i = 0; i < upcomingGames.length; i += BATCH_CONCUR) {
            const batch = upcomingGames.slice(i, i + BATCH_CONCUR);
            const results = await Promise.all(
                batch.map(async (game) => {
                    try {
                        // Compute prediction for this strategy + game
                        const result = await computeStrategyPrediction(db, game.id, config);
                        if (result.error) {
                            return { error: result.error, gameId: game.id };
                        }
                        return result;
                    } catch (err) {
                        return { error: err.message, gameId: game.id };
                    }
                })
            );

            for (const r of results) {
                if (r.error) {
                    totalErrors++;
                    continue;
                }
                strategyPredictions.push(r);
            }
        }

        if (strategyPredictions.length === 0) {
            continue;
        }

        // 4. Insert into strategy_predictions (batch insert with ON CONFLICT)
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const r of strategyPredictions) {
            values.push(`($${paramIndex}, $${paramIndex + 1}, NOW(), $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
            // computeStrategyPrediction returns { game_id, predicted_outcome, confidence, ... }
            params.push(strategy.id, r.game_id, r.predicted_outcome, r.confidence, '{}');
            paramIndex += 5;
        }

        if (values.length > 0) {
            const insertSql = `
                INSERT INTO strategy_predictions
                    (strategy_id, game_id, predicted_at, predicted_outcome, confidence, analyzer_snapshot)
                VALUES ${values.join(', ')}
                ON CONFLICT (strategy_id, game_id)
                DO NOTHING
            `;
            try {
                await db.query(insertSql, params);
                totalPredicted += strategyPredictions.length;
                logger.info({
                    job: 'record_strategy_predictions',
                    strategyId: strategy.id,
                    strategyName: strategy.name,
                    inserted: strategyPredictions.length,
                }, 'Strategy predictions inserted');
            } catch (err) {
                logger.error({
                    job: 'record_strategy_predictions',
                    strategyId: strategy.id,
                    error: err.message,
                }, 'Failed to insert strategy predictions');
                totalErrors += strategyPredictions.length;
            }
        }
    }

    const durationMs = Date.now() - t0;
    const stats = {
        strategies: strategies.length,
        predicted: totalPredicted,
        errors: totalErrors,
        skipped: totalSkipped,
        durationMs,
    };

    logger.info({
        job: 'record_strategy_predictions',
        ...stats,
    }, 'Strategy prediction run completed');
    return stats;
}

module.exports = { recordStrategyPredictions };
