/**
 * Games API Routes
 * REST endpoints для работы с матчами (GET /games/list)
 * 
 * @module games-routes
 * @version 2.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

const GamesQueryBuilder = require('../games-query-builder');
const gamesExamples = require('../games-query-examples');

/**
 * Регистрация маршрутов для Games API
 * @param {FastifyInstance} fastify - Экземпляр Fastify
 * @param {Object} options - Опции
 * @param {SStatsClient} options.sstatsClient - Клиент SStats API
 */
async function gamesRoutes(fastify, options) {
  const { sstatsClient } = options;

  if (!sstatsClient) {
    throw new Error('sstatsClient is required for games routes');
  }

  // ===========================================================================
  // GET /api/games/list - Получить список матчей с фильтрами
  // ===========================================================================
  fastify.get('/list', {
    schema: {
      tags: ['Games'],
      description: 'Получить список футбольных матчей с возможностью фильтрации',
      querystring: {
        type: 'object',
        properties: {
          Id: { type: 'string', description: 'Список ID матчей через запятую' },
          FlashId: { type: 'string', description: 'Список FlashId через запятую' },
          LeagueId: { type: 'integer', description: 'ID лиги' },
          SeasonUid: { type: 'string', description: 'GUID сезона' },
          Year: { type: 'integer', description: 'Год' },
          From: { type: 'string', description: 'Дата начала (DateTimeOffset)' },
          To: { type: 'string', description: 'Дата окончания (DateTimeOffset)' },
          HomeTeam: { type: 'integer', description: 'ID домашней команды' },
          AwayTeam: { type: 'integer', description: 'ID выездной команды' },
          Team: { type: 'integer', description: 'ID команды (домашняя или выездная)' },
          BothTeams: { type: 'string', description: 'Список ID обеих команд через запятую' },
          Status: { type: 'integer', description: 'Статус матча (byte)' },
          Ended: { type: 'boolean', description: 'Завершенные матчи' },
          Live: { type: 'boolean', description: 'Живые матчи' },
          Upcoming: { type: 'boolean', description: 'Предстоящие матчи' },
          Offset: { type: 'integer', description: 'Смещение для пагинации' },
          Limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Количество записей (1-1000)' },
          Order: { type: 'integer', enum: [-1, 1], description: 'Порядок сортировки (-1 desc, 1 asc)' },
          IncludeOdds: { type: 'boolean', description: 'Включить коэффициенты' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            count: { type: 'integer' },
            totalCount: { type: 'integer' },
            data: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Валидация: должен быть хотя бы один параметр фильтра
      if (Object.keys(request.query).length === 0) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'At least one filter parameter is required',
          errors: ['No filter parameters provided']
        });
      }

      // Вызов SStats API
      const result = await sstatsClient.get('/games/list', request.query);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        totalCount: result.totalCount || result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching games list:', error);
      return reply.code(error.statusCode || 500).send({
        success: false,
        status: 'ERROR',
        message: error.message || 'Internal server error',
        errors: [error.message]
      });
    }
  });

  // ===========================================================================
  // GET /api/games/today - Получить матчи на сегодня
  // ===========================================================================
  fastify.get('/today', {
    schema: {
      tags: ['Games'],
      description: 'Получить матчи на сегодня',
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .forToday()
        .limit(request.query.Limit || 100)
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching today matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/live - Получить живые матчи
  // ===========================================================================
  fastify.get('/live', {
    schema: {
      tags: ['Games'],
      description: 'Получить живые матчи',
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .liveOnly()
        .limit(request.query.Limit || 100)
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching live matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/upcoming - Получить предстоящие матчи
  // ===========================================================================
  fastify.get('/upcoming', {
    schema: {
      tags: ['Games'],
      description: 'Получить предстоящие матчи',
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .upcomingOnly()
        .limit(request.query.Limit || 100)
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching upcoming matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/ended - Получить завершенные матчи
  // ===========================================================================
  fastify.get('/ended', {
    schema: {
      tags: ['Games'],
      description: 'Получить завершенные матчи',
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .endedOnly()
        .limit(request.query.Limit || 100)
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching ended matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/date/:date - Получить матчи за конкретную дату
  // ===========================================================================
  fastify.get('/date/:date', {
    schema: {
      tags: ['Games'],
      description: 'Получить матчи за конкретную дату',
      params: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Дата в формате YYYY-MM-DD' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .forDate(request.params.date)
        .limit(500)
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching matches by date:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/team/:teamId - Получить матчи команды
  // ===========================================================================
  fastify.get('/team/:teamId', {
    schema: {
      tags: ['Games'],
      description: 'Получить матчи команды',
      params: {
        type: 'object',
        required: ['teamId'],
        properties: {
          teamId: { type: 'integer', description: 'ID команды' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          Ended: { type: 'boolean', description: 'Только завершенные матчи' },
          Live: { type: 'boolean', description: 'Только живые матчи' },
          Upcoming: { type: 'boolean', description: 'Только предстоящие матчи' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const builder = new GamesQueryBuilder()
        .forTeam(request.params.teamId)
        .limit(request.query.Limit || 50)
        .orderByDateDesc();

      if (request.query.Ended) builder.endedOnly();
      if (request.query.Live) builder.liveOnly();
      if (request.query.Upcoming) builder.upcomingOnly();

      const query = builder.build();
      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching team matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/league/:leagueId - Получить матчи лиги
  // ===========================================================================
  fastify.get('/league/:leagueId', {
    schema: {
      tags: ['Games'],
      description: 'Получить матчи лиги',
      params: {
        type: 'object',
        required: ['leagueId'],
        properties: {
          leagueId: { type: 'integer', description: 'ID лиги' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          Year: { type: 'integer', description: 'Год сезона' },
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const builder = new GamesQueryBuilder()
        .forLeague(request.params.leagueId)
        .limit(request.query.Limit || 100);

      if (request.query.Year) {
        builder.forYear(request.query.Year);
      }

      const query = builder.build();
      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching league matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/h2h/:team1/:team2 - Получить матчи Head to Head
  // ===========================================================================
  fastify.get('/h2h/:team1/:team2', {
    schema: {
      tags: ['Games'],
      description: 'Получить матчи между двумя командами (Head to Head)',
      params: {
        type: 'object',
        required: ['team1', 'team2'],
        properties: {
          team1: { type: 'integer', description: 'ID первой команды' },
          team2: { type: 'integer', description: 'ID второй команды' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          Limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const query = new GamesQueryBuilder()
        .bothTeams([parseInt(request.params.team1), parseInt(request.params.team2)])
        .limit(request.query.Limit || 20)
        .orderByDateDesc()
        .build();

      const result = await sstatsClient.get('/games/list', query.params);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching H2H matches:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/:gameId - Получить детальную информацию о матче
  // ===========================================================================
  fastify.get('/:gameId', {
    schema: {
      tags: ['Games'],
      description: 'Получить полные данные о конкретном матче (game, statistics, lineups, events)',
      params: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: { 
            type: 'string', 
            description: 'SStats.net ID (числовой) или Flashscore ID (строковый)' 
          }
        }
      }
      // Убираем response schema, так как структура ответа слишком сложная
      // и Fastify будет удалять неописанные поля
    }
  }, async (request, reply) => {
    try {
      const gameId = request.params.gameId;
      fastify.log.info(`Fetching game details for ID: ${gameId}`);
      
      // Используем встроенный метод клиента для получения деталей матча
      // skipValidation: true - отключаем валидацию из-за сложной структуры ответа
      const result = await sstatsClient.get(`/Games/${gameId}`, {}, { skipValidation: true });
      
      fastify.log.info(`Received result with keys: ${Object.keys(result)}`);
      fastify.log.info(`Result.data exists: ${!!result.data}`);
      
      // API возвращает структуру: { status, data: {...}, traceId }
      // Нам нужно вернуть только data
      return {
        success: true,
        status: result.status || 'OK',
        data: result.data || {}
      };
    } catch (error) {
      fastify.log.error('Error fetching game details:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Game with ID ${request.params.gameId} not found`
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/glicko/:gameId - Получить Glicko 2 рейтинги и прогноз
  // ===========================================================================
  fastify.get('/glicko/:gameId', {
    schema: {
      tags: ['Games'],
      description: 'Получить Glicko 2 рейтинги команд и предсказание вероятностей победы',
      params: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: { 
            type: 'string', 
            description: 'SStats.net ID (числовой) или Flashscore ID (строковый)' 
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const gameId = request.params.gameId;
      fastify.log.info(`Fetching Glicko 2 ratings for game ID: ${gameId}`);
      
      // Используем встроенный метод клиента для получения Glicko рейтингов
      const result = await sstatsClient.get(`/Games/glicko/${gameId}`, {}, { skipValidation: true });
      
      fastify.log.info(`Glicko 2 data received for game ${gameId}`);
      
      // API возвращает структуру: { status, data: {...}, traceId }
      return {
        success: true,
        status: result.status || 'OK',
        data: result.data || {}
      };
    } catch (error) {
      fastify.log.error('Error fetching Glicko 2 ratings:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Glicko 2 ratings not found for game ${request.params.gameId}`
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/last-games-stats - Получить среднюю статистику по последним матчам
  // ===========================================================================
  fastify.get('/last-games-stats', {
    schema: {
      tags: ['Games'],
      description: 'Получить среднюю статистику команд по последним матчам (анализ формы)',
      querystring: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: { 
            type: 'string', 
            description: 'ID матча (SStats ID или Flashscore ID)' 
          },
          limit: { 
            type: 'integer', 
            minimum: 5, 
            maximum: 30, 
            default: 25,
            description: 'Лимит количества последних матчей (от 5 до 30)' 
          },
          sameLeague: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только матчи в той же лиге' 
          },
          homeAway: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только домашние/выездные матчи' 
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { gameId, limit = 25, sameLeague = false, homeAway = false } = request.query;
      
      if (!gameId) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'gameId parameter is required'
        });
      }
      
      fastify.log.info(`Fetching last games stats for game ${gameId} (limit: ${limit}, sameLeague: ${sameLeague}, homeAway: ${homeAway})`);
      
      // Строим query parameters
      const params = {
        gameId,
        limit,
        sameLeague,
        homeAway
      };
      
      // Используем метод клиента для получения статистики
      const result = await sstatsClient.get('/Games/last-games-stats', params, { skipValidation: true });
      
      fastify.log.info(`Last games stats received for game ${gameId}`);
      
      // API возвращает данные напрямую (home, away), без обертки data
      return {
        success: true,
        status: 'OK',
        data: result.data || result  // Используем result напрямую, если нет data
      };
    } catch (error) {
      fastify.log.error('Error fetching last games stats:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Last games stats not found for game ${request.query.gameId}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid parameters'
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/text-summary - Получить текстовую сводку матча
  // ===========================================================================
  fastify.get('/text-summary', {
    schema: {
      tags: ['Games'],
      description: 'Генерирует детальную текстовую сводку по футбольному матчу с анализом',
      querystring: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { 
            type: 'string', 
            description: 'ID матча (SStats ID или Flashscore ID)' 
          },
          limit: { 
            type: 'integer', 
            minimum: 5, 
            maximum: 30, 
            default: 25,
            description: 'Лимит количества последних матчей для анализа' 
          },
          sameLeague: { 
            type: 'boolean', 
            default: true,
            description: 'Учитывать только матчи из той же лиги' 
          },
          homeAway: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только домашние/выездные матчи' 
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id, limit = 25, sameLeague = true, homeAway = false } = request.query;
      
      if (!id) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'id parameter is required'
        });
      }
      
      fastify.log.info(`Fetching text summary for game ${id} (limit: ${limit}, sameLeague: ${sameLeague}, homeAway: ${homeAway})`);
      
      // Строим query parameters
      const params = {
        id,
        limit,
        sameLeague,
        homeAway
      };
      
      // Используем метод клиента для получения текстовой сводки
      const result = await sstatsClient.get('/Games/text-summary', params, { skipValidation: true });
      
      fastify.log.info(`Text summary received for game ${id}`);
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result
      };
    } catch (error) {
      fastify.log.error('Error fetching text summary:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Text summary not found for game ${request.query.id}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid parameters'
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/profits - Получить анализ прибыльности ставок
  // ===========================================================================
  fastify.get('/profits', {
    schema: {
      tags: ['Games'],
      description: 'Получить детальный анализ прибыльности ставок для матча на основе исторических данных',
      querystring: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: { 
            type: 'integer', 
            description: 'ID матча (уникальный идентификатор)' 
          },
          thisLeague: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только игры в той же лиге' 
          },
          homeAway: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только домашние/выездные игры команды' 
          },
          sameGames: { 
            type: 'boolean', 
            default: false,
            description: 'Учитывать только игры с похожими xG (разница <= 0.2)' 
          },
          bookieId: { 
            type: ['integer', 'string'],
            description: 'ID букмекера (опционально)' 
          },
          limit: { 
            type: 'integer', 
            minimum: 5, 
            maximum: 100, 
            default: 25,
            description: 'Количество последних матчей для анализа' 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            data: { 
              type: 'object',
              additionalProperties: true
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { 
        gameId, 
        thisLeague = false, 
        homeAway = false, 
        sameGames = false, 
        bookieId, 
        limit = 25 
      } = request.query;
      
      if (!gameId) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'gameId parameter is required'
        });
      }
      
      fastify.log.info(`Fetching profits analysis for game ${gameId} (thisLeague: ${thisLeague}, homeAway: ${homeAway}, sameGames: ${sameGames}, limit: ${limit})`);
      
      // Строим query parameters
      const params = {
        gameId,
        thisLeague,
        homeAway,
        sameGames,
        limit
      };
      
      // Добавляем bookieId если указан
      if (bookieId !== undefined) {
        params.bookieId = bookieId;
      }
      
      // Используем метод клиента для получения анализа прибыльности
      const result = await sstatsClient.get('/Games/profits', params, { skipValidation: true });
      
      fastify.log.info(`Profits analysis received for game ${gameId}`);
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result
      };
    } catch (error) {
      fastify.log.error('Error fetching profits analysis:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Profits analysis not found for game ${request.query.gameId}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid parameters'
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/injuries - Получить список травмированных игроков
  // ===========================================================================
  fastify.get('/injuries', {
    schema: {
      tags: ['Games'],
      description: 'Получить список травмированных игроков (не заявленных на матч из-за травмы)',
      querystring: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: { 
            type: ['integer', 'string'],
            description: 'ID матча (уникальный идентификатор)' 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            data: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  gameId: { type: 'integer' },
                  player: {
                    type: 'object',
                    properties: {
                      id: { type: ['integer', 'null'] },
                      name: { type: 'string' }
                    }
                  },
                  teamId: { type: 'integer' },
                  reason: { type: ['string', 'null'] }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { gameId } = request.query;
      
      if (!gameId) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'gameId parameter is required'
        });
      }
      
      fastify.log.info(`Fetching injuries for game ${gameId}`);
      
      // Строим query parameters
      const params = { gameId };
      
      // Используем метод клиента для получения списка травмированных
      const result = await sstatsClient.get('/Games/injuries', params, { skipValidation: true });
      
      fastify.log.info(`Injuries data received for game ${gameId}`);
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result || []
      };
    } catch (error) {
      fastify.log.error('Error fetching injuries:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Injuries data not found for game ${request.query.gameId}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid parameters'
        });
      }
      
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/examples - Получить примеры запросов
  // ===========================================================================
  fastify.get('/examples', {
    schema: {
      tags: ['Games'],
      description: 'Получить примеры запросов к Games API',
      querystring: {
        type: 'object',
        properties: {
          category: { 
            type: 'string', 
            enum: ['DATE', 'TEAM', 'LEAGUE', 'STATUS', 'COMBINED', 'ADVANCED', 'POPULAR', 'SPECIAL', 'PAGINATION', 'ANALYTICS'],
            description: 'Категория примеров' 
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { category } = request.query;

      if (category) {
        // Вернуть примеры для конкретной категории
        const categoryExamples = gamesExamples.categories[category] || [];
        const examplesData = {};
        
        categoryExamples.forEach(funcName => {
          if (gamesExamples[funcName]) {
            const result = gamesExamples[funcName]();
            examplesData[funcName] = result;
          }
        });

        return {
          success: true,
          status: 'OK',
          category,
          count: Object.keys(examplesData).length,
          examples: examplesData
        };
      }

      // Вернуть все категории
      const allCategories = Object.keys(gamesExamples.categories);
      const categoriesData = {};

      allCategories.forEach(cat => {
        categoriesData[cat] = gamesExamples.categories[cat].length;
      });

      return {
        success: true,
        status: 'OK',
        totalCategories: allCategories.length,
        totalExamples: allCategories.reduce((sum, cat) => sum + gamesExamples.categories[cat].length, 0),
        categories: categoriesData,
        usage: {
          getAll: '/api/games/examples',
          getByCategory: '/api/games/examples?category=DATE'
        }
      };
    } catch (error) {
      fastify.log.error('Error fetching games examples:', error);
      return reply.code(500).send({
        success: false,
        status: 'ERROR',
        message: error.message
      });
    }
  });

  // ===========================================================================
  // GET /api/games/health - Health check
  // ===========================================================================
  fastify.get('/health', {
    schema: {
      tags: ['Games'],
      description: 'Games API health check'
    }
  }, async (request, reply) => {
    return {
      status: 'healthy',
      service: 'Games API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  });
}

module.exports = gamesRoutes;
