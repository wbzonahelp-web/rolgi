/**
 * API V1 - Teams Routes (Legacy)
 * Backward compatibility layer for V1 clients
 * 
 * @module api/versions/v1/teams
 */

/**
 * Get all teams (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<array>} Teams list
 */
async function getTeamsV1(request, reply) {
  const { db } = request.server;
  const { conference, division, limit = 50, offset = 0 } = request.query;

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

    query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Transform to V1 format
    const teams = result.rows.map(team => ({
      id: team.id,
      name: team.name,
      abbr: team.abbreviation, // V1 uses 'abbr'
      city: team.city,
      conference: team.conference,
      division: team.division,
      logo: team.logo_url
    }));

    return { teams, total: teams.length };
  } catch (error) {
    request.log.error({ error }, 'Failed to fetch teams (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

/**
 * Get team by ID (V1 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Team details
 */
async function getTeamByIdV1(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query('SELECT * FROM teams WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      reply.code(404).send({ error: 'Team not found' });
      return;
    }

    const team = result.rows[0];

    return {
      id: team.id,
      name: team.name,
      abbr: team.abbreviation,
      city: team.city,
      conference: team.conference,
      division: team.division,
      logo: team.logo_url,
      established: team.established_year
    };
  } catch (error) {
    request.log.error({ error, teamId: id }, 'Failed to fetch team (V1)');
    reply.code(500).send({ error: 'Internal server error' });
  }
}

module.exports = {
  getTeamsV1,
  getTeamByIdV1
};
