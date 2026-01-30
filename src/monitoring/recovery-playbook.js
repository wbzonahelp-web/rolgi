/**
 * ERROR RECOVERY PLAYBOOK
 * 
 * Автоматические стратегии восстановления от типичных ошибок.
 * Содержит описание проблем, severity, шаги восстановления и примеры кода.
 * 
 * @version 6.0.0
 * @module monitoring/recovery-playbook
 */

/**
 * Справочник стратегий восстановления
 * 
 * Структура каждой записи:
 * - severity: CRITICAL | ERROR | WARNING | INFO
 * - description: Описание проблемы
 * - steps: Массив шагов для восстановления
 * - exampleCode: Пример кода для реализации восстановления
 * - preventionTips: Советы по предотвращению (опционально)
 */
const RECOVERY_PLAYBOOK = {
  /**
   * Нарушение ограничения БД (FK, UNIQUE, CHECK)
   */
  'DB_CONSTRAINT_VIOLATION': {
    severity: 'ERROR',
    description: 'Database constraint violation (FK, UNIQUE, CHECK)',
    steps: [
      'Log the violation details with full context',
      'If FK violation: ensure dependency tables are loaded first',
      'If UNIQUE violation: check if record already exists, use UPSERT',
      'Skip the problematic record and continue processing',
      'Collect stats on violations for analysis'
    ],
    exampleCode: `
try {
  await db.insert('games', gameData);
} catch (error) {
  if (error.code === '23503') { // FK violation
    errorCollector.collect({
      category: 'DATABASE',
      severity: 'ERROR',
      message: 'FK constraint violation',
      context: { table: 'games', data: gameData, error: error.message }
    });
    
    // Проверить, загружены ли зависимости
    const deps = ['leagues', 'teams'];
    for (const dep of deps) {
      if (!loadedTables.has(dep)) {
        await loadTableData(dep);
        loadedTables.add(dep);
      }
    }
    
    // Повторить попытку
    await db.insert('games', gameData);
  } else if (error.code === '23505') { // UNIQUE violation
    // Использовать UPSERT вместо INSERT
    await db.upsert('games', gameData);
  }
}
    `,
    preventionTips: [
      'Use table dependency graph to ensure correct load order',
      'Always use UPSERT for idempotency',
      'Validate foreign keys before insertion'
    ]
  },

  /**
   * Ошибка аутентификации API (401)
   */
  'API_401_UNAUTHORIZED': {
    severity: 'CRITICAL',
    description: 'API authentication failed - invalid or expired token',
    steps: [
      'Check if API key is present in environment',
      'Verify API key format and validity',
      'If using OAuth: attempt to refresh token',
      'If token expired: alert admin immediately',
      'Halt all API requests until resolved',
      'Log incident with timestamp for audit'
    ],
    exampleCode: `
try {
  const response = await apiClient.get('/Games/list');
} catch (error) {
  if (error.statusCode === 401) {
    errorCollector.collect({
      category: 'API',
      severity: 'CRITICAL',
      message: 'API authentication failed',
      context: { endpoint: '/Games/list', apiKey: apiKey.substring(0, 10) + '...' }
    });
    
    // Проверить наличие ключа
    if (!process.env.SSTATS_API_KEY) {
      throw new Error('SSTATS_API_KEY not found in environment');
    }
    
    // Попытка обновить токен (если OAuth)
    if (isOAuthToken) {
      const newToken = await refreshOAuthToken();
      apiClient.setToken(newToken);
      
      // Повторить запрос
      return await apiClient.get('/Games/list');
    }
    
    // Алерт администратору
    await alertAdmin('API_AUTH_FAILED', {
      message: 'SStats API authentication failed',
      timestamp: new Date().toISOString()
    });
    
    // Остановить загрузчик
    throw new Error('HALT: API authentication failed');
  }
}
    `,
    preventionTips: [
      'Monitor API key expiration dates',
      'Implement token refresh logic for OAuth',
      'Test API key validity in pre-flight checks',
      'Store backup API keys if available'
    ]
  },

  /**
   * Превышение лимита запросов (429)
   */
  'API_429_RATE_LIMIT': {
    severity: 'WARNING',
    description: 'API rate limit exceeded - too many requests',
    steps: [
      'Log rate limit hit with timestamp',
      'Parse Retry-After header if present',
      'Wait with exponential backoff: 1min → 2min → 4min',
      'Save cursor position before waiting',
      'Resume from cursor after wait period',
      'Adjust request rate to stay under limit'
    ],
    exampleCode: `
async function loadWithRateLimit(endpoint, params, attempt = 1) {
  try {
    return await apiClient.get(endpoint, params);
  } catch (error) {
    if (error.statusCode === 429) {
      const waitTime = Math.pow(2, attempt - 1) * 60 * 1000; // 1min, 2min, 4min
      const retryAfter = error.headers['retry-after'];
      const actualWait = retryAfter ? parseInt(retryAfter) * 1000 : waitTime;
      
      errorCollector.collect({
        category: 'API',
        severity: 'WARNING',
        message: 'Rate limit exceeded',
        context: { 
          endpoint,
          attempt,
          waitTimeMs: actualWait,
          retryAfter
        }
      });
      
      console.log(\`⏳ Rate limit hit. Waiting \${actualWait / 1000}s before retry...\`);
      
      await new Promise(resolve => setTimeout(resolve, actualWait));
      
      // Повторить с увеличенной попыткой
      if (attempt < 3) {
        return await loadWithRateLimit(endpoint, params, attempt + 1);
      } else {
        throw new Error('Max retries exceeded for rate limit');
      }
    }
    throw error;
  }
}
    `,
    preventionTips: [
      'Implement request queuing with rate limiter',
      'Monitor request rate in real-time',
      'Use cursor-based pagination to reduce total requests',
      'Cache responses aggressively to minimize API calls'
    ]
  },

  /**
   * Ресурс не найден (404)
   */
  'API_404_NOT_FOUND': {
    severity: 'INFO',
    description: 'Resource not found - may have been deleted or moved',
    steps: [
      'Log the missing resource ID',
      'Mark resource as deleted/unavailable in database',
      'Continue processing with next item',
      'Maintain audit trail of deleted resources',
      'Do not treat as critical error'
    ],
    exampleCode: `
try {
  const gameDetails = await apiClient.get(\`/Games/\${gameId}\`);
  await db.upsert('games', transformGame(gameDetails));
} catch (error) {
  if (error.statusCode === 404) {
    errorCollector.collect({
      category: 'API',
      severity: 'INFO',
      message: 'Game not found',
      context: { gameId, endpoint: \`/Games/\${gameId}\` }
    });
    
    // Пометить как удалённый
    await db.update('games', 
      { id: gameId },
      { 
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        is_available: false
      }
    );
    
    // Продолжить со следующим
    return null;
  }
  throw error;
}
    `,
    preventionTips: [
      'Implement soft delete in database',
      'Periodically clean up deleted resources',
      'Check resource existence before requesting details'
    ]
  },

  /**
   * Ошибка сервера (500)
   */
  'API_500_SERVER_ERROR': {
    severity: 'ERROR',
    description: 'External API server error - temporary issue',
    steps: [
      'Log error with full response details',
      'Retry up to 3 times with exponential backoff',
      'If still failing after retries: alert admin',
      'Save cursor to resume later',
      'Continue with next batch of data',
      'Monitor error frequency for patterns'
    ],
    exampleCode: `
async function requestWithRetry(endpoint, params, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiClient.get(endpoint, params);
    } catch (error) {
      lastError = error;
      
      if (error.statusCode === 500) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        
        errorCollector.collect({
          category: 'API',
          severity: 'ERROR',
          message: 'API server error',
          context: { 
            endpoint,
            attempt,
            maxRetries,
            statusCode: error.statusCode,
            responseBody: error.body
          }
        });
        
        if (attempt < maxRetries) {
          console.log(\`⚠️  Server error. Retrying in \${waitTime/1000}s... (attempt \${attempt}/\${maxRetries})\`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } else {
        throw error; // Не 500, пробросить дальше
      }
    }
  }
  
  // Все попытки исчерпаны
  await alertAdmin('API_SERVER_ERROR', {
    endpoint,
    error: lastError.message,
    timestamp: new Date().toISOString()
  });
  
  throw lastError;
}
    `,
    preventionTips: [
      'Monitor external API uptime and status',
      'Implement circuit breaker pattern',
      'Use health checks before critical operations',
      'Have fallback data sources if possible'
    ]
  },

  /**
   * Ошибка шага загрузчика
   */
  'LOADER_STEP_FAILED': {
    severity: 'ERROR',
    description: 'Data loader step failed during execution',
    steps: [
      'Save cursor position immediately',
      'Mark step as "failed" in loader_step_results',
      'Log error with full context (step, cursor, error)',
      'Do not proceed to next step',
      'Resume from cursor on next loader run',
      'Notify admin if multiple consecutive failures'
    ],
    exampleCode: `
async function executeLoaderStep(step, cursor) {
  const stepId = await loaderState.getOrCreateStep(runId, step.name);
  
  try {
    // Выполнение шага
    const result = await step.execute(cursor);
    
    // Обновить курсор
    await loaderState.updateCursor(stepId, result.nextCursor);
    
    // Отметить как завершённый
    await loaderState.markStepComplete(stepId, {
      recordsProcessed: result.count,
      duration: result.duration
    });
    
    return result;
  } catch (error) {
    // Сохранить курсор перед падением
    await loaderState.updateCursor(stepId, cursor);
    
    // Отметить как проваленный
    await db.update('loader_step_results',
      { id: stepId },
      { 
        status: 'failed',
        error_message: error.message,
        error_stack: error.stack,
        failed_at: new Date().toISOString()
      }
    );
    
    errorCollector.collect({
      category: 'LOADER',
      severity: 'ERROR',
      message: \`Loader step "\${step.name}" failed\`,
      context: { 
        step: step.name,
        cursor,
        error: error.message,
        stack: error.stack
      }
    });
    
    // Проверить историю ошибок
    const recentFailures = await getRecentFailures(step.name, '24h');
    if (recentFailures.length >= 3) {
      await alertAdmin('LOADER_REPEATED_FAILURES', {
        step: step.name,
        failureCount: recentFailures.length,
        timestamp: new Date().toISOString()
      });
    }
    
    throw error; // Остановить выполнение
  }
}
    `,
    preventionTips: [
      'Implement robust error handling in each step',
      'Use transactions for atomic operations',
      'Validate data before processing',
      'Monitor step execution times for anomalies'
    ]
  },

  /**
   * Обнаружен дрейф схемы
   */
  'SCHEMA_DRIFT_DETECTED': {
    severity: 'CRITICAL',
    description: 'Database schema changed unexpectedly - hash mismatch',
    steps: [
      'HALT all operations immediately',
      'Log schema hash mismatch details',
      'Alert admin with critical priority',
      'Do not attempt automatic recovery',
      'Require manual schema lock update',
      'Verify changes were intentional before proceeding'
    ],
    exampleCode: `
const schemaLock = require('./database/schema-lock');

async function verifySchema() {
  const verification = await schemaLock.verifyLock();
  
  if (!verification.valid) {
    errorCollector.collect({
      category: 'SYSTEM',
      severity: 'CRITICAL',
      message: 'Schema drift detected',
      context: {
        expectedHash: verification.expectedHash,
        actualHash: verification.actualHash,
        changedTables: verification.changes
      }
    });
    
    // Немедленный алерт
    await alertAdmin('SCHEMA_DRIFT', {
      message: 'Database schema has changed unexpectedly',
      expectedHash: verification.expectedHash,
      actualHash: verification.actualHash,
      changes: verification.changes,
      timestamp: new Date().toISOString()
    });
    
    console.error('❌ CRITICAL: Schema drift detected!');
    console.error('Expected hash:', verification.expectedHash);
    console.error('Actual hash:', verification.actualHash);
    console.error('Changes:', verification.changes);
    console.error('');
    console.error('⚠️  All operations halted. Manual intervention required.');
    console.error('To update schema lock: node src/database/schema-lock.js update');
    
    process.exit(1); // Принудительная остановка
  }
}
    `,
    preventionTips: [
      'Always update schema lock after migrations',
      'Use migration tools (knex, flyway) for schema changes',
      'Run schema verification in pre-flight checks',
      'Document all schema changes in CHANGELOG'
    ]
  },

  /**
   * Таймаут запроса
   */
  'REQUEST_TIMEOUT': {
    severity: 'WARNING',
    description: 'Request took too long to complete',
    steps: [
      'Log timeout details (endpoint, duration)',
      'Check network connectivity',
      'Retry with longer timeout if appropriate',
      'If repeated timeouts: check API status',
      'Consider reducing batch size',
      'Monitor API response times'
    ],
    exampleCode: `
async function requestWithTimeout(endpoint, params, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(endpoint, {
      ...params,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      errorCollector.collect({
        category: 'API',
        severity: 'WARNING',
        message: 'Request timeout',
        context: { endpoint, timeoutMs }
      });
      
      // Повторить с увеличенным таймаутом
      return await requestWithTimeout(endpoint, params, timeoutMs * 2);
    }
    
    throw error;
  }
}
    `,
    preventionTips: [
      'Set appropriate timeouts for different endpoints',
      'Monitor API response times',
      'Use pagination to reduce response sizes',
      'Implement request queuing'
    ]
  },

  /**
   * Неизвестная ошибка (fallback)
   */
  'UNKNOWN_ERROR': {
    severity: 'ERROR',
    description: 'Unhandled error occurred',
    steps: [
      'Log full error details (message, stack, context)',
      'Capture system state for debugging',
      'Alert admin if error is critical',
      'Attempt graceful degradation',
      'Save progress before exiting',
      'Provide detailed error report for investigation'
    ],
    exampleCode: `
try {
  await executeOperation();
} catch (error) {
  errorCollector.collect({
    category: 'SYSTEM',
    severity: 'ERROR',
    message: error.message || 'Unknown error',
    context: {
      stack: error.stack,
      name: error.name,
      code: error.code,
      systemState: await captureSystemState()
    }
  });
  
  // Экспорт для AI анализа
  const aiReport = await errorCollector.exportForAI();
  await saveFile('./exports/error-report.json', aiReport);
  
  throw error;
}
    `
  }
};

/**
 * Получить стратегию восстановления для типа ошибки
 * 
 * @param {string} errorType - Тип ошибки (например, 'API_429_RATE_LIMIT')
 * @returns {Object} Стратегия восстановления
 * 
 * @example
 * const strategy = getRecoveryStrategy('API_429_RATE_LIMIT');
 * console.log(strategy.severity); // 'WARNING'
 * console.log(strategy.steps);     // ['Log rate limit hit...', ...]
 */
function getRecoveryStrategy(errorType) {
  return RECOVERY_PLAYBOOK[errorType] || RECOVERY_PLAYBOOK['UNKNOWN_ERROR'];
}

/**
 * Получить все стратегии по уровню severity
 * 
 * @param {string} severity - CRITICAL | ERROR | WARNING | INFO
 * @returns {Object} Объект с типами ошибок и стратегиями
 * 
 * @example
 * const criticalStrategies = getStrategiesBySeverity('CRITICAL');
 */
function getStrategiesBySeverity(severity) {
  const filtered = {};
  
  for (const [errorType, strategy] of Object.entries(RECOVERY_PLAYBOOK)) {
    if (strategy.severity === severity) {
      filtered[errorType] = strategy;
    }
  }
  
  return filtered;
}

/**
 * Получить список всех типов ошибок
 * 
 * @returns {string[]} Массив типов ошибок
 */
function getErrorTypes() {
  return Object.keys(RECOVERY_PLAYBOOK);
}

/**
 * Получить статистику по playbook
 * 
 * @returns {Object} Статистика
 */
function getPlaybookStats() {
  const stats = {
    total: 0,
    bySeverity: {
      CRITICAL: 0,
      ERROR: 0,
      WARNING: 0,
      INFO: 0
    }
  };

  for (const strategy of Object.values(RECOVERY_PLAYBOOK)) {
    stats.total++;
    stats.bySeverity[strategy.severity]++;
  }

  return stats;
}

// Экспорт
module.exports = {
  RECOVERY_PLAYBOOK,
  getRecoveryStrategy,
  getStrategiesBySeverity,
  getErrorTypes,
  getPlaybookStats
};

// Самотестирование при запуске
if (require.main === module) {
  console.log('📖 Error Recovery Playbook\n');

  const stats = getPlaybookStats();
  console.log(`Total strategies: ${stats.total}`);
  console.log('By severity:');
  console.log(`  CRITICAL: ${stats.bySeverity.CRITICAL}`);
  console.log(`  ERROR: ${stats.bySeverity.ERROR}`);
  console.log(`  WARNING: ${stats.bySeverity.WARNING}`);
  console.log(`  INFO: ${stats.bySeverity.INFO}`);

  console.log('\n📋 Available error types:');
  getErrorTypes().forEach(type => {
    const strategy = getRecoveryStrategy(type);
    console.log(`  - ${type.padEnd(30)} [${strategy.severity}]`);
  });

  console.log('\n🔴 Critical strategies:');
  const criticalStrats = getStrategiesBySeverity('CRITICAL');
  for (const [type, strategy] of Object.entries(criticalStrats)) {
    console.log(`\n  ${type}:`);
    console.log(`    ${strategy.description}`);
    console.log(`    Steps: ${strategy.steps.length}`);
  }

  console.log('\n✅ Playbook loaded successfully!');
}
