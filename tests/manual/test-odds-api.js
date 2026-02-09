/**
 * Odds API Manual Tests
 * Тесты для проверки работы Odds API endpoints
 * 
 * @author AI Assistant
 * @date 2026-01-31
 * @version 1.0.0
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

// Цвета для вывода
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

/**
 * HTTP запрос к API
 */
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const startTime = Date.now();
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({ data: json, duration, statusCode: res.statusCode });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Запустить тест
 */
async function runTest(name, path, validator) {
  try {
    console.log(`\n${colors.blue}Testing:${colors.reset} ${name}`);
    console.log(`${colors.blue}Path:${colors.reset} ${path}`);
    
    const result = await makeRequest(path);
    const { data, duration, statusCode } = result;
    
    // Валидация
    if (validator) {
      const validationResult = validator(data);
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.message}`);
      }
    }
    
    console.log(`${colors.green}✓ PASSED${colors.reset} (${duration}ms, HTTP ${statusCode})`);
    
    // Детали ответа
    if (data.count !== undefined) {
      console.log(`  ${colors.yellow}→${colors.reset} Count: ${data.count}`);
    }
    if (data.success !== undefined) {
      console.log(`  ${colors.yellow}→${colors.reset} Success: ${data.success}`);
    }
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      console.log(`  ${colors.yellow}→${colors.reset} First item: ${JSON.stringify(data.data[0]).substring(0, 100)}...`);
    }
    
    return { passed: true, duration };
  } catch (error) {
    console.log(`${colors.red}✗ FAILED${colors.reset}`);
    console.log(`  ${colors.red}→${colors.reset} Error: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

/**
 * Основная функция тестирования
 */
async function main() {
  console.log(`${'='.repeat(80)}`);
  console.log(`${colors.blue}Odds API Manual Tests${colors.reset}`);
  console.log(`${'='.repeat(80)}`);
  
  const tests = [
    // Test 1: Get Bookmakers
    {
      name: 'Get Bookmakers (справочник букмекеров)',
      path: '/api/odds/bookmakers',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (!Array.isArray(data.data)) {
          return { valid: false, message: 'Data is not an array' };
        }
        if (data.count === undefined) {
          return { valid: false, message: 'Count is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 2: Get Live Odds (valid game)
    {
      name: 'Get Live Odds (live коэффициенты для матча)',
      path: '/api/odds/live/1461496',
      validator: (data) => {
        if (!data.success) {
          // Live odds may not be available for all games
          return { valid: true, message: 'Live odds not available (acceptable)' };
        }
        if (!data.data) {
          return { valid: false, message: 'Data is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 3: Get Live Updates (all games)
    {
      name: 'Get Live Updates (метки обновлений для всех матчей)',
      path: '/api/odds/live-updates',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (!Array.isArray(data.data)) {
          return { valid: false, message: 'Data is not an array' };
        }
        return { valid: true };
      }
    },
    
    // Test 4: Get Live Updates (specific games)
    {
      name: 'Get Live Updates (для конкретных матчей)',
      path: '/api/odds/live-updates?gameIds=1461496,1461497',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (!Array.isArray(data.data)) {
          return { valid: false, message: 'Data is not an array' };
        }
        return { valid: true };
      }
    },
    
    // Test 5: Error handling (too many game IDs)
    {
      name: 'Error handling (более 100 ID матчей)',
      path: '/api/odds/live-updates?gameIds=' + Array.from({length: 101}, (_, i) => i + 1).join(','),
      validator: (data) => {
        if (data.success !== false) {
          return { valid: false, message: 'Expected success to be false' };
        }
        if (!data.message || !data.message.includes('100')) {
          return { valid: false, message: 'Expected error message about max 100 games' };
        }
        return { valid: true };
      }
    },
    
    // Test 6: Get Live Changes History
    {
      name: 'Get Live Changes History (история изменений коэффициентов)',
      path: '/api/odds/live-changes/1461496',
      validator: (data) => {
        if (!data.success) {
          // History may not be available for all games
          return { valid: true, message: 'Live changes history not available (acceptable)' };
        }
        if (!Array.isArray(data.data)) {
          return { valid: false, message: 'Data is not an array' };
        }
        return { valid: true };
      }
    },
    
    // Test 7: Get Prematch Markets
    {
      name: 'Get Prematch Markets (справочник типов ставок)',
      path: '/api/odds/prematch-markets',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (typeof data.data !== 'object') {
          return { valid: false, message: 'Data is not an object' };
        }
        return { valid: true };
      }
    }
  ];
  
  const results = [];
  const startTime = Date.now();
  
  // Запускаем тесты
  for (const test of tests) {
    const result = await runTest(test.name, test.path, test.validator);
    results.push(result);
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Итоги
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.blue}Test Summary${colors.reset}`);
  console.log(`${'='.repeat(80)}`);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`${colors.green}Passed:${colors.reset} ${passed}/${tests.length}`);
  console.log(`${colors.red}Failed:${colors.reset} ${failed}/${tests.length}`);
  console.log(`${colors.yellow}Total Duration:${colors.reset} ${totalDuration}ms`);
  console.log(`${colors.yellow}Average:${colors.reset} ${Math.round(totalDuration / tests.length)}ms per test`);
  
  console.log(`\n${'='.repeat(80)}`);
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Запуск
main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
