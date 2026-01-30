/**
 * Fastify Authentication Middleware
 * 
 * @module auth/fastify-auth
 * @description
 * Middleware для аутентификации и авторизации в Fastify.
 * Использует JWT tokens для проверки доступа.
 */

const { JWTAuth } = require('./jwt-auth');

/**
 * Декоратор для добавления jwtAuth в Fastify instance
 */
function jwtAuthPlugin(fastify, options, done) {
  // Создаём экземпляр JWTAuth
  const jwtAuth = new JWTAuth(options.dbPool);

  // Декорируем fastify instance
  fastify.decorate('jwtAuth', jwtAuth);

  done();
}

/**
 * Middleware для проверки JWT токена
 */
async function authenticate(request, reply) {
  try {
    // Извлекаем токен из заголовка Authorization
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    // Проверяем формат: Bearer <token>
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Expected: Bearer <token>'
      });
    }

    const token = parts[1];

    // Верифицируем токен
    const decoded = request.server.jwtAuth.verifyToken(token);

    if (!decoded) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Добавляем декодированные данные в request
    request.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role
    };

  } catch (error) {
    request.log.error('Authentication error:', error);
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed'
    });
  }
}

/**
 * Middleware для проверки разрешения (permission)
 * @param {string|string[]} requiredPermissions - Требуемые разрешения
 * @param {boolean} requireAll - Требовать все разрешения (по умолчанию: хотя бы одно)
 */
function requirePermission(requiredPermissions, requireAll = false) {
  const permissions = Array.isArray(requiredPermissions) 
    ? requiredPermissions 
    : [requiredPermissions];

  return async function (request, reply) {
    // Предполагаем, что authenticate уже выполнен
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const { role } = request.user;
    const jwtAuth = request.server.jwtAuth;

    // Проверяем разрешения
    const hasPermission = requireAll
      ? jwtAuth.hasAllPermissions(role, permissions)
      : jwtAuth.hasAnyPermission(role, permissions);

    if (!hasPermission) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: permissions,
        userRole: role
      });
    }
  };
}

/**
 * Middleware для проверки роли
 * @param {string|string[]} allowedRoles - Разрешённые роли
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const { role } = request.user;

    if (!roles.includes(role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Access restricted to roles: ${roles.join(', ')}`,
        userRole: role
      });
    }
  };
}

/**
 * Опциональная аутентификация (не требует токена, но если есть - парсит)
 */
async function optionalAuthenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return; // Продолжаем без аутентификации
    }

    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return; // Игнорируем неправильный формат
    }

    const token = parts[1];
    const decoded = request.server.jwtAuth.verifyToken(token);

    if (decoded) {
      request.user = {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role
      };
    }
  } catch (error) {
    // Игнорируем ошибки при опциональной аутентификации
    request.log.debug('Optional authentication failed:', error);
  }
}

/**
 * Хелпер для получения текущего пользователя из request
 */
function getCurrentUser(request) {
  return request.user || null;
}

/**
 * Хелпер для проверки, аутентифицирован ли пользователь
 */
function isAuthenticated(request) {
  return request.user !== undefined && request.user !== null;
}

/**
 * Хелпер для проверки роли пользователя
 */
function hasRole(request, role) {
  return isAuthenticated(request) && request.user.role === role;
}

/**
 * Хелпер для проверки разрешения
 */
function hasPermission(request, permission) {
  if (!isAuthenticated(request)) {
    return false;
  }

  const jwtAuth = request.server.jwtAuth;
  return jwtAuth.hasPermission(request.user.role, permission);
}

module.exports = {
  jwtAuthPlugin,
  authenticate,
  requirePermission,
  requireRole,
  optionalAuthenticate,
  getCurrentUser,
  isAuthenticated,
  hasRole,
  hasPermission
};
