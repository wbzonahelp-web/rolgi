/**
 * Alerting System
 * 
 * @module alerting/alert-manager
 * @description
 * Система отправки алертов через Email, Slack, Webhooks.
 * Поддержка различных severity levels и rate limiting для алертов.
 */

const nodemailer = require('nodemailer');
const { IncomingWebhook } = require('@slack/webhook');
const axios = require('axios');
const logger = require('../monitoring/logger');

/**
 * Severity levels для алертов
 */
const SEVERITY = {
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

/**
 * Типы алертов
 */
const ALERT_TYPES = {
  SYSTEM: 'system',
  DATABASE: 'database',
  API: 'api',
  LOADER: 'loader',
  RATE_LIMIT: 'rate_limit',
  CACHE: 'cache',
  SECURITY: 'security'
};

/**
 * Конфигурация каналов
 */
const CHANNELS = {
  email: {
    enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
    from: process.env.ALERT_EMAIL_FROM || 'alerts@rolgi.local',
    to: process.env.ALERT_EMAIL_TO ? process.env.ALERT_EMAIL_TO.split(',') : [],
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
  },
  slack: {
    enabled: process.env.ALERT_SLACK_ENABLED === 'true',
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: process.env.SLACK_CHANNEL || '#alerts',
    username: process.env.SLACK_USERNAME || 'Rolgi Alert Bot',
    iconEmoji: process.env.SLACK_ICON_EMOJI || ':rotating_light:'
  },
  webhook: {
    enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
    url: process.env.ALERT_WEBHOOK_URL,
    headers: process.env.ALERT_WEBHOOK_HEADERS 
      ? JSON.parse(process.env.ALERT_WEBHOOK_HEADERS) 
      : { 'Content-Type': 'application/json' }
  }
};

class AlertManager {
  constructor() {
    this.emailTransporter = null;
    this.slackWebhook = null;
    this.alertHistory = [];
    this.maxHistorySize = 1000;
    
    // Rate limiting для алертов (чтобы не спамить)
    this.alertCooldown = new Map(); // alertKey -> lastSentTime
    this.cooldownPeriod = 300000; // 5 минут

    this.stats = {
      sent: {
        email: 0,
        slack: 0,
        webhook: 0
      },
      failed: {
        email: 0,
        slack: 0,
        webhook: 0
      }
    };

    this.initialize();
  }

  /**
   * Инициализация транспортов
   */
  initialize() {
    // Email транспорт
    if (CHANNELS.email.enabled && CHANNELS.email.smtp.auth.user) {
      try {
        this.emailTransporter = nodemailer.createTransport(CHANNELS.email.smtp);
        logger.info('Email alerting initialized');
      } catch (error) {
        logger.error('Failed to initialize email transport', {
          error: error.message
        });
      }
    }

    // Slack webhook
    if (CHANNELS.slack.enabled && CHANNELS.slack.webhookUrl) {
      try {
        this.slackWebhook = new IncomingWebhook(CHANNELS.slack.webhookUrl);
        logger.info('Slack alerting initialized');
      } catch (error) {
        logger.error('Failed to initialize Slack webhook', {
          error: error.message
        });
      }
    }

    // Webhook
    if (CHANNELS.webhook.enabled && CHANNELS.webhook.url) {
      logger.info('Webhook alerting initialized');
    }
  }

  /**
   * Отправка алерта
   * @param {Object} alert - Объект алерта
   */
  async send(alert) {
    const {
      title,
      message,
      severity = SEVERITY.INFO,
      type = ALERT_TYPES.SYSTEM,
      metadata = {},
      channels = ['email', 'slack', 'webhook']
    } = alert;

    // Проверка cooldown (не отправляем один и тот же алерт слишком часто)
    const alertKey = `${type}:${title}`;
    if (this.isInCooldown(alertKey)) {
      logger.debug('Alert in cooldown, skipping', { alertKey });
      return { skipped: true, reason: 'cooldown' };
    }

    const enrichedAlert = {
      ...alert,
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME || 'localhost',
      environment: process.env.NODE_ENV || 'development'
    };

    // Сохраняем в историю
    this.addToHistory(enrichedAlert);

    // Обновляем cooldown
    this.setCooldown(alertKey);

    // Отправка по каналам
    const results = {
      email: null,
      slack: null,
      webhook: null
    };

    const promises = [];

    if (channels.includes('email') && this.emailTransporter) {
      promises.push(
        this.sendEmail(enrichedAlert)
          .then(result => { results.email = result; })
          .catch(error => { results.email = { error: error.message }; })
      );
    }

    if (channels.includes('slack') && this.slackWebhook) {
      promises.push(
        this.sendSlack(enrichedAlert)
          .then(result => { results.slack = result; })
          .catch(error => { results.slack = { error: error.message }; })
      );
    }

    if (channels.includes('webhook') && CHANNELS.webhook.url) {
      promises.push(
        this.sendWebhook(enrichedAlert)
          .then(result => { results.webhook = result; })
          .catch(error => { results.webhook = { error: error.message }; })
      );
    }

    await Promise.all(promises);

    logger.info('Alert sent', {
      title,
      severity,
      type,
      channels: Object.keys(results).filter(k => results[k])
    });

    return results;
  }

  /**
   * Отправка Email
   */
  async sendEmail(alert) {
    if (!this.emailTransporter) {
      return { skipped: true, reason: 'not_configured' };
    }

    try {
      const html = this.formatEmailHtml(alert);
      const text = this.formatEmailText(alert);

      const info = await this.emailTransporter.sendMail({
        from: CHANNELS.email.from,
        to: CHANNELS.email.to.join(','),
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        text,
        html
      });

      this.stats.sent.email++;
      
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      this.stats.failed.email++;
      logger.error('Failed to send email alert', {
        error: error.message,
        title: alert.title
      });
      throw error;
    }
  }

  /**
   * Отправка в Slack
   */
  async sendSlack(alert) {
    if (!this.slackWebhook) {
      return { skipped: true, reason: 'not_configured' };
    }

    try {
      const payload = this.formatSlackPayload(alert);
      
      await this.slackWebhook.send(payload);

      this.stats.sent.slack++;

      return { success: true };
    } catch (error) {
      this.stats.failed.slack++;
      logger.error('Failed to send Slack alert', {
        error: error.message,
        title: alert.title
      });
      throw error;
    }
  }

  /**
   * Отправка на Webhook
   */
  async sendWebhook(alert) {
    if (!CHANNELS.webhook.url) {
      return { skipped: true, reason: 'not_configured' };
    }

    try {
      const response = await axios.post(
        CHANNELS.webhook.url,
        alert,
        {
          headers: CHANNELS.webhook.headers,
          timeout: 5000
        }
      );

      this.stats.sent.webhook++;

      return {
        success: true,
        statusCode: response.status
      };
    } catch (error) {
      this.stats.failed.webhook++;
      logger.error('Failed to send webhook alert', {
        error: error.message,
        title: alert.title
      });
      throw error;
    }
  }

  /**
   * Форматирование Email HTML
   */
  formatEmailHtml(alert) {
    const severityColors = {
      critical: '#d32f2f',
      error: '#f57c00',
      warning: '#fbc02d',
      info: '#1976d2'
    };

    const color = severityColors[alert.severity] || '#1976d2';

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f5f5f5; padding: 20px; border-radius: 0 0 5px 5px; }
    .metadata { background: white; padding: 15px; margin-top: 15px; border-left: 3px solid ${color}; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .badge { display: inline-block; padding: 5px 10px; background: ${color}; color: white; border-radius: 3px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🚨 Rolgi Alert</h2>
      <span class="badge">${alert.severity.toUpperCase()}</span>
    </div>
    <div class="content">
      <h3>${alert.title}</h3>
      <p>${alert.message}</p>
      
      <div class="metadata">
        <strong>Details:</strong><br>
        <strong>Type:</strong> ${alert.type}<br>
        <strong>Time:</strong> ${alert.timestamp}<br>
        <strong>Environment:</strong> ${alert.environment}<br>
        <strong>Hostname:</strong> ${alert.hostname}
        ${alert.metadata && Object.keys(alert.metadata).length > 0 ? `
        <br><br><strong>Additional Info:</strong><br>
        <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
        ` : ''}
      </div>
      
      <div class="footer">
        <p>This is an automated alert from Rolgi SStats Analytics Platform</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Форматирование Email Text
   */
  formatEmailText(alert) {
    return `
ROLGI ALERT [${alert.severity.toUpperCase()}]

${alert.title}

${alert.message}

Details:
- Type: ${alert.type}
- Time: ${alert.timestamp}
- Environment: ${alert.environment}
- Hostname: ${alert.hostname}

${alert.metadata && Object.keys(alert.metadata).length > 0 
  ? `Additional Info:\n${JSON.stringify(alert.metadata, null, 2)}`
  : ''
}

---
This is an automated alert from Rolgi SStats Analytics Platform
    `;
  }

  /**
   * Форматирование Slack payload
   */
  formatSlackPayload(alert) {
    const severityEmojis = {
      critical: ':red_circle:',
      error: ':large_orange_diamond:',
      warning: ':warning:',
      info: ':information_source:'
    };

    const severityColors = {
      critical: 'danger',
      error: 'warning',
      warning: '#fbc02d',
      info: 'good'
    };

    return {
      username: CHANNELS.slack.username,
      icon_emoji: CHANNELS.slack.iconEmoji,
      channel: CHANNELS.slack.channel,
      attachments: [
        {
          color: severityColors[alert.severity] || 'good',
          title: `${severityEmojis[alert.severity]} ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Type',
              value: alert.type,
              short: true
            },
            {
              title: 'Environment',
              value: alert.environment,
              short: true
            },
            {
              title: 'Hostname',
              value: alert.hostname,
              short: true
            },
            ...(alert.metadata && Object.keys(alert.metadata).length > 0 
              ? [{
                  title: 'Additional Info',
                  value: `\`\`\`${JSON.stringify(alert.metadata, null, 2)}\`\`\``,
                  short: false
                }]
              : []
            )
          ],
          footer: 'Rolgi SStats Analytics',
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
        }
      ]
    };
  }

  /**
   * Проверка cooldown
   */
  isInCooldown(alertKey) {
    const lastSent = this.alertCooldown.get(alertKey);
    if (!lastSent) return false;
    
    const now = Date.now();
    return (now - lastSent) < this.cooldownPeriod;
  }

  /**
   * Установка cooldown
   */
  setCooldown(alertKey) {
    this.alertCooldown.set(alertKey, Date.now());
    
    // Очистка старых записей
    setTimeout(() => {
      this.alertCooldown.delete(alertKey);
    }, this.cooldownPeriod + 1000);
  }

  /**
   * Добавление в историю
   */
  addToHistory(alert) {
    this.alertHistory.unshift(alert);
    
    // Ограничиваем размер истории
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Получение истории алертов
   */
  getHistory(limit = 50, filters = {}) {
    let history = [...this.alertHistory];

    if (filters.severity) {
      history = history.filter(a => a.severity === filters.severity);
    }

    if (filters.type) {
      history = history.filter(a => a.type === filters.type);
    }

    return history.slice(0, limit);
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.alertHistory.length,
      cooldownActive: this.alertCooldown.size
    };
  }

  /**
   * Очистка истории
   */
  clearHistory() {
    this.alertHistory = [];
    logger.info('Alert history cleared');
  }

  /**
   * Тестовый алерт
   */
  async sendTestAlert(channels = ['email', 'slack', 'webhook']) {
    return await this.send({
      title: 'Test Alert',
      message: 'This is a test alert from Rolgi Alerting System',
      severity: SEVERITY.INFO,
      type: ALERT_TYPES.SYSTEM,
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      },
      channels
    });
  }
}

// Singleton instance
let alertManager = null;

/**
 * Получение instance AlertManager
 */
function getAlertManager() {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}

module.exports = {
  AlertManager,
  getAlertManager,
  SEVERITY,
  ALERT_TYPES
};
