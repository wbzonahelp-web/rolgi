/**
 * API Cache Module
 * 
 * @module cache/api-cache
 * @description
 * Универсальная система кэширования API запросов.
 * Поддерживает Redis (если доступен) и in-memory fallback.
 * 
 * TTL по типам данных:
 * - Leagues: 1 час (редко меняются)
 * - Games list: 30 секунд (часто обновляются)
 * - Game details: 60 секунд
 * - Live games: 10 секунд
 * - Odds: 30 секунд
 * - Teams/Players: 1 час
 * - Statistics: 5 минут
 */

const NodeCache = require('node-cache');
const crypto = require('crypto');

// In-memory cache fallback
const memoryCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 30,
  useClones: false,
  maxKeys: 10000
});

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0,
  startTime: Date.now()
};

// TTL Configuration (in seconds)
const TTL_CONFIG = {
  // Static data - long cache
  'leagues': 3600,           // 1 hour
  'teams': 3600,             // 1 hour  
  'players': 3600,           // 1 hour
  'bookmakers': 3600,        // 1 hour
  'seasons': 1800,           // 30 minutes
  'standings': 300,          // 5 minutes
  
  // Semi-dynamic data
  'games-list': 30,          // 30 seconds
  'games-list-today': 30,    // 30 seconds
  'games-list-ended': 120,   // 2 minutes (historical)
  'game-details': 60,        // 1 minute
  'game-stats': 60,          // 1 minute
  'game-h2h': 300,           // 5 minutes
  'text-summary': 300,       // 5 minutes
  'profits': 300,            // 5 minutes
  'injuries': 300,           // 5 minutes
  'avg-stats': 300,          // 5 minutes
  'season-table': 300,       // 5 minutes
  'glicko': 300,             // 5 minutes
  
  // Live data - short cache
  'games-live': 10,          // 10 seconds
  'odds': 30,                // 30 seconds
  'odds-live': 10,           // 10 seconds
  'live-changes': 10,        // 10 seconds
  
  // Default
  'default': 60              // 1 minute
};

/**
 * Generate cache key from URL and params
 * @param {string} url - API URL
 * @param {object} params - Query parameters
 * @returns {string} Cache key
 */
function generateCacheKey(url, params = {}) {
  const normalizedUrl = url.replace(/^https?:\/\/[^/]+/, '');
  const sortedParams = Object.keys(params)
    .filter(k => k !== 'apikey') // Exclude API key from cache key
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  
  const keyString = `${normalizedUrl}?${sortedParams}`;
  const hash = crypto.createHash('md5').update(keyString).digest('hex').slice(0, 12);
  
  return `api:${hash}`;
}

/**
 * Determine cache type from URL
 * @param {string} url - API URL
 * @param {object} params - Query parameters
 * @returns {string} Cache type
 */
function getCacheType(url, params = {}) {
  const path = url.toLowerCase();
  
  // Leagues
  if (path.includes('/leagues')) return 'leagues';
  
  // Teams
  if (path.includes('/teams')) return 'teams';
  
  // Players
  if (path.includes('/players')) return 'players';
  
  // Bookmakers
  if (path.includes('/bookmakers')) return 'bookmakers';
  
  // Seasons
  if (path.includes('/seasons') || path.includes('/ls/seasons')) return 'seasons';
  
  // Standings
  if (path.includes('/standings')) return 'standings';
  
  // Game details
  if (path.match(/\/games\/\d+$/)) return 'game-details';
  
  // Glicko
  if (path.includes('/glicko')) return 'glicko';
  
  // Season table
  if (path.includes('/season-table')) return 'season-table';
  
  // Injuries
  if (path.includes('/injuries')) return 'injuries';
  
  // Average stats
  if (path.includes('/last-games-stats')) return 'avg-stats';
  
  // Text summary
  if (path.includes('/text-summary')) return 'text-summary';
  
  // Profits
  if (path.includes('/profits')) return 'profits';
  
  // Live odds
  if (path.includes('/odds/live')) return 'odds-live';
  
  // Live changes
  if (path.includes('/live-changes')) return 'live-changes';
  
  // Regular odds
  if (path.includes('/odds')) return 'odds';
  
  // Games list
  if (path.includes('/games/list') || path.includes('/ls/list')) {
    if (params.Live === 'true' || params.live === 'true') return 'games-live';
    if (params.Ended === 'true' || params.ended === 'true') return 'games-list-ended';
    if (params.today === 'true' || params.Today === 'true') return 'games-list-today';
    return 'games-list';
  }
  
  return 'default';
}

/**
 * Get TTL for cache type
 * @param {string} cacheType - Cache type
 * @returns {number} TTL in seconds
 */
function getTTL(cacheType) {
  return TTL_CONFIG[cacheType] || TTL_CONFIG.default;
}

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached data or null
 */
async function get(key) {
  try {
    const data = memoryCache.get(key);
    if (data !== undefined) {
      cacheStats.hits++;
      return data;
    }
    cacheStats.misses++;
    return null;
  } catch (error) {
    cacheStats.errors++;
    console.error('Cache get error:', error.message);
    return null;
  }
}

/**
 * Set cached data
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - TTL in seconds
 * @returns {Promise<boolean>} Success status
 */
async function set(key, data, ttl) {
  try {
    memoryCache.set(key, data, ttl);
    cacheStats.sets++;
    return true;
  } catch (error) {
    cacheStats.errors++;
    console.error('Cache set error:', error.message);
    return false;
  }
}

/**
 * Delete cached data
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function del(key) {
  try {
    memoryCache.del(key);
    cacheStats.deletes++;
    return true;
  } catch (error) {
    cacheStats.errors++;
    return false;
  }
}

/**
 * Clear all cache
 * @returns {Promise<boolean>} Success status
 */
async function clear() {
  try {
    memoryCache.flushAll();
    return true;
  } catch (error) {
    cacheStats.errors++;
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
function getStats() {
  const memStats = memoryCache.getStats();
  const uptime = Math.floor((Date.now() - cacheStats.startTime) / 1000);
  const hitRate = cacheStats.hits + cacheStats.misses > 0
    ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(2)
    : 0;
  
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: `${hitRate}%`,
    sets: cacheStats.sets,
    deletes: cacheStats.deletes,
    errors: cacheStats.errors,
    keys: memStats.keys,
    uptimeSeconds: uptime,
    memoryKB: Math.round(process.memoryUsage().heapUsed / 1024)
  };
}

/**
 * Cached fetch wrapper
 * @param {string} url - API URL
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Response data
 */
async function cachedFetch(url, options = {}) {
  const urlObj = new URL(url);
  const params = Object.fromEntries(urlObj.searchParams);
  
  const cacheKey = generateCacheKey(url, params);
  const cacheType = getCacheType(url, params);
  const ttl = getTTL(cacheType);
  
  // Check cache
  const cached = await get(cacheKey);
  if (cached) {
    return {
      data: cached,
      fromCache: true,
      cacheType,
      ttl
    };
  }
  
  // Fetch from API
  const axios = require('axios');
  const response = await axios.get(url, {
    timeout: 30000,
    ...options
  });
  
  const data = response.data;
  
  // Store in cache
  await set(cacheKey, data, ttl);
  
  return {
    data,
    fromCache: false,
    cacheType,
    ttl
  };
}

module.exports = {
  generateCacheKey,
  getCacheType,
  getTTL,
  get,
  set,
  del,
  clear,
  getStats,
  cachedFetch,
  TTL_CONFIG
};
