/**
 * Rolgi SStats Analytics Platform v6.0.0
 * Main Server Entry Point
 * 
 * Полная интеграция всех компонентов:
 * - Pre-flight Checks перед запуском
 * - Database Connection Pool
 * - SStats API Client
 * - Data Loader Pipeline
 * - Backend API (Fastify)
 * - Monitoring & Tracing
 * - Health Checks
 * - Graceful Shutdown
 * 
 * @module server
 */

require('dotenv').config();

const pino = require('pino');
const { runPreflightChecks } = require('./src/core/preflight-checks');
const { getDatabase, closeDatabase } = require('./src/database/db-pool');
const { createRedisClient, closeRedis, healthCheck: redisHealthCheck } = require('./src/cache/redis-client');
const BackendApi = require('./src/api/backend-api');
const { getHealthMonitor, getTracer, getErrorCollector, getMetricsCollector } = require('./src/monitoring/monitoring');
const { getJobsManager } = require('./src/jobs/scheduled-jobs');
const WSServer = require('./src/websocket/ws-server');
const GameUpdatesManager = require('./src/websocket/game-updates');
const PrometheusCollector = require('./src/monitoring/prometheus/collector');

const logger = pino({
  name: 'server',
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

/**
 * Main Server Class
 */
class RolgiServer {
  constructor() {
    this.api = null;
    this.db = null;
    this.redis = null;
    this.wsServer = null;
    this.gameUpdatesManager = null;
    this.prometheusCollector = null;
    this.jobsManager = null;
    this.healthMonitor = getHealthMonitor();
    this.tracer = getTracer();
    this.errorCollector = getErrorCollector();
    this.metricsCollector = getMetricsCollector();
    this.isShuttingDown = false;

    logger.info('Rolgi Server v6.0.0 initializing...');
  }

  /**
   * Run pre-flight checks
   * @private
   */
  async _runPreflightChecks() {
    logger.info('Running pre-flight checks...');

    const traceId = this.tracer.startTrace('preflight_checks');

    try {
      const result = await runPreflightChecks();

      if (result.failed.length > 0) {
        logger.error({
          failed: result.failed,
          warnings: result.warnings
        }, 'Pre-flight checks FAILED');

        this.tracer.finishTrace(traceId);
        
        throw new Error(`Pre-flight checks failed: ${result.failed.join(', ')}`);
      }

      if (result.warnings.length > 0) {
        logger.warn({
          warnings: result.warnings
        }, 'Pre-flight checks passed with warnings');
      } else {
        logger.info({
          passed: result.passed
        }, 'Pre-flight checks PASSED');
      }

      this.tracer.finishTrace(traceId);

      return result;
    } catch (error) {
      this.errorCollector.recordError(error, { stage: 'preflight' });
      this.tracer.finishTrace(traceId);
      throw error;
    }
  }

  /**
   * Initialize database
   * @private
   */
  async _initializeDatabase() {
    logger.info('Initializing database connection pool...');

    const traceId = this.tracer.startTrace('db_init');

    try {
      this.db = getDatabase();

      // Test connection
      const healthy = await this.db.healthCheck();

      if (!healthy) {
        throw new Error('Database health check failed');
      }

      logger.info({
        maxConnections: this.db.config.max,
        minConnections: this.db.config.min
      }, 'Database connection pool initialized');

      this.tracer.finishTrace(traceId);
    } catch (error) {
      this.errorCollector.recordError(error, { stage: 'db_init' });
      this.tracer.finishTrace(traceId);
      throw error;
    }
  }

  /**
   * Initialize Redis
   * @private
   */
  async _initializeRedis() {
    logger.info('Initializing Redis connection...');

    const traceId = this.tracer.startTrace('redis_init');

    try {
      this.redis = createRedisClient();

      // Test connection
      const healthy = await redisHealthCheck();

      if (!healthy) {
        logger.warn('Redis health check failed, continuing without Redis');
        // Не бросаем ошибку, так как Redis опциональный
      } else {
        logger.info('Redis connection initialized');
      }

      this.tracer.finishTrace(traceId);
    } catch (error) {
      logger.warn({
        error: error.message
      }, 'Redis initialization failed, continuing without Redis');
      this.errorCollector.recordError(error, { stage: 'redis_init', optional: true });
      this.tracer.finishTrace(traceId);
      // Не бросаем ошибку, так как Redis опциональный
    }
  }

  /**
   * Setup health checks
   * @private
   */
  _setupHealthChecks() {
    logger.info('Setting up health checks...');

    // Database health check
    this.healthMonitor.registerCheck('database', async () => {
      return await this.db.healthCheck();
    }, 30000); // Every 30 seconds

    // Redis health check
    this.healthMonitor.registerCheck('redis', async () => {
      return await redisHealthCheck();
    }, 30000); // Every 30 seconds

    // API health check
    this.healthMonitor.registerCheck('api', async () => {
      return this.api !== null;
    }, 60000); // Every 60 seconds

    // Memory health check — FIXED: heap_size_limit metric
    // (heapTotal — это текущий выделенный V8 кусок и почти всегда близок к heapUsed;
    //  правильная метрика — heapUsed/heap_size_limit, как в scheduled-jobs.js)
    const v8 = require('v8');
    this.healthMonitor.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      const heapTotalMB = usage.heapTotal / 1024 / 1024;
      const heapLimitMB = heapStats.heap_size_limit / 1024 / 1024;
      const rssMB = usage.rss / 1024 / 1024;
      const usagePercent = (heapUsedMB / heapLimitMB) * 100;

      if (usagePercent > 92) {
        throw new Error(`Memory usage critical: ${usagePercent.toFixed(2)}% of heap_size_limit (${heapLimitMB.toFixed(0)}MB)`);
      }

      return {
        heapUsedMB: heapUsedMB.toFixed(2),
        heapTotalMB: heapTotalMB.toFixed(2),
        heapLimitMB: heapLimitMB.toFixed(2),
        rssMB: rssMB.toFixed(2),
        usagePercent: usagePercent.toFixed(2)
      };
    }, 60000); // Every 60 seconds

    this.healthMonitor.start();

    logger.info('Health checks configured');
  }

  /**
   * Initialize API server
   * @private
   */
  async _initializeApi() {
    logger.info('Initializing Backend API server...');

    const traceId = this.tracer.startTrace('api_init');

    try {
      this.api = new BackendApi({
        port: process.env.API_PORT || 3000,
        host: process.env.API_HOST || '0.0.0.0',
        enableSwagger: process.env.ENABLE_SWAGGER !== 'false',
        enableCors: process.env.ENABLE_CORS !== 'false',
        enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false'
      });

      await this.api.start();

      logger.info({
        port: this.api.config.port,
        host: this.api.config.host
      }, 'Backend API server initialized');

      this.tracer.finishTrace(traceId);
    } catch (error) {
      this.errorCollector.recordError(error, { stage: 'api_init' });
      this.tracer.finishTrace(traceId);
      throw error;
    }
  }

  /**
   * Initialize WebSocket Server
   * @private
   */
  async _initializeWebSocket() {
    logger.info('Initializing WebSocket server...');

    const traceId = this.tracer.startTrace('websocket_init');

    try {
      // Получаем HTTP сервер из Fastify
      const httpServer = this.api.app.server;

      // Создаём WebSocket сервер
      this.wsServer = new WSServer(httpServer, {
        path: '/ws',
        heartbeatInterval: 30000,
        maxConnections: 10000,
        rateLimitPerMinute: 60
      });

      // Создаём менеджер обновлений игр
      this.gameUpdatesManager = new GameUpdatesManager(this.wsServer, this.db);
      this.gameUpdatesManager.start();

      logger.info({
        path: '/ws',
        maxConnections: 10000
      }, 'WebSocket server initialized');

      this.tracer.finishTrace(traceId);
    } catch (error) {
      this.errorCollector.recordError(error, { stage: 'websocket_init' });
      this.tracer.finishTrace(traceId);
      throw error;
    }
  }

  /**
   * Initialize Scheduled Jobs
   * @private
   */
  async _initializeScheduledJobs() {
    logger.info('Initializing scheduled jobs...');

    const traceId = this.tracer.startTrace('jobs_init');

    try {
      this.jobsManager = getJobsManager();

      // Start jobs if enabled in environment
      if (process.env.ENABLE_SCHEDULED_JOBS !== 'false') {
        this.jobsManager.start();
        logger.info('Scheduled jobs started');
      } else {
        logger.info('Scheduled jobs disabled via environment');
      }

      this.tracer.finishTrace(traceId);
    } catch (error) {
      this.errorCollector.recordError(error, { stage: 'jobs_init' });
      this.tracer.finishTrace(traceId);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  _setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
      }

      this.isShuttingDown = true;

      logger.info({ signal }, 'Received shutdown signal, gracefully shutting down...');

      const traceId = this.tracer.startTrace('shutdown');

      try {
        // Stop Prometheus collector
        if (this.prometheusCollector) {
          this.prometheusCollector.stop();
          logger.info('Prometheus collector stopped');
        }

        // Stop scheduled jobs
        if (this.jobsManager) {
          this.jobsManager.stop();
          logger.info('Scheduled jobs stopped');
        }

        // Stop game updates manager
        if (this.gameUpdatesManager) {
          this.gameUpdatesManager.stop();
          logger.info('Game updates manager stopped');
        }

        // Stop WebSocket server
        if (this.wsServer) {
          await this.wsServer.close();
          logger.info('WebSocket server stopped');
        }

        // Stop health monitoring
        this.healthMonitor.stop();
        logger.info('Health monitoring stopped');

        // Stop API server
        if (this.api) {
          await this.api.stop();
          logger.info('API server stopped');
        }

        // Close database connections
        await closeDatabase();
        logger.info('Database connections closed');

        // Close Redis connection
        await closeRedis();
        logger.info('Redis connection closed');

        // Clear old traces
        this.tracer.clearOldTraces(0); // Clear all
        logger.info('Traces cleared');

        this.tracer.finishTrace(traceId);

        logger.info('Graceful shutdown completed');

        process.exit(0);
      } catch (error) {
        logger.error({ error: error.message }, 'Error during shutdown');
        this.errorCollector.recordError(error, { stage: 'shutdown' });
        this.tracer.finishTrace(traceId);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
      this.errorCollector.recordError(error, { stage: 'uncaught' });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason }, 'Unhandled promise rejection');
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.errorCollector.recordError(error, { stage: 'unhandled_rejection' });
    });

    logger.info('Graceful shutdown handlers configured');
  }

  /**
   * Print startup banner
   * @private
   */
  _printBanner() {
    const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗  ██████╗ ██╗      ██████╗ ██╗                      ║
║   ██╔══██╗██╔═══██╗██║     ██╔════╝ ██║                      ║
║   ██████╔╝██║   ██║██║     ██║  ███╗██║                      ║
║   ██╔══██╗██║   ██║██║     ██║   ██║██║                      ║
║   ██║  ██║╚██████╔╝███████╗╚██████╔╝██║                      ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝                      ║
║                                                               ║
║        SStats Analytics Platform v6.0.0                       ║
║        Production-Ready Football Analytics                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

    console.log(banner);

    console.log('🚀 Server Information:');
    console.log(`   📍 API Server: http://${this.api.config.host}:${this.api.config.port}`);
    console.log(`   🔌 WebSocket: ws://${this.api.config.host}:${this.api.config.port}/ws`);
    console.log(`   📖 Swagger Docs: http://${this.api.config.host}:${this.api.config.port}/docs`);
    console.log(`   🏥 Health Check: http://${this.api.config.host}:${this.api.config.port}/health`);
    console.log(`   📊 Metrics: http://${this.api.config.host}:${this.api.config.port}/metrics`);
    console.log();
    console.log('🔧 Components:');
    console.log('   ✅ Pre-flight Checks');
    console.log('   ✅ Schema Lock (22 tables)');
    console.log('   ✅ Endpoint Lock (32 endpoints)');
    console.log('   ✅ UPSERT Keys (22 tables)');
    console.log('   ✅ Database Connection Pool');
    console.log(`   ${this.redis ? '✅' : '⚠️'} Redis Cache & Rate Limiting`);
    console.log('   ✅ SStats API Client');
    console.log('   ✅ Data Loader Pipeline (13 steps)');
    console.log('   ✅ Backend API (Fastify)');
    console.log('   ✅ JWT Authentication & Authorization');
    console.log('   ✅ WebSocket Server (Real-time)');
    console.log('   ✅ Game Updates Manager');
    console.log('   ✅ Monitoring & Tracing');
    console.log('   ✅ Health Checks');
    console.log(`   ${this.jobsManager && this.jobsManager.isRunning ? '✅' : '⏸️'} Scheduled Jobs`);
    console.log();
    console.log('📝 Environment:');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   LOG_LEVEL: ${process.env.LOG_LEVEL || 'info'}`);
    console.log(`   DB_HOST: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   DB_NAME: ${process.env.DB_NAME || 'rolgi_v6'}`);
    console.log(`   SCHEDULED_JOBS: ${process.env.ENABLE_SCHEDULED_JOBS !== 'false' ? 'enabled' : 'disabled'}`);
    console.log();
    console.log('✨ Server is ready to accept requests!\n');
  }

  /**
   * Start the server
   */
  async start() {
    const startTime = Date.now();
    const traceId = this.tracer.startTrace('server_start');

    try {
      // Step 1: Pre-flight checks
      await this._runPreflightChecks();

      // Step 2: Initialize database
      await this._initializeDatabase();

      // Step 3: Initialize Redis
      await this._initializeRedis();

      // Step 4: Setup health checks
      this._setupHealthChecks();

      // Step 5: Initialize API server
      await this._initializeApi();

      // Step 6: Initialize WebSocket server
      await this._initializeWebSocket();

      // Step 6.5: Start Prometheus metrics collector (DB + WS + business)
      this.prometheusCollector = new PrometheusCollector(this.db, this.wsServer);
      this.prometheusCollector.start();
      logger.info('Prometheus metrics collector started');

      // Step 7: Initialize scheduled jobs
      await this._initializeScheduledJobs();

      // Step 8: Setup graceful shutdown
      this._setupGracefulShutdown();

      // Step 9: Print banner
      this._printBanner();

      const duration = Date.now() - startTime;

      logger.info({
        duration,
        componentsInitialized: [
          'preflight',
          'database',
          'redis',
          'health_checks',
          'api',
          'websocket',
          'game_updates',
          'scheduled_jobs',
          'monitoring',
          'graceful_shutdown'
        ]
      }, 'Server started successfully');

      this.metricsCollector.recordHistogram('server_startup_duration_ms', duration);
      this.tracer.finishTrace(traceId);

    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack
      }, 'Failed to start server');

      this.errorCollector.recordError(error, { stage: 'server_start' });
      this.tracer.finishTrace(traceId);

      process.exit(1);
    }
  }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

if (require.main === module) {
  const server = new RolgiServer();
  
  server.start().catch((error) => {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
  });
}

module.exports = RolgiServer;
