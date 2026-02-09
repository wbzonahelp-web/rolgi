/**
 * Teams API Routes
 * 
 * REST API эндпоинты для работы с командами
 * Базовый путь: /api/teams
 * 
 * Эндпоинты:
 * - GET /api/teams/list - Получить список команд с фильтрацией
 * - GET /api/teams/:id - Получить детальную информацию о команде
 * - GET /api/teams/search - Поиск команд по имени
 * - GET /api/teams/country/:country - Команды из конкретной страны
 * - GET /api/teams/examples - Примеры запросов
 * - GET /api/teams/health - Health check
 * 
 * @module teams-routes
 */

/**
 * Register Teams API routes
 * @param {FastifyInstance} fastify
 * @param {Object} options
 * @param {SStatsClient} options.sstatsClient
 */
async function teamsRoutes(fastify, options) {
  const { sstatsClient } = options;

  if (!sstatsClient) {
    throw new Error('SStatsClient is required for Teams routes');
  }

  // ============================================================================
  // 1. GET /api/teams/list - Список команд с фильтрацией
  // ============================================================================
  fastify.get('/list', {
    schema: {
      description: 'Получить список команд с возможностью фильтрации и пагинации',
      tags: ['Teams'],
      querystring: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Название команды для поиска',
            minLength: 2,
            maxLength: 100
          },
          country: {
            type: 'string',
            description: 'Код страны или название страны',
            maxLength: 50
          },
          offset: {
            type: 'integer',
            description: 'Количество записей для пропуска (пагинация)',
            minimum: 0,
            default: 0
          },
          limit: {
            type: 'integer',
            description: 'Максимальное количество записей в ответе',
            minimum: 1,
            maximum: 1000,
            default: 100
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
            totalCount: { type: 'integer' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  flashId: { type: ['string', 'null'] },
                  logoUrl: { type: ['string', 'null'] },
                  country: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      name: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { name, country, offset = 0, limit = 100 } = request.query;

        const filters = {};
        if (name) filters.name = name;
        if (country) filters.country = country;
        if (offset !== undefined) filters.offset = offset;
        if (limit !== undefined) filters.limit = limit;

        const result = await sstatsClient.getTeams(filters);

        return {
          success: true,
          status: result.status || 'OK',
          count: result.count || result.data?.length || 0,
          totalCount: result.totalCount || result.count || 0,
          data: result.data || result,
          metadata: {
            offset,
            limit,
            filters: { name, country }
          }
        };
      } catch (error) {
        fastify.log.error('Error fetching teams list:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch teams list',
          message: error.message
        });
      }
    }
  });

  // ============================================================================
  // 2. GET /api/teams/:id - Детальная информация о команде
  // ============================================================================
  fastify.get('/:id', {
    schema: {
      description: 'Получить подробную информацию о конкретной команде',
      tags: ['Teams'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'integer',
            description: 'Уникальный идентификатор команды',
            minimum: 1
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
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                flashId: { type: ['string', 'null'] },
                country: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                seasons: { type: 'array' },
                venue: { type: ['object', 'null'] },
                coach: { type: ['object', 'null'] },
                players: { type: 'array' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { id } = request.params;

        const result = await sstatsClient.getTeam(id);

        if (!result || !result.data) {
          return reply.code(404).send({
            success: false,
            error: 'Team not found',
            message: `Team with ID ${id} does not exist`
          });
        }

        return {
          success: true,
          status: result.status || 'OK',
          data: result.data || result
        };
      } catch (error) {
        fastify.log.error(`Error fetching team ${request.params.id}:`, error);
        
        if (error.response?.status === 404) {
          return reply.code(404).send({
            success: false,
            error: 'Team not found',
            message: `Team with ID ${request.params.id} does not exist`
          });
        }

        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch team details',
          message: error.message
        });
      }
    }
  });

  // ============================================================================
  // 3. GET /api/teams/search - Поиск команд по имени
  // ============================================================================
  fastify.get('/search', {
    schema: {
      description: 'Поиск команд по названию',
      tags: ['Teams'],
      querystring: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Название команды для поиска',
            minLength: 2,
            maxLength: 100
          },
          limit: {
            type: 'integer',
            description: 'Максимальное количество результатов',
            minimum: 1,
            maximum: 100,
            default: 20
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'integer' },
            query: { type: 'string' },
            data: { type: 'array' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { name, limit = 20 } = request.query;

        const result = await sstatsClient.getTeams({
          name,
          limit
        });

        return {
          success: true,
          count: result.data?.length || 0,
          query: name,
          data: result.data || result
        };
      } catch (error) {
        fastify.log.error('Error searching teams:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to search teams',
          message: error.message
        });
      }
    }
  });

  // ============================================================================
  // 4. GET /api/teams/country/:country - Команды из конкретной страны
  // ============================================================================
  fastify.get('/country/:country', {
    schema: {
      description: 'Получить команды из конкретной страны',
      tags: ['Teams'],
      params: {
        type: 'object',
        required: ['country'],
        properties: {
          country: {
            type: 'string',
            description: 'Код страны (например, RUS, ENG) или название'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100
          },
          offset: {
            type: 'integer',
            minimum: 0,
            default: 0
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            country: { type: 'string' },
            count: { type: 'integer' },
            data: { type: 'array' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { country } = request.params;
        const { limit = 100, offset = 0 } = request.query;

        const result = await sstatsClient.getTeams({
          country,
          limit,
          offset
        });

        return {
          success: true,
          country,
          count: result.data?.length || 0,
          totalCount: result.totalCount || 0,
          data: result.data || result,
          metadata: {
            offset,
            limit
          }
        };
      } catch (error) {
        fastify.log.error(`Error fetching teams for country ${request.params.country}:`, error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch teams',
          message: error.message
        });
      }
    }
  });

  // ============================================================================
  // 5. GET /api/teams/examples - Примеры запросов
  // ============================================================================
  fastify.get('/examples', {
    schema: {
      description: 'Получить примеры запросов к Teams API',
      tags: ['Teams'],
      querystring: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Категория примеров (basic, search, country, etc.)',
            enum: ['basic', 'search', 'country', 'combined', 'popular', 'special', 'pagination']
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            category: { type: 'string' },
            examples: { type: 'object' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      const teamsExamples = require('../teams-query-examples');
      const { category } = request.query;

      if (category) {
        const categoryExamples = teamsExamples.getExamplesByCategory(category);
        if (!categoryExamples) {
          return reply.code(404).send({
            success: false,
            error: 'Category not found',
            availableCategories: teamsExamples.getCategories()
          });
        }

        // Преобразуем функции в примеры
        const examples = {};
        Object.entries(categoryExamples).forEach(([name, func]) => {
          try {
            const params = func();
            examples[name] = {
              description: `Example: ${name}`,
              params,
              url: `/api/teams/list?${new URLSearchParams(params).toString()}`
            };
          } catch (e) {
            // Ignore functions that need parameters
          }
        });

        return {
          success: true,
          category,
          count: Object.keys(examples).length,
          examples
        };
      }

      // Return all categories
      return {
        success: true,
        categories: teamsExamples.getCategories(),
        examples: {
          basic: {
            description: 'Базовые запросы',
            url: '/api/teams/examples?category=basic'
          },
          search: {
            description: 'Поиск команд',
            url: '/api/teams/examples?category=search'
          },
          country: {
            description: 'Команды по странам',
            url: '/api/teams/examples?category=country'
          },
          combined: {
            description: 'Комбинированные запросы',
            url: '/api/teams/examples?category=combined'
          },
          popular: {
            description: 'Популярные команды',
            url: '/api/teams/examples?category=popular'
          },
          special: {
            description: 'Специальные запросы',
            url: '/api/teams/examples?category=special'
          },
          pagination: {
            description: 'Примеры пагинации',
            url: '/api/teams/examples?category=pagination'
          }
        }
      };
    }
  });

  // ============================================================================
  // 6. GET /api/teams/health - Health check
  // ============================================================================
  fastify.get('/health', {
    schema: {
      description: 'Health check для Teams API',
      tags: ['Teams'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      return {
        status: 'healthy',
        service: 'Teams API',
        timestamp: new Date().toISOString()
      };
    }
  });
}

module.exports = teamsRoutes;
