const logger = require("./logger");
/**
 * Monitoring & Tracing System v6.0.0
 * 
 * Система мониторинга и трейсинга для Rolgi Platform
 * 
 * Возможности:
 * - Distributed tracing с trace ID и span ID
 * - Метрики производительности (latency, throughput)
 * - Error tracking и aggregation
 * - Health checks всех компонентов
 * - Performance profiling
 * - Alert notifications
 * - Metrics export (Prometheus format)
 * 
 * @module monitoring
 */

const { v4: uuidv4 } = require('uuid');

const logger = pino({
  name: 'monitoring',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * @typedef {Object} Span
 * @property {string} spanId - Unique span ID
 * @property {string} traceId - Parent trace ID
 * @property {string} operation - Operation name
 * @property {Date} startTime - Start time
 * @property {Date} endTime - End time
 * @property {number} duration - Duration in ms
 * @property {Object} tags - Custom tags
 * @property {Error} error - Error if failed
 */

/**
 * @typedef {Object} Trace
 * @property {string} traceId - Unique trace ID
 * @property {string} operation - Top-level operation
 * @property {Date} startTime - Start time
 * @property {Date} endTime - End time
 * @property {number} duration - Total duration
 * @property {Array<Span>} spans - Child spans
 * @property {Object} metadata - Additional metadata
 */

/**
 * Tracer for distributed tracing
 */
class Tracer {
  constructor() {
    this.traces = new Map();
    this.activeSpans = new Map();
    
    logger.info('Tracer initialized');
  }

  /**
   * Start a new trace
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional metadata
   * @returns {string} traceId
   */
  startTrace(operation, metadata = {}) {
    const traceId = uuidv4();
    
    const trace = {
      traceId,
      operation,
      startTime: new Date(),
      endTime: null,
      duration: null,
      spans: [],
      metadata
    };

    this.traces.set(traceId, trace);

    logger.debug({ traceId, operation }, 'Trace started');

    return traceId;
  }

  /**
   * Start a span within a trace
   * @param {string} traceId - Parent trace ID
   * @param {string} operation - Span operation
   * @param {Object} tags - Custom tags
   * @returns {string} spanId
   */
  startSpan(traceId, operation, tags = {}) {
    const trace = this.traces.get(traceId);
    
    if (!trace) {
      logger.warn({ traceId }, 'Trace not found for span');
      return null;
    }

    const spanId = uuidv4();

    const span = {
      spanId,
      traceId,
      operation,
      startTime: new Date(),
      endTime: null,
      duration: null,
      tags,
      error: null
    };

    this.activeSpans.set(spanId, span);

    logger.debug({ traceId, spanId, operation }, 'Span started');

    return spanId;
  }

  /**
   * Finish a span
   * @param {string} spanId
   * @param {Object} tags - Additional tags
   * @param {Error} error - Error if failed
   */
  finishSpan(spanId, tags = {}, error = null) {
    const span = this.activeSpans.get(spanId);

    if (!span) {
      logger.warn({ spanId }, 'Span not found');
      return;
    }

    span.endTime = new Date();
    span.duration = span.endTime - span.startTime;
    span.tags = { ...span.tags, ...tags };
    span.error = error;

    // Add span to trace
    const trace = this.traces.get(span.traceId);
    if (trace) {
      trace.spans.push(span);
    }

    this.activeSpans.delete(spanId);

    logger.debug({
      spanId,
      traceId: span.traceId,
      operation: span.operation,
      duration: span.duration,
      error: error?.message
    }, 'Span finished');
  }

  /**
   * Finish a trace
   * @param {string} traceId
   */
  finishTrace(traceId) {
    const trace = this.traces.get(traceId);

    if (!trace) {
      logger.warn({ traceId }, 'Trace not found');
      return;
    }

    trace.endTime = new Date();
    trace.duration = trace.endTime - trace.startTime;

    logger.debug({
      traceId,
      operation: trace.operation,
      duration: trace.duration,
      spansCount: trace.spans.length
    }, 'Trace finished');
  }

  /**
   * Get trace by ID
   * @param {string} traceId
   * @returns {Trace}
   */
  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  /**
   * Get all traces
   * @returns {Array<Trace>}
   */
  getAllTraces() {
    return Array.from(this.traces.values());
  }

  /**
   * Clear old traces (older than retention period)
   * @param {number} retentionMs - Retention period in ms
   */
  clearOldTraces(retentionMs = 3600000) {
    const now = Date.now();
    let cleared = 0;

    for (const [traceId, trace] of this.traces.entries()) {
      if (trace.endTime && (now - trace.endTime.getTime()) > retentionMs) {
        this.traces.delete(traceId);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info({ cleared }, 'Old traces cleared');
    }
  }
}

/**
 * Error Collector for tracking errors
 */
class ErrorCollector {
  constructor() {
    this.errors = [];
    this.errorStats = new Map();
    
    logger.info('ErrorCollector initialized');
  }

  /**
   * Record an error
   * @param {Error} error
   * @param {Object} context - Error context
   */
  recordError(error, context = {}) {
    const errorRecord = {
      id: uuidv4(),
      message: error.message,
      stack: error.stack,
      code: error.code,
      context,
      timestamp: new Date()
    };

    this.errors.push(errorRecord);

    // Update error stats
    const errorType = error.code || error.constructor.name;
    const count = this.errorStats.get(errorType) || 0;
    this.errorStats.set(errorType, count + 1);

    // Keep only last 1000 errors
    if (this.errors.length > 1000) {
      this.errors.shift();
    }

    logger.error({
      errorId: errorRecord.id,
      message: error.message,
      code: error.code,
      context
    }, 'Error recorded');
  }

  /**
   * Get recent errors
   * @param {number} limit - Max errors to return
   * @returns {Array}
   */
  getRecentErrors(limit = 50) {
    return this.errors.slice(-limit);
  }

  /**
   * Get error statistics
   * @returns {Object}
   */
  getErrorStats() {
    return {
      totalErrors: this.errors.length,
      errorsByType: Object.fromEntries(this.errorStats),
      recentErrors: this.getRecentErrors(10)
    };
  }

  /**
   * Clear errors
   */
  clearErrors() {
    this.errors = [];
    this.errorStats.clear();
    logger.info('Errors cleared');
  }
}

/**
 * Metrics Collector
 */
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    
    logger.info('MetricsCollector initialized');
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} value - Increment value
   * @param {Object} labels - Labels
   */
  incrementCounter(name, value = 1, labels = {}) {
    const key = this._buildKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Record a histogram value
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {Object} labels - Labels
   */
  recordHistogram(name, value, labels = {}) {
    const key = this._buildKey(name, labels);
    const histogram = this.histograms.get(key) || [];
    histogram.push({ value, timestamp: Date.now() });

    // Keep only last 1000 values
    if (histogram.length > 1000) {
      histogram.shift();
    }

    this.histograms.set(key, histogram);
  }

  /**
   * Build metric key with labels
   * @private
   */
  _buildKey(name, labels) {
    const labelsStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return labelsStr ? `${name}{${labelsStr}}` : name;
  }

  /**
   * Get counter value
   * @param {string} name
   * @param {Object} labels
   * @returns {number}
   */
  getCounter(name, labels = {}) {
    const key = this._buildKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get histogram stats
   * @param {string} name
   * @param {Object} labels
   * @returns {Object}
   */
  getHistogramStats(name, labels = {}) {
    const key = this._buildKey(name, labels);
    const histogram = this.histograms.get(key) || [];

    if (histogram.length === 0) {
      return null;
    }

    const values = histogram.map(h => h.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    return {
      count,
      sum,
      avg: sum / count,
      min: values[0],
      max: values[count - 1],
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)]
    };
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string}
   */
  exportPrometheus() {
    const lines = [];

    // Export counters
    for (const [key, value] of this.counters.entries()) {
      lines.push(`${key} ${value}`);
    }

    // Export histograms
    for (const [key, histogram] of this.histograms.entries()) {
      const stats = this.getHistogramStats(key.split('{')[0], {});
      if (stats) {
        lines.push(`${key}_sum ${stats.sum}`);
        lines.push(`${key}_count ${stats.count}`);
        lines.push(`${key}_avg ${stats.avg}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics
   * @returns {Object}
   */
  getAllMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          this.getHistogramStats(key.split('{')[0], {})
        ])
      )
    };
  }
}

/**
 * Health Monitor
 */
class HealthMonitor {
  constructor() {
    this.checks = new Map();
    this.lastCheckResults = new Map();
    
    logger.info('HealthMonitor initialized');
  }

  /**
   * Register a health check
   * @param {string} name - Check name
   * @param {Function} checkFn - Check function (async)
   * @param {number} interval - Check interval in ms
   */
  registerCheck(name, checkFn, interval = 60000) {
    this.checks.set(name, {
      name,
      checkFn,
      interval,
      lastCheck: null,
      intervalId: null
    });

    logger.info({ name, interval }, 'Health check registered');
  }

  /**
   * Start monitoring
   */
  start() {
    for (const [name, check] of this.checks.entries()) {
      // Run initial check
      this._runCheck(name);

      // Schedule periodic checks
      check.intervalId = setInterval(() => {
        this._runCheck(name);
      }, check.interval);
    }

    logger.info('Health monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    for (const check of this.checks.values()) {
      if (check.intervalId) {
        clearInterval(check.intervalId);
      }
    }

    logger.info('Health monitoring stopped');
  }

  /**
   * Run a specific check
   * @private
   */
  async _runCheck(name) {
    const check = this.checks.get(name);

    if (!check) {
      return;
    }

    const startTime = Date.now();

    try {
      const result = await check.checkFn();
      const duration = Date.now() - startTime;

      this.lastCheckResults.set(name, {
        name,
        healthy: true,
        result,
        duration,
        timestamp: new Date(),
        error: null
      });

      logger.debug({ name, duration }, 'Health check passed');
    } catch (error) {
      const duration = Date.now() - startTime;

      this.lastCheckResults.set(name, {
        name,
        healthy: false,
        result: null,
        duration,
        timestamp: new Date(),
        error: error.message
      });

      logger.error({ name, error: error.message }, 'Health check failed');
    }

    check.lastCheck = new Date();
  }

  /**
   * Get health status
   * @returns {Object}
   */
  getHealthStatus() {
    const results = Array.from(this.lastCheckResults.values());
    const allHealthy = results.every(r => r.healthy);

    return {
      healthy: allHealthy,
      checks: results
    };
  }
}

// ============================================================
// SINGLETON INSTANCES
// ============================================================

const tracer = new Tracer();
const errorCollector = new ErrorCollector();
const metricsCollector = new MetricsCollector();
const healthMonitor = new HealthMonitor();

/**
 * Get global tracer instance
 * @returns {Tracer}
 */
function getTracer() {
  return tracer;
}

/**
 * Get global error collector
 * @returns {ErrorCollector}
 */
function getErrorCollector() {
  return errorCollector;
}

/**
 * Get global metrics collector
 * @returns {MetricsCollector}
 */
function getMetricsCollector() {
  return metricsCollector;
}

/**
 * Get global health monitor
 * @returns {HealthMonitor}
 */
function getHealthMonitor() {
  return healthMonitor;
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'test':
      console.log('Testing Monitoring System...\n');

      // Test trace
      const traceId = tracer.startTrace('test_operation', { user: 'test' });
      const spanId = tracer.startSpan(traceId, 'test_span', { tag: 'value' });
      
      setTimeout(() => {
        tracer.finishSpan(spanId);
        tracer.finishTrace(traceId);

        console.log('Trace:');
        console.log(JSON.stringify(tracer.getTrace(traceId), null, 2));
      }, 100);

      // Test error
      setTimeout(() => {
        errorCollector.recordError(new Error('Test error'), { context: 'test' });
        console.log('\nError Stats:');
        console.log(JSON.stringify(errorCollector.getErrorStats(), null, 2));
      }, 200);

      // Test metrics
      setTimeout(() => {
        metricsCollector.incrementCounter('test_counter', 1, { label: 'value' });
        metricsCollector.recordHistogram('test_histogram', 100, { label: 'value' });
        
        console.log('\nMetrics:');
        console.log(JSON.stringify(metricsCollector.getAllMetrics(), null, 2));
      }, 300);

      break;

    default:
      console.log(`
Monitoring & Tracing System v6.0.0

Usage:
  node monitoring.js test    # Test monitoring components
      `);
  }
}

module.exports = {
  Tracer,
  ErrorCollector,
  MetricsCollector,
  HealthMonitor,
  getTracer,
  getErrorCollector,
  getMetricsCollector,
  getHealthMonitor
};
