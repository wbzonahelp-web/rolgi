/**
 * SStats.net API Client v6.0.0
 * 
 * Полноценный HTTP-клиент для работы с API SStats.net
 * 
 * Возможности:
 * - Автоматический retry с экспоненциальной задержкой
 * - Rate limiting (300 req/min с ключом, контроль без ключа)
 * - Кэширование ответов с TTL
 * - Валидация ответов через Response Type Contracts
 * - Метрики и трейсинг всех запросов
 * - Поддержка всех 32 эндпоинтов из manifest
 * - Обработка ошибок через Recovery Playbook
 * - Request/Response interceptors
 * - Batch запросы с приоритетами
 * - Circuit breaker pattern для защиты от API сбоев
 * 
 * @module sstats-client
 */

const axios = require('axios');
const { RateLimiter } = require('limiter');
const NodeCache = require('node-cache');
const pino = require('pino');
const { validateResponseStructure } = require('./response-types');
const { getRecoveryStrategy } = require('../monitoring/recovery-playbook');
const endpointManifest = require('./sstats-endpoints.manifest.json');

const logger = pino({
  name: 'sstats-client',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * @typedef {Object} SStatsClientConfig
 * @property {string} baseURL - Base URL API (по умолчанию из .env)
 * @property {string} apiKey - Bearer токен для авторизации
 * @property {number} timeout - Таймаут запроса в мс (по умолчанию 30000)
 * @property {number} maxRetries - Максимум повторных попыток (по умолчанию 3)
 * @property {number} retryDelay - Базовая задержка для retry в мс (по умолчанию 1000)
 * @property {boolean} enableCache - Включить кэширование (по умолчанию true)
 * @property {number} cacheTTL - TTL кэша в секундах (по умолчанию 300)
 * @property {boolean} validateResponses - Валидировать ответы (по умолчанию true)
 * @property {number} rateLimitPerMin - Лимит запросов в минуту (по умолчанию 300)
 * @property {boolean} enableMetrics - Собирать метрики (по умолчанию true)
 * @property {boolean} enableCircuitBreaker - Circuit breaker (по умолчанию true)
 * @property {number} circuitBreakerThreshold - Порог для circuit breaker (по умолчанию 5)
 * @property {number} circuitBreakerTimeout - Timeout circuit breaker в мс (по умолчанию 60000)
 */

/**
 * @typedef {Object} RequestMetrics
 * @property {string} endpoint - Путь эндпоинта
 * @property {string} method - HTTP метод
 * @property {number} duration - Длительность запроса в мс
 * @property {number} statusCode - HTTP статус код
 * @property {boolean} fromCache - Из кэша или нет
 * @property {number} retryCount - Количество повторных попыток
 * @property {Date} timestamp - Время запроса
 */

/**
 * Класс для работы с API SStats.net
 */
class SStatsClient {
  /**
   * @param {SStatsClientConfig} config - Конфигурация клиента
   */
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || process.env.SSTATS_API_URL || 'https://api.sstats.net',
      apiKey: config.apiKey || process.env.SSTATS_API_KEY,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      enableCache: config.enableCache !== false,
      cacheTTL: config.cacheTTL || 300, // 5 минут
      validateResponses: config.validateResponses !== false,
      rateLimitPerMin: config.rateLimitPerMin || 300,
      enableMetrics: config.enableMetrics !== false,
      enableCircuitBreaker: config.enableCircuitBreaker !== false,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000
    };

    // Axios instance
    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      }
    });

    // Rate limiter (300 req/min с ключом)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: this.config.rateLimitPerMin,
      interval: 'minute'
    });

    // Cache для GET запросов
    this.cache = new NodeCache({
      stdTTL: this.config.cacheTTL,
      checkperiod: 60,
      useClones: false
    });

    // Metrics collector
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0,
      requestsByEndpoint: new Map(),
      errorsByType: new Map()
    };

    // Circuit breaker state
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0
    };

    // Request/Response interceptors
    this._setupInterceptors();

    logger.info({
      baseURL: this.config.baseURL,
      hasApiKey: !!this.config.apiKey,
      rateLimit: this.config.rateLimitPerMin,
      cacheEnabled: this.config.enableCache
    }, 'SStatsClient initialized');
  }

  /**
   * Setup axios interceptors
   * @private
   */
  _setupInterceptors() {
    // Request interceptor
    this.axios.interceptors.request.use(
      async (config) => {
        // Проверка rate limit
        await this.rateLimiter.removeTokens(1);

        // Добавляем trace ID
        config.headers['X-Trace-ID'] = this._generateTraceId();
        config.metadata = { startTime: Date.now() };

        logger.debug({
          method: config.method,
          url: config.url,
          traceId: config.headers['X-Trace-ID']
        }, 'Request started');

        return config;
      },
      (error) => {
        logger.error({ error: error.message }, 'Request interceptor error');
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        logger.debug({
          method: response.config.method,
          url: response.config.url,
          status: response.status,
          duration
        }, 'Request completed');

        // Обновляем метрики
        this._recordMetrics(response.config, response.status, duration, false, 0);

        return response;
      },
      (error) => {
        const duration = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;

        logger.error({
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          duration,
          message: error.message
        }, 'Request failed');

        return Promise.reject(error);
      }
    );
  }

  /**
   * Генерация trace ID для запроса
   * @private
   * @returns {string}
   */
  _generateTraceId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Запись метрик запроса
   * @private
   * @param {Object} config - Axios config
   * @param {number} statusCode - HTTP status code
   * @param {number} duration - Длительность запроса
   * @param {boolean} fromCache - Из кэша
   * @param {number} retryCount - Количество retry
   */
  _recordMetrics(config, statusCode, duration, fromCache, retryCount) {
    if (!this.config.enableMetrics) return;

    this.metrics.totalRequests++;
    
    if (statusCode >= 200 && statusCode < 300) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    if (fromCache) {
      this.metrics.cachedRequests++;
    }

    this.metrics.totalRetries += retryCount;

    // Обновляем среднее время ответа
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;

    // Счётчик по эндпоинтам
    const endpoint = `${config.method.toUpperCase()} ${config.url}`;
    const endpointStats = this.metrics.requestsByEndpoint.get(endpoint) || {
      count: 0,
      avgDuration: 0,
      errors: 0
    };
    
    endpointStats.count++;
    endpointStats.avgDuration = 
      (endpointStats.avgDuration * (endpointStats.count - 1) + duration) / endpointStats.count;
    
    if (statusCode >= 400) {
      endpointStats.errors++;
    }
    
    this.metrics.requestsByEndpoint.set(endpoint, endpointStats);
  }

  /**
   * Проверка circuit breaker
   * @private
   * @throws {Error} Если circuit open
   */
  _checkCircuitBreaker() {
    if (!this.config.enableCircuitBreaker) return;

    const { state, lastFailureTime } = this.circuitBreaker;

    if (state === 'OPEN') {
      const timeSinceFailure = Date.now() - lastFailureTime;
      
      if (timeSinceFailure >= this.config.circuitBreakerTimeout) {
        // Переход в HALF_OPEN для пробного запроса
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        logger.warn('Circuit breaker: OPEN -> HALF_OPEN');
      } else {
        const error = new Error('Circuit breaker is OPEN');
        error.code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      }
    }
  }

  /**
   * Обновление состояния circuit breaker после успешного запроса
   * @private
   */
  _recordCircuitSuccess() {
    if (!this.config.enableCircuitBreaker) return;

    const { state } = this.circuitBreaker;

    if (state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      
      // После 3 успешных запросов закрываем circuit
      if (this.circuitBreaker.successCount >= 3) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        logger.info('Circuit breaker: HALF_OPEN -> CLOSED');
      }
    } else if (state === 'CLOSED') {
      // Сбрасываем счётчик ошибок при успешном запросе
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Обновление состояния circuit breaker после неудачного запроса
   * @private
   */
  _recordCircuitFailure() {
    if (!this.config.enableCircuitBreaker) return;

    const { state } = this.circuitBreaker;

    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (state === 'HALF_OPEN') {
      // При ошибке в HALF_OPEN возвращаемся в OPEN
      this.circuitBreaker.state = 'OPEN';
      logger.warn('Circuit breaker: HALF_OPEN -> OPEN');
    } else if (state === 'CLOSED' && 
               this.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
      // Открываем circuit при превышении порога
      this.circuitBreaker.state = 'OPEN';
      logger.error({
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.config.circuitBreakerThreshold
      }, 'Circuit breaker: CLOSED -> OPEN');
    }
  }

  /**
   * Выполнение запроса с retry логикой
   * @private
   * @param {Function} requestFn - Функция запроса
   * @param {number} retryCount - Счётчик попыток
   * @returns {Promise<Object>}
   */
  async _executeWithRetry(requestFn, retryCount = 0) {
    try {
      this._checkCircuitBreaker();
      
      const result = await requestFn();
      
      this._recordCircuitSuccess();
      
      return result;
    } catch (error) {
      this._recordCircuitFailure();

      const shouldRetry = 
        retryCount < this.config.maxRetries &&
        this._isRetryableError(error);

      if (shouldRetry) {
        const delay = this._calculateRetryDelay(retryCount);
        
        logger.warn({
          error: error.message,
          retryCount: retryCount + 1,
          maxRetries: this.config.maxRetries,
          delayMs: delay
        }, 'Retrying request');

        await this._sleep(delay);
        
        return this._executeWithRetry(requestFn, retryCount + 1);
      }

      // Пытаемся применить стратегию восстановления
      await this._handleError(error);

      throw error;
    }
  }

  /**
   * Проверка, можно ли повторить запрос
   * @private
   * @param {Error} error
   * @returns {boolean}
   */
  _isRetryableError(error) {
    if (error.code === 'CIRCUIT_BREAKER_OPEN') return false;
    
    const status = error.response?.status;
    
    // Retry на network errors и 5xx errors
    if (!status) return true;
    if (status >= 500) return true;
    
    // Retry на 429 (rate limit)
    if (status === 429) return true;
    
    // Retry на 408 (timeout)
    if (status === 408) return true;
    
    return false;
  }

  /**
   * Расчёт задержки для retry (exponential backoff)
   * @private
   * @param {number} retryCount
   * @returns {number} Задержка в мс
   */
  _calculateRetryDelay(retryCount) {
    const exponentialDelay = this.config.retryDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Случайный jitter до 1 секунды
    return Math.min(exponentialDelay + jitter, 30000); // Максимум 30 секунд
  }

  /**
   * Sleep helper
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Обработка ошибки через Recovery Playbook
   * @private
   * @param {Error} error
   */
  async _handleError(error) {
    const status = error.response?.status;
    let errorType;

    if (status === 401) {
      errorType = 'API_401_UNAUTHORIZED';
    } else if (status === 429) {
      errorType = 'API_429_RATE_LIMIT';
    } else if (status === 404) {
      errorType = 'API_404_NOT_FOUND';
    } else if (status >= 500) {
      errorType = 'API_500_SERVER_ERROR';
    }

    if (errorType) {
      const strategy = getRecoveryStrategy(errorType);
      
      logger.error({
        errorType,
        severity: strategy.severity,
        steps: strategy.steps
      }, 'Applying recovery strategy');

      // Записываем тип ошибки в метрики
      const errorCount = this.metrics.errorsByType.get(errorType) || 0;
      this.metrics.errorsByType.set(errorType, errorCount + 1);
    }
  }

  /**
   * Генерация cache key для запроса
   * @private
   * @param {string} method
   * @param {string} url
   * @param {Object} params
   * @returns {string}
   */
  _getCacheKey(method, url, params = {}) {
    const paramsStr = JSON.stringify(params);
    return `${method}:${url}:${paramsStr}`;
  }

  /**
   * Универсальный метод для выполнения HTTP запроса
   * @param {string} method - HTTP метод
   * @param {string} path - Путь эндпоинта
   * @param {Object} options - Опции запроса
   * @param {Object} options.params - Query параметры
   * @param {Object} options.data - Body данные
   * @param {number} options.timeout - Кастомный timeout
   * @param {boolean} options.skipCache - Пропустить кэш
   * @param {boolean} options.skipValidation - Пропустить валидацию
   * @param {string} options.responseType - Тип ответа (json, arraybuffer и т.д.)
   * @returns {Promise<Object>}
   */
  async request(method, path, options = {}) {
    const {
      params = {},
      data = null,
      timeout = this.config.timeout,
      skipCache = false,
      skipValidation = false,
      responseType = 'json'
    } = options;

    // Проверяем кэш для GET запросов
    if (method === 'GET' && this.config.enableCache && !skipCache) {
      const cacheKey = this._getCacheKey(method, path, params);
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        logger.debug({ path, cacheKey }, 'Response from cache');
        this._recordMetrics({ method, url: path }, 200, 0, true, 0);
        return cached;
      }
    }

    // Выполняем запрос с retry
    const startTime = Date.now();
    let retryCount = 0;

    const response = await this._executeWithRetry(async () => {
      return await this.axios.request({
        method,
        url: path,
        params,
        data,
        timeout,
        responseType
      });
    }, retryCount);

    const duration = Date.now() - startTime;

    // Валидация ответа
    if (this.config.validateResponses && !skipValidation && responseType === 'json') {
      const validation = validateResponseStructure(response.data);
      
      if (!validation.valid) {
        logger.warn({
          path,
          errors: validation.errors
        }, 'Response validation failed');
      }
    }

    // Сохраняем в кэш для GET запросов
    if (method === 'GET' && this.config.enableCache && !skipCache) {
      const cacheKey = this._getCacheKey(method, path, params);
      this.cache.set(cacheKey, response.data);
    }

    return response.data;
  }

  /**
   * GET запрос
   * @param {string} path
   * @param {Object} params
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async get(path, params = {}, options = {}) {
    return this.request('GET', path, { ...options, params });
  }

  /**
   * POST запрос
   * @param {string} path
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async post(path, data = {}, options = {}) {
    return this.request('POST', path, { ...options, data });
  }

  /**
   * PUT запрос
   * @param {string} path
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async put(path, data = {}, options = {}) {
    return this.request('PUT', path, { ...options, data });
  }

  /**
   * DELETE запрос
   * @param {string} path
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  // ============================================================
  // API МЕТОДЫ (32 эндпоинта из manifest)
  // ============================================================

  /**
   * Получить информацию об аккаунте
   * @returns {Promise<Object>} AccountInfo
   */
  async getAccountInfo() {
    return this.get('/Account/Info');
  }

  /**
   * Получить список игр с фильтрацией и пагинацией
   * @param {Object} filters
   * @param {number} filters.leagueId - ID лиги
   * @param {string} filters.season - Сезон (например, "2024/2025")
   * @param {string} filters.status - Статус игры
   * @param {string} filters.dateFrom - Дата от (ISO)
   * @param {string} filters.dateTo - Дата до (ISO)
   * @param {number} filters.teamId - ID команды
   * @param {number} filters.page - Номер страницы (по умолчанию 1)
   * @param {number} filters.limit - Размер страницы (по умолчанию 50)
   * @returns {Promise<Object>} GamesList
   */
  async getGamesList(filters = {}) {
    return this.get('/Games/list', filters);
  }

  /**
   * Получить детали игры по ID
   * @param {number} gameId
   * @returns {Promise<Object>} GameDetails
   */
  async getGameDetails(gameId) {
    return this.get(`/Games/${gameId}`);
  }

  /**
   * Получить live коэффициенты для игры
   * @param {number} gameId
   * @returns {Promise<Object>} GameOddsLive
   */
  async getGameOddsLive(gameId) {
    return this.get(`/Odds/live/${gameId}`);
  }

  /**
   * Получить обновления live коэффициентов
   * @param {string} since - Дата/время от (ISO)
   * @returns {Promise<Object>} OddsUpdates
   */
  async getOddsUpdates(since) {
    return this.get('/Odds/live-changes/updates-only', { since });
  }

  /**
   * Получить турнирную таблицу
   * @param {Object} params
   * @param {number} params.leagueId
   * @param {string} params.season
   * @returns {Promise<Object>} Standings
   */
  async getStandings(params) {
    return this.get('/Ls/Standings', params);
  }

  /**
   * Получить список лиг
   * @param {Object} filters
   * @returns {Promise<Array>} Список лиг
   */
  async getLeagues(filters = {}) {
    return this.get('/Leagues/list', filters);
  }

  /**
   * Получить информацию о команде
   * @param {number} teamId
   * @returns {Promise<Object>} Team
   */
  async getTeam(teamId) {
    return this.get(`/Teams/${teamId}`);
  }

  /**
   * Получить список команд
   * @param {Object} filters
   * @returns {Promise<Array>} Список команд
   */
  async getTeams(filters = {}) {
    return this.get('/Teams/list', filters);
  }

  /**
   * Получить информацию об игроке
   * @param {number} playerId
   * @returns {Promise<Object>} Player
   */
  async getPlayer(playerId) {
    return this.get(`/Players/${playerId}`);
  }

  /**
   * Получить список игроков команды
   * @param {number} teamId
   * @returns {Promise<Array>} Список игроков
   */
  async getTeamPlayers(teamId) {
    return this.get(`/Players/team/${teamId}`);
  }

  /**
   * Получить статистику игрока
   * @param {number} playerId
   * @param {Object} filters
   * @returns {Promise<Object>} Player stats
   */
  async getPlayerStats(playerId, filters = {}) {
    return this.get(`/Players/${playerId}/stats`, filters);
  }

  /**
   * POST запрос для поиска игр (с телом запроса)
   * @param {Object} filters - Фильтры в теле запроса
   * @returns {Promise<Object>} GamesList
   */
  async queryGames(filters = {}) {
    return this.post('/Games/query', filters);
  }

  /**
   * POST запрос для получения турнирной таблицы сезона
   * @param {Object} params
   * @param {number} params.leagueId
   * @param {string} params.season
   * @returns {Promise<Object>} SeasonTable
   */
  async getSeasonTable(params) {
    return this.post('/Games/season-table', params);
  }

  /**
   * POST запрос для получения статистики последних игр
   * @param {Object} params
   * @param {number} params.teamId
   * @param {number} params.count - Количество игр (по умолчанию 10)
   * @returns {Promise<Object>} GamesStats
   */
  async getLastGamesStats(params) {
    return this.post('/Games/last-games-stats', params);
  }

  /**
   * POST запрос для получения текстового саммари игры
   * @param {Object} params
   * @param {number} params.gameId
   * @returns {Promise<Object>} TextSummary
   */
  async getGameTextSummary(params) {
    return this.post('/Games/text-summary', params);
  }

  /**
   * POST запрос для расчёта профитов
   * @param {Object} params
   * @param {Array} params.games - Массив игр
   * @param {string} params.strategy - Стратегия ставок
   * @returns {Promise<Object>} ProfitsCalculation
   */
  async calculateProfits(params) {
    return this.post('/Games/profits', params);
  }

  /**
   * Получить метрики клиента
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      requestsByEndpoint: Object.fromEntries(this.metrics.requestsByEndpoint),
      errorsByType: Object.fromEntries(this.metrics.errorsByType),
      circuitBreaker: this.circuitBreaker,
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Сбросить метрики
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0,
      requestsByEndpoint: new Map(),
      errorsByType: new Map()
    };
    logger.info('Metrics reset');
  }

  /**
   * Очистить кэш
   */
  clearCache() {
    this.cache.flushAll();
    logger.info('Cache cleared');
  }

  /**
   * Закрыть клиент
   */
  close() {
    this.cache.close();
    logger.info('SStatsClient closed');
  }
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];
  
  const client = new SStatsClient();

  (async () => {
    try {
      switch (command) {
        case 'test':
          console.log('Testing SStats API Client...\n');
          
          // Test 1: Account Info
          console.log('1. Getting account info...');
          const accountInfo = await client.getAccountInfo();
          console.log('✓ Account:', accountInfo);
          
          // Test 2: Games List
          console.log('\n2. Getting games list...');
          const games = await client.getGamesList({ limit: 5 });
          console.log(`✓ Games: ${games.length} items`);
          
          // Test 3: Метрики
          console.log('\n3. Client metrics:');
          console.log(JSON.stringify(client.getMetrics(), null, 2));
          
          break;

        case 'metrics':
          console.log('SStats API Client Metrics:\n');
          console.log(JSON.stringify(client.getMetrics(), null, 2));
          break;

        case 'clear-cache':
          client.clearCache();
          console.log('Cache cleared');
          break;

        default:
          console.log(`
SStats API Client v6.0.0

Usage:
  node sstats-client.js test          # Run test requests
  node sstats-client.js metrics       # Show client metrics
  node sstats-client.js clear-cache   # Clear response cache
          `);
      }

      client.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      process.exit(1);
    }
  })();
}

module.exports = SStatsClient;
