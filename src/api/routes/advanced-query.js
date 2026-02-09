/**
 * Advanced Query Routes
 * 
 * REST API эндпоинты для работы с продвинутыми запросами к SStats API
 */

const {
  getAllPresets,
  getPresetsByCategory,
  getPresetById,
  getCategories
} = require('../query-presets');

/**
 * Регистрация роутов для advanced query
 * @param {FastifyInstance} fastify
 * @param {Object} options
 */
async function advancedQueryRoutes(fastify, options) {
  const { sstatsClient } = options;

  // ============================================================
  // GET /api/query/presets
  // Получить список всех готовых пресетов
  // ============================================================
  fastify.get('/presets', {
    schema: {
      description: 'Получить список всех готовых пресетов запросов',
      tags: ['Advanced Query'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'number' },
            categories: { type: 'object' },
            presets: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const presets = getAllPresets();
    const categories = getCategories();

    return {
      success: true,
      count: presets.length,
      categories,
      presets
    };
  });

  // ============================================================
  // GET /api/query/presets/category/:category
  // Получить пресеты по категории
  // ============================================================
  fastify.get('/presets/category/:category', {
    schema: {
      description: 'Получить пресеты по категории',
      tags: ['Advanced Query'],
      params: {
        type: 'object',
        properties: {
          category: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            category: { type: 'string' },
            count: { type: 'number' },
            presets: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { category } = request.params;
    const presets = getPresetsByCategory(category);

    return {
      success: true,
      category,
      count: presets.length,
      presets
    };
  });

  // ============================================================
  // GET /api/query/presets/:id
  // Получить конкретный пресет по ID
  // ============================================================
  fastify.get('/presets/:id', {
    schema: {
      description: 'Получить конкретный пресет по ID',
      tags: ['Advanced Query'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            preset: { type: 'object' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const preset = getPresetById(id);

    if (!preset) {
      return reply.code(404).send({
        success: false,
        error: `Preset with id '${id}' not found`
      });
    }

    return {
      success: true,
      preset
    };
  });

  // ============================================================
  // POST /api/query/execute
  // Выполнить продвинутый запрос
  // ============================================================
  fastify.post('/execute', {
    schema: {
      description: 'Выполнить продвинутый запрос к SStats API',
      tags: ['Advanced Query'],
      body: {
        type: 'object',
        required: ['Condition', 'Fields'],
        properties: {
          Condition: {
            type: 'string',
            description: 'SQL-подобное условие фильтрации'
          },
          Fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Массив полей для вывода'
          },
          Order: {
            type: 'string',
            description: 'Порядок сортировки'
          },
          format: {
            type: 'string',
            enum: ['json', 'csv'],
            default: 'json',
            description: 'Формат ответа'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            query: { type: 'object' },
            result: { type: 'object' },
            executionTime: { type: 'number' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();

    try {
      const { Condition, Fields, Order, format = 'json' } = request.body;

      // Валидация
      if (!Condition || !Fields || Fields.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'Condition and Fields are required'
        });
      }

      // Формируем запрос
      const queryParams = {
        Condition,
        Fields,
        ...(Order && { Order }),
        format
      };

      // Выполняем запрос
      const result = await sstatsClient.queryGamesAdvanced(queryParams);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        query: queryParams,
        result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return reply.code(400).send({
        success: false,
        error: error.message,
        executionTime
      });
    }
  });

  // ============================================================
  // POST /api/query/execute/preset/:id
  // Выполнить запрос по пресету
  // ============================================================
  fastify.post('/execute/preset/:id', {
    schema: {
      description: 'Выполнить готовый пресет запроса',
      tags: ['Advanced Query'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          overrides: {
            type: 'object',
            description: 'Переопределение параметров пресета'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            preset: { type: 'object' },
            result: { type: 'object' },
            executionTime: { type: 'number' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { overrides = {} } = request.body;
    const startTime = Date.now();

    try {
      // Получаем пресет
      const preset = getPresetById(id);

      if (!preset) {
        return reply.code(404).send({
          success: false,
          error: `Preset with id '${id}' not found`
        });
      }

      // Объединяем пресет с переопределениями
      const queryParams = {
        ...preset.query,
        ...overrides
      };

      // Выполняем запрос
      const result = await sstatsClient.queryGamesAdvanced(queryParams);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        preset: {
          id: preset.id,
          name: preset.name,
          description: preset.description
        },
        query: queryParams,
        result,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return reply.code(400).send({
        success: false,
        error: error.message,
        executionTime
      });
    }
  });

  // ============================================================
  // GET /api/query/fields
  // Получить список доступных полей для запросов
  // ============================================================
  fastify.get('/fields', {
    schema: {
      description: 'Получить список доступных полей для запросов',
      tags: ['Advanced Query'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            categories: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Список доступных полей, сгруппированных по категориям
    const fields = {
      basic: {
        name: 'Основная информация',
        fields: [
          { name: 'Id', description: 'ID матча', type: 'number' },
          { name: 'Date', description: 'Дата и время матча', type: 'datetime' },
          { name: 'Year', description: 'Год матча', type: 'number' },
          { name: 'LeagueId', description: 'ID лиги', type: 'number' },
          { name: 'LeagueName', description: 'Название лиги', type: 'string' },
          { name: 'HomeTeamName', description: 'Название команды хозяев', type: 'string' },
          { name: 'AwayTeamName', description: 'Название команды гостей', type: 'string' },
          { name: 'HomeTeamId', description: 'ID команды хозяев', type: 'number' },
          { name: 'AwayTeamId', description: 'ID команды гостей', type: 'number' }
        ]
      },
      score: {
        name: 'Счет',
        fields: [
          { name: 'ScoreHomeFT', description: 'Счет хозяев (full time)', type: 'number' },
          { name: 'ScoreAwayFT', description: 'Счет гостей (full time)', type: 'number' },
          { name: 'ScoreHomeHT', description: 'Счет хозяев (half time)', type: 'number' },
          { name: 'ScoreAwayHT', description: 'Счет гостей (half time)', type: 'number' }
        ]
      },
      odds: {
        name: 'Коэффициенты',
        fields: [
          { name: 'Winner1', description: 'Коэффициент на победу хозяев', type: 'decimal' },
          { name: 'WinnerX', description: 'Коэффициент на ничью', type: 'decimal' },
          { name: 'Winner2', description: 'Коэффициент на победу гостей', type: 'decimal' }
        ]
      },
      shots: {
        name: 'Удары',
        fields: [
          { name: 'TotalShotsHome', description: 'Всего ударов хозяев', type: 'number' },
          { name: 'TotalShotsAway', description: 'Всего ударов гостей', type: 'number' },
          { name: 'ShotsOnTargetHome', description: 'Удары в створ хозяев', type: 'number' },
          { name: 'ShotsOnTargetAway', description: 'Удары в створ гостей', type: 'number' }
        ]
      },
      xg: {
        name: 'Expected Goals',
        fields: [
          { name: 'ExpectedGoalsHome', description: 'Ожидаемые голы хозяев', type: 'decimal' },
          { name: 'ExpectedGoalsAway', description: 'Ожидаемые голы гостей', type: 'decimal' }
        ]
      },
      possession: {
        name: 'Владение',
        fields: [
          { name: 'PossessionHome', description: 'Владение мячом хозяев (%)', type: 'decimal' },
          { name: 'PossessionAway', description: 'Владение мячом гостей (%)', type: 'decimal' }
        ]
      }
    };

    return {
      success: true,
      categories: fields
    };
  });
}

module.exports = advancedQueryRoutes;
