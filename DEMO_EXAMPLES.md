# 🚀 Демонстрационные примеры Flashscore API

## 📋 Содержание

- [Запуск тестового сервера](#запуск-тестового-сервера)
- [Примеры использования API](#примеры-использования-api)
- [Примеры с использованием Query Builder](#примеры-с-использованием-query-builder)
- [Интерактивный UI](#интерактивный-ui)
- [Реальные use-cases](#реальные-use-cases)

---

## 🎯 Запуск тестового сервера

### Метод 1: Тестовый сервер (без базы данных)

```bash
# Запустить тестовый сервер
node test-flashscore-server.js
```

**Доступные URL:**
- 📡 **API**: http://localhost:3001
- 📚 **Swagger документация**: http://localhost:3001/docs
- 🎨 **Интерактивный UI**: http://localhost:3001/flashscore-query-builder.html
- ❤️ **Health check**: http://localhost:3001/health

### Публичный URL (в sandbox):
- **API**: http://158.69.195.140:3001
- **Swagger**: http://158.69.195.140:3001/docs
- **UI**: http://158.69.195.140:3001/flashscore-query-builder.html

---

## 📡 Примеры использования API

### 1. Получение матчей за сегодня

```bash
curl "http://localhost:3001/api/flashscore/games/today?Limit=5"
```

**Пример ответа:**
```json
{
  "success": true,
  "data": [
    {
      "id": "MwckPFV6",
      "date": "2026-01-31T00:00:00+03:00",
      "status": 3,
      "homeTeam": {
        "id": "philadelphia-union/UswBCufg",
        "name": "Philadelphia Union II (Usa)"
      },
      "awayTeam": {
        "id": "loudoun-united/faQG6GQT",
        "name": "Loudoun (Usa)"
      },
      "homeResult": 2,
      "awayResult": 2
    }
  ],
  "count": 5,
  "metadata": {...}
}
```

### 2. Получение live матчей

```bash
curl "http://localhost:3001/api/flashscore/games/live"
```

### 3. Получение предстоящих матчей

```bash
curl "http://localhost:3001/api/flashscore/games/upcoming?Limit=10"
```

### 4. Матчи конкретной команды

```bash
# По полному ID
curl "http://localhost:3001/api/flashscore/games/team/arsenal/hA1Zm19f?Limit=5"

# По короткому ID
curl "http://localhost:3001/api/flashscore/games/team/hA1Zm19f?Limit=5"
```

### 5. Матчи конкретной лиги

```bash
curl "http://localhost:3001/api/flashscore/games/league/england/premier-league?Limit=10"
```

### 6. Матчи за определенную дату

```bash
curl "http://localhost:3001/api/flashscore/games/date/2026-01-31?TimeZone=3"
```

### 7. Head-to-Head (личные встречи)

```bash
curl "http://localhost:3001/api/flashscore/games/h2h/arsenal/hA1Zm19f/chelsea/4fGZN2oK?Limit=10"

# Или с короткими ID
curl "http://localhost:3001/api/flashscore/games/h2h/hA1Zm19f/4fGZN2oK?Limit=10"
```

### 8. Детальная информация о матче

```bash
curl "http://localhost:3001/api/flashscore/game/MwckPFV6"
```

### 9. Поиск лиг

```bash
curl "http://localhost:3001/api/flashscore/leagues/search?name=Premier+League"
```

### 10. Получение всех лиг

```bash
curl "http://localhost:3001/api/flashscore/leagues"
```

### 11. Сезоны лиги

```bash
curl "http://localhost:3001/api/flashscore/seasons/england/premier-league"
```

### 12. Примеры запросов по категориям

```bash
# Все примеры
curl "http://localhost:3001/api/flashscore/examples"

# Примеры по дате
curl "http://localhost:3001/api/flashscore/examples/date"

# Примеры по командам
curl "http://localhost:3001/api/flashscore/examples/team"

# Примеры по лигам
curl "http://localhost:3001/api/flashscore/examples/league"

# Примеры по статусу
curl "http://localhost:3001/api/flashscore/examples/status"
```

---

## 🔧 Примеры с использованием Query Builder

### JavaScript/Node.js

```javascript
const QueryBuilder = require('./src/api/query-builder');

// Пример 1: Матчи Arsenal за сегодня
const query1 = new QueryBuilder()
  .forToday()
  .forTeam('arsenal/hA1Zm19f')
  .limit(10)
  .build();

console.log('Query URL:', query1.toUrl());
// Результат: /Ls/List?Date=2026-01-31&Team=arsenal/hA1Zm19f&Limit=10&TimeZone=3

// Пример 2: Live матчи Premier League
const query2 = new QueryBuilder()
  .forLeague('england/premier-league')
  .liveOnly()
  .orderByDateDesc()
  .build();

console.log('Query URL:', query2.toUrl());

// Пример 3: Предстоящие матчи за период
const query3 = new QueryBuilder()
  .forDateRange('2026-02-01', '2026-02-07')
  .upcomingOnly()
  .withTimeZone(3)
  .limit(50)
  .build();

// Пример 4: Завершенные матчи команды
const query4 = new QueryBuilder()
  .forTeam('chelsea/4fGZN2oK')
  .completedOnly()
  .forLastDays(7)
  .build();

// Пример 5: Head-to-Head
const query5 = new QueryBuilder()
  .headToHead('arsenal/hA1Zm19f', 'chelsea/4fGZN2oK')
  .completedOnly()
  .limit(20)
  .build();
```

### Использование с HTTP клиентом

```javascript
const axios = require('axios');
const QueryBuilder = require('./src/api/query-builder');

async function getArsenalMatches() {
  const query = new QueryBuilder()
    .forTeam('arsenal/hA1Zm19f')
    .forLastDays(7)
    .build();
  
  const response = await axios.get(
    `http://localhost:3001/api/flashscore/games/list${query.toUrl()}`
  );
  
  return response.data;
}

async function getLiveMatches(leagueId) {
  const query = new QueryBuilder()
    .forLeague(leagueId)
    .liveOnly()
    .build();
  
  const response = await axios.get(
    `http://localhost:3001/api/flashscore/games/list${query.toUrl()}`
  );
  
  return response.data;
}
```

---

## 🎨 Интерактивный UI

### Доступ к Query Builder UI

Откройте в браузере: http://localhost:3001/flashscore-query-builder.html

**Возможности UI:**

1. **📅 Фильтры по дате**
   - Сегодня
   - Вчера
   - Завтра
   - Пользовательский период
   - Последние N дней

2. **⚽ Фильтры по командам**
   - Поиск команды
   - Head-to-Head между командами
   - Матчи дома/в гостях

3. **🏆 Фильтры по лигам**
   - Выбор лиги
   - Выбор сезона
   - Фильтр по странам

4. **📊 Фильтры по статусу**
   - Live матчи
   - Завершенные
   - Предстоящие
   - Конкретный статус

5. **⚙️ Дополнительные настройки**
   - Пагинация (Offset, Limit)
   - Сортировка
   - Часовой пояс
   - Формат вывода (JSON/CSV)

---

## 🎯 Реальные use-cases

### Use Case 1: Мониторинг live матчей

```javascript
// Получение всех live матчей каждые 30 секунд
setInterval(async () => {
  const response = await fetch('http://localhost:3001/api/flashscore/games/live');
  const data = await response.json();
  
  console.log(`Live матчей: ${data.count}`);
  data.data.forEach(game => {
    console.log(`${game.homeTeam.name} ${game.homeResult} : ${game.awayResult} ${game.awayTeam.name}`);
  });
}, 30000);
```

### Use Case 2: Анализ результатов команды

```javascript
const QueryBuilder = require('./src/api/query-builder');

async function analyzeTeamPerformance(teamId, days = 30) {
  const query = new QueryBuilder()
    .forTeam(teamId)
    .completedOnly()
    .forLastDays(days)
    .limit(100)
    .build();
  
  const response = await fetch(
    `http://localhost:3001/api/flashscore/games/list${query.toUrl()}`
  );
  const data = await response.json();
  
  let wins = 0, draws = 0, losses = 0;
  let goalsScored = 0, goalsConceded = 0;
  
  data.data.forEach(game => {
    const isHome = game.homeTeam.id === teamId;
    const scored = isHome ? game.homeResult : game.awayResult;
    const conceded = isHome ? game.awayResult : game.homeResult;
    
    goalsScored += scored;
    goalsConceded += conceded;
    
    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;
  });
  
  return {
    matches: data.count,
    wins,
    draws,
    losses,
    goalsScored,
    goalsConceded,
    goalDifference: goalsScored - goalsConceded,
    winRate: (wins / data.count * 100).toFixed(2) + '%'
  };
}

// Использование
analyzeTeamPerformance('arsenal/hA1Zm19f', 30).then(stats => {
  console.log('Arsenal stats (last 30 days):', stats);
});
```

### Use Case 3: Расписание матчей на неделю

```javascript
async function getWeekSchedule(leagueId) {
  const query = new QueryBuilder()
    .forLeague(leagueId)
    .forNextDays(7)
    .upcomingOnly()
    .orderByDateAsc()
    .limit(100)
    .build();
  
  const response = await fetch(
    `http://localhost:3001/api/flashscore/games/list${query.toUrl()}`
  );
  const data = await response.json();
  
  // Группировка по датам
  const schedule = {};
  data.data.forEach(game => {
    const date = game.date.split('T')[0];
    if (!schedule[date]) schedule[date] = [];
    schedule[date].push(game);
  });
  
  return schedule;
}

// Вывод расписания
getWeekSchedule('england/premier-league').then(schedule => {
  Object.entries(schedule).forEach(([date, games]) => {
    console.log(`\n📅 ${date} (${games.length} матчей)`);
    games.forEach(game => {
      console.log(`  ${game.homeTeam.name} vs ${game.awayTeam.name}`);
    });
  });
});
```

### Use Case 4: Сравнение команд

```javascript
async function compareTeams(team1Id, team2Id) {
  // Head-to-head
  const h2hQuery = new QueryBuilder()
    .headToHead(team1Id, team2Id)
    .completedOnly()
    .limit(10)
    .build();
  
  const h2hResponse = await fetch(
    `http://localhost:3001/api/flashscore/games/list${h2hQuery.toUrl()}`
  );
  const h2hData = await h2hResponse.json();
  
  // Последние матчи команды 1
  const team1Query = new QueryBuilder()
    .forTeam(team1Id)
    .completedOnly()
    .forLastDays(30)
    .limit(10)
    .build();
  
  const team1Response = await fetch(
    `http://localhost:3001/api/flashscore/games/list${team1Query.toUrl()}`
  );
  const team1Data = await team1Response.json();
  
  // Аналогично для команды 2
  const team2Query = new QueryBuilder()
    .forTeam(team2Id)
    .completedOnly()
    .forLastDays(30)
    .limit(10)
    .build();
  
  const team2Response = await fetch(
    `http://localhost:3001/api/flashscore/games/list${team2Query.toUrl()}`
  );
  const team2Data = await team2Response.json();
  
  return {
    headToHead: {
      totalMatches: h2hData.count,
      recentGames: h2hData.data
    },
    team1Form: analyzeForm(team1Data.data, team1Id),
    team2Form: analyzeForm(team2Data.data, team2Id)
  };
}

function analyzeForm(games, teamId) {
  let form = '';
  let points = 0;
  
  games.slice(0, 5).reverse().forEach(game => {
    const isHome = game.homeTeam.id === teamId;
    const scored = isHome ? game.homeResult : game.awayResult;
    const conceded = isHome ? game.awayResult : game.homeResult;
    
    if (scored > conceded) {
      form += 'W';
      points += 3;
    } else if (scored === conceded) {
      form += 'D';
      points += 1;
    } else {
      form += 'L';
    }
  });
  
  return { form, points, games: games.length };
}
```

### Use Case 5: Экспорт данных в CSV

```javascript
async function exportMatchesToCSV(filters) {
  const query = new QueryBuilder();
  
  // Применение фильтров
  if (filters.leagueId) query.forLeague(filters.leagueId);
  if (filters.dateFrom && filters.dateTo) {
    query.forDateRange(filters.dateFrom, filters.dateTo);
  }
  if (filters.completed) query.completedOnly();
  
  query.limit(1000);
  
  const response = await fetch(
    `http://localhost:3001/api/flashscore/games/list${query.toUrl()}`
  );
  const data = await response.json();
  
  // Конвертация в CSV
  const csv = [
    'Date,Home Team,Away Team,Home Score,Away Score,Status,League'
  ];
  
  data.data.forEach(game => {
    csv.push([
      game.date,
      game.homeTeam.name,
      game.awayTeam.name,
      game.homeResult || 'N/A',
      game.awayResult || 'N/A',
      game.status,
      game.season.league.name
    ].join(','));
  });
  
  return csv.join('\n');
}

// Экспорт матчей Premier League за месяц
exportMatchesToCSV({
  leagueId: 'england/premier-league',
  dateFrom: '2026-01-01',
  dateTo: '2026-01-31',
  completed: true
}).then(csv => {
  console.log(csv);
  // Сохранить в файл
  require('fs').writeFileSync('premier-league-january.csv', csv);
});
```

---

## 📊 Статистика и метрики

### Получение статистики API

```bash
curl "http://localhost:3001/api/flashscore/health"
```

**Ответ:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-31T08:51:31.648Z",
  "uptime": 25.677847258,
  "clientMetrics": {
    "totalRequests": 10,
    "successfulRequests": 10,
    "failedRequests": 0,
    "averageResponseTime": 338.9
  }
}
```

---

## 🧪 Тестирование

### Запуск автоматических тестов

```bash
# Тесты Flashscore API
node tests/manual/test-flashscore-api.js

# Результат:
# ✅ Passed: 9
# ❌ Failed: 0
# ⏱️ Execution time: 8,282 ms
```

---

## 📚 Дополнительные ресурсы

- **Swagger документация**: http://localhost:3001/docs
- **QUERY_BUILDER_SYSTEM_GUIDE.md**: Полное руководство по Query Builder
- **FLASHSCORE_API_GUIDE.md**: Руководство по Flashscore API
- **FLASHSCORE_API_TEST_REPORT.md**: Отчет о тестировании

---

## 🎓 Лучшие практики

1. **Используйте Query Builder** для построения сложных запросов
2. **Кэшируйте результаты** для часто запрашиваемых данных
3. **Обрабатывайте ошибки** gracefully
4. **Используйте pagination** для больших наборов данных
5. **Соблюдайте rate limits** (300 запросов/минуту)

---

## 💡 Советы по оптимизации

1. **Limit параметр**: Используйте минимально необходимое значение
2. **Фильтры**: Комбинируйте фильтры для точных результатов
3. **Кэширование**: Включайте кэширование на стороне клиента
4. **Батч-запросы**: Группируйте похожие запросы
5. **TimeZone**: Указывайте правильный часовой пояс

---

## 🚨 Обработка ошибок

```javascript
async function safeApiCall(url) {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'API returned unsuccessful response');
    }
    
    return data;
  } catch (error) {
    console.error('API call failed:', error.message);
    throw error;
  }
}
```

---

**Создано**: 2026-01-31  
**Версия**: 1.0.0  
**Статус**: ✅ Production Ready
