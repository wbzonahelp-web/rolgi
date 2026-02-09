/**
 * Тестовый сервер для Flashscore API
 * Запускает только эндпоинты Flashscore без базы данных
 */

const fastify = require('fastify');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const SStatsClient = require('./src/api/sstats-client');
const flashscoreRoutes = require('./src/api/routes/flashscore-routes');
const teamsRoutes = require('./src/api/routes/teams-routes');
const gamesRoutes = require('./src/api/routes/games-routes');
const oddsRoutes = require('./src/api/routes/odds-routes');
const playersRoutes = require('./src/api/routes/players-routes');
require('dotenv').config();

async function startServer() {
  const app = fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  // Swagger Documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'SStats API Test Server',
        description: 'Тестовый сервер для Flashscore, Teams и Games API эндпоинтов',
        version: '1.0.0'
      },
      host: 'localhost:3001',
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Flashscore', description: 'Flashscore API endpoints' },
        { name: 'Teams', description: 'Teams API endpoints' },
        { name: 'Games', description: 'Games API endpoints' },
        { name: 'Health', description: 'Health check endpoints' }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true,
    transformSpecificationClone: true
  });

  // Initialize SStats Client
  const sstatsClient = new SStatsClient({
    baseURL: process.env.SSTATS_API_URL || 'https://api.sstats.net',
    apiKey: process.env.SSTATS_API_KEY,
    timeout: parseInt(process.env.API_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.API_RETRY_MAX) || 3,
    retryDelay: parseInt(process.env.API_RETRY_DELAY) || 1000,
    enableCache: process.env.ENABLE_CACHE === 'true',
    cacheTTL: 300,
    rateLimitPerMin: parseInt(process.env.API_RATE_LIMIT) || 300
  });

  app.log.info('SStatsClient initialized', {
    baseURL: sstatsClient.config.baseURL,
    hasApiKey: !!sstatsClient.config.apiKey,
    rateLimit: sstatsClient.config.rateLimitPerMin
  });

  // Health check
  app.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  });

  // Register Flashscore routes
  await app.register(flashscoreRoutes, {
    prefix: '/api/flashscore',
    sstatsClient: sstatsClient
  });

  // Register Teams routes
  await app.register(teamsRoutes, {
    prefix: '/api/teams',
    sstatsClient: sstatsClient
  });

  // Register Games routes
  await app.register(gamesRoutes, {
    prefix: '/api/games',
    sstatsClient: sstatsClient
  });

  // Register Odds routes
  await app.register(oddsRoutes, {
    prefix: '/api/odds',
    sstatsClient: sstatsClient
  });

  // Register Players routes
  await app.register(playersRoutes, {
    prefix: '/api/players',
    sstatsClient: sstatsClient
  });

  // Serve static files (для UI)
  app.register(require('@fastify/static'), {
    root: require('path').join(__dirname, 'public'),
    prefix: '/'
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
      statusCode: error.statusCode || 500
    });
  });

  // Start server
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.API_HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    
    console.log('\n' + '='.repeat(80));
    console.log('🚀 SStats API Test Server Started!');
    console.log('='.repeat(80));
    console.log(`📡 Server:     http://localhost:${port}`);
    console.log(`📚 Swagger:    http://localhost:${port}/docs`);
    console.log(`❤️  Health:     http://localhost:${port}/health`);
    console.log('='.repeat(80));
    console.log('\n🎨 Query Builder UIs:');
    console.log(`  📋 Flashscore: http://localhost:${port}/flashscore-query-builder.html`);
    console.log(`  👥 Teams:      http://localhost:${port}/teams-query-builder.html`);
    console.log(`  ⚽ Games:      http://localhost:${port}/games-query-builder.html`);
    console.log('='.repeat(80) + '\n');
    
    console.log('📋 Flashscore Endpoints:');
    console.log('  GET  /api/flashscore/games/today');
    console.log('  GET  /api/flashscore/games/live');
    console.log('  GET  /api/flashscore/games/upcoming');
    console.log('  GET  /api/flashscore/games/date/:date');
    console.log('  GET  /api/flashscore/games/team/:teamId');
    console.log('  GET  /api/flashscore/games/league/:leagueId');
    console.log('  GET  /api/flashscore/game/:gameId');
    console.log('  GET  /api/flashscore/leagues');
    console.log('  GET  /api/flashscore/leagues/search');
    console.log('  GET  /api/flashscore/seasons/:leagueId');
    console.log('  GET  /api/flashscore/examples');
    console.log('  GET  /api/flashscore/health');
    console.log('\n📋 Teams Endpoints:');
    console.log('  GET  /api/teams/list');
    console.log('  GET  /api/teams/:id');
    console.log('  GET  /api/teams/search');
    console.log('  GET  /api/teams/country/:country');
    console.log('  GET  /api/teams/examples');
    console.log('  GET  /api/teams/health');
    console.log('\n📋 Games Endpoints:');
    console.log('  GET  /api/games/list');
    console.log('  GET  /api/games/today');
    console.log('  GET  /api/games/live');
    console.log('  GET  /api/games/upcoming');
    console.log('  GET  /api/games/ended');
    console.log('  GET  /api/games/date/:date');
    console.log('  GET  /api/games/team/:teamId');
    console.log('  GET  /api/games/league/:leagueId');
    console.log('  GET  /api/games/h2h/:team1/:team2');
    console.log('  GET  /api/games/examples');
    console.log('  GET  /api/games/health');
    console.log('  GET  /api/flashscore/leagues/search');
    console.log('  GET  /api/flashscore/seasons/:leagueId');
    console.log('  GET  /api/flashscore/examples');
    console.log('  GET  /api/flashscore/health');
    console.log('='.repeat(80) + '\n');
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    try {
      await app.close();
      console.log('✅ Server closed successfully');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return app;
}

// Start server
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = startServer;
