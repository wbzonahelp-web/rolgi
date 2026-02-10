/**
 * Proxy Routes for SStats API
 * Прокси-маршруты для фронтенда
 * 
 * @module proxy-routes
 */

const axios = require('axios');

/**
 * Регистрация прокси-роутов
 * @param {FastifyInstance} fastify
 */
async function proxyRoutes(fastify) {
  const SSTATS_API_BASE = 'https://api.sstats.net';
  const API_KEY = process.env.SSTATS_API_KEY;

  // Create axios instance for SStats API
  const apiClient = axios.create({
    baseURL: SSTATS_API_BASE,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    // Add API key to all requests as query parameter
    params: API_KEY ? { apikey: API_KEY } : {}
  });

  // ============================================================
  // GAMES ENDPOINTS
  // ============================================================

  /**
   * GET /api/proxy/games
   * Прокси для получения списка матчей
   */
  fastify.get('/games', {
    schema: {
      description: 'Получить список матчей из SStats API',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          Id: { type: 'string' },
          FlashId: { type: 'string' },
          LeagueId: { type: 'integer' },
          SeasonUid: { type: 'string' },
          Year: { type: 'integer' },
          Date: { type: 'string' },
          From: { type: 'string' },
          To: { type: 'string' },
          Status: { type: 'integer' },
          HomeTeam: { type: 'string' },
          AwayTeam: { type: 'string' },
          Team: { type: 'string' },
          BothTeams: { type: 'string' },
          Ended: { type: 'boolean' },
          Live: { type: 'boolean' },
          Upcoming: { type: 'boolean' },
          Today: { type: 'boolean' },
          Offset: { type: 'integer' },
          Limit: { type: 'integer' },
          Order: { type: 'integer' },
          TimeZone: { type: 'integer' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const response = await apiClient.get('/Games/list', {
        params: request.query
      });

      return {
        success: true,
        data: response.data.data || response.data,
        count: response.data.count,
        totalCount: response.data.TotalCount
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message,
        details: error.response?.data
      });
    }
  });

  /**
   * GET /api/proxy/games/:id
   * Получить детали конкретного матча
   */
  fastify.get('/games/:id', {
    schema: {
      description: 'Получить детали матча',
      tags: ['Proxy'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const response = await apiClient.get(`/Games/${id}`);

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/proxy/games/:id/glicko
   * Получить Glicko 2 рейтинг и xG
   */
  fastify.get('/games/:id/glicko', {
    schema: {
      description: 'Получить Glicko 2 рейтинг матча',
      tags: ['Proxy']
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const response = await apiClient.get(`/Games/glicko/${id}`);

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/proxy/games/:id/text-summary
   * Получить текстовую сводку матча
   */
  fastify.get('/games/:id/text-summary', {
    schema: {
      description: 'Получить текстовую сводку матча',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 25 },
          sameLeague: { type: 'boolean', default: true },
          homeAway: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { limit = 25, sameLeague = true, homeAway = false } = request.query;
      
      const response = await apiClient.get('/Games/text-summary', {
        params: { id, limit, sameLeague, homeAway }
      });

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/proxy/games/:id/last-games-stats
   * Получить среднюю статистику
   */
  fastify.get('/games/:id/last-games-stats', {
    schema: {
      description: 'Получить среднюю статистику по последним матчам',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 25 },
          sameLeague: { type: 'boolean', default: false },
          homeAway: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { limit = 25, sameLeague = false, homeAway = false } = request.query;
      
      const response = await apiClient.get('/Games/last-games-stats', {
        params: { gameId: id, limit, sameLeague, homeAway }
      });

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/proxy/games/:id/profits
   * Калькуляция прибыли
   */
  fastify.get('/games/:id/profits', {
    schema: {
      description: 'Калькуляция прибыли по видам ставок',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          thisLeague: { type: 'boolean', default: false },
          homeAway: { type: 'boolean', default: false },
          limit: { type: 'integer', default: 10 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const params = { gameId: id, ...request.query };
      
      const response = await apiClient.get('/Games/profits', { params });

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // QUERY ENDPOINT
  // ============================================================

  /**
   * POST /api/proxy/games/query
   * Расширенный поиск матчей с SQL-подобным синтаксисом
   * 
   * Примеры:
   * - Простой поиск: {"Condition": "LeagueId = 39 AND Year = 2024", "Fields": ["Id", "Date", "HomeTeamName"]}
   * - С коэффициентами: {"Condition": "(Winner1 >= 1.3 AND Winner1 <= 1.7)", "Fields": ["Date", "HomeTeamName", "Winner1"]}
   * - Вычисляемые поля: {"Condition": "Status = 8", "Fields": ["HomeTeamName", "ScoreHomeFT + ScoreAwayFT AS TotalGoals"]}
   * - Поиск по строке: {"Condition": "HomeTeamName LIKE '%Arsenal%'", "Fields": ["Id", "Date", "HomeTeamName"]}
   */
  fastify.post('/games/query', {
    schema: {
      description: 'Расширенный поиск матчей с SQL-подобным синтаксисом',
      tags: ['Proxy'],
      body: {
        type: 'object',
        properties: {
          Condition: { 
            type: 'string',
            description: 'SQL-подобное условие фильтрации. Операторы: =, !=, >, <, >=, <=, IN, NOT IN, LIKE, AND, OR'
          },
          Fields: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Массив полей для вывода. Поддерживает математические выражения и псевдонимы (AS)'
          },
          Order: { 
            type: 'string',
            description: 'Сортировка: поле ASC/DESC (например: "Date DESC")'
          },
          Limit: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            description: 'Максимальное количество записей (1-1000)'
          },
          Offset: {
            type: 'integer',
            minimum: 0,
            description: 'Пропустить первые N записей'
          },
          Timezone: {
            type: 'integer',
            minimum: -12,
            maximum: 12,
            default: 3,
            description: 'Часовой пояс (-12 до +12)'
          },
          Format: { 
            type: 'string', 
            enum: ['json', 'csv'],
            default: 'json',
            description: 'Формат вывода: json или csv'
          }
        },
        required: ['Condition', 'Fields']
      }
    }
  }, async (request, reply) => {
    try {
      // Передаём все параметры напрямую в API
      const response = await apiClient.post('/Games/query', request.body);

      // Для CSV возвращаем как есть
      if (request.body.Format === 'csv' || request.body.format === 'csv') {
        reply.header('Content-Type', 'text/csv');
        return response.data;
      }

      return {
        success: true,
        count: response.data.count || (response.data.data ? response.data.data.length : 0),
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message,
        details: error.response?.data
      });
    }
  });

  // ============================================================
  // SEASON TABLE
  // ============================================================

  /**
   * GET /api/proxy/season-table
   * Турнирная таблица
   */
  fastify.get('/season-table', {
    schema: {
      description: 'Получить турнирную таблицу',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          league: { type: 'integer' },
          year: { type: 'integer' },
          limit: { type: 'integer' },
          format: { type: 'string' },
          fields: { type: 'string' },
          orderField: { type: 'string' }
        },
        required: ['league', 'year']
      }
    }
  }, async (request, reply) => {
    try {
      const response = await apiClient.get('/Games/season-table', {
        params: request.query
      });

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // LEAGUES
  // ============================================================

  /**
   * GET /api/proxy/leagues
   * Список лиг
   */
  fastify.get('/leagues', {
    schema: {
      description: 'Получить список лиг',
      tags: ['Proxy']
    }
  }, async (request, reply) => {
    try {
      const response = await apiClient.get('/Leagues');

      return {
        success: true,
        data: response.data.data || response.data
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // LIVE ENDPOINTS
  // ============================================================

  /**
   * GET /api/proxy/live
   * Текущие live матчи
   */
  fastify.get('/live', {
    schema: {
      description: 'Получить live матчи',
      tags: ['Proxy']
    }
  }, async (request, reply) => {
    try {
      const response = await apiClient.get('/Games/list', {
        params: { Live: true, Limit: 100 }
      });

      return {
        success: true,
        data: response.data.data || response.data,
        count: response.data.count || (response.data.data ? response.data.data.length : 0)
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/proxy/today
   * Матчи сегодня
   */
  fastify.get('/today', {
    schema: {
      description: 'Получить матчи на сегодня',
      tags: ['Proxy'],
      querystring: {
        type: 'object',
        properties: {
          TimeZone: { type: 'integer', default: 3 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const timezone = request.query.TimeZone || 3;
      const response = await apiClient.get('/Games/list', {
        params: { Today: true, TimeZone: timezone }
      });

      return {
        success: true,
        data: response.data.data || response.data,
        count: response.data.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = proxyRoutes;
