'use strict';

/**
 * Job: compute_python_analyzers
 *
 * Прогрев кэша HMM-анализатора для активных команд через Python-сервис.
 * Запускается ночью в 04:45 UTC (после compute_team_analyzers в 03:45).
 *
 * Логика:
 *   1. Выбираем активные команды с ≥10 матчами за 365 дней (те же, что в team_analyzers_cache)
 *   2. Для каждой вызываем Python HMM API (GET /analyzers/hmm/team/{id}?n_window=30)
 *   3. Результат кэшируется на стороне Python (L1 in-memory + PostgreSQL)
 *
 * Параметры:
 *   n_window     = 30 (HMM требует больше истории)
 *   league_id    = none (все турниры)
 *   venue        = any
 *   batch_size   = 50 (меньше, чем для JS — каждый запрос идёт по HTTP)
 *   concurrency  = 10 (параллельных запросов к Python)
 *   delay_between_batches_ms = 1000 (пауза между батчами, чтобы не перегрузить)
 */

const logger = require('../monitoring/logger');

const N_WINDOW = 30;
const BATCH_SIZE = 50;
const CONCURRENCY = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;

async function computePythonAnalyzers(db) {
    const t0 = Date.now();

    // Импортируем python-client
    const pythonClient = require('../analytics/python-client.js');

    // 1) Активные команды
    logger.info({ job: 'compute_python_analyzers' }, 'Selecting active teams...');
    const teamsRes = await db.query(`
        SELECT t.id AS team_id, t.sstats_id, t.name
        FROM teams t
        WHERE t.is_active = true
          AND EXISTS (
            SELECT 1 FROM games g
            WHERE (g.home_team_id = t.id OR g.away_team_id = t.id)
              AND g.is_deleted = false
              AND g.status = 'finished'
              AND g.date >= NOW() - INTERVAL '365 days'
            LIMIT 1
          )
        ORDER BY t.id
    `);
    const teams = teamsRes.rows;
    logger.info({
        job: 'compute_python_analyzers',
        teams_total: teams.length,
    }, 'Active teams selected');

    let teamsProcessed = 0;
    let teamsSkipped = 0;
    let teamsFailed = 0;
    let cacheHits = 0;

    // 2) Обрабатываем батчами
    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
        const batch = teams.slice(i, i + BATCH_SIZE);

        // Параллельно запускаем CONCURRENCY запросов
        const results = await Promise.allSettled(
            batch.map(async (t) => {
                try {
                    const result = await pythonClient.getTeamAnalyzer('hmm', t.team_id, {
                        nWindow: N_WINDOW,
                    });
                    if (result) {
                        teamsProcessed++;
                        if (result.source === 'cache') cacheHits++;
                    } else {
                        teamsSkipped++;
                    }
                    return { team_id: t.team_id, ok: !!result };
                } catch (err) {
                    teamsFailed++;
                    logger.warn({
                        job: 'compute_python_analyzers',
                        team_id: t.team_id,
                        err: err.message,
                    }, 'HMM request failed');
                    return { team_id: t.team_id, ok: false, err: err.message };
                }
            })
        );

        // Логируем прогресс каждые 10 батчей
        if ((i / BATCH_SIZE) % 10 === 0) {
            logger.info({
                job: 'compute_python_analyzers',
                progress: `${i + batch.length}/${teams.length}`,
                processed: teamsProcessed,
                skipped: teamsSkipped,
                failed: teamsFailed,
                cache_hits: cacheHits,
            }, 'Progress');
        }

        // Пауза между батчами
        if (i + BATCH_SIZE < teams.length) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
    }

    const duration = Date.now() - t0;
    const stats = {
        teams_total: teams.length,
        teams_processed: teamsProcessed,
        teams_skipped: teamsSkipped,
        teams_failed: teamsFailed,
        cache_hits: cacheHits,
        duration_ms: duration,
    };
    logger.info({ job: 'compute_python_analyzers', ...stats }, 'Python analyzers cache warmed');
    return stats;
}

module.exports = { computePythonAnalyzers };
