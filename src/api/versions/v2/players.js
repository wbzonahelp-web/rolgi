/**
 * API V2 - Players Routes (Current)
 * Enhanced version with additional features
 * 
 * @module api/versions/v2/players
 */

/**
 * Get all players (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Paginated players response
 */
async function getPlayersV2(request, reply) {
  const { db } = request.server;
  const { 
    team, 
    position, 
    active,
    search,
    limit = 50, 
    offset = 0 
  } = request.query;

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

    if (search) {
      query += ` AND name ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Transform to V2 format
    const players = result.rows.map(player => ({
      id: player.id,
      name: player.name,
      number: player.number,
      position: player.position,
      team: player.team,
      physicalAttributes: {
        height: player.height,
        weight: player.weight,
        age: player.age
      },
      birthDate: player.birth_date,
      college: player.college,
      active: player.active,
      metadata: {
        createdAt: player.created_at,
        updatedAt: player.updated_at
      }
    }));

    return {
      data: players,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      },
      metadata: {
        apiVersion: 'v2',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    request.log.error({ error }, 'Failed to fetch players (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch players',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

/**
 * Get player by ID (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Player details with metadata
 */
async function getPlayerByIdV2(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query(
      'SELECT * FROM players WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Player with ID ${id} not found`
        }
      });
      return;
    }

    const player = result.rows[0];

    return {
      data: {
        id: player.id,
        name: player.name,
        number: player.number,
        position: player.position,
        team: player.team,
        physicalAttributes: {
          height: player.height,
          weight: player.weight,
          age: player.age
        },
        birthDate: player.birth_date,
        college: player.college,
        active: player.active,
        metadata: {
          createdAt: player.created_at,
          updatedAt: player.updated_at
        }
      },
      metadata: {
        apiVersion: 'v2',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    request.log.error({ error, playerId: id }, 'Failed to fetch player (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch player',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

module.exports = {
  getPlayersV2,
  getPlayerByIdV2
};
