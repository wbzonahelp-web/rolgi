/**
 * Cached Proxy Routes
 * 
 * @module api/routes/cached-proxy
 * @description
 * Прокси-роуты с кэшированием для всех SStats API эндпоинтов.
 * Фронтенд использует эти роуты вместо прямых вызовов API.
 */

const axios = require('axios');
const apiCache = require('../../cache/api-cache');

// API Configuration
const API_BASE = process.env.SSTATS_API_URL || 'https://api.sstats.net';
const API_KEY = process.env.SSTATS_API_KEY || '';

/**
 * Create axios instance for API calls
 */
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

/**
 * Add API key to params
 */
function addApiKey(params) {
  if (API_KEY) {
    return { ...params, apikey: API_KEY };
  }
  return params;
}

/**
 * Proxy request with caching
 */
async function proxyWithCache(endpoint, params = {}, cacheTypeOverride = null) {
  const paramsWithKey = addApiKey(params);
  const url = `${API_BASE}${endpoint}`;
  const fullUrl = url + '?' + new URLSearchParams(paramsWithKey).toString();
  
  const cacheKey = apiCache.generateCacheKey(endpoint, params);
  const cacheType = cacheTypeOverride || apiCache.getCacheType(endpoint, params);
  const ttl = apiCache.getTTL(cacheType);
  
  // Check cache first
  const cached = await apiCache.get(cacheKey);
  if (cached) {
    return {
      success: true,
      data: cached.data || cached,
      fromCache: true,
      cacheType,
      ttl,
      cachedAt: cached._cachedAt
    };
  }
  
  // Fetch from API
  try {
    const response = await apiClient.get(endpoint, { params: paramsWithKey });
    const data = response.data;
    
    // Store in cache with timestamp
    const cacheData = {
      ...data,
      _cachedAt: Date.now()
    };
    await apiCache.set(cacheKey, cacheData, ttl);
    
    return {
      success: true,
      data: data.data || data,
      total: data.total || data.TotalCount,
      fromCache: false,
      cacheType,
      ttl
    };
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    return {
      success: false,
      error: error.message,
      status: error.response?.status || 500
    };
  }
}

/**
 * Register cached proxy routes
 * @param {FastifyInstance} fastify
 */
async function cachedProxyRoutes(fastify) {
  
  // ============================================================
  // LEAGUES
  // ============================================================
  
  fastify.get('/leagues', {
    schema: {
      description: 'Get all leagues (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Leagues', {});
  });
  
  // ============================================================
  // GAMES
  // ============================================================
  
  fastify.get('/games/list', {
    schema: {
      description: 'Get games list (cached based on params)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Games/list', request.query);
  });
  
  fastify.get('/games/:id', {
    schema: {
      description: 'Get game details (cached 1 min, 10s for live)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    const gameId = request.params.id;
    const endpoint = `/Games/${gameId}`;
    const paramsWithKey = addApiKey({});
    const cacheKey = apiCache.generateCacheKey(endpoint, {});
    
    // Check cache first
    const cached = await apiCache.get(cacheKey);
    if (cached) {
      // Check if game is live (status 2-4 means in progress)
      const gameStatus = cached.data?.game?.status || cached.game?.status;
      const isLive = gameStatus >= 2 && gameStatus <= 4;
      const ttl = isLive ? 10 : 60; // 10 sec for live, 60 sec for others
      
      return {
        success: true,
        data: cached.data || cached,
        fromCache: true,
        cacheType: isLive ? 'game-live' : 'game-details',
        ttl
      };
    }
    
    // Fetch from API
    try {
      const response = await apiClient.get(endpoint, { params: paramsWithKey });
      const data = response.data;
      
      // Determine if live match
      const gameStatus = data.data?.game?.status || data.game?.status;
      const isLive = gameStatus >= 2 && gameStatus <= 4;
      const ttl = isLive ? 10 : 60;
      
      // Store in cache
      await apiCache.set(cacheKey, data, ttl);
      
      return {
        success: true,
        data: data.data || data,
        fromCache: false,
        cacheType: isLive ? 'game-live' : 'game-details',
        ttl
      };
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 500
      };
    }
  });
  
  fastify.get('/games/glicko/:id', {
    schema: {
      description: 'Get Glicko predictions (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Games/glicko/${request.params.id}`, {});
  });
  
  fastify.get('/games/season-table', {
    schema: {
      description: 'Get season table with team names (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    const { league, year, format = 'json' } = request.query;
    
    // Get season table
    const tableResult = await proxyWithCache('/Games/season-table', { league, year, format });
    
    if (!tableResult.success || !tableResult.data) {
      return tableResult;
    }
    
    // Get team IDs from table
    const teamIds = Object.keys(tableResult.data);
    
    // Fetch team names in parallel (batch of up to 20)
    const teamNames = {};
    const batchSize = 20;
    
    for (let i = 0; i < teamIds.length; i += batchSize) {
      const batch = teamIds.slice(i, i + batchSize);
      const teamPromises = batch.map(async (teamId) => {
        try {
          const teamResult = await proxyWithCache(`/Teams/${teamId}`, {});
          if (teamResult.data && teamResult.data.name) {
            teamNames[teamId] = teamResult.data.name;
          }
        } catch (e) {
          // Ignore errors for individual teams
        }
      });
      await Promise.all(teamPromises);
    }
    
    // Enrich table data with team names
    const enrichedData = {};
    for (const [teamId, teamData] of Object.entries(tableResult.data)) {
      enrichedData[teamId] = {
        ...teamData,
        teamName: teamNames[teamId] || `Team #${teamId}`
      };
    }
    
    return {
      ...tableResult,
      data: enrichedData
    };
  });
  
  fastify.get('/games/profits', {
    schema: {
      description: 'Get profits analysis (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Games/profits', request.query);
  });
  
  fastify.get('/games/text-summary', {
    schema: {
      description: 'Get text summary (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Games/text-summary', request.query);
  });
  
  fastify.get('/games/injuries', {
    schema: {
      description: 'Get injuries (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Games/injuries', request.query);
  });
  
  fastify.get('/games/last-games-stats', {
    schema: {
      description: 'Get average stats (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Games/last-games-stats', request.query);
  });
  
  /**
   * POST /api/cached/games/query
   * Расширенный поиск матчей с SQL-подобным синтаксисом (кэшируется 1 мин)
   */
  fastify.post('/games/query', {
    schema: {
      description: 'Advanced games query with SQL-like syntax (cached 1 min)',
      tags: ['Cached Proxy'],
      body: {
        type: 'object',
        properties: {
          Condition: { 
            type: 'string',
            description: 'SQL-like filter condition. Operators: =, !=, >, <, >=, <=, IN, NOT IN, LIKE, AND, OR'
          },
          Fields: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Fields to return. Supports math expressions and aliases (AS)'
          },
          Order: { type: 'string', description: 'Sorting: field ASC/DESC' },
          Limit: { type: 'integer', minimum: 1, maximum: 1000 },
          Offset: { type: 'integer', minimum: 0 },
          Timezone: { type: 'integer', minimum: -12, maximum: 12, default: 3 },
          Format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        },
        required: ['Condition', 'Fields']
      }
    }
  }, async (request, reply) => {
    try {
      // Generate cache key from body
      const cacheKey = `query:${JSON.stringify(request.body)}`;
      const ttl = 60; // 1 minute cache
      
      // Check cache using apiCache.get (async)
      const cached = await apiCache.get(cacheKey);
      if (cached && cached.data && Object.keys(cached.data).length > 0) {
        return {
          success: true,
          count: cached.count || (Array.isArray(cached.data) ? cached.data.length : 0),
          data: cached.data,
          fromCache: true,
          cacheType: 'games-query'
        };
      }
      
      // Make API request
      const response = await apiClient.post(`/Games/query?apikey=${API_KEY}`, request.body);
      
      // For CSV return as is
      if (request.body.Format === 'csv' || request.body.format === 'csv') {
        reply.header('Content-Type', 'text/csv');
        return response.data;
      }
      
      const result = {
        count: response.data.count || (response.data.data ? response.data.data.length : 0),
        data: response.data.data || response.data
      };
      
      // Cache the result using apiCache.set (async)
      await apiCache.set(cacheKey, result, ttl);
      
      return {
        success: true,
        ...result,
        fromCache: false,
        cacheType: 'games-query'
      };
    } catch (error) {
      return reply.code(error.response?.status || 500).send({
        success: false,
        error: error.message,
        details: error.response?.data
      });
    }
  });
  
  // ============================================================
  // ODDS
  // ============================================================
  
  fastify.get('/odds/:gameId', {
    schema: {
      description: 'Get odds (cached 30 sec)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Odds/${request.params.gameId}`, {});
  });
  
  fastify.get('/odds/live/:gameId', {
    schema: {
      description: 'Get live odds (cached 10 sec)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Odds/live/${request.params.gameId}`, {});
  });
  
  fastify.get('/odds/live-changes/:gameId', {
    schema: {
      description: 'Get live odds changes (cached 10 sec)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Odds/live-changes/${request.params.gameId}`, request.query);
  });
  
  fastify.get('/odds/bookmakers', {
    schema: {
      description: 'Get bookmakers (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Odds/bookmakers', {});
  });
  
  // ============================================================
  // TEAMS
  // ============================================================
  
  fastify.get('/teams/list', {
    schema: {
      description: 'Search teams (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Teams/list', request.query);
  });
  
  fastify.get('/teams/:id', {
    schema: {
      description: 'Get team details (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Teams/${request.params.id}`, {});
  });
  
  // ============================================================
  // PLAYERS
  // ============================================================
  
  fastify.get('/players/find', {
    schema: {
      description: 'Search players (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Players/find', request.query);
  });
  
  fastify.get('/players/:id', {
    schema: {
      description: 'Get player details (cached 1 hour)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Players/${request.params.id}`, {});
  });
  
  fastify.get('/players/:id/events', {
    schema: {
      description: 'Get player events (cached 5 min)',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache(`/Players/${request.params.id}/events`, request.query);
  });
  
  // ============================================================
  // FLASHSCORE / LS
  // ============================================================
  
  fastify.get('/ls/list', {
    schema: {
      description: 'Get Flashscore games list',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Ls/List', request.query);
  });
  
  fastify.get('/ls/leagues', {
    schema: {
      description: 'Get Flashscore leagues',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Ls/Leagues', request.query);
  });
  
  fastify.get('/ls/seasons', {
    schema: {
      description: 'Get Flashscore seasons',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Ls/Seasons', request.query);
  });
  
  fastify.get('/ls/teams', {
    schema: {
      description: 'Get Flashscore teams',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Ls/Teams', request.query);
  });
  
  // ============================================================
  // SEASONS / STANDINGS
  // ============================================================
  
  fastify.get('/seasons/standings', {
    schema: {
      description: 'Get season standings',
      tags: ['Cached Proxy']
    }
  }, async (request, reply) => {
    return proxyWithCache('/Seasons/standings', request.query);
  });
  
  // ============================================================
  // CACHE MANAGEMENT
  // ============================================================
  
  fastify.get('/cache/stats', {
    schema: {
      description: 'Get cache statistics',
      tags: ['Cache']
    }
  }, async (request, reply) => {
    return {
      success: true,
      stats: apiCache.getStats()
    };
  });
  
  fastify.post('/cache/clear', {
    schema: {
      description: 'Clear all cache',
      tags: ['Cache']
    }
  }, async (request, reply) => {
    await apiCache.clear();
    return {
      success: true,
      message: 'Cache cleared'
    };
  });
}

module.exports = cachedProxyRoutes;
