/**
 * Prometheus Middleware for Fastify
 * 
 * @module monitoring/prometheus/middleware
 * @description
 * Fastify hook для автоматического сбора HTTP метрик.
 */

const metrics = require('./metrics-registry');
const logger = require('../logger');

/**
 * Setup Prometheus middleware
 * @param {FastifyInstance} app - Fastify app instance
 */
function setupPrometheusMiddleware(app) {
  // Hook: onRequest - Start timer
  app.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  // Hook: onResponse - Record metrics
  app.addHook('onResponse', async (request, reply) => {
    const duration = (Date.now() - request.startTime) / 1000;
    
    const method = request.method;
    const route = request.routerPath || request.url;
    const statusCode = reply.statusCode;
    
    // Record request duration
    metrics.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
    
    // Increment request counter
    metrics.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });
    
    // Record request size (if available)
    if (request.headers['content-length']) {
      const size = parseInt(request.headers['content-length'], 10);
      metrics.httpRequestSize.observe({ method, route }, size);
    }
    
    // Record response size (if available)
    const responseSize = reply.getHeader('content-length');
    if (responseSize) {
      metrics.httpResponseSize.observe(
        { method, route },
        parseInt(responseSize, 10)
      );
    }
  });

  // Add /metrics endpoint
  app.get('/metrics', async (request, reply) => {
    try {
      const metricsOutput = await metrics.register.metrics();
      reply
        .header('Content-Type', metrics.register.contentType)
        .send(metricsOutput);
    } catch (error) {
      logger.error('Failed to generate metrics', { error: error.message });
      reply.code(500).send({ error: 'Failed to generate metrics' });
    }
  });

  logger.info('Prometheus middleware initialized');
}

module.exports = {
  setupPrometheusMiddleware,
};
