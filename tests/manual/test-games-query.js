/**
 * Тестовый скрипт для проверки эндпоинта /Games/query
 * 
 * Проверяет все примеры из документации SStats API
 */

const SStatsClient = require('../../src/api/sstats-client');
require('dotenv').config();

const client = new SStatsClient({
  apiKey: process.env.SSTATS_API_KEY,
  baseURL: process.env.SSTATS_API_URL || 'https://api.sstats.net'
});

// Вспомогательная функция для красивого вывода результатов
function printResult(testName, result, error = null) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  if (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
  } else {
    console.log('✅ SUCCESS');
    
    // Для CSV просто выводим первые 500 символов
    if (typeof result === 'string') {
      console.log('Result (CSV, first 500 chars):');
      console.log(result.substring(0, 500) + '...');
    } else {
      // Для JSON выводим структуру
      console.log('Result type:', Array.isArray(result) ? 'Array' : typeof result);
      
      if (Array.isArray(result)) {
        console.log('Items count:', result.length);
        if (result.length > 0) {
          console.log('First item:', JSON.stringify(result[0], null, 2));
        }
      } else {
        console.log('Result:', JSON.stringify(result, null, 2));
      }
    }
  }
  
  console.log('='.repeat(80));
}

// Основная функция тестирования
async function runTests() {
  console.log('🚀 Starting SStats /Games/query endpoint tests...\n');
  console.log(`API URL: ${process.env.SSTATS_API_URL || 'https://api.sstats.net'}`);
  console.log(`API Key: ${process.env.SSTATS_API_KEY ? '***' + process.env.SSTATS_API_KEY.slice(-4) : 'NOT SET'}\n`);

  const tests = [
    {
      name: 'Пример 1: Простой поиск матчей лиги',
      description: 'Найти все матчи Английской Премьер-лиги за 2024 год',
      params: {
        Condition: "LeagueId = 39 AND Year = 2024",
        Fields: ["Date", "HomeTeamName", "AwayTeamName", "ScoreHomeFT", "ScoreAwayFT"],
        format: "json"
      }
    },
    {
      name: 'Пример 2: Поиск матчей с определенными коэффициентами',
      description: 'Найти матчи, где фаворит имеет коэффициент от 1.3 до 1.7',
      params: {
        Condition: "(Winner1 >= 1.3 AND Winner1 <= 1.7) OR (Winner2 >= 1.3 AND Winner2 <= 1.7)",
        Fields: ["Date", "HomeTeamName", "AwayTeamName", "Winner1", "WinnerX", "Winner2"],
        format: "json",
        Order: "Date DESC"
      }
    },
    {
      name: 'Пример 3: Результативные матчи',
      description: 'Найти матчи с общим количеством голов больше 3.5',
      params: {
        Condition: "(ScoreHomeFT + ScoreAwayFT) > 3",
        Fields: [
          "Date", "LeagueName", "HomeTeamName", "AwayTeamName",
          "ScoreHomeFT", "ScoreAwayFT",
          "ScoreHomeFT + ScoreAwayFT AS TotalGoals"
        ],
        Order: "TotalGoals DESC"
      }
    },
    {
      name: 'Пример 4: Анализ xG (ожидаемые голы)',
      description: 'Найти матчи, где команды забили больше ожидаемого',
      params: {
        Condition: "ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) > 1",
        Fields: [
          "Date", "HomeTeamName", "ScoreHomeFT", "ExpectedGoalsHome",
          "ScoreHomeFT - ExpectedGoalsHome AS OverPerformance"
        ],
        Order: "OverPerformance DESC"
      }
    },
    {
      name: 'Пример 5: Поиск матчей с интересной статистикой',
      description: 'Матчи с большим количеством ударов, но малым количеством голов',
      params: {
        Condition: "(TotalShotsHome + TotalShotsAway) > 30 AND (ScoreHomeFT + ScoreAwayFT) < 2",
        Fields: [
          "Date", "HomeTeamName", "AwayTeamName",
          "TotalShotsHome", "TotalShotsAway",
          "ScoreHomeFT", "ScoreAwayFT",
          "(TotalShotsHome + TotalShotsAway) / (ScoreHomeFT + ScoreAwayFT + 0.1) AS ShotsPerGoal"
        ],
        Order: "ShotsPerGoal DESC"
      }
    },
    {
      name: 'Пример 6: Поиск по названию команды',
      description: 'Arsenal дома vs Manchester в гостях',
      params: {
        Condition: "HomeTeamName LIKE 'Arsenal' AND AwayTeamName LIKE '%Manchester%'",
        Fields: ["Id", "Date", "HomeTeamName", "AwayTeamName"],
        Order: "Date DESC",
        format: "csv"
      }
    },
    {
      name: 'Пример 7: Простой запрос с минимальными полями (CSV)',
      description: 'Базовая информация о матчах в CSV формате',
      params: {
        Condition: "LeagueId = 39 AND Year = 2024",
        Fields: ["Id", "Date", "HomeTeamName", "AwayTeamName", "ScoreHomeFT + 1"],
        Order: "Date Desc",
        format: "csv"
      }
    }
  ];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    
    console.log(`\n📋 Running test ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    console.log(`   Params:`, JSON.stringify(test.params, null, 2));

    try {
      const result = await client.queryGamesAdvanced(test.params);
      printResult(test.name, result);
      successCount++;
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      printResult(test.name, null, error);
      failCount++;
    }
  }

  // Итоговая статистика
  console.log('\n' + '█'.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('█'.repeat(80));
  console.log(`Total tests: ${tests.length}`);
  console.log(`✅ Passed: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log('█'.repeat(80));

  // Показываем метрики клиента
  console.log('\n📈 Client Metrics:');
  const metrics = client.getMetrics();
  console.log(JSON.stringify(metrics, null, 2));

  client.close();
  process.exit(failCount > 0 ? 1 : 0);
}

// Запуск тестов
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
