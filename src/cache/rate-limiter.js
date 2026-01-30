/**
 * Redis-based Rate Limiter
 * 
 * @module cache/rate-limiter
 * @description
 * Rate limiting с использованием Redis и sliding window алгоритма.
 * Поддерживает лимиты по IP, API ключу и комбинированные лимиты.
 */

const { getRedisClient } = require('./redis-client');
const logger = require('../monitoring/logger');

/**
 * Конфигурация rate limits
 */
const RATE_LIMITS = {
  // Global limit (по IP)
  global: {
    windowMs: 60000, // 1 минута
    maxRequests: 100, // 100 запросов
    message: 'Too many requests from this IP, please try again later'
  },
  
  // Authenticated user limit (после логина)
  authenticated: {
    windowMs: 60000,
    maxRequests: 300, // 300 запросов
    message: 'Too many requests, please try again later'
  },
  
  // API key limit (для public API)
  apiKey: {
    windowMs: 60000,
    maxRequests: 1000, // 1000 запросов
    message: 'API rate limit exceeded'
  },
  
  // Admin limit (больше запросов для admin)
  admin: {
    windowMs: 60000,
    maxRequests: 1000,
    message: 'Rate limit exceeded'
  },

  // Специальные лимиты для конкретных endpoints
  endpoints: {
    login: {
      windowMs: 900000, // 15 минут
      maxRequests: 5, // 5 попыток
      message: 'Too many login attempts, please try again later'
    },
    register: {
      windowMs: 3600000, // 1 час
      maxRequests: 3, // 3 регистрации
      message: 'Too many registration attempts'
    },
    loader: {
      windowMs: 300000, // 5 минут
      maxRequests: 10, // 10 запусков
      message: 'Too many loader requests'
    }
  }
};

class RateLimiter {
  constructor(redis = null) {
    this.redis = redis || getRedisClient();
    this.config = RATE_LIMITS;
  }

  /**
   * Проверка rate limit
   * @param {string} identifier - IP, userId, apiKey и т.д.
   * @param {string} limitType - Тип лимита (global, authenticated, apiKey и т.д.)
   * @param {string} endpoint - Опциональный endpoint для специфичных лимитов
   * @returns {Object} { allowed, remaining, resetTime }
   */
  async checkLimit(identifier, limitType = 'global', endpoint = null) {
    try {
      // Получаем конфигурацию лимита
      let limitConfig;
      if (endpoint && this.config.endpoints[endpoint]) {
        limitConfig = this.config.endpoints[endpoint];
      } else {
        limitConfig = this.config[limitType] || this.config.global;
      }

      const { windowMs, maxRequests } = limitConfig;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Ключ для Redis
      const key = this._getKey(identifier, limitType, endpoint);

      // Используем sorted set для sliding window
      // Удаляем старые записи
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Получаем текущее количество запросов в окне
      const currentCount = await this.redis.zcard(key);

      if (currentCount >= maxRequests) {
        // Лимит превышен
        const oldestRequest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldestRequest[1] ? parseInt(oldestRequest[1]) + windowMs : now + windowMs;

        logger.warn({
          identifier,
          limitType,
          endpoint,
          currentCount,
          maxRequests,
          resetTime: new Date(resetTime).toISOString()
        }, 'Rate limit exceeded');

        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil((resetTime - now) / 1000),
          message: limitConfig.message
        };
      }

      // Добавляем текущий запрос
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);

      // Устанавливаем TTL на ключ
      await this.redis.expire(key, Math.ceil(windowMs / 1000) + 1);

      const remaining = maxRequests - currentCount - 1;

      logger.debug({
        identifier,
        limitType,
        endpoint,
        currentCount: currentCount + 1,
        remaining,
        maxRequests
      }, 'Rate limit check passed');

      return {
        allowed: true,
        remaining,
        resetTime: now + windowMs,
        retryAfter: 0
      };
    } catch (error) {
      logger.error({
        identifier,
        limitType,
        endpoint,
        error: error.message
      }, 'Rate limiter error');

      // В случае ошибки Redis, пропускаем запрос (fail-open)
      return {
        allowed: true,
        remaining: 0,
        resetTime: Date.now() + 60000,
        retryAfter: 0,
        error: 'Rate limiter unavailable'
      };
    }
  }

  /**
   * Сброс rate limit для identifier
   */
  async resetLimit(identifier, limitType = 'global', endpoint = null) {
    try {
      const key = this._getKey(identifier, limitType, endpoint);
      await this.redis.del(key);

      logger.info({
        identifier,
        limitType,
        endpoint
      }, 'Rate limit reset');

      return true;
    } catch (error) {
      logger.error({
        identifier,
        error: error.message
      }, 'Failed to reset rate limit');
      return false;
    }
  }

  /**
   * Получение текущего состояния лимита
   */
  async getStatus(identifier, limitType = 'global', endpoint = null) {
    try {
      const limitConfig = endpoint && this.config.endpoints[endpoint]
        ? this.config.endpoints[endpoint]
        : this.config[limitType] || this.config.global;

      const { windowMs, maxRequests } = limitConfig;
      const now = Date.now();
      const windowStart = now - windowMs;

      const key = this._getKey(identifier, limitType, endpoint);

      // Удаляем старые записи
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Получаем текущее количество
      const currentCount = await this.redis.zcard(key);
      const remaining = Math.max(0, maxRequests - currentCount);

      return {
        identifier,
        limitType,
        endpoint,
        currentCount,
        maxRequests,
        remaining,
        windowMs,
        resetTime: now + windowMs
      };
    } catch (error) {
      logger.error({
        identifier,
        error: error.message
      }, 'Failed to get rate limit status');
      return null;
    }
  }

  /**
   * Блокировка identifier на определённое время
   */
  async blockIdentifier(identifier, durationMs = 3600000, reason = 'Manual block') {
    try {
      const key = `block:${identifier}`;
      await this.redis.setex(key, Math.ceil(durationMs / 1000), reason);

      logger.warn({
        identifier,
        durationMs,
        reason
      }, 'Identifier blocked');

      return true;
    } catch (error) {
      logger.error({
        identifier,
        error: error.message
      }, 'Failed to block identifier');
      return false;
    }
  }

  /**
   * Проверка, заблокирован ли identifier
   */
  async isBlocked(identifier) {
    try {
      const key = `block:${identifier}`;
      const blocked = await this.redis.exists(key);
      
      if (blocked) {
        const reason = await this.redis.get(key);
        const ttl = await this.redis.ttl(key);
        
        return {
          blocked: true,
          reason,
          expiresIn: ttl
        };
      }

      return { blocked: false };
    } catch (error) {
      logger.error({
        identifier,
        error: error.message
      }, 'Failed to check if identifier is blocked');
      return { blocked: false };
    }
  }

  /**
   * Разблокировка identifier
   */
  async unblockIdentifier(identifier) {
    try {
      const key = `block:${identifier}`;
      await this.redis.del(key);

      logger.info({ identifier }, 'Identifier unblocked');
      return true;
    } catch (error) {
      logger.error({
        identifier,
        error: error.message
      }, 'Failed to unblock identifier');
      return false;
    }
  }

  /**
   * Получение статистики по всем лимитам
   */
  async getGlobalStats() {
    try {
      const keys = await this.redis.keys('ratelimit:*');
      const stats = {
        totalLimitedIdentifiers: keys.length,
        byType: {},
        byEndpoint: {}
      };

      for (const key of keys) {
        const parts = key.split(':');
        const type = parts[1];
        const endpoint = parts[3];

        if (endpoint) {
          stats.byEndpoint[endpoint] = (stats.byEndpoint[endpoint] || 0) + 1;
        } else {
          stats.byType[type] = (stats.byType[type] || 0) + 1;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get global rate limit stats', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Генерация ключа для Redis
   */
  _getKey(identifier, limitType, endpoint) {
    if (endpoint) {
      return `ratelimit:${limitType}:${endpoint}:${identifier}`;
    }
    return `ratelimit:${limitType}:${identifier}`;
  }

  /**
   * Обновление конфигурации лимитов
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Rate limiter config updated');
  }

  /**
   * Получение конфигурации
   */
  getConfig() {
    return this.config;
  }
}

module.exports = RateLimiter;
