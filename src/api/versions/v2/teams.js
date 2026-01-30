/**
 * API V2 - Teams Routes (Current)
 * Enhanced version with additional features
 * 
 * @module api/versions/v2/teams
 */

/**
 * Get all teams (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Paginated teams response
 */
async function getTeamsV2(request, reply) {
  const { db } = request.server;
  const { 
    conference, 
    division, 
    search,
    limit = 50, 
    offset = 0 
  } = request.query;

  try {
    let query = 'SELECT * FROM teams WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (conference) {
      query += ` AND conference = $${paramIndex++}`;
      params.push(conference);
    }

    if (division) {
      query += ` AND division = $${paramIndex++}`;
      params.push(division);
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR abbreviation ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
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
    const teams = result.rows.map(team => ({
      id: team.id,
      name: team.name,
      teamAbbreviation: team.abbreviation, // V2 uses full name
      city: team.city,
      conference: team.conference,
      division: team.division,
      logoUrl: team.logo_url,
      establishedYear: team.established_year,
      metadata: {
        createdAt: team.created_at,
        updatedAt: team.updated_at
      }
    }));

    return {
      data: teams,
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
    request.log.error({ error }, 'Failed to fetch teams (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch teams',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

/**
 * Get team by ID (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Team details with metadata
 */
async function getTeamByIdV2(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query(
      'SELECT * FROM teams WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Team with ID ${id} not found`
        }
      });
      return;
    }

    const team = result.rows[0];

    return {
      data: {
        id: team.id,
        name: team.name,
        teamAbbreviation: team.abbreviation,
        city: team.city,
        conference: team.conference,
        division: team.division,
        logoUrl: team.logo_url,
        establishedYear: team.established_year,
        metadata: {
          createdAt: team.created_at,
          updatedAt: team.updated_at
        }
      },
      metadata: {
        apiVersion: 'v2',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    request.log.error({ error, teamId: id }, 'Failed to fetch team (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch team',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

module.exports = {
  getTeamsV2,
  getTeamByIdV2
};
