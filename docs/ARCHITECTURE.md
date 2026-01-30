# АРХИТЕКТУРА ПРОЕКТА SSTATS ANALYTICS PLATFORM V6.0

## Оглавление
1. [Обзор системы](#обзор-системы)
2. [Три железных замка](#три-железных-замка)
3. [Структура базы данных](#структура-базы-данных)
4. [API и интеграции](#api-и-интеграции)
5. [Data Loader Pipeline](#data-loader-pipeline)
6. [Мониторинг и самовосстановление](#мониторинг-и-самовосстановление)
7. [Frontend архитектура](#frontend-архитектура)
8. [Критичные компоненты защиты](#критичные-компоненты-защиты)
9. [Memory Protocol](#memory-protocol)
10. [Deployment и безопасность](#deployment-и-безопасность)

---

## Обзор системы

**SStats Analytics Platform v6.0** — комплексная система аналитики футбольных матчей с интеграцией внешних API (SStats.net, Flashscore), автоматизированной загрузкой данных, системой мониторинга и self-healing механизмами.

### Ключевые принципы

- **Fail Fast** — раннее обнаружение ошибок
- **Single Source of Truth** — единый источник истины для схемы, эндпоинтов, ключей
- **Cursor-based Resume** — возобновление после сбоев
- **Self-healing** — автоматическое восстановление от ошибок
- **Contract-driven** — разработка на основе контрактов (OpenAPI, JSDoc)

### Технологический стек

- **Backend:** Node.js 18+, Fastify
- **Database:** PostgreSQL 14+ (партиционирование, индексы)
- **Frontend:** Vanilla JS (ES Modules), Proxy-based State Management
- **Monitoring:** Custom Tracer + Error Collector + OpenTelemetry
- **Testing:** Jest (unit), Dredd (contract), Playwright (E2E)
- **CI/CD:** GitHub Actions, Docker

---

## Три железных замка

### 1. Schema Lock (`/src/database/schema-lock.js`)

**Назначение:** Предотвращение дрейфа схемы БД без явного обновления

**Компоненты:**
- Lock-файл: `./memories/schema.lock.json`
- Schema-файл: `./src/database/schema/postgres/001_init.sql`
- SHA256 хэш схемы
- Список таблиц и количество колонок
- История обновлений

**Функции:**
```javascript
createLock()           // Создать lock-файл
verifyLock()          // Проверить соответствие
updateLock(reason)    // Обновить с комментарием
getLockInfo()         // Получить информацию
```

**Проверка:** При каждом запуске `server.js`

---

### 2. Endpoint Lock (`/src/api/endpoint-lock.js`)

**Назначение:** Защита от изобретения несуществующих API-путей

**Компоненты:**
- Манифест: `./src/api/sstats-endpoints.manifest.json`
- 37+ задокументированных эндпоинтов
- Параметры, типы ответов, rate limiting

**Функции:**
```javascript
assertAllowedEndpoint(path)    // Выброс ошибки если путь не найден
getEndpointMetadata(path)      // Получить метаданные эндпоинта
listEndpoints()                // Список всех эндпоинтов
```

**Категории эндпоинтов:**
- Account (1): `/Account/Info`
- Games (9): `/Games/list`, `/Games/{id}`, `/Games/glicko/{id}`, и др.
- Leagues (1): `/Leagues`
- Teams (2): `/Teams/list`, `/Teams/{id}`
- Players (3): `/Players/find`, `/Players/{id}`, `/Players/{id}/events`
- Odds (7): bookmakers, prematch, live, changes
- Seasons (1): `/Seasons/standings`
- Ls (5): Flashscore endpoints
- Excel (3): Delux, FootballCalc, Results

---

### 3. UPSERT Keys Lock (`/src/database/upsert-keys.js`)

**Назначение:** Единый источник истины для UPSERT-ключей

**Компоненты:**
- Манифест ключей для каждой таблицы
- Соответствие UNIQUE constraints в БД
- Генератор SQL для UPSERT

**Функции:**
```javascript
getUpsertKeys(tableName)              // Получить ключи для таблицы
generateUpsertSQL(table, data)        // Сгенерировать SQL
validateUpsertData(table, data)       // Валидация данных
getUpsertKeyInfo(table)               // Информация о ключах
```

**Пример ключей:**
- `leagues`: `['sstats_id']`
- `teams`: `['sstats_id']`
- `games`: `['sstats_id']`
- `odds_prematch`: `['game_id', 'bookmaker_id', 'market_id', 'selection']`

---

## Структура базы данных

### Таблицы (22 шт.)

#### Справочники (Level 0)
- `countries` — страны
- `bookmakers` — букмекеры

#### Сущности (Level 1)
- `leagues` — лиги
- `seasons` — сезоны
- `teams` — команды
- `players` — игроки

#### Матчи (Level 2)
- `games` — **PARTITIONED** по годам (2020-2027 + future)
- `game_statistics` — статистика матчей
- `game_events` — события (голы, карточки)
- `game_lineups` — составы
- `game_player_stats` — статистика игроков в матчах

#### Коэффициенты (Level 2)
- `odds_prematch` — прематч коэффициенты
- `odds_live` — live коэффициенты

#### Аналитика (Level 3)
- `game_glicko` — рейтинги Glicko
- `standings` — турнирные таблицы

#### Мониторинг (Level 4)
- `error_log` — логи ошибок
- `trace_log` — распределённая трассировка
- `performance_metrics` — метрики производительности
- `sync_log` — лог синхронизаций
- `loader_runs` — запуски загрузчика
- `loader_step_results` — результаты шагов
- `loader_cursors` — курсоры для возобновления

### Партиционирование

**Таблица `games`** разбита по годам:

```sql
-- games_2020, games_2021, games_2022, games_2023,
-- games_2024, games_2025, games_2026, games_2027,
-- games_future
```

**Генератор партиций:** DO $$ блок в `001_init.sql`

### Индексы

**Критичные индексы:**
- `sstats_id`, `flashscore_id` (уникальные)
- Foreign Keys (все внешние ключи)
- Составные: `(league_id, season)`, `(team_id, date)`, `(status, date)`
- GIN для JSONB полей
- Partial индексы для live матчей

---

## API и интеграции

### Внешний API: SStats.net

**Base URL:** `https://api.sstats.net`

**Аутентификация:** Bearer token в `Authorization` header

**Rate Limiting:** 300 запросов/минута с ключом

**37+ эндпоинтов** в категориях:
- Account, Games, Leagues, Teams, Players, Odds, Seasons, Ls (Flashscore), Excel

**Пример запроса:**
```javascript
GET /Games/list?leagueId=123&season=2024&status=finished
Authorization: Bearer YOUR_API_KEY
```

**Пример ответа:**
```json
{
  "status": "success",
  "data": [...],
  "cursor": "eyJ...",
  "pagination": {
    "total": 1500,
    "page": 1,
    "limit": 100
  }
}
```

---

### Внутренний API: Backend (OpenAPI 3.1.0)

**Base URL:** `http://localhost:3000/api/v1` (dev)

**Спецификация:** `/specs/openapi.yaml`

**50+ эндпоинтов:**

#### Health
- `GET /health` — общий статус
- `GET /health/ready` — готовность к работе
- `GET /health/live` — liveness probe

#### Games
- `GET /games` — список матчей
- `GET /games/live` — live матчи
- `GET /games/today` — матчи сегодня
- `GET /games/{id}` — детали матча
- `GET /games/{id}/statistics` — статистика
- `GET /games/{id}/events` — события
- `GET /games/{id}/lineups` — составы
- `GET /games/{id}/glicko` — Glicko рейтинги
- `GET /games/{id}/odds` — коэффициенты
- `GET /games/h2h` — head-to-head

#### Teams
- `GET /teams` — список команд
- `GET /teams/{id}` — детали команды

#### Leagues
- `GET /leagues` — список лиг
- `GET /leagues/{id}` — детали лиги
- `GET /leagues/{id}/standings` — таблица

#### Players
- `GET /players` — список игроков
- `GET /players/{id}` — детали игрока

#### Analytics
- `GET /analytics/predictions` — предсказания
- `GET /analytics/trends` — тренды

#### Loader (Admin)
- `GET /loader/status` — статус загрузчика
- `POST /loader/run` — запустить загрузку
- `POST /loader/resume` — возобновить

#### Monitoring (Admin)
- `GET /monitoring/errors` — ошибки
- `GET /monitoring/traces` — трассировка
- `GET /monitoring/metrics` — метрики
- `POST /monitoring/export-ai` — экспорт для AI

**Security:**
- Public endpoints: нет авторизации, 100 req/min
- Admin endpoints: `X-Admin-Key`, 30 req/min

---

## Data Loader Pipeline

### 13 шагов загрузки (Orders 100-800)

| Order | Step | Description |
|-------|------|-------------|
| 100 | bookmakers | Справочник букмекеров |
| 110 | odds-markets-prematch | Рынки прематч |
| 111 | odds-markets-live | Рынки live |
| 200 | leagues | Лиги |
| 300 | teams | Команды |
| 400 | games-list | Список матчей (сезон) |
| 410 | games-live-list | Live матчи |
| 420 | games-today | Матчи сегодня |
| 500 | game-details | Детали матча |
| 600 | game-glicko | Glicko рейтинги |
| 700 | odds-prematch | Прематч коэффициенты |
| 710 | odds-live | Live коэффициенты |
| 800 | standings | Турнирные таблицы |

### Режимы работы

1. **Full Load** — полная загрузка всех данных
2. **Incremental Load** — только новые/изменённые
3. **Live Load** — постоянное обновление live-данных

### Итерация и пагинация

**Итерация по:**
- Лигам (leagues)
- Сезонам (seasons)
- Матчам (games)

**Курсоры:**
```javascript
{
  step: 'game-details',
  leagueId: 123,
  season: 2024,
  lastGameId: 456789,
  processedCount: 250,
  totalCount: 1500
}
```

### Transformers (9 шт.)

- `transformLeague(raw)` → normalized
- `transformTeam(raw)` → normalized
- `transformGame(raw)` → normalized
- `transformGameDetails(raw)` → normalized
- `transformGlicko(raw)` → normalized
- `transformOdds(raw)` → normalized
- `transformStandings(raw)` → normalized
- `transformPlayer(raw)` → normalized
- `transformEvent(raw)` → normalized

### Validators (5 шт.)

- `validateLeague(data)`
- `validateTeam(data)`
- `validateGame(data)`
- `validateGameDetails(data)`
- `validateGlicko(data)`

**Принцип:** Fail fast — немедленный выброс ошибки при невалидных данных

### Loader State Machine

**Файл:** `/src/loader/engine/loader-state.js`

**Advisory Lock ID:** `20260108`

**Методы:**
```javascript
startRun(mode, params)           // Начать новый запуск
getOrCreateStep(runId, stepName) // Получить/создать шаг
updateCursor(stepId, cursor)     // Обновить курсор
markStepComplete(stepId, stats)  // Завершить шаг
finishRun(runId, status)         // Завершить запуск
resumeRun(runId)                 // Возобновить после сбоя
getRunsSummary(limit)            // Получить историю
```

**Состояния:**
- `pending` — ожидание
- `running` — в процессе
- `paused` — приостановлен
- `completed` — завершён
- `failed` — провален
- `resumed` — возобновлён

---

## Мониторинг и самовосстановление

### Distributed Tracer v6.0

**Файл:** `/src/monitoring/tracer.js`

**Назначение:** Распределённая трассировка всех операций

**Типы операций:**
- `http_request` — HTTP запросы
- `api_call` — вызовы внешних API
- `db_query` — запросы к БД
- `function` — вызовы функций
- `cache` — операции с кэшем
- `external` — внешние сервисы

**Статусы:**
- `success`, `error`, `timeout`, `cancelled`

**Методы:**
```javascript
startSpan(name, type, metadata)
startHttpSpan(method, url)
startApiSpan(endpoint, params)
startDbSpan(query, params)
trace(name, fn)
tracePromise(name, promise)
recordMetric(name, value, unit)
startTimer(name)
getTrace(traceId)
getSlowOperations(threshold, hours)
getErrorStats(hours)
cleanup(daysToKeep)
```

**Батч-запись:**
- Буфер: 100 spans
- Flush: каждые 5 секунд
- Немедленный flush для критичных операций

**Интеграция:**
- Таблица `trace_log`
- Таблица `performance_metrics`
- EventEmitter: `spanFinished`
- Глобальный инстанс `globalTracer`

---

### Error Collector v6.0

**Файл:** `/src/monitoring/error-collector.js`

**Назначение:** Централизованный сбор и управление ошибками

**Классификация:**

**Severity:**
- `CRITICAL` — критичные (требуют немедленного внимания)
- `ERROR` — ошибки (требуют исправления)
- `WARNING` — предупреждения (требуют проверки)
- `INFO` — информационные

**Category:**
- `API` — ошибки API
- `DATABASE` — ошибки БД
- `VALIDATION` — ошибки валидации
- `LOADER` — ошибки загрузчика
- `FRONTEND` — ошибки фронтенда
- `SYSTEM` — системные ошибки
- `EXTERNAL` — внешние сервисы

**Методы:**
```javascript
collect(errorData)
collectError(error, context)
collectApiError(endpoint, error, params)
collectDbError(query, error, params)
collectFrontendError(error, context)
subscribe(callback)
onCritical(callback)
getRecent(limit, filters)
getStatistics(hours)
resolve(errorId, resolution)
exportForAI()
```

**Self-healing:**
- Дедупликация (окно 60 секунд)
- Группировка по паттернам
- Рекомендации через `_generateRecommendations()`
- Action Items для AI
- AI Export с полным контекстом

**Батчинг:**
- Буфер: 50 записей
- Flush: каждую 1 секунду
- Немедленный flush для критичных

**База данных:**
```sql
error_log (
  error_id, severity, category, source,
  message, stack_trace, trace_id,
  url, method, params,
  function_name, file_name, line_number,
  is_resolved, resolved_at, resolved_by,
  resolution_notes, created_at
)
```

---

### Frontend Error Tracker

**Файл:** `/static/js/error-tracker.js`

**Назначение:** Клиентская трассировка и сбор ошибок

**Функции:**
- `collect(errorData)` — собрать ошибку
- `collectError(error, context)` — собрать с контекстом
- Автоматический перехват `console.error`
- Батч-отправка на сервер
- Breadcrumbs (до 50)
- Web Vitals (LCP, FID, CLS)

**Трассировка:**
```javascript
startTrace(name)
endTrace(name, data)
trace(name, fn)
```

**Экспорт:**
```javascript
exportDebugData()
downloadDebugData()
```

**Отправка на сервер:**
- `/monitoring/errors/batch`
- `/monitoring/metrics/batch`
- Retry при ошибках

---

## Frontend архитектура

### SStatsApp v6.0

**Файл:** `/static/js/app.js`

**Архитектура:** Модульная SPA с ES Modules

**Основные сервисы:**
- `ApiClient` — HTTP клиент с кэшированием
- `StateManager` — Proxy-based state management
- `Router` — клиентская навигация
- `ErrorTracker` — трассировка ошибок
- `Toast` — уведомления

**Компоненты (11 шт.):**
- `MonitoringPanel` — панель мониторинга
- `LiveCenter` — live матчи
- `GamesTable` — таблица матчей
- `GlickoRankings` — рейтинги
- `TeamDetails` — детали команды
- `LeagueStandings` — турнирная таблица
- `LoaderStatus` — статус загрузчика
- `FilterPanel` — панель фильтров
- `DevConsole` — консоль разработчика
- `Toast` — всплывающие уведомления
- `LoadingIndicator` — индикатор загрузки

**Конфигурация:**
```javascript
const CONFIG = Object.freeze({
  API_BASE_URL: '/api/v1',
  WS_URL: 'ws://localhost:3000/ws',
  REFRESH_INTERVALS: {
    LIVE: 30000,      // 30 секунд
    STANDARD: 60000,  // 1 минута
    SLOW: 300000      // 5 минут
  },
  DEBUG: false,
  VERSION: '6.0.0'
});
```

**Инициализация:**
1. Регистрация глобальных обработчиков ошибок
2. Инициализация error tracker
3. Health check API (`/health`)
4. Загрузка начальных данных (`/leagues`, `/loader/status`)
5. Инициализация фильтров
6. Регистрация компонентов
7. Конфигурация роутера
8. Инициализация UI (навигация, тема, иконки)
9. Монтирование панелей
10. Старт роутера
11. DevConsole (в debug режиме)

**Роуты:**
```javascript
'/' → LiveCenter
'/live' → LiveCenter
'/games' → GamesTable
'/games/:id' → GameDetails
'/rankings' → GlickoRankings
'/teams/:id' → TeamDetails
'/leagues/:id' → LeagueStandings
'/loader' → LoaderStatus
'/monitoring' → MonitoringPanel
```

---

### ApiClient v6.0

**Файл:** `/static/js/api-client.js`

**Методы:** GET, POST, PUT, DELETE

**Возможности:**
- Retry с экспоненциальной задержкой (3 попытки)
- Timeout 30 секунд
- AbortController
- Трассировка запросов
- Кэширование с TTL

**TTL кэширования:**
- Live данные: **5 секунд**
- Default: **60 секунд**
- Standings: **300 секунд** (5 минут)
- Leagues: **3600 секунд** (1 час)

**Автоочистка:** при >500 записей

**События:**
```javascript
apiClient.on('request', (data) => {})
apiClient.on('response', (data) => {})
apiClient.on('error', (error) => {})
```

**ApiError методы:**
```javascript
isNetworkError()
isClientError()
isServerError()
isNotFound()
isUnauthorized()
isRateLimited()
```

**Статистика:**
```javascript
apiClient.getStats() // {
//   requests: 1250,
//   successful: 1200,
//   failed: 50,
//   cacheHits: 340,
//   avgResponseTime: 145
// }
```

---

### MonitoringPanel v6.0

**Файл:** `/static/js/components/monitoring-panel.js`

**Назначение:** Real-time панель системного мониторинга

**Функциональность:**
- Фильтры по severity (all, critical, error, warning)
- Фильтры по category (api, database, loader, frontend)
- Фильтры по времени (1h, 6h, 24h, 7d)
- Показать/скрыть resolved
- Кнопка Resolve
- Export for AI
- Вкладки: Errors, Traces, Metrics
- Автообновление каждые 30 секунд

**Quick Stats:**
- Critical count
- Errors count
- Warnings count
- Health status

**Детали ошибки:**
- Stack trace
- Request info (URL, method)
- Parameters (JSON)
- Breadcrumbs
- Кнопки: Details, Resolve, Copy

**UI:**
- Collapsed/expanded states
- Severity badges (цветные)
- Time ago (относительное время)
- Empty states (нет данных)

**Дизайн:**
- Cyberpunk тема
- Neon green (#39FF14)
- Lucide icons
- Pulse animation

---

## Критичные компоненты защиты

### 1. Table Dependencies Graph

**Файл:** `/src/database/table-dependencies.js`

**Назначение:** Граф зависимостей таблиц для правильного порядка загрузки

**Структура:**
```javascript
TABLE_DEPENDENCIES = {
  'countries': { level: 0, dependencies: [] },
  'bookmakers': { level: 0, dependencies: [] },
  'leagues': { level: 1, dependencies: ['countries'] },
  'teams': { level: 1, dependencies: ['countries'] },
  'games': { level: 2, dependencies: ['leagues', 'teams'] },
  'game_statistics': { level: 3, dependencies: ['games'] },
  'odds_prematch': { level: 3, dependencies: ['games', 'bookmakers'] },
  ...
}
```

**Функции:**
```javascript
getLoadOrder()              // → ['countries', 'bookmakers', 'leagues', ...]
validateDependencies()      // Проверить целостность графа
canLoadTable(tableName)     // Проверить загружены ли зависимости
getDependents(tableName)    // Получить зависимые таблицы
```

**Использование:**
```javascript
const order = getLoadOrder();
for (const table of order) {
  await loadTableData(table);
}
```

---

### 2. Response Type Contracts

**Файл:** `/src/api/response-types.js`

**Назначение:** Строгие JSDoc контракты для API-ответов

**Типы:**

```javascript
/**
 * @typedef {Object} SStatsApiResponse
 * @property {string} status - success/error
 * @property {*} data - Payload
 * @property {string} [cursor] - Pagination cursor
 * @property {Object} [pagination] - Pagination info
 */

/**
 * @typedef {Object} SStatsLeague
 * @property {number} id - SStats league ID
 * @property {string} name - League name
 * @property {number} countryId - Country ID
 * @property {string} logo - Logo URL
 * @property {boolean} isActive - Active status
 */

// + SStatsTeam, SStatsGameShort, SStatsGameFull,
//   SStatsOdds, SStatsPlayer, SStatsStandings, etc.
```

**Валидатор:**
```javascript
/**
 * @param {*} data - Data to validate
 * @param {string} typeName - Type name (e.g., 'SStatsLeague')
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateResponseStructure(data, typeName) {
  const schema = RESPONSE_SCHEMAS[typeName];
  const errors = [];
  
  for (const [field, config] of Object.entries(schema)) {
    if (config.required && !(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }
    if (field in data && typeof data[field] !== config.type) {
      errors.push(`Invalid type for ${field}: expected ${config.type}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Использование:**
```javascript
const response = await apiClient.get('/Leagues');
const { valid, errors } = validateResponseStructure(response.data, 'SStatsLeague');
if (!valid) {
  throw new ValidationError('Invalid API response', errors);
}
```

---

### 3. Error Recovery Playbook

**Файл:** `/src/monitoring/recovery-playbook.js`

**Назначение:** Автоматические стратегии восстановления от ошибок

**Структура:**
```javascript
RECOVERY_PLAYBOOK = {
  'DB_CONSTRAINT_VIOLATION': {
    severity: 'ERROR',
    description: 'Database constraint violation',
    steps: [
      'Log the violation details',
      'Skip the record and continue',
      'If FK violation, ensure dependencies loaded first'
    ],
    exampleCode: `...`
  },
  'API_401_UNAUTHORIZED': {
    severity: 'CRITICAL',
    description: 'API authentication failed',
    steps: [
      'Check if API key is valid',
      'Refresh token if using OAuth',
      'Alert admin if key expired'
    ],
    exampleCode: `...`
  },
  'API_429_RATE_LIMIT': {
    severity: 'WARNING',
    description: 'API rate limit exceeded',
    steps: [
      'Wait exponentially: 1min → 2min → 4min',
      'Log rate limit hit',
      'Continue from cursor after wait'
    ],
    exampleCode: `...`
  },
  'API_404_NOT_FOUND': {
    severity: 'INFO',
    description: 'Resource not found',
    steps: [
      'Mark resource as deleted/unavailable',
      'Continue with next item',
      'Log for audit trail'
    ]
  },
  'API_500_SERVER_ERROR': {
    severity: 'ERROR',
    description: 'External API server error',
    steps: [
      'Retry up to 3 times with backoff',
      'If still failing, alert admin',
      'Continue with next item'
    ]
  },
  'LOADER_STEP_FAILED': {
    severity: 'ERROR',
    description: 'Loader step failed',
    steps: [
      'Save cursor position',
      'Mark step as failed',
      'Resume from cursor on next run'
    ]
  },
  'SCHEMA_DRIFT_DETECTED': {
    severity: 'CRITICAL',
    description: 'Database schema changed unexpectedly',
    steps: [
      'HALT all operations immediately',
      'Alert admin',
      'Require manual schema lock update'
    ]
  }
};
```

**Функция:**
```javascript
function getRecoveryStrategy(errorType) {
  return RECOVERY_PLAYBOOK[errorType] || RECOVERY_PLAYBOOK['UNKNOWN_ERROR'];
}
```

**Использование:**
```javascript
try {
  await loadData();
} catch (error) {
  const strategy = getRecoveryStrategy(error.type);
  await executeRecoverySteps(strategy.steps);
  errorCollector.collect({
    category: 'LOADER',
    severity: strategy.severity,
    message: strategy.description,
    recovery: strategy.steps
  });
}
```

---

### 4. Pre-flight Checks

**Файл:** `/src/core/preflight-checks.js`

**Назначение:** Обязательные проверки перед запуском системы

**11 проверок:**

1. **Schema Lock Integrity**
   - Проверка SHA256 хэша схемы
   - Сравнение с lock-файлом

2. **Database Connection**
   - Проверка соединения с БД
   - Тест простого запроса

3. **Required Tables Exist**
   - Ожидается 22 таблицы
   - Проверка наличия каждой

4. **API Key Valid**
   - Тестовый вызов `/Account/Info`
   - Проверка статуса 200

5. **Endpoint Manifest Loaded**
   - Проверка файла манифеста
   - Валидность JSON

6. **Required Environment Variables**
   - `DATABASE_URL`
   - `SSTATS_API_KEY`
   - `NODE_ENV`
   - `PORT`

7. **Memory State Readable**
   - Проверка `./memories/schema.lock.json`
   - Валидность формата

8. **Node Version**
   - Требуется >= 18.0.0
   - Проверка `process.version`

9. **Disk Space**
   - Минимум 1GB свободного места
   - Проверка через `df` или API

10. **Port Available**
    - Порт 3000 не занят
    - Попытка bind

11. **Required NPM Packages**
    - Проверка `node_modules`
    - Критичные пакеты установлены

**Функция:**
```javascript
async function runPreflightChecks() {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  for (const check of CHECKS) {
    try {
      const result = await check.fn();
      if (result.passed) {
        results.passed.push(check.name);
      } else {
        if (check.critical) {
          results.failed.push({ name: check.name, error: result.error });
        } else {
          results.warnings.push({ name: check.name, error: result.error });
        }
      }
    } catch (error) {
      results.failed.push({ name: check.name, error: error.message });
    }
  }
  
  return results;
}
```

**Использование в `server.js`:**
```javascript
const preflightResults = await runPreflightChecks();

if (preflightResults.failed.length > 0) {
  console.error('❌ Pre-flight checks FAILED:');
  preflightResults.failed.forEach(f => {
    console.error(`  - ${f.name}: ${f.error}`);
  });
  process.exit(1);
}

if (preflightResults.warnings.length > 0) {
  console.warn('⚠️  Pre-flight warnings:');
  preflightResults.warnings.forEach(w => {
    console.warn(`  - ${w.name}: ${w.error}`);
  });
}

console.log('✅ Pre-flight checks passed!');
```

---

### 5. Game Status Map

**Файл:** `/src/core/game-status-map.js`

**Назначение:** Унифицированная карта статусов матчей

**SStats статусы:**
```javascript
const SSTATS_STATUS = {
  SCHEDULED: {
    value: 'scheduled',
    label: 'Scheduled',
    isLive: false,
    isFinished: false
  },
  LIVE: {
    value: 'live',
    label: 'Live',
    isLive: true,
    isFinished: false
  },
  FINISHED: {
    value: 'finished',
    label: 'Finished',
    isLive: false,
    isFinished: true
  },
  POSTPONED: {
    value: 'postponed',
    label: 'Postponed',
    isLive: false,
    isFinished: false
  },
  CANCELLED: {
    value: 'cancelled',
    label: 'Cancelled',
    isLive: false,
    isFinished: true
  },
  ABANDONED: {
    value: 'abandoned',
    label: 'Abandoned',
    isLive: false,
    isFinished: true
  }
};
```

**Flashscore статусы:**
```javascript
const FLASHSCORE_STATUS = {
  NS: { value: 'NS', label: 'Not Started', isLive: false, isFinished: false },
  '1H': { value: '1H', label: '1st Half', isLive: true, isFinished: false },
  HT: { value: 'HT', label: 'Half Time', isLive: true, isFinished: false },
  '2H': { value: '2H', label: '2nd Half', isLive: true, isFinished: false },
  FT: { value: 'FT', label: 'Full Time', isLive: false, isFinished: true },
  ET: { value: 'ET', label: 'Extra Time', isLive: true, isFinished: false },
  PEN: { value: 'PEN', label: 'Penalties', isLive: true, isFinished: false },
  AP: { value: 'AP', label: 'After Penalties', isLive: false, isFinished: true },
  AET: { value: 'AET', label: 'After Extra Time', isLive: false, isFinished: true },
  Postp: { value: 'Postp.', label: 'Postponed', isLive: false, isFinished: false },
  Cancl: { value: 'Cancl.', label: 'Cancelled', isLive: false, isFinished: true },
  Aban: { value: 'Aban.', label: 'Abandoned', isLive: false, isFinished: true },
  // ... ещё 5+ статусов
};
```

**Группы статусов:**
```javascript
const STATUS_GROUPS = {
  live: ['1H', '2H', 'HT', 'ET', 'PEN'],
  finished: ['FT', 'AP', 'AET'],
  upcoming: ['NS']
};
```

**Функции:**
```javascript
function getStatusInfo(status) {
  return SSTATS_STATUS[status] || FLASHSCORE_STATUS[status] || null;
}

function isLive(status) {
  const info = getStatusInfo(status);
  return info ? info.isLive : false;
}

function isFinished(status) {
  const info = getStatusInfo(status);
  return info ? info.isFinished : false;
}

function normalizeStatus(rawStatus) {
  // Flashscore → SStats mapping
  const mapping = {
    'NS': 'scheduled',
    '1H': 'live',
    '2H': 'live',
    'HT': 'live',
    'FT': 'finished',
    'Postp.': 'postponed',
    'Cancl.': 'cancelled',
    'Aban.': 'abandoned'
  };
  return mapping[rawStatus] || 'scheduled';
}
```

**Использование:**
```javascript
// В фильтрах фронтенда
const liveGames = games.filter(g => isLive(g.status));

// В загрузчике
const normalizedStatus = normalizeStatus(flashscoreGame.status);
await db.upsert('games', { ...game, status: normalizedStatus });

// В UI
const statusInfo = getStatusInfo(game.status);
const badge = `<span class="badge badge-${statusInfo.isLive ? 'live' : 'default'}">
  ${statusInfo.label}
</span>`;
```

---

## Memory Protocol

**Файл:** `AI (7).md` (из анализа частей 1-9)

**Назначение:** Протокол восстановления состояния AI-агента

### 8 фаз разработки

1. **Phase 1: Foundation** — структура проекта, БД схема
2. **Phase 2: API Integration** — клиент SStats.net API
3. **Phase 3: Data Loader** — pipeline загрузки
4. **Phase 4: Backend API** — внутренний REST API
5. **Phase 5: Frontend** — SPA приложение
6. **Phase 6: Monitoring** — трассировка и ошибки
7. **Phase 7: Testing** — unit, contract, E2E тесты
8. **Phase 8: Deployment** — Docker, CI/CD

### Checkpoints

**Каждые 5 шагов** создаётся checkpoint:
```json
{
  "checkpoint_id": "CP_001",
  "phase": 1,
  "step": 5,
  "timestamp": "2026-01-30T10:00:00Z",
  "completed_tasks": [...],
  "current_state": {
    "files_created": 15,
    "tables_created": 22,
    "tests_passing": 45
  },
  "next_steps": [...]
}
```

### Восстановление

При сбое AI-агент может:
1. Загрузить последний checkpoint
2. Проверить состояние через pre-flight checks
3. Продолжить с последнего успешного шага

---

## Deployment и безопасность

### Environment Variables

**Файл:** `.env.example`

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sstats
DB_POOL_MIN=2
DB_POOL_MAX=10

# API Keys
SSTATS_API_KEY=your_sstats_api_key_here
ADMIN_API_KEY=your_admin_key_here

# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Rate Limiting
RATE_LIMIT_PUBLIC=100
RATE_LIMIT_ADMIN=30

# Monitoring
ENABLE_TRACING=true
TRACE_SAMPLE_RATE=0.1

# Frontend
FRONTEND_URL=http://localhost:3000
```

### Docker

**Файл:** `Dockerfile` (пример)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**Файл:** `docker-compose.yml`

```yaml
version: '3.8'
services:
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: sstats
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/database/schema:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
  
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/sstats
      SSTATS_API_KEY: ${SSTATS_API_KEY}
    depends_on:
      - db
    restart: unless-stopped

volumes:
  postgres_data:
```

### Security Best Practices

1. **API Keys**
   - Никогда не коммитить в код
   - Использовать `.env` файлы
   - Ротация ключей каждые 90 дней

2. **Rate Limiting**
   - Public endpoints: 100 req/min
   - Admin endpoints: 30 req/min
   - IP-based throttling

3. **CORS**
   - Whitelist разрешённых origin
   - Credentials: true только для доверенных

4. **Helmet**
   - CSP headers
   - XSS protection
   - HSTS enabled

5. **Input Validation**
   - Валидация всех параметров
   - Sanitization перед записью в БД
   - Prepared statements (защита от SQL injection)

### Performance

1. **Database**
   - Connection pooling (min: 2, max: 10)
   - Партиционирование (games по годам)
   - Индексы на FK и часто используемых полях

2. **Caching**
   - API responses (TTL: 5s - 1h)
   - Database queries (Redis/In-memory)
   - Static assets (CDN)

3. **API**
   - Rate limiting для защиты от перегрузки
   - Cursor-based pagination
   - Gzip compression

---

## Приложения

### Файловая структура

```
/home/user/webapp/
├── .github/
│   ├── workflows/
│   │   └── (CI/CD configs)
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── PR_DESCRIPTION.md
├── docs/
│   ├── ARCHITECTURE.md (этот файл)
│   ├── GIT_COMMANDS.md
│   ├── WORKFLOW_EXAMPLE.md
│   └── WORKFLOW_DIAGRAM.md
├── src/
│   ├── core/
│   │   ├── preflight-checks.js
│   │   └── game-status-map.js
│   ├── database/
│   │   ├── schema/
│   │   │   └── postgres/
│   │   │       └── 001_init.sql
│   │   ├── schema-lock.js
│   │   ├── table-dependencies.js
│   │   └── upsert-keys.js
│   ├── api/
│   │   ├── endpoint-lock.js
│   │   ├── response-types.js
│   │   └── sstats-endpoints.manifest.json
│   ├── loader/
│   │   ├── engine/
│   │   │   └── loader-state.js
│   │   ├── transformers.js
│   │   └── validators.js
│   ├── monitoring/
│   │   ├── tracer.js
│   │   ├── error-collector.js
│   │   ├── recovery-playbook.js
│   │   └── ai-report-generator.js
│   └── server/
│       └── app.js
├── static/
│   ├── js/
│   │   ├── app.js
│   │   ├── api-client.js
│   │   ├── state-manager.js
│   │   ├── router.js
│   │   ├── error-tracker.js
│   │   └── components/
│   │       ├── monitoring-panel.js
│   │       ├── live-center.js
│   │       └── ... (9+ компонентов)
│   ├── css/
│   └── index.html
├── specs/
│   └── openapi.yaml
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── e2e/
├── memories/
│   └── schema.lock.json
├── scripts/
│   └── validate-project.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
├── CONTRIBUTING.md
├── PROJECT_SUMMARY.md
└── README.md
```

### Технологии и зависимости

**Backend:**
- `fastify` — веб-фреймворк
- `pg` — PostgreSQL клиент
- `dotenv` — переменные окружения
- `helmet` — security headers
- `@fastify/cors` — CORS
- `@fastify/rate-limit` — rate limiting

**Testing:**
- `jest` — unit/integration тесты
- `dredd` — contract тесты (OpenAPI)
- `playwright` — E2E тесты

**Development:**
- `nodemon` — auto-reload
- `eslint` — linting
- `prettier` — форматирование

**Monitoring:**
- Custom tracer + error collector
- Опционально: OpenTelemetry, Prometheus

---

## Заключение

Данная архитектура представляет собой **комплексную, устойчивую к ошибкам и самовосстанавливающуюся систему** для аналитики футбольных данных.

**Ключевые особенности:**

✅ **Три Железных Замка** — защита от дрейфа схемы, галлюцинаций API, некорректных UPSERT  
✅ **5 Критичных Компонентов** — граф зависимостей, контракты типов, playbook восстановления, pre-flight checks, карта статусов  
✅ **Cursor-based Resume** — возобновление после любого сбоя  
✅ **Self-healing** — автоматическое восстановление от типичных ошибок  
✅ **Contract-driven** — OpenAPI, JSDoc, манифесты  
✅ **Full Stack Monitoring** — backend + frontend трассировка  
✅ **Scalable Database** — партиционирование, индексы, connection pooling  

**Статус:** ✅ Архитектурный документ завершён  
**Версия:** 6.0.0  
**Дата:** 2026-01-30  

---

**Следующие шаги:**
1. ✅ Создать архитектурный документ
2. 🔄 Реализовать 5 критичных компонентов
3. ⏳ Создать git commit
4. ⏳ Создать/обновить Pull Request

