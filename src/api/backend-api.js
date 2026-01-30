/**
 * Backend API Server v6.0.0
 * 
 * Fastify-based REST API для Rolgi SStats Analytics Platform
 * 
 * Возможности:
 * - REST API эндпоинты для работы с данными
 * - Swagger/OpenAPI документация
 * - CORS поддержка
 * - Rate limiting
 * - JWT авторизация
 * - Request validation
 * - Response serialization
 * - Error handling
 * - Health checks
 * - Metrics endpoint
 * 
 * Эндпоинты:
 * - GET /health - Health check
 * - GET /metrics - Metrics
 * - GET /api/games - Список игр
 * - GET /api/games/:id - Детали игры
 * - GET /api/teams - Список команд
 * - GET /api/teams/:id - Детали команды
 * - GET /api/players - Список игроков
 * - GET /api/players/:id - Детали игрока
 * - GET /api/odds/live/:gameId - Live коэффициенты
 * - GET /api/standings - Турнирная таблица
 * - POST /api/loader/load - Запустить загрузку данных
 * - GET /api/loader/status/:sessionId - Статус загрузки
 * 
 * @module backend-api
 */

const fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const pino = require('pino');
const { getDatabase } = require('../database/db-pool');
const DataLoader = require('../loader/data-loader');
const SStatsClient = require('./sstats-client');
const { jwtAuthPlugin } = require('../auth/fastify-auth');
const authRoutes = require('./routes/auth');
const { rateLimiterPlugin, roleBasedRateLimit } = require('../cache/fastify-rate-limiter');
const { queryCachePlugin, scheduleCacheWarming } = require('../cache/fastify-query-cache');

const logger = pino({
  name: 'backend-api',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * @typedef {Object} ApiConfig
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {boolean} enableSwagger - Enable Swagger docs
 * @property {boolean} enableCors - Enable CORS
 * @property {boolean} enableRateLimit - Enable rate limiting
 * @property {number} rateLimitMax - Max requests per window
 * @property {number} rateLimitWindow - Rate limit window in ms
 */

/**
 * Backend API Server
 */
class BackendApi {
  /**
   * @param {ApiConfig} config
   */
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.API_PORT || 3000,
      host: config.host || process.env.API_HOST || '0.0.0.0',
      enableSwagger: config.enableSwagger !== false,
      enableCors: config.enableCors !== false,
      enableRateLimit: config.enableRateLimit !== false,
      rateLimitMax: config.rateLimitMax || 100,
      rateLimitWindow: config.rateLimitWindow || 60000 // 1 minute
    };

    // Fastify instance
    this.app = fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info'
      },
      requestIdLogLabel: 'requestId',
      disableRequestLogging: false,
      requestIdHeader: 'x-request-id'
    });

    // Database
    this.db = getDatabase();

    // Data Loader
    this.loader = new DataLoader();

    // SStats API Client
    this.apiClient = new SStatsClient();

    // Load sessions cache
    this.loadSessions = new Map();

    logger.info({
      port: this.config.port,
      host: this.config.host
    }, 'BackendApi initialized');
  }

  /**
   * Setup plugins and middleware
   * @private
   */
  async _setupPlugins() {
    // Helmet for security headers
    await this.app.register(helmet, {
      contentSecurityPolicy: false
    });

    // CORS
    if (this.config.enableCors) {
      await this.app.register(cors, {
        origin: true,
        credentials: true
      });
    }

    // JWT Authentication
    await this.app.register(jwtAuthPlugin, {
      dbPool: this.db
    });

    // Redis-based Rate Limiting
    if (this.config.enableRateLimit) {
      await this.app.register(rateLimiterPlugin);
      
      // Global rate limit для всех routes
      this.app.addHook('onRequest', roleBasedRateLimit());
    }

    // Redis-based Query Caching
    await this.app.register(queryCachePlugin);

    // Swagger documentation
    if (this.config.enableSwagger) {
      await this.app.register(swagger, {
        openapi: {
          info: {
            title: 'Rolgi SStats Analytics API',
            description: 'REST API для работы с футбольной аналитикой',
            version: '6.0.0'
          },
          servers: [
            {
              url: `http://localhost:${this.config.port}`,
              description: 'Development server'
            }
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
              }
            }
          },
          tags: [
            { name: 'Health', description: 'Health check endpoints' },
            { name: 'Authentication', description: 'Authentication and authorization endpoints' },
            { name: 'Games', description: 'Games data endpoints' },
            { name: 'Teams', description: 'Teams data endpoints' },
            { name: 'Players', description: 'Players data endpoints' },
            { name: 'Odds', description: 'Odds data endpoints' },
            { name: 'Standings', description: 'Standings endpoints' },
            { name: 'Loader', description: 'Data loader endpoints' }
          ]
        }
      });

      await this.app.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
          docExpansion: 'list',
          deepLinking: true
        },
        staticCSP: true
      });
    }

    logger.info('Plugins registered');
  }

  /**
   * Setup routes
   * @private
   */
  _setupRoutes() {
    // ============================================================
    // HEALTH & METRICS
    // ============================================================

    this.app.get('/health', {
      schema: {
        tags: ['Health'],
        description: 'Health check endpoint',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              database: { type: 'boolean' }
            }
          }
        }
      }
    }, async (request, reply) => {
      const dbHealthy = await this.db.healthCheck();

      return {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy
      };
    });

    this.app.get('/metrics', {
      schema: {
        tags: ['Health'],
        description: 'System metrics endpoint'
      }
    }, async (request, reply) => {
      return {
        api: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        database: this.db.getPoolStats(),
        loader: this.loader.getStats(),
        apiClient: this.apiClient.getMetrics()
      };
    });

    // ============================================================
    // AUTHENTICATION
    // ============================================================

    this.app.register(authRoutes, { prefix: '/api/auth' });

    // ============================================================
    // GAMES
    // ============================================================

    this.app.get('/api/games', {
      schema: {
        tags: ['Games'],
        description: 'Получить список игр (с кэшированием)',
        querystring: {
          type: 'object',
          properties: {
            league_id: { type: 'integer' },
            season: { type: 'string' },
            status: { type: 'string' },
            date_from: { type: 'string' },
            date_to: { type: 'string' },
            team_id: { type: 'integer' },
            limit: { type: 'integer', default: 50 },
            offset: { type: 'integer', default: 0 }
          }
        }
      }
    }, async (request, reply) => {
      const { league_id, season, status, date_from, date_to, team_id, limit, offset } = request.query;
      const filters = { league_id, season, status, date_from, date_to, team_id, limit, offset };

      // Проверяем кэш
      const cached = await request.server.queryCache.getGames(filters);
      if (cached) {
        return reply.cached(cached, 300);
      }

      // Получаем из БД
      const where = {};
      if (league_id) where.league_id = league_id;
      if (season) where.season = season;
      if (status) where.status = status;
      
      let games;
      if (team_id) {
        // Games where team is home or away
        const result = await this.db.query(
          `SELECT * FROM games 
           WHERE (home_team_id = $1 OR away_team_id = $1)
           ORDER BY game_date DESC
           LIMIT $2 OFFSET $3`,
          [team_id, limit || 50, offset || 0]
        );
        games = result.rows;
      } else {
        games = await this.db.select('games', where, {
          orderBy: 'game_date DESC',
          limit: limit || 50,
          offset: offset || 0
        });
      }

      // Сохраняем в кэш
      await request.server.queryCache.cacheGames(filters, games);

      return reply.notCached(games);
    });

    this.app.get('/api/games/:id', {
      schema: {
        tags: ['Games'],
        description: 'Получить детали игры (с кэшированием)',
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    }, async (request, reply) => {
      const { id } = request.params;

      // Проверяем кэш
      const cached = await request.server.queryCache.getGameDetails(id);
      if (cached) {
        return reply.cached(cached, 30);
      }

      const game = await this.db.select('games', { id }, { limit: 1 });

      if (game.length === 0) {
        reply.code(404);
        return { error: 'Game not found' };
      }

      // Load related data
      const [homeTeam] = await this.db.select('teams', { id: game[0].home_team_id });
      const [awayTeam] = await this.db.select('teams', { id: game[0].away_team_id });
      const [league] = await this.db.select('leagues', { id: game[0].league_id });

      const gameDetails = {
        ...game[0],
        home_team: homeTeam,
        away_team: awayTeam,
        league
      };

      // Сохраняем в кэш
      await request.server.queryCache.cacheGameDetails(id, gameDetails);

      return reply.notCached(gameDetails);
    });

    // ============================================================
    // TEAMS
    // ============================================================

    this.app.get('/api/teams', {
      schema: {
        tags: ['Teams'],
        description: 'Получить список команд',
        querystring: {
          type: 'object',
          properties: {
            country_id: { type: 'integer' },
            search: { type: 'string' },
            limit: { type: 'integer', default: 50 },
            offset: { type: 'integer', default: 0 }
          }
        }
      }
    }, async (request, reply) => {
      const { country_id, search, limit, offset } = request.query;

      if (search) {
        const teams = await this.db.query(
          `SELECT * FROM teams 
           WHERE name ILIKE $1 OR short_name ILIKE $1
           ORDER BY name
           LIMIT $2 OFFSET $3`,
          [`%${search}%`, limit || 50, offset || 0]
        );
        return teams.rows;
      }

      const where = {};
      if (country_id) where.country_id = country_id;

      const teams = await this.db.select('teams', where, {
        orderBy: 'name',
        limit: limit || 50,
        offset: offset || 0
      });

      return teams;
    });

    this.app.get('/api/teams/:id', {
      schema: {
        tags: ['Teams'],
        description: 'Получить детали команды',
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    }, async (request, reply) => {
      const { id } = request.params;

      const team = await this.db.select('teams', { id }, { limit: 1 });

      if (team.length === 0) {
        reply.code(404);
        return { error: 'Team not found' };
      }

      // Load players
      const players = await this.db.select('players', { team_id: id });

      return {
        ...team[0],
        players
      };
    });

    // ============================================================
    // PLAYERS
    // ============================================================

    this.app.get('/api/players', {
      schema: {
        tags: ['Players'],
        description: 'Получить список игроков',
        querystring: {
          type: 'object',
          properties: {
            team_id: { type: 'integer' },
            position: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'integer', default: 50 },
            offset: { type: 'integer', default: 0 }
          }
        }
      }
    }, async (request, reply) => {
      const { team_id, position, search, limit, offset } = request.query;

      if (search) {
        const players = await this.db.query(
          `SELECT * FROM players 
           WHERE name ILIKE $1
           ORDER BY name
           LIMIT $2 OFFSET $3`,
          [`%${search}%`, limit || 50, offset || 0]
        );
        return players.rows;
      }

      const where = {};
      if (team_id) where.team_id = team_id;
      if (position) where.position = position;

      const players = await this.db.select('players', where, {
        orderBy: 'name',
        limit: limit || 50,
        offset: offset || 0
      });

      return players;
    });

    this.app.get('/api/players/:id', {
      schema: {
        tags: ['Players'],
        description: 'Получить детали игрока',
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    }, async (request, reply) => {
      const { id } = request.params;

      const player = await this.db.select('players', { id }, { limit: 1 });

      if (player.length === 0) {
        reply.code(404);
        return { error: 'Player not found' };
      }

      // Load team
      const [team] = await this.db.select('teams', { id: player[0].team_id });

      return {
        ...player[0],
        team
      };
    });

    // ============================================================
    // ODDS
    // ============================================================

    this.app.get('/api/odds/live/:gameId', {
      schema: {
        tags: ['Odds'],
        description: 'Получить live коэффициенты для игры',
        params: {
          type: 'object',
          properties: {
            gameId: { type: 'integer' }
          },
          required: ['gameId']
        }
      }
    }, async (request, reply) => {
      const { gameId } = request.params;

      const odds = await this.db.select('odds', { game_id: gameId, is_live: true }, {
        orderBy: 'timestamp DESC'
      });

      return odds;
    });

    // ============================================================
    // STANDINGS
    // ============================================================

    this.app.get('/api/standings', {
      schema: {
        tags: ['Standings'],
        description: 'Получить турнирную таблицу (с кэшированием)',
        querystring: {
          type: 'object',
          properties: {
            league_id: { type: 'integer' },
            season: { type: 'string' }
          },
          required: ['league_id', 'season']
        }
      }
    }, async (request, reply) => {
      const { league_id, season } = request.query;

      // Проверяем кэш
      const cached = await request.server.queryCache.getStandings(league_id, season);
      if (cached) {
        return reply.cached(cached, 600);
      }

      const standings = await this.db.select('standings', { league_id, season }, {
        orderBy: 'position'
      });

      // Сохраняем в кэш
      await request.server.queryCache.cacheStandings(league_id, season, standings);

      return reply.notCached(standings);
    });

    // ============================================================
    // DATA LOADER
    // ============================================================

    this.app.post('/api/loader/load', {
      schema: {
        tags: ['Loader'],
        description: 'Запустить загрузку данных',
        body: {
          type: 'object',
          properties: {
            entity_type: { type: 'string', enum: ['games', 'teams', 'players', 'odds', 'standings'] },
            fetch_params: { type: 'object' },
            table_name: { type: 'string' }
          },
          required: ['entity_type']
        }
      }
    }, async (request, reply) => {
      const { entity_type, fetch_params = {}, table_name } = request.body;

      try {
        // Start load in background
        const sessionPromise = this.loader.load(entity_type, fetch_params, table_name);

        // Store session promise
        const sessionId = this.loader.currentSession.sessionId;
        this.loadSessions.set(sessionId, sessionPromise);

        // Return session ID immediately
        reply.code(202);
        return {
          sessionId,
          status: 'STARTED',
          message: 'Load session started. Use GET /api/loader/status/:sessionId to check progress.'
        };
      } catch (error) {
        reply.code(500);
        return {
          error: 'Failed to start load session',
          message: error.message
        };
      }
    });

    this.app.get('/api/loader/status/:sessionId', {
      schema: {
        tags: ['Loader'],
        description: 'Получить статус загрузки',
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' }
          },
          required: ['sessionId']
        }
      }
    }, async (request, reply) => {
      const { sessionId } = request.params;

      const sessionPromise = this.loadSessions.get(sessionId);

      if (!sessionPromise) {
        reply.code(404);
        return { error: 'Session not found' };
      }

      try {
        const session = await sessionPromise;
        return session;
      } catch (error) {
        reply.code(500);
        return {
          error: 'Load session failed',
          message: error.message
        };
      }
    });

    logger.info('Routes registered');
  }

  /**
   * Setup error handlers
   * @private
   */
  _setupErrorHandlers() {
    this.app.setErrorHandler((error, request, reply) => {
      logger.error({
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method
      }, 'Request error');

      reply.status(error.statusCode || 500).send({
        error: error.message,
        statusCode: error.statusCode || 500
      });
    });

    this.app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404
      });
    });
  }

  /**
   * Start server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      await this._setupPlugins();
      this._setupRoutes();
      this._setupErrorHandlers();

      await this.app.listen({
        port: this.config.port,
        host: this.config.host
      });

      // Start cache warming
      if (this.app.queryCache) {
        await scheduleCacheWarming(this.app, this.db, 300000); // Every 5 minutes
        logger.info('Cache warming scheduled');
      }

      logger.info({
        port: this.config.port,
        host: this.config.host,
        docs: this.config.enableSwagger ? `http://${this.config.host}:${this.config.port}/docs` : null
      }, 'Backend API server started');

      if (this.config.enableSwagger) {
        console.log(`\n📖 Swagger documentation: http://${this.config.host}:${this.config.port}/docs\n`);
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Stop server
   * @returns {Promise<void>}
   */
  async stop() {
    await this.app.close();
    await this.db.close();
    this.apiClient.close();
    logger.info('Backend API server stopped');
  }
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const api = new BackendApi();

  (async () => {
    try {
      await api.start();

      // Graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        await api.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (error) {
      console.error('Failed to start API server:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = BackendApi;
