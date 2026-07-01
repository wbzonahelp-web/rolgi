'use strict';

const modelPredictionsService = require('../../services/model-predictions-service');
const { getDatabase } = require('../../database/db-pool');

/**
 * Model Predictions Routes
 * Fastify plugin — префикс: /api/model-predictions
 */
async function modelPredictionsRoutes(fastify) {

  // GET /api/model-predictions - список прогнозов с фильтрацией
  fastify.get('/', {
    schema: {
      description: 'List model predictions with filtering',
      tags: ['Model Predictions'],
      querystring: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          game_id: { type: 'integer' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { model, game_id, limit = 50, offset = 0 } = request.query;
      const db = getDatabase();

      let query = 'SELECT * FROM model_predictions WHERE 1=1';
      const params = [];

      if (model) {
        query += ` AND model_name = $${params.length + 1}`;
        params.push(model);
      }

      if (game_id) {
        query += ` AND game_id = $${params.length + 1}`;
        params.push(parseInt(game_id));
      }

      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;
      query += ` ORDER BY predicted_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, params);

      return {
        predictions: result.rows,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
    } catch (error) {
      request.log.error({ err: error.message, query: request.query }, 'Error fetching predictions');
      reply.code(500);
      return { error: 'Failed to fetch predictions' };
    }
  });

  // GET /api/model-predictions/models - статистика по моделям
  fastify.get('/models', {
    schema: {
      description: 'Get models performance statistics',
      tags: ['Model Predictions']
    }
  }, async (request, reply) => {
    try {
      const stats = await modelPredictionsService.getModelsStatistics();
      return { models: stats };
    } catch (error) {
      request.log.error('Error fetching models statistics:', error);
      reply.code(500);
      return { error: 'Failed to fetch statistics' };
    }
  });

  // GET /api/model-predictions/games/:gameId - прогнозы для матча
  fastify.get('/games/:gameId', {
    schema: {
      description: 'Get predictions for a specific game',
      tags: ['Model Predictions'],
      params: {
        type: 'object',
        properties: {
          gameId: { type: 'integer' }
        },
        required: ['gameId']
      }
    }
  }, async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId);
      const predictions = await modelPredictionsService.getPredictionsForGame(gameId);
      return { game_id: gameId, predictions };
    } catch (error) {
      request.log.error('Error fetching game predictions:', error);
      reply.code(500);
      return { error: 'Failed to fetch game predictions' };
    }
  });

  // POST /api/model-predictions/generate - ручная генерация прогнозов
  fastify.post('/generate', {
    schema: {
      description: 'Manually trigger predictions generation',
      tags: ['Model Predictions'],
      body: {
        type: 'object',
        properties: {
          game_id: { type: 'integer' },
          hours_ahead: { type: 'integer', default: 48 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { game_id, hours_ahead = 48 } = request.body;

      if (game_id) {
        const predictions = await modelPredictionsService.generatePredictionsForGame(game_id);
        return { game_id, predictions };
      } else {
        const results = await modelPredictionsService.generatePredictionsForUpcoming(hours_ahead);
        return { results };
      }
    } catch (error) {
      request.log.error('Error generating predictions:', error);
      reply.code(500);
      return { error: 'Failed to generate predictions' };
    }
  });

  // POST /api/model-predictions/verify - верификация прогнозов
  fastify.post('/verify', {
    schema: {
      description: 'Verify predictions against actual results',
      tags: ['Model Predictions']
    }
  }, async (request, reply) => {
    try {
      const result = await modelPredictionsService.verifyPredictions();
      return result;
    } catch (error) {
      request.log.error('Error verifying predictions:', error);
      reply.code(500);
      return { error: 'Failed to verify predictions' };
    }
  });
}

module.exports = modelPredictionsRoutes;