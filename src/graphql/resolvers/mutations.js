/**
 * GraphQL Mutation Resolvers
 * 
 * @module graphql/resolvers/mutations
 */

const { GraphQLError } = require('graphql');
const bcrypt = require('bcrypt');
const { requireAuth, requireRole } = require('./index');
const { issueTokens } = require('../../auth/jwt-auth');

const mutationResolvers = {
  // ============================================================================
  // AUTH
  // ============================================================================
  
  async login(parent, { username, password }, context) {
    const { db } = context;
    
    // Find user
    const users = await db.select('users', { username });
    if (users.length === 0) {
      throw new GraphQLError('Invalid credentials', {
        extensions: { code: 'UNAUTHENTICATED' }
      });
    }
    
    const user = users[0];
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new GraphQLError('Invalid credentials', {
        extensions: { code: 'UNAUTHENTICATED' }
      });
    }
    
    // Check if active
    if (!user.is_active) {
      throw new GraphQLError('Account is disabled', {
        extensions: { code: 'FORBIDDEN' }
      });
    }
    
    // Issue tokens
    const tokens = issueTokens(user);
    
    delete user.password_hash;
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  },

  // ============================================================================
  // USER MANAGEMENT (admin only)
  // ============================================================================
  
  async createUser(parent, { input }, context) {
    requireRole(context, ['admin']);
    const { db } = context;
    
    // Hash password
    const passwordHash = await bcrypt.hash(input.password, 10);
    
    const user = await db.insert('users', {
      username: input.username,
      email: input.email,
      password_hash: passwordHash,
      role: input.role,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    delete user.password_hash;
    return user;
  },

  async updateUser(parent, { id, input }, context) {
    requireRole(context, ['admin']);
    const { db } = context;
    
    const updateData = { ...input, updated_at: new Date() };
    
    // Hash password if provided
    if (input.password) {
      updateData.password_hash = await bcrypt.hash(input.password, 10);
      delete updateData.password;
    }
    
    const user = await db.update('users', { id: parseInt(id) }, updateData);
    delete user.password_hash;
    return user;
  },

  async deleteUser(parent, { id }, context) {
    requireRole(context, ['admin']);
    const { db } = context;
    
    await db.delete('users', { id: parseInt(id) });
    
    return {
      success: true,
      message: 'User deleted successfully',
    };
  },

  // ============================================================================
  // DATA LOADER
  // ============================================================================
  
  async loadGames(parent, { leagueId, season }, context) {
    requireRole(context, ['admin', 'analyst']);
    
    // This would trigger the actual data loader
    // For now, return a mock response
    return {
      success: true,
      sessionId: `session-${Date.now()}`,
      message: 'Games loading started',
      recordsProcessed: 0,
    };
  },
};

module.exports = mutationResolvers;
