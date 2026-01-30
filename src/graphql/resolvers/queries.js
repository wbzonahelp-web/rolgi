/**
 * GraphQL Query Resolvers
 * 
 * @module graphql/resolvers/queries
 */

const { GraphQLError } = require('graphql');
const { requireAuth, requireRole } = require('./index');

const queryResolvers = {
  // ============================================================================
  // GAMES
  // ============================================================================
  
  async game(parent, { id }, context) {
    const { db, dataloaders } = context;
    return await dataloaders.gameLoader.load(parseInt(id));
  },

  async games(parent, { filter = {}, pagination = {} }, context) {
    const { db } = context;
    
    // Build where clause
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (filter.leagueId) {
      conditions.push(`league_id = $${paramCount++}`);
      params.push(filter.leagueId);
    }

    if (filter.season) {
      conditions.push(`season = $${paramCount++}`);
      params.push(filter.season);
    }

    if (filter.status) {
      conditions.push(`status = $${paramCount++}`);
      params.push(filter.status);
    }

    if (filter.dateFrom) {
      conditions.push(`game_date >= $${paramCount++}`);
      params.push(filter.dateFrom);
    }

    if (filter.dateTo) {
      conditions.push(`game_date <= $${paramCount++}`);
      params.push(filter.dateTo);
    }

    if (filter.teamId) {
      conditions.push(`(home_team_id = $${paramCount} OR away_team_id = $${paramCount})`);
      params.push(filter.teamId);
      paramCount++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Pagination
    const limit = pagination.first || 50;
    const offset = pagination.after ? parseInt(Buffer.from(pagination.after, 'base64').toString()) : 0;

    // Query
    const query = `
      SELECT * FROM games
      ${whereClause}
      ORDER BY game_date DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit + 1, offset); // +1 to check if has next page

    const result = await db.query(query, params);
    
    // Count total
    const countQuery = `SELECT COUNT(*) FROM games ${whereClause}`;
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    const hasNextPage = result.rows.length > limit;
    const games = hasNextPage ? result.rows.slice(0, -1) : result.rows;

    return {
      edges: games.map((game, index) => ({
        node: game,
        cursor: Buffer.from((offset + index).toString()).toString('base64'),
      })),
      pageInfo: {
        hasNextPage,
        hasPreviousPage: offset > 0,
        startCursor: games.length > 0 
          ? Buffer.from(offset.toString()).toString('base64')
          : null,
        endCursor: games.length > 0
          ? Buffer.from((offset + games.length - 1).toString()).toString('base64')
          : null,
        total,
      },
    };
  },

  async liveGames(parent, args, context) {
    const { db } = context;
    const result = await db.select('games', { status: 'live' }, {
      orderBy: 'game_date DESC',
      limit: 50,
    });
    return result;
  },

  // ============================================================================
  // TEAMS
  // ============================================================================
  
  async team(parent, { id }, context) {
    const { dataloaders } = context;
    return await dataloaders.teamLoader.load(parseInt(id));
  },

  async teams(parent, { filter = {}, pagination = {} }, context) {
    const { db } = context;
    
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (filter.country) {
      conditions.push(`country = $${paramCount++}`);
      params.push(filter.country);
    }

    if (filter.name) {
      conditions.push(`name ILIKE $${paramCount++}`);
      params.push(`%${filter.name}%`);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = pagination.first || 50;
    const offset = pagination.after ? parseInt(Buffer.from(pagination.after, 'base64').toString()) : 0;

    const query = `
      SELECT * FROM teams
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit + 1, offset);

    const result = await db.query(query, params);
    
    const countQuery = `SELECT COUNT(*) FROM teams ${whereClause}`;
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    const hasNextPage = result.rows.length > limit;
    const teams = hasNextPage ? result.rows.slice(0, -1) : result.rows;

    return {
      edges: teams.map((team, index) => ({
        node: team,
        cursor: Buffer.from((offset + index).toString()).toString('base64'),
      })),
      pageInfo: {
        hasNextPage,
        hasPreviousPage: offset > 0,
        startCursor: teams.length > 0 
          ? Buffer.from(offset.toString()).toString('base64')
          : null,
        endCursor: teams.length > 0
          ? Buffer.from((offset + teams.length - 1).toString()).toString('base64')
          : null,
        total,
      },
    };
  },

  // ============================================================================
  // PLAYERS
  // ============================================================================
  
  async player(parent, { id }, context) {
    const { dataloaders } = context;
    return await dataloaders.playerLoader.load(parseInt(id));
  },

  async players(parent, { filter = {}, pagination = {} }, context) {
    const { db } = context;
    
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (filter.teamId) {
      conditions.push(`team_id = $${paramCount++}`);
      params.push(filter.teamId);
    }

    if (filter.position) {
      conditions.push(`position = $${paramCount++}`);
      params.push(filter.position);
    }

    if (filter.nationality) {
      conditions.push(`nationality = $${paramCount++}`);
      params.push(filter.nationality);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = pagination.first || 50;
    const offset = pagination.after ? parseInt(Buffer.from(pagination.after, 'base64').toString()) : 0;

    const query = `
      SELECT * FROM players
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit + 1, offset);

    const result = await db.query(query, params);
    
    const countQuery = `SELECT COUNT(*) FROM players ${whereClause}`;
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    const hasNextPage = result.rows.length > limit;
    const players = hasNextPage ? result.rows.slice(0, -1) : result.rows;

    return {
      edges: players.map((player, index) => ({
        node: player,
        cursor: Buffer.from((offset + index).toString()).toString('base64'),
      })),
      pageInfo: {
        hasNextPage,
        hasPreviousPage: offset > 0,
        startCursor: players.length > 0 
          ? Buffer.from(offset.toString()).toString('base64')
          : null,
        endCursor: players.length > 0
          ? Buffer.from((offset + players.length - 1).toString()).toString('base64')
          : null,
        total,
      },
    };
  },

  // ============================================================================
  // STANDINGS
  // ============================================================================
  
  async standings(parent, { filter }, context) {
    const { db } = context;
    
    const result = await db.select('standings', {
      league_id: filter.leagueId,
      season: filter.season,
    }, {
      orderBy: 'position ASC',
    });
    
    return result;
  },

  // ============================================================================
  // ODDS
  // ============================================================================
  
  async liveOdds(parent, { gameId }, context) {
    const { dataloaders } = context;
    return await dataloaders.oddsByGameLoader.load(parseInt(gameId));
  },

  // ============================================================================
  // USERS (admin only)
  // ============================================================================
  
  async users(parent, args, context) {
    requireRole(context, ['admin']);
    const { db } = context;
    
    const result = await db.select('users', {}, {
      orderBy: 'created_at DESC',
    });
    
    // Remove password_hash
    return result.map(user => {
      delete user.password_hash;
      return user;
    });
  },

  async me(parent, args, context) {
    const user = requireAuth(context);
    const { dataloaders } = context;
    return await dataloaders.userLoader.load(user.id);
  },

  // ============================================================================
  // SYSTEM
  // ============================================================================
  
  async health(parent, args, context) {
    const { db } = context;
    const dbHealthy = await db.healthCheck();
    
    return {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      database: dbHealthy,
    };
  },
};

module.exports = queryResolvers;
