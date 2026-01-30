/**
 * SCHEMA LOCK SYSTEM
 * 
 * Система предотвращения дрейфа схемы базы данных.
 * Создаёт SHA256 хэш схемы и проверяет его при каждом запуске.
 * 
 * @version 6.0.0
 * @module database/schema-lock
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

if (require.main === module) {
const __dirname = path.dirname(__filename);

/**
 * Конфигурация путей
 */
const PATHS = {
  SCHEMA_FILE: path.join(__dirname, 'schema', 'postgres', '001_init.sql'),
  LOCK_FILE: path.join(__dirname, '..', '..', 'memories', 'schema.lock.json'),
  MEMORIES_DIR: path.join(__dirname, '..', '..', 'memories')
};

/**
 * Создать SHA256 хэш строки
 * 
 * @param {string} content - Содержимое для хэширования
 * @returns {string} SHA256 хэш
 */
function createHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Парсить SQL схему для извлечения таблиц и столбцов
 * 
 * @param {string} sql - SQL код схемы
 * @returns {Object} Объект с таблицами и их столбцами
 */
function parseSchema(sql) {
  const tables = {};
  
  // Регулярное выражение для поиска CREATE TABLE
  const tableRegex = /CREATE TABLE[^(]+\(([^;]+)\);/gi;
  const tableNameRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i;
  
  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const tableMatch = tableNameRegex.exec(match[0]);
    if (!tableMatch) continue;
    
    const tableName = tableMatch[1];
    const columnsSection = match[1];
    
    // Подсчёт столбцов (простая эвристика)
    const columns = columnsSection
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && 
               !trimmed.startsWith('--') && 
               !trimmed.toUpperCase().startsWith('PRIMARY KEY') &&
               !trimmed.toUpperCase().startsWith('FOREIGN KEY') &&
               !trimmed.toUpperCase().startsWith('UNIQUE') &&
               !trimmed.toUpperCase().startsWith('CHECK') &&
               !trimmed.toUpperCase().startsWith('CONSTRAINT');
      })
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return parts[0].replace(/,$/,'');
      })
      .filter(col => col && col !== ',');
    
    tables[tableName] = {
      columnCount: columns.length,
      columns: columns
    };
  }
  
  return tables;
}

/**
 * Прочитать и проанализировать схему
 * 
 * @returns {Promise<{content: string, hash: string, tables: Object}>}
 */
async function readSchema() {
  try {
    const content = await fs.readFile(PATHS.SCHEMA_FILE, 'utf-8');
    const hash = createHash(content);
    const tables = parseSchema(content);
    
    return { content, hash, tables };
  } catch (error) {
    throw new Error(`Failed to read schema file: ${error.message}`);
  }
}

/**
 * Создать lock-файл
 * 
 * @param {string} reason - Причина создания
 * @returns {Promise<Object>} Созданный lock объект
 */
async function createLock(reason = 'Initial schema lock creation') {
  console.log('🔒 Creating schema lock...\n');
  
  // Убедиться что директория memories существует
  try {
    await fs.access(PATHS.MEMORIES_DIR);
  } catch {
    console.log('Creating memories directory...');
    await fs.mkdir(PATHS.MEMORIES_DIR, { recursive: true });
  }
  
  // Прочитать схему
  const { hash, tables } = await readSchema();
  
  // Создать lock объект
  const lock = {
    version: '6.0.0',
    hash,
    tables: {},
    history: [
      {
        timestamp: new Date().toISOString(),
        hash,
        reason,
        tableCount: Object.keys(tables).length
      }
    ],
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  // Добавить информацию о таблицах
  for (const [tableName, info] of Object.entries(tables)) {
    lock.tables[tableName] = {
      columnCount: info.columnCount,
      columns: info.columns
    };
  }
  
  // Записать lock-файл
  await fs.writeFile(
    PATHS.LOCK_FILE,
    JSON.stringify(lock, null, 2),
    'utf-8'
  );
  
  console.log('✅ Schema lock created successfully!\n');
  console.log(`Version: ${lock.version}`);
  console.log(`Hash: ${lock.hash}`);
  console.log(`Tables: ${Object.keys(lock.tables).length}`);
  console.log(`Lock file: ${PATHS.LOCK_FILE}\n`);
  
  return lock;
}

/**
 * Прочитать lock-файл
 * 
 * @returns {Promise<Object | null>} Lock объект или null
 */
async function readLock() {
  try {
    const content = await fs.readFile(PATHS.LOCK_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to read lock file: ${error.message}`);
  }
}

/**
 * Проверить lock
 * 
 * @returns {Promise<{valid: boolean, expectedHash: string, actualHash: string, changes: Array}>}
 */
async function verifyLock() {
  console.log('🔍 Verifying schema lock...\n');
  
  // Прочитать lock
  const lock = await readLock();
  
  if (!lock) {
    console.error('❌ Lock file not found!');
    console.error(`Expected at: ${PATHS.LOCK_FILE}`);
    console.error('\nRun: node src/database/schema-lock.js create\n');
    return {
      valid: false,
      expectedHash: null,
      actualHash: null,
      changes: ['Lock file does not exist']
    };
  }
  
  // Прочитать текущую схему
  const { hash: actualHash, tables: actualTables } = await readSchema();
  const expectedHash = lock.hash;
  
  // Сравнить хэши
  if (actualHash === expectedHash) {
    console.log('✅ Schema lock is valid!\n');
    console.log(`Hash: ${actualHash}`);
    console.log(`Tables: ${Object.keys(lock.tables).length}`);
    console.log(`Last updated: ${lock.lastUpdated}\n`);
    
    return {
      valid: true,
      expectedHash,
      actualHash,
      changes: []
    };
  }
  
  // Хэши не совпадают - определить изменения
  console.error('❌ Schema drift detected!\n');
  console.error(`Expected hash: ${expectedHash}`);
  console.error(`Actual hash:   ${actualHash}\n`);
  
  const changes = [];
  
  // Сравнить таблицы
  const lockTables = new Set(Object.keys(lock.tables));
  const currentTables = new Set(Object.keys(actualTables));
  
  // Новые таблицы
  for (const table of currentTables) {
    if (!lockTables.has(table)) {
      changes.push({
        type: 'table_added',
        table,
        columnCount: actualTables[table].columnCount
      });
    }
  }
  
  // Удалённые таблицы
  for (const table of lockTables) {
    if (!currentTables.has(table)) {
      changes.push({
        type: 'table_removed',
        table,
        columnCount: lock.tables[table].columnCount
      });
    }
  }
  
  // Изменённые таблицы
  for (const table of currentTables) {
    if (lockTables.has(table)) {
      const lockColumns = lock.tables[table].columnCount;
      const actualColumns = actualTables[table].columnCount;
      
      if (lockColumns !== actualColumns) {
        changes.push({
          type: 'table_modified',
          table,
          expectedColumns: lockColumns,
          actualColumns: actualColumns,
          diff: actualColumns - lockColumns
        });
      }
    }
  }
  
  console.error('Changes detected:');
  changes.forEach(change => {
    if (change.type === 'table_added') {
      console.error(`  + Added table: ${change.table} (${change.columnCount} columns)`);
    } else if (change.type === 'table_removed') {
      console.error(`  - Removed table: ${change.table} (was ${change.columnCount} columns)`);
    } else if (change.type === 'table_modified') {
      console.error(`  ~ Modified table: ${change.table} (${change.expectedColumns} → ${change.actualColumns} columns, ${change.diff > 0 ? '+' : ''}${change.diff})`);
    }
  });
  
  console.error('\n⚠️  To update the lock:\n');
  console.error('  node src/database/schema-lock.js update "reason for change"\n');
  
  return {
    valid: false,
    expectedHash,
    actualHash,
    changes
  };
}

/**
 * Обновить lock
 * 
 * @param {string} reason - Причина обновления
 * @returns {Promise<Object>} Обновлённый lock объект
 */
async function updateLock(reason) {
  console.log('🔄 Updating schema lock...\n');
  
  if (!reason || reason.trim().length === 0) {
    throw new Error('Update reason is required');
  }
  
  // Прочитать существующий lock
  const oldLock = await readLock();
  
  if (!oldLock) {
    console.log('Lock file does not exist. Creating new lock...');
    return await createLock(reason);
  }
  
  // Прочитать текущую схему
  const { hash, tables } = await readSchema();
  
  // Создать обновлённый lock
  const newLock = {
    version: '6.0.0',
    hash,
    tables: {},
    history: [
      ...oldLock.history,
      {
        timestamp: new Date().toISOString(),
        hash,
        reason,
        tableCount: Object.keys(tables).length,
        previousHash: oldLock.hash
      }
    ],
    lastUpdated: new Date().toISOString(),
    createdAt: oldLock.createdAt
  };
  
  // Добавить информацию о таблицах
  for (const [tableName, info] of Object.entries(tables)) {
    newLock.tables[tableName] = {
      columnCount: info.columnCount,
      columns: info.columns
    };
  }
  
  // Записать обновлённый lock
  await fs.writeFile(
    PATHS.LOCK_FILE,
    JSON.stringify(newLock, null, 2),
    'utf-8'
  );
  
  console.log('✅ Schema lock updated successfully!\n');
  console.log(`New hash: ${newLock.hash}`);
  console.log(`Previous hash: ${oldLock.hash}`);
  console.log(`Tables: ${Object.keys(newLock.tables).length}`);
  console.log(`Reason: ${reason}`);
  console.log(`History entries: ${newLock.history.length}\n`);
  
  return newLock;
}

/**
 * Получить информацию о lock
 * 
 * @returns {Promise<Object | null>}
 */
async function getLockInfo() {
  const lock = await readLock();
  
  if (!lock) {
    return null;
  }
  
  return {
    version: lock.version,
    hash: lock.hash,
    tableCount: Object.keys(lock.tables).length,
    tables: Object.keys(lock.tables),
    historyCount: lock.history.length,
    lastUpdated: lock.lastUpdated,
    createdAt: lock.createdAt,
    latestChange: lock.history[lock.history.length - 1]
  };
}

/**
 * Получить историю изменений
 * 
 * @returns {Promise<Array>}
 */
async function getHistory() {
  const lock = await readLock();
  return lock ? lock.history : [];
}

// Экспорт
module.exports = {
  createLock,
  verifyLock,
  updateLock,
  readLock,
  getLockInfo,
  getHistory
};

// CLI интерфейс
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  (async () => {
    try {
      switch (command) {
        case 'create':
          await createLock(arg || 'CLI: Manual lock creation');
          break;
          
        case 'verify':
          const verification = await verifyLock();
          process.exit(verification.valid ? 0 : 1);
          break;
          
        case 'update':
          if (!arg) {
            console.error('❌ Error: Update reason required\n');
            console.error('Usage: node schema-lock.js update "reason"\n');
            process.exit(1);
          }
          await updateLock(arg);
          break;
          
        case 'info':
          const info = await getLockInfo();
          if (!info) {
            console.log('No lock file found.\n');
            process.exit(1);
          }
          console.log('📋 Schema Lock Info\n');
          console.log(`Version: ${info.version}`);
          console.log(`Hash: ${info.hash}`);
          console.log(`Tables: ${info.tableCount}`);
          console.log(`History entries: ${info.historyCount}`);
          console.log(`Created: ${info.createdAt}`);
          console.log(`Last updated: ${info.lastUpdated}`);
          console.log(`\nLatest change:`);
          console.log(`  Timestamp: ${info.latestChange.timestamp}`);
          console.log(`  Reason: ${info.latestChange.reason}`);
          console.log(`  Tables: ${info.latestChange.tableCount}\n`);
          break;
          
        case 'history':
          const history = await getHistory();
          if (history.length === 0) {
            console.log('No history found.\n');
            process.exit(1);
          }
          console.log('📜 Schema Change History\n');
          history.forEach((entry, index) => {
            console.log(`${index + 1}. ${entry.timestamp}`);
            console.log(`   Reason: ${entry.reason}`);
            console.log(`   Hash: ${entry.hash}`);
            console.log(`   Tables: ${entry.tableCount}`);
            if (entry.previousHash) {
              console.log(`   Previous hash: ${entry.previousHash}`);
            }
            console.log('');
          });
          break;
          
        default:
          console.log('Schema Lock System v6.0.0\n');
          console.log('Usage:');
          console.log('  node schema-lock.js create ["reason"]        - Create new lock file');
          console.log('  node schema-lock.js verify                   - Verify schema integrity');
          console.log('  node schema-lock.js update "reason"          - Update lock file');
          console.log('  node schema-lock.js info                     - Show lock info');
          console.log('  node schema-lock.js history                  - Show change history\n');
          console.log('Examples:');
          console.log('  node schema-lock.js create');
          console.log('  node schema-lock.js verify');
          console.log('  node schema-lock.js update "Added indexes for performance"');
          console.log('  node schema-lock.js info\n');
          process.exit(command ? 1 : 0);
      }
    } catch (error) {
      console.error('\n💥 Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
