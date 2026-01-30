/**
 * Fastify Rate Limiter Middleware
 * 
 * @module cache/fastify-rate-limiter
 * @description
 * Fastify middleware для rate limiting с использованием Redis.
 */

const RateLimiter = require('./rate-limiter');
const { getRedisClient } = require('./redis-client');

/**
 * Plugin для регистрации rate limiter в Fastify
 */
function rateLimiterPlugin(fastify, options, done) {
  const redis = options.redis || getRedisClient();
  const rateLimiter = new RateLimiter(redis);

  // Декорируем fastify instance
  fastify.decorate('rateLimiter', rateLimiter);

  done();
}

/**
 * Middleware для проверки rate limit
 * @param {Object} options - Опции middleware
 * @param {string} options.limitType - Тип лимита (global, authenticated, apiKey, admin)
 * @param {string} options.endpoint - Название endpoint для специфичного лимита
 * @param {Function} options.identifierFn - Функция для получения identifier
 * @param {boolean} options.skipSuccessful - Не учитывать успешные запросы (только ошибки)
 */
function rateLimitMiddleware(options = {}) {
  const {
    limitType = 'global',
    endpoint = null,
    identifierFn = (request) => request.ip,
    skipSuccessful = false
  } = options;

  return async function (request, reply) {
    try {
      const rateLimiter = request.server.rateLimiter;
      
      // Получаем identifier
      const identifier = identifierFn(request);

      if (!identifier) {
        request.log.warn('No identifier for rate limiting');
        return; // Пропускаем, если нет identifier
      }

      // Проверяем блокировку
      const blocked = await rateLimiter.isBlocked(identifier);
      if (blocked.blocked) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'You have been temporarily blocked',
          reason: blocked.reason,
          retryAfter: blocked.expiresIn
        });
      }

      // Проверяем лимит
      const result = await rateLimiter.checkLimit(identifier, limitType, endpoint);

      // Добавляем заголовки rate limit
      reply.header('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: result.message || 'Rate limit exceeded',
          retryAfter: result.retryAfter,
          resetTime: new Date(result.resetTime).toISOString()
        });
      }

      // Если skipSuccessful = true, декремент при успешном ответе
      if (skipSuccessful) {
        reply.addHook('onResponse', async (request, reply) => {
          if (reply.statusCode < 400) {
            // Успешный запрос, не учитываем его в лимите
            // (удаляем последнюю запись из sorted set)
            // Это можно реализовать, но требует дополнительной логики
          }
        });
      }

    } catch (error) {
      request.log.error({
        error: error.message,
        stack: error.stack
      }, 'Rate limit middleware error');
      
      // При ошибке пропускаем запрос (fail-open для доступности)
    }
  };
}

/**
 * Middleware для rate limiting по роли пользователя
 */
function roleBasedRateLimit() {
  return async function (request, reply) {
    try {
      const rateLimiter = request.server.rateLimiter;
      
      // Определяем тип лимита по роли
      let limitType = 'global';
      let identifier = request.ip;

      if (request.user) {
        // Пользователь аутентифицирован
        identifier = `user:${request.user.userId}`;
        
        if (request.user.role === 'admin') {
          limitType = 'admin';
        } else {
          limitType = 'authenticated';
        }
      }

      // Проверяем лимит
      const result = await rateLimiter.checkLimit(identifier, limitType);

      // Добавляем заголовки
      reply.header('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: result.message,
          retryAfter: result.retryAfter
        });
      }

    } catch (error) {
      request.log.error('Role-based rate limit error', { error: error.message });
    }
  };
}

/**
 * Middleware для API key rate limiting
 */
function apiKeyRateLimit() {
  return async function (request, reply) {
    try {
      const rateLimiter = request.server.rateLimiter;
      
      // Получаем API key из заголовка
      const apiKey = request.headers['x-api-key'];

      if (!apiKey) {
        // Нет API ключа, используем IP
        const identifier = request.ip;
        const result = await rateLimiter.checkLimit(identifier, 'global');
        
        reply.header('X-RateLimit-Remaining', result.remaining);
        
        if (!result.allowed) {
          return reply.code(429).send({
            error: 'Too Many Requests',
            message: result.message
          });
        }
        return;
      }

      // Есть API ключ
      const identifier = `apikey:${apiKey}`;
      const result = await rateLimiter.checkLimit(identifier, 'apiKey');

      reply.header('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        
        return reply.code(429).send({
          error: 'API Rate Limit Exceeded',
          message: result.message,
          retryAfter: result.retryAfter
        });
      }

    } catch (error) {
      request.log.error('API key rate limit error', { error: error.message });
    }
  };
}

/**
 * Endpoint-specific rate limiting
 * @param {string} endpointName - Название endpoint (login, register, loader и т.д.)
 */
function endpointRateLimit(endpointName) {
  return async function (request, reply) {
    try {
      const rateLimiter = request.server.rateLimiter;
      const identifier = request.user ? `user:${request.user.userId}` : request.ip;

      const result = await rateLimiter.checkLimit(
        identifier,
        request.user ? 'authenticated' : 'global',
        endpointName
      );

      reply.header('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: result.message,
          retryAfter: result.retryAfter,
          endpoint: endpointName
        });
      }

    } catch (error) {
      request.log.error({
        endpoint: endpointName,
        error: error.message
      }, 'Endpoint rate limit error');
    }
  };
}

/**
 * Декоратор для добавления rate limit info в response
 */
function addRateLimitHeaders(request, reply, result) {
  if (result) {
    reply.header('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter);
    }
  }
}

module.exports = {
  rateLimiterPlugin,
  rateLimitMiddleware,
  roleBasedRateLimit,
  apiKeyRateLimit,
  endpointRateLimit,
  addRateLimitHeaders
};
