/**
 * Authentication API Routes
 * 
 * @module api/routes/auth
 * @description
 * API endpoints для аутентификации и управления пользователями.
 */

const { authenticate, requireRole, requirePermission } = require('../auth/fastify-auth');
const { ROLES } = require('../auth/jwt-auth');

/**
 * Регистрация auth routes
 */
async function authRoutes(fastify, options) {
  const jwtAuth = fastify.jwtAuth;

  // ============================================================
  // PUBLIC ROUTES (без аутентификации)
  // ============================================================

  /**
   * POST /api/auth/register
   * Регистрация нового пользователя
   */
  fastify.post('/register', {
    schema: {
      description: 'Register a new user',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['admin', 'analyst', 'viewer'], default: 'viewer' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                userId: { type: 'integer' },
                username: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { username, email, password, role } = request.body;

        const result = await jwtAuth.register({
          username,
          email,
          password,
          role: role || ROLES.VIEWER
        });

        reply.code(201).send(result);
      } catch (error) {
        request.log.error('Registration error:', error);
        reply.code(400).send({
          error: 'Registration failed',
          message: error.message
        });
      }
    }
  });

  /**
   * POST /api/auth/login
   * Вход пользователя
   */
  fastify.post('/login', {
    schema: {
      description: 'Login and get JWT tokens',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                userId: { type: 'integer' },
                username: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' }
              }
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { username, password } = request.body;

        const result = await jwtAuth.login({ username, password });

        reply.send(result);
      } catch (error) {
        request.log.error('Login error:', error);
        reply.code(401).send({
          error: 'Login failed',
          message: error.message
        });
      }
    }
  });

  /**
   * POST /api/auth/refresh
   * Обновление Access Token через Refresh Token
   */
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh access token using refresh token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            expiresIn: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { refreshToken } = request.body;

        const result = await jwtAuth.refreshAccessToken(refreshToken);

        reply.send(result);
      } catch (error) {
        request.log.error('Token refresh error:', error);
        reply.code(401).send({
          error: 'Token refresh failed',
          message: error.message
        });
      }
    }
  });

  // ============================================================
  // PROTECTED ROUTES (требуют аутентификации)
  // ============================================================

  /**
   * POST /api/auth/logout
   * Выход (отзыв токена)
   */
  fastify.post('/logout', {
    preHandler: [authenticate],
    schema: {
      description: 'Logout and revoke access token',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const token = request.headers.authorization.split(' ')[1];
        const result = jwtAuth.logout(token);

        reply.send(result);
      } catch (error) {
        request.log.error('Logout error:', error);
        reply.code(500).send({
          error: 'Logout failed',
          message: error.message
        });
      }
    }
  });

  /**
   * GET /api/auth/me
   * Получение информации о текущем пользователе
   */
  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      description: 'Get current user info',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string' },
            lastLoginAt: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const result = await jwtAuth.getCurrentUser(request.user.userId);
        reply.send(result);
      } catch (error) {
        request.log.error('Get current user error:', error);
        reply.code(500).send({
          error: 'Failed to get user info',
          message: error.message
        });
      }
    }
  });

  /**
   * PUT /api/auth/password
   * Изменение пароля
   */
  fastify.put('/password', {
    preHandler: [authenticate],
    schema: {
      description: 'Change user password',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['oldPassword', 'newPassword'],
        properties: {
          oldPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { oldPassword, newPassword } = request.body;

        const result = await jwtAuth.changePassword(
          request.user.userId,
          oldPassword,
          newPassword
        );

        reply.send(result);
      } catch (error) {
        request.log.error('Password change error:', error);
        reply.code(400).send({
          error: 'Password change failed',
          message: error.message
        });
      }
    }
  });

  // ============================================================
  // ADMIN ONLY ROUTES
  // ============================================================

  /**
   * GET /api/auth/users
   * Получение списка всех пользователей (admin only)
   */
  fastify.get('/users', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Get all users (admin only)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
          offset: { type: 'integer', default: 0, minimum: 0 },
          role: { type: 'string', enum: ['admin', 'analyst', 'viewer'] },
          isActive: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'integer' },
                  username: { type: 'string' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string' },
                  lastLoginAt: { type: 'string' }
                }
              }
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { limit, offset, role, isActive } = request.query;

        const result = await jwtAuth.getAllUsers({
          limit,
          offset,
          role,
          isActive
        });

        reply.send(result);
      } catch (error) {
        request.log.error('Get users error:', error);
        reply.code(500).send({
          error: 'Failed to get users',
          message: error.message
        });
      }
    }
  });

  /**
   * PUT /api/auth/users/:userId/role
   * Изменение роли пользователя (admin only)
   */
  fastify.put('/users/:userId/role', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Update user role (admin only)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['admin', 'analyst', 'viewer'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { userId } = request.params;
        const { role } = request.body;

        const result = await jwtAuth.updateUserRole(userId, role);

        reply.send(result);
      } catch (error) {
        request.log.error('Update user role error:', error);
        reply.code(400).send({
          error: 'Failed to update user role',
          message: error.message
        });
      }
    }
  });

  /**
   * POST /api/auth/users/:userId/deactivate
   * Деактивация пользователя (admin only)
   */
  fastify.post('/users/:userId/deactivate', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Deactivate user (admin only)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'integer' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { userId } = request.params;
        const result = await jwtAuth.deactivateUser(userId);

        reply.send(result);
      } catch (error) {
        request.log.error('Deactivate user error:', error);
        reply.code(500).send({
          error: 'Failed to deactivate user',
          message: error.message
        });
      }
    }
  });

  /**
   * POST /api/auth/users/:userId/activate
   * Активация пользователя (admin only)
   */
  fastify.post('/users/:userId/activate', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN)],
    schema: {
      description: 'Activate user (admin only)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'integer' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { userId } = request.params;
        const result = await jwtAuth.activateUser(userId);

        reply.send(result);
      } catch (error) {
        request.log.error('Activate user error:', error);
        reply.code(500).send({
          error: 'Failed to activate user',
          message: error.message
        });
      }
    }
  });
}

module.exports = authRoutes;
