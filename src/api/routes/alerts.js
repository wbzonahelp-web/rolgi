/**
 * Alerting API Routes
 * 
 * @module api/routes/alerts
 * @description
 * API endpoints для управления алертами и просмотра истории.
 */

const { getAlertManager, SEVERITY, ALERT_TYPES } = require('../../alerting/alert-manager');
const { authenticate, requireRole } = require('../../auth/fastify-auth');
const { ROLES } = require('../../auth/jwt-auth');

/**
 * Регистрация alert routes
 */
async function alertRoutes(fastify, options) {
  const alertManager = getAlertManager();

  // ============================================================
  // ADMIN ONLY ROUTES
  // ============================================================

  /**
   * POST /api/alerts/send
   * Отправка алерта (admin only)
   */
  fastify.post('/send', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Send an alert (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['title', 'message'],
        properties: {
          title: { type: 'string' },
          message: { type: 'string' },
          severity: { 
            type: 'string', 
            enum: Object.values(SEVERITY),
            default: SEVERITY.INFO 
          },
          type: { 
            type: 'string', 
            enum: Object.values(ALERT_TYPES),
            default: ALERT_TYPES.SYSTEM 
          },
          metadata: { type: 'object' },
          channels: { 
            type: 'array', 
            items: { type: 'string', enum: ['email', 'slack', 'webhook'] },
            default: ['email', 'slack', 'webhook']
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            results: { type: 'object' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const results = await alertManager.send(request.body);

        reply.send({
          success: true,
          results
        });
      } catch (error) {
        request.log.error('Failed to send alert', { error: error.message });
        reply.code(500).send({
          error: 'Failed to send alert',
          message: error.message
        });
      }
    }
  });

  /**
   * POST /api/alerts/test
   * Отправка тестового алерта (admin only)
   */
  fastify.post('/test', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Send a test alert (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          channels: { 
            type: 'array', 
            items: { type: 'string', enum: ['email', 'slack', 'webhook'] },
            default: ['slack']
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            results: { type: 'object' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { channels = ['slack'] } = request.body;
        const results = await alertManager.sendTestAlert(channels);

        reply.send({
          success: true,
          results
        });
      } catch (error) {
        request.log.error('Failed to send test alert', { error: error.message });
        reply.code(500).send({
          error: 'Failed to send test alert',
          message: error.message
        });
      }
    }
  });

  /**
   * GET /api/alerts/history
   * Получение истории алертов (admin only)
   */
  fastify.get('/history', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Get alert history (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50, maximum: 500 },
          severity: { type: 'string', enum: Object.values(SEVERITY) },
          type: { type: 'string', enum: Object.values(ALERT_TYPES) }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: { type: 'array' },
            total: { type: 'integer' },
            limit: { type: 'integer' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { limit = 50, severity, type } = request.query;
        
        const filters = {};
        if (severity) filters.severity = severity;
        if (type) filters.type = type;

        const alerts = alertManager.getHistory(limit, filters);

        reply.send({
          alerts,
          total: alerts.length,
          limit
        });
      } catch (error) {
        request.log.error('Failed to get alert history', { error: error.message });
        reply.code(500).send({
          error: 'Failed to get alert history',
          message: error.message
        });
      }
    }
  });

  /**
   * GET /api/alerts/stats
   * Получение статистики алертов (admin only)
   */
  fastify.get('/stats', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Get alert statistics (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            sent: { type: 'object' },
            failed: { type: 'object' },
            historySize: { type: 'integer' },
            cooldownActive: { type: 'integer' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const stats = alertManager.getStats();
        reply.send(stats);
      } catch (error) {
        request.log.error('Failed to get alert stats', { error: error.message });
        reply.code(500).send({
          error: 'Failed to get alert stats',
          message: error.message
        });
      }
    }
  });

  /**
   * DELETE /api/alerts/history
   * Очистка истории алертов (admin only)
   */
  fastify.delete('/history', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Clear alert history (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        alertManager.clearHistory();
        reply.send({
          success: true,
          message: 'Alert history cleared'
        });
      } catch (error) {
        request.log.error('Failed to clear alert history', { error: error.message });
        reply.code(500).send({
          error: 'Failed to clear alert history',
          message: error.message
        });
      }
    }
  });

  /**
   * GET /api/alerts/config
   * Получение конфигурации алертов (admin only)
   */
  fastify.get('/config', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Get alert configuration (admin only)',
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            email: { type: 'object' },
            slack: { type: 'object' },
            webhook: { type: 'object' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        // Возвращаем конфигурацию без секретов
        const config = {
          email: {
            enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
            from: process.env.ALERT_EMAIL_FROM,
            to: process.env.ALERT_EMAIL_TO ? process.env.ALERT_EMAIL_TO.split(',') : [],
            configured: !!process.env.SMTP_USER
          },
          slack: {
            enabled: process.env.ALERT_SLACK_ENABLED === 'true',
            channel: process.env.SLACK_CHANNEL,
            configured: !!process.env.SLACK_WEBHOOK_URL
          },
          webhook: {
            enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
            url: process.env.ALERT_WEBHOOK_URL ? '[CONFIGURED]' : null,
            configured: !!process.env.ALERT_WEBHOOK_URL
          }
        };

        reply.send(config);
      } catch (error) {
        request.log.error('Failed to get alert config', { error: error.message });
        reply.code(500).send({
          error: 'Failed to get alert config',
          message: error.message
        });
      }
    }
  });
}

module.exports = alertRoutes;
