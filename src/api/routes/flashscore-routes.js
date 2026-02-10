/**
 * Flashscore API Routes (Fastify)
 * Backend эндпоинты для работы с Flashscore API
 * 
 * @module flashscore-routes
 */

const queryExamples = require('../flashscore-query-examples');

/**
 * Регистрация роутов для Flashscore API
 * @param {FastifyInstance} fastify
 * @param {Object} options
 */
async function flashscoreRoutes(fastify, options) {
  const { sstatsClient } = options;

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  /**
   * Валидация параметров фильтрации
   */
  function validateFilters(filters) {
    const errors = [];
    
    if (filters.Limit) {
      const limit = parseInt(filters.Limit);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        errors.push('Limit must be between 1 and 1000');
      }
    }
    
    if (filters.Offset) {
      const offset = parseInt(filters.Offset);
      if (isNaN(offset) || offset < 0) {
        errors.push('Offset must be >= 0');
      }
    }
    
    if (filters.TimeZone) {
      const tz = parseInt(filters.TimeZone);
      if (isNaN(tz) || tz < -12 || tz > 12) {
        errors.push('TimeZone must be between -12 and 12');
      }
    }
    
    return errors;
  }

  // ============================================================
  // GAMES LIST ENDPOINTS
  // ============================================================

  /**
   * GET /api/flashscore/games
   * Получить список матчей с фильтрацией
   */
  fastify.get('/games', {
    schema: {
      description: 'Получить список матчей с фильтрацией',
      tags: ['Flashscore'],
      querystring: {
        type: 'object',
        properties: {
          Date: { type: 'string', format: 'date' },
          From: { type: 'string' },
          To: { type: 'string' },
          TimeZone: { type: 'integer', minimum: -12, maximum: 12 },
          Team: { type: 'string' },
          HomeTeam: { type: 'string' },
          AwayTeam: { type: 'string' },
          BothTeams: { type: 'string' },
          LeagueId: { type: 'string' },
          SeasonId: { type: 'string' },
          Years: { type: 'string' },
          Live: { type: 'boolean' },
          Ended: { type: 'boolean' },
          Upcoming: { type: 'boolean' },
          Status: { type: 'integer' },
          Limit: { type: 'integer', minimum: 1, maximum: 1000 },
          Offset: { type: 'integer', minimum: 0 },
          Order: { type: 'integer', enum: [-1, 1] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            count: { type: 'number' },
            offset: { type: 'number' },
            totalCount: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const filters = request.query;
    
    const validationErrors = validateFilters(filters);
    if (validationErrors.length > 0) {
      return reply.code(400).send({
        success: false,
        errors: validationErrors
      });
    }
    
    try {
      const result = await sstatsClient.getFlashscoreGames(filters);
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        offset: result.offset || 0,
        totalCount: result.TotalCount,
        filters: filters
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
   * POST /api/flashscore/games/query
   * Построение запроса из JSON body
   */
  fastify.post('/games/query', {
    schema: {
      description: 'Построение запроса из JSON body',
      tags: ['Flashscore'],
      body: {
        type: 'object'
      }
    }
  }, async (request, reply) => {
    const filters = request.body;
    
    const validationErrors = validateFilters(filters);
    if (validationErrors.length > 0) {
      return reply.code(400).send({
        success: false,
        errors: validationErrors
      });
    }
    
    try {
      const result = await sstatsClient.getFlashscoreGames(filters);
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        offset: result.offset || 0,
        totalCount: result.TotalCount
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
  // GAMES BY DATE
  // ============================================================

  /**
   * GET /api/flashscore/games/today
   */
  fastify.get('/games/today', {
    schema: {
      description: 'Матчи сегодня',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const timezone = parseInt(request.query.timezone || 3);
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Date: new Date().toISOString().split('T')[0],
        TimeZone: timezone,
        Order: request.query.order || 1
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        date: new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/tomorrow
   */
  fastify.get('/games/tomorrow', {
    schema: {
      description: 'Матчи завтра',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const timezone = parseInt(request.query.timezone || 3);
    const tomorrow = new Date(Date.now() + 86400000);
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Date: tomorrow.toISOString().split('T')[0],
        TimeZone: timezone
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        date: tomorrow.toISOString().split('T')[0]
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/date/:date
   */
  fastify.get('/games/date/:date', {
    schema: {
      description: 'Матчи за конкретную дату',
      tags: ['Flashscore'],
      params: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' }
        },
        required: ['date']
      }
    }
  }, async (request, reply) => {
    const { date } = request.params;
    const timezone = parseInt(request.query.timezone || 3);
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Date: date,
        TimeZone: timezone
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        date: date
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/range
   */
  fastify.get('/games/range', {
    schema: {
      description: 'Матчи за период',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { from, to } = request.query;
    
    if (!from || !to) {
      return reply.code(400).send({
        success: false,
        error: 'Parameters "from" and "to" are required'
      });
    }
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        From: from,
        To: to,
        TimeZone: parseInt(request.query.timezone || 3),
        Limit: parseInt(request.query.limit || 1000),
        Offset: parseInt(request.query.offset || 0),
        Order: parseInt(request.query.order || 1)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        offset: result.offset || 0,
        totalCount: result.TotalCount,
        range: { from, to }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // GAMES BY TEAM
  // ============================================================

  /**
   * GET /api/flashscore/games/team/:teamId
   */
  fastify.get('/games/team/:teamId', {
    schema: {
      description: 'Все матчи команды',
      tags: ['Flashscore'],
      params: {
        type: 'object',
        properties: {
          teamId: { type: 'string' }
        },
        required: ['teamId']
      }
    }
  }, async (request, reply) => {
    const { teamId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Team: teamId,
        Limit: parseInt(request.query.limit || 100),
        Offset: parseInt(request.query.offset || 0),
        Order: parseInt(request.query.order || -1)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        teamId: teamId
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/team/:teamId/upcoming
   */
  fastify.get('/games/team/:teamId/upcoming', {
    schema: {
      description: 'Предстоящие матчи команды',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { teamId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Team: teamId,
        Upcoming: true,
        Limit: parseInt(request.query.limit || 10),
        Order: 1
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        teamId: teamId
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/team/:teamId/recent
   */
  fastify.get('/games/team/:teamId/recent', {
    schema: {
      description: 'Последние матчи команды',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { teamId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Team: teamId,
        Ended: true,
        Limit: parseInt(request.query.limit || 10),
        Order: -1
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        teamId: teamId
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/h2h/:team1/:team2
   */
  fastify.get('/games/h2h/:team1/:team2', {
    schema: {
      description: 'История встреч между командами',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { team1, team2 } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        BothTeams: `${team1},${team2}`,
        Limit: parseInt(request.query.limit || 50),
        Order: parseInt(request.query.order || -1)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        teams: [team1, team2]
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // GAMES BY LEAGUE
  // ============================================================

  /**
   * GET /api/flashscore/games/league/:leagueId
   */
  fastify.get('/games/league/:leagueId', {
    schema: {
      description: 'Все матчи лиги',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { leagueId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        LeagueId: leagueId,
        Limit: parseInt(request.query.limit || 1000),
        Offset: parseInt(request.query.offset || 0),
        Order: parseInt(request.query.order || -1)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        offset: result.offset || 0,
        totalCount: result.TotalCount,
        leagueId: leagueId
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/league/:leagueId/today
   */
  fastify.get('/games/league/:leagueId/today', {
    schema: {
      description: 'Матчи лиги сегодня',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { leagueId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGames({
        LeagueId: leagueId,
        Date: new Date().toISOString().split('T')[0],
        TimeZone: parseInt(request.query.timezone || 3)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        leagueId: leagueId,
        date: new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // GAMES BY STATUS
  // ============================================================

  /**
   * GET /api/flashscore/games/live
   */
  fastify.get('/games/live', {
    schema: {
      description: 'Live матчи',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Live: true,
        Limit: parseInt(request.query.limit || 100)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/upcoming
   */
  fastify.get('/games/upcoming', {
    schema: {
      description: 'Предстоящие матчи',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Upcoming: true,
        Limit: parseInt(request.query.limit || 100),
        Order: 1
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/games/ended
   */
  fastify.get('/games/ended', {
    schema: {
      description: 'Завершённые матчи',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    try {
      const result = await sstatsClient.getFlashscoreGames({
        Ended: true,
        Limit: parseInt(request.query.limit || 100),
        Order: parseInt(request.query.order || -1)
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // GAME INFO
  // ============================================================

  /**
   * GET /api/flashscore/game/:gameId
   */
  fastify.get('/game/:gameId', {
    schema: {
      description: 'Детальная информация о матче',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { gameId } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreGameInfo(gameId);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // LEAGUES
  // ============================================================

  /**
   * GET /api/flashscore/leagues
   */
  fastify.get('/leagues', {
    schema: {
      description: 'Список лиг',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { guid, id, name } = request.query;
    
    const params = {};
    if (guid) params.guid = guid;
    if (id) params.id = id;
    if (name) params.name = name;
    
    try {
      const result = await sstatsClient.getFlashscoreLeagues(params);
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/flashscore/leagues/search/:query
   */
  fastify.get('/leagues/search/:query', {
    schema: {
      description: 'Поиск лиг по названию',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { query } = request.params;
    
    try {
      const result = await sstatsClient.getFlashscoreLeagues({
        name: query
      });
      
      return {
        success: true,
        data: result.data,
        count: result.count,
        query: query
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // SEASONS
  // ============================================================

  /**
   * GET /api/flashscore/seasons
   */
  fastify.get('/seasons', {
    schema: {
      description: 'Сезоны лиги',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { leagueUid, leagueId } = request.query;
    
    if (!leagueUid && !leagueId) {
      return reply.code(400).send({
        success: false,
        error: 'Parameter "leagueUid" or "leagueId" is required'
      });
    }
    
    const params = {};
    if (leagueUid) params.leagueUid = leagueUid;
    if (leagueId) params.leagueId = leagueId;
    
    try {
      const result = await sstatsClient.getFlashscoreSeasons(params);
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // QUERY EXAMPLES
  // ============================================================

  /**
   * GET /api/flashscore/examples
   */
  fastify.get('/examples', {
    schema: {
      description: 'Получить все примеры запросов',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const examples = queryExamples.getAllExamples();
    const categories = queryExamples.getCategories();
    
    return {
      success: true,
      categories: categories,
      examples: examples,
      count: examples.length
    };
  });

  /**
   * GET /api/flashscore/examples/category/:category
   */
  fastify.get('/examples/category/:category', {
    schema: {
      description: 'Получить примеры по категории',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { category } = request.params;
    const examples = queryExamples.getExamplesByCategory(category);
    
    return {
      success: true,
      category: category,
      examples: examples,
      count: examples.length
    };
  });

  /**
   * GET /api/flashscore/examples/:exampleId
   */
  fastify.get('/examples/:exampleId', {
    schema: {
      description: 'Получить пример по ID',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { exampleId } = request.params;
    const example = queryExamples.getExampleById(exampleId);
    
    if (!example) {
      return reply.code(404).send({
        success: false,
        error: 'Example not found'
      });
    }
    
    return {
      success: true,
      example: example
    };
  });

  /**
   * POST /api/flashscore/examples/:exampleId/execute
   */
  fastify.post('/examples/:exampleId/execute', {
    schema: {
      description: 'Выполнить пример запроса',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    const { exampleId } = request.params;
    const example = queryExamples.getExampleById(exampleId);
    
    if (!example) {
      return reply.code(404).send({
        success: false,
        error: 'Example not found'
      });
    }
    
    const params = {
      ...example.params,
      ...request.body
    };
    
    try {
      const result = await sstatsClient.getFlashscoreGames(params);
      
      return {
        success: true,
        example: example,
        params: params,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // HEALTH CHECK
  // ============================================================

  /**
   * GET /api/flashscore/health
   */
  fastify.get('/health', {
    schema: {
      description: 'Проверка работоспособности API',
      tags: ['Flashscore']
    }
  }, async (request, reply) => {
    return {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      endpoints: {
        games: '/api/flashscore/games',
        live: '/api/flashscore/games/live',
        upcoming: '/api/flashscore/games/upcoming',
        examples: '/api/flashscore/examples'
      }
    };
  });
}

module.exports = flashscoreRoutes;
