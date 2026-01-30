/**
 * API V1 Routes Index
 * Legacy API version for backward compatibility
 * 
 * @module api/versions/v1
 */

const { getGamesV1, getGameByIdV1 } = require('./games');
const { getTeamsV1, getTeamByIdV1 } = require('./teams');
const { getPlayersV1, getPlayerByIdV1 } = require('./players');

/**
 * Register all V1 routes
 * 
 * @param {object} fastify - Fastify instance
 * @param {object} options - Route options
 */
async function registerV1Routes(fastify, options = {}) {
  const prefix = '/api/v1';

  // Games routes
  fastify.get(`${prefix}/games`, getGamesV1);
  fastify.get(`${prefix}/games/:id`, getGameByIdV1);

  // Teams routes
  fastify.get(`${prefix}/teams`, getTeamsV1);
  fastify.get(`${prefix}/teams/:id`, getTeamByIdV1);

  // Players routes
  fastify.get(`${prefix}/players`, getPlayersV1);
  fastify.get(`${prefix}/players/:id`, getPlayerByIdV1);

  fastify.log.info('API V1 routes registered');
}

module.exports = {
  registerV1Routes,
  getGamesV1,
  getGameByIdV1,
  getTeamsV1,
  getTeamByIdV1,
  getPlayersV1,
  getPlayerByIdV1
};
