/**
 * Unit Tests for Schema Lock
 * 
 * @jest-environment node
 */

const { SchemaLock } = require('../../src/database/schema-lock');
const fs = require('fs');
const path = require('path');

describe('SchemaLock', () => {
  let schemaLock;
  const testLockPath = path.join(__dirname, '../fixtures/test-schema.lock.json');

  beforeEach(() => {
    schemaLock = new SchemaLock({
      lockFilePath: testLockPath,
      schemaPath: path.join(__dirname, '../../src/database/schema/postgres/001_init.sql')
    });
  });

  afterEach(() => {
    // Clean up test lock file
    if (fs.existsSync(testLockPath)) {
      fs.unlinkSync(testLockPath);
    }
  });

  describe('generateHash', () => {
    it('should generate consistent SHA256 hash', () => {
      const sql = 'CREATE TABLE test (id INT);';
      const hash1 = schemaLock.generateHash(sql);
      const hash2 = schemaLock.generateHash(sql);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should generate different hash for different SQL', () => {
      const sql1 = 'CREATE TABLE test1 (id INT);';
      const sql2 = 'CREATE TABLE test2 (id INT);';

      const hash1 = schemaLock.generateHash(sql1);
      const hash2 = schemaLock.generateHash(sql2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractTables', () => {
    it('should extract table names from SQL', () => {
      const sql = `
        CREATE TABLE users (id INT);
        CREATE TABLE posts (id INT);
        CREATE TABLE IF NOT EXISTS comments (id INT);
      `;

      const tables = schemaLock.extractTables(sql);

      expect(tables).toContain('users');
      expect(tables).toContain('posts');
      expect(tables).toContain('comments');
      expect(tables).toHaveLength(3);
    });

    it('should handle partitioned tables', () => {
      const sql = `
        CREATE TABLE games (id INT) PARTITION BY RANGE (game_date);
        CREATE TABLE games_2024 PARTITION OF games FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
      `;

      const tables = schemaLock.extractTables(sql);

      expect(tables).toContain('games');
      expect(tables).toContain('games_2024');
    });
  });

  describe('create', () => {
    it('should create lock file with correct structure', async () => {
      await schemaLock.create();

      expect(fs.existsSync(testLockPath)).toBe(true);

      const lockData = JSON.parse(fs.readFileSync(testLockPath, 'utf-8'));

      expect(lockData).toHaveProperty('version');
      expect(lockData).toHaveProperty('hash');
      expect(lockData).toHaveProperty('tables');
      expect(lockData).toHaveProperty('createdAt');
      expect(Array.isArray(lockData.tables)).toBe(true);
    });
  });

  describe('verify', () => {
    it('should verify matching schema', async () => {
      await schemaLock.create();

      const result = await schemaLock.verify();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect schema drift', async () => {
      await schemaLock.create();

      // Modify lock file to simulate drift
      const lockData = JSON.parse(fs.readFileSync(testLockPath, 'utf-8'));
      lockData.hash = 'invalid_hash';
      fs.writeFileSync(testLockPath, JSON.stringify(lockData, null, 2));

      const result = await schemaLock.verify();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
