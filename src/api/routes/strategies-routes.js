'use strict';

/**
 * Strategies routes. Префикс: /api/strategies
 *
 * CRUD для пользовательских стратегий + прогноз по стратегии + лидерборд.
 * Все endpoints кроме POST /games/:id/custom-strategy требуют авторизации.
 */

const { authenticate } = require('../../auth/fastify-auth');
const { getLeagueParams } = require('../../analytics/utils/league-params');

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

    /**
     * Вычисляет прогноз по стратегии (stateless).
     * Логика аналогична integrated forecast, но с кастомными весами.
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
        const aPoisson = require('../../analytics/analyzers/poisson.js');
        const aValenzetti = require('../../analytics/analyzers/valenzetti.js');
        const modules = {
            markov_outcome:  require('../../analytics/analyzers/markov-outcome.js'),
            markov_state:    require('../../analytics/analyzers/markov-state.js'),
            shannon_entropy: require('../../analytics/analyzers/shannon-entropy.js'),
            form_inertia:    require('../../analytics/analyzers/form-inertia.js'),
            multipeak:       require('../../analytics/analyzers/multipeak-density.js'),
            valenzetti:      require('../../analytics/analyzers/valenzetti.js'),
        };

        const homeResults = {};
        const awayResults = {};
        for (const a of config.analyzers) {
            if (!a.enabled) continue;
            if (a.name === 'hmm') continue; // HMM — через Python, ниже
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
            awayResults.valenzetti = aValenzetti.analyzeTeam(homeGames);
        }

        // HMM (async, graceful)
        const hmmConfig = config.analyzers.find(a => a.name === 'hmm' && a.enabled);
        if (hmmConfig) {
            const pythonClient = require('../../analytics/python-client.js');
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
    fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const result = await db.query(
                `SELECT id, name, description, config, is_public,
                        predictions_count, hits_count, accuracy, roi,
                        created_at, updated_at
                 FROM user_strategies
                 WHERE user_id = $1
                 ORDER BY updated_at DESC`, [userId]
            );
            return { success: true, data: result.rows };
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

            function predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams = {}) {
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
                        if (a.name === 'poisson') continue; // poisson требует обе команды, обработаем ниже
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

                    const pred = predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams);
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
