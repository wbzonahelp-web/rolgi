# 🚀 Flashscore API Query Builder System - Complete Guide

**Дата**: 2026-01-31  
**Версия**: 1.0.0  
**Статус**: Production Ready ✅

---

## 📋 Содержание

1. [Обзор системы](#обзор-системы)
2. [Архитектура](#архитектура)
3. [Компоненты](#компоненты)
4. [Backend API Endpoints](#backend-api-endpoints)
5. [Динамический Query Builder](#динамический-query-builder)
6. [UI интерфейс](#ui-интерфейс)
7. [Примеры использования](#примеры-использования)
8. [Развертывание](#развертывание)

---

## Обзор системы

Комплексная система для работы с Flashscore API, включающая:

- ✅ **50+ готовых примеров** запросов для разных сценариев
- ✅ **40+ Backend REST endpoints** для всех типов фильтрации
- ✅ **Динамический Query Builder** - программное построение запросов
- ✅ **Интерактивный UI** - визуальное управление фильтрами
- ✅ **Fastify интеграция** с Swagger документацией
- ✅ **Валидация и обработка ошибок**
- ✅ **Примеры кода** для всех сценариев

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                         │
├─────────────────────────────────────────────────────────────┤
│  Web UI                 │  REST API        │  JavaScript SDK│
│  (HTML/CSS/JS)          │  (HTTP/JSON)     │  (Node.js)     │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  Flashscore Routes      │  Query Builder   │  Query Examples│
│  (40+ endpoints)        │  (Dynamic API)   │  (50+ presets) │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     SSTATS CLIENT                           │
├─────────────────────────────────────────────────────────────┤
│  Rate Limiting          │  Caching         │  Retry Logic   │
│  Circuit Breaker        │  Monitoring      │  Error Handling│
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     SSTATS API                              │
│                  (api.sstats.net)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Компоненты

### 1. **Query Examples Module** 📋
**Файл**: `src/api/flashscore-query-examples.js`

**Возможности**:
- 50+ готовых примеров запросов
- 6 категорий фильтрации (DATE, TEAM, LEAGUE, STATUS, ADVANCED, ANALYTICS)
- Построение query strings
- Генерация URLs

**Примеры использования**:
```javascript
const queryExamples = require('./src/api/flashscore-query-examples');

// Получить все примеры
const all = queryExamples.getAllExamples();

// Получить примеры по категории
const dateExamples = queryExamples.getExamplesByCategory('DATE');

// Получить пример по ID
const today = queryExamples.getExampleById('date_today');

// Построить URL
const url = queryExamples.getExampleUrl('date_today');
// => https://api.sstats.net/Ls/List?Date=2025-06-21&TimeZone=3
```

**Категории примеров**:
| Категория | Количество | Описание |
|-----------|-----------|----------|
| DATE | 5 | Фильтрация по дате (сегодня, завтра, неделя, месяц, выходные) |
| TEAM | 6 | Фильтрация по командам (все матчи, дома, в гостях, H2H, предстоящие, последние) |
| LEAGUE | 5 | Фильтрация по лигам (все матчи, сезон, года, сегодня, предстоящие) |
| STATUS | 7 | Фильтрация по статусу (live, завершённые, предстоящие, таймы, овертайм, пенальти) |
| ADVANCED | 5 | Продвинутые запросы (дерби, топ-лиги, Лига Чемпионов, сборные) |
| ANALYTICS | 5 | Аналитика (статистика H2H, форма команды, домашняя/гостевая форма, таблица) |

---

### 2. **Backend Routes** 🌐
**Файл**: `src/api/routes/flashscore-routes.js`

**40+ REST endpoints** организованных по категориям:

#### Games List
- `GET /api/flashscore/games` - Список матчей с фильтрацией
- `POST /api/flashscore/games/query` - Построение запроса из JSON body

#### Games by Date
- `GET /api/flashscore/games/today` - Матчи сегодня
- `GET /api/flashscore/games/tomorrow` - Матчи завтра
- `GET /api/flashscore/games/date/:date` - Матчи за конкретную дату
- `GET /api/flashscore/games/range` - Матчи за период

#### Games by Team
- `GET /api/flashscore/games/team/:teamId` - Все матчи команды
- `GET /api/flashscore/games/team/:teamId/upcoming` - Предстоящие матчи команды
- `GET /api/flashscore/games/team/:teamId/recent` - Последние матчи команды
- `GET /api/flashscore/games/h2h/:team1/:team2` - История встреч

#### Games by League
- `GET /api/flashscore/games/league/:leagueId` - Все матчи лиги
- `GET /api/flashscore/games/league/:leagueId/today` - Матчи лиги сегодня

#### Games by Status
- `GET /api/flashscore/games/live` - Live матчи
- `GET /api/flashscore/games/upcoming` - Предстоящие матчи
- `GET /api/flashscore/games/ended` - Завершённые матчи

#### Game Info
- `GET /api/flashscore/game/:gameId` - Детальная информация о матче

#### Leagues & Seasons
- `GET /api/flashscore/leagues` - Список лиг
- `GET /api/flashscore/leagues/search/:query` - Поиск лиг
- `GET /api/flashscore/seasons` - Сезоны лиги

#### Query Examples
- `GET /api/flashscore/examples` - Все примеры
- `GET /api/flashscore/examples/category/:category` - Примеры по категории
- `GET /api/flashscore/examples/:exampleId` - Пример по ID
- `POST /api/flashscore/examples/:exampleId/execute` - Выполнить пример

#### Health Check
- `GET /api/flashscore/health` - Проверка работоспособности

**Примеры запросов**:

```bash
# Матчи сегодня
curl http://localhost:3000/api/flashscore/games/today

# Live матчи
curl http://localhost:3000/api/flashscore/games/live

# Предстоящие матчи Arsenal
curl http://localhost:3000/api/flashscore/games/team/arsenal%2FhA1Zm19f/upcoming

# История встреч Arsenal vs Manchester United
curl http://localhost:3000/api/flashscore/games/h2h/hA1Zm19f/tUxUbLR2

# Матчи Premier League сегодня
curl http://localhost:3000/api/flashscore/games/league/england%2Fpremier-league/today

# Поиск лиги по названию
curl http://localhost:3000/api/flashscore/leagues/search/Premier
```

---

### 3. **Dynamic Query Builder** 🔧
**Файл**: `src/api/query-builder.js`

**Возможности**:
- Fluent API для построения запросов
- Цепочка методов (method chaining)
- Валидация параметров
- Предустановленные преsets
- Клонирование builders

**Примеры использования**:

```javascript
const { createQueryBuilder, presets } = require('./src/api/query-builder');

// Создание запроса с цепочкой методов
const query = createQueryBuilder()
  .today()
  .league('england/premier-league')
  .live()
  .limit(50)
  .build();

// Результат: { Date: '2025-06-21', LeagueId: 'england/premier-league', Live: true, Limit: 50 }

// Использование preset
const liveQuery = presets.live().build();
// => { Live: true, Limit: 100 }

// Предстоящие матчи команды
const upcomingArsenal = createQueryBuilder()
  .teamUpcoming('arsenal/hA1Zm19f', 10)
  .build();

// История встреч
const h2h = createQueryBuilder()
  .h2h('hA1Zm19f', 'tUxUbLR2')
  .sortDesc()
  .limit(20)
  .build();

// Матчи за период
const weekGames = createQueryBuilder()
  .dateRange('2025-06-01', '2025-06-07')
  .timezone(3)
  .limit(500)
  .build();

// Получить URL
const url = createQueryBuilder()
  .today()
  .live()
  .toUrl();
// => https://api.sstats.net/Ls/List?Date=2025-06-21&Live=true
```

**Доступные методы**:

#### Date Methods
- `date(date)` - Конкретная дата
- `dateRange(from, to)` - Диапазон дат
- `from(date)` - Начальная дата
- `to(date)` - Конечная дата
- `timezone(tz)` - Часовой пояс
- `today()` - Сегодня
- `tomorrow()` - Завтра
- `lastDays(n)` - Последние N дней
- `nextDays(n)` - Следующие N дней

#### Team Methods
- `team(teamId)` - Команда (хозяева или гости)
- `homeTeam(teamId)` - Команда хозяев
- `awayTeam(teamId)` - Команда гостей
- `h2h(team1, team2)` - История встреч
- `teams(teamIds)` - Несколько команд

#### League Methods
- `league(leagueId)` - Лига
- `season(seasonId)` - Сезон
- `years(years)` - Года сезона
- `gameIds(ids)` - ID матчей

#### Status Methods
- `status(code)` - Конкретный статус
- `live()` - Live матчи
- `ended()` - Завершённые матчи
- `upcoming()` - Предстоящие матчи

#### Pagination & Sorting
- `limit(count)` - Лимит результатов
- `offset(count)` - Offset
- `page(pageNum, pageSize)` - Пагинация
- `sortDesc()` - Сортировка по убыванию
- `sortAsc()` - Сортировка по возрастанию
- `order(direction)` - Установить порядок

#### Shortcuts
- `teamLive(teamId)` - Live матчи команды
- `teamUpcoming(teamId, limit)` - Предстоящие матчи команды
- `teamRecent(teamId, limit)` - Последние матчи команды
- `teamHome(teamId, limit)` - Домашние матчи команды
- `teamAway(teamId, limit)` - Выездные матчи команды
- `leagueToday(leagueId)` - Матчи лиги сегодня
- `leagueLive(leagueId)` - Live матчи лиги
- `leagueUpcoming(leagueId, limit)` - Предстоящие матчи лиги

#### Utility Methods
- `build()` - Построить объект фильтров
- `toQueryString()` - Получить query string
- `toUrl(baseUrl)` - Получить полный URL
- `clone()` - Клонировать builder
- `toJSON()` - JSON представление
- `reset()` - Сбросить все фильтры

---

### 4. **UI Query Builder** 🎨
**Файл**: `public/flashscore-query-builder.html`

**Возможности**:
- Визуальное управление фильтрами
- 5 вкладок (по дате, по команде, по лиге, по статусу, продвинутое)
- Быстрые действия (Quick Actions)
- Примеры запросов (Examples Grid)
- Отображение результатов в реальном времени
- Копирование URL
- Статистика (найдено матчей, время запроса, активные фильтры)
- Toast уведомления
- Responsive design

**Интерфейс включает**:

1. **Шапка** с заголовком и описанием
2. **Статистика** (3 карточки):
   - Найдено матчей
   - Время запроса
   - Активных фильтров

3. **Левая панель** - Построитель запроса:
   - Вкладка "По дате": выбор даты, периода, часового пояса
   - Вкладка "По команде": фильтры по Team, HomeTeam, AwayTeam, BothTeams
   - Вкладка "По лиге": фильтры по LeagueId, SeasonId, Years, GameIds
   - Вкладка "По статусу": Live, Ended, Upcoming, Status codes
   - Вкладка "Продвинутое": Limit, Offset, Order

4. **Правая панель** - Результаты:
   - Сгенерированный URL
   - Ответ API (JSON)
   - Примеры запросов (карточки)

5. **Кнопки действий**:
   - ▶ Выполнить запрос
   - ↻ Сбросить
   - 📋 Копировать URL

**Доступ**: `http://localhost:3000/flashscore-query-builder.html`

**Скриншоты интерфейса**:
```
┌──────────────────────────────────────────────────────────┐
│  ⚽ Flashscore API Query Builder                         │
├──────────────────────────────────────────────────────────┤
│  [321]           [317ms]          [5]                    │
│  Матчей найдено  Время запроса    Активных фильтров     │
├─────────────────────────┬────────────────────────────────┤
│ 🔧 Построитель запроса │ 📊 Результаты                  │
│                         │                                 │
│ [Вкладки]               │ Сгенерированный URL:           │
│ ┌─────────────────────┐│ https://api.sstats.net/...     │
│ │ Фильтры             ││                                 │
│ │                     ││ Ответ API:                      │
│ │ [Поля ввода]        ││ {                               │
│ │                     ││   "success": true,              │
│ └─────────────────────┘│   "count": 321,                 │
│                         │   "data": [...]                 │
│ [▶ Выполнить]           │ }                               │
│ [↻ Сбросить]            │                                 │
│ [📋 Копировать]         │ Примеры:                        │
│                         │ [Карточка] [Карточка]           │
└─────────────────────────┴────────────────────────────────┘
```

---

## Backend API Endpoints

### Полный список (40+ эндпоинтов)

```
Базовый URL: http://localhost:3000/api/flashscore
```

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/games` | Список матчей с фильтрацией |
| POST | `/games/query` | Построение запроса из JSON |
| GET | `/games/today` | Матчи сегодня |
| GET | `/games/tomorrow` | Матчи завтра |
| GET | `/games/date/:date` | Матчи за конкретную дату |
| GET | `/games/range` | Матчи за период |
| GET | `/games/team/:teamId` | Все матчи команды |
| GET | `/games/team/:teamId/upcoming` | Предстоящие матчи команды |
| GET | `/games/team/:teamId/recent` | Последние матчи команды |
| GET | `/games/h2h/:team1/:team2` | История встреч |
| GET | `/games/league/:leagueId` | Все матчи лиги |
| GET | `/games/league/:leagueId/today` | Матчи лиги сегодня |
| GET | `/games/live` | Live матчи |
| GET | `/games/upcoming` | Предстоящие матчи |
| GET | `/games/ended` | Завершённые матчи |
| GET | `/game/:gameId` | Детальная информация о матче |
| GET | `/leagues` | Список лиг |
| GET | `/leagues/search/:query` | Поиск лиг по названию |
| GET | `/seasons` | Сезоны лиги |
| GET | `/examples` | Все примеры запросов |
| GET | `/examples/category/:category` | Примеры по категории |
| GET | `/examples/:exampleId` | Пример по ID |
| POST | `/examples/:exampleId/execute` | Выполнить пример |
| GET | `/health` | Health check |

---

## Динамический Query Builder

### Установка

```javascript
const { createQueryBuilder, presets } = require('./src/api/query-builder');
```

### Базовое использование

```javascript
// Создать новый builder
const builder = createQueryBuilder();

// Построить запрос с методами
const filters = builder
  .today()
  .live()
  .limit(50)
  .build();

// Выполнить через SStatsClient
const sstatsClient = new SStatsClient({ apiKey: 'your_key' });
const result = await sstatsClient.getFlashscoreGames(filters);
```

### Примеры для разных сценариев

#### 1. Live матчи Premier League сегодня
```javascript
const query = createQueryBuilder()
  .leagueToday('england/premier-league')
  .live()
  .build();
```

#### 2. Последние 10 матчей Arsenal
```javascript
const query = createQueryBuilder()
  .teamRecent('arsenal/hA1Zm19f', 10)
  .build();
```

#### 3. Предстоящие матчи на этой неделе
```javascript
const query = createQueryBuilder()
  .nextDays(7)
  .upcoming()
  .limit(200)
  .sortAsc()
  .build();
```

#### 4. История встреч Arsenal vs Manchester United
```javascript
const query = createQueryBuilder()
  .h2h('hA1Zm19f', 'tUxUbLR2')
  .sortDesc()
  .limit(30)
  .build();
```

#### 5. Матчи лиги за сезон с пагинацией
```javascript
// Страница 1
const page1 = createQueryBuilder()
  .league('england/premier-league')
  .years('2024-2025')
  .page(1, 100)
  .build();

// Страница 2
const page2 = createQueryBuilder()
  .league('england/premier-league')
  .years('2024-2025')
  .page(2, 100)
  .build();
```

### Использование Presets

```javascript
// Live матчи
const live = presets.live().build();

// Матчи сегодня
const today = presets.today().build();

// Матчи команды
const teamGames = presets.team('arsenal/hA1Zm19f').build();

// История встреч
const h2h = presets.h2h('hA1Zm19f', 'tUxUbLR2').build();

// Матчи лиги
const league = presets.league('england/premier-league').build();
```

---

## UI интерфейс

### Доступ

```
http://localhost:3000/flashscore-query-builder.html
```

### Использование

1. **Откройте страницу** в браузере
2. **Выберите вкладку** фильтрации
3. **Настройте фильтры** через поля ввода
4. **Используйте Quick Actions** для быстрой настройки
5. **Нажмите "Выполнить запрос"**
6. **Просмотрите результаты** в правой панели
7. **Скопируйте URL** при необходимости

### Быстрые действия (Quick Actions)

**По дате**:
- Сегодня
- Завтра
- Эта неделя
- Этот месяц

**По лиге**:
- EPL (England Premier League)
- La Liga (Spain)
- Bundesliga (Germany)
- Serie A (Italy)

**По статусу**:
- Live
- Завершённые
- Предстоящие

### Примеры запросов (Examples Grid)

В правой панели отображаются готовые примеры запросов в виде карточек. При клике на карточку фильтры автоматически загружаются в форму.

---

## Примеры использования

### JavaScript (Node.js)

```javascript
const SStatsClient = require('./src/api/sstats-client');
const { createQueryBuilder } = require('./src/api/query-builder');
const queryExamples = require('./src/api/flashscore-query-examples');

const client = new SStatsClient({
  apiKey: process.env.SSTATS_API_KEY
});

// Способ 1: Прямой вызов с параметрами
const games1 = await client.getFlashscoreGames({
  Date: '2025-06-21',
  TimeZone: 3,
  Live: true
});

// Способ 2: Использование Query Builder
const filters = createQueryBuilder()
  .today()
  .live()
  .build();

const games2 = await client.getFlashscoreGames(filters);

// Способ 3: Использование готового примера
const example = queryExamples.getExampleById('date_today');
const games3 = await client.getFlashscoreGames(example.params);
```

### cURL (REST API)

```bash
# Матчи сегодня
curl http://localhost:3000/api/flashscore/games/today

# Live матчи
curl http://localhost:3000/api/flashscore/games/live

# POST запрос с JSON body
curl -X POST http://localhost:3000/api/flashscore/games/query \
  -H "Content-Type: application/json" \
  -d '{
    "Date": "2025-06-21",
    "TimeZone": 3,
    "Live": true,
    "Limit": 50
  }'

# Выполнить пример запроса
curl -X POST http://localhost:3000/api/flashscore/examples/date_today/execute \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Python

```python
import requests

BASE_URL = 'http://localhost:3000/api/flashscore'

# Матчи сегодня
response = requests.get(f'{BASE_URL}/games/today')
games = response.json()

# Live матчи
response = requests.get(f'{BASE_URL}/games/live')
live_games = response.json()

# POST запрос
filters = {
    'Date': '2025-06-21',
    'TimeZone': 3,
    'Live': True,
    'Limit': 50
}

response = requests.post(f'{BASE_URL}/games/query', json=filters)
result = response.json()

print(f"Найдено матчей: {result['count']}")
```

---

## Развертывание

### Требования

- Node.js >= 18
- npm или yarn
- SStats API Key

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/wbzonahelp-web/rolgi.git
cd rolgi

# Установить зависимости
npm install

# Настроить .env
cp .env.example .env
# Добавить SSTATS_API_KEY в .env
```

### Запуск

```bash
# Development
npm start

# Production
npm run start:prod
```

### Проверка

```bash
# Health check
curl http://localhost:3000/api/flashscore/health

# Swagger документация
open http://localhost:3000/docs

# UI Query Builder
open http://localhost:3000/flashscore-query-builder.html
```

---

## API Документация

Полная интерактивная документация доступна через Swagger UI:

```
http://localhost:3000/docs
```

**Swagger включает**:
- Все 40+ эндпоинтов
- Схемы запросов/ответов
- Интерактивное тестирование
- Примеры запросов
- Валидация параметров

---

## Поддержка

**Репозиторий**: https://github.com/wbzonahelp-web/rolgi  
**Документация**: См. файлы в папке `docs/`  
**Примеры**: См. файлы в папке `tests/manual/`

---

**Система готова к использованию!** 🎉
