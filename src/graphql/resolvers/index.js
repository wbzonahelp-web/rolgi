/**
 * GraphQL Resolvers
 * 
 * @module graphql/resolvers
 * @description
 * Main resolvers объединяющий все query, mutation и subscription resolvers
 */

const { GraphQLError } = require('graphql');
const { verifyToken } = require('../../auth/jwt-auth');
const queryResolvers = require('./queries');
const mutationResolvers = require('./mutations');
const typeResolvers = require('./types');
const subscriptionResolvers = require('./subscriptions');

/**
 * Check if user is authenticated
 */
function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
  return context.user;
}

/**
 * Check if user has required role
 */
function requireRole(context, roles) {
  const user = requireAuth(context);
  
  if (!roles.includes(user.role)) {
    throw new GraphQLError('Insufficient permissions', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
  
  return user;
}

/**
 * Custom scalar resolvers
 */
const scalarResolvers = {
  DateTime: {
    parseValue(value) {
      return new Date(value);
    },
    serialize(value) {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return new Date(value).toISOString();
    },
    parseLiteral(ast) {
      if (ast.kind === 'StringValue') {
        return new Date(ast.value);
      }
      return null;
    },
  },
  JSON: {
    parseValue(value) {
      return value;
    },
    serialize(value) {
      return value;
    },
    parseLiteral(ast) {
      if (ast.kind === 'ObjectValue') {
        return ast.value;
      }
      return null;
    },
  },
};

/**
 * Main resolvers
 */
const resolvers = {
  ...scalarResolvers,
  
  Query: queryResolvers,
  Mutation: mutationResolvers,
  Subscription: subscriptionResolvers,
  
  // Type resolvers (field resolvers)
  ...typeResolvers,
};

module.exports = {
  resolvers,
  requireAuth,
  requireRole,
};
