/**
 * Players API Routes
 * Маршруты для работы с игроками
 * 
 * @module players-routes
 * @version 1.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

/**
 * Register Players API routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 * @param {Object} options.sstatsClient - SStats API client instance
 */
async function playersRoutes(fastify, options) {
  const { sstatsClient } = options;

  if (!sstatsClient) {
    throw new Error('sstatsClient is required in options');
  }

  // ===========================================================================
  // GET /api/players/find - Поиск игрока по имени
  // ===========================================================================
  fastify.get('/find', {
    schema: {
      tags: ['Players'],
      description: 'Поиск футболистов по имени или его части. Поиск не чувствителен к регистру. Максимум 100 результатов.',
      querystring: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            description: 'Имя или часть имени игрока для поиска (минимум 1 символ)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            count: { type: 'integer' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name } = request.query;
      
      if (!name) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: 'name parameter is required (minimum 1 character)'
        });
      }
      
      fastify.log.info(`Searching for players with name: ${name}`);
      
      // Поиск игроков
      const result = await sstatsClient.get('/Players/find', { name }, { skipValidation: true });
      
      const count = result.data?.length || 0;
      fastify.log.info(`Found ${count} players matching "${name}"`);
      
      return {
        success: true,
        status: 'OK',
        count,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error searching players:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `No players found matching "${request.query.name}"`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid search parameters'
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
  // GET /api/players/:id/events - Получить события игрока
  // ===========================================================================
  fastify.get('/:id/events', {
    schema: {
      tags: ['Players'],
      description: 'Получить список событий игрока (голы, карточки, замены и т.д.) в хронологическом порядке. Поддерживает пагинацию.',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'integer',
            description: 'Уникальный идентификатор игрока'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          includeAssists: {
            type: 'boolean',
            default: false,
            description: 'Включать ли события где игрок является ассистентом (по умолчанию false)'
          },
          offset: {
            type: 'integer',
            minimum: 0,
            maximum: 2147483647,
            default: 0,
            description: 'Количество записей для пропуска (для пагинации)'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 1000,
            description: 'Максимальное количество записей в ответе (1-1000)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            count: { type: 'integer' },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { includeAssists = false, offset = 0, limit = 1000 } = request.query;
      
      fastify.log.info(`Fetching events for player ${id} (includeAssists: ${includeAssists}, offset: ${offset}, limit: ${limit})`);
      
      // Строим параметры запроса
      const params = {
        includeAssists,
        offset,
        limit
      };
      
      // Получаем события игрока
      const result = await sstatsClient.get(`/Players/${id}/events`, params, { skipValidation: true });
      
      const count = result.data?.length || 0;
      fastify.log.info(`Found ${count} events for player ${id}`);
      
      return {
        success: true,
        status: 'OK',
        count,
        offset,
        limit,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching player events:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Player with ID ${request.params.id} not found or has no events`
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
}

module.exports = playersRoutes;
