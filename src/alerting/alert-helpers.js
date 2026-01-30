/**
 * Alert Helpers
 * 
 * @module alerting/alert-helpers
 * @description
 * Helper функции для быстрой отправки типовых алертов.
 */

const { getAlertManager, SEVERITY, ALERT_TYPES } = require('./alert-manager');

/**
 * Алерт о критической ошибке
 */
async function alertCriticalError(title, message, metadata = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title,
    message,
    severity: SEVERITY.CRITICAL,
    type: ALERT_TYPES.SYSTEM,
    metadata,
    channels: ['email', 'slack', 'webhook']
  });
}

/**
 * Алерт об ошибке базы данных
 */
async function alertDatabaseError(error, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Database Error',
    message: `Database error occurred: ${error.message}`,
    severity: SEVERITY.ERROR,
    type: ALERT_TYPES.DATABASE,
    metadata: {
      error: error.message,
      stack: error.stack,
      ...context
    },
    channels: ['email', 'slack']
  });
}

/**
 * Алерт об ошибке API
 */
async function alertApiError(endpoint, statusCode, error, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'API Error',
    message: `API endpoint ${endpoint} failed with status ${statusCode}`,
    severity: statusCode >= 500 ? SEVERITY.ERROR : SEVERITY.WARNING,
    type: ALERT_TYPES.API,
    metadata: {
      endpoint,
      statusCode,
      error: error.message,
      ...context
    },
    channels: ['slack', 'webhook']
  });
}

/**
 * Алерт о провале Data Loader
 */
async function alertLoaderFailure(entityType, error, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Data Loader Failure',
    message: `Failed to load ${entityType}: ${error.message}`,
    severity: SEVERITY.ERROR,
    type: ALERT_TYPES.LOADER,
    metadata: {
      entityType,
      error: error.message,
      stack: error.stack,
      ...context
    },
    channels: ['email', 'slack']
  });
}

/**
 * Алерт о превышении rate limit
 */
async function alertRateLimitExceeded(identifier, limitType, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Rate Limit Exceeded',
    message: `Rate limit exceeded for ${identifier} (type: ${limitType})`,
    severity: SEVERITY.WARNING,
    type: ALERT_TYPES.RATE_LIMIT,
    metadata: {
      identifier,
      limitType,
      ...context
    },
    channels: ['slack']
  });
}

/**
 * Алерт о проблемах с кэшем
 */
async function alertCacheIssue(issue, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Cache Issue',
    message: `Cache issue detected: ${issue}`,
    severity: SEVERITY.WARNING,
    type: ALERT_TYPES.CACHE,
    metadata: context,
    channels: ['slack']
  });
}

/**
 * Алерт о проблемах безопасности
 */
async function alertSecurityIssue(title, message, metadata = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: `Security Alert: ${title}`,
    message,
    severity: SEVERITY.CRITICAL,
    type: ALERT_TYPES.SECURITY,
    metadata,
    channels: ['email', 'slack', 'webhook']
  });
}

/**
 * Алерт о высокой нагрузке
 */
async function alertHighLoad(metric, value, threshold, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'High Load Alert',
    message: `${metric} is ${value}, exceeding threshold of ${threshold}`,
    severity: SEVERITY.WARNING,
    type: ALERT_TYPES.SYSTEM,
    metadata: {
      metric,
      value,
      threshold,
      ...context
    },
    channels: ['slack']
  });
}

/**
 * Алерт об успешном деплое
 */
async function alertDeploymentSuccess(version, environment, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Deployment Successful',
    message: `Successfully deployed version ${version} to ${environment}`,
    severity: SEVERITY.INFO,
    type: ALERT_TYPES.SYSTEM,
    metadata: {
      version,
      environment,
      ...context
    },
    channels: ['slack']
  });
}

/**
 * Алерт о провале деплоя
 */
async function alertDeploymentFailure(version, environment, error, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Deployment Failed',
    message: `Failed to deploy version ${version} to ${environment}: ${error.message}`,
    severity: SEVERITY.CRITICAL,
    type: ALERT_TYPES.SYSTEM,
    metadata: {
      version,
      environment,
      error: error.message,
      ...context
    },
    channels: ['email', 'slack']
  });
}

/**
 * Алерт о восстановлении сервиса
 */
async function alertServiceRecovered(service, downtime, context = {}) {
  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Service Recovered',
    message: `Service ${service} has recovered after ${downtime}ms downtime`,
    severity: SEVERITY.INFO,
    type: ALERT_TYPES.SYSTEM,
    metadata: {
      service,
      downtime,
      ...context
    },
    channels: ['slack']
  });
}

/**
 * Batch alert - отправка нескольких алертов
 */
async function sendBatchAlerts(alerts) {
  const alertManager = getAlertManager();
  const results = [];

  for (const alert of alerts) {
    try {
      const result = await alertManager.send(alert);
      results.push({ success: true, alert, result });
    } catch (error) {
      results.push({ success: false, alert, error: error.message });
    }
  }

  return results;
}

/**
 * Scheduled health check alert
 */
async function alertHealthCheckFailed(checks, context = {}) {
  const failedChecks = checks.filter(c => !c.healthy);
  
  if (failedChecks.length === 0) {
    return null;
  }

  const alertManager = getAlertManager();
  return await alertManager.send({
    title: 'Health Check Failed',
    message: `${failedChecks.length} health check(s) failed: ${failedChecks.map(c => c.name).join(', ')}`,
    severity: SEVERITY.ERROR,
    type: ALERT_TYPES.SYSTEM,
    metadata: {
      failedChecks: failedChecks.map(c => ({
        name: c.name,
        error: c.error
      })),
      totalChecks: checks.length,
      ...context
    },
    channels: ['email', 'slack']
  });
}

module.exports = {
  alertCriticalError,
  alertDatabaseError,
  alertApiError,
  alertLoaderFailure,
  alertRateLimitExceeded,
  alertCacheIssue,
  alertSecurityIssue,
  alertHighLoad,
  alertDeploymentSuccess,
  alertDeploymentFailure,
  alertServiceRecovered,
  sendBatchAlerts,
  alertHealthCheckFailed
};
