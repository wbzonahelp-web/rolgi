/**
 * API V2 Routes Index
 * Current stable API version
 * 
 * @module api/versions/v2
 */

const { getGamesV2, getGameByIdV2 } = require('./games');
const { getTeamsV2, getTeamByIdV2 } = require('./teams');
const { getPlayersV2, getPlayerByIdV2 } = require('./players');

/**
 * Register all V2 routes
 * 
 * @param {object} fastify - Fastify instance
 * @param {object} options - Route options
 */
async function registerV2Routes(fastify, options = {}) {
  const prefix = '/api/v2';

  // Games routes
  fastify.get(`${prefix}/games`, getGamesV2);
  fastify.get(`${prefix}/games/:id`, getGameByIdV2);

  // Teams routes
  fastify.get(`${prefix}/teams`, getTeamsV2);
  fastify.get(`${prefix}/teams/:id`, getTeamByIdV2);

  // Players routes
  fastify.get(`${prefix}/players`, getPlayersV2);
  fastify.get(`${prefix}/players/:id`, getPlayerByIdV2);

  fastify.log.info('API V2 routes registered');
}

module.exports = {
  registerV2Routes,
  getGamesV2,
  getGameByIdV2,
  getTeamsV2,
  getTeamByIdV2,
  getPlayersV2,
  getPlayerByIdV2
};
