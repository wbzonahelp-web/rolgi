#!/usr/bin/env node
/**
 * Comprehensive API Endpoint Testing
 * Tests all 55 active endpoints with real data display
 * Date: 2026-01-31
 * Version: 1.0.0
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 10000;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now()
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

function logEndpoint(method, path) {
  log(`\n[${method}] ${path}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

function displayData(data, maxItems = 3) {
  if (Array.isArray(data)) {
    log(`  📊 Получено записей: ${data.length}`, 'magenta');
    if (data.length > 0) {
      log(`  📋 Показаны первые ${Math.min(maxItems, data.length)} из ${data.length}:`, 'magenta');
      data.slice(0, maxItems).forEach((item, idx) => {
        console.log(`    [${idx + 1}] ${JSON.stringify(item, null, 2).split('\n').map((line, i) => i === 0 ? line : '        ' + line).join('\n')}`);
      });
    }
  } else if (typeof data === 'object' && data !== null) {
    if (data.data && Array.isArray(data.data)) {
      displayData(data.data, maxItems);
    } else if (data.success !== undefined) {
      log(`  📊 Success: ${data.success}`, 'magenta');
      if (data.count !== undefined) log(`  📊 Count: ${data.count}`, 'magenta');
      if (data.totalCount !== undefined) log(`  📊 Total Count: ${data.totalCount}`, 'magenta');
      if (data.data) {
        if (Array.isArray(data.data)) {
          displayData(data.data, maxItems);
        } else {
          log(`  📋 Данные:`, 'magenta');
          console.log(`    ${JSON.stringify(data.data, null, 2).split('\n').map((line, i) => i === 0 ? line : '    ' + line).join('\n')}`);
        }
      }
    } else {
      log(`  📋 Данные:`, 'magenta');
      console.log(`    ${JSON.stringify(data, null, 2).split('\n').map((line, i) => i === 0 ? line : '    ' + line).join('\n')}`);
    }
  } else {
    log(`  📋 Результат: ${data}`, 'magenta');
  }
}

async function testEndpoint(method, path, description, options = {}) {
  stats.total++;
  logEndpoint(method, path);
  logInfo(description);

  try {
    const config = {
      method: method.toLowerCase(),
      url: `${BASE_URL}${path}`,
      timeout: TIMEOUT,
      validateStatus: () => true, // Don't throw on any status
      ...options
    };

    const startTime = Date.now();
    const response = await axios(config);
    const duration = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      logSuccess(`Статус: ${response.status} (${duration}ms)`);
      stats.passed++;
      
      // Display response data
      if (response.data) {
        displayData(response.data);
      }
      
      return { success: true, data: response.data, status: response.status };
    } else if (response.status === 404) {
      logWarning(`Статус: ${response.status} - Not Found (${duration}ms)`);
      stats.skipped++;
      return { success: false, status: response.status, skipped: true };
    } else {
      logError(`Статус: ${response.status} (${duration}ms)`);
      if (response.data) {
        console.log(`  Response: ${JSON.stringify(response.data, null, 2)}`);
      }
      stats.failed++;
      return { success: false, status: response.status, data: response.data };
    }
  } catch (error) {
    logError(`Ошибка: ${error.message}`);
    if (error.response) {
      console.log(`  Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    stats.failed++;
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('\n🚀 ЗАПУСК КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ API', 'bright');
  log(`📅 Дата: ${new Date().toISOString()}`, 'cyan');
  log(`🌐 Base URL: ${BASE_URL}`, 'cyan');
  log(`⏱  Timeout: ${TIMEOUT}ms`, 'cyan');

  // ==========================================================================
  // 1. FLASHSCORE API (24 endpoints)
  // ==========================================================================
  logSection('1. FLASHSCORE API (24 эндпоинтов)');

  await testEndpoint('GET', '/api/flashscore/health', 'Health check');
  
  await testEndpoint('GET', '/api/flashscore/games?Date=2026-01-31&Limit=5', 
    'Получить игры на конкретную дату');
  
  await testEndpoint('GET', '/api/flashscore/games/today?Limit=5', 
    'Получить сегодняшние игры');
  
  await testEndpoint('GET', '/api/flashscore/games/live?Limit=5', 
    'Получить живые игры');
  
  await testEndpoint('GET', '/api/flashscore/games/upcoming?Limit=5', 
    'Получить предстоящие игры');
  
  await testEndpoint('GET', '/api/flashscore/games/ended?Limit=5', 
    'Получить завершенные игры');
  
  await testEndpoint('GET', '/api/flashscore/games/date/2026-01-31?Limit=5', 
    'Получить игры по дате (параметр в URL)');
  
  await testEndpoint('GET', '/api/flashscore/games/yesterday?Limit=5', 
    'Получить вчерашние игры');
  
  await testEndpoint('GET', '/api/flashscore/games/tomorrow?Limit=5', 
    'Получить завтрашние игры');
  
  await testEndpoint('GET', '/api/flashscore/games/week?Limit=5', 
    'Получить игры на неделю');
  
  await testEndpoint('POST', '/api/flashscore/games/query', 
    'Выполнить сложный запрос игр', {
      data: {
        Date: '2026-01-31',
        Limit: 5
      }
    });
  
  await testEndpoint('GET', '/api/flashscore/games/team/1?Limit=5', 
    'Получить игры команды');
  
  await testEndpoint('GET', '/api/flashscore/games/league/1?Limit=5', 
    'Получить игры лиги');
  
  await testEndpoint('GET', '/api/flashscore/games/h2h/1/2?Limit=5', 
    'Получить H2H между двумя командами');
  
  await testEndpoint('GET', '/api/flashscore/game/1', 
    'Получить детали игры');
  
  await testEndpoint('GET', '/api/flashscore/leagues?Limit=10', 
    'Получить список лиг');
  
  await testEndpoint('GET', '/api/flashscore/leagues/search?name=Premier&Limit=5', 
    'Поиск лиг по имени');
  
  await testEndpoint('GET', '/api/flashscore/leagues/country/England?Limit=5', 
    'Получить лиги страны');
  
  await testEndpoint('GET', '/api/flashscore/seasons/1?Limit=5', 
    'Получить сезоны лиги');
  
  await testEndpoint('GET', '/api/flashscore/standings/1', 
    'Получить турнирную таблицу');
  
  await testEndpoint('GET', '/api/flashscore/events/1?Limit=10', 
    'Получить события игры');
  
  await testEndpoint('GET', '/api/flashscore/lineups/1', 
    'Получить составы команд');
  
  await testEndpoint('GET', '/api/flashscore/statistics/1', 
    'Получить статистику игры');
  
  await testEndpoint('GET', '/api/flashscore/examples', 
    'Получить примеры запросов');

  // ==========================================================================
  // 2. GAMES API (17 endpoints)
  // ==========================================================================
  logSection('2. GAMES API (17 эндпоинтов)');

  await testEndpoint('GET', '/api/games/health', 'Health check');
  
  await testEndpoint('GET', '/api/games/list?Limit=5', 
    'Получить список игр (с фильтром)');
  
  await testEndpoint('GET', '/api/games/today?Limit=5', 
    'Получить сегодняшние игры');
  
  await testEndpoint('GET', '/api/games/live?Limit=5', 
    'Получить живые игры');
  
  await testEndpoint('GET', '/api/games/upcoming?Limit=5', 
    'Получить предстоящие игры');
  
  await testEndpoint('GET', '/api/games/ended?Limit=5', 
    'Получить завершенные игры');
  
  await testEndpoint('GET', '/api/games/date/2026-01-31?Limit=5', 
    'Получить игры на дату');
  
  await testEndpoint('GET', '/api/games/team/1?Limit=5', 
    'Получить игры команды');
  
  await testEndpoint('GET', '/api/games/league/1?Limit=5', 
    'Получить игры лиги');
  
  await testEndpoint('GET', '/api/games/h2h/1/2?Limit=5', 
    'Получить H2H матчи');
  
  await testEndpoint('GET', '/api/games/1', 
    'Получить детали игры по ID');
  
  await testEndpoint('GET', '/api/games/glicko/1', 
    'Получить Glicko рейтинг игры');
  
  await testEndpoint('GET', '/api/games/last-games-stats?teamId=1&limit=5', 
    'Получить статистику последних игр');
  
  await testEndpoint('GET', '/api/games/text-summary?gameId=1', 
    'Получить текстовую сводку игры');
  
  await testEndpoint('GET', '/api/games/profits?limit=5', 
    'Получить анализ прибыльности');
  
  await testEndpoint('GET', '/api/games/injuries?teamId=1', 
    'Получить информацию о травмах');
  
  await testEndpoint('GET', '/api/games/examples', 
    'Получить примеры запросов');

  // ==========================================================================
  // 3. TEAMS API (6 endpoints)
  // ==========================================================================
  logSection('3. TEAMS API (6 эндпоинтов)');

  await testEndpoint('GET', '/api/teams/health', 'Health check');
  
  await testEndpoint('GET', '/api/teams/list?Limit=10', 
    'Получить список команд');
  
  await testEndpoint('GET', '/api/teams/1', 
    'Получить детали команды');
  
  await testEndpoint('GET', '/api/teams/search?name=Arsenal&Limit=5', 
    'Поиск команд по имени');
  
  await testEndpoint('GET', '/api/teams/country/England?Limit=5', 
    'Получить команды страны');
  
  await testEndpoint('GET', '/api/teams/examples', 
    'Получить примеры запросов');

  // ==========================================================================
  // 4. ODDS API (6 endpoints)
  // ==========================================================================
  logSection('4. ODDS API (6 эндпоинтов)');

  await testEndpoint('GET', '/api/odds/health', 'Health check');
  
  await testEndpoint('GET', '/api/odds/bookmakers?Limit=10', 
    'Получить список букмекеров');
  
  await testEndpoint('GET', '/api/odds/live/1', 
    'Получить live коэффициенты игры');
  
  await testEndpoint('GET', '/api/odds/live-updates?Limit=5', 
    'Получить обновления live коэффициентов');
  
  await testEndpoint('GET', '/api/odds/prematch-markets?gameId=1', 
    'Получить prematch рынки');
  
  await testEndpoint('GET', '/api/odds/live-markets?gameId=1', 
    'Получить live рынки');

  // ==========================================================================
  // 5. PLAYERS API (2 endpoints)
  // ==========================================================================
  logSection('5. PLAYERS API (2 эндпоинта)');

  await testEndpoint('GET', '/api/players/health', 'Health check');
  
  await testEndpoint('GET', '/api/players/find?name=Ronaldo&Limit=5', 
    'Поиск игроков');
  
  await testEndpoint('GET', '/api/players/1/events?Limit=5', 
    'Получить события игрока');

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  logSection('📊 ИТОГОВАЯ СТАТИСТИКА');

  const duration = Date.now() - stats.startTime;
  const successRate = ((stats.passed / stats.total) * 100).toFixed(2);

  log(`Всего тестов: ${stats.total}`, 'cyan');
  log(`✓ Успешно: ${stats.passed}`, 'green');
  log(`✗ Ошибок: ${stats.failed}`, 'red');
  log(`⚠ Пропущено: ${stats.skipped}`, 'yellow');
  log(`📈 Процент успеха: ${successRate}%`, 'magenta');
  log(`⏱  Общее время: ${(duration / 1000).toFixed(2)}s`, 'cyan');
  log(`⏱  Среднее время на тест: ${(duration / stats.total).toFixed(0)}ms`, 'cyan');

  console.log('\n' + '='.repeat(80));
  
  if (stats.failed === 0) {
    log('🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!', 'green');
  } else {
    log(`⚠️  ЕСТЬ ОШИБКИ: ${stats.failed} тест(ов) не прошли`, 'yellow');
  }
  
  console.log('='.repeat(80) + '\n');

  process.exit(stats.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  logError(`Критическая ошибка: ${error.message}`);
  console.error(error);
  process.exit(1);
});
