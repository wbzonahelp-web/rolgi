'use strict';

/**
 * Strategies routes. Префикс: /api/strategies
 *
 * CRUD для пользовательских стратегий + прогноз по стратегии + лидерборд.
 * Все endpoints кроме POST /games/:id/custom-strategy требуют авторизации.
 */

const { authenticate, optionalAuthenticate } = require('../../auth/fastify-auth');
const { getLeagueParams } = require('../../analytics/utils/league-params');
const { computePrediction } = require('../../analytics/compute-prediction.js');
const { computeStrategyPrediction, predictFromAnalyzers } = require('../../services/strategy-prediction-service');


async function strategiesRoutes(fastify) {
    const db = fastify.db || require('../../database/db-pool').getDatabase();

    // ─── Вспомогательные функции ───

    function validateConfig(config) {
        if (!config || typeof config !== 'object') return 'config must be an object';
        if (!Array.isArray(config.analyzers) || config.analyzers.length === 0)
            return 'config.analyzers must be a non-empty array';
        const validAnalyzers = [
            'markov_outcome', 'markov_state', 'shannon_entropy',
            'form_inertia', 'multipeak', 'hmm', 'poisson', 'valenzetti'
        ];
        for (const a of config.analyzers) {
            if (!validAnalyzers.includes(a.name))
                return `Unknown analyzer: ${a.name}. Valid: ${validAnalyzers.join(', ')}`;
            if (typeof a.weight !== 'number' || a.weight < 0 || a.weight > 1)
                return `Weight for ${a.name} must be 0..1`;
        }
        return null;
    }


    // ─── CRUD Endpoints (требуют авторизации) ───

    // POST /api/strategies — создать стратегию
    fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const { name, description, config, is_public } = request.body || {};

            if (!name || !config) {
                return reply.code(400).send({ success: false, error: 'name and config are required' });
            }
            const configErr = validateConfig(config);
            if (configErr) {
                return reply.code(400).send({ success: false, error: configErr });
            }

            const result = await db.query(
                `INSERT INTO user_strategies (user_id, name, description, config, is_public)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [userId, name, description || null, JSON.stringify(config), !!is_public]
            );
            return { success: true, data: result.rows[0] };
        } catch (err) {
            request.log.error({ err }, 'POST /strategies failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // GET /api/strategies — мои стратегии
    fastify.get('/', { preHandler: [optionalAuthenticate] }, async (request, reply) => {
        try {
            if (request.user && request.user.userId) {
                // Авторизованный пользователь - его стратегии
                const userId = request.user.userId;
                const result = await db.query(`
                    SELECT us.id, us.name, us.description, us.config, us.is_public,
                           COALESCE(sp_cnt.total, 0) AS predictions_count,
                           us.hits_count, us.accuracy, us.roi,
                           us.created_at, us.updated_at
                    FROM user_strategies us
                    LEFT JOIN LATERAL (
                        SELECT count(*) AS total
                        FROM strategy_predictions
                        WHERE strategy_id = us.id
                    ) sp_cnt ON true
                    WHERE us.user_id = $1
                    ORDER BY us.updated_at DESC
                `, [userId]);
                return { success: true, data: result.rows };
            } else {
                // Неавторизованный - публичные стратегии
                const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
                const result = await db.query(`
                    SELECT s.id, s.name, s.description, s.config, s.is_public,
                           COALESCE(sp_cnt.total, 0) AS predictions_count,
                           s.hits_count, s.accuracy, s.roi,
                           s.created_at, s.updated_at
                    FROM user_strategies s
                    LEFT JOIN LATERAL (
                        SELECT count(*) AS total
                        FROM strategy_predictions
                        WHERE strategy_id = s.id
                    ) sp_cnt ON true
                    WHERE s.is_public = true
                    ORDER BY s.accuracy DESC NULLS LAST
                    LIMIT $1
                `, [limit]);
                return { success: true, data: result.rows };
            }
        } catch (err) {
            request.log.error({ err }, 'GET /strategies failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // GET /api/strategies/leaderboard — публичные стратегии
    fastify.get('/leaderboard', async (request, reply) => {
        try {
            const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
            const result = await db.query(
                `SELECT s.id, s.name, s.description, s.predictions_count,
                        s.hits_count, s.accuracy, s.roi,
                        u.username
                 FROM user_strategies s
                 JOIN users u ON u.user_id = s.user_id
                 WHERE s.is_public = true AND s.predictions_count >= 5
                 ORDER BY s.accuracy DESC NULLS LAST
                 LIMIT $1`, [limit]
            );
            return { success: true, data: result.rows };
        } catch (err) {
            request.log.error({ err }, 'GET /strategies/leaderboard failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // GET /api/strategies/:id — одна стратегия (свою — всегда, чужую — если public)
    fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const strategyId = parseInt(request.params.id, 10);
            const result = await db.query(
                `SELECT * FROM user_strategies
                 WHERE id = $1 AND (user_id = $2 OR is_public = true)`, [strategyId, userId]
            );
            if (!result.rows.length) {
                return reply.code(404).send({ success: false, error: 'Strategy not found' });
            }
            return { success: true, data: result.rows[0] };
        } catch (err) {
            request.log.error({ err }, 'GET /strategies/:id failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // PUT /api/strategies/:id — обновить свою стратегию
    fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const strategyId = parseInt(request.params.id, 10);
            const { name, description, config, is_public } = request.body || {};

            if (config) {
                const configErr = validateConfig(config);
                if (configErr) {
                    return reply.code(400).send({ success: false, error: configErr });
                }
            }

            const result = await db.query(
                `UPDATE user_strategies
                 SET name = COALESCE($3, name),
                     description = COALESCE($4, description),
                     config = COALESCE($5, config),
                     is_public = COALESCE($6, is_public)
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [strategyId, userId, name || null, description || null,
                 config ? JSON.stringify(config) : null,
                 is_public != null ? !!is_public : null]
            );
            if (!result.rows.length) {
                return reply.code(404).send({ success: false, error: 'Strategy not found or not owned by you' });
            }
            return { success: true, data: result.rows[0] };
        } catch (err) {
            request.log.error({ err }, 'PUT /strategies/:id failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // DELETE /api/strategies/:id — удалить свою стратегию
    fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const strategyId = parseInt(request.params.id, 10);
            const result = await db.query(
                `DELETE FROM user_strategies WHERE id = $1 AND user_id = $2 RETURNING id`,
                [strategyId, userId]
            );
            if (!result.rows.length) {
                return reply.code(404).send({ success: false, error: 'Strategy not found or not owned by you' });
            }
            return { success: true, deleted: result.rows[0].id };
        } catch (err) {
            request.log.error({ err }, 'DELETE /strategies/:id failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // ─── Прогноз по стратегии (без авторизации тоже можно, но не сохраняется) ───

    // POST /api/strategies/games/:gameId/predict
    fastify.post('/games/:gameId/predict', async (request, reply) => {
        try {
            const gameId = parseInt(request.params.gameId, 10);
            const { strategy_id, config } = request.body || {};

            let strategyConfig = config;
            let strategyId = strategy_id;

            // Если передан strategy_id — загружаем из БД
            if (strategy_id) {
                const stratRes = await db.query(
                    `SELECT id, config FROM user_strategies WHERE id = $1`, [strategy_id]
                );
                if (!stratRes.rows.length) {
                    return reply.code(404).send({ success: false, error: 'Strategy not found' });
                }
                strategyConfig = stratRes.rows[0].config;
                strategyId = stratRes.rows[0].id;
            }

            if (!strategyConfig) {
                return reply.code(400).send({ success: false, error: 'config or strategy_id required' });
            }

            const result = await computeStrategyPrediction(db, gameId, strategyConfig);

            if (result.error) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            // Сохраняем прогноз если пользователь залогинен и передан strategy_id
            let saved = false;
            try {
                const authHeader = request.headers.authorization;
                if (authHeader && strategyId) {
                    // Пытаемся декодировать JWT (не обязательно)
                    const token = authHeader.replace('Bearer ', '');
                    try {
                        const decoded = fastify.jwt.verify(token);
                        await db.query(
                            `INSERT INTO strategy_predictions
                             (strategy_id, game_id, predicted_outcome, confidence, analyzer_snapshot)
                             VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT (strategy_id, game_id) DO NOTHING`,
                            [strategyId, result.game_id, result.predicted_outcome,
                             result.confidence, JSON.stringify({
                                 home: Object.fromEntries(Object.entries(result.home_analyzers).map(([k,v]) => [k, v?.value])),
                                 away: Object.fromEntries(Object.entries(result.away_analyzers).map(([k,v]) => [k, v?.value])),
                             })]
                        );
                        saved = true;
                    } catch (_) {
                        // JWT невалиден — не сохраняем, но прогноз всё равно возвращаем
                    }
                }
            } catch (_) {}

            return {
                success: true,
                data: result,
                saved,
            };
        } catch (err) {
            request.log.error({ err }, 'POST /strategies/games/:gameId/predict failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // ─── Генерация прогнозов для выбранных стратегий ───

    // POST /api/strategies/:strategyId/predictions
    // Get predictions for a strategy with pagination/filtering
    fastify.get('/:strategyId/predictions', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const { strategyId } = request.params;
            const { limit = 20, offset = 0, status, is_hit } = request.query;
            
            // Verify ownership
            const stratRes = await db.query(
                'SELECT id, user_id FROM user_strategies WHERE id = $1',
                [strategyId]
            );
            if (!stratRes.rows[0]) {
                return reply.code(404).send({ success: false, error: 'Strategy not found' });
            }
            if (stratRes.rows[0].user_id !== request.user.userId) {
                return reply.code(403).send({ success: false, error: 'Not your strategy' });
            }
            
            const conditions = ['sp.strategy_id = $1'];
            const params = [strategyId];
            let paramIdx = 2;
            
            if (status === 'pending') {
                conditions.push(`sp.actual_outcome IS NULL`);
            } else if (status === 'verified') {
                conditions.push(`sp.actual_outcome IS NOT NULL`);
            }
            
            if (is_hit === 'true') {
                conditions.push('sp.is_hit = true');
            } else if (is_hit === 'false') {
                conditions.push('sp.is_hit = false');
            }
            
            const countRes = await db.query(
                `SELECT count(*) as total FROM strategy_predictions sp WHERE ${conditions.join(' AND ')}`,
                params
            );
            
            const rowsRes = await db.query(`
                SELECT sp.*, g.sstats_id as game_sstats_id, g.date as game_date,
                       g.home_score, g.away_score,
                       ht.name as home_name, at.name as away_name,
                       g.status as game_status
                FROM strategy_predictions sp
                JOIN games g ON g.id = sp.game_id
                LEFT JOIN teams ht ON ht.id = g.home_team_id
                LEFT JOIN teams at ON at.id = g.away_team_id
                WHERE ${conditions.join(' AND ')}
                ORDER BY sp.predicted_at DESC
                LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
            `, [...params, Math.min(parseInt(limit) || 20, 100), parseInt(offset) || 0]);
            
            return {
                success: true,
                data: rowsRes.rows,
                total: parseInt(countRes.rows[0].total),
                limit: Math.min(parseInt(limit) || 20, 100),
                offset: parseInt(offset) || 0,
            };
        } catch (err) {
            request.log.error({ err }, 'GET /:strategyId/predictions failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // POST /api/strategies/:strategyId/generate-predictions
    // Генерирует прогнозы для стратегии по выбранному scope.
    // Body: { scope?: 'upcoming'|'finished', hours?: 48, limit?: 50, max_games?: 50 }
    //   scope='upcoming' (default) — предстоящие матчи (исходное поведение)
    //   scope='finished' — завершённые матчи (сразу проставляет actual_outcome/is_hit)
    fastify.post('/:strategyId/generate-predictions', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const { strategyId } = request.params;
            const { hours = 48, limit = 50, max_games = 50, scope = 'upcoming' } = request.body || {};

            if (scope !== 'upcoming' && scope !== 'finished') {
                return reply.code(400).send({ success: false, error: 'scope must be "upcoming" or "finished"' });
            }

            // Получить стратегию с config
            const stratRes = await db.query(
                'SELECT id, user_id, config FROM user_strategies WHERE id = $1',
                [strategyId]
            );
            if (!stratRes.rows[0]) {
                return reply.code(404).send({ success: false, error: 'Strategy not found' });
            }
            if (stratRes.rows[0].user_id !== request.user.userId) {
                return reply.code(403).send({ success: false, error: 'Not your strategy' });
            }
            const config = stratRes.rows[0].config;

            let games;
            const results = [];

            if (scope === 'upcoming') {
                // Найти предстоящие матчи — оригинальная логика
                const upcomingRes = await db.query(`
                    SELECT g.id, g.sstats_id, g.league_id, g.date,
                           g.home_team_id, g.away_team_id,
                           g.home_score, g.away_score
                    FROM games g
                    WHERE g.status = 'scheduled'
                      AND g.is_deleted = false
                      AND g.date >= NOW()
                      AND g.date <= NOW() + $1::INTERVAL
                      AND g.home_team_id IS NOT NULL
                      AND g.away_team_id IS NOT NULL
                    ORDER BY g.date ASC
                    LIMIT $2
                `, [`${hours} hours`, Math.min(limit, 200)]);
                games = upcomingRes.rows;
            } else {
                // scope === 'finished' — завершённые матчи
                const finishedRes = await db.query(`
                    SELECT g.id, g.sstats_id, g.league_id, g.date,
                           g.home_team_id, g.away_team_id,
                           g.home_score, g.away_score
                    FROM games g
                    WHERE g.status = 'finished'
                      AND g.is_deleted = false
                      AND g.home_score IS NOT NULL
                      AND g.away_score IS NOT NULL
                      AND g.home_team_id IS NOT NULL
                      AND g.away_team_id IS NOT NULL
                    ORDER BY g.date DESC
                    LIMIT $1
                `, [Math.min(parseInt(max_games) || 50, 200)]);
                games = finishedRes.rows;
            }

            let created = 0;
            let existsCount = 0;
            let failed = 0;
            let skipped = 0;

            for (const game of games) {
                // Проверить, есть ли уже прогноз для этой стратегии и матча
                const existing = await db.query(
                    'SELECT id FROM strategy_predictions WHERE strategy_id = $1 AND game_id = $2',
                    [strategyId, game.id]
                );

                if (existing.rows.length > 0) {
                    results.push({ gameId: game.sstats_id, status: 'exists', id: existing.rows[0].id });
                    existsCount++;
                    continue;
                }

                // Сгенерировать прогноз с использованием конфига стратегии
                const prediction = await computeStrategyPrediction(db, game.id, config).catch(err => {
                    return { error: err.message };
                });

                if (prediction.error || !prediction.predicted_outcome) {
                    results.push({ gameId: game.sstats_id, status: 'failed', reason: prediction.error || 'no_forecast' });
                    failed++;
                    continue;
                }

                const predictedOutcome = prediction.predicted_outcome;
                const confidence = prediction.confidence;

                // Если матч завершён — вычислить actual_outcome
                let actualOutcome = null;
                let isHit = null;
                if (scope === 'finished' && game.home_score != null && game.away_score != null) {
                    if (game.home_score > game.away_score) actualOutcome = 'HOME';
                    else if (game.home_score < game.away_score) actualOutcome = 'AWAY';
                    else actualOutcome = 'DRAW';
                    isHit = predictedOutcome === actualOutcome;
                }

                // Собрать analyzer_snapshot
                const snapshot = {
                    version: '1.0',
                    generated_at: new Date().toISOString(),
                    scope,
                    strategy_config: {
                        n_window: config.n_window,
                        league_filter: config.league_filter,
                        venue_filter: config.venue_filter,
                        analyzers: config.analyzers,
                    },
                    home_analyzers: prediction.home_analyzers || {},
                    away_analyzers: prediction.away_analyzers || {},
                };

                // Сохранить в strategy_predictions
                const inserted = await db.query(`
                    INSERT INTO strategy_predictions (
                        strategy_id, game_id, predicted_outcome, confidence,
                        analyzer_snapshot,
                        actual_outcome, is_hit, verified_at,
                        predicted_total, total_line, total_confidence,
                        total_over_prob, total_under_prob
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (strategy_id, game_id) DO NOTHING
                    RETURNING id
                `, [
                    strategyId,
                    game.id,
                    predictedOutcome,
                    confidence,
                    JSON.stringify(snapshot),
                    actualOutcome,
                    isHit,
                    actualOutcome ? new Date().toISOString() : null,
                    null, null, null, null, null,
                ]);

                if (inserted.rows[0]) {
                    results.push({ gameId: game.sstats_id, status: 'created', id: inserted.rows[0].id });
                    created++;
                } else {
                    results.push({ gameId: game.sstats_id, status: 'conflict' });
                    existsCount++;
                }
            }

            // Обновить predictions_count в user_strategies
            if (created > 0 || existsCount > 0) {
                try {
                    await db.query(`
                        UPDATE user_strategies
                        SET predictions_count = sub.total
                        FROM (
                            SELECT count(*) AS total
                            FROM strategy_predictions
                            WHERE strategy_id = $1
                        ) sub
                        WHERE id = $1
                    `, [strategyId]);
                } catch (aggErr) {
                    request.log.warn({ err: aggErr, strategyId }, 'Predictions count update failed');
                }
            }

            return {
                success: true,
                data: {
                    strategyId,
                    scope,
                    processed: results.length,
                    created,
                    exists: existsCount,
                    failed,
                    skipped,
                    total_predictions: created + existsCount,
                    results,
                },
            };
        } catch (err) {
            request.log.error({ err }, 'POST /:strategyId/generate-predictions failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // ─── Бэктестинг: прогон стратегии по прошедшим матчам ───

    // POST /api/strategies/backtest
    // Body: { strategy_id или config, league_id (sstats_id), season (int), limit (optional, default 100) }
    fastify.post('/backtest', async (request, reply) => {
        try {
            const { strategy_id, config: inlineConfig, league_id, season, limit: rawLimit } = request.body || {};

            if (!league_id) {
                return reply.code(400).send({ success: false, error: 'league_id is required (sstats_id)' });
            }
            if (!season) {
                return reply.code(400).send({ success: false, error: 'season is required (e.g. 2024)' });
            }

            let strategyConfig = inlineConfig;
            if (strategy_id) {
                const stratRes = await db.query(
                    `SELECT id, config FROM user_strategies WHERE id = $1`, [strategy_id]
                );
                if (!stratRes.rows.length) {
                    return reply.code(404).send({ success: false, error: 'Strategy not found' });
                }
                strategyConfig = stratRes.rows[0].config;
            }

            if (!strategyConfig) {
                return reply.code(400).send({ success: false, error: 'config or strategy_id required' });
            }

            const limit = Math.min(parseInt(rawLimit || 100, 10), 500);
            const n = strategyConfig.n_window || 20;

            // Получаем finished матчи лиги/сезона
            const gamesRes = await db.query(`
                SELECT g.id, g.sstats_id, g.date,
                       g.home_team_id, g.away_team_id,
                       g.home_score, g.away_score,
                       ht.name AS home_name, at.name AS away_name,
                       ht.sstats_id AS home_sstats_id, at.sstats_id AS away_sstats_id
                FROM games g
                JOIN teams ht ON ht.id = g.home_team_id
                JOIN teams at ON at.id = g.away_team_id
                JOIN leagues l ON l.id = g.league_id
                WHERE l.sstats_id = $1
                  AND g.season = $2
                  AND g.status = 'finished'
                  AND g.home_score IS NOT NULL
                  AND g.away_score IS NOT NULL
                  AND g.is_deleted = false
                ORDER BY g.date ASC
                LIMIT $3
            `, [league_id, season, limit]);

            const games = gamesRes.rows;
            if (!games.length) {
                return { success: true, data: { total_games: 0, results: [], summary: {} } };
            }

            // Загружаем модули анализаторов
            const modules = {
                markov_outcome:  require('../../analytics/analyzers/markov-outcome.js'),
                markov_state:    require('../../analytics/analyzers/markov-state.js'),
                shannon_entropy: require('../../analytics/analyzers/shannon-entropy.js'),
                form_inertia:    require('../../analytics/analyzers/form-inertia.js'),
                valenzetti:      require('../../analytics/analyzers/valenzetti.js'),
                multipeak:       require('../../analytics/analyzers/multipeak-density.js'),
            };
            const aPoisson = require('../../analytics/analyzers/poisson.js');
            const pythonClient = require('../../analytics/python-client.js');

            async function loadHistory(teamId, beforeDate, leagueFilter) {
                const sql = `
                    SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
                           gs.expected_goals_home, gs.expected_goals_away
                    FROM games g
                    LEFT JOIN game_statistics gs ON gs.game_id = g.id
                    WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
                      AND g.is_deleted = false AND g.status = 'finished'
                      AND g.date < $3
                      ${leagueFilter ? 'AND g.league_id = $4' : ''}
                    ORDER BY g.date DESC LIMIT $2`;
                const params = leagueFilter
                    ? [teamId, n, beforeDate, leagueFilter]
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


            // Прогоняем по каждому матчу
            const results = [];
            let hits = 0, misses = 0, skips = 0;
            const byOutcome = { HOME: { predicted: 0, actual: 0, hits: 0 }, DRAW: { predicted: 0, actual: 0, hits: 0 }, AWAY: { predicted: 0, actual: 0, hits: 0 } };

            // Определяем league filter для истории
            const leagueInternalRes = await db.query(
                `SELECT id FROM leagues WHERE sstats_id = $1 LIMIT 1`, [league_id]
            );
            const leagueInternal = strategyConfig.league_filter && leagueInternalRes.rows.length
                ? leagueInternalRes.rows[0].id : null;

            // Обрабатываем батчами по 5 (не перегружаем Python HMM)
            for (let i = 0; i < games.length; i += 5) {
                const batch = games.slice(i, i + 5);
                const batchResults = await Promise.allSettled(batch.map(async (game) => {
                    const [homeGames, awayGames] = await Promise.all([
                        loadHistory(game.home_team_id, game.date, leagueInternal),
                        loadHistory(game.away_team_id, game.date, leagueInternal),
                    ]);

                    const homeResults = {};
                    const awayResults = {};
                    for (const a of strategyConfig.analyzers) {
                        if (!a.enabled) continue;
                        if (a.name === 'hmm') continue;
                        if (a.name === 'poisson') continue; // poisson requires both teams, handled below
                        if (a.name === 'valenzetti') continue; // valenzetti requires both teams, handled below
                        const mod = modules[a.name];
                        if (!mod) continue;
                        homeResults[a.name] = mod.analyze(homeGames);
                        awayResults[a.name] = mod.analyze(awayGames);
                    }

                    // Poisson — нужны обе команды
                    const poissonConf = strategyConfig.analyzers.find(a => a.name === 'poisson' && a.enabled);
                    const leagueParams = getLeagueParams(league_id, season);
                    if (poissonConf) {
                        try {
                            homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
                                avgHomeGoals: leagueParams.avg_home_goals,
                                avgAwayGoals: leagueParams.avg_away_goals
                            });
                            awayResults.poisson = aPoisson.analyze(awayGames, homeGames, {
                                avgHomeGoals: leagueParams.avg_home_goals,
                                avgAwayGoals: leagueParams.avg_away_goals
                            });
                        } catch (_) {
                            homeResults.poisson = null;
                            awayResults.poisson = null;
                        }
                    }

                    // Valenzetti — needs both teams (like Poisson)
                    const valenzettiConf = strategyConfig.analyzers.find(a => a.name === 'valenzetti' && a.enabled);
                    if (valenzettiConf) {
                        try {
                            homeResults.valenzetti = modules.valenzetti.analyze(homeGames, awayGames, {
                                alpha: leagueParams?.avg_home_goals ? Math.log(Number(leagueParams.avg_home_goals)) : undefined,
                                theta: Array.isArray(valenzettiConf.theta) && valenzettiConf.theta.length === 6
                                    ? valenzettiConf.theta : undefined,
                            });
                            awayResults.valenzetti = modules.valenzetti.analyzeTeam(awayGames);
                        } catch (_) {
                            homeResults.valenzetti = null;
                            awayResults.valenzetti = null;
                        }
                    }

                    const hmmConf = strategyConfig.analyzers.find(a => a.name === 'hmm' && a.enabled);
                    if (hmmConf) {
                        try {
                            const [homeHmm, awayHmm] = await Promise.allSettled([
                                pythonClient.getTeamAnalyzer('hmm', game.home_sstats_id, { nWindow: n }),
                                pythonClient.getTeamAnalyzer('hmm', game.away_sstats_id, { nWindow: n }),
                            ]);
                            homeResults.hmm = homeHmm.status === 'fulfilled' ? homeHmm.value : null;
                            awayResults.hmm = awayHmm.status === 'fulfilled' ? awayHmm.value : null;
                        } catch (_) {}
                    }

                    const pred = predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams, strategyConfig);
                    let actual;
                    if (game.home_score > game.away_score) actual = 'HOME';
                    else if (game.home_score < game.away_score) actual = 'AWAY';
                    else actual = 'DRAW';

                    return {
                        game_id: game.sstats_id,
                        home_name: game.home_name,
                        away_name: game.away_name,
                        date: game.date ? game.date.toISOString().split('T')[0] : null,
                        home_score: game.home_score,
                        away_score: game.away_score,
                        predicted: pred.predicted,
                        confidence: Math.round(pred.confidence * 10000) / 10000,
                        actual,
                        is_hit: pred.predicted === actual,
                    };
                }));

                for (const r of batchResults) {
                    if (r.status === 'fulfilled') {
                        const res = r.value;
                        results.push(res);
                        if (res.is_hit) hits++;
                        else misses++;
                        if (byOutcome[res.predicted]) {
                            byOutcome[res.predicted].predicted++;
                            byOutcome[res.predicted].actual++;
                            if (res.is_hit) byOutcome[res.predicted].hits++;
                        }
                    } else {
                        skips++;
                    }
                }
            }

            const total = hits + misses;
            return {
                success: true,
                data: {
                    total_games: games.length,
                    processed: results.length,
                    skipped: skips,
                    summary: {
                        accuracy: total > 0 ? Math.round(hits / total * 10000) / 100 : null,
                        hits,
                        misses,
                        by_outcome: byOutcome,
                    },
                    results,
                },
            };
        } catch (err) {
            request.log.error({ err }, 'POST /strategies/backtest failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    // GET /api/strategies/leagues — список доступных лиг для бэктеста
    fastify.get('/leagues', async () => {
        try {
            const result = await db.query(`
                SELECT DISTINCT l.sstats_id AS id, l.name, l.country_name,
                       MIN(g.season) AS min_season, MAX(g.season) AS max_season,
                       COUNT(*) AS games_count
                FROM leagues l
                JOIN games g ON g.league_id = l.id
                WHERE g.status = 'finished' AND g.home_score IS NOT NULL
                GROUP BY l.sstats_id, l.name, l.country_name
                HAVING COUNT(*) >= 50
                ORDER BY games_count DESC
                LIMIT 100
            `);
            return { success: true, data: result.rows };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = strategiesRoutes;
