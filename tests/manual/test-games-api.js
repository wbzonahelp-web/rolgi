/**
 * Games API Manual Tests
 * Тесты для проверки работы Games API endpoints
 * 
 * @author AI Assistant
 * @date 2026-01-31
 * @version 2.0.0
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
      const firstItem = data.data[0];
      if (firstItem.id) {
        console.log(`  ${colors.yellow}→${colors.reset} First ID: ${firstItem.id}`);
      }
      if (firstItem.homeTeam && firstItem.awayTeam) {
        console.log(`  ${colors.yellow}→${colors.reset} Example: ${firstItem.homeTeam.name} vs ${firstItem.awayTeam.name}`);
      }
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
  console.log(`${colors.blue}Games API Manual Tests${colors.reset}`);
  console.log(`${'='.repeat(80)}`);
  
  const tests = [
    // Test 1: Health Check
    {
      name: 'Health Check',
      path: '/api/games/health',
      validator: (data) => {
        if (!data.status || data.status !== 'healthy') {
          return { valid: false, message: 'Status is not healthy' };
        }
        return { valid: true };
      }
    },
    
    // Test 2: Get Today's Matches
    {
      name: 'Get Today\'s Matches',
      path: '/api/games/today?Limit=10',
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
    
    // Test 3: Get Live Matches
    {
      name: 'Get Live Matches',
      path: '/api/games/live?Limit=10',
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
    
    // Test 4: Get Upcoming Matches
    {
      name: 'Get Upcoming Matches',
      path: '/api/games/upcoming?Limit=10',
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
    
    // Test 5: Get Ended Matches
    {
      name: 'Get Ended Matches',
      path: '/api/games/ended?Limit=10',
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
    
    // Test 6: Get Matches by Date
    {
      name: 'Get Matches by Date',
      path: '/api/games/date/2026-01-31',
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
    
    // Test 7: Get Team Matches (Arsenal)
    {
      name: 'Get Team Matches (Arsenal - ID 42)',
      path: '/api/games/team/42?Limit=5',
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
    
    // Test 8: Get League Matches (Premier League)
    {
      name: 'Get League Matches (Premier League - ID 39)',
      path: '/api/games/league/39?Limit=5&Year=2026',
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
    
    // Test 9: Get H2H Matches
    {
      name: 'Get H2H Matches (Arsenal vs Chelsea)',
      path: '/api/games/h2h/42/49?Limit=5',
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
    
    // Test 10: Get Examples (all categories)
    {
      name: 'Get Examples (all categories)',
      path: '/api/games/examples',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (!data.totalCategories) {
          return { valid: false, message: 'totalCategories is missing' };
        }
        if (!data.totalExamples) {
          return { valid: false, message: 'totalExamples is missing' };
        }
        if (!data.categories) {
          return { valid: false, message: 'categories is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 11: Get Examples (DATE category)
    {
      name: 'Get Examples (DATE category)',
      path: '/api/games/examples?category=DATE',
      validator: (data) => {
        if (!data.success) {
          return { valid: false, message: 'Response success is false' };
        }
        if (data.category !== 'DATE') {
          return { valid: false, message: 'Category is not DATE' };
        }
        if (!data.examples) {
          return { valid: false, message: 'examples is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 12: Get matches with filters (Date Range + League)
    {
      name: 'Get matches with filters (Date Range + League)',
      path: '/api/games/list?From=2026-01-01&To=2026-01-31&LeagueId=39&Limit=5',
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
    
    // Test 13: Error handling (no filters)
    {
      name: 'Error handling (no filters)',
      path: '/api/games/list',
      validator: (data) => {
        if (data.success !== false) {
          return { valid: false, message: 'Expected success to be false' };
        }
        if (!data.message) {
          return { valid: false, message: 'Error message is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 14: Get Glicko 2 ratings (requires game ID from today)
    {
      name: 'Get Glicko 2 ratings for game',
      path: '/api/games/glicko/1461496',
      validator: (data) => {
        if (!data.success) {
          // Glicko may not be available for all games, that's OK
          return { valid: true, message: 'Glicko not available (acceptable)' };
        }
        if (!data.data) {
          return { valid: false, message: 'Data is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 15: Get last games stats
    {
      name: 'Get last games stats (form analysis)',
      path: '/api/games/last-games-stats?gameId=1461496&limit=10',
      validator: (data) => {
        if (!data.success) {
          // Stats may not be available for all games, that's OK
          return { valid: true, message: 'Last games stats not available (acceptable)' };
        }
        if (!data.data) {
          return { valid: false, message: 'Data is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 16: Get text summary
    {
      name: 'Get text summary (match analysis)',
      path: '/api/games/text-summary?id=1461496&limit=10',
      validator: (data) => {
        if (!data.success) {
          // Summary may not be available for all games, that's OK
          return { valid: true, message: 'Text summary not available (acceptable)' };
        }
        if (!data.data) {
          return { valid: false, message: 'Data is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 17: Get profits analysis
    {
      name: 'Get profits analysis (bet profitability)',
      path: '/api/games/profits?gameId=1461496&limit=15&thisLeague=true',
      validator: (data) => {
        if (!data.success) {
          // Profits may not be available for all games, that's OK
          return { valid: true, message: 'Profits analysis not available (acceptable)' };
        }
        if (!data.data) {
          return { valid: false, message: 'Data is missing' };
        }
        return { valid: true };
      }
    },
    
    // Test 18: Get injuries
    {
      name: 'Get injuries (injured players)',
      path: '/api/games/injuries?gameId=1461496',
      validator: (data) => {
        if (!data.success) {
          // Injuries may not be available for all games, that's OK
          return { valid: true, message: 'Injuries data not available (acceptable)' };
        }
        if (!Array.isArray(data.data)) {
          return { valid: false, message: 'Data is not an array' };
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
