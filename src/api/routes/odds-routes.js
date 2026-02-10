/**
 * Odds API Routes
 * Маршруты для работы с букмекерами и live коэффициентами
 * 
 * @module odds-routes
 * @version 1.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

/**
 * Register Odds API routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 * @param {Object} options.sstatsClient - SStats API client instance
 */
async function oddsRoutes(fastify, options) {
  const { sstatsClient } = options;

  if (!sstatsClient) {
    throw new Error('sstatsClient is required in options');
  }

  // ===========================================================================
  // GET /api/odds/bookmakers - Получить справочник букмекеров
  // ===========================================================================
  fastify.get('/bookmakers', {
    schema: {
      tags: ['Odds'],
      description: 'Получить справочник всех доступных букмекеров и их идентификаторов',
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
                properties: {
                  id: { type: 'integer' },
                  bookmakerName: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      fastify.log.info('Fetching bookmakers list');
      
      // Получаем список букмекеров
      const result = await sstatsClient.get('/Odds/bookmakers', {}, { skipValidation: true });
      
      fastify.log.info(`Bookmakers list received, count: ${result.data?.length || 0}`);
      
      return {
        success: true,
        status: 'OK',
        count: result.data?.length || 0,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching bookmakers:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: 'Bookmakers data not found'
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
  // GET /api/odds/live/:gameId - Получить live коэффициенты для матча
  // ===========================================================================
  fastify.get('/live/:gameId', {
    schema: {
      tags: ['Odds'],
      description: 'Получить live коэффициенты в реальном времени для конкретного матча (Bet365). Обновляются каждые 5-60 секунд.',
      params: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: {
            type: ['integer', 'string'],
            description: 'ID матча'
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
      const { gameId } = request.params;
      
      fastify.log.info(`Fetching live odds for game ${gameId}`);
      
      // Получаем live коэффициенты
      const result = await sstatsClient.get(`/Odds/live/${gameId}`, {}, { skipValidation: true });
      
      fastify.log.info(`Live odds received for game ${gameId}`);
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result
      };
    } catch (error) {
      fastify.log.error('Error fetching live odds:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Live odds not found for game ${request.params.gameId}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid game ID'
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
  // GET /api/odds/live-updates - Получить метки времени обновлений коэффициентов
  // ===========================================================================
  fastify.get('/live-updates', {
    schema: {
      tags: ['Odds'],
      description: 'Получить метки времени последних обновлений live коэффициентов для множества матчей (до 100). Используйте для эффективного мониторинга изменений.',
      querystring: {
        type: 'object',
        properties: {
          gameIds: {
            type: 'string',
            description: 'Список ID матчей через запятую (максимум 100). Пример: 1461496,1461497,1461498'
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
                properties: {
                  gameId: { type: 'integer' },
                  lastUpdate: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { gameIds } = request.query;
      
      // Валидация: проверка количества ID
      if (gameIds) {
        const ids = gameIds.split(',');
        if (ids.length > 100) {
          return reply.code(400).send({
            success: false,
            status: 'ERROR',
            message: 'Maximum 100 game IDs allowed'
          });
        }
      }
      
      fastify.log.info(`Fetching live updates${gameIds ? ` for ${gameIds.split(',').length} games` : ' for all active games'}`);
      
      // Строим параметры запроса
      const params = {};
      if (gameIds) {
        params.gameIds = gameIds;
      }
      
      // Получаем метки обновлений
      const result = await sstatsClient.get('/Odds/live-changes/updates-only', params, { skipValidation: true });
      
      const count = result.data?.length || 0;
      fastify.log.info(`Live updates received: ${count} games`);
      
      return {
        success: true,
        status: 'OK',
        count,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching live updates:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: 'Live updates data not found'
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
  // GET /api/odds/live-changes/:gameId - Получить историю изменений live коэффициентов
  // ===========================================================================
  fastify.get('/live-changes/:gameId', {
    schema: {
      tags: ['Odds'],
      description: 'Получить историю изменений live коэффициентов во время матча (Bet365). Используйте Last-Modified header для оптимизации.',
      params: {
        type: 'object',
        required: ['gameId'],
        properties: {
          gameId: {
            type: ['integer', 'string'],
            description: 'ID матча'
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
            lastModified: { type: 'string' },
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
      const { gameId } = request.params;
      
      fastify.log.info(`Fetching live odds changes history for game ${gameId}`);
      
      // Получаем историю изменений
      const result = await sstatsClient.get(`/Odds/live-changes/${gameId}`, {}, { skipValidation: true });
      
      // Получаем Last-Modified из headers если есть
      const lastModified = result.headers?.['last-modified'] || new Date().toISOString();
      
      const count = result.data?.length || 0;
      fastify.log.info(`Live changes history received for game ${gameId}: ${count} markets`);
      
      // Устанавливаем Last-Modified в response headers
      reply.header('Last-Modified', lastModified);
      
      return {
        success: true,
        status: 'OK',
        count,
        lastModified,
        data: result.data || []
      };
    } catch (error) {
      fastify.log.error('Error fetching live changes history:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: `Live changes history not found for game ${request.params.gameId}`
        });
      }
      
      if (error.response?.status === 400) {
        return reply.code(400).send({
          success: false,
          status: 'ERROR',
          message: error.response?.data?.message || 'Invalid game ID'
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
  // GET /api/odds/prematch-markets - Получить справочник видов доматчевых ставок
  // ===========================================================================
  fastify.get('/prematch-markets', {
    schema: {
      tags: ['Odds'],
      description: 'Получить справочник типов доматчевых ставок. Используются как MarketId в /odds endpoints.',
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
      fastify.log.info('Fetching prematch markets dictionary');
      
      // Получаем справочник рынков
      const result = await sstatsClient.get('/Odds/prematch-markets', {}, { skipValidation: true });
      
      fastify.log.info('Prematch markets dictionary received');
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result || {}
      };
    } catch (error) {
      fastify.log.error('Error fetching prematch markets:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: 'Prematch markets dictionary not found'
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
  // GET /api/odds/live-markets - Получить справочник видов live ставок
  // ===========================================================================
  fastify.get('/live-markets', {
    schema: {
      tags: ['Odds'],
      description: 'Получить справочник типов live ставок. Используются как MarketId в /odds/live endpoints.',
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
      fastify.log.info('Fetching live markets dictionary');
      
      // Получаем справочник live рынков
      const result = await sstatsClient.get('/Odds/live-markets', {}, { skipValidation: true });
      
      fastify.log.info('Live markets dictionary received');
      
      return {
        success: true,
        status: 'OK',
        data: result.data || result || {}
      };
    } catch (error) {
      fastify.log.error('Error fetching live markets:', error);
      
      if (error.response?.status === 404) {
        return reply.code(404).send({
          success: false,
          status: 'ERROR',
          message: 'Live markets dictionary not found'
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

module.exports = oddsRoutes;
