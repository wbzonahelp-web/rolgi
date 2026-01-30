/**
 * Apollo Server GraphQL Integration
 * 
 * @module graphql/apollo-server
 * @description
 * Apollo Server 4 integration с Fastify
 */

const { ApolloServer } = require('@apollo/server');
const { fastifyApolloDrainPlugin, fastifyApolloHandler } = require('@apollo/server/plugin/drainPlugin');
const typeDefs = require('./schema/typeDefs');
const { resolvers } = require('./resolvers');
const { createDataLoaders } = require('./dataloaders');
const { verifyToken } = require('../auth/jwt-auth');
const logger = require('../monitoring/logger');

/**
 * Create Apollo Server instance
 * @param {Object} db - Database instance
 * @param {FastifyInstance} app - Fastify app instance
 * @returns {ApolloServer} Apollo Server instance
 */
async function createApolloServer(db, app) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      // Graceful shutdown plugin
      {
        async serverWillStart() {
          return {
            async drainServer() {
              logger.info('Apollo Server draining...');
            },
          };
        },
      },
    ],
    formatError: (formattedError, error) => {
      // Log error
      logger.error('GraphQL Error', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path,
      });

      // Return formatted error
      return formattedError;
    },
    introspection: process.env.NODE_ENV !== 'production', // Disable in production
    includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',
  });

  await server.start();
  logger.info('Apollo Server started');

  return server;
}

/**
 * Setup Apollo Server routes in Fastify
 * @param {FastifyInstance} app - Fastify app instance
 * @param {ApolloServer} server - Apollo Server instance
 * @param {Object} db - Database instance
 */
function setupApolloRoutes(app, server, db) {
  // GraphQL endpoint
  app.all('/graphql', async (request, reply) => {
    // Extract user from JWT token
    let user = null;
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = verifyToken(token);
        user = decoded;
      } catch (error) {
        // Invalid token - proceed without user
        logger.debug('Invalid JWT token in GraphQL request');
      }
    }

    // Create dataloaders for this request (important for caching)
    const dataloaders = createDataLoaders(db);

    // Execute GraphQL request
    const response = await server.executeOperation(
      {
        query: request.body.query,
        variables: request.body.variables,
        operationName: request.body.operationName,
      },
      {
        contextValue: {
          db,
          dataloaders,
          user,
          request,
          reply,
        },
      }
    );

    // Send response
    if (response.body.kind === 'single') {
      reply
        .code(200)
        .header('Content-Type', 'application/json')
        .send(response.body.singleResult);
    } else {
      // Incremental response (not yet supported)
      reply.code(500).send({ error: 'Incremental responses not supported' });
    }
  });

  logger.info('Apollo Server routes registered at /graphql');
}

module.exports = {
  createApolloServer,
  setupApolloRoutes,
};
