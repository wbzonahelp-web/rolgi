const logger = require("../monitoring/logger");
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
const { validateResponseStructure } = require('./response-types');
const { getRecoveryStrategy } = require('../monitoring/recovery-playbook');
const endpointManifest = require('./sstats-endpoints.manifest.json');


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
        'Accept': 'application/json'
      },
      // Add API key to all requests as query parameter (per OpenAPI spec)
      params: this.config.apiKey ? { apikey: this.config.apiKey } : {}
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
   * Получить турнирную таблицу (Flashscore)
   * @param {Object} params
   * @param {string} params.leagueId - ID лиги
   * @param {string} params.season - Сезон (необязательно)
   * @returns {Promise<Object>} Standings
   */
  async getStandings(params) {
    return this.get('/Ls/Standings', params);
  }

  // ============================================================
  // FLASHSCORE API ENDPOINTS (/Ls/*)
  // ============================================================

  /**
   * Получить список матчей Flashscore с фильтрацией
   * 
   * ⚠️ ВАЖНО: Обязательно укажите хотя бы один параметр фильтрации!
   * 
   * Основные возможности:
   * - Фильтрация по дате, лигам, командам, сезонам
   * - Поддержка пагинации (до 1000 матчей за запрос)
   * - Информация о счёте, времени, статусе матча
   * - Live, завершённые и предстоящие матчи
   * - Сортировка по дате
   * 
   * @param {Object} params - Параметры фильтрации
   * 
   * @param {string} [params.Id] - ID матча(ей) через запятую
   *   Пример: "abc123" или "abc123,def456"
   * 
   * @param {string} [params.LeagueId] - ID лиги
   *   Пример: "england/premier-league"
   * 
   * @param {string} [params.SeasonId] - Уникальный идентификатор сезона
   * 
   * @param {string} [params.Years] - Года сезона
   *   Пример: "2024-2025"
   * 
   * @param {string} [params.Date] - Конкретная дата (все матчи за день)
   *   Формат: YYYY-MM-DD
   *   Пример: "2025-06-21"
   * 
   * @param {string} [params.From] - Начальная дата/время
   *   Форматы:
   *   - Дата + время + часовой пояс: "2025-06-17T14:23:30+02:00"
   *   - Дата + время: "2025-06-17T14:23:30"
   *   - Дата + время (без секунд): "2025-06-17T14:23"
   *   - Дата: "2025-06-17"
   * 
   * @param {string} [params.To] - Конечная дата/время (строго до)
   *   Форматы аналогичны From
   *   ⚠️ Матчи ДО указанной даты, не включая её
   * 
   * @param {number|string} [params.Status] - Статус матча
   *   Статусы:
   *   - 1: Не начался
   *   - 2: В прямом эфире  
   *   - 3: Завершён
   *   - 5: Отменён
   *   - 6: Дополнительное время
   *   - 7: Пенальти
   *   - 9: Техническая победа
   *   - 10: После дополнительного времени
   *   - 11: После пенальти
   *   - 12: Первый тайм
   *   - 13: Второй тайм
   *   - 36: Прерван
   *   - 42: Ожидание обновлений
   *   - 43: Отложен
   *   - 45: К завершению
   *   - 46: Технический перерыв
   *   - 54: Присуждён
   * 
   * @param {string} [params.HomeTeam] - ID команды(-д) хозяев через запятую
   *   Примеры: "jk-arsenal/MgkAqSU0" или "MgkAqSU0,ALztxK6e"
   * 
   * @param {string} [params.AwayTeam] - ID команды(-д) гостей через запятую
   * 
   * @param {string} [params.Team] - ID одной из команд (хозяева ИЛИ гости)
   *   Примеры: "arsenal/hA1Zm19f" или "hA1Zm19f"
   * 
   * @param {string} [params.BothTeams] - ID двух команд для H2H (Head-to-Head)
   *   Формат: "teamId1,teamId2"
   *   Пример: "villa/ALztxK6e,chelsea/4fGZN2oK"
   * 
   * @param {boolean} [params.Ended] - Только завершенные матчи
   *   Статусы: 8, 9, 10, 17, 18
   * 
   * @param {boolean} [params.Live] - Только live матчи
   *   Статусы: 3, 4, 5, 6, 7, 11, 18, 19
   * 
   * @param {boolean} [params.Upcoming] - Только предстоящие матчи
   *   Дата начала > текущего времени + статусы: 1, 2
   * 
   * @param {number} [params.Offset=0] - Пропустить N матчей (0-2147483647)
   *   Для пагинации: сначала получаем 1000, потом Offset=1000, потом 2000...
   * 
   * @param {number} [params.Limit=1000] - Лимит результатов (1-1000)
   * 
   * @param {number} [params.Order] - Сортировка по дате
   *   - 1: по возрастанию (старые → новые)
   *   - -1: по убыванию (новые → старые)
   * 
   * @param {number} [params.TimeZone=3] - Часовой пояс (-12 до 12)
   *   По умолчанию: 3 (UTC+3)
   * 
   * @returns {Promise<Object>} FlashscoreGamesList
   *   {
   *     status: "OK",
   *     count: 321,
   *     data: [...],
   *     offset: 0,
   *     TotalCount: 321
   *   }
   * 
   * @example
   * // Матчи за конкретную дату
   * const games = await client.getFlashscoreGames({
   *   Date: '2025-06-21',
   *   TimeZone: 3
   * });
   * 
   * @example
   * // Матчи за период
   * const periodGames = await client.getFlashscoreGames({
   *   From: '2025-06-01',
   *   To: '2025-06-30'
   * });
   * 
   * @example
   * // Завершенные матчи лиги
   * const leagueGames = await client.getFlashscoreGames({
   *   LeagueId: 'england/premier-league',
   *   Ended: true
   * });
   * 
   * @example
   * // Текущие live матчи команды
   * const liveGames = await client.getFlashscoreGames({
   *   Team: 'arsenal/hA1Zm19f',
   *   Live: true
   * });
   * 
   * @example
   * // История встреч двух команд (H2H)
   * const h2h = await client.getFlashscoreGames({
   *   BothTeams: 'villa/ALztxK6e,chelsea/4fGZN2oK'
   * });
   * 
   * @example
   * // Пагинация - получить следующие 1000 матчей
   * const nextPage = await client.getFlashscoreGames({
   *   LeagueId: 'england/premier-league',
   *   Offset: 1000,
   *   Limit: 1000
   * });
   * 
   * @example
   * // Предстоящие матчи сезона, сортировка по дате
   * const upcoming = await client.getFlashscoreGames({
   *   Years: '2024-2025',
   *   Upcoming: true,
   *   Order: 1  // от ближайших к дальним
   * });
   */
  async getFlashscoreGames(params = {}) {
    return this.get('/Ls/List', params);
  }

  /**
   * Получить детальную информацию о матче Flashscore
   * 
   * Возвращает:
   * - Полные данные о матче
   * - Составы команд
   * - События матча (голы, карточки, замены)
   * - Букмекерские коэффициенты
   * - Статистику матча
   * - Хронологию событий
   * 
   * @param {string} gameId - ID матча Flashscore
   *   Пример: "000agg7D"
   * 
   * @returns {Promise<Object>} FlashscoreGameInfo
   * 
   * @example
   * // Получить полную информацию о матче
   * const gameInfo = await client.getFlashscoreGameInfo('000agg7D');
   * console.log(gameInfo.lineups);  // Составы
   * console.log(gameInfo.events);   // События
   * console.log(gameInfo.odds);     // Коэффициенты
   * console.log(gameInfo.stats);    // Статистика
   */
  async getFlashscoreGameInfo(gameId) {
    return this.get(`/Ls/GameInfo`, { id: gameId });
  }

  /**
   * Получить список лиг Flashscore с фильтрацией
   * 
   * Варианты использования:
   * - Без параметров: возвращает ВСЕ доступные лиги
   * - По GUID: получение конкретной лиги (наивысший приоритет)
   * - По ID: поиск по строковому идентификатору
   * - По названию: поиск лиг, содержащих подстроку (регистр НЕ учитывается)
   * 
   * Приоритет фильтров: GUID > ID > название
   * 
   * ⚠️ Если указан GUID, остальные параметры игнорируются
   * Фильтры ID и название могут применяться совместно
   * 
   * @param {Object} params - Параметры фильтрации
   * 
   * @param {string} [params.guid] - Уникальный GUID лиги
   *   Формат: UUID
   *   Пример: "4a491dde-d6f7-ed11-aee5-96d15e4a6f69"
   *   При указании возвращается только одна конкретная лига
   *   Приоритет: НАИВЫСШИЙ
   * 
   * @param {string} [params.id] - Строковый ID лиги
   *   Примеры: "england/premier-league", "spain/la-liga"
   *   Точный поиск
   *   Приоритет: СРЕДНИЙ
   * 
   * @param {string} [params.name] - Часть названия лиги
   *   Примеры: "Premier", "Liga", "Champions"
   *   Поиск по подстроке, регистр НЕ учитывается
   *   Приоритет: НИЗШИЙ
   * 
   * @returns {Promise<Object>} FlashscoreLeaguesList
   *   {
   *     status: "OK",
   *     count: 50,
   *     data: [...]
   *   }
   * 
   * @example
   * // Получить все лиги
   * const allLeagues = await client.getFlashscoreLeagues();
   * 
   * @example
   * // Поиск лиги по названию
   * const premierLeague = await client.getFlashscoreLeagues({
   *   name: 'Premier League'
   * });
   * 
   * @example
   * // Поиск по ID
   * const league = await client.getFlashscoreLeagues({
   *   id: 'england/premier-league'
   * });
   * 
   * @example
   * // Поиск по GUID (конкретная лига)
   * const leagueByGuid = await client.getFlashscoreLeagues({
   *   guid: '4a491dde-d6f7-ed11-aee5-96d15e4a6f69'
   * });
   * 
   * @example
   * // Все лиги с "Champions" в названии
   * const championsLeagues = await client.getFlashscoreLeagues({
   *   name: 'Champions'
   * });
   */
  async getFlashscoreLeagues(params = {}) {
    return this.get('/Ls/Leagues', params);
  }

  /**
   * Получить список сезонов для лиги Flashscore
   * 
   * Возвращает все сезоны указанной футбольной лиги.
   * 
   * ⚠️ ВАЖНО: Необходимо указать хотя бы один параметр идентификации лиги!
   * 
   * Способы идентификации лиги:
   * 1. По уникальному GUID (leagueUid)
   * 2. По строковому ID (leagueId)
   * 
   * @param {Object} params - Параметры запроса
   * 
   * @param {string} [params.leagueUid] - Уникальный GUID лиги
   *   Формат: UUID
   *   Пример: "4a491dde-d6f7-ed11-aee5-96d15e4a6f69"
   * 
   * @param {string} [params.leagueId] - Строковый ID лиги
   *   Примеры: "england/premier-league", "spain/la-liga"
   *   Альтернатива leagueUid
   * 
   * @returns {Promise<Object>} FlashscoreSeasons
   *   {
   *     status: "OK",
   *     count: 10,
   *     data: [
   *       {
   *         uid: "...",
   *         id: "england/premier-league-2024-2025",
   *         years: "2024-2025",
   *         league: { ... }
   *       }
   *     ]
   *   }
   * 
   * @example
   * // Получить сезоны по ID лиги
   * const seasons = await client.getFlashscoreSeasons({
   *   leagueId: 'england/premier-league'
   * });
   * 
   * @example
   * // Получить сезоны по GUID лиги
   * const seasonsByGuid = await client.getFlashscoreSeasons({
   *   leagueUid: '4a491dde-d6f7-ed11-aee5-96d15e4a6f69'
   * });
   * 
   * @example
   * // Использование результата
   * const seasons = await client.getFlashscoreSeasons({
   *   leagueId: 'spain/la-liga'
   * });
   * console.log(`Найдено сезонов: ${seasons.count}`);
   * seasons.data.forEach(season => {
   *   console.log(`${season.years}: ${season.id}`);
   * });
   */
  async getFlashscoreSeasons(params = {}) {
    return this.get('/Ls/Seasons', params);
  }

  /**
   * Поиск команд Flashscore по различным критериям
   * 
   * ⚠️ ВАЖНО: Должен быть указан хотя бы один параметр поиска!
   * 
   * Параметры поиска обрабатываются в порядке приоритета:
   * 1. uid (наивысший приоритет)
   * 2. id
   * 3. name
   * 
   * При поиске по названию используется частичное совпадение.
   * Возвращается максимум 100 команд.
   * 
   * @param {Object} params - Параметры поиска
   * 
   * @param {string} [params.uid] - Уникальный GUID команды
   *   Формат: UUID (GUID)
   *   Пример: "00a849a9-021a-11ee-a159-d8cb8ac15be9"
   *   Приоритет: ВЫСШИЙ
   * 
   * @param {string} [params.id] - Строковый ID команды
   *   Примеры: "arsenal/hA1Zm19f" или "hA1Zm19f"
   *   Приоритет: СРЕДНИЙ
   * 
   * @param {string} [params.name] - Название команды или его часть
   *   Пример: "Arsenal" или "Манчестер"
   *   Приоритет: НИЗШИЙ
   *   Поиск: частичное совпадение (содержит подстроку)
   * 
   * @returns {Promise<Object>} FlashscoreTeamsList
   *   {
   *     status: "OK",
   *     count: 2,
   *     data: [...]
   *   }
   * 
   * @example
   * // Поиск по названию (частичное совпадение)
   * const teams = await client.getFlashscoreTeams({
   *   name: 'Arsenal'
   * });
   * 
   * @example
   * // Поиск по строковому ID
   * const team = await client.getFlashscoreTeams({
   *   id: 'arsenal/hA1Zm19f'
   * });
   * 
   * @example
   * // Поиск по GUID (наивысший приоритет)
   * const teamByGuid = await client.getFlashscoreTeams({
   *   uid: '00a849a9-021a-11ee-a159-d8cb8ac15be9'
   * });
   * 
   * @example
   * // Поиск команд Манчестера (вернет Manchester City, Manchester United)
   * const manchesterTeams = await client.getFlashscoreTeams({
   *   name: 'Manchester'
   * });
   */
  async getFlashscoreTeams(params = {}) {
    return this.get('/Ls/Teams', params);
  }

  /**
   * Получить детальную информацию о команде Flashscore
   * 
   * Возвращает:
   * - Полные данные о клубе
   * - История выступлений
   * - Состав команды
   * - Статистика
   * 
   * @param {string} teamId - ID команды в формате "team-name/ID" или просто "ID"
   *   Примеры: "arsenal/hA1Zm19f" или "hA1Zm19f"
   * 
   * @returns {Promise<Object>} FlashscoreTeamDetails
   * 
   * @example
   * // С полным форматом
   * const arsenal = await client.getFlashscoreTeamInfo('arsenal/hA1Zm19f');
   * 
   * @example
   * // Только ID
   * const team = await client.getFlashscoreTeamInfo('hA1Zm19f');
   */
  async getFlashscoreTeamInfo(teamId) {
    return this.get(`/Ls/Teams/${teamId}`);
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

  // ============================================================
  // ADDITIONAL ENDPOINTS  
  // ============================================================

  async getLeagueDetails(leagueId) {
    return this.get(`/Leagues/${leagueId}`);
  }

  async getLeagueSeasons(leagueId) {
    return this.get(`/Leagues/${leagueId}/seasons`);
  }

  async getTeamGames(teamId, params = {}) {
    return this.get(`/Teams/${teamId}/games`, params);
  }

  async getTeamStats(teamId, params = {}) {
    return this.get(`/Teams/${teamId}/stats`, params);
  }

  async getPlayerGames(playerId, params = {}) {
    return this.get(`/Players/${playerId}/games`, params);
  }

  async getOddsLive(params = {}) {
    return this.get('/Odds/live', params);
  }

  async getOddsPrematch(params = {}) {
    return this.get('/Odds/prematch', params);
  }

  async getOddsHistory(gameId, params = {}) {
    return this.get(`/Odds/history/${gameId}`, params);
  }

  async getGameGlicko(gameId) {
    return this.get(`/Games/glicko/${gameId}`);
  }

  async getGameInjuries(gameId) {
    return this.get(`/Games/${gameId}/injuries`);
  }

  async getGameProfits(gameId, params = {}) {
    return this.get(`/Games/${gameId}/profits`, params);
  }

  /**
   * Продвинутый поиск игр с гибкой фильтрацией (Advanced Query)
   * 
   * Поддерживает:
   * - Сложные SQL-подобные условия (AND/OR логика)
   * - Выбор произвольных полей и вычисляемых выражений
   * - Математические операции в полях
   * - Гибкую сортировку
   * - Экспорт в JSON или CSV
   * 
   * @param {Object} queryParams - Параметры запроса
   * @param {string} queryParams.Condition - SQL-подобное условие фильтрации
   *   Примеры:
   *   - "LeagueId = 39 AND Year = 2024"
   *   - "(Winner1 >= 1.3 AND Winner1 <= 1.7) OR (Winner2 >= 1.3 AND Winner2 <= 1.7)"
   *   - "(ScoreHomeFT + ScoreAwayFT) > 3"
   *   - "HomeTeamName LIKE 'Arsenal' AND AwayTeamName LIKE '%Manchester%'"
   *   - "ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) > 1"
   *   - "(TotalShotsHome + TotalShotsAway) > 30 AND (ScoreHomeFT + ScoreAwayFT) < 2"
   * 
   * @param {Array<string>} queryParams.Fields - Массив полей для вывода
   *   Поддерживает:
   *   - Простые поля: ["Date", "HomeTeamName", "AwayTeamName"]
   *   - Математические выражения: ["ScoreHomeFT + ScoreAwayFT AS TotalGoals"]
   *   - Вычисляемые поля: ["(TotalShotsHome + TotalShotsAway) / (ScoreHomeFT + ScoreAwayFT + 0.1) AS ShotsPerGoal"]
   * 
   * @param {string} [queryParams.Order] - Порядок сортировки (необязательно)
   *   Примеры:
   *   - "Date DESC"
   *   - "TotalGoals DESC"
   *   - "OverPerformance DESC"
   * 
   * @param {string} [queryParams.format="json"] - Формат ответа (json или csv)
   * 
   * @returns {Promise<Object|string>} 
   *   - Если format="json": объект с массивом игр
   *   - Если format="csv": строка в CSV формате
   * 
   * @example
   * // Пример 1: Простой поиск матчей лиги
   * const result = await client.queryGamesAdvanced({
   *   Condition: "LeagueId = 39 AND Year = 2024",
   *   Fields: ["Date", "HomeTeamName", "AwayTeamName", "ScoreHomeFT", "ScoreAwayFT"],
   *   format: "json"
   * });
   * 
   * @example
   * // Пример 2: Поиск матчей с определенными коэффициентами
   * const result = await client.queryGamesAdvanced({
   *   Condition: "(Winner1 >= 1.3 AND Winner1 <= 1.7) OR (Winner2 >= 1.3 AND Winner2 <= 1.7)",
   *   Fields: ["Date", "HomeTeamName", "AwayTeamName", "Winner1", "WinnerX", "Winner2"],
   *   Order: "Date DESC",
   *   format: "json"
   * });
   * 
   * @example
   * // Пример 3: Результативные матчи с вычисляемым полем
   * const result = await client.queryGamesAdvanced({
   *   Condition: "(ScoreHomeFT + ScoreAwayFT) > 3",
   *   Fields: [
   *     "Date", "LeagueName", "HomeTeamName", "AwayTeamName",
   *     "ScoreHomeFT", "ScoreAwayFT",
   *     "ScoreHomeFT + ScoreAwayFT AS TotalGoals"
   *   ],
   *   Order: "TotalGoals DESC"
   * });
   * 
   * @example
   * // Пример 4: Анализ xG (ожидаемые голы)
   * const result = await client.queryGamesAdvanced({
   *   Condition: "ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) > 1",
   *   Fields: [
   *     "Date", "HomeTeamName", "ScoreHomeFT", "ExpectedGoalsHome",
   *     "ScoreHomeFT - ExpectedGoalsHome AS OverPerformance"
   *   ],
   *   Order: "OverPerformance DESC"
   * });
   * 
   * @example
   * // Пример 5: Поиск по названию команды
   * const result = await client.queryGamesAdvanced({
   *   Condition: "HomeTeamName LIKE 'Arsenal' AND AwayTeamName LIKE '%Manchester%'",
   *   Fields: ["Id", "Date", "HomeTeamName", "AwayTeamName"],
   *   Order: "Date DESC",
   *   format: "csv"
   * });
   * 
   * @example
   * // Пример 6: Матчи с большим количеством ударов, но малым количеством голов
   * const result = await client.queryGamesAdvanced({
   *   Condition: "(TotalShotsHome + TotalShotsAway) > 30 AND (ScoreHomeFT + ScoreAwayFT) < 2",
   *   Fields: [
   *     "Date", "HomeTeamName", "AwayTeamName",
   *     "TotalShotsHome", "TotalShotsAway",
   *     "ScoreHomeFT", "ScoreAwayFT",
   *     "(TotalShotsHome + TotalShotsAway) / (ScoreHomeFT + ScoreAwayFT + 0.1) AS ShotsPerGoal"
   *   ],
   *   Order: "ShotsPerGoal DESC"
   * });
   */
  async queryGamesAdvanced(queryParams) {
    // Валидация обязательных параметров
    if (!queryParams.Condition) {
      throw new Error('queryGamesAdvanced: параметр "Condition" обязателен');
    }
    
    if (!queryParams.Fields || !Array.isArray(queryParams.Fields) || queryParams.Fields.length === 0) {
      throw new Error('queryGamesAdvanced: параметр "Fields" должен быть непустым массивом');
    }

    // Формируем тело запроса
    const requestBody = {
      Condition: queryParams.Condition,
      Fields: queryParams.Fields,
      ...(queryParams.Order && { Order: queryParams.Order }),
      format: queryParams.format || 'json'
    };

    logger.debug({
      condition: requestBody.Condition,
      fieldsCount: requestBody.Fields.length,
      format: requestBody.format,
      hasOrder: !!requestBody.Order
    }, 'Executing advanced games query');

    // Если запрос в CSV формате, нужно изменить responseType
    const options = requestBody.format === 'csv' 
      ? { responseType: 'text', skipValidation: true }
      : {};

    return this.post('/Games/query', requestBody, options);
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
