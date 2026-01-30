/**
 * Prometheus Metrics Registry
 * 
 * @module monitoring/prometheus/metrics-registry
 * @description
 * Централизованный registry для всех Prometheus метрик.
 * Поддержка custom метрик для API, DB, Cache, WebSocket, Auth и т.д.
 */

const client = require('prom-client');
const logger = require('../logger');

// Create registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'rolgi_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ============================================================================
// HTTP METRICS
// ============================================================================

/**
 * HTTP Request Duration Histogram
 */
const httpRequestDuration = new client.Histogram({
  name: 'rolgi_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * HTTP Request Counter
 */
const httpRequestTotal = new client.Counter({
  name: 'rolgi_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * HTTP Request Size Histogram
 */
const httpRequestSize = new client.Histogram({
  name: 'rolgi_http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

/**
 * HTTP Response Size Histogram
 */
const httpResponseSize = new client.Histogram({
  name: 'rolgi_http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

// ============================================================================
// DATABASE METRICS
// ============================================================================

/**
 * Database Query Duration Histogram
 */
const dbQueryDuration = new client.Histogram({
  name: 'rolgi_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * Database Query Counter
 */
const dbQueryTotal = new client.Counter({
  name: 'rolgi_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register],
});

/**
 * Database Connection Pool Gauge
 */
const dbPoolConnections = new client.Gauge({
  name: 'rolgi_db_pool_connections',
  help: 'Number of database pool connections',
  labelNames: ['state'], // 'total', 'idle', 'active', 'waiting'
  registers: [register],
});

/**
 * Database Errors Counter
 */
const dbErrorsTotal = new client.Counter({
  name: 'rolgi_db_errors_total',
  help: 'Total number of database errors',
  labelNames: ['operation', 'error_type'],
  registers: [register],
});

// ============================================================================
// CACHE METRICS (Redis)
// ============================================================================

/**
 * Cache Hit Counter
 */
const cacheHitsTotal = new client.Counter({
  name: 'rolgi_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_key'],
  registers: [register],
});

/**
 * Cache Miss Counter
 */
const cacheMissesTotal = new client.Counter({
  name: 'rolgi_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_key'],
  registers: [register],
});

/**
 * Cache Operation Duration Histogram
 */
const cacheOperationDuration = new client.Histogram({
  name: 'rolgi_cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

/**
 * Cache Size Gauge
 */
const cacheSize = new client.Gauge({
  name: 'rolgi_cache_size_bytes',
  help: 'Size of cache in bytes',
  registers: [register],
});

/**
 * Cache Keys Gauge
 */
const cacheKeys = new client.Gauge({
  name: 'rolgi_cache_keys_total',
  help: 'Total number of keys in cache',
  registers: [register],
});

// ============================================================================
// WEBSOCKET METRICS
// ============================================================================

/**
 * WebSocket Connections Gauge
 */
const wsConnections = new client.Gauge({
  name: 'rolgi_websocket_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['channel'],
  registers: [register],
});

/**
 * WebSocket Messages Counter
 */
const wsMessagesTotal = new client.Counter({
  name: 'rolgi_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'channel', 'type'], // direction: 'sent' | 'received'
  registers: [register],
});

/**
 * WebSocket Message Size Histogram
 */
const wsMessageSize = new client.Histogram({
  name: 'rolgi_websocket_message_size_bytes',
  help: 'Size of WebSocket messages in bytes',
  labelNames: ['direction', 'channel'],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
  registers: [register],
});

/**
 * WebSocket Errors Counter
 */
const wsErrorsTotal = new client.Counter({
  name: 'rolgi_websocket_errors_total',
  help: 'Total number of WebSocket errors',
  labelNames: ['error_type'],
  registers: [register],
});

// ============================================================================
// AUTHENTICATION METRICS
// ============================================================================

/**
 * Auth Login Attempts Counter
 */
const authLoginAttempts = new client.Counter({
  name: 'rolgi_auth_login_attempts_total',
  help: 'Total number of login attempts',
  labelNames: ['status', 'role'], // status: 'success' | 'failure'
  registers: [register],
});

/**
 * Auth Token Operations Counter
 */
const authTokenOperations = new client.Counter({
  name: 'rolgi_auth_token_operations_total',
  help: 'Total number of token operations',
  labelNames: ['operation', 'status'], // operation: 'issue' | 'refresh' | 'revoke'
  registers: [register],
});

/**
 * Active Sessions Gauge
 */
const authActiveSessions = new client.Gauge({
  name: 'rolgi_auth_active_sessions',
  help: 'Number of active user sessions',
  labelNames: ['role'],
  registers: [register],
});

// ============================================================================
// ALERTING METRICS
// ============================================================================

/**
 * Alerts Sent Counter
 */
const alertsSentTotal = new client.Counter({
  name: 'rolgi_alerts_sent_total',
  help: 'Total number of alerts sent',
  labelNames: ['channel', 'severity', 'type'],
  registers: [register],
});

/**
 * Alerts Failed Counter
 */
const alertsFailedTotal = new client.Counter({
  name: 'rolgi_alerts_failed_total',
  help: 'Total number of failed alerts',
  labelNames: ['channel', 'severity', 'type'],
  registers: [register],
});

/**
 * Alert History Size Gauge
 */
const alertHistorySize = new client.Gauge({
  name: 'rolgi_alert_history_size',
  help: 'Number of alerts in history',
  registers: [register],
});

// ============================================================================
// RATE LIMITING METRICS
// ============================================================================

/**
 * Rate Limit Hits Counter
 */
const rateLimitHitsTotal = new client.Counter({
  name: 'rolgi_rate_limit_hits_total',
  help: 'Total number of rate limit hits (requests blocked)',
  labelNames: ['limit_type', 'identifier'],
  registers: [register],
});

/**
 * Rate Limit Requests Counter
 */
const rateLimitRequestsTotal = new client.Counter({
  name: 'rolgi_rate_limit_requests_total',
  help: 'Total number of requests checked for rate limiting',
  labelNames: ['limit_type', 'status'], // status: 'allowed' | 'blocked'
  registers: [register],
});

// ============================================================================
// DATA LOADER METRICS
// ============================================================================

/**
 * Loader Sessions Counter
 */
const loaderSessionsTotal = new client.Counter({
  name: 'rolgi_loader_sessions_total',
  help: 'Total number of loader sessions',
  labelNames: ['entity_type', 'status'], // status: 'success' | 'failure'
  registers: [register],
});

/**
 * Loader Duration Histogram
 */
const loaderDuration = new client.Histogram({
  name: 'rolgi_loader_duration_seconds',
  help: 'Duration of loader sessions in seconds',
  labelNames: ['entity_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

/**
 * Loader Records Counter
 */
const loaderRecordsTotal = new client.Counter({
  name: 'rolgi_loader_records_total',
  help: 'Total number of records loaded',
  labelNames: ['entity_type', 'operation'], // operation: 'inserted' | 'updated' | 'skipped'
  registers: [register],
});

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/**
 * Games Total Gauge
 */
const gamesTotal = new client.Gauge({
  name: 'rolgi_games_total',
  help: 'Total number of games in database',
  labelNames: ['status'], // 'scheduled', 'live', 'finished'
  registers: [register],
});

/**
 * Teams Total Gauge
 */
const teamsTotal = new client.Gauge({
  name: 'rolgi_teams_total',
  help: 'Total number of teams in database',
  registers: [register],
});

/**
 * Players Total Gauge
 */
const playersTotal = new client.Gauge({
  name: 'rolgi_players_total',
  help: 'Total number of players in database',
  registers: [register],
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  register,
  
  // HTTP
  httpRequestDuration,
  httpRequestTotal,
  httpRequestSize,
  httpResponseSize,
  
  // Database
  dbQueryDuration,
  dbQueryTotal,
  dbPoolConnections,
  dbErrorsTotal,
  
  // Cache
  cacheHitsTotal,
  cacheMissesTotal,
  cacheOperationDuration,
  cacheSize,
  cacheKeys,
  
  // WebSocket
  wsConnections,
  wsMessagesTotal,
  wsMessageSize,
  wsErrorsTotal,
  
  // Authentication
  authLoginAttempts,
  authTokenOperations,
  authActiveSessions,
  
  // Alerting
  alertsSentTotal,
  alertsFailedTotal,
  alertHistorySize,
  
  // Rate Limiting
  rateLimitHitsTotal,
  rateLimitRequestsTotal,
  
  // Data Loader
  loaderSessionsTotal,
  loaderDuration,
  loaderRecordsTotal,
  
  // Business
  gamesTotal,
  teamsTotal,
  playersTotal,
};
