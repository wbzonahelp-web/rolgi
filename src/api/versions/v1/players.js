/**
 * API V1 - Players Routes (Legacy)
 * Backward compatibility layer for V1 clients
 * 
 * @module api/versions/v1/players
 */

/**
 * Get all players (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<array>} Players list
 */
async function getPlayersV1(request, reply) {
  const { db } = request.server;
  const { team, position, active, limit = 50, offset = 0 } = request.query;

  try {
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (team) {
      query += ` AND team = $${paramIndex++}`;
      params.push(team);
    }

    if (position) {
      query += ` AND position = $${paramIndex++}`;
      params.push(position);
    }

    if (active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Transform to V1 format
    const players = result.rows.map(player => ({
      id: player.id,
      name: player.name,
      number: player.number,
      position: player.position,
      team: player.team,
      height: player.height,
      weight: player.weight,
      age: player.age,
      active: player.active
    }));

    return { players, total: players.length };
  } catch (error) {
    request.log.error({ error }, 'Failed to fetch players (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

/**
 * Get player by ID (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Player details
 */
async function getPlayerByIdV1(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query('SELECT * FROM players WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      reply.code(404).send({ error: 'Player not found' });
      return;
    }

    const player = result.rows[0];

    return {
      id: player.id,
      name: player.name,
      number: player.number,
      position: player.position,
      team: player.team,
      height: player.height,
      weight: player.weight,
      age: player.age,
      birthDate: player.birth_date,
      college: player.college,
      active: player.active
    };
  } catch (error) {
    request.log.error({ error, playerId: id }, 'Failed to fetch player (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

module.exports = {
  getPlayersV1,
  getPlayerByIdV1
};
