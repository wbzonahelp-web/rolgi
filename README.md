# Rolgi SStats Analytics Platform v6.0.0

> 🚀 **Production-Ready Football Analytics System** - полный стек для сбора, хранения и анализа футбольных данных с SStats.net API

[![Version](https://img.shields.io/badge/version-6.0.0-blue.svg)](https://github.com/wbzonahelp-web/rolgi)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 📋 Содержание

- [Описание](#-описание)
- [Ключевые возможности](#-ключевые-возможности)
- [Архитектура](#️-архитектура)
- [Установка](#-установка)
- [Запуск](#-запуск)
- [API Эндпоинты](#-api-эндпоинты)
- [База данных](#️-база-данных)
- [CLI Инструменты](#-cli-инструменты)
- [Тестирование](#-тестирование)
- [Мониторинг](#-мониторинг)
- [Docker Deployment](#-docker-deployment)
- [Production Deployment](#-production-deployment)
- [Git Workflow](#-git-workflow)
- [Контрибуция](#-контрибуция)
- [Лицензия](#-лицензия)

---

## 📖 Описание

**Rolgi** - это production-ready система для комплексной аналитики футбольных матчей, интегрирующая данные из API SStats.net в PostgreSQL с полным набором REST API эндпоинтов.

### 🎯 Ключевые возможности

#### 🔒 Три Железных Замка
- **Schema Lock** - защита от дрейфа схемы БД (SHA256 хеширование 22 таблиц)
- **Endpoint Lock** - защита от AI-галлюцинаций API (манифест 32 эндпоинтов)
- **UPSERT Keys** - защита от нарушений ключей (манифест для 22 таблиц)

#### 📊 База данных
- **22 таблицы** с полной схемой для игр, команд, игроков, коэффициентов, статистики
- **Партиционирование** по годам (2020-2027 + future)
- **Миграции** с версионированием и rollback
- **Connection pooling** с транзакциями и query builder

#### 🔄 Data Loader Pipeline
- **13-шаговый конвейер** с валидацией и трансформацией
- **Автоматическая загрузка** по расписанию (9 scheduled jobs)
- **Retry механизм** с экспоненциальной задержкой
- **Circuit breaker** для защиты от перегрузок

#### 🚀 REST API
- **Fastify-based** высокопроизводительный сервер
- **Swagger документация** на `/docs`
- **Rate limiting** и CORS
- **Health checks** и metrics

#### 📈 Мониторинг
- **Distributed tracing** с trace ID
- **Prometheus metrics** экспорт
- **Error recovery** с автоматическими стратегиями
- **Health monitoring** в реальном времени

#### ⚡ Production-Ready
- **Pre-flight checks** (11 обязательных проверок)
- **Graceful shutdown** с корректным завершением
- **Docker support** с docker-compose
- **Automated testing** (Jest + unit tests)

---

## 🏗️ Архитектура

Полная документация: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT LAYER                           │
│   (Browser, Mobile App, CLI, External Services)             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND API LAYER                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │   Fastify    │  │   Swagger    │  │ Rate Limit   │     │
│   │   REST API   │  │     Docs     │  │   & CORS     │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 CORE BUSINESS LOGIC                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  Pre-flight  │  │ Data Loader  │  │ Game Status  │     │
│   │    Checks    │  │   Pipeline   │  │     Map      │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │   Response   │  │   Recovery   │  │ Table Deps   │     │
│   │    Types     │  │   Playbook   │  │    Graph     │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE ACCESS LAYER                       │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  DB Pool     │  │ Schema Lock  │  │ UPSERT Keys  │     │
│   │ (Pooling +   │  │  (SHA256)    │  │  (Manifest)  │     │
│   │ Transactions)│  │              │  │              │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE                         │
│   (22 tables, partitioning, indexes, triggers)              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  EXTERNAL API LAYER                          │
│   ┌──────────────┐  ┌──────────────┐                        │
│   │ SStats API   │  │ Endpoint     │                        │
│   │   Client     │  │    Lock      │                        │
│   └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  MONITORING & TRACING                        │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │  Distributed │  │  Prometheus  │  │    Health    │     │
│   │   Tracing    │  │   Metrics    │  │   Checks     │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 14 ключевых компонентов

| № | Компонент | Файл | Описание |
|---|-----------|------|----------|
| 1 | **Schema Lock** | `src/database/schema-lock.js` | SHA256 хеш схемы БД, CLI команды |
| 2 | **Endpoint Lock** | `src/api/endpoint-lock.js` | Манифест 32 эндпоинтов SStats API |
| 3 | **UPSERT Keys** | `src/database/upsert-keys.js` | Манифест ключей для 22 таблиц |
| 4 | **Table Dependencies** | `src/database/table-dependencies.js` | Граф зависимостей и порядок загрузки |
| 5 | **Response Types** | `src/api/response-types.js` | JSDoc typedefs + валидаторы |
| 6 | **Recovery Playbook** | `src/monitoring/recovery-playbook.js` | 9 стратегий восстановления |
| 7 | **Pre-flight Checks** | `src/core/preflight-checks.js` | 11 обязательных проверок |
| 8 | **Game Status Map** | `src/core/game-status-map.js` | Унифицированные статусы игр |
| 9 | **Database Pool** | `src/database/db-pool.js` | Connection pooling + транзакции |
| 10 | **SStats Client** | `src/api/sstats-client.js` | HTTP-клиент с retry и rate limiting |
| 11 | **Data Loader** | `src/loader/data-loader.js` | 13-шаговый pipeline |
| 12 | **Backend API** | `src/api/backend-api.js` | REST API сервер на Fastify |
| 13 | **Monitoring** | `src/monitoring/monitoring.js` | Tracing, metrics, health checks |
| 14 | **Server** | `server.js` | Главная точка входа |

---

## 📦 Установка

### Требования

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14.0
- **npm** >= 8.0.0
- **Git** >= 2.30.0

### Быстрый старт (локально)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/wbzonahelp-web/rolgi.git
cd rolgi

# 2. Установить зависимости
npm install

# 3. Создать базу данных
createdb rolgi_v6

# 4. Настроить переменные окружения
cp .env.example .env
nano .env  # Отредактировать DATABASE_URL и SSTATS_API_KEY

# 5. Применить схему БД
npm run db:init

# 6. Проверить установку
npm run preflight

# 7. Запустить сервер
npm start
```

### Переменные окружения (.env)

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/rolgi_v6
DB_POOL_MIN=2
DB_POOL_MAX=10

# SStats API
SSTATS_API_KEY=your_sstats_api_key_here
SSTATS_API_BASE_URL=https://api.sstats.net

# Admin
ADMIN_API_KEY=your_admin_api_key_here

# Rate Limiting
RATE_LIMIT_PUBLIC=100
RATE_LIMIT_ADMIN=30

# Monitoring
ENABLE_TRACING=true
TRACE_SAMPLE_RATE=0.1
LOG_LEVEL=info

# Frontend
FRONTEND_URL=http://localhost:3000

# Loader
LOADER_BATCH_SIZE=100
LOADER_CONCURRENT_REQUESTS=5
LOADER_RETRY_ATTEMPTS=3

# WebSocket
WS_ENABLED=true
WS_PATH=/ws

# Scheduled Jobs
ENABLE_SCHEDULED_JOBS=true

# Features
ENABLE_SWAGGER=true
ENABLE_CORS=true
ENABLE_RATE_LIMIT=true
```

Полный список переменных: [.env.example](.env.example)

---

## 🚀 Запуск

### Development режим

```bash
# Запустить с hot-reload (nodemon)
npm run dev

# Запустить только API сервер
npm start

# Запустить loader вручную
npm run loader:run

# Проверить статус loader
npm run loader:status <sessionId>
```

### Production режим

```bash
# Запуск с PM2
npm install -g pm2
pm2 start server.js --name rolgi
pm2 logs rolgi
pm2 status

# Или с systemd (см. docs/DEPLOYMENT.md)
sudo systemctl start rolgi
sudo systemctl status rolgi
```

### Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/health

# Metrics
curl http://localhost:3000/metrics

# Swagger документация
open http://localhost:3000/docs

# Frontend dashboard
open http://localhost:3000
```

---

## 📊 API Эндпоинты

### Health & Metrics

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/health` | Health check системы |
| GET | `/metrics` | Prometheus metrics |

### Games (Игры)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/games` | Список игр (с фильтрацией, пагинацией) |
| GET | `/api/games/:id` | Детали игры по ID |
| GET | `/api/games/:id/stats` | Статистика конкретной игры |
| GET | `/api/games/:id/events` | События игры (голы, карточки и т.д.) |

### Teams (Команды)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/teams` | Список команд |
| GET | `/api/teams/:id` | Детали команды |
| GET | `/api/teams/:id/players` | Список игроков команды |
| GET | `/api/teams/:id/stats` | Статистика команды |

### Players (Игроки)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/players` | Список игроков |
| GET | `/api/players/:id` | Детали игрока |
| GET | `/api/players/:id/stats` | Статистика игрока |

### Odds (Коэффициенты)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/odds/live/:gameId` | Live коэффициенты для игры |
| GET | `/api/odds/movements/:gameId` | Движения коэффициентов |

### Standings (Турнирные таблицы)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/standings` | Турнирная таблица (с фильтрацией) |

### Data Loader (Управление загрузкой)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/loader/load` | Запустить загрузку данных |
| GET | `/api/loader/status/:sessionId` | Статус загрузки по session ID |

### Пример запроса

```bash
# Получить последние 10 игр
curl "http://localhost:3000/api/games?limit=10&sort=date:desc"

# Запустить загрузку игр
curl -X POST http://localhost:3000/api/loader/load \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -d '{
    "entity_type": "games",
    "fetch_params": {
      "limit": 100,
      "date_from": "2024-01-01"
    }
  }'
```

**Полная интерактивная документация:** http://localhost:3000/docs

---

## 🗄️ База данных

### Структура (22 таблицы)

#### Справочники
- `countries` - Страны
- `bookmakers` - Букмекеры

#### Основные сущности
- `leagues` - Лиги/турниры
- `seasons` - Сезоны
- `teams` - Команды
- `players` - Игроки
- `games` - Игры (**партиционирована по годам**: 2020-2027 + future)

#### Статистика
- `game_stats` - Статистика игр (удары, владение и т.д.)
- `game_events` - События в играх (голы, карточки, замены)
- `team_stats` - Статистика команд
- `player_stats` - Статистика игроков

#### Коэффициенты
- `odds` - Коэффициенты от букмекеров
- `odds_movements` - История движения коэффициентов

#### Турнирные таблицы
- `standings` - Турнирная таблица

#### Аналитика
- `predictions` - Прогнозы на матчи
- `insights` - Аналитические инсайты

#### Системные таблицы
- `data_sync_log` - Лог синхронизации данных
- `api_request_log` - Лог API запросов
- `system_alerts` - Системные алерты
- `schema_versions` - Версии схемы БД

### Партиционирование таблицы `games`

```sql
-- Автоматическое партиционирование по годам
games_2020  -- games WHERE date >= '2020-01-01' AND date < '2021-01-01'
games_2021
games_2022
games_2023
games_2024
games_2025
games_2026
games_2027
games_future -- games WHERE date >= '2028-01-01'
```

### Миграции

```bash
# Применить все миграции
npm run db:migrate

# Создать новую миграцию
npm run db:migrate:create название_миграции

# Откатить последнюю миграцию
npm run db:migrate:rollback

# Проверить статус миграций
npm run db:migrate:status
```

### Database CLI команды

```bash
# Инициализировать БД (применить схему)
npm run db:init

# Сбросить БД (DROP всех таблиц)
npm run db:reset

# Seed данными (тестовые данные)
npm run db:seed

# Backup БД
npm run db:backup

# Restore БД из backup
npm run db:restore <backup_file>
```

---

## 🔧 CLI Инструменты

### Schema Lock

```bash
# Создать lock файл (SHA256 хеш схемы)
node src/database/schema-lock.js create

# Проверить соответствие схемы lock файлу
node src/database/schema-lock.js verify

# Обновить lock после изменения схемы
node src/database/schema-lock.js update

# Показать информацию о lock
node src/database/schema-lock.js info

# История изменений lock
node src/database/schema-lock.js history
```

### Endpoint Lock

```bash
# Валидировать манифест эндпоинтов
node src/api/endpoint-lock.js validate

# Список всех эндпоинтов
node src/api/endpoint-lock.js list

# Поиск эндпоинта
node src/api/endpoint-lock.js search "games"

# Статистика по манифесту
node src/api/endpoint-lock.js stats

# Экспорт манифеста
node src/api/endpoint-lock.js export --format=json
node src/api/endpoint-lock.js export --format=markdown
node src/api/endpoint-lock.js export --format=openapi
```

### UPSERT Keys

```bash
# Список всех таблиц с ключами
node src/database/upsert-keys.js list

# Информация о ключах конкретной таблицы
node src/database/upsert-keys.js info games

# Статистика
node src/database/upsert-keys.js stats

# Генерация UPSERT SQL для таблицы
node src/database/upsert-keys.js generate games
```

### Pre-flight Checks

```bash
# Запустить все 11 проверок
node src/core/preflight-checks.js

# Или через npm script
npm run preflight
```

### Validations (Проверки целостности)

```bash
# Валидация всего проекта
npm run validate:project

# Валидация зависимостей таблиц
npm run validate:dependencies

# Валидация типов ответов API
npm run validate:response-types

# Валидация recovery playbook
npm run validate:playbook

# Валидация game status map
npm run validate:status-map
```

---

## 🧪 Тестирование

### Запуск тестов

```bash
# Все тесты
npm test

# Тесты с coverage
npm run test:coverage

# Watch режим
npm run test:watch

# Unit тесты
npm run test:unit

# Integration тесты
npm run test:integration

# E2E тесты
npm run test:e2e
```

### Структура тестов

```
tests/
├── unit/                          # Unit тесты
│   ├── schema-lock.test.js        # Тесты Schema Lock
│   ├── table-dependencies.test.js # Тесты Table Dependencies
│   ├── endpoint-lock.test.js
│   ├── upsert-keys.test.js
│   └── ...
├── integration/                   # Integration тесты
│   ├── api.test.js
│   ├── loader.test.js
│   └── ...
└── e2e/                           # E2E тесты
    └── full-workflow.test.js
```

### Примеры тестов

```javascript
// Unit test пример
describe('Schema Lock', () => {
  test('should create lock file', async () => {
    const lock = await createSchemaLock();
    expect(lock.hash).toBeDefined();
    expect(lock.tables).toHaveLength(22);
  });
});

// Integration test пример
describe('Data Loader Pipeline', () => {
  test('should load games successfully', async () => {
    const result = await loadGames({ limit: 10 });
    expect(result.success).toBe(true);
    expect(result.inserted).toBeGreaterThan(0);
  });
});
```

---

## 📈 Мониторинг

### Метрики (Prometheus format)

Доступно на: `http://localhost:3000/metrics`

```
# HTTP Request Duration (p50, p95, p99)
http_request_duration_seconds{method="GET",endpoint="/api/games",quantile="0.5"} 0.023
http_request_duration_seconds{method="GET",endpoint="/api/games",quantile="0.95"} 0.145
http_request_duration_seconds{method="GET",endpoint="/api/games",quantile="0.99"} 0.287

# HTTP Request Rate
http_requests_total{method="GET",endpoint="/api/games",status="200"} 1543

# Error Rate
http_errors_total{method="GET",endpoint="/api/games",status="500"} 3

# Database Connections
db_connections_active 5
db_connections_idle 3
db_connections_total 8

# API Rate Limits
api_rate_limit_remaining 245

# Loader Sessions
loader_sessions_active 1
loader_sessions_completed 47
loader_sessions_failed 2
```

### Трейсинг (Distributed Tracing)

```javascript
// Автоматический трейсинг всех операций
const tracer = createTracer('data-loader');
const traceId = tracer.start('load-games', { limit: 100 });

try {
  // ... операции ...
  tracer.finish(traceId);
} catch (error) {
  tracer.recordError(traceId, error);
}

// Просмотр трейсов
GET /api/traces
GET /api/traces/:traceId
```

### Health Checks

```bash
# Базовый health check
curl http://localhost:3000/health

# Ответ:
{
  "status": "healthy",
  "uptime": 3600,
  "checks": {
    "database": "ok",
    "sstats_api": "ok",
    "memory": "ok",
    "disk": "ok"
  },
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

### Логирование

```bash
# Development (pretty logs)
npm run dev

# Production (JSON logs)
NODE_ENV=production npm start

# Логи с разными уровнями
LOG_LEVEL=debug npm start  # trace, debug, info, warn, error, fatal
```

### Error Recovery

```javascript
// Автоматическое восстановление при ошибках
const recovery = getRecoveryStrategy('API_429_RATE_LIMIT');
// => {
//   severity: 'medium',
//   steps: [
//     'Wait for rate limit window to reset',
//     'Implement exponential backoff',
//     'Use caching to reduce requests'
//   ]
// }
```

---

## 🐳 Docker Deployment

### Быстрый старт с Docker

```bash
# Сборка образа
docker build -t rolgi:6.0.0 .

# Запуск с docker-compose
docker-compose up -d

# Просмотр логов
docker-compose logs -f api

# Остановка
docker-compose down
```

### Docker Compose Stack

```yaml
services:
  postgres:     # PostgreSQL 14
  redis:        # Redis (для кэша)
  api:          # Rolgi API Server
  nginx:        # Nginx reverse proxy
```

### Проверка Docker деплоя

```bash
# Health check
curl http://localhost/health

# Swagger UI
open http://localhost/docs

# Metrics
curl http://localhost/metrics
```

Подробнее: [docs/DOCKER.md](docs/DOCKER.md)

---

## 🚀 Production Deployment

### Makefile команды

```bash
# Сборка Docker образа
make build

# Deploy в production
make deploy

# Backup БД
make backup

# Restore БД
make restore BACKUP_FILE=backup_20260130.sql

# Логи
make logs

# Health check
make health

# Тесты
make test

# Очистка
make clean
```

### Production Checklist

- [ ] Настроены переменные окружения (`.env`)
- [ ] Сгенерирован `ADMIN_API_KEY`
- [ ] Настроен `SSTATS_API_KEY`
- [ ] Применена схема БД (`npm run db:init`)
- [ ] Проверены pre-flight checks (`npm run preflight`)
- [ ] Настроен Nginx reverse proxy
- [ ] Настроен SSL/TLS (Let's Encrypt)
- [ ] Настроен Prometheus + Grafana
- [ ] Настроен backup scheduler (cron)
- [ ] Настроен log rotation
- [ ] Настроен alerting

Подробнее: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 📝 Git Workflow

### Структура веток

- `main` - production ветка (защищена)
- `develop` - ветка разработки
- `feature/*` - новые функции
- `bugfix/*` - исправление багов
- `hotfix/*` - срочные исправления

### Процесс разработки

```bash
# 1. Создать feature ветку
git checkout -b feature/my-new-feature

# 2. Разработка с регулярными коммитами
git add .
git commit -m "feat(scope): add new feature"

# 3. Синхронизация с main
git fetch origin main
git rebase origin/main

# 4. Разрешение конфликтов (если есть)
git status
# Отредактировать файлы с конфликтами
git add <resolved-files>
git rebase --continue

# 5. Squash коммитов (опционально)
git reset --soft HEAD~N
git commit -m "feat(scope): comprehensive feature description"

# 6. Push в feature ветку
git push origin feature/my-new-feature -f

# 7. Создать Pull Request на GitHub
# Перейти на https://github.com/wbzonahelp-web/rolgi/pull/new/feature/my-new-feature
```

### Conventional Commits

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Типы:**
- `feat`: новая функциональность
- `fix`: исправление бага
- `docs`: изменения в документации
- `refactor`: рефакторинг кода
- `test`: добавление тестов
- `chore`: обновление конфигурации, зависимостей

**Примеры:**
```bash
git commit -m "feat(api): add games endpoint"
git commit -m "fix(loader): resolve race condition"
git commit -m "docs(readme): update installation guide"
git commit -m "refactor(db): optimize query performance"
```

### Pull Request процесс

1. Создать PR из feature ветки в `main`
2. Заполнить шаблон PR (`.github/PULL_REQUEST_TEMPLATE.md`)
3. Дождаться прохождения CI/CD checks
4. Получить approval от reviewer
5. Merge в `main` (squash merge рекомендуется)

---

## 🤝 Контрибуция

Мы приветствуем контрибуции! Пожалуйста, ознакомьтесь с [CONTRIBUTING.md](CONTRIBUTING.md) для деталей.

### Как контрибутить

1. Fork репозитория
2. Создать feature ветку (`git checkout -b feature/AmazingFeature`)
3. Commit изменений (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push в ветку (`git push origin feature/AmazingFeature`)
5. Открыть Pull Request

### Code Style

- ESLint + Prettier конфигурация
- JSDoc комментарии для всех функций
- Unit тесты для нового кода
- Conventional Commits

```bash
# Проверка кода
npm run lint

# Автофикс
npm run lint:fix

# Форматирование
npm run format
```

---

## 📚 Документация

- [Архитектура](docs/ARCHITECTURE.md) - полная архитектурная документация
- [Чеклист](docs/CHECKLIST.md) - мастер-чеклист разработки
- [Workflow](docs/WORKFLOW_DIAGRAM.md) - диаграммы рабочих процессов
- [Changelog](CHANGELOG.md) - история изменений
- [API Docs](http://localhost:3000/docs) - Swagger UI (после запуска)

---

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE)

---

## 👥 Авторы

- **wbzonahelp-web** - [GitHub](https://github.com/wbzonahelp-web)

---

## 🙏 Благодарности

- [SStats.net](https://sstats.net) - за предоставление API
- [Fastify](https://fastify.io) - за высокопроизводительный фреймворк
- [PostgreSQL](https://postgresql.org) - за надежную БД
- Open Source Community

---

## 📞 Поддержка

- **Issues**: [GitHub Issues](https://github.com/wbzonahelp-web/rolgi/issues)
- **Discussions**: [GitHub Discussions](https://github.com/wbzonahelp-web/rolgi/discussions)
- **Email**: support@example.com

---

## 🔗 Ссылки

- **Repository**: https://github.com/wbzonahelp-web/rolgi
- **Documentation**: https://wbzonahelp-web.github.io/rolgi
- **NPM Package**: https://www.npmjs.com/package/rolgi (coming soon)

---

<div align="center">

**⭐ Поставьте звезду, если проект был полезен!**

Made with ❤️ by [wbzonahelp-web](https://github.com/wbzonahelp-web)

</div>
