/**
 * Database Migration Manager v6.0.0
 * 
 * Управление миграциями базы данных
 * 
 * Возможности:
 * - Создание новых миграций
 * - Применение миграций (up)
 * - Откат миграций (down)
 * - Статус миграций
 * - История миграций
 * - Dry-run режим
 * 
 * Структура миграции:
 * - migrations/
 *   - 001_initial_schema.sql
 *   - 002_add_indexes.sql
 *   - 003_add_new_table.sql
 * 
 * @module migrations
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database/db-pool');
const pino = require('pino');

const logger = pino({
  name: 'migrations',
  level: process.env.LOG_LEVEL || 'info'
});

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Migration Manager
 */
class MigrationManager {
  constructor() {
    this.db = getDatabase();
    this.migrationsDir = MIGRATIONS_DIR;

    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    logger.info({ migrationsDir: this.migrationsDir }, 'MigrationManager initialized');
  }

  /**
   * Ensure migrations table exists
   * @private
   */
  async _ensureMigrationsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER,
        checksum VARCHAR(64)
      );

      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version 
      ON ${MIGRATIONS_TABLE}(version);

      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
      ON ${MIGRATIONS_TABLE}(applied_at DESC);
    `;

    await this.db.query(sql);
    logger.debug('Migrations table ensured');
  }

  /**
   * Get list of applied migrations
   * @returns {Promise<Array>}
   */
  async getAppliedMigrations() {
    await this._ensureMigrationsTable();

    const result = await this.db.query(
      `SELECT version, name, applied_at, execution_time_ms
       FROM ${MIGRATIONS_TABLE}
       ORDER BY version ASC`
    );

    return result.rows;
  }

  /**
   * Get list of pending migrations
   * @returns {Promise<Array>}
   */
  async getPendingMigrations() {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    const allMigrations = this._getAllMigrationFiles();

    return allMigrations.filter(m => !appliedVersions.has(m.version));
  }

  /**
   * Get all migration files from directory
   * @private
   * @returns {Array}
   */
  _getAllMigrationFiles() {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    return files.map(file => {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(`Invalid migration filename: ${file}`);
      }

      return {
        version: match[1],
        name: match[2],
        filename: file,
        path: path.join(this.migrationsDir, file)
      };
    });
  }

  /**
   * Create a new migration file
   * @param {string} name - Migration name
   * @returns {string} Created filename
   */
  createMigration(name) {
    const appliedMigrations = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'));

    const lastVersion = appliedMigrations.length > 0
      ? parseInt(appliedMigrations[appliedMigrations.length - 1].split('_')[0])
      : 0;

    const newVersion = String(lastVersion + 1).padStart(3, '0');
    const filename = `${newVersion}_${name}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    const template = `-- Migration: ${name}
-- Version: ${newVersion}
-- Created: ${new Date().toISOString()}

-- UP Migration
-- Write your schema changes here

-- Example:
-- CREATE TABLE example (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP NOT NULL DEFAULT NOW()
-- );

-- DOWN Migration (commented out, for reference)
-- DROP TABLE IF EXISTS example;
`;

    fs.writeFileSync(filepath, template);

    logger.info({ filename, filepath }, 'Migration created');

    return filename;
  }

  /**
   * Apply a single migration
   * @param {Object} migration - Migration object
   * @param {boolean} dryRun - Dry run mode
   * @returns {Promise<Object>}
   */
  async applyMigration(migration, dryRun = false) {
    logger.info({
      version: migration.version,
      name: migration.name,
      dryRun
    }, 'Applying migration');

    const sql = fs.readFileSync(migration.path, 'utf-8');
    const startTime = Date.now();

    if (dryRun) {
      logger.info({ sql: sql.substring(0, 200) }, 'Dry run - SQL preview');
      return {
        version: migration.version,
        name: migration.name,
        dryRun: true,
        sql: sql.substring(0, 500)
      };
    }

    const transaction = await this.db.beginTransaction();

    try {
      // Execute migration SQL
      await transaction.query(sql);

      const duration = Date.now() - startTime;

      // Record migration
      await transaction.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (version, name, execution_time_ms)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.name, duration]
      );

      await transaction.commit();

      logger.info({
        version: migration.version,
        name: migration.name,
        duration
      }, 'Migration applied successfully');

      return {
        version: migration.version,
        name: migration.name,
        duration,
        success: true
      };
    } catch (error) {
      await transaction.rollback();

      logger.error({
        version: migration.version,
        name: migration.name,
        error: error.message
      }, 'Migration failed');

      throw error;
    }
  }

  /**
   * Apply all pending migrations
   * @param {boolean} dryRun - Dry run mode
   * @returns {Promise<Array>}
   */
  async migrate(dryRun = false) {
    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return [];
    }

    logger.info({
      count: pendingMigrations.length,
      dryRun
    }, 'Starting migration');

    const results = [];

    for (const migration of pendingMigrations) {
      const result = await this.applyMigration(migration, dryRun);
      results.push(result);
    }

    logger.info({
      applied: results.length,
      dryRun
    }, 'Migration complete');

    return results;
  }

  /**
   * Rollback last migration
   * @returns {Promise<Object>}
   */
  async rollback() {
    const appliedMigrations = await this.getAppliedMigrations();

    if (appliedMigrations.length === 0) {
      throw new Error('No migrations to rollback');
    }

    const lastMigration = appliedMigrations[appliedMigrations.length - 1];

    logger.warn({
      version: lastMigration.version,
      name: lastMigration.name
    }, 'Rolling back migration');

    // Note: Rollback requires manual intervention
    // because SQL migrations are typically one-way
    throw new Error(
      `Rollback not implemented. Please manually revert migration ${lastMigration.version}_${lastMigration.name}`
    );
  }

  /**
   * Get migration status
   * @returns {Promise<Object>}
   */
  async status() {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    const all = this._getAllMigrationFiles();

    return {
      total: all.length,
      applied: applied.length,
      pending: pending.length,
      appliedMigrations: applied,
      pendingMigrations: pending
    };
  }
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  const manager = new MigrationManager();

  (async () => {
    try {
      switch (command) {
        case 'create':
          if (!arg) {
            console.error('Error: Migration name required');
            console.log('Usage: node migrations.js create <migration-name>');
            process.exit(1);
          }

          const filename = manager.createMigration(arg);
          console.log(`✓ Migration created: ${filename}`);
          console.log(`  Edit: migrations/${filename}`);
          break;

        case 'migrate':
        case 'up':
          console.log('Applying pending migrations...\n');

          const dryRun = process.argv.includes('--dry-run');
          const results = await manager.migrate(dryRun);

          if (results.length === 0) {
            console.log('✓ No pending migrations');
          } else {
            console.log(`✓ Applied ${results.length} migration(s):`);
            results.forEach(r => {
              console.log(`  - ${r.version}: ${r.name} (${r.duration}ms)`);
            });
          }
          break;

        case 'status':
          console.log('Migration Status:\n');

          const status = await manager.status();

          console.log(`Total migrations:   ${status.total}`);
          console.log(`Applied:            ${status.applied}`);
          console.log(`Pending:            ${status.pending}\n`);

          if (status.appliedMigrations.length > 0) {
            console.log('Applied migrations:');
            status.appliedMigrations.forEach(m => {
              console.log(`  ✓ ${m.version}: ${m.name} (${m.applied_at})`);
            });
            console.log();
          }

          if (status.pendingMigrations.length > 0) {
            console.log('Pending migrations:');
            status.pendingMigrations.forEach(m => {
              console.log(`  ○ ${m.version}: ${m.name}`);
            });
          }
          break;

        case 'rollback':
        case 'down':
          console.log('Rolling back last migration...\n');
          await manager.rollback();
          break;

        default:
          console.log(`
Database Migration Manager v6.0.0

Usage:
  node migrations.js create <name>     # Create new migration
  node migrations.js migrate           # Apply pending migrations
  node migrations.js migrate --dry-run # Preview migrations
  node migrations.js status            # Show migration status
  node migrations.js rollback          # Rollback last migration

Examples:
  node migrations.js create add_user_table
  node migrations.js migrate
  node migrations.js status
          `);
      }

      await manager.db.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      await manager.db.close();
      process.exit(1);
    }
  })();
}

module.exports = MigrationManager;
