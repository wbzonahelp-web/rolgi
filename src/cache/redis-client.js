/**
 * Redis Client Module
 * 
 * @module cache/redis-client
 * @description
 * Redis клиент для rate limiting, caching и других задач.
 * Использует ioredis для лучшей производительности и поддержки Cluster.
 */

const Redis = require('ioredis');
const logger = require("../monitoring/logger");

let redisClient = null;
let isConnected = false;

/**
 * Конфигурация Redis
 */
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'rolgi:',
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,
  connectTimeout: 10000,
  keepAlive: 30000
};

/**
 * Создание и инициализация Redis клиента
 */
function createRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(REDIS_CONFIG);

  // Event handlers
  redisClient.on('connect', () => {
    logger.info('Redis client connecting...');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    logger.info({
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      db: REDIS_CONFIG.db,
      keyPrefix: REDIS_CONFIG.keyPrefix
    }, 'Redis client connected and ready');
  });

  redisClient.on('error', (error) => {
    logger.error({
      error: error.message,
      stack: error.stack
    }, 'Redis client error');
  });

  redisClient.on('close', () => {
    isConnected = false;
    logger.warn('Redis client connection closed');
  });

  redisClient.on('reconnecting', (delay) => {
    logger.info({ delay }, 'Redis client reconnecting...');
  });

  redisClient.on('end', () => {
    isConnected = false;
    logger.info('Redis client connection ended');
  });

  return redisClient;
}

/**
 * Получение Redis клиента
 */
function getRedisClient() {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
}

/**
 * Проверка подключения к Redis
 */
async function healthCheck() {
  try {
    if (!redisClient) {
      return false;
    }

    const pong = await redisClient.ping();
    return pong === 'PONG' && isConnected;
  } catch (error) {
    logger.error('Redis health check failed', { error: error.message });
    return false;
  }
}

/**
 * Получение статистики Redis
 */
async function getStats() {
  try {
    if (!redisClient || !isConnected) {
      return null;
    }

    const info = await redisClient.info();
    const dbSize = await redisClient.dbsize();
    
    // Парсим основную информацию
    const stats = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        stats[key] = value;
      }
    }

    return {
      connected: isConnected,
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      db: REDIS_CONFIG.db,
      dbSize,
      version: stats.redis_version,
      uptime: parseInt(stats.uptime_in_seconds || 0),
      connectedClients: parseInt(stats.connected_clients || 0),
      usedMemory: stats.used_memory_human,
      usedMemoryPeak: stats.used_memory_peak_human,
      totalCommandsProcessed: parseInt(stats.total_commands_processed || 0),
      instantaneousOpsPerSec: parseInt(stats.instantaneous_ops_per_sec || 0),
      keyspaceHits: parseInt(stats.keyspace_hits || 0),
      keyspaceMisses: parseInt(stats.keyspace_misses || 0),
      hitRate: calculateHitRate(
        parseInt(stats.keyspace_hits || 0),
        parseInt(stats.keyspace_misses || 0)
      )
    };
  } catch (error) {
    logger.error('Failed to get Redis stats', { error: error.message });
    return null;
  }
}

/**
 * Расчёт hit rate для кэша
 */
function calculateHitRate(hits, misses) {
  const total = hits + misses;
  if (total === 0) return 0;
  return ((hits / total) * 100).toFixed(2);
}

/**
 * Закрытие Redis подключения
 */
async function closeRedis() {
  if (redisClient) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
}

/**
 * Очистка всех ключей с префиксом
 */
async function clearAll(pattern = '*') {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    const fullPattern = REDIS_CONFIG.keyPrefix + pattern;
    const keys = await redisClient.keys(fullPattern);
    
    if (keys.length === 0) {
      return 0;
    }

    // Удаляем префикс для del команды (ioredis добавит его автоматически)
    const keysWithoutPrefix = keys.map(key => key.replace(REDIS_CONFIG.keyPrefix, ''));
    const deleted = await redisClient.del(...keysWithoutPrefix);

    logger.info({ pattern, deleted }, 'Cleared Redis keys');
    return deleted;
  } catch (error) {
    logger.error('Failed to clear Redis keys', {
      pattern,
      error: error.message
    });
    throw error;
  }
}

/**
 * Получение всех ключей по паттерну
 */
async function getKeys(pattern = '*') {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    const fullPattern = REDIS_CONFIG.keyPrefix + pattern;
    const keys = await redisClient.keys(fullPattern);
    
    // Убираем префикс из результатов
    return keys.map(key => key.replace(REDIS_CONFIG.keyPrefix, ''));
  } catch (error) {
    logger.error('Failed to get Redis keys', {
      pattern,
      error: error.message
    });
    throw error;
  }
}

/**
 * Batch операции для множественных ключей
 */
async function mget(keys) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    if (keys.length === 0) {
      return [];
    }

    return await redisClient.mget(...keys);
  } catch (error) {
    logger.error('Failed to mget from Redis', {
      keysCount: keys.length,
      error: error.message
    });
    throw error;
  }
}

/**
 * Batch set операции
 */
async function mset(keyValuePairs) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    if (keyValuePairs.length === 0) {
      return 'OK';
    }

    return await redisClient.mset(...keyValuePairs);
  } catch (error) {
    logger.error('Failed to mset to Redis', {
      pairsCount: keyValuePairs.length / 2,
      error: error.message
    });
    throw error;
  }
}

/**
 * Проверка существования ключа
 */
async function exists(key) {
  try {
    if (!redisClient || !isConnected) {
      return false;
    }

    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Failed to check key existence', {
      key,
      error: error.message
    });
    return false;
  }
}

/**
 * Получение TTL ключа
 */
async function ttl(key) {
  try {
    if (!redisClient || !isConnected) {
      return -2;
    }

    return await redisClient.ttl(key);
  } catch (error) {
    logger.error('Failed to get TTL', {
      key,
      error: error.message
    });
    return -2;
  }
}

/**
 * Инкремент значения
 */
async function incr(key) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    return await redisClient.incr(key);
  } catch (error) {
    logger.error('Failed to increment key', {
      key,
      error: error.message
    });
    throw error;
  }
}

/**
 * Инкремент на определённое значение
 */
async function incrby(key, increment) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    return await redisClient.incrby(key, increment);
  } catch (error) {
    logger.error('Failed to increment key by value', {
      key,
      increment,
      error: error.message
    });
    throw error;
  }
}

/**
 * Декремент значения
 */
async function decr(key) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    return await redisClient.decr(key);
  } catch (error) {
    logger.error('Failed to decrement key', {
      key,
      error: error.message
    });
    throw error;
  }
}

/**
 * Expire ключа
 */
async function expire(key, seconds) {
  try {
    if (!redisClient || !isConnected) {
      throw new Error('Redis client not connected');
    }

    return await redisClient.expire(key, seconds);
  } catch (error) {
    logger.error('Failed to set expire', {
      key,
      seconds,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createRedisClient,
  getRedisClient,
  healthCheck,
  getStats,
  closeRedis,
  clearAll,
  getKeys,
  mget,
  mset,
  exists,
  ttl,
  incr,
  incrby,
  decr,
  expire,
  REDIS_CONFIG
};
