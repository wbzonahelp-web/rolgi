/**
 * API V2 - Games Routes (Current)
 * Enhanced version with additional features
 * 
 * Changes from V1:
 * - Field names: date -> gameDate, abbr -> teamAbbreviation
 * - Added metadata fields (createdAt, updatedAt)
 * - Enhanced response structure
 * - Better error handling
 * - Pagination support
 * 
 * @module api/versions/v2/games
 */

/**
 * Get all games (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Paginated games response
 */
async function getGamesV2(request, reply) {
  const { db } = request.server;
  const { 
    season, 
    team, 
    status, 
    startDate, 
    endDate,
    limit = 50, 
    offset = 0 
  } = request.query;

  try {
    // Build query with filters
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

    if (startDate) {
      query += ` AND game_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND game_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY game_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Transform to V2 format
    const games = result.rows.map(game => ({
      id: game.id,
      gameDate: game.game_date, // V2 uses 'gameDate'
      season: game.season,
      week: game.week,
      homeTeam: {
        id: game.home_team,
        score: game.home_score
      },
      awayTeam: {
        id: game.away_team,
        score: game.away_score
      },
      status: game.status,
      venue: game.venue,
      metadata: {
        createdAt: game.created_at,
        updatedAt: game.updated_at
      }
    }));

    return {
      data: games,
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
    request.log.error({ error }, 'Failed to fetch games (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch games',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

/**
 * Get game by ID (V2 format)
 * 
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<object>} Game details with metadata
 */
async function getGameByIdV2(request, reply) {
  const { db } = request.server;
  const { id } = request.params;

  try {
    const result = await db.query(
      'SELECT * FROM games WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Game with ID ${id} not found`
        }
      });
      return;
    }

    const game = result.rows[0];

    return {
      data: {
        id: game.id,
        gameDate: game.game_date,
        season: game.season,
        week: game.week,
        homeTeam: {
          id: game.home_team,
          score: game.home_score
        },
        awayTeam: {
          id: game.away_team,
          score: game.away_score
        },
        status: game.status,
        venue: game.venue,
        metadata: {
          createdAt: game.created_at,
          updatedAt: game.updated_at
        }
      },
      metadata: {
        apiVersion: 'v2',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    request.log.error({ error, gameId: id }, 'Failed to fetch game (V2)');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch game',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

module.exports = {
  getGamesV2,
  getGameByIdV2
};
