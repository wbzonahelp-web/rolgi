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
const { getDatabase } = require('../database/db-pool');
const { getTracer, getMetricsCollector } = require('../monitoring/monitoring');

const logger = pino({
  name: 'scheduled-jobs',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * Scheduled Jobs Manager
 */
class ScheduledJobsManager {
  constructor() {
    this.jobs = new Map();
    this.loader = new DataLoader();
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
    // Job 1: Загрузка живых игр каждые 5 минут
    this.registerJob(
      'load_live_games',
      '*/5 * * * *', // Каждые 5 минут
      async () => {
        await this.loader.load('games', {
          status: 'live',
          limit: 100
        }, 'games');
      }
    );

    // Job 2: Обновление live коэффициентов каждую минуту
    this.registerJob(
      'update_live_odds',
      '* * * * *', // Каждую минуту
      async () => {
        // Получаем все live игры
        const liveGames = await this.db.select('games', { status: 'live' }, {
          limit: 50
        });

        logger.info({ count: liveGames.length }, 'Updating live odds');

        // Загружаем коэффициенты для каждой игры
        for (const game of liveGames) {
          try {
            await this.loader.load('odds', {
              gameId: game.id
            }, 'odds');
          } catch (error) {
            logger.error({
              gameId: game.id,
              error: error.message
            }, 'Failed to load odds for game');
          }
        }
      }
    );

    // Job 3: Загрузка предстоящих игр каждые 15 минут
    this.registerJob(
      'load_upcoming_games',
      '*/15 * * * *', // Каждые 15 минут
      async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        await this.loader.load('games', {
          status: 'upcoming',
          dateTo: tomorrow.toISOString(),
          limit: 200
        }, 'games');
      }
    );

    // Job 4: Загрузка завершённых игр каждый час
    this.registerJob(
      'load_finished_games',
      '0 * * * *', // Каждый час
      async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await this.loader.load('games', {
          status: 'finished',
          dateFrom: yesterday.toISOString(),
          limit: 500
        }, 'games');
      }
    );

    // Job 5: Синхронизация команд каждый день в 03:00
    this.registerJob(
      'sync_teams',
      '0 3 * * *', // Каждый день в 03:00
      async () => {
        await this.loader.load('teams', {
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
            await this.loader.load('players', {
              teamId: team.id
            }, 'players');
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
           WHERE game_date > NOW() - INTERVAL '30 days'
           LIMIT 50`
        );

        logger.info({ count: leagues.rows.length }, 'Updating standings for leagues');

        for (const league of leagues.rows) {
          try {
            await this.loader.load('standings', {
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

        // Проверка памяти
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
        const usagePercent = (heapUsedMB / heapTotalMB) * 100;

        this.metrics.recordHistogram('memory_usage_percent', usagePercent);

        if (usagePercent > 90) {
          logger.warn({
            heapUsedMB: heapUsedMB.toFixed(2),
            heapTotalMB: heapTotalMB.toFixed(2),
            usagePercent: usagePercent.toFixed(2)
          }, 'High memory usage detected');
        }
      }
    );

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
        job.task.start();
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
        job.task.stop();
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
