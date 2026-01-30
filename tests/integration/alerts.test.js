/**
 * Integration Tests: Alerting System
 * 
 * @description
 * Тесты для системы алертов (Email, Slack, Webhooks)
 */

const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { setupTestEnvironment, cleanupTestEnvironment } = require('../helpers/setup');
const { BackendApi } = require('../../src/api/backend-api');
const { getAlertManager, SEVERITY, ALERT_TYPES } = require('../../src/alerting/alert-manager');
const { 
  alertCriticalError,
  alertDatabaseError,
  alertApiError,
  alertLoaderFailure,
  alertRateLimitExceeded,
  alertCacheIssue,
  alertSecurityIssue
} = require('../../src/alerting/alert-helpers');

let api;
let alertManager;
let testDb;
let authToken;
let adminUser;

describe('Alerting System Integration Tests', () => {

  beforeAll(async () => {
    const env = await setupTestEnvironment();
    testDb = env.db;

    // Start API server
    api = new BackendApi({
      port: 3099,
      host: 'localhost',
      enableSwagger: false,
      enableCors: true,
      enableRateLimit: false
    });

    await api.start();

    // Get alert manager
    alertManager = getAlertManager();

    // Create admin user and get token
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    await testDb.upsert('users', {
      username: 'test_admin',
      email: 'admin@test.local',
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }, ['username']);

    // Login to get token
    const loginResponse = await api.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'test_admin',
        password: 'admin123'
      }
    });

    const loginData = JSON.parse(loginResponse.payload);
    authToken = loginData.accessToken;
    adminUser = loginData.user;
  });

  afterAll(async () => {
    if (api) {
      await api.stop();
    }
    await cleanupTestEnvironment(testDb);
  });

  // ===================================================================
  // ALERT MANAGER TESTS
  // ===================================================================

  describe('AlertManager Core', () => {

    it('should send test alert', async () => {
      const result = await alertManager.sendTestAlert(['webhook']);
      
      expect(result).toBeDefined();
      expect(result.webhook).toBeDefined();
    });

    it('should send alert with all fields', async () => {
      const alert = {
        title: 'Test Alert',
        message: 'This is a test alert',
        severity: SEVERITY.INFO,
        type: ALERT_TYPES.SYSTEM,
        metadata: {
          test: true,
          value: 123
        },
        channels: ['webhook']
      };

      const result = await alertManager.send(alert);
      
      expect(result).toBeDefined();
      expect(result.webhook).toBeDefined();
    });

    it('should respect cooldown period', async () => {
      const alert = {
        title: 'Cooldown Test',
        message: 'Testing cooldown',
        severity: SEVERITY.INFO,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      };

      // First send
      const result1 = await alertManager.send(alert);
      expect(result1.skipped).toBeUndefined();

      // Second send (should be skipped due to cooldown)
      const result2 = await alertManager.send(alert);
      expect(result2.skipped).toBe(true);
      expect(result2.reason).toBe('cooldown');
    });

    it('should add alerts to history', async () => {
      const historyBefore = alertManager.getHistory(10);
      const sizeBefore = historyBefore.length;

      await alertManager.send({
        title: 'History Test',
        message: 'Testing history',
        severity: SEVERITY.INFO,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });

      const historyAfter = alertManager.getHistory(10);
      expect(historyAfter.length).toBeGreaterThan(sizeBefore);
    });

    it('should filter history by severity', async () => {
      // Send critical alert
      await alertManager.send({
        title: 'Critical Test',
        message: 'Critical alert',
        severity: SEVERITY.CRITICAL,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });

      const criticalAlerts = alertManager.getHistory(50, { severity: SEVERITY.CRITICAL });
      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(criticalAlerts.every(a => a.severity === SEVERITY.CRITICAL)).toBe(true);
    });

    it('should filter history by type', async () => {
      await alertManager.send({
        title: 'Database Test',
        message: 'Database alert',
        severity: SEVERITY.ERROR,
        type: ALERT_TYPES.DATABASE,
        channels: ['webhook']
      });

      const dbAlerts = alertManager.getHistory(50, { type: ALERT_TYPES.DATABASE });
      expect(dbAlerts.length).toBeGreaterThan(0);
      expect(dbAlerts.every(a => a.type === ALERT_TYPES.DATABASE)).toBe(true);
    });

    it('should return statistics', () => {
      const stats = alertManager.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.sent).toBeDefined();
      expect(stats.failed).toBeDefined();
      expect(stats.historySize).toBeGreaterThan(0);
      expect(typeof stats.cooldownActive).toBe('number');
    });

    it('should clear history', () => {
      alertManager.clearHistory();
      const history = alertManager.getHistory();
      expect(history.length).toBe(0);
    });

  });

  // ===================================================================
  // ALERT HELPERS TESTS
  // ===================================================================

  describe('Alert Helpers', () => {

    it('should send critical error alert', async () => {
      const result = await alertCriticalError(
        'Critical Error Test',
        'This is a critical error',
        { errorCode: 'TEST_001' }
      );
      
      expect(result).toBeDefined();
    });

    it('should send database error alert', async () => {
      const error = new Error('Database connection failed');
      const result = await alertDatabaseError(error, { table: 'games' });
      
      expect(result).toBeDefined();
    });

    it('should send API error alert', async () => {
      const error = new Error('API request failed');
      const result = await alertApiError('/api/games', 500, error, { method: 'GET' });
      
      expect(result).toBeDefined();
    });

    it('should send loader failure alert', async () => {
      const error = new Error('Failed to load data');
      const result = await alertLoaderFailure('games', error, { source: 'sstats' });
      
      expect(result).toBeDefined();
    });

    it('should send rate limit exceeded alert', async () => {
      const result = await alertRateLimitExceeded('192.168.1.1', 'global', { requests: 100 });
      
      expect(result).toBeDefined();
    });

    it('should send cache issue alert', async () => {
      const result = await alertCacheIssue('Redis connection lost', { redisHost: 'localhost' });
      
      expect(result).toBeDefined();
    });

    it('should send security issue alert', async () => {
      const result = await alertSecurityIssue(
        'Unauthorized Access Attempt',
        'Multiple failed login attempts detected',
        { ip: '192.168.1.100', attempts: 5 }
      );
      
      expect(result).toBeDefined();
    });

  });

  // ===================================================================
  // API ROUTES TESTS (Admin Only)
  // ===================================================================

  describe('Alert API Routes', () => {

    it('should send alert via API (admin)', async () => {
      const response = await api.app.inject({
        method: 'POST',
        url: '/api/alerts/send',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        payload: {
          title: 'API Alert Test',
          message: 'Testing alert API',
          severity: SEVERITY.INFO,
          type: ALERT_TYPES.SYSTEM,
          channels: ['webhook']
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
    });

    it('should send test alert via API (admin)', async () => {
      const response = await api.app.inject({
        method: 'POST',
        url: '/api/alerts/test',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        payload: {
          channels: ['webhook']
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should get alert history (admin)', async () => {
      const response = await api.app.inject({
        method: 'GET',
        url: '/api/alerts/history?limit=10',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.alerts).toBeDefined();
      expect(Array.isArray(data.alerts)).toBe(true);
      expect(data.total).toBeDefined();
    });

    it('should filter alert history by severity (admin)', async () => {
      const response = await api.app.inject({
        method: 'GET',
        url: '/api/alerts/history?severity=critical&limit=10',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.alerts).toBeDefined();
    });

    it('should get alert statistics (admin)', async () => {
      const response = await api.app.inject({
        method: 'GET',
        url: '/api/alerts/stats',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.sent).toBeDefined();
      expect(data.failed).toBeDefined();
      expect(data.historySize).toBeDefined();
    });

    it('should get alert configuration (admin)', async () => {
      const response = await api.app.inject({
        method: 'GET',
        url: '/api/alerts/config',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.email).toBeDefined();
      expect(data.slack).toBeDefined();
      expect(data.webhook).toBeDefined();
    });

    it('should clear alert history (admin)', async () => {
      const response = await api.app.inject({
        method: 'DELETE',
        url: '/api/alerts/history',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });

    it('should reject alert API without auth', async () => {
      const response = await api.app.inject({
        method: 'POST',
        url: '/api/alerts/send',
        payload: {
          title: 'Test',
          message: 'Test'
        }
      });

      expect(response.statusCode).toBe(401);
    });

  });

  // ===================================================================
  // SEVERITY LEVELS
  // ===================================================================

  describe('Severity Levels', () => {

    it('should handle CRITICAL severity', async () => {
      const result = await alertManager.send({
        title: 'Critical Test',
        message: 'Testing critical severity',
        severity: SEVERITY.CRITICAL,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });
      
      expect(result).toBeDefined();
    });

    it('should handle ERROR severity', async () => {
      const result = await alertManager.send({
        title: 'Error Test',
        message: 'Testing error severity',
        severity: SEVERITY.ERROR,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });
      
      expect(result).toBeDefined();
    });

    it('should handle WARNING severity', async () => {
      const result = await alertManager.send({
        title: 'Warning Test',
        message: 'Testing warning severity',
        severity: SEVERITY.WARNING,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });
      
      expect(result).toBeDefined();
    });

    it('should handle INFO severity', async () => {
      const result = await alertManager.send({
        title: 'Info Test',
        message: 'Testing info severity',
        severity: SEVERITY.INFO,
        type: ALERT_TYPES.SYSTEM,
        channels: ['webhook']
      });
      
      expect(result).toBeDefined();
    });

  });

  // ===================================================================
  // ALERT TYPES
  // ===================================================================

  describe('Alert Types', () => {

    const types = [
      ALERT_TYPES.SYSTEM,
      ALERT_TYPES.DATABASE,
      ALERT_TYPES.API,
      ALERT_TYPES.LOADER,
      ALERT_TYPES.RATE_LIMIT,
      ALERT_TYPES.CACHE,
      ALERT_TYPES.SECURITY
    ];

    types.forEach(type => {
      it(`should handle ${type} type`, async () => {
        const result = await alertManager.send({
          title: `${type} Test`,
          message: `Testing ${type} alert type`,
          severity: SEVERITY.INFO,
          type,
          channels: ['webhook']
        });
        
        expect(result).toBeDefined();
      });
    });

  });

});
