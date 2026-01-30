/**
 * Prometheus Metrics Collector
 * 
 * @module monitoring/prometheus/collector
 * @description
 * Периодически собирает метрики из БД и других источников.
 */

const metrics = require('./metrics-registry');
const logger = require('../logger');

class PrometheusCollector {
  constructor(db) {
    this.db = db;
    this.interval = null;
    this.collectionInterval = 30000; // 30 seconds
  }

  /**
   * Start collecting metrics
   */
  start() {
    if (this.interval) {
      logger.warn('Prometheus collector already started');
      return;
    }

    logger.info('Starting Prometheus metrics collector', {
      interval: `${this.collectionInterval}ms`,
    });

    // Collect immediately
    this.collect();

    // Then collect periodically
    this.interval = setInterval(() => {
      this.collect();
    }, this.collectionInterval);
  }

  /**
   * Stop collecting metrics
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Prometheus metrics collector stopped');
    }
  }

  /**
   * Collect all metrics
   */
  async collect() {
    try {
      await Promise.all([
        this.collectDatabaseMetrics(),
        this.collectBusinessMetrics(),
        this.collectCacheMetrics(),
      ]);
    } catch (error) {
      logger.error('Failed to collect Prometheus metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Collect database pool metrics
   */
  async collectDatabaseMetrics() {
    try {
      if (!this.db) return;

      const poolStats = this.db.getPoolStats();

      if (poolStats) {
        metrics.dbPoolConnections.set({ state: 'total' }, poolStats.total || 0);
        metrics.dbPoolConnections.set({ state: 'idle' }, poolStats.idle || 0);
        metrics.dbPoolConnections.set(
          { state: 'active' },
          (poolStats.total || 0) - (poolStats.idle || 0)
        );
        metrics.dbPoolConnections.set(
          { state: 'waiting' },
          poolStats.waiting || 0
        );
      }
    } catch (error) {
      logger.error('Failed to collect database metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Collect business metrics (games, teams, players counts)
   */
  async collectBusinessMetrics() {
    try {
      if (!this.db) return;

      // Count games by status
      const gamesQuery = `
        SELECT 
          status,
          COUNT(*) as count
        FROM games
        GROUP BY status
      `;
      const gamesResult = await this.db.query(gamesQuery);
      
      gamesResult.rows.forEach((row) => {
        metrics.gamesTotal.set({ status: row.status || 'unknown' }, row.count);
      });

      // Count total teams
      const teamsQuery = 'SELECT COUNT(*) as count FROM teams';
      const teamsResult = await this.db.query(teamsQuery);
      if (teamsResult.rows[0]) {
        metrics.teamsTotal.set(teamsResult.rows[0].count);
      }

      // Count total players
      const playersQuery = 'SELECT COUNT(*) as count FROM players';
      const playersResult = await this.db.query(playersQuery);
      if (playersResult.rows[0]) {
        metrics.playersTotal.set(playersResult.rows[0].count);
      }
    } catch (error) {
      logger.error('Failed to collect business metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Collect cache metrics (if Redis available)
   */
  async collectCacheMetrics() {
    try {
      // This will be integrated with Redis cache module
      // For now, we just log that it's called
      // In production, get cache stats from Redis
    } catch (error) {
      logger.error('Failed to collect cache metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Record database query metrics
   */
  recordDbQuery(operation, table, duration, status = 'success') {
    const durationSeconds = duration / 1000;
    
    metrics.dbQueryDuration.observe(
      { operation, table, status },
      durationSeconds
    );
    
    metrics.dbQueryTotal.inc({ operation, table, status });
  }

  /**
   * Record database error
   */
  recordDbError(operation, errorType) {
    metrics.dbErrorsTotal.inc({ operation, error_type: errorType });
  }

  /**
   * Record cache hit
   */
  recordCacheHit(cacheKey) {
    metrics.cacheHitsTotal.inc({ cache_key: cacheKey });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(cacheKey) {
    metrics.cacheMissesTotal.inc({ cache_key: cacheKey });
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(operation, duration, status = 'success') {
    const durationSeconds = duration / 1000;
    metrics.cacheOperationDuration.observe(
      { operation, status },
      durationSeconds
    );
  }

  /**
   * Record WebSocket connection
   */
  recordWsConnection(channel, delta = 1) {
    if (delta > 0) {
      metrics.wsConnections.inc({ channel }, delta);
    } else {
      metrics.wsConnections.dec({ channel }, Math.abs(delta));
    }
  }

  /**
   * Record WebSocket message
   */
  recordWsMessage(direction, channel, type, size) {
    metrics.wsMessagesTotal.inc({ direction, channel, type });
    
    if (size) {
      metrics.wsMessageSize.observe({ direction, channel }, size);
    }
  }

  /**
   * Record WebSocket error
   */
  recordWsError(errorType) {
    metrics.wsErrorsTotal.inc({ error_type: errorType });
  }

  /**
   * Record auth login attempt
   */
  recordLoginAttempt(status, role) {
    metrics.authLoginAttempts.inc({ status, role });
  }

  /**
   * Record auth token operation
   */
  recordTokenOperation(operation, status = 'success') {
    metrics.authTokenOperations.inc({ operation, status });
  }

  /**
   * Update active sessions count
   */
  updateActiveSessions(role, count) {
    metrics.authActiveSessions.set({ role }, count);
  }

  /**
   * Record alert sent
   */
  recordAlertSent(channel, severity, type) {
    metrics.alertsSentTotal.inc({ channel, severity, type });
  }

  /**
   * Record alert failed
   */
  recordAlertFailed(channel, severity, type) {
    metrics.alertsFailedTotal.inc({ channel, severity, type });
  }

  /**
   * Update alert history size
   */
  updateAlertHistorySize(size) {
    metrics.alertHistorySize.set(size);
  }

  /**
   * Record rate limit hit (blocked request)
   */
  recordRateLimitHit(limitType, identifier) {
    metrics.rateLimitHitsTotal.inc({ limit_type: limitType, identifier });
  }

  /**
   * Record rate limit check
   */
  recordRateLimitCheck(limitType, status) {
    metrics.rateLimitRequestsTotal.inc({ limit_type: limitType, status });
  }

  /**
   * Record loader session
   */
  recordLoaderSession(entityType, duration, status, recordsInserted = 0, recordsUpdated = 0, recordsSkipped = 0) {
    const durationSeconds = duration / 1000;
    
    metrics.loaderSessionsTotal.inc({ entity_type: entityType, status });
    metrics.loaderDuration.observe({ entity_type: entityType, status }, durationSeconds);
    
    if (recordsInserted > 0) {
      metrics.loaderRecordsTotal.inc(
        { entity_type: entityType, operation: 'inserted' },
        recordsInserted
      );
    }
    
    if (recordsUpdated > 0) {
      metrics.loaderRecordsTotal.inc(
        { entity_type: entityType, operation: 'updated' },
        recordsUpdated
      );
    }
    
    if (recordsSkipped > 0) {
      metrics.loaderRecordsTotal.inc(
        { entity_type: entityType, operation: 'skipped' },
        recordsSkipped
      );
    }
  }
}

module.exports = PrometheusCollector;
