/**
 * Fastify Query Cache Plugin
 * 
 * @module cache/fastify-query-cache
 * @description
 * Fastify plugin для автоматического кэширования API responses.
 */

const QueryCache = require('./query-cache');
const { getRedisClient } = require('./redis-client');

/**
 * Plugin для регистрации query cache в Fastify
 */
function queryCachePlugin(fastify, options, done) {
  const redis = options.redis || getRedisClient();
  const queryCache = new QueryCache(redis);

  // Декорируем fastify instance
  fastify.decorate('queryCache', queryCache);

  // Декоратор для reply - добавление cache headers
  fastify.decorateReply('cached', function (data, ttl = 300) {
    const maxAge = ttl;
    this.header('Cache-Control', `public, max-age=${maxAge}`);
    this.header('X-Cache', 'HIT');
    return this.send(data);
  });

  fastify.decorateReply('notCached', function (data) {
    this.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    this.header('X-Cache', 'MISS');
    return this.send(data);
  });

  done();
}

/**
 * Middleware для автоматического кэширования GET requests
 * @param {Object} options - Опции кэширования
 * @param {number} options.ttl - TTL в секундах (по умолчанию 300)
 * @param {Function} options.keyGenerator - Функция для генерации ключа кэша
 * @param {Function} options.shouldCache - Функция для определения, нужно ли кэшировать
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300,
    keyGenerator = (request) => {
      return `${request.method}:${request.url}`;
    },
    shouldCache = (request, reply) => {
      // Кэшируем только GET запросы с кодом 200
      return request.method === 'GET' && reply.statusCode === 200;
    }
  } = options;

  return async function (request, reply) {
    // Только для GET запросов
    if (request.method !== 'GET') {
      return;
    }

    const queryCache = request.server.queryCache;
    const cacheKey = keyGenerator(request);

    try {
      // Проверяем кэш
      const cached = await queryCache.get(cacheKey);

      if (cached) {
        request.log.debug({ cacheKey }, 'Cache hit - serving from cache');
        return reply.cached(cached, ttl);
      }

      // Cache miss - продолжаем обработку
      request.log.debug({ cacheKey }, 'Cache miss - executing handler');

      // Hook для сохранения ответа в кэш
      reply.addHook('onSend', async (request, reply, payload) => {
        if (shouldCache(request, reply)) {
          try {
            const data = JSON.parse(payload);
            await queryCache.set(cacheKey, data, ttl);
            reply.header('X-Cache', 'MISS');
            request.log.debug({ cacheKey, ttl }, 'Response cached');
          } catch (error) {
            request.log.error({
              cacheKey,
              error: error.message
            }, 'Failed to cache response');
          }
        }
        return payload;
      });

    } catch (error) {
      request.log.error({
        cacheKey,
        error: error.message
      }, 'Cache middleware error');
      // При ошибке продолжаем без кэширования
    }
  };
}

/**
 * Декоратор для route - кэширование конкретного endpoint
 * @param {number} ttl - TTL в секундах
 */
function cached(ttl = 300) {
  return {
    preHandler: cacheMiddleware({ ttl })
  };
}

/**
 * Helper для инвалидации кэша при изменении данных
 */
function invalidateOnMutation(patterns = []) {
  return async function (request, reply) {
    reply.addHook('onSend', async (request, reply, payload) => {
      // Инвалидируем только для успешных мутаций
      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const queryCache = request.server.queryCache;

        for (const pattern of patterns) {
          try {
            const deleted = await queryCache.deletePattern(pattern);
            request.log.debug({
              pattern,
              deleted
            }, 'Cache invalidated');
          } catch (error) {
            request.log.error({
              pattern,
              error: error.message
            }, 'Cache invalidation error');
          }
        }
      }
      return payload;
    });
  };
}

/**
 * Conditional caching - кэшировать только для определённых условий
 * @param {Function} condition - Функция проверки условия
 * @param {number} ttl - TTL в секундах
 */
function conditionalCache(condition, ttl = 300) {
  return async function (request, reply) {
    if (!condition(request)) {
      return;
    }

    return cacheMiddleware({ ttl })(request, reply);
  };
}

/**
 * Кэширование с тегами для групповой инвалидации
 */
class TaggedCache {
  constructor(queryCache) {
    this.queryCache = queryCache;
    this.redis = queryCache.redis;
  }

  /**
   * Сохранение с тегами
   */
  async set(key, data, ttl, tags = []) {
    // Сохраняем данные
    await this.queryCache.set(key, data, ttl);

    // Сохраняем связь тегов с ключами
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      await this.redis.sadd(tagKey, key);
      await this.redis.expire(tagKey, ttl + 60); // TTL немного больше
    }
  }

  /**
   * Инвалидация по тегу
   */
  async invalidateTag(tag) {
    const tagKey = `tag:${tag}`;
    const keys = await this.redis.smembers(tagKey);

    if (keys.length === 0) {
      return 0;
    }

    // Удаляем все ключи с этим тегом
    let deleted = 0;
    for (const key of keys) {
      await this.queryCache.delete(key);
      deleted++;
    }

    // Удаляем сам тег
    await this.redis.del(tagKey);

    return deleted;
  }

  /**
   * Инвалидация по нескольким тегам
   */
  async invalidateTags(tags) {
    let totalDeleted = 0;
    for (const tag of tags) {
      totalDeleted += await this.invalidateTag(tag);
    }
    return totalDeleted;
  }
}

/**
 * Cache warming scheduler
 */
async function scheduleCacheWarming(fastify, dbPool, interval = 300000) {
  const queryCache = fastify.queryCache;

  // Первоначальный warm-up
  await queryCache.warmUp(dbPool);

  // Периодический warm-up
  const warmupInterval = setInterval(async () => {
    try {
      await queryCache.warmUp(dbPool);
    } catch (error) {
      fastify.log.error('Cache warm-up error', { error: error.message });
    }
  }, interval);

  // Cleanup при shutdown
  fastify.addHook('onClose', async () => {
    clearInterval(warmupInterval);
  });

  return warmupInterval;
}

/**
 * Cache statistics endpoint helper
 */
function getCacheStatsHandler(fastify) {
  return async (request, reply) => {
    const queryCache = fastify.queryCache;
    const redisStats = await require('./redis-client').getStats();
    const cacheStats = queryCache.getStats();

    return {
      cache: cacheStats,
      redis: redisStats,
      timestamp: new Date().toISOString()
    };
  };
}

module.exports = {
  queryCachePlugin,
  cacheMiddleware,
  cached,
  invalidateOnMutation,
  conditionalCache,
  TaggedCache,
  scheduleCacheWarming,
  getCacheStatsHandler
};
