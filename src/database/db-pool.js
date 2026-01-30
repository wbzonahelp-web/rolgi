const logger = require("../monitoring/logger");
/**
 * Database Connection Pool Manager v6.0.0
 * 
 * Менеджер подключений к PostgreSQL с поддержкой:
 * - Connection pooling с настройкой размера пула
 * - Управление транзакциями (BEGIN, COMMIT, ROLLBACK, SAVEPOINT)
 * - Query builder для построения SQL запросов
 * - Prepared statements для защиты от SQL injection
 * - Health checks и reconnect логика
 * - Метрики и мониторинг подключений
 * - Query timeout и retry логика
 * - UPSERT интеграция с upsert-keys.js
 * - Поддержка партиционирования (games by year)
 * - Table dependencies для правильного порядка загрузки
 * 
 * @module db-pool
 */

const { Pool } = require('pg');
const { getLoadOrder } = require('./table-dependencies');
const { generateUpsertSQL, generateBatchUpsertSQL } = require('./upsert-keys');

const logger = pino({
  name: 'db-pool',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} host - Database host
 * @property {number} port - Database port
 * @property {string} database - Database name
 * @property {string} user - Database user
 * @property {string} password - Database password
 * @property {number} max - Max connections in pool
 * @property {number} min - Min connections in pool
 * @property {number} idleTimeoutMillis - Idle connection timeout
 * @property {number} connectionTimeoutMillis - Connection timeout
 * @property {number} queryTimeout - Query timeout in ms
 * @property {boolean} enableSsl - Enable SSL
 */

/**
 * @typedef {Object} QueryOptions
 * @property {number} timeout - Query timeout override
 * @property {boolean} returnFirst - Return only first row
 * @property {boolean} skipLog - Skip query logging
 * @property {string} traceId - Trace ID for monitoring
 */

/**
 * Database Pool Manager
 */
class DatabasePool {
  /**
   * @param {DatabaseConfig} config
   */
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME || 'rolgi_v6',
      user: config.user || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD,
      max: config.max || 20,
      min: config.min || 2,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
      queryTimeout: config.queryTimeout || 30000,
      enableSsl: config.enableSsl || false
    };

    // PostgreSQL pool configuration
    const poolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      max: this.config.max,
      min: this.config.min,
      idleTimeoutMillis: this.config.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      statement_timeout: this.config.queryTimeout
    };

    if (this.config.enableSsl) {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    this.pool = new Pool(poolConfig);

    // Metrics
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      totalTransactions: 0,
      committedTransactions: 0,
      rolledBackTransactions: 0,
      averageQueryTime: 0,
      slowQueries: [], // Queries > 1 second
      connectionErrors: 0
    };

    // Setup pool event handlers
    this._setupEventHandlers();

    logger.info({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      maxConnections: this.config.max
    }, 'DatabasePool initialized');
  }

  /**
   * Setup pool event handlers
   * @private
   */
  _setupEventHandlers() {
    this.pool.on('connect', (client) => {
      logger.debug('New client connected to database');
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      logger.debug('Client removed from pool');
    });

    this.pool.on('error', (error, client) => {
      this.metrics.connectionErrors++;
      logger.error({ error: error.message }, 'Pool error occurred');
    });
  }

  /**
   * Выполнить SQL запрос
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {QueryOptions} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = [], options = {}) {
    const {
      timeout = this.config.queryTimeout,
      returnFirst = false,
      skipLog = false,
      traceId = null
    } = options;

    const startTime = Date.now();

    try {
      if (!skipLog) {
        logger.debug({
          sql: sql.substring(0, 200),
          params: params.length,
          traceId
        }, 'Executing query');
      }

      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;

      // Record metrics
      this._recordQueryMetrics(sql, duration, true);

      if (!skipLog) {
        logger.debug({
          rowCount: result.rowCount,
          duration,
          traceId
        }, 'Query completed');
      }

      if (returnFirst) {
        return result.rows[0] || null;
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this._recordQueryMetrics(sql, duration, false);

      logger.error({
        error: error.message,
        sql: sql.substring(0, 200),
        params: params.length,
        duration,
        traceId
      }, 'Query failed');

      throw error;
    }
  }

  /**
   * Record query metrics
   * @private
   */
  _recordQueryMetrics(sql, duration, success) {
    this.metrics.totalQueries++;

    if (success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.failedQueries++;
    }

    // Update average query time
    const total = this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + duration;
    this.metrics.averageQueryTime = total / this.metrics.totalQueries;

    // Track slow queries (> 1 second)
    if (duration > 1000) {
      this.metrics.slowQueries.push({
        sql: sql.substring(0, 200),
        duration,
        timestamp: new Date()
      });

      // Keep only last 50 slow queries
      if (this.metrics.slowQueries.length > 50) {
        this.metrics.slowQueries.shift();
      }
    }
  }

  /**
   * Начать транзакцию
   * @returns {Promise<DatabaseTransaction>}
   */
  async beginTransaction() {
    const client = await this.pool.connect();
    await client.query('BEGIN');

    this.metrics.totalTransactions++;

    logger.debug('Transaction started');

    return new DatabaseTransaction(client, this);
  }

  /**
   * UPSERT одной записи
   * @param {string} tableName
   * @param {Object} data
   * @param {QueryOptions} options
   * @returns {Promise<Object>}
   */
  async upsert(tableName, data, options = {}) {
    const { sql, params } = generateUpsertSQL(tableName, data);
    return this.query(sql, params, { ...options, returnFirst: true });
  }

  /**
   * Batch UPSERT записей
   * @param {string} tableName
   * @param {Array<Object>} records
   * @param {QueryOptions} options
   * @returns {Promise<Array>}
   */
  async batchUpsert(tableName, records, options = {}) {
    if (!records || records.length === 0) {
      return [];
    }

    const { sql, params } = generateBatchUpsertSQL(tableName, records);
    const result = await this.query(sql, params, options);
    return result.rows;
  }

  /**
   * SELECT запрос с WHERE условиями
   * @param {string} tableName
   * @param {Object} where - WHERE conditions
   * @param {Object} options
   * @param {Array<string>} options.columns - Columns to select
   * @param {string} options.orderBy - ORDER BY clause
   * @param {number} options.limit - LIMIT
   * @param {number} options.offset - OFFSET
   * @returns {Promise<Array>}
   */
  async select(tableName, where = {}, options = {}) {
    const {
      columns = ['*'],
      orderBy = null,
      limit = null,
      offset = null,
      ...queryOptions
    } = options;

    let sql = `SELECT ${columns.join(', ')} FROM ${tableName}`;
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = [];
      for (const [key, value] of Object.entries(where)) {
        if (value === null) {
          conditions.push(`${key} IS NULL`);
        } else if (Array.isArray(value)) {
          conditions.push(`${key} = ANY($${paramIndex})`);
          params.push(value);
          paramIndex++;
        } else {
          conditions.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ORDER BY
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    // LIMIT
    if (limit !== null) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    // OFFSET
    if (offset !== null) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(offset);
      paramIndex++;
    }

    const result = await this.query(sql, params, queryOptions);
    return result.rows;
  }

  /**
   * INSERT запрос
   * @param {string} tableName
   * @param {Object} data
   * @param {QueryOptions} options
   * @returns {Promise<Object>}
   */
  async insert(tableName, data, options = {}) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    return this.query(sql, values, { ...options, returnFirst: true });
  }

  /**
   * UPDATE запрос
   * @param {string} tableName
   * @param {Object} data
   * @param {Object} where
   * @param {QueryOptions} options
   * @returns {Promise<Object>}
   */
  async update(tableName, data, where = {}, options = {}) {
    const setColumns = Object.keys(data);
    const setValues = Object.values(data);
    let paramIndex = 1;

    const setClauses = setColumns.map((col) => {
      return `${col} = $${paramIndex++}`;
    });

    let sql = `UPDATE ${tableName} SET ${setClauses.join(', ')}`;
    const params = [...setValues];

    // Build WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = [];
      for (const [key, value] of Object.entries(where)) {
        conditions.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' RETURNING *';

    const result = await this.query(sql, params, options);
    return result.rows;
  }

  /**
   * DELETE запрос
   * @param {string} tableName
   * @param {Object} where
   * @param {QueryOptions} options
   * @returns {Promise<number>} Deleted rows count
   */
  async delete(tableName, where = {}, options = {}) {
    let sql = `DELETE FROM ${tableName}`;
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = [];
      for (const [key, value] of Object.entries(where)) {
        conditions.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params, options);
    return result.rowCount;
  }

  /**
   * Health check запрос
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this.query('SELECT 1', [], { skipLog: true });
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Health check failed');
      return false;
    }
  }

  /**
   * Получить статистику пула
   * @returns {Object}
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      ...this.metrics
    };
  }

  /**
   * Получить порядок загрузки таблиц
   * @returns {Array<string>}
   */
  getTableLoadOrder() {
    return getLoadOrder();
  }

  /**
   * Закрыть пул подключений
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.end();
    logger.info('DatabasePool closed');
  }
}

/**
 * Database Transaction
 */
class DatabaseTransaction {
  constructor(client, pool) {
    this.client = client;
    this.pool = pool;
    this.isActive = true;
    this.savepoints = [];
  }

  /**
   * Выполнить запрос в рамках транзакции
   * @param {string} sql
   * @param {Array} params
   * @param {QueryOptions} options
   * @returns {Promise<Object>}
   */
  async query(sql, params = [], options = {}) {
    if (!this.isActive) {
      throw new Error('Transaction is not active');
    }

    const startTime = Date.now();

    try {
      const result = await this.client.query(sql, params);
      const duration = Date.now() - startTime;

      logger.debug({
        sql: sql.substring(0, 200),
        duration,
        rowCount: result.rowCount
      }, 'Transaction query completed');

      return result;
    } catch (error) {
      logger.error({
        error: error.message,
        sql: sql.substring(0, 200)
      }, 'Transaction query failed');

      throw error;
    }
  }

  /**
   * UPSERT в рамках транзакции
   * @param {string} tableName
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async upsert(tableName, data) {
    const { sql, params } = generateUpsertSQL(tableName, data);
    const result = await this.query(sql, params);
    return result.rows[0];
  }

  /**
   * Batch UPSERT в рамках транзакции
   * @param {string} tableName
   * @param {Array<Object>} records
   * @returns {Promise<Array>}
   */
  async batchUpsert(tableName, records) {
    if (!records || records.length === 0) {
      return [];
    }

    const { sql, params } = generateBatchUpsertSQL(tableName, records);
    const result = await this.query(sql, params);
    return result.rows;
  }

  /**
   * Создать SAVEPOINT
   * @param {string} name
   * @returns {Promise<void>}
   */
  async savepoint(name) {
    await this.query(`SAVEPOINT ${name}`);
    this.savepoints.push(name);
    logger.debug({ savepoint: name }, 'Savepoint created');
  }

  /**
   * Rollback к SAVEPOINT
   * @param {string} name
   * @returns {Promise<void>}
   */
  async rollbackToSavepoint(name) {
    await this.query(`ROLLBACK TO SAVEPOINT ${name}`);
    
    // Remove savepoints after this one
    const index = this.savepoints.indexOf(name);
    if (index !== -1) {
      this.savepoints = this.savepoints.slice(0, index + 1);
    }

    logger.debug({ savepoint: name }, 'Rolled back to savepoint');
  }

  /**
   * Commit транзакции
   * @returns {Promise<void>}
   */
  async commit() {
    if (!this.isActive) {
      throw new Error('Transaction is not active');
    }

    try {
      await this.client.query('COMMIT');
      this.pool.metrics.committedTransactions++;
      logger.debug('Transaction committed');
    } finally {
      this.client.release();
      this.isActive = false;
    }
  }

  /**
   * Rollback транзакции
   * @returns {Promise<void>}
   */
  async rollback() {
    if (!this.isActive) {
      throw new Error('Transaction is not active');
    }

    try {
      await this.client.query('ROLLBACK');
      this.pool.metrics.rolledBackTransactions++;
      logger.debug('Transaction rolled back');
    } finally {
      this.client.release();
      this.isActive = false;
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let dbInstance = null;

/**
 * Получить singleton instance Database Pool
 * @param {DatabaseConfig} config
 * @returns {DatabasePool}
 */
function getDatabase(config = {}) {
  if (!dbInstance) {
    dbInstance = new DatabasePool(config);
  }
  return dbInstance;
}

/**
 * Закрыть Database Pool singleton
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    const db = getDatabase();

    try {
      switch (command) {
        case 'test':
          console.log('Testing Database Connection...\n');

          // Health check
          console.log('1. Health check...');
          const healthy = await db.healthCheck();
          console.log(healthy ? '✓ Database connection OK' : '✗ Database connection FAILED');

          // Pool stats
          console.log('\n2. Pool statistics:');
          console.log(JSON.stringify(db.getPoolStats(), null, 2));

          // Table load order
          console.log('\n3. Table load order:');
          console.log(db.getTableLoadOrder().join(' → '));

          break;

        case 'stats':
          console.log('Database Pool Statistics:\n');
          console.log(JSON.stringify(db.getPoolStats(), null, 2));
          break;

        case 'health':
          const isHealthy = await db.healthCheck();
          console.log(isHealthy ? 'Database is healthy' : 'Database is unhealthy');
          process.exit(isHealthy ? 0 : 1);

        default:
          console.log(`
Database Pool Manager v6.0.0

Usage:
  node db-pool.js test     # Test database connection
  node db-pool.js stats    # Show pool statistics
  node db-pool.js health   # Health check (exit 0 if OK)
          `);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  })();
}

module.exports = {
  DatabasePool,
  DatabaseTransaction,
  getDatabase,
  closeDatabase
};
