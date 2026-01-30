/**
 * API V1 - Games Routes (Legacy)
 * Backward compatibility layer for V1 clients
 * 
 * Changes from V2:
 * - Field names: gameDate -> date, teamAbbreviation -> abbr
 * - No metadata fields (createdAt, updatedAt)
 * - Simpler response structure
 * 
 * @module api/versions/v1/games
 */

/**
 * Get all games (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<array>} Games list
 */
async function getGamesV1(request, reply) {
  const { db } = request.server;
  const { season, team, status, limit = 50, offset = 0 } = request.query;

  try {
    let query = 'SELECT * FROM games WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (season) {
      query += ` AND season = $${paramIndex++}`;
      params.push(season);
    }

    if (team) {
      query += ` AND (home_team = $${paramIndex} OR away_team = $${paramIndex})`;
      params.push(team);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY game_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Transform to V1 format
    const games = result.rows.map(game => ({
      id: game.id,
      date: game.game_date, // V1 uses 'date' instead of 'gameDate'
      season: game.season,
      week: game.week,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: game.home_score,
      awayScore: game.away_score,
      status: game.status,
      venue: game.venue
      // V1 does not include createdAt, updatedAt, metadata
    }));

    return { games, total: games.length };
  } catch (error) {
    request.log.error({ error }, 'Failed to fetch games (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

/**
 * Get game by ID (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Game details
 */
async function getGameByIdV1(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query('SELECT * FROM games WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      reply.code(404).send({ error: 'Game not found' });
      return;
    }

    const game = result.rows[0];

    // Transform to V1 format
    return {
      id: game.id,
      date: game.game_date,
      season: game.season,
      week: game.week,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: game.home_score,
      awayScore: game.away_score,
      status: game.status,
      venue: game.venue
    };
  } catch (error) {
    request.log.error({ error, gameId: id }, 'Failed to fetch game (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

module.exports = {
  getGamesV1,
  getGameByIdV1
};
