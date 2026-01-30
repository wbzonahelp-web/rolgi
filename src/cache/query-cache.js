/**
 * Redis Query Cache
 * 
 * @module cache/query-cache
 * @description
 * Кэширование запросов к базе данных с использованием Redis.
 * Поддерживает автоматическую инвалидацию, TTL и cache warming.
 */

const { getRedisClient } = require('./redis-client');
const logger = require('../monitoring/logger');

/**
 * Конфигурация TTL для разных типов данных (в секундах)
 */
const CACHE_TTL = {
  // Краткосрочные данные (часто меняются)
  live_games: 10, // 10 секунд для live игр
  game_details: 30, // 30 секунд для деталей игры
  live_odds: 15, // 15 секунд для live коэффициентов
  
  // Среднесрочные данные
  games_list: 300, // 5 минут для списка игр
  standings: 600, // 10 минут для турнирных таблиц
  team_stats: 600, // 10 минут для статистики команд
  player_stats: 600, // 10 минут для статистики игроков
  
  // Долгосрочные данные (редко меняются)
  teams: 3600, // 1 час для списка команд
  players: 3600, // 1 час для списка игроков
  leagues: 7200, // 2 часа для лиг
  seasons: 86400, // 24 часа для сезонов
  
  // Справочные данные
  countries: 86400, // 24 часа
  bookmakers: 86400 // 24 часа
};

/**
 * Статистика кэша
 */
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0
};

class QueryCache {
  constructor(redis = null) {
    this.redis = redis || getRedisClient();
    this.namespace = 'cache';
  }

  /**
   * Получение данных из кэша
   * @param {string} key - Ключ кэша
   * @returns {Object|null} Данные или null
   */
  async get(key) {
    try {
      const cacheKey = this._buildKey(key);
      const data = await this.redis.get(cacheKey);

      if (data) {
        cacheStats.hits++;
        logger.debug({ key, cacheKey }, 'Cache hit');
        return JSON.parse(data);
      }

      cacheStats.misses++;
      logger.debug({ key, cacheKey }, 'Cache miss');
      return null;
    } catch (error) {
      cacheStats.errors++;
      logger.error({
        key,
        error: error.message
      }, 'Cache get error');
      return null;
    }
  }

  /**
   * Сохранение данных в кэш
   * @param {string} key - Ключ кэша
   * @param {Object} data - Данные для кэширования
   * @param {number} ttl - TTL в секундах (опционально)
   */
  async set(key, data, ttl = null) {
    try {
      const cacheKey = this._buildKey(key);
      const value = JSON.stringify(data);

      if (ttl) {
        await this.redis.setex(cacheKey, ttl, value);
      } else {
        await this.redis.set(cacheKey, value);
      }

      cacheStats.sets++;
      logger.debug({
        key,
        cacheKey,
        ttl,
        size: value.length
      }, 'Cache set');

      return true;
    } catch (error) {
      cacheStats.errors++;
      logger.error({
        key,
        error: error.message
      }, 'Cache set error');
      return false;
    }
  }

  /**
   * Удаление из кэша
   * @param {string} key - Ключ кэша
   */
  async delete(key) {
    try {
      const cacheKey = this._buildKey(key);
      await this.redis.del(cacheKey);

      cacheStats.deletes++;
      logger.debug({ key, cacheKey }, 'Cache delete');

      return true;
    } catch (error) {
      cacheStats.errors++;
      logger.error({
        key,
        error: error.message
      }, 'Cache delete error');
      return false;
    }
  }

  /**
   * Удаление по паттерну
   * @param {string} pattern - Паттерн для поиска ключей
   */
  async deletePattern(pattern) {
    try {
      const fullPattern = `${this.namespace}:${pattern}`;
      const keys = await this.redis.keys(fullPattern);

      if (keys.length === 0) {
        return 0;
      }

      // Удаляем префикс для del команды
      const keysWithoutPrefix = keys.map(key => 
        key.replace(`rolgi:${this.namespace}:`, '')
      );

      const deleted = await this.redis.del(...keysWithoutPrefix);

      cacheStats.deletes += deleted;
      logger.info({
        pattern,
        deleted
      }, 'Cache pattern delete');

      return deleted;
    } catch (error) {
      cacheStats.errors++;
      logger.error({
        pattern,
        error: error.message
      }, 'Cache pattern delete error');
      return 0;
    }
  }

  /**
   * Wrap функция для автоматического кэширования
   * @param {string} key - Ключ кэша
   * @param {Function} fetchFn - Функция для получения данных
   * @param {number} ttl - TTL в секундах
   * @param {boolean} forceRefresh - Принудительное обновление
   */
  async wrap(key, fetchFn, ttl = 300, forceRefresh = false) {
    try {
      // Проверяем кэш
      if (!forceRefresh) {
        const cached = await this.get(key);
        if (cached !== null) {
          return cached;
        }
      }

      // Получаем данные
      const data = await fetchFn();

      // Сохраняем в кэш
      if (data !== null && data !== undefined) {
        await this.set(key, data, ttl);
      }

      return data;
    } catch (error) {
      logger.error({
        key,
        error: error.message
      }, 'Cache wrap error');
      
      // При ошибке возвращаем результат fetchFn без кэширования
      return await fetchFn();
    }
  }

  /**
   * Кэширование списка игр
   */
  async cacheGames(filters = {}, data) {
    const key = this._buildGamesKey(filters);
    const ttl = this._isLiveFilter(filters) ? CACHE_TTL.live_games : CACHE_TTL.games_list;
    return await this.set(key, data, ttl);
  }

  /**
   * Получение списка игр из кэша
   */
  async getGames(filters = {}) {
    const key = this._buildGamesKey(filters);
    return await this.get(key);
  }

  /**
   * Инвалидация кэша игр
   */
  async invalidateGames(filters = {}) {
    if (Object.keys(filters).length === 0) {
      // Удаляем все игры
      return await this.deletePattern('games:*');
    }

    const key = this._buildGamesKey(filters);
    return await this.delete(key);
  }

  /**
   * Кэширование деталей игры
   */
  async cacheGameDetails(gameId, data) {
    const key = `game:${gameId}`;
    const ttl = data.status && this._isLiveStatus(data.status) 
      ? CACHE_TTL.game_details 
      : CACHE_TTL.games_list;
    return await this.set(key, data, ttl);
  }

  /**
   * Получение деталей игры
   */
  async getGameDetails(gameId) {
    const key = `game:${gameId}`;
    return await this.get(key);
  }

  /**
   * Инвалидация игры
   */
  async invalidateGame(gameId) {
    const key = `game:${gameId}`;
    await this.delete(key);
    
    // Также инвалидируем списки, где может быть эта игра
    await this.deletePattern('games:*');
  }

  /**
   * Кэширование турнирной таблицы
   */
  async cacheStandings(leagueId, seasonId, data) {
    const key = `standings:${leagueId}:${seasonId}`;
    return await this.set(key, data, CACHE_TTL.standings);
  }

  /**
   * Получение турнирной таблицы
   */
  async getStandings(leagueId, seasonId) {
    const key = `standings:${leagueId}:${seasonId}`;
    return await this.get(key);
  }

  /**
   * Инвалидация турнирной таблицы
   */
  async invalidateStandings(leagueId, seasonId = null) {
    if (seasonId) {
      const key = `standings:${leagueId}:${seasonId}`;
      return await this.delete(key);
    }
    
    // Удаляем все турнирные таблицы лиги
    return await this.deletePattern(`standings:${leagueId}:*`);
  }

  /**
   * Кэширование команды
   */
  async cacheTeam(teamId, data) {
    const key = `team:${teamId}`;
    return await this.set(key, data, CACHE_TTL.teams);
  }

  /**
   * Получение команды
   */
  async getTeam(teamId) {
    const key = `team:${teamId}`;
    return await this.get(key);
  }

  /**
   * Кэширование списка команд
   */
  async cacheTeams(filters = {}, data) {
    const key = this._buildTeamsKey(filters);
    return await this.set(key, data, CACHE_TTL.teams);
  }

  /**
   * Получение списка команд
   */
  async getTeams(filters = {}) {
    const key = this._buildTeamsKey(filters);
    return await this.get(key);
  }

  /**
   * Инвалидация команды
   */
  async invalidateTeam(teamId) {
    await this.delete(`team:${teamId}`);
    await this.deletePattern('teams:*');
  }

  /**
   * Кэширование игрока
   */
  async cachePlayer(playerId, data) {
    const key = `player:${playerId}`;
    return await this.set(key, data, CACHE_TTL.players);
  }

  /**
   * Получение игрока
   */
  async getPlayer(playerId) {
    const key = `player:${playerId}`;
    return await this.get(key);
  }

  /**
   * Кэширование коэффициентов
   */
  async cacheOdds(gameId, data) {
    const key = `odds:${gameId}`;
    return await this.set(key, data, CACHE_TTL.live_odds);
  }

  /**
   * Получение коэффициентов
   */
  async getOdds(gameId) {
    const key = `odds:${gameId}`;
    return await this.get(key);
  }

  /**
   * Инвалидация коэффициентов
   */
  async invalidateOdds(gameId) {
    const key = `odds:${gameId}`;
    return await this.delete(key);
  }

  /**
   * Получение статистики кэша
   */
  getStats() {
    const total = cacheStats.hits + cacheStats.misses;
    const hitRate = total > 0 ? (cacheStats.hits / total * 100).toFixed(2) : 0;

    return {
      ...cacheStats,
      total,
      hitRate: parseFloat(hitRate)
    };
  }

  /**
   * Сброс статистики
   */
  resetStats() {
    cacheStats.hits = 0;
    cacheStats.misses = 0;
    cacheStats.sets = 0;
    cacheStats.deletes = 0;
    cacheStats.errors = 0;
  }

  /**
   * Очистка всего кэша
   */
  async flush() {
    try {
      const deleted = await this.deletePattern('*');
      logger.info({ deleted }, 'Cache flushed');
      return deleted;
    } catch (error) {
      logger.error('Cache flush error', { error: error.message });
      return 0;
    }
  }

  /**
   * Cache warming - предварительная загрузка популярных данных
   */
  async warmUp(dbPool) {
    logger.info('Starting cache warm-up...');

    try {
      const client = await dbPool.connect();

      try {
        // Загружаем популярные лиги
        const leagues = await client.query(`
          SELECT * FROM leagues 
          WHERE is_popular = true 
          LIMIT 20
        `);

        for (const league of leagues.rows) {
          await this.set(`league:${league.league_id}`, league, CACHE_TTL.leagues);
        }

        // Загружаем live игры
        const liveGames = await client.query(`
          SELECT * FROM games 
          WHERE status IN ('live', 'first_half', 'second_half', 'half_time')
          LIMIT 50
        `);

        await this.set('games:live', liveGames.rows, CACHE_TTL.live_games);

        logger.info({
          leagues: leagues.rows.length,
          liveGames: liveGames.rows.length
        }, 'Cache warm-up completed');

      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Cache warm-up error', { error: error.message });
    }
  }

  /**
   * Построение ключа с namespace
   */
  _buildKey(key) {
    return `${this.namespace}:${key}`;
  }

  /**
   * Построение ключа для games с фильтрами
   */
  _buildGamesKey(filters) {
    const parts = ['games'];
    
    if (filters.league_id) parts.push(`l${filters.league_id}`);
    if (filters.season) parts.push(`s${filters.season}`);
    if (filters.status) parts.push(`st${filters.status}`);
    if (filters.date_from) parts.push(`df${filters.date_from}`);
    if (filters.date_to) parts.push(`dt${filters.date_to}`);
    if (filters.team_id) parts.push(`t${filters.team_id}`);
    if (filters.limit) parts.push(`lim${filters.limit}`);
    if (filters.offset) parts.push(`off${filters.offset}`);

    return parts.join(':');
  }

  /**
   * Построение ключа для teams с фильтрами
   */
  _buildTeamsKey(filters) {
    const parts = ['teams'];
    
    if (filters.league_id) parts.push(`l${filters.league_id}`);
    if (filters.country_id) parts.push(`c${filters.country_id}`);
    if (filters.limit) parts.push(`lim${filters.limit}`);
    if (filters.offset) parts.push(`off${filters.offset}`);

    return parts.join(':');
  }

  /**
   * Проверка, является ли фильтр live
   */
  _isLiveFilter(filters) {
    if (!filters.status) return false;
    return this._isLiveStatus(filters.status);
  }

  /**
   * Проверка, является ли статус live
   */
  _isLiveStatus(status) {
    const liveStatuses = ['live', 'first_half', 'second_half', 'half_time', 'extra_time', 'penalties'];
    return liveStatuses.includes(status);
  }
}

module.exports = QueryCache;
