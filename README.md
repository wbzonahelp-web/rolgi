# Rolgi SStats Analytics Platform v6.0.0

## Описание

**Rolgi** - это производственная система аналитики футбольных данных, интегрирующая данные из API SStats.net в PostgreSQL с полным набором REST API эндпоинтов для работы с данными.

### 🎯 Ключевые возможности

- **🔒 Три Железных Замка** - защита от дрейфа схемы БД, AI-галлюцинаций API и нарушений UPSERT-ключей
- **📊 22 таблицы БД** - полная схема для хранения игр, команд, игроков, коэффициентов, статистики
- **🔄 13-шаговый Data Loader Pipeline** - надежная загрузка данных с валидацией и трансформацией
- **🚀 REST API** - Fastify-based API с Swagger документацией
- **📈 Мониторинг** - Distributed tracing, метрики, error tracking, health checks
- **⚡ Production-ready** - Pre-flight checks, graceful shutdown, connection pooling

## Git Workflow

### Структура веток
- `main` - основная ветка (production)
- `develop` - ветка разработки
- `feature/*` - ветки для новых функций
- `bugfix/*` - ветки для исправления багов
- `hotfix/*` - ветки для срочных исправлений

### Процесс разработки

1. **Создание новой ветки для функции:**
   ```bash
   git checkout -b feature/название-функции
   ```

2. **Разработка с регулярными коммитами:**
   ```bash
   git add .
   git commit -m "feat: описание изменений"
   ```

3. **Синхронизация с основной веткой:**
   ```bash
   git fetch origin main
   git rebase origin/main
   ```

4. **Разрешение конфликтов (если есть):**
   ```bash
   git status  # посмотреть конфликтные файлы
   # Отредактировать файлы
   git add <resolved-files>
   git rebase --continue
   ```

5. **Объединение коммитов (squash):**
   ```bash
   git reset --soft HEAD~N  # N - количество коммитов
   git commit -m "feat: полное описание всех изменений"
   ```

6. **Отправка изменений:**
   ```bash
   git push origin feature/название-функции
   # или с force после rebase/squash
   git push -f origin feature/название-функции
   ```

7. **Создание Pull Request:**
   - Через GitHub UI создайте PR из вашей ветки в main
   - Заполните описание изменений
   - Дождитесь ревью и approval

### Формат сообщений коммитов (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Типы:**
- `feat`: новая функциональность
- `fix`: исправление бага
- `docs`: изменения в документации
- `style`: форматирование, пропущенные точки с запятой и т.д.
- `refactor`: рефакторинг кода
- `test`: добавление тестов
- `chore`: обновление зависимостей, конфигурации и т.д.

**Примеры:**
```bash
git commit -m "feat(auth): add user authentication"
git commit -m "fix(api): resolve null pointer exception"
git commit -m "docs(readme): update installation instructions"
```

## Правила работы

### ✅ ОБЯЗАТЕЛЬНО:
- Делать коммит после КАЖДОГО изменения кода
- Создавать PR после каждого коммита
- Синхронизировать с main перед созданием PR
- Использовать осмысленные сообщения коммитов
- Разрешать конфликты, приоритизируя код из main

### ❌ ЗАПРЕЩЕНО:
- Оставлять незакоммиченные изменения
- Пушить напрямую в main
- Создавать PR без синхронизации с main
- Использовать неинформативные сообщения ("fix", "update" и т.д.)

## 🏗️ Архитектура

Полная документация архитектуры доступна в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### Компоненты системы

1. **Schema Lock** (`src/database/schema-lock.js`) - защита БД от дрейфа схемы
2. **Endpoint Lock** (`src/api/endpoint-lock.js`) - защита от AI-галлюцинаций API
3. **UPSERT Keys** (`src/database/upsert-keys.js`) - манифест ключей для всех таблиц
4. **Table Dependencies** (`src/database/table-dependencies.js`) - граф зависимостей таблиц
5. **Response Types** (`src/api/response-types.js`) - валидация структуры ответов API
6. **Recovery Playbook** (`src/monitoring/recovery-playbook.js`) - стратегии восстановления
7. **Pre-flight Checks** (`src/core/preflight-checks.js`) - 11 обязательных проверок
8. **Game Status Map** (`src/core/game-status-map.js`) - унифицированные статусы игр
9. **Database Pool** (`src/database/db-pool.js`) - connection pooling + транзакции
10. **SStats Client** (`src/api/sstats-client.js`) - HTTP-клиент с retry и rate limiting
11. **Data Loader** (`src/loader/data-loader.js`) - 13-шаговый pipeline загрузки
12. **Backend API** (`src/api/backend-api.js`) - REST API сервер
13. **Monitoring** (`src/monitoring/monitoring.js`) - tracing, metrics, health checks
14. **Server** (`server.js`) - главная точка входа

## 📦 Установка

### Требования

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14.0
- **npm** >= 8.0.0

### Шаги установки

```bash
# 1. Клонировать репозиторий
git clone https://github.com/wbzonahelp-web/rolgi.git
cd rolgi

# 2. Установить зависимости
npm install

# 3. Создать .env файл из примера
cp .env.example .env

# 4. Настроить переменные окружения
nano .env

# 5. Инициализировать базу данных
psql -U postgres -c "CREATE DATABASE rolgi_v6;"
psql -U postgres -d rolgi_v6 -f src/database/schema/postgres/001_init.sql

# 6. Проверить установку
npm run preflight
```

### Переменные окружения (.env)

```env
# API Server
API_PORT=3000
API_HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rolgi_v6
DB_USER=postgres
DB_PASSWORD=your_password

# SStats API
SSTATS_API_URL=https://api.sstats.net
SSTATS_API_KEY=your_api_key

# Features
ENABLE_SWAGGER=true
ENABLE_CORS=true
ENABLE_RATE_LIMIT=true
```

## 🚀 Запуск

### Development режим

```bash
# Запустить сервер с hot-reload
npm run dev

# Запустить только API сервер
npm run api

# Запустить loader вручную
npm run loader
```

### Production режим

```bash
# Сборка и запуск
npm start

# С PM2 (рекомендуется)
npm install -g pm2
pm2 start server.js --name rolgi
pm2 logs rolgi
pm2 status
```

### Проверка здоровья

```bash
# Health check
curl http://localhost:3000/health

# Metrics
curl http://localhost:3000/metrics

# Swagger документация
open http://localhost:3000/docs
```

## 🧪 Тестирование

```bash
# Запустить все тесты
npm test

# Тесты с coverage
npm run test:coverage

# E2E тесты
npm run test:e2e

# Тестирование отдельных компонентов
node src/database/schema-lock.js verify
node src/api/endpoint-lock.js validate
node src/database/upsert-keys.js stats
node src/core/preflight-checks.js
```

## 📊 API Эндпоинты

### Health & Metrics
- `GET /health` - Health check
- `GET /metrics` - System metrics

### Games
- `GET /api/games` - Список игр с фильтрацией
- `GET /api/games/:id` - Детали игры
- `GET /api/games/:id/stats` - Статистика игры
- `GET /api/games/:id/events` - События игры

### Teams
- `GET /api/teams` - Список команд
- `GET /api/teams/:id` - Детали команды
- `GET /api/teams/:id/players` - Игроки команды

### Players
- `GET /api/players` - Список игроков
- `GET /api/players/:id` - Детали игрока

### Odds
- `GET /api/odds/live/:gameId` - Live коэффициенты

### Standings
- `GET /api/standings` - Турнирная таблица

### Data Loader
- `POST /api/loader/load` - Запустить загрузку данных
- `GET /api/loader/status/:sessionId` - Статус загрузки

Полная документация API: http://localhost:3000/docs

## 🗄️ База данных

### Структура (22 таблицы)

**Справочники:**
- `countries` - Страны
- `bookmakers` - Букмекеры

**Основные сущности:**
- `leagues` - Лиги/турниры
- `seasons` - Сезоны
- `teams` - Команды
- `players` - Игроки
- `games` - Игры (партиционирована по годам)

**Статистика:**
- `game_stats` - Статистика игр
- `game_events` - События в играх
- `team_stats` - Статистика команд
- `player_stats` - Статистика игроков

**Коэффициенты:**
- `odds` - Коэффициенты
- `odds_movements` - Движения коэффициентов

**Турнирные таблицы:**
- `standings` - Турнирная таблица

**Аналитика:**
- `predictions` - Прогнозы
- `insights` - Инсайты

**Мониторинг:**
- `data_sync_log` - Лог синхронизации
- `api_request_log` - Лог API запросов
- `system_alerts` - Системные алерты

### Миграции

```bash
# Применить все миграции
npm run migrate

# Создать новую миграцию
npm run migrate:create название

# Откатить последнюю миграцию
npm run migrate:rollback
```

## 🔧 CLI Инструменты

### Schema Lock
```bash
node src/database/schema-lock.js create    # Создать lock
node src/database/schema-lock.js verify    # Проверить lock
node src/database/schema-lock.js update    # Обновить lock
node src/database/schema-lock.js info      # Информация
```

### Endpoint Lock
```bash
node src/api/endpoint-lock.js validate     # Валидировать манифест
node src/api/endpoint-lock.js list         # Список эндпоинтов
node src/api/endpoint-lock.js stats        # Статистика
node src/api/endpoint-lock.js export       # Экспорт (JSON/Markdown/OpenAPI)
```

### UPSERT Keys
```bash
node src/database/upsert-keys.js list      # Список таблиц
node src/database/upsert-keys.js info      # Информация о таблице
node src/database/upsert-keys.js stats     # Статистика
node src/database/upsert-keys.js generate  # Генерация SQL
```

### Pre-flight Checks
```bash
node src/core/preflight-checks.js          # Запустить все проверки
```

## 🔐 Безопасность

### Три Железных Замка

1. **Schema Lock** - SHA256 хеш схемы БД
   - Защита от случайного изменения схемы
   - Валидация перед каждым запуском
   - История изменений

2. **Endpoint Lock** - Манифест всех 32 API эндпоинтов
   - Защита от несуществующих эндпоинтов
   - Валидация параметров
   - Предотвращение AI-галлюцинаций

3. **UPSERT Keys** - Манифест ключей для 22 таблиц
   - Защита от дубликатов
   - Контроль конфликтов
   - Автоматическая генерация SQL

## 📈 Мониторинг

### Метрики
- Request latency (p50, p95, p99)
- Throughput (req/sec)
- Error rate
- Database connections
- API rate limits
- Loader sessions

### Трейсинг
- Distributed tracing с trace ID
- Span tracking для операций
- Performance profiling

### Health Checks
- Database connectivity
- API availability
- Memory usage
- Disk space

## 🔄 Data Loader Pipeline

13-шаговый конвейер загрузки данных:

1. **PRE-FLIGHT CHECK** - Проверка готовности
2. **FETCH API DATA** - Загрузка из API
3. **VALIDATE RESPONSE** - Валидация структуры
4. **TRANSFORM DATA** - Трансформация данных
5. **ENRICH DATA** - Обогащение
6. **DEDUPLICATE** - Дедупликация
7. **VALIDATE CONSTRAINTS** - Проверка ограничений
8. **BEGIN TRANSACTION** - Начало транзакции
9. **RESOLVE DEPENDENCIES** - Резолв зависимостей
10. **UPSERT DATA** - Сохранение в БД
11. **UPDATE RELATIONS** - Обновление связей
12. **COMMIT TRANSACTION** - Commit
13. **POST-LOAD VERIFICATION** - Проверка результатов

### Загрузка данных вручную

```bash
# Загрузить игры
curl -X POST http://localhost:3000/api/loader/load \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "games", "fetch_params": {"limit": 100}}'

# Проверить статус
curl http://localhost:3000/api/loader/status/{sessionId}
```

## 📚 Структура проекта

```
/home/user/webapp/
├── server.js                          # Главная точка входа
├── package.json                       # npm конфигурация
├── .env.example                       # Пример переменных окружения
├── .eslintrc.json                     # ESLint конфигурация
├── .prettierrc                        # Prettier конфигурация
├── README.md                          # Этот файл
├── CONTRIBUTING.md                    # Правила контрибуции
├── PROJECT_SUMMARY.md                 # Сводка проекта
│
├── docs/                              # Документация
│   ├── ARCHITECTURE.md                # Архитектурный документ
│   ├── CHECKLIST.md                   # Мастер-чеклист
│   ├── WORKFLOW_DIAGRAM.md            # Диаграмма workflow
│   └── GIT_COMMANDS.md                # Git команды
│
├── src/                               # Исходный код
│   ├── core/                          # Ядро системы
│   │   ├── preflight-checks.js        # Pre-flight проверки
│   │   └── game-status-map.js         # Карта статусов игр
│   │
│   ├── database/                      # База данных
│   │   ├── schema/
│   │   │   └── postgres/
│   │   │       └── 001_init.sql       # Инициализация схемы
│   │   ├── schema-lock.js             # Schema Lock система
│   │   ├── table-dependencies.js      # Граф зависимостей
│   │   ├── upsert-keys.js             # UPSERT Keys манифест
│   │   └── db-pool.js                 # Connection Pool
│   │
│   ├── api/                           # API клиенты и сервер
│   │   ├── sstats-client.js           # SStats API клиент
│   │   ├── sstats-endpoints.manifest.json  # Манифест эндпоинтов
│   │   ├── endpoint-lock.js           # Endpoint Lock система
│   │   ├── response-types.js          # Типы ответов
│   │   └── backend-api.js             # Backend API сервер
│   │
│   ├── loader/                        # Data Loader
│   │   └── data-loader.js             # 13-шаговый pipeline
│   │
│   └── monitoring/                    # Мониторинг
│       ├── monitoring.js              # Tracing & Metrics
│       └── recovery-playbook.js       # Стратегии восстановления
│
├── tests/                             # Тесты
│   ├── unit/                          # Unit тесты
│   ├── integration/                   # Integration тесты
│   └── e2e/                           # E2E тесты
│
├── static/                            # Статические файлы
│   └── index.html                     # Главная страница
│
└── memories/                          # Служебные файлы
    └── schema.lock.json               # Schema Lock файл
```

## 🤝 Контрибуция
