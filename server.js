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
const BackendApi = require('./src/api/backend-api');
const { getHealthMonitor, getTracer, getErrorCollector, getMetricsCollector } = require('./src/monitoring/monitoring');
const { getJobsManager } = require('./src/jobs/scheduled-jobs');

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
   * Setup health checks
   * @private
   */
  _setupHealthChecks() {
    logger.info('Setting up health checks...');

    // Database health check
    this.healthMonitor.registerCheck('database', async () => {
      return await this.db.healthCheck();
    }, 30000); // Every 30 seconds

    // API health check
    this.healthMonitor.registerCheck('api', async () => {
      return this.api !== null;
    }, 60000); // Every 60 seconds

    // Memory health check
    this.healthMonitor.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      const heapTotalMB = usage.heapTotal / 1024 / 1024;
      const usagePercent = (heapUsedMB / heapTotalMB) * 100;

      if (usagePercent > 90) {
        throw new Error(`Memory usage critical: ${usagePercent.toFixed(2)}%`);
      }

      return {
        heapUsedMB: heapUsedMB.toFixed(2),
        heapTotalMB: heapTotalMB.toFixed(2),
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
        // Stop scheduled jobs
        if (this.jobsManager) {
          this.jobsManager.stop();
          logger.info('Scheduled jobs stopped');
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
    console.log('   ✅ SStats API Client');
    console.log('   ✅ Data Loader Pipeline (13 steps)');
    console.log('   ✅ Backend API (Fastify)');
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

      // Step 3: Setup health checks
      this._setupHealthChecks();

      // Step 4: Initialize API server
      await this._initializeApi();

      // Step 5: Initialize scheduled jobs
      await this._initializeScheduledJobs();

      // Step 6: Setup graceful shutdown
      this._setupGracefulShutdown();

      // Step 7: Print banner
      this._printBanner();

      const duration = Date.now() - startTime;

      logger.info({
        duration,
        componentsInitialized: [
          'preflight',
          'database',
          'health_checks',
          'api',
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
