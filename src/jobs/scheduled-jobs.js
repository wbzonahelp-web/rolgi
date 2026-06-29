const logger = require("../monitoring/logger");
/**
 * Scheduled Jobs Manager v6.0.0
 * 
 * Автоматизация периодических задач:
 * - Загрузка игр каждые 5 минут
 * - Обновление live коэффициентов каждую минуту
 * - Синхронизация команд каждый день
 * - Синхронизация игроков каждый день
 * - Очистка старых логов каждую неделю
 * - Health check каждую минуту
 * 
 * @module scheduled-jobs
 */

const cron = require('node-cron');
const DataLoader = require('../loader/data-loader');
const SStatsClient = require('../api/sstats-client');
const { getDatabase } = require('../database/db-pool');
const { getTracer, getMetricsCollector } = require('../monitoring/monitoring');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let _liveClient = null, _detailsClient = null;
function getLiveClient() {
  if (!_liveClient) {
    _liveClient = new SStatsClient({
      apiKey: process.env.SSTATS_LIVE_API_KEY,
      proxy:  process.env.SSTATS_LIVE_PROXY
    });
  }
  return _liveClient;
}
function getDetailsClient() {
  if (!_detailsClient) {
    _detailsClient = new SStatsClient({
      apiKey: process.env.SSTATS_DETAILS_API_KEY,
      proxy:  process.env.SSTATS_DETAILS_PROXY
    });
  }
  return _detailsClient;
}


/**
 * Scheduled Jobs Manager
 */
class ScheduledJobsManager {
  constructor() {
    this.jobs = new Map();
    // DataLoader создаётся per-call в каждом job'е (изоляция this.currentSession)
    this.db = getDatabase();
    this.tracer = getTracer();
    this.metrics = getMetricsCollector();
    this.isRunning = false;

    logger.info('ScheduledJobsManager initialized');
  }

  /**
   * Регистрация job
   * @param {string} name - Имя job
   * @param {string} schedule - Cron schedule
   * @param {Function} handler - Handler функция
   */
  registerJob(name, schedule, handler) {
    if (this.jobs.has(name)) {
      logger.warn({ name }, 'Job already registered, skipping');
      return;
    }

    const task = cron.schedule(schedule, async () => {
      const traceId = this.tracer.startTrace(`job_${name}`);
      const startTime = Date.now();

      try {
        logger.info({ job: name }, 'Job started');

        await handler();

        const duration = Date.now() - startTime;
        this.metrics.recordHistogram(`job_duration_ms`, duration, { job: name });
        this.metrics.incrementCounter('job_executions', 1, { job: name, status: 'success' });

        logger.info({ job: name, duration }, 'Job completed successfully');
        this.tracer.finishTrace(traceId);
      } catch (error) {
        const duration = Date.now() - startTime;
        this.metrics.incrementCounter('job_executions', 1, { job: name, status: 'failed' });

        logger.error({
          job: name,
          error: error.message,
          duration
        }, 'Job failed');

        this.tracer.finishTrace(traceId);
      }
    }, {
      scheduled: false // Don't start automatically
    });

    this.jobs.set(name, {
      name,
      schedule,
      task,
      handler,
      enabled: true
    });

    logger.info({ name, schedule }, 'Job registered');
  }

  /**
   * Инициализация всех jobs
   */
  initializeJobs() {
    // Job 1: Загрузка live матчей с полным покрытием.
    // Full coverage: live=true + status=3,4,5 (объединение с дедупликацией через upsert по sstats_id).
    // /Games/list?live=true может пропустить halftime/часть first half; статусные запросы дополняют.
    // Дублирование между запросами безвредно — UPSERT идемпотентен.
    // GameUpdatesManager polling 10s сам разошлёт WS подписчикам.
    this.registerJob(
      'load_live_games',
      '* * * * *', // Каждую минуту
      async () => {
        const variants = [
          { live: true, limit: 1000 },
          { status: 3,  limit: 1000 },
          { status: 4,  limit: 1000 },
          { status: 5,  limit: 1000 }
        ];
        let totalLoaded = 0;
        const byVariant = {};
        for (const params of variants) {
          try {
            const session = await (new DataLoader({ apiClient: getLiveClient() }))
              .load('games', params, 'games');
            const cnt = session && session.stats ? (session.stats.totalRecords || 0) : 0;
            const key = params.live ? 'live=true' : ('status=' + params.status);
            byVariant[key] = cnt;
            totalLoaded += cnt;
          } catch (err) {
            const key = params.live ? 'live=true' : ('status=' + params.status);
            byVariant[key] = 'ERR:' + (err.message || '').slice(0, 60);
            logger.warn({ params, error: err.message }, 'load_live_games variant failed');
          }
        }
        logger.info({ totalLoaded, byVariant, mode: 'full-coverage' }, 'load_live_games: snapshot loaded');
      }
    );

    // Job 2: DISABLED: odds приходят из /Games/list?live=true вместе с базовыми данными.
    // Старая версия делала ~100 запросов /Odds/live/<id> в минуту с пустыми ответами.
    // Запись odds будет реализована в Job 11 (sync_live_details) парсингом поля odds[]
    // из ответа /Games/list (см. load_live_games) либо отдельным коллектором.
    this.registerJob(
      'update_live_odds',
      '0 0 30 2 *', // фактически отключён: 30 февраля никогда не наступает
      async () => {
        logger.debug('update_live_odds is disabled - odds collected via /Games/list?live=true');
      }
    );

    // Job 3: Загрузка предстоящих игр каждые 15 минут
    this.registerJob(
      'load_upcoming_games',
      '*/15 * * * *', // Каждые 15 минут
      async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0,10);
        await (new DataLoader()).load("games", { date: tomorrowStr, limit: 500 }, "games");
      }
    );

    // Job 4: Загрузка завершённых игр каждый час
    this.registerJob(
      'load_finished_games',
      '0 * * * *', // Каждый час
      async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0,10);
        await (new DataLoader()).load("games", { date: yesterdayStr, limit: 500 }, "games");
      }
    );

    // Job 5: Синхронизация команд каждый день в 03:00
    this.registerJob(
      'sync_teams',
      '0 3 * * *', // Каждый день в 03:00
      async () => {
        await (new DataLoader()).load('teams', {
          limit: 1000
        }, 'teams');
      }
    );

    // Job 6: Синхронизация игроков каждый день в 04:00
    this.registerJob(
      'sync_players',
      '0 4 * * *', // Каждый день в 04:00
      async () => {
        // Получаем все команды
        const teams = await this.db.select('teams', {}, {
          limit: 100
        });

        logger.info({ count: teams.length }, 'Syncing players for teams');

        for (const team of teams) {
          try {
            await (new DataLoader({ apiClient: getDetailsClient() })).load('players', {
              teamId: team.id
            }, 'players');
            await sleep(300); // pace: ~200 req/min, well under 300/min limit
          } catch (error) {
            logger.error({
              teamId: team.id,
              error: error.message
            }, 'Failed to sync players for team');
          }
        }
      }
    );

    // Job 7: Обновление турнирных таблиц каждые 6 часов
    this.registerJob(
      'update_standings',
      '0 */6 * * *', // Каждые 6 часов
      async () => {
        // Получаем активные лиги
        const leagues = await this.db.query(
          `SELECT DISTINCT league_id, season 
           FROM games 
           WHERE date > NOW() - INTERVAL '30 days'
           LIMIT 50`
        );

        logger.info({ count: leagues.rows.length }, 'Updating standings for leagues');

        for (const league of leagues.rows) {
          try {
            await (new DataLoader()).load('standings', {
              leagueId: league.league_id,
              season: league.season
            }, 'standings');
          } catch (error) {
            logger.error({
              leagueId: league.league_id,
              error: error.message
            }, 'Failed to update standings');
          }
        }
      }
    );

    // Job 10: Догрузка деталей для свежих finished матчей каждые 30 минут
    this.registerJob(
      'sync_finished_game_details',
      '*/15 * * * *', // Каждые 15 минут — нужно догнать пробел в покрытии
      async () => {
        // SYNCFIX-V2: убираем NOT EXISTS game_events/game_lineups (они отсекают матчи,
        // где есть события, но НЕТ статистики). Берём матчи где либо нет строки в
        // game_statistics, либо есть, но possession_home/shots_home — NULL (т.е. фактически пустая).
        const result = await this.db.query(
          `SELECT g.id, g.sstats_id
           FROM games g
           LEFT JOIN game_statistics gs ON gs.game_id = g.id AND gs.date = g.date
           WHERE g.status='finished'
             AND g.date >= NOW() - INTERVAL '14 days'
             AND g.is_deleted = false
             AND (gs.game_id IS NULL OR gs.possession_home IS NULL)
           ORDER BY g.date DESC
           LIMIT 200`
        );

        const candidates = result.rows || [];
        logger.info({ count: candidates.length }, 'Syncing details for finished games');

        const loader = new DataLoader({ apiClient: getDetailsClient() });
        let ok = 0, fail = 0;
        for (const game of candidates) {
          try {
            await loader.load('game_details', { gameId: game.sstats_id }, 'games');
            ok++;
            await sleep(300); // pace under 300/min on dedicated channel
          } catch (error) {
            fail++;
            logger.error({
              gameId: game.sstats_id,
              error: error.message
            }, 'Failed to sync game details');
          }
        }

        logger.info({ ok, fail, total: candidates.length }, 'Finished game details sync completed');
      }
    );

    // Job 11: Ежедневный пересчёт team_profitability_cache (ROI команд)
    this.registerJob(
      'compute_team_profitability',
      '30 3 * * *', // Каждый день в 03:30 UTC
      async () => {
        const fs = require('fs');
        const path = require('path');
        const sqlPath = path.join(__dirname, '..', 'database', 'sql', 'compute_team_profitability.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        const t0 = Date.now();
        logger.info('Computing team profitability cache...');
        await this.db.query(sql);
        const stats = await this.db.query(
          `SELECT COUNT(*)::int AS total_rows,
                  COUNT(DISTINCT team_id)::int AS teams,
                  COUNT(DISTINCT market)::int AS markets
           FROM team_profitability_cache`
        );
        const row = (stats.rows || [])[0] || {};
        logger.info({
          duration_ms: Date.now() - t0,
          total_rows: row.total_rows,
          teams: row.teams,
          markets: row.markets
        }, 'Team profitability cache rebuilt');
      }
    );


    // Job 12: Ежедневный пересчёт team_analyzers_cache (5 анализаторов × N=20 × все команды)
    this.registerJob(
      'compute_team_analyzers',
      '45 3 * * *', // Каждый день в 03:45 UTC (после Glicko и profitability)
      async () => {
        const { computeTeamAnalyzers } = require('./compute-team-analyzers');
        const stats = await computeTeamAnalyzers(this.db);
        logger.info({
          job: 'compute_team_analyzers',
          ...stats,
        }, 'Team analyzers cache rebuilt');
      }
    );

    // Job 13: Этап 12 — запись прогнозов модели до начала матча (каждый час в :15)
    this.registerJob(
      'record_predictions',
      '15 * * * *', // Каждый час в :15 UTC
      async () => {
        const { recordPredictions } = require('./record-predictions');
        const stats = await recordPredictions(this.db);
        logger.info({
          job: 'record_predictions',
          ...stats,
        }, 'Predictions recorded');
      }
    );

    // Job 14: Этап 12 — сверка прогнозов с фактом для finished матчей (каждый час в :25)
    this.registerJob(
      'verify_predictions',
      '25 * * * *', // Каждый час в :25 UTC (через 10 мин после record_predictions)
      async () => {
        const { verifyPredictions } = require('./verify-predictions');
        const stats = await verifyPredictions(this.db);
        logger.info({
          job: 'verify_predictions',
          ...stats,
        }, 'Predictions verified');
      }
    );

    // Job 15: Этап 13 — ежедневный прогрев HMM-кэша через Python-сервис (04:45 UTC)
    this.registerJob(
      'compute_python_analyzers',
      '45 4 * * *', // Каждый день в 04:45 UTC (после compute_team_analyzers в 03:45)
      async () => {
        const { computePythonAnalyzers } = require('./compute-python-analyzers');
        const stats = await computePythonAnalyzers(this.db);
        logger.info({
          job: 'compute_python_analyzers',
          ...stats,
        }, 'Python analyzers cache warmed');
      }
    );

    // Job 16: Этап 14 — сверка прогнозов стратегий (каждый час в :30)
    this.registerJob(
      'verify_strategy_predictions',
      '30 * * * *', // Каждый час в :30 UTC
      async () => {
        const { verifyStrategyPredictions } = require('./verify-strategy-predictions');
        const stats = await verifyStrategyPredictions(this.db);
        logger.info({
          job: 'verify_strategy_predictions',
          ...stats,
        }, 'Strategy predictions verified');
      }
    );

    // Job 8: Очистка старых логов каждое воскресенье в 02:00
    this.registerJob(
      'cleanup_old_logs',
      '0 2 * * 0', // Каждое воскресенье в 02:00
      async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Удаляем старые записи из api_request_log
        const deletedRequests = await this.db.query(
          `DELETE FROM api_request_log WHERE created_at < $1`,
          [thirtyDaysAgo]
        );

        // Удаляем старые записи из data_sync_log
        const deletedSyncs = await this.db.query(
          `DELETE FROM data_sync_log WHERE created_at < $1`,
          [thirtyDaysAgo]
        );

        logger.info({
          deletedRequests: deletedRequests.rowCount,
          deletedSyncs: deletedSyncs.rowCount
        }, 'Old logs cleaned up');

        // Очистка старых traces
        this.tracer.clearOldTraces(7 * 24 * 60 * 60 * 1000); // 7 дней
      }
    );

    // Job: Cleanup stale live games (zombies)
    // Помечаем is_live=false для матчей, которые висят со флагом live, но дата >4 часов назад.
    // Это очищает накапливающихся зомби когда SStats перестаёт отдавать матч в /Games/list?live=true.
    // НЕ меняем status — пусть Job 'load_finished_games' позже проставит финальный статус.
    this.registerJob(
      'cleanup_stale_live_games',
      '*/5 * * * *', // Каждые 5 минут
      async () => {
        try {
          // CLEANUP-V3: fix status + is_finished
          // Ранее ставили только is_live=false, но status оставался 'live' и is_finished оставался false
          // → фронт видел status='live' и рисовал live-бейдж. Теперь приводим запись в consistent finished state.
          const result = await this.db.query(`
            UPDATE games
            SET is_live      = false,
                is_finished  = true,
                status       = CASE WHEN status = 'live' THEN 'finished' ELSE status END,
                last_updated = NOW()
            WHERE (is_live = true OR (status = 'live' AND is_finished = false))
              AND (
                date < NOW() - INTERVAL '4 hours'
                OR last_updated < NOW() - INTERVAL '10 minutes'
              )
            RETURNING sstats_id, date
          `);
          const cleaned = result && result.rows ? result.rows.length : 0;
          if (cleaned > 0) {
            logger.info({ cleaned, oldestDate: result.rows[0] && result.rows[0].date }, 'cleanup_stale_live_games: zombies cleaned');
          }
        } catch (err) {
          logger.warn({ error: err.message }, 'cleanup_stale_live_games failed');
        }
      }
    );

    // === Job 11: sync_live_details ===
    // Каждые 40 сек: для всех live матчей подгружаем детали (events/lineups/statistics)
    // через round-robin по 3 каналам (LIVE/DETAILS/DEFAULT proxy/no-proxy)
    // Singleton: пропускаем цикл если предыдущий не успел
    let _syncLiveDetailsRunning = false;
    let _defaultClient = null;
    const getDefaultClient = () => {
      if (_defaultClient) return _defaultClient;
      _defaultClient = new SStatsClient({
        apiKey: process.env.SSTATS_API_KEY,
        rateLimitPerMin: 300
      });
      return _defaultClient;
    };

    this.registerJob(
      'sync_live_details',
      '*/40 * * * * *', // каждые 40 секунд
      async () => {
        if (_syncLiveDetailsRunning) {
          logger.warn({ job: 'sync_live_details' }, 'Previous cycle still running, skipping');
          return;
        }
        _syncLiveDetailsRunning = true;
        const cycleStart = Date.now();
        try {
          const { rows } = await this.db.query(`
            SELECT sstats_id FROM games
            WHERE is_live = true
              AND sstats_id IS NOT NULL
              AND date >= NOW() - interval '6 hours'
            ORDER BY last_updated NULLS FIRST
            LIMIT 300
          `);
          const ids = rows.map(r => r.sstats_id);
          if (ids.length === 0) {
            logger.info({ job: 'sync_live_details' }, 'No live matches to sync');
            return;
          }

          // Per-cycle DataLoader instances (изоляция currentSession)
          const channels = {
            live:    { loader: new DataLoader({ apiClient: getLiveClient() }),    matches: [] },
            details: { loader: new DataLoader({ apiClient: getDetailsClient() }), matches: [] },
            default: { loader: new DataLoader({ apiClient: getDefaultClient() }), matches: [] }
          };
          const channelKeys = ['live', 'details', 'default'];
          ids.forEach((id, i) => channels[channelKeys[i % 3]].matches.push(id));

          const processChannel = async (channelName) => {
            const ch = channels[channelName];
            const res = { count: ch.matches.length, ok: 0, err: 0, totalMs: 0 };
            const CONCURRENCY = 8;
            for (let i = 0; i < ch.matches.length; i += CONCURRENCY) {
              const slice = ch.matches.slice(i, i + CONCURRENCY);
              await Promise.allSettled(slice.map(async (gameId) => {
                const t0 = Date.now();
                try {
                  await ch.loader.load('game_details', { gameId });
                  res.ok++;
                  res.totalMs += (Date.now() - t0);
                } catch (e) {
                  res.err++;
                  logger.warn({ job: 'sync_live_details', channel: channelName, gameId, err: e.message }, 'per-game error');
                }
              }));
            }
            return res;
          };

          const [liveRes, detailsRes, defaultRes] = await Promise.all([
            processChannel('live'),
            processChannel('details'),
            processChannel('default')
          ]);

          const avg = (r) => r.ok > 0 ? Math.round(r.totalMs / r.ok) : 0;
          const totalOk = liveRes.ok + detailsRes.ok + defaultRes.ok;
          const totalErr = liveRes.err + detailsRes.err + defaultRes.err;
          logger.info({
            job: 'sync_live_details',
            totalMatches: ids.length,
            totalOk,
            totalErr,
            durationMs: Date.now() - cycleStart,
            channels: {
              live:    { count: liveRes.count,    ok: liveRes.ok,    err: liveRes.err,    avgMs: avg(liveRes) },
              details: { count: detailsRes.count, ok: detailsRes.ok, err: detailsRes.err, avgMs: avg(detailsRes) },
              default: { count: defaultRes.count, ok: defaultRes.ok, err: defaultRes.err, avgMs: avg(defaultRes) }
            }
          }, 'sync_live_details: cycle completed');
        } catch (e) {
          logger.error({ job: 'sync_live_details', err: e.message, stack: e.stack }, 'sync_live_details cycle failed');
        } finally {
          _syncLiveDetailsRunning = false;
        }
      }
    );

    // Job 9: Health check системы каждую минуту
    this.registerJob(
      'system_health_check',
      '* * * * *', // Каждую минуту
      async () => {
        const health = await this.db.healthCheck();

        if (!health) {
          logger.error('Database health check failed');
          this.metrics.incrementCounter('health_check_failures', 1, { component: 'database' });
        } else {
          this.metrics.incrementCounter('health_check_success', 1, { component: 'database' });
        }

        // Проверка памяти — считаем от реального V8 heap limit, а не от heapTotal
        // (heapTotal — это текущий выделенный V8 кусок, растёт по требованию)
        const v8 = require('v8');
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
        const heapLimitMB = heapStats.heap_size_limit / 1024 / 1024;
        const rssMB = memUsage.rss / 1024 / 1024;
        const usagePercent = (heapUsedMB / heapLimitMB) * 100;

        this.metrics.recordHistogram('memory_usage_percent', usagePercent);

        if (usagePercent > 85) {
          logger.warn({
            heapUsedMB: heapUsedMB.toFixed(2),
            heapTotalMB: heapTotalMB.toFixed(2),
            heapLimitMB: heapLimitMB.toFixed(2),
            rssMB: rssMB.toFixed(2),
            usagePercent: usagePercent.toFixed(2)
          }, 'High memory usage detected');
        }
      }
    );

    // ============================================================
    // sync_upcoming_odds: загружает upcoming матчи (вместе с inline odds) каждые 15 мин
    // Покрывает today..today+3 (4 дня) с пагинацией.
    // /Games/list?date=... возвращает inline поле odds для матчей популярных лиг.
    // Используем LIVE-клиент т.к. именно он отдаёт inline odds в /Games/list.
    // ============================================================
    let _syncUpcomingOddsRunning = false;
    // sync_upcoming_odds: используем setInterval вместо cron из-за бага node-cron 3.0.3
    const syncUpcomingOddsHandler = async () => {
        if (_syncUpcomingOddsRunning) {
          logger.warn({ job: 'sync_upcoming_odds' }, 'Previous cycle still running, skipping');
          return;
        }
        _syncUpcomingOddsRunning = true;
        const cycleStart = Date.now();
        try {
          const today = new Date();
          const dates = [];
          for (let i = 0; i <= 3; i++) {
            const d = new Date(today.getTime() + i * 86400000);
            dates.push(d.toISOString().slice(0, 10));
          }

          const summary = {};
          let grandTotal = 0;
          for (const date of dates) {
            let offset = 0;
            let total = 0;
            let pages = 0;
            while (true) {
              try {
                const loader = new DataLoader({ apiClient: getLiveClient() });
                const session = await loader.load('games', { date, limit: 1000, offset }, 'games');
                const cnt = (session && session.stats && session.stats.totalRecords) || 0;
                total += cnt;
                pages++;
                if (cnt < 1000) break;
                offset += 1000;
                if (offset > 5000) break; // safety: max 6000 matches per date
              } catch (err) {
                logger.warn({ job: 'sync_upcoming_odds', date, offset, err: err.message }, 'page failed');
                break;
              }
            }
            summary[date] = { games: total, pages };
            grandTotal += total;
          }

          logger.info({
            job: 'sync_upcoming_odds',
            grandTotal,
            durationMs: Date.now() - cycleStart,
            summary
          }, 'sync_upcoming_odds: cycle completed');
        } catch (e) {
          logger.error({ job: 'sync_upcoming_odds', err: e.message, stack: e.stack }, 'sync_upcoming_odds cycle failed');
        } finally {
          _syncUpcomingOddsRunning = false;
        }
      };

    // Запускаем setInterval вместо cron — node-cron 3.0.3 не триггерит '*/15 * * * *' в Docker
    setTimeout(() => { syncUpcomingOddsHandler().catch(e => logger.error({err:e.message},'sync_upcoming_odds initial run failed')); }, 30000);
    setInterval(() => { syncUpcomingOddsHandler().catch(e => logger.error({err:e.message},'sync_upcoming_odds interval run failed')); }, 15 * 60 * 1000);
    this.jobs.set('sync_upcoming_odds', { schedule: 'setInterval(15min)', enabled: true, task: null, handler: syncUpcomingOddsHandler });
    logger.info({ job: 'sync_upcoming_odds', schedule: 'setInterval(15min)' }, 'Job registered via setInterval');

    logger.info({ jobsCount: this.jobs.size }, 'All jobs initialized');
  }

  /**
   * Запустить все jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Jobs already running');
      return;
    }

    for (const [name, job] of this.jobs.entries()) {
      if (job.enabled) {
        if (job.task && typeof job.task.start === 'function') {
          job.task.start();
        }
        logger.info({ job: name, schedule: job.schedule }, 'Job started');
      }
    }

    this.isRunning = true;
    logger.info('All scheduled jobs started');
  }

  /**
   * Остановить все jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Jobs not running');
      return;
    }

    for (const [name, job] of this.jobs.entries()) {
      job.task.stop();
      logger.info({ job: name }, 'Job stopped');
    }

    this.isRunning = false;
    logger.info('All scheduled jobs stopped');
  }

  /**
   * Включить/выключить job
   * @param {string} name - Имя job
   * @param {boolean} enabled - Включён или нет
   */
  setJobEnabled(name, enabled) {
    const job = this.jobs.get(name);

    if (!job) {
      logger.warn({ name }, 'Job not found');
      return;
    }

    job.enabled = enabled;

    if (this.isRunning) {
      if (enabled) {
        job.task.start();
        logger.info({ job: name }, 'Job enabled and started');
      } else {
        if (job.task && typeof job.task.stop === 'function') {
          job.task.stop();
        }
        logger.info({ job: name }, 'Job disabled and stopped');
      }
    }
  }

  /**
   * Получить статус всех jobs
   * @returns {Array}
   */
  getJobsStatus() {
    const status = [];

    for (const [name, job] of this.jobs.entries()) {
      status.push({
        name,
        schedule: job.schedule,
        enabled: job.enabled,
        running: this.isRunning && job.enabled
      });
    }

    return status;
  }

  /**
   * Запустить job вручную
   * @param {string} name - Имя job
   */
  async runJobManually(name) {
    const job = this.jobs.get(name);

    if (!job) {
      throw new Error(`Job ${name} not found`);
    }

    logger.info({ job: name }, 'Running job manually');

    await job.handler();

    logger.info({ job: name }, 'Job completed manually');
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let jobsManagerInstance = null;

/**
 * Получить singleton instance Jobs Manager
 * @returns {ScheduledJobsManager}
 */
function getJobsManager() {
  if (!jobsManagerInstance) {
    jobsManagerInstance = new ScheduledJobsManager();
    jobsManagerInstance.initializeJobs();
  }
  return jobsManagerInstance;
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];
  const jobName = process.argv[3];

  const manager = getJobsManager();

  switch (command) {
    case 'start':
      console.log('Starting all scheduled jobs...\n');
      manager.start();
      console.log('✓ All jobs started\n');
      
      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\nStopping all jobs...');
        manager.stop();
        process.exit(0);
      });
      break;

    case 'stop':
      manager.stop();
      console.log('All jobs stopped');
      process.exit(0);

    case 'status':
      console.log('Scheduled Jobs Status:\n');
      const status = manager.getJobsStatus();
      console.table(status);
      process.exit(0);

    case 'run':
      if (!jobName) {
        console.error('Error: Job name required');
        console.log('Usage: node scheduled-jobs.js run <job-name>');
        process.exit(1);
      }

      (async () => {
        try {
          console.log(`Running job: ${jobName}\n`);
          await manager.runJobManually(jobName);
          console.log('\n✓ Job completed');
          process.exit(0);
        } catch (error) {
          console.error('Error:', error.message);
          process.exit(1);
        }
      })();
      break;

    default:
      console.log(`
Scheduled Jobs Manager v6.0.0

Usage:
  node scheduled-jobs.js start           # Start all jobs
  node scheduled-jobs.js stop            # Stop all jobs
  node scheduled-jobs.js status          # Show jobs status
  node scheduled-jobs.js run <job-name>  # Run specific job manually

Available jobs:
  - load_live_games          # Every 5 minutes
  - update_live_odds         # Every minute
  - load_upcoming_games      # Every 15 minutes
  - load_finished_games      # Every hour
  - sync_teams               # Daily at 03:00
  - sync_players             # Daily at 04:00
  - update_standings         # Every 6 hours
  - cleanup_old_logs         # Weekly on Sunday at 02:00
  - system_health_check      # Every minute
      `);
      process.exit(0);
  }
}

module.exports = {
  ScheduledJobsManager,
  getJobsManager
};
