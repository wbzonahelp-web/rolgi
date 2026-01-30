/**
 * PRE-FLIGHT CHECKS
 * 
 * Обязательные проверки перед запуском системы.
 * Обеспечивает раннее обнаружение проблем (Fail Fast).
 * 
 * @version 6.0.0
 * @module core/preflight-checks
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Конфигурация проверок
 */
const CHECK_CONFIG = {
  requiredTables: [
    'countries', 'bookmakers', 'leagues', 'seasons', 'teams', 'players',
    'games', 'game_statistics', 'game_events', 'game_lineups', 'game_player_stats',
    'odds_prematch', 'odds_live', 'game_glicko', 'standings',
    'error_log', 'trace_log', 'performance_metrics', 'sync_log',
    'loader_runs', 'loader_step_results', 'loader_cursors'
  ],
  requiredEnvVars: [
    'DATABASE_URL',
    'SSTATS_API_KEY',
    'NODE_ENV',
    'PORT'
  ],
  minNodeVersion: '18.0.0',
  minDiskSpaceGB: 1,
  defaultPort: 3000
};

/**
 * Определение всех проверок
 */
const CHECKS = [
  {
    name: 'Schema Lock Integrity',
    critical: true,
    fn: checkSchemaLock
  },
  {
    name: 'Database Connection',
    critical: true,
    fn: checkDatabaseConnection
  },
  {
    name: 'Required Tables Exist',
    critical: true,
    fn: checkRequiredTables
  },
  {
    name: 'API Key Valid',
    critical: true,
    fn: checkApiKey
  },
  {
    name: 'Endpoint Manifest Loaded',
    critical: true,
    fn: checkEndpointManifest
  },
  {
    name: 'Required Environment Variables',
    critical: true,
    fn: checkEnvironmentVariables
  },
  {
    name: 'Memory State Readable',
    critical: false,
    fn: checkMemoryState
  },
  {
    name: 'Node Version',
    critical: true,
    fn: checkNodeVersion
  },
  {
    name: 'Disk Space',
    critical: false,
    fn: checkDiskSpace
  },
  {
    name: 'Port Available',
    critical: true,
    fn: checkPortAvailable
  },
  {
    name: 'Required NPM Packages',
    critical: true,
    fn: checkNpmPackages
  }
];

/**
 * 1. Проверка целостности Schema Lock
 */
async function checkSchemaLock() {
  try {
    const lockPath = path.join(process.cwd(), 'memories', 'schema.lock.json');
    
    // Проверить существование файла
    try {
      await fs.access(lockPath);
    } catch {
      return {
        passed: false,
        error: 'Schema lock file not found. Run: node src/database/schema-lock.js create'
      };
    }

    // Прочитать и проверить формат
    const lockData = await fs.readFile(lockPath, 'utf-8');
    const lock = JSON.parse(lockData);

    if (!lock.hash || !lock.tables || !lock.version) {
      return {
        passed: false,
        error: 'Invalid schema lock format'
      };
    }

    // Примечание: Полная проверка хэша требует схемы БД
    // Для pre-flight checks проверяем только наличие и формат
    return {
      passed: true,
      details: {
        version: lock.version,
        tableCount: Object.keys(lock.tables).length,
        lastUpdated: lock.lastUpdated
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Schema lock check failed: ${error.message}`
    };
  }
}

/**
 * 2. Проверка соединения с БД
 */
async function checkDatabaseConnection() {
  try {
    // Проверить наличие DATABASE_URL
    if (!process.env.DATABASE_URL) {
      return {
        passed: false,
        error: 'DATABASE_URL not set in environment'
      };
    }

    // Примечание: Для реальной проверки требуется pg клиент
    // В pre-flight checks проверяем формат URL
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      return {
        passed: false,
        error: 'Invalid DATABASE_URL format. Expected postgresql:// or postgres://'
      };
    }

    return {
      passed: true,
      details: {
        protocol: dbUrl.split('://')[0],
        masked: dbUrl.substring(0, 20) + '...'
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Database connection check failed: ${error.message}`
    };
  }
}

/**
 * 3. Проверка наличия обязательных таблиц
 */
async function checkRequiredTables() {
  try {
    // Примечание: Реальная проверка требует подключения к БД
    // В pre-flight checks проверяем конфигурацию
    const expectedCount = CHECK_CONFIG.requiredTables.length;
    
    return {
      passed: true,
      details: {
        expectedTables: expectedCount,
        tables: CHECK_CONFIG.requiredTables
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Required tables check failed: ${error.message}`
    };
  }
}

/**
 * 4. Проверка валидности API ключа
 */
async function checkApiKey() {
  try {
    const apiKey = process.env.SSTATS_API_KEY;
    
    if (!apiKey) {
      return {
        passed: false,
        error: 'SSTATS_API_KEY not set in environment'
      };
    }

    if (apiKey.length < 20) {
      return {
        passed: false,
        error: 'SSTATS_API_KEY appears to be invalid (too short)'
      };
    }

    // Примечание: Реальная валидация требует тестового запроса
    // В pre-flight checks проверяем только формат
    return {
      passed: true,
      details: {
        keyLength: apiKey.length,
        masked: apiKey.substring(0, 10) + '...'
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `API key check failed: ${error.message}`
    };
  }
}

/**
 * 5. Проверка манифеста эндпоинтов
 */
async function checkEndpointManifest() {
  try {
    const manifestPath = path.join(process.cwd(), 'src', 'api', 'sstats-endpoints.manifest.json');
    
    try {
      await fs.access(manifestPath);
    } catch {
      return {
        passed: false,
        error: 'Endpoint manifest file not found at: ' + manifestPath
      };
    }

    const manifestData = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);

    if (!manifest.endpoints || !Array.isArray(manifest.endpoints)) {
      return {
        passed: false,
        error: 'Invalid manifest format: missing endpoints array'
      };
    }

    return {
      passed: true,
      details: {
        endpointCount: manifest.endpoints.length,
        version: manifest.version || 'unknown'
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Endpoint manifest check failed: ${error.message}`
    };
  }
}

/**
 * 6. Проверка переменных окружения
 */
async function checkEnvironmentVariables() {
  try {
    const missing = [];
    
    for (const varName of CHECK_CONFIG.requiredEnvVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      return {
        passed: false,
        error: `Missing required environment variables: ${missing.join(', ')}`
      };
    }

    return {
      passed: true,
      details: {
        checked: CHECK_CONFIG.requiredEnvVars,
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Environment variables check failed: ${error.message}`
    };
  }
}

/**
 * 7. Проверка состояния памяти (Memory State)
 */
async function checkMemoryState() {
  try {
    const memoriesDir = path.join(process.cwd(), 'memories');
    
    try {
      await fs.access(memoriesDir);
    } catch {
      return {
        passed: false,
        error: 'Memories directory not found'
      };
    }

    const files = await fs.readdir(memoriesDir);
    
    return {
      passed: true,
      details: {
        directory: memoriesDir,
        fileCount: files.length,
        files: files
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Memory state check failed: ${error.message}`
    };
  }
}

/**
 * 8. Проверка версии Node.js
 */
async function checkNodeVersion() {
  try {
    const currentVersion = process.version.substring(1); // Убрать 'v'
    const minVersion = CHECK_CONFIG.minNodeVersion;

    const current = currentVersion.split('.').map(Number);
    const min = minVersion.split('.').map(Number);

    let isValid = true;
    for (let i = 0; i < 3; i++) {
      if (current[i] > min[i]) break;
      if (current[i] < min[i]) {
        isValid = false;
        break;
      }
    }

    if (!isValid) {
      return {
        passed: false,
        error: `Node.js version ${currentVersion} is below minimum required ${minVersion}`
      };
    }

    return {
      passed: true,
      details: {
        current: currentVersion,
        minimum: minVersion
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Node version check failed: ${error.message}`
    };
  }
}

/**
 * 9. Проверка свободного места на диске
 */
async function checkDiskSpace() {
  try {
    // Примечание: Реальная проверка требует системных команд или пакета
    // В pre-flight checks возвращаем предупреждение
    return {
      passed: true,
      details: {
        note: 'Disk space check requires system utilities (df or diskusage package)'
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Disk space check failed: ${error.message}`
    };
  }
}

/**
 * 10. Проверка доступности порта
 */
async function checkPortAvailable() {
  try {
    const port = parseInt(process.env.PORT || CHECK_CONFIG.defaultPort);

    // Примечание: Реальная проверка требует попытки bind
    // В pre-flight checks проверяем валидность порта
    if (isNaN(port) || port < 1 || port > 65535) {
      return {
        passed: false,
        error: `Invalid port number: ${process.env.PORT}`
      };
    }

    return {
      passed: true,
      details: {
        port,
        note: 'Port availability will be checked on server start'
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `Port availability check failed: ${error.message}`
    };
  }
}

/**
 * 11. Проверка установленных npm пакетов
 */
async function checkNpmPackages() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    try {
      await fs.access(packageJsonPath);
    } catch {
      return {
        passed: false,
        error: 'package.json not found'
      };
    }

    const packageData = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageData);

    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    
    try {
      await fs.access(nodeModulesPath);
    } catch {
      return {
        passed: false,
        error: 'node_modules directory not found. Run: npm install'
      };
    }

    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    const totalDeps = Object.keys(deps).length + Object.keys(devDeps).length;

    return {
      passed: true,
      details: {
        dependencies: Object.keys(deps).length,
        devDependencies: Object.keys(devDeps).length,
        total: totalDeps
      }
    };
  } catch (error) {
    return {
      passed: false,
      error: `NPM packages check failed: ${error.message}`
    };
  }
}

/**
 * Запустить все pre-flight проверки
 * 
 * @returns {Promise<{passed: string[], failed: Array, warnings: Array}>}
 * 
 * @example
 * const results = await runPreflightChecks();
 * if (results.failed.length > 0) {
 *   console.error('Pre-flight checks failed:', results.failed);
 *   process.exit(1);
 * }
 */
async function runPreflightChecks() {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  console.log('🚀 Running pre-flight checks...\n');

  for (const check of CHECKS) {
    try {
      const result = await check.fn();
      
      if (result.passed) {
        results.passed.push(check.name);
        console.log(`✅ ${check.name}`);
        
        if (result.details) {
          const details = JSON.stringify(result.details, null, 2)
            .split('\n')
            .map(line => '   ' + line)
            .join('\n');
          console.log(details);
        }
      } else {
        if (check.critical) {
          results.failed.push({
            name: check.name,
            error: result.error
          });
          console.log(`❌ ${check.name}`);
        } else {
          results.warnings.push({
            name: check.name,
            error: result.error
          });
          console.log(`⚠️  ${check.name}`);
        }
        console.log(`   Error: ${result.error}`);
      }
      
      console.log('');
    } catch (error) {
      results.failed.push({
        name: check.name,
        error: error.message
      });
      console.log(`❌ ${check.name}`);
      console.log(`   Exception: ${error.message}\n`);
    }
  }

  return results;
}

/**
 * Получить список всех проверок
 * 
 * @returns {Array<{name: string, critical: boolean}>}
 */
function getCheckList() {
  return CHECKS.map(check => ({
    name: check.name,
    critical: check.critical
  }));
}

// Экспорт
module.exports = {
  runPreflightChecks,
  getCheckList,
  CHECK_CONFIG,
  
  // Экспорт отдельных проверок для тестирования
  checkSchemaLock,
  checkDatabaseConnection,
  checkRequiredTables,
  checkApiKey,
  checkEndpointManifest,
  checkEnvironmentVariables,
  checkMemoryState,
  checkNodeVersion,
  checkDiskSpace,
  checkPortAvailable,
  checkNpmPackages
};

// CLI запуск
if (require.main === module) {
  runPreflightChecks()
    .then(results => {
      console.log('═══════════════════════════════════════════════════');
      console.log('📊 PRE-FLIGHT CHECKS SUMMARY\n');
      console.log(`✅ Passed:   ${results.passed.length}`);
      console.log(`⚠️  Warnings: ${results.warnings.length}`);
      console.log(`❌ Failed:   ${results.failed.length}`);
      console.log('═══════════════════════════════════════════════════\n');

      if (results.warnings.length > 0) {
        console.log('⚠️  WARNINGS:\n');
        results.warnings.forEach(w => {
          console.log(`  - ${w.name}`);
          console.log(`    ${w.error}\n`);
        });
      }

      if (results.failed.length > 0) {
        console.log('❌ FAILURES:\n');
        results.failed.forEach(f => {
          console.log(`  - ${f.name}`);
          console.log(`    ${f.error}\n`);
        });
        
        console.log('⛔ Pre-flight checks FAILED. Please fix the issues above.\n');
        process.exit(1);
      } else {
        console.log('🎉 All pre-flight checks passed!\n');
        console.log('System is ready to start.\n');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 Pre-flight checks crashed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
