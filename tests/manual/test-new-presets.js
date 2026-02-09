#!/usr/bin/env node

/**
 * Тестирование новых пресетов Advanced Query
 * 
 * Запуск: node tests/manual/test-new-presets.js
 */

const SStatsClient = require('../../src/api/sstats-client');
const { getAllPresets, getPresetsStats } = require('../../src/api/query-presets');

// Конфигурация
const API_KEY = process.env.SSTATS_API_KEY || 'fl3qjc4crvx8cppm';
const API_BASE_URL = 'https://api.sstats.net';

// Создаем клиент
const client = new SStatsClient({
  apiKey: API_KEY,
  baseURL: API_BASE_URL,
  enableCache: true,
  enableMetrics: true
});

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Тестируем пресет
 */
async function testPreset(preset) {
  try {
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Тест: ${preset.name}${colors.reset}`);
    console.log(`${colors.yellow}Категория: ${preset.category}${colors.reset}`);
    console.log(`Описание: ${preset.description}`);
    console.log(`\nПараметры запроса:`);
    console.log(`  Condition: ${preset.query.Condition}`);
    console.log(`  Fields: ${preset.query.Fields.length} полей`);
    console.log(`  Format: ${preset.query.format || 'json'}`);
    if (preset.query.Order) {
      console.log(`  Order: ${preset.query.Order}`);
    }
    if (preset.query.Limit) {
      console.log(`  Limit: ${preset.query.Limit}`);
    }
    
    const startTime = Date.now();
    const result = await client.queryGamesAdvanced(preset.query);
    const duration = Date.now() - startTime;
    
    // Для CSV формата просто проверяем наличие данных
    if (preset.query.format === 'csv') {
      const lines = result.split('\n').filter(l => l.trim());
      console.log(`\n${colors.green}✅ SUCCESS${colors.reset}`);
      console.log(`Строк в CSV: ${lines.length}`);
      console.log(`Время выполнения: ${duration}ms`);
      console.log(`Первые 3 строки:`);
      lines.slice(0, 3).forEach(line => console.log(`  ${line.substring(0, 100)}...`));
      return { success: true, count: lines.length - 1, duration };
    }
    
    // Для JSON формата
    const count = Array.isArray(result) ? result.length : (result.data ? result.data.length : 0);
    console.log(`\n${colors.green}✅ SUCCESS${colors.reset}`);
    console.log(`Результатов: ${count}`);
    console.log(`Время выполнения: ${duration}ms`);
    
    if (count > 0) {
      const data = Array.isArray(result) ? result : result.data;
      console.log(`\nПример первого результата (первые 3 поля):`);
      const firstItem = data[0];
      Object.keys(firstItem).slice(0, 3).forEach(key => {
        console.log(`  ${key}: ${firstItem[key]}`);
      });
    }
    
    return { success: true, count, duration };
    
  } catch (error) {
    console.log(`\n${colors.red}❌ FAILED${colors.reset}`);
    console.log(`Ошибка: ${error.message}`);
    if (error.response?.data) {
      console.log(`Ответ API: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Главная функция
 */
async function main() {
  console.log(`${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════════╗
║         Тестирование новых пресетов Advanced Query           ║
╚═══════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`API Key: ${API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT SET'}`);
  
  // Статистика по пресетам
  const stats = getPresetsStats();
  console.log(`\n${colors.bright}Статистика пресетов:${colors.reset}`);
  console.log(`  Всего: ${stats.total}`);
  console.log(`  Категорий: ${stats.categories.length}`);
  console.log(`  По категориям:`);
  Object.entries(stats.byCategory).forEach(([cat, count]) => {
    console.log(`    ${cat}: ${count}`);
  });
  
  // Получаем все пресеты
  const allPresets = getAllPresets();
  
  // Выбираем пресеты для тестирования (по 1-2 из каждой категории)
  const presetsToTest = [
    // Leagues
    allPresets.find(p => p.id === 'premier_league_2024'),
    allPresets.find(p => p.id === 'champions_league_2024'),
    
    // Odds
    allPresets.find(p => p.id === 'favorites_low_odds'),
    allPresets.find(p => p.id === 'odds_xg_comparison'),
    
    // Scoring
    allPresets.find(p => p.id === 'high_scoring'),
    allPresets.find(p => p.id === 'comeback_matches'),
    
    // xG
    allPresets.find(p => p.id === 'xg_overperformance'),
    allPresets.find(p => p.id === 'glicko_xg_analysis'),
    
    // Stats
    allPresets.find(p => p.id === 'many_shots_few_goals'),
    allPresets.find(p => p.id === 'red_cards_matches'),
    allPresets.find(p => p.id === 'goalkeeper_saves'),
    
    // Glicko
    allPresets.find(p => p.id === 'glicko_rating_diff'),
    allPresets.find(p => p.id === 'glicko_upset'),
    
    // Teams
    allPresets.find(p => p.id === 'coach_analysis'),
    allPresets.find(p => p.id === 'venue_analysis'),
    
    // Coverage
    allPresets.find(p => p.id === 'full_coverage_matches'),
    allPresets.find(p => p.id === 'odds_coverage')
  ].filter(Boolean); // Убираем undefined
  
  console.log(`\n${colors.bright}Будет протестировано: ${presetsToTest.length} пресетов${colors.reset}`);
  
  // Результаты
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    totalDuration: 0,
    details: []
  };
  
  // Тестируем каждый пресет
  for (let i = 0; i < presetsToTest.length; i++) {
    const preset = presetsToTest[i];
    console.log(`\n${colors.bright}[${i + 1}/${presetsToTest.length}]${colors.reset}`);
    
    const result = await testPreset(preset);
    
    results.total++;
    if (result.success) {
      results.passed++;
      results.totalDuration += result.duration;
    } else {
      results.failed++;
    }
    
    results.details.push({
      preset: preset.name,
      category: preset.category,
      ...result
    });
    
    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Итоговая статистика
  console.log(`\n${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════════╗
║                      ИТОГОВАЯ СТАТИСТИКА                      ║
╚═══════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`${colors.bright}Всего тестов: ${results.total}${colors.reset}`);
  console.log(`${colors.green}✅ Успешно: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Ошибок: ${results.failed}${colors.reset}`);
  
  if (results.passed > 0) {
    const avgDuration = Math.round(results.totalDuration / results.passed);
    console.log(`⏱️  Среднее время ответа: ${avgDuration}ms`);
  }
  
  // Метрики клиента
  console.log(`\n${colors.bright}Метрики API клиента:${colors.reset}`);
  const metrics = client.getMetrics();
  console.log(`  Всего запросов: ${metrics.totalRequests}`);
  console.log(`  Успешных: ${metrics.successfulRequests}`);
  console.log(`  Неудачных: ${metrics.failedRequests}`);
  console.log(`  Повторных попыток: ${metrics.totalRetries}`);
  console.log(`  Среднее время ответа: ${metrics.averageResponseTime?.toFixed(2)}ms`);
  
  // Закрываем клиент
  client.close();
  
  console.log(`\n${colors.bright}${colors.green}✅ Тестирование завершено${colors.reset}\n`);
  
  // Код выхода
  process.exit(results.failed > 0 ? 1 : 0);
}

// Запуск
main().catch(error => {
  console.error(`${colors.red}Критическая ошибка:${colors.reset}`, error);
  process.exit(1);
});
