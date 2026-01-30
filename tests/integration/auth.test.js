/**
 * JWT Authentication Integration Tests
 * 
 * @group integration
 */

const { JWTAuth, ROLES } = require('../../src/auth/jwt-auth');
const { getDatabase } = require('../../src/database/db-pool');

describe('JWT Authentication', () => {
  let jwtAuth;
  let db;
  let testUserId;

  beforeAll(async () => {
    db = getDatabase();
    jwtAuth = new JWTAuth(db);

    // Создаём таблицу users для тестов
    const client = await db.connect();
    try {
      await client.query(`
        DROP TABLE IF EXISTS users;
        CREATE TABLE users (
          user_id SERIAL PRIMARY KEY,
          username VARCHAR(50) NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'viewer',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP WITH TIME ZONE
        );
      `);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // Очищаем тестовые данные
    const client = await db.connect();
    try {
      await client.query('DROP TABLE IF EXISTS users');
    } finally {
      client.release();
    }
  });

  describe('User Registration', () => {
    test('should register a new user', async () => {
      const result = await jwtAuth.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: ROLES.VIEWER
      });

      expect(result.user).toBeDefined();
      expect(result.user.userId).toBeGreaterThan(0);
      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(ROLES.VIEWER);
      expect(result.user.isActive).toBe(true);

      testUserId = result.user.userId;
    });

    test('should not register user with duplicate username', async () => {
      await expect(
        jwtAuth.register({
          username: 'testuser',
          email: 'another@example.com',
          password: 'password123'
        })
      ).rejects.toThrow('User already exists');
    });

    test('should not register user with duplicate email', async () => {
      await expect(
        jwtAuth.register({
          username: 'anotheruser',
          email: 'test@example.com',
          password: 'password123'
        })
      ).rejects.toThrow('User already exists');
    });

    test('should hash password correctly', async () => {
      const password = 'mypassword';
      const hash = await jwtAuth.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
      expect(hash).toMatch(/^\$2[ayb]\$.{56}$/);
    });

    test('should verify password correctly', async () => {
      const password = 'mypassword';
      const hash = await jwtAuth.hashPassword(password);

      const isValid = await jwtAuth.comparePassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await jwtAuth.comparePassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('User Login', () => {
    test('should login with correct credentials', async () => {
      const result = await jwtAuth.login({
        username: 'testuser',
        password: 'password123'
      });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('testuser');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBeDefined();
    });

    test('should not login with wrong username', async () => {
      await expect(
        jwtAuth.login({
          username: 'wronguser',
          password: 'password123'
        })
      ).rejects.toThrow('Invalid credentials');
    });

    test('should not login with wrong password', async () => {
      await expect(
        jwtAuth.login({
          username: 'testuser',
          password: 'wrongpassword'
        })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Token Operations', () => {
    let accessToken;
    let refreshToken;

    beforeAll(async () => {
      const result = await jwtAuth.login({
        username: 'testuser',
        password: 'password123'
      });
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
    });

    test('should verify valid access token', () => {
      const decoded = jwtAuth.verifyToken(accessToken);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe(ROLES.VIEWER);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    test('should not verify invalid token', () => {
      const decoded = jwtAuth.verifyToken('invalid.token.here');
      expect(decoded).toBeNull();
    });

    test('should refresh access token', async () => {
      const result = await jwtAuth.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.accessToken).not.toBe(accessToken);
      expect(result.expiresIn).toBeDefined();
    });

    test('should not refresh with invalid token', async () => {
      await expect(
        jwtAuth.refreshAccessToken('invalid.token')
      ).rejects.toThrow();
    });

    test('should revoke token', () => {
      jwtAuth.revokeToken(accessToken);

      const decoded = jwtAuth.verifyToken(accessToken);
      expect(decoded).toBeNull();
    });

    test('should logout successfully', () => {
      const result = jwtAuth.logout(accessToken);
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('User Management', () => {
    test('should get current user', async () => {
      const user = await jwtAuth.getCurrentUser(testUserId);

      expect(user.userId).toBe(testUserId);
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe(ROLES.VIEWER);
      expect(user.permissions).toBeDefined();
      expect(Array.isArray(user.permissions)).toBe(true);
    });

    test('should update user role', async () => {
      await jwtAuth.updateUserRole(testUserId, ROLES.ANALYST);

      const user = await jwtAuth.getCurrentUser(testUserId);
      expect(user.role).toBe(ROLES.ANALYST);

      // Возвращаем обратно
      await jwtAuth.updateUserRole(testUserId, ROLES.VIEWER);
    });

    test('should deactivate user', async () => {
      await jwtAuth.deactivateUser(testUserId);

      const user = await jwtAuth.getCurrentUser(testUserId);
      expect(user.isActive).toBe(false);

      // Активируем обратно
      await jwtAuth.activateUser(testUserId);
    });

    test('should activate user', async () => {
      await jwtAuth.activateUser(testUserId);

      const user = await jwtAuth.getCurrentUser(testUserId);
      expect(user.isActive).toBe(true);
    });

    test('should change password', async () => {
      await jwtAuth.changePassword(testUserId, 'password123', 'newpassword123');

      // Проверяем новый пароль
      const result = await jwtAuth.login({
        username: 'testuser',
        password: 'newpassword123'
      });
      expect(result.user.username).toBe('testuser');

      // Возвращаем старый пароль
      await jwtAuth.changePassword(testUserId, 'newpassword123', 'password123');
    });

    test('should not change password with wrong old password', async () => {
      await expect(
        jwtAuth.changePassword(testUserId, 'wrongpassword', 'newpassword123')
      ).rejects.toThrow('Invalid current password');
    });

    test('should get all users', async () => {
      const result = await jwtAuth.getAllUsers({ limit: 10, offset: 0 });

      expect(result.users).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.users.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });
  });

  describe('Permissions', () => {
    test('admin should have all permissions', () => {
      expect(jwtAuth.hasPermission(ROLES.ADMIN, 'users:read')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ADMIN, 'users:write')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ADMIN, 'games:write')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ADMIN, 'loader:start')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ADMIN, 'config:write')).toBe(true);
    });

    test('analyst should have read and loader permissions', () => {
      expect(jwtAuth.hasPermission(ROLES.ANALYST, 'games:read')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ANALYST, 'loader:start')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.ANALYST, 'monitoring:read')).toBe(true);
      
      expect(jwtAuth.hasPermission(ROLES.ANALYST, 'users:write')).toBe(false);
      expect(jwtAuth.hasPermission(ROLES.ANALYST, 'games:write')).toBe(false);
    });

    test('viewer should have only read permissions', () => {
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'games:read')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'teams:read')).toBe(true);
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'odds:read')).toBe(true);
      
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'loader:start')).toBe(false);
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'games:write')).toBe(false);
      expect(jwtAuth.hasPermission(ROLES.VIEWER, 'users:write')).toBe(false);
    });

    test('should check any permission correctly', () => {
      expect(
        jwtAuth.hasAnyPermission(ROLES.ANALYST, ['games:read', 'users:write'])
      ).toBe(true);

      expect(
        jwtAuth.hasAnyPermission(ROLES.VIEWER, ['games:write', 'users:write'])
      ).toBe(false);
    });

    test('should check all permissions correctly', () => {
      expect(
        jwtAuth.hasAllPermissions(ROLES.ADMIN, ['games:read', 'games:write'])
      ).toBe(true);

      expect(
        jwtAuth.hasAllPermissions(ROLES.ANALYST, ['games:read', 'games:write'])
      ).toBe(false);
    });
  });
});
