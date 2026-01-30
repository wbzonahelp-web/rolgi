/**
 * JWT Authentication & Authorization Module
 * 
 * @module auth/jwt-auth
 * @description
 * Модуль для аутентификации и авторизации пользователей с использованием JWT.
 * 
 * Поддерживаемые роли:
 * - admin: полный доступ ко всем операциям
 * - analyst: чтение данных + запуск loader
 * - viewer: только чтение данных
 * 
 * JWT Payload:
 * {
 *   userId: number,
 *   username: string,
 *   email: string,
 *   role: 'admin' | 'analyst' | 'viewer',
 *   iat: number,
 *   exp: number
 * }
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const logger = require('../monitoring/logger');

// JWT секретный ключ (должен быть в .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Соль для bcrypt
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

/**
 * Роли и права доступа
 */
const ROLES = {
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer'
};

const PERMISSIONS = {
  [ROLES.ADMIN]: [
    'users:read',
    'users:write',
    'users:delete',
    'games:read',
    'games:write',
    'teams:read',
    'teams:write',
    'players:read',
    'players:write',
    'odds:read',
    'odds:write',
    'standings:read',
    'standings:write',
    'loader:read',
    'loader:write',
    'loader:start',
    'loader:stop',
    'monitoring:read',
    'monitoring:write',
    'config:read',
    'config:write'
  ],
  [ROLES.ANALYST]: [
    'games:read',
    'teams:read',
    'players:read',
    'odds:read',
    'standings:read',
    'loader:read',
    'loader:start',
    'monitoring:read'
  ],
  [ROLES.VIEWER]: [
    'games:read',
    'teams:read',
    'players:read',
    'odds:read',
    'standings:read'
  ]
};

class JWTAuth {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.tokenBlacklist = new Set(); // В production использовать Redis
  }

  /**
   * Хеширование пароля
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Проверка пароля
   */
  async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Генерация Access Token
   */
  generateAccessToken(user) {
    const payload = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'rolgi-api',
      audience: 'rolgi-users'
    });
  }

  /**
   * Генерация Refresh Token
   */
  generateRefreshToken(user) {
    const payload = {
      userId: user.user_id,
      type: 'refresh'
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'rolgi-api',
      audience: 'rolgi-users'
    });
  }

  /**
   * Верификация токена
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'rolgi-api',
        audience: 'rolgi-users'
      });

      // Проверяем blacklist
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      return decoded;
    } catch (error) {
      logger.warn('Token verification failed', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Отзыв токена (добавление в blacklist)
   */
  revokeToken(token) {
    this.tokenBlacklist.add(token);
    
    // Автоматическая очистка через TTL
    setTimeout(() => {
      this.tokenBlacklist.delete(token);
    }, 24 * 60 * 60 * 1000); // 24 часа

    logger.info('Token revoked');
  }

  /**
   * Регистрация пользователя
   */
  async register({ username, email, password, role = ROLES.VIEWER }) {
    const client = await this.dbPool.connect();

    try {
      // Проверяем, существует ли пользователь
      const existingUser = await client.query(
        'SELECT user_id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User already exists');
      }

      // Хешируем пароль
      const passwordHash = await this.hashPassword(password);

      // Создаём пользователя
      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING user_id, username, email, role, is_active, created_at`,
        [username, email, passwordHash, role]
      );

      const user = result.rows[0];

      logger.info('User registered', {
        userId: user.user_id,
        username: user.username,
        role: user.role
      });

      return {
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Вход пользователя (логин)
   */
  async login({ username, password }) {
    const client = await this.dbPool.connect();

    try {
      // Получаем пользователя
      const result = await client.query(
        `SELECT user_id, username, email, password_hash, role, is_active, last_login_at
         FROM users
         WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = result.rows[0];

      // Проверяем активность
      if (!user.is_active) {
        throw new Error('User account is disabled');
      }

      // Проверяем пароль
      const isPasswordValid = await this.comparePassword(password, user.password_hash);
      
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Обновляем last_login_at
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE user_id = $1',
        [user.user_id]
      );

      // Генерируем токены
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      logger.info('User logged in', {
        userId: user.user_id,
        username: user.username,
        role: user.role
      });

      return {
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN
      };
    } finally {
      client.release();
    }
  }

  /**
   * Обновление Access Token через Refresh Token
   */
  async refreshAccessToken(refreshToken) {
    const decoded = this.verifyToken(refreshToken);

    if (!decoded || decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const client = await this.dbPool.connect();

    try {
      const result = await client.query(
        `SELECT user_id, username, email, role, is_active
         FROM users
         WHERE user_id = $1`,
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new Error('User account is disabled');
      }

      // Генерируем новый Access Token
      const accessToken = this.generateAccessToken(user);

      logger.info('Access token refreshed', {
        userId: user.user_id
      });

      return {
        accessToken,
        expiresIn: JWT_EXPIRES_IN
      };
    } finally {
      client.release();
    }
  }

  /**
   * Выход (логаут) - отзыв токена
   */
  logout(accessToken) {
    this.revokeToken(accessToken);
    
    logger.info('User logged out');

    return { message: 'Logged out successfully' };
  }

  /**
   * Получение информации о текущем пользователе
   */
  async getCurrentUser(userId) {
    const client = await this.dbPool.connect();

    try {
      const result = await client.query(
        `SELECT user_id, username, email, role, is_active, created_at, last_login_at
         FROM users
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      return {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        permissions: PERMISSIONS[user.role] || []
      };
    } finally {
      client.release();
    }
  }

  /**
   * Проверка разрешения (permission)
   */
  hasPermission(role, permission) {
    const rolePermissions = PERMISSIONS[role] || [];
    return rolePermissions.includes(permission);
  }

  /**
   * Проверка наличия хотя бы одного из разрешений
   */
  hasAnyPermission(role, permissions) {
    return permissions.some(permission => this.hasPermission(role, permission));
  }

  /**
   * Проверка всех разрешений
   */
  hasAllPermissions(role, permissions) {
    return permissions.every(permission => this.hasPermission(role, permission));
  }

  /**
   * Изменение роли пользователя (только admin)
   */
  async updateUserRole(userId, newRole) {
    if (!Object.values(ROLES).includes(newRole)) {
      throw new Error('Invalid role');
    }

    const client = await this.dbPool.connect();

    try {
      await client.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2',
        [newRole, userId]
      );

      logger.info('User role updated', {
        userId,
        newRole
      });

      return { message: 'Role updated successfully' };
    } finally {
      client.release();
    }
  }

  /**
   * Деактивация пользователя (только admin)
   */
  async deactivateUser(userId) {
    const client = await this.dbPool.connect();

    try {
      await client.query(
        'UPDATE users SET is_active = false, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );

      logger.info('User deactivated', { userId });

      return { message: 'User deactivated successfully' };
    } finally {
      client.release();
    }
  }

  /**
   * Активация пользователя (только admin)
   */
  async activateUser(userId) {
    const client = await this.dbPool.connect();

    try {
      await client.query(
        'UPDATE users SET is_active = true, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );

      logger.info('User activated', { userId });

      return { message: 'User activated successfully' };
    } finally {
      client.release();
    }
  }

  /**
   * Изменение пароля
   */
  async changePassword(userId, oldPassword, newPassword) {
    const client = await this.dbPool.connect();

    try {
      // Получаем текущий пароль
      const result = await client.query(
        'SELECT password_hash FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentHash = result.rows[0].password_hash;

      // Проверяем старый пароль
      const isValid = await this.comparePassword(oldPassword, currentHash);
      
      if (!isValid) {
        throw new Error('Invalid current password');
      }

      // Хешируем новый пароль
      const newHash = await this.hashPassword(newPassword);

      // Обновляем пароль
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
        [newHash, userId]
      );

      logger.info('Password changed', { userId });

      return { message: 'Password changed successfully' };
    } finally {
      client.release();
    }
  }

  /**
   * Получение списка всех пользователей (только admin)
   */
  async getAllUsers({ limit = 50, offset = 0, role = null, isActive = null } = {}) {
    const client = await this.dbPool.connect();

    try {
      let query = `
        SELECT user_id, username, email, role, is_active, created_at, last_login_at
        FROM users
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (role) {
        query += ` AND role = $${paramIndex}`;
        params.push(role);
        paramIndex++;
      }

      if (isActive !== null) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(isActive);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await client.query(query, params);

      // Получаем общее количество
      const countResult = await client.query('SELECT COUNT(*) FROM users');
      const total = parseInt(countResult.rows[0].count);

      return {
        users: result.rows.map(user => ({
          userId: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        })),
        total,
        limit,
        offset
      };
    } finally {
      client.release();
    }
  }
}

// Экспорт констант и класса
module.exports = {
  JWTAuth,
  ROLES,
  PERMISSIONS,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
