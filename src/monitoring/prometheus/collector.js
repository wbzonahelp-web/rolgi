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
  constructor(db, wsServer = null) {
    this.db = db;
    this.wsServer = wsServer;
    this.interval = null;
    this.collectionInterval = 30000; // 30 seconds
  }

  /**
   * Inject WebSocket server reference (если он создаётся после collector)
   */
  setWsServer(wsServer) {
    this.wsServer = wsServer;
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
        this.collectWebSocketMetrics(),
        this.collectAuthMetrics(),
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
        // Поддерживаем оба формата ключей (total/totalCount, idle/idleCount, waiting/waitingCount)
        const total   = poolStats.totalCount   ?? poolStats.total   ?? 0;
        const idle    = poolStats.idleCount    ?? poolStats.idle    ?? 0;
        const waiting = poolStats.waitingCount ?? poolStats.waiting ?? 0;
        metrics.dbPoolConnections.set({ state: 'total' },   total);
        metrics.dbPoolConnections.set({ state: 'idle' },    idle);
        metrics.dbPoolConnections.set({ state: 'active' },  Math.max(0, total - idle));
        metrics.dbPoolConnections.set({ state: 'waiting' }, waiting);
      }
    } catch (error) {
      logger.error({ err: error.message, stack: error.stack }, 'Failed to collect database metrics');
    }
  }

  /**
   * Collect business metrics (games, teams, players counts)
   */
  async collectBusinessMetrics() {
    try {
      if (!this.db) return;

      // Games by status (status is varchar)
      const gamesResult = await this.db.query(
        "SELECT status, COUNT(*)::bigint AS count FROM games GROUP BY status"
      );
      for (const row of gamesResult.rows) {
        const status = String(row.status || 'unknown');
        const count = parseInt(row.count, 10) || 0;
        try {
          metrics.gamesTotal.set({ status }, count);
        } catch (e) {
          logger.error({ err: e.message, status, count }, 'gamesTotal.set failed');
        }
      }

      // Total teams
      const teamsResult = await this.db.query('SELECT COUNT(*)::bigint AS count FROM teams');
      const teamsCount = parseInt(teamsResult.rows[0]?.count, 10) || 0;
      metrics.teamsTotal.set(teamsCount);

      // Total players
      const playersResult = await this.db.query('SELECT COUNT(*)::bigint AS count FROM players');
      const playersCount = parseInt(playersResult.rows[0]?.count, 10) || 0;
      metrics.playersTotal.set(playersCount);

      logger.info({ teamsCount, playersCount, gameStatuses: gamesResult.rows.length }, 'Business metrics collected');
    } catch (error) {
      logger.error({ err: error.message, stack: error.stack }, 'Failed to collect business metrics');
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
   * Collect WebSocket metrics (active connections, channels)
   */
  async collectWebSocketMetrics() {
    try {
      if (!this.wsServer) return;
      const stats = this.wsServer.stats || {};
      const channelsSize = this.wsServer.channels ? this.wsServer.channels.size : 0;
      // Активные соединения (общая метка)
      metrics.wsConnections.set({ channel: '_all' }, stats.connectionsActive || 0);
      // Каналы (количество подписок-наборов)
      if (metrics.wsConnections) {
        metrics.wsConnections.set({ channel: '_channels' }, channelsSize);
      }
    } catch (error) {
      logger.error('Failed to collect websocket metrics', { error: error.message });
    }
  }

  /**
   * Collect auth metrics (active sessions, recent logins)
   */
  async collectAuthMetrics() {
    try {
      if (!this.db) return;
      const result = await this.db.query(`
        SELECT COALESCE(role::text, 'unknown') AS role, COUNT(*)::bigint AS cnt
        FROM users
        WHERE last_login_at > NOW() - INTERVAL '24 hours'
        GROUP BY role
      `);
      let total = 0;
      for (const row of result.rows) {
        const role = String(row.role || 'unknown');
        const cnt = parseInt(row.cnt, 10) || 0;
        total += cnt;
        try {
          metrics.authActiveSessions.set({ role }, cnt);
        } catch (e) {
          logger.error({ err: e.message, role, cnt }, 'authActiveSessions.set failed');
        }
      }
      // Если ни одного активного — выставим 0 для роли 'none', чтобы метрика появилась
      if (result.rows.length === 0) {
        try { metrics.authActiveSessions.set({ role: 'none' }, 0); } catch (_) {}
      }
      logger.info({ totalActive: total, roles: result.rows.length }, 'Auth metrics collected');
    } catch (error) {
      logger.error({ err: error.message, stack: error.stack }, 'Failed to collect auth metrics');
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
