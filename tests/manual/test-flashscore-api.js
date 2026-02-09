/**
 * Тестовый скрипт для проверки Flashscore API эндпоинтов (/Ls/*)
 * 
 * Проверяет все основные возможности Flashscore API
 */

const SStatsClient = require('../../src/api/sstats-client');
require('dotenv').config();

const client = new SStatsClient({
  apiKey: process.env.SSTATS_API_KEY,
  baseURL: process.env.SSTATS_API_URL || 'https://api.sstats.net'
});

// Вспомогательная функция для красивого вывода
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
    
    if (Array.isArray(result)) {
      console.log(`Result type: Array (${result.length} items)`);
      if (result.length > 0) {
        console.log('First item:', JSON.stringify(result[0], null, 2));
        if (result.length > 1) {
          console.log('Second item:', JSON.stringify(result[1], null, 2));
        }
      }
    } else if (typeof result === 'object' && result !== null) {
      console.log('Result type: Object');
      console.log('Keys:', Object.keys(result));
      
      // Показываем первые несколько записей
      const preview = {};
      Object.keys(result).slice(0, 5).forEach(key => {
        preview[key] = result[key];
      });
      console.log('Preview:', JSON.stringify(preview, null, 2));
    } else {
      console.log('Result:', result);
    }
  }
  
  console.log('='.repeat(80));
}

// Основная функция тестирования
async function runTests() {
  console.log('🚀 Starting Flashscore API (/Ls/*) endpoint tests...\n');
  console.log(`API URL: ${process.env.SSTATS_API_URL || 'https://api.sstats.net'}`);
  console.log(`API Key: ${process.env.SSTATS_API_KEY ? '***' + process.env.SSTATS_API_KEY.slice(-4) : 'NOT SET'}\n`);

  const tests = [
    {
      name: 'Тест 1: Получение матчей за конкретную дату',
      description: 'GET /Ls/List?Date=2025-01-31&TimeZone=3',
      fn: async () => {
        return await client.getFlashscoreGames({
          Date: '2025-01-31',
          TimeZone: 3
        });
      }
    },
    {
      name: 'Тест 2: Получение предстоящих матчей Arsenal',
      description: 'GET /Ls/List?Team=arsenal/hA1Zm19f&Upcoming=true',
      fn: async () => {
        return await client.getFlashscoreGames({
          Team: 'arsenal/hA1Zm19f',
          Upcoming: true
        });
      }
    },
    {
      name: 'Тест 3: История встреч двух команд (H2H)',
      description: 'GET /Ls/List?BothTeams=hA1Zm19f,tUxUbLR2',
      fn: async () => {
        return await client.getFlashscoreGames({
          BothTeams: 'hA1Zm19f,tUxUbLR2'
        });
      }
    },
    {
      name: 'Тест 4: Список всех лиг Flashscore',
      description: 'GET /Ls/Leagues',
      fn: async () => {
        return await client.getFlashscoreLeagues();
      }
    },
    {
      name: 'Тест 5: Детальная информация о матче',
      description: 'GET /Ls/GameInfo?id=<valid-game-id>',
      fn: async () => {
        // Сначала получим любой матч из списка за текущую дату
        const games = await client.getFlashscoreGames({
          Date: '2025-01-31',
          Limit: 1
        });
        
        if (games.data && games.data.length > 0) {
          const gameId = games.data[0].id;
          console.log(`\nUsing game ID: ${gameId}`);
          return await client.getFlashscoreGameInfo(gameId);
        } else {
          throw new Error('No games found to test GameInfo endpoint');
        }
      }
    },
    {
      name: 'Тест 6: Поиск лиги по названию',
      description: 'GET /Ls/Leagues?name=Premier',
      fn: async () => {
        return await client.getFlashscoreLeagues({
          name: 'Premier'
        });
      }
    },
    {
      name: 'Тест 7: Сезоны лиги',
      description: 'GET /Ls/Seasons?leagueId=england/premier-league',
      fn: async () => {
        return await client.getFlashscoreSeasons({
          leagueId: 'england/premier-league'
        });
      }
    },
    {
      name: 'Тест 8: Матчи лиги (Ended)',
      description: 'GET /Ls/List?LeagueId=england/premier-league&Ended=true&Limit=10',
      fn: async () => {
        return await client.getFlashscoreGames({
          LeagueId: 'england/premier-league',
          Ended: true,
          Limit: 10
        });
      }
    },
    {
      name: 'Тест 9: Матчи за период с пагинацией',
      description: 'GET /Ls/List?From=2025-01-20&To=2025-01-31&Limit=50&Offset=0',
      fn: async () => {
        return await client.getFlashscoreGames({
          From: '2025-01-20',
          To: '2025-01-31',
          Limit: 50,
          Offset: 0
        });
      }
    }
  ];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    
    console.log(`\n📋 Running test ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`   Description: ${test.description}`);

    try {
      const result = await test.fn();
      printResult(test.name, result);
      successCount++;
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 500));
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
