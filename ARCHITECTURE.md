# rolgi — Архитектура системы

> Полное описание архитектуры для агентов и разработчиков

## Содержание

- [Обзор системы](#обзор-системы)
- [Инфраструктура](#инфраструктура)
- [Backend API](#backend-api)
  - [Корневые эндпоинты](#корневые-эндпоинты-backend-apijs)
  - [Версионированные API](#версионированные-api)
  - [DB Routes](#db-routes-apidb)
  - [Стратегии](#стратегии-apistrategies)
  - [Model Predictions](#model-predictions-apimodel-predictions)
  - [Scout](#scout-apiscout)
  - [Alerting](#alerting-apialerts)
  - [Auth](#auth-apiauth)
  - [Cached Proxy](#cached-proxy-apiproxy)
  - [GraphQL API](#graphql-api-graphql)
  - [WebSocket](#websocket-ws)
- [Аналитика](#аналитика)
  - [JS-анализаторы](#js-анализаторы-srcanalyticsanalyzers)
  - [Python-анализаторы](#python-анализаторы-srcanalytics-python)
- [Frontend](#frontend)
  - [Публичные страницы](#публичные-страницы-www)
  - [Admin Panel](#admin-panel-admin-panel)
- [База данных](#база-данных)
- [Ключевые модули](#ключевые-модули)
- [Внешние интеграции](#внешние-интеграции)
- [Ключевые процессы](#ключевые-процессы)
  - [Стратегии и прогнозы](#стратегии-и-прогнозы)
  - [Анализ и оптимизация](#анализ-и-оптимизация)
- [Разработка](#разработка)
  - [Доступ к системе](#доступ-к-системе)
  - [Git workflow](#git-workflow)
  - [Работа агентов](#работа-агентов)
- [Быстрый старт](#быстрый-старт)

## Обзор системы

Система анализа и прогнозирования футбольных матчей. БД PostgreSQL `rolgi_v6`: ~1.25 млн завершённых матчей по ~1214 лигам. Бэкенд Node.js (Fastify), Python-аналитика (FastAPI + hmmlearn + sklearn), PostgreSQL 16, Redis 7, nginx. Прогнозы на основе ансамбля анализаторов (Poisson, Markov, Shannon, HMM, Monte Carlo и др.) с калибровкой по лигам.

---

## Инфраструктура

| Сервис | Контейнер | Образ | Порт (хост:контейнер) | Зависимости | Профиль |
|--------|-----------|-------|----------------------|-------------|---------|
| **PostgreSQL** | `rolgi-postgres` | `postgres:16-alpine` | `5432:5432` | — | default |
| **API Server** | `rolgi-api` | Custom (`Dockerfile`, target: production) | `3000:3000` | postgres (healthy) | default |
| **Redis** | `rolgi-redis` | `redis:7-alpine` | `6379:6379` | — | default |
| **Analytics (Python)** | `rolgi-analytics` | Custom (`Dockerfile.analytics`) | 8000 (внутренний, не опубликован) | postgres (healthy), redis (healthy) | default |
| **Nginx** | `rolgi-nginx` | `nginx:alpine` | `80:80`, `443:443` | api | `with-nginx` |

**Сеть:** `rolgi-network` (bridge)

**Volumes:** `rolgi-postgres-data`, `rolgi-redis-data`, `rolgi-api-logs`

**База данных:** `rolgi_v6` (UTF8, locale `en_US.UTF-8`)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Nginx     │────▶│  API Server  │────▶│   PostgreSQL 16  │
│  (прокси)   │     │  (Fastify)   │     │   (rolgi_v6)     │
│  :80/:443   │     │   :3000      │     │   :5432          │
└─────────────┘     │              │     └──────────────────┘
                    │  ┌──────────┤     ┌──────────────────┐
┌─────────────┐     │  │ GraphQL  │     │     Redis 7      │
│  Frontend   │────▶│  │ /graphql │────▶│   (кэш)         │
│  (www/)     │     │  ├──────────┤     │   :6379          │
│  + Admin    │     │  │ WS /ws   │     └──────────────────┘
└─────────────┘     │  ├──────────┤            ▲
                    │  │ REST API │            │
                    │  └──────────┘     ┌───────┴──────────┐
                    │         │        │  Analytics (Py)   │
                    │         │        │  FastAPI :8000    │
                    │         └───────▶│  hmmlearn+sklearn │
                    └──────────────────└───────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   SStats.net API   │
                    │  (42 endpoints)    │
                    │  api.sstats.net    │
                    └────────────────────┘
```

---

## Backend API

### Корневые эндпоинты (backend-api.js)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | HTML-страница или JSON-описание API |
| GET | `/health` | Health check |
| GET | `/api/versions` | Информация о версиях API |
| GET | `/api/games` | Список игр (с кэшированием) |
| GET | `/api/games/:id` | Детали игры |
| GET | `/api/teams` | Список команд |
| GET | `/api/teams/:id` | Детали команды |
| GET | `/api/players` | Список игроков |
| GET | `/api/players/:id` | Детали игрока |
| GET | `/api/odds/live/:gameId` | Live-коэффициенты для игры |
| GET | `/api/standings` | Турнирная таблица (с кэшированием) |
| POST | `/api/loader/load` | Запуск загрузки данных |
| GET | `/api/loader/status/:sessionId` | Статус загрузки |

### Версионированные API

**v1** (`/api/v1`):
- `GET /api/v1/games` — список игр
- `GET /api/v1/games/:id` — детали игры
- `GET /api/v1/teams` — список команд
- `GET /api/v1/teams/:id` — детали команды
- `GET /api/v1/players` — список игроков
- `GET /api/v1/players/:id` — детали игрока

**v2** (`/api/v2`):
- `GET /api/v2/games` — расширенный список игр
- `GET /api/v2/games/:id` — расширенные детали игры
- `GET /api/v2/teams` — расширенный список команд
- `GET /api/v2/teams/:id` — расширенные детали команды
- `GET /api/v2/players` — расширенный список игроков
- `GET /api/v2/players/:id` — расширенные детали игрока

### DB Routes (`/api/db`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/db/leagues` | Список лиг |
| GET | `/api/db/leagues/popular` | Популярные лиги |
| GET | `/api/db/games/list` | Список игр (фильтры по лиге/сезону) |
| GET | `/api/db/games/season-summary` | Сводка сезона |
| GET | `/api/db/games/live` | Live-игры |
| GET | `/api/db/games/:id` | Детали игры |
| GET | `/api/db/games/:id/events` | События матча |
| GET | `/api/db/games/:id/lineups` | Составы матча |
| GET | `/api/db/games/:id/statistics` | Статистика матча |
| GET | `/api/db/games/:id/h2h` | H2H история |
| GET | `/api/db/games/:id/analyzers` | Анализаторы для матча |
| GET | `/api/db/games/:id/analyzers/monte-carlo` | Monte Carlo симуляция |
| GET | `/api/db/games/:id/prediction` | Интегрированный прогноз |
| GET | `/api/db/games/:id/profitability` | ROI из кэша |
| GET | `/api/db/games/:id/profitability-live` | Live ROI (произвольный N) |
| GET | `/api/db/teams/search` | Поиск команд (pg_trgm) |
| GET | `/api/db/teams/:id/recent-form` | Текущая форма команды |
| GET | `/api/db/teams/:id/analyzers/:name` | Универсальный анализатор команды |
| GET | `/api/db/teams/:id/analyzers/markov-outcome` | Markov Outcome |
| GET | `/api/db/teams/:id/analyzers/hmm` | HMM (через Python-сервис) |
| GET | `/api/db/players/search` | Поиск игроков (pg_trgm) |
| GET | `/api/db/leagues/:id/pagerank` | PageRank лиги |
| GET | `/api/db/predictions/stats` | Статистика прогнозов |
| GET | `/api/db/predictions/list` | Список прогнозов |
| POST | `/api/db/predictions/generate-upcoming` | Генерация прогнозов |

### Стратегии (`/api/strategies`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/strategies` | Создать стратегию | JWT |
| GET | `/api/strategies` | Мои стратегии (all=true — все) | optional |
| GET | `/api/strategies/leaderboard` | Публичные стратегии (лидерборд) | — |
| GET | `/api/strategies/leagues` | Лиги для бэктеста | — |
| GET | `/api/strategies/:id` | Одна стратегия | JWT |
| PUT | `/api/strategies/:id` | Обновить стратегию | JWT |
| DELETE | `/api/strategies/:id` | Удалить стратегию | JWT |
| POST | `/api/strategies/games/:gameId/predict` | Прогноз по стратегии | — |
| GET | `/api/strategies/:strategyId/predictions` | Прогнозы стратегии | JWT |
| POST | `/api/strategies/:strategyId/generate-predictions` | Генерация прогнозов | JWT |
| POST | `/api/strategies/backtest` | Бэктест стратегии | — |

**Поддерживаемые анализаторы в стратегиях:** `markov_outcome`, `markov_state`, `shannon_entropy`, `form_inertia`, `multipeak`, `hmm`, `poisson`, `valenzetti`

### Model Predictions (`/api/model-predictions`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/model-predictions` | Прогнозы с фильтрацией |
| GET | `/api/model-predictions/models` | Статистика по моделям |
| GET | `/api/model-predictions/games/:gameId` | Прогнозы для матча |
| POST | `/api/model-predictions/generate` | Ручная генерация |
| POST | `/api/model-predictions/verify` | Верификация прогнозов |

### Scout (`/api/scout`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/scout/upload` | Загрузка Excel-файла |
| POST | `/api/scout/find-result` | Поиск результата события |
| POST | `/api/scout/find-results-batch` | Массовый поиск результатов |
| GET | `/api/scout/stats` | Статистика |
| GET | `/api/scout/search-team` | Поиск команды |
| POST | `/api/scout/reload-cache` | Перезагрузка кэша команд |
| POST | `/api/scout/save-upload` | Сохранение загрузки в БД |
| POST | `/api/scout/save-upload-auth` | Сохранение с авторизацией |
| GET | `/api/scout/uploads` | Список загрузок |
| GET | `/api/scout/uploads/:uploadId/events` | События по загрузке |
| GET | `/api/scout/events` | Все события (глобальный поиск) |
| GET | `/api/scout/events-v2` | События v2 (+ фильтр sources) |
| PUT | `/api/scout/events/:eventId` | Обновление события |
| DELETE | `/api/scout/uploads/:uploadId` | Удаление загрузки |
| GET | `/api/scout/competitions` | Список соревнований |
| GET | `/api/scout/summary` | Общая статистика |
| GET | `/api/scout/sources` | Уникальные источники |
| POST | `/api/scout/rematch` | Перематчинг событий |
| POST | `/api/scout/refresh-scores` | Обновление счётов |
| POST | `/api/scout/auth/login` | Логин |
| GET | `/api/scout/auth/check` | Проверка токена |
| POST | `/api/scout/auth/logout` | Выход |
| POST | `/api/scout/users` | Создать пользователя (admin) |
| GET | `/api/scout/users` | Список пользователей (admin) |
| POST | `/api/scout/users/:userId/test-login` | Тест входа (admin) |
| PUT | `/api/scout/users/:userId` | Обновить пользователя (admin) |
| DELETE | `/api/scout/users/:userId` | Удалить пользователя (admin) |

### Alerting (`/api/alerts`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/alerts/send` | Отправка алерта | admin |
| POST | `/api/alerts/test` | Тестовый алерт | admin |
| GET | `/api/alerts/history` | История алертов | admin |
| GET | `/api/alerts/stats` | Статистика алертов | admin |
| DELETE | `/api/alerts/history` | Очистка истории | admin |
| GET | `/api/alerts/config` | Конфигурация алертов | admin |

### Auth (`/api/auth`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | JWT авторизация |
| POST | `/api/auth/register` | Регистрация |
| GET | `/api/auth/me` | Текущий пользователь |
| PUT | `/api/auth/change-password` | Смена пароля |
| POST | `/api/auth/refresh` | Обновление токена |

### Cached Proxy (`/api/proxy`)

Проксирование всех SStats API эндпоинтов (42 эндпоинта) с кэшированием. Фронтенд использует прокси вместо прямых вызовов к `api.sstats.net`.

### GraphQL API (`/graphql`)

**Types:** Game, Team, Player, League, Standing, Odds, GameEvent, User, PageInfo

**Queries:**
- `game(id)`, `games(filter, pagination)`, `liveGames`
- `team(id)`, `teams(filter, pagination)`
- `player(id)`, `players(filter, pagination)`
- `standings(filter)`
- `liveOdds(gameId)`
- `users`, `me`
- `health`

**Mutations:**
- `loadGames(leagueId, season)`, `loadTeams(leagueId)`, `loadPlayers(teamId)`
- `createUser`, `updateUser`, `deleteUser`
- `login`, `refreshToken`, `logout`

**Subscriptions:**
- `gameUpdated`, `liveScoreUpdated`, `oddsUpdated`, `standingsUpdated`

### WebSocket (`/ws`)

Реалтайм-обновления матчей через WebSocket-сервер:
- `game-updates` — live-события матча
- Автоматическое переподключение
- Интеграция с Data Loader pipeline

---

## Аналитика

### JS-анализаторы (`src/analytics/analyzers/`)

| Файл | Название | Описание |
|------|----------|----------|
| `valenzetti.js` | Valenzetti | Анализатор на основе числа Валенцетти (математическая модель) |
| `valenzetti-variants.js` | Valenzetti Variants | Варианты Valenzetti (Calibration, Conservative, Aggressive, Temporal) |
| `pagerank.js` | PageRank | PageRank на графе матчей лиги |
| `poisson.js` | Poisson | Регрессия Пуассона (голы home/away) |
| `shannon-entropy.js` | Shannon Entropy | Энтропия Шеннона по исходам формы |
| `form-inertia.js` | Form Inertia | Инерция формы (скользящее среднее результатов) |
| `game-stats.js` | Game Stats | Детальная статистика матча |
| `markov-outcome.js` | Markov Outcome | Цепь Маркова по переходам исходов (W/D/L) |
| `markov-state.js` | Markov State | Цепь Маркова с расширенными состояниями |
| `match-predictor-v3.js` | Match Predictor v3 | Комбинированный предиктор v3 |
| `monte-carlo.js` | Monte Carlo | Метод Монте-Карло (1000+ симуляций) |
| `multipeak-density.js` | Multipeak Density | Многомодовая оценка плотности исходов |

**Утилиты:** `stats.js`, `team-history.js`, `league-params.js`

**Интегрированный прогноз** (`compute-prediction.js`): комбинация Markov Outcome + Markov State + Shannon + Form Inertia + Multipeak + Monte Carlo + Valenzetti с настраиваемыми весами по лиге.

### Python-анализаторы (`src/analytics-python/`)

**Сервис:** FastAPI на порту 8000 (внутренний Docker-порт)

**Фреймворк:** FastAPI + uvicorn, asyncpg, Redis-кэширование

**Зависимости:** `fastapi==0.115.0`, `uvicorn==0.30.6`, `asyncpg==0.29.0`, `redis==5.0.8`, `hmmlearn==0.3.3`, `numpy==1.26.4`, `scipy==1.13.1`, `scikit-learn==1.5.1`

**Эндпоинты Python-сервиса:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Health check (DB + Redis) |
| GET | `/analyzers` | Список зарегистрированных анализаторов |
| GET | `/analyzers/{name}/team/{team_id}` | Запуск анализатора для команды |
| POST | `/admin/cache/invalidate-team/{team_id}` | Инвалидация кэша команды |

**Анализаторы:**

| Модуль | Класс | Описание |
|--------|-------|----------|
| `analyzers/hmm.py` | `HiddenMarkovAnalyzer` | GaussianHMM (k=4: WEAK/AVG/STRONG/EXCELLENT), Baum-Welch + Viterbi, multi-dim фичи (gd, xG, shots, possession, BTTS) |

**Базовая архитектура Python:**
- `BaseAnalyzer` — абстрактный класс с декоратором `@register_analyzer`
- `TeamGameRecord` — DTO для записи матча
- Реестр анализаторов → `/analyzers` и `/analyzers/{name}/team/{team_id}`
- Кэширование в Redis (TTL `ANALYZER_CACHE_TTL_SEC`, по умолчанию 3600)
- DB через asyncpg pool

**Связь Node → Python:** `src/analytics/python-client.js` (HTTP-прокси из Node.js в Python-сервис)

---

## Frontend

### Публичные страницы (`www/`)

| Страница | Файл | Описание |
|----------|------|----------|
| Главная | `index.html` | Главная страница платформы |
| Матч | `game.html` | Детали матча и аналитика |
| Лиги | `leagues.html` | Обзор лиг |
| Прогнозы | `predictions-history.html` | История прогнозов |
| Стратегии | `strategies.html` | Управление стратегиями |

**Статические ассеты:** `app.css`, `app.js`, `components.js`

### Admin Panel (`admin-panel/`)

React JSX SPA с pages:

| Страница | Файл | Описание |
|----------|------|----------|
| Dashboard | `DashboardPage.jsx` | Обзор состояния системы |
| Monitoring | `MonitoringPage.jsx` | Мониторинг и метрики |
| Alerts | `AlertsPage.jsx` | Управление алертами |
| Cache | `CachePage.jsx` | Управление кэшем |
| Users | `UsersPage.jsx` | Управление пользователями |
| Settings | `SettingsPage.jsx` | Настройки системы |
| Login | `LoginPage.jsx` | Авторизация |

**API-клиент:** `admin-panel/src/api/client.js`
**Утилиты:** `admin-panel/src/utils/promParser.js`

---

## База данных

### Level 0: Справочники

| Таблица | Описание | Ключевые поля |
|---------|-----------|---------------|
| `countries` | Страны | `code CHAR(3) UNIQUE` |
| `bookmakers` | Букмекеры | `sstats_id UNIQUE` |

### Level 1: Основные сущности

| Таблица | Описание | Ключевые поля |
|---------|-----------|---------------|
| `leagues` | Лиги | `sstats_id`, `flashscore_id`, `priority`, `type` (domestic/international/cup) |
| `seasons` | Сезоны | `league_id`, `season` (UNIQUE) |
| `teams` | Команды | `sstats_id`, `flashscore_id`, GIN-индекс `name` |
| `players` | Игроки | `sstats_id`, `flashscore_id`, `position` (GK/DF/MF/FW), GIN-индекс `name` |

### Level 2: Матчи и коэффициенты

| Таблица | Описание | Ключевые поля |
|---------|-----------|---------------|
| `games` | Матчи (PARTITIONED по годам 2020–2027 + future) | `sstats_id`, `date`, PK: `(id, date)`, `status`, `is_live`, `is_finished` |
| `odds_prematch` | Прематч-коэффициенты | `game_id`, `bookmaker_id`, `market_id`, `selection`, `timestamp` (UNIQUE) |
| `odds_live` | Live-коэффициенты | `game_id`, `minute`, `timestamp` |

### Level 3: Детали и аналитика

| Таблица | Описание | Ключевые поля |
|---------|-----------|---------------|
| `game_statistics` | Статистика матча (40+ полей) | `game_id` (UNIQUE), xG, shots, passes, defense, goalkeeper, errors |
| `game_events` | События матча | `game_id`, `minute`, `type` (goal/yellow_card/red_card/substitution/penalty/...) |
| `game_lineups` | Составы | `game_id`, `team_id`, `player_id` (UNIQUE) |
| `game_player_stats` | Статистика игроков в матче (30+ полей) | `game_id`, `player_id` (UNIQUE) |
| `game_glicko` | Glicko-рейтинги | `game_id`, `team_id` (UNIQUE), `rating`, `rd`, `vol`, `win_probability` |
| `standings` | Турнирные таблицы | `league_id`, `season`, `team_id` (UNIQUE), constraint: `played = won + drawn + lost` |

### Level 4: Мониторинг и логи

| Таблица | Описание | Ключевые поля |
|---------|-----------|---------------|
| `error_log` | Лог ошибок | `error_id UUID`, `severity`, `category`, `trace_id`, `is_resolved` |
| `trace_log` | Распределённая трассировка | `trace_id`, `parent_trace_id`, `span_id`, `operation_type`, `duration_ms` |
| `performance_metrics` | Метрики | `metric_name`, `metric_value`, `tags` (GIN) |
| `sync_log` | Лог синхронизации | `sync_type`, `entity_type`, `status` |
| `loader_runs` | Запуски загрузчика | `run_id UUID`, `mode`, `status`, `total_steps` |
| `loader_step_results` | Результаты шагов | `run_id`, `step_name`, `step_order` |
| `loader_cursors` | Курсоры загрузчика | `run_id`, `step_id`, `cursor_data JSONB` |

### Кэш-таблицы

| Таблица | Описание |
|---------|----------|
| `team_profitability_cache` | ROI команд по рынкам (win/draw/loss/winOrDraw/winOrLoss/drawOrLoss/dnb/over25/under25) за 10/20/50 последних игр |
| `model_predictions` | Прогнозы моделей по матчам (model_name, game_id, prediction_date UNIQUE) |
| `user_strategies` | Пользовательские стратегии с конфигурацией анализаторов |
| `strategy_predictions` | Прогнозы по стратегиям (1X2 + Over/Under totals) |

### Миграции

| # | Файл | Описание |
|---|------|----------|
| 001 | `schema/postgres/001_init.sql` | Инициализация: все базовые таблицы, партиционирование, индексы, триггеры |
| 002 | `migrations/002_users.sql` | Таблица `users` (JWT auth), ENUM `user_role: admin/analyst/viewer` |
| 003 | `migrations/003_scout_tables.sql` | `scout_users`, `scout_sessions`, `scout_uploads`, `scout_events` |
| 004 | `migrations/004_historic_partitions.sql` | Исторические партиции games |
| 005 | `migrations/005_extended_game_stats.sql` | +40 колонок game_statistics, +17 game_player_stats |
| — | `migrations/20260701_create_model_predictions.sql` | `model_predictions` |
| — | `migrations/20260701_add_prediction_date.sql` | `prediction_date` + UNIQUE constraint + дедупликация |
| — | `migrations/20260701_set_strategies_public.sql` | Публичные стратегии Valenzetti |
| — | `db/migrations/20260701120000-add-totals-to-strategy-predictions.sql` | Over/Under (Totals) в `strategy_predictions` |

### Расширения PostgreSQL

- `uuid-ossp` — генерация UUID
- `pg_trgm` — триграммный поиск (`teams.name`, `players.name`)

---

## Ключевые модули

### Core (`src/core/`)

| Модуль | Описание |
|--------|----------|
| `game-status-map.js` | Маппинг статусов матча (scheduled/live/finished/postponed/...) |
| `preflight-checks.js` | Предзапусковые проверки (DB, Redis, API, Memory) |

### Database (`src/database/`)

| Модуль | Описание |
|--------|----------|
| `db-pool.js` | Connection pool (pg), singleton, health check |
| `upsert-keys.js` | UPSERT-ready ключи для таблиц |
| `table-dependencies.js` | Валидация зависимостей таблиц |
| `migrations.js` | Запуск миграций |
| `schema-lock.js` | Верификация схемы БД |

### Loader (`src/loader/`)

| Модуль | Описание |
|--------|----------|
| `data-loader.js` | Pipeline загрузки данных из SStats API (лиги, команды, матчи, коэффициенты) |

### SStats Client (`src/api/`)

| Модуль | Описание |
|--------|----------|
| `sstats-client.js` | Клиент для SStats.net API (42 эндпоинта, Bearer auth, rate limit 300/min) |
| `backend-api.js` | Fastify REST API сервер |
| `endpoint-lock.js` | Блокировка и валидация манифеста эндпоинтов |
| `response-types.js` | Типы ответов API |
| `versioning.js` | Плагин версионирования API |

### Cache (`src/cache/`)

| Модуль | Описание |
|--------|----------|
| `redis-client.js` | Redis-клиент (опциональный, graceful degradation) |
| `api-cache.js` | Кэширование SStats API-ответов |
| `query-cache.js` | Кэш DB-запросов |
| `fastify-query-cache.js` | Fastify-плагин кэширования |
| `fastify-rate-limiter.js` | Rate limiter |

### Auth (`src/auth/`)

| Модуль | Описание |
|--------|----------|
| `jwt-auth.js` | JWT-аутентификация (access + refresh tokens), роли: admin/analyst/viewer |
| `fastify-auth.js` | Fastify-плагины: `authenticate`, `optionalAuthenticate`, `requireRole`, `requirePermission` |

### Monitoring (`src/monitoring/`)

| Модуль | Описание |
|--------|----------|
| `logger.js` | Pino logger с structured logging |
| `monitoring.js` | Health monitor, tracer, error collector, metrics collector |
| `recovery-playbook.js` | Playbook восстановления после ошибок |
| `prometheus/collector.js` | Prometheus-метрики |
| `prometheus/metrics-registry.js` | Реестр метрик |
| `prometheus/middleware.js` | Prometheus middleware для Fastify |

### Jobs (`src/jobs/`)

| Модуль | Описание |
|--------|----------|
| `scheduled-jobs.js` | Менеджер cron-задач (node-cron): загрузка игр (5 мин), live-коэффициенты (1 мин), синхронизация команд/игроков (ежедневно), очистка логов (еженедельно) |
| `generate-model-predictions.js` | Генерация прогнозов моделей |
| `compute-python-analyzers.js` | Запуск Python-анализаторов по расписанию |
| `compute-team-analyzers.js` | JS-анализаторы для команд |
| `record-predictions.js` | Запись прогнозов в БД |
| `verify-predictions.js` | Верификация прогнозов |
| `verify-strategy-predictions.js` | Верификация прогнозов стратегий |

### Alerting (`src/alerting/`)

| Модуль | Описание |
|--------|----------|
| `alert-manager.js` | Менеджер алертов (severity, types, dispatch) |
| `alert-helpers.js` | Вспомогательные функции для алертов |

### Analytics (`src/analytics/`)

| Модуль | Описание |
|--------|----------|
| `compute-prediction.js` | Интегрированный прогноз (source of truth для cron record_predictions) |
| `league-calibrator.js` | Калибровка параметров по лигам |
| `league-weights.js` | Веса анализаторов по лигам |
| `python-client.js` | HTTP-клиент для Python-аналитик-сервиса |

### WebSocket (`src/websocket/`)

| Модуль | Описание |
|--------|----------|
| `ws-server.js` | WebSocket-сервер |
| `game-updates.js` | Менеджер live-обновлений матча |

### GraphQL (`src/graphql/`)

| Модуль | Описание |
|--------|----------|
| `apollo-server.js` | Apollo Server setup |
| `schema/typeDefs.js` | Schema definitions (Game, Team, Player, League, Standing, Odds, User) |
| `resolvers/index.js` | Корневой резолвер |
| `resolvers/queries.js` | Query-резолверы |
| `resolvers/mutations.js` | Mutation-резолверы |
| `resolvers/subscriptions.js` | Subscription-резолверы (real-time) |
| `resolvers/types.js` | Type-резолверы (relations) |
| `dataloaders/index.js` | DataLoader (batching + caching) |

---

## Внешние интеграции

### SStats.net API

- **Base URL:** `https://api.sstats.net`
- **Auth:** Bearer token (`SSTATS_API_KEY`)
- **Rate limit:** 300 req/min с ключом
- **Эндпоинтов:** 42 (манифест: `src/api/sstats-endpoints.manifest.json`)
- **Категории:** Games, Teams, Players, Leagues, Odds, Standings, Live, Statistics, Events, Lineups

---

## Ключевые процессы

### Стратегии и прогнозы

Стратегия = JSON-конфиг в таблице `user_strategies`, например:
```json
{
  "n_window": 20,
  "venue_filter": true,
  "league_filter": true,
  "analyzers": [
    {"name": "poisson", "weight": 0.6, "enabled": true},
    ...
  ]
}
```

API стратегий: `src/api/routes/strategies-routes.js` (CRUD, prediction, backtest endpoints).
Бэктест: `POST /api/strategies/backtest` (через rolgi-api). Возвращает summary с accuracy, hits/misses.

> **ИЗВЕСТНЫЙ БАГ:** В `predictFromAnalyzers` (`strategies-routes.js`) веса анализаторов **захардкожены** (~0.60/0.15/0.10) и **игнорируют** поле `weight` из конфига стратегии. Поэтому настройка весов в стратегии сейчас не влияет на результат. Текущая точность ~42%, изменение весов даёт лишь ±3%. Основной потенциал улучшения — в формулах анализаторов и калибровке по лигам, а не только в весах.

### Анализ и оптимизация

- **Разделяй данные:** in-sample (оптимизация) и out-of-sample (валидация). Никогда не оценивай качество на тех же данных, на которых подбирал параметры.
- **Walk-forward валидация:** обучай на ранних сезонах, проверяй на поздних.
- **Мета-стратегию** (какие признаки/параметры перебирать) обучай на разнообразном наборе лиг (~8-15 из разных регионов), а не на 1-3 — иначе не переносится.
- **Держи отложенный набор лиг** (hold-out) для финальной проверки переносимости.
- **Тесты** должны быть детерминированными (фиксируй периоды/seed).

---

## Разработка

### Доступ к системе

- **Docker:** `sudo agent-dc rolgi <command> <service>`
  - `sudo agent-dc rolgi logs --tail 100 <service>` — логи
  - `sudo agent-dc rolgi restart analytics` — перезапуск аналитики
  - `sudo agent-dc rolgi build <service>` — пересборка
- **Перезапуск аналитики после правок:** `sudo rolgi-restart-analytics`
- **PostgreSQL (readonly):** `sudo rolgi-psql-ro "SELECT ..."` — только чтение, не пиши в БД напрямую

### Git workflow

- Ветки: feature-ветки от main, PR для слияния
- Коммиты: осмысленные сообщения на английском
- **Запреты:** не пушить напрямую в main, не менять миграции без согласования

### Работа агентов

- **Рабочий цикл (двухмодельный):**
  - Opus — анализирует, проектирует формулы, ставит план
  - Субагенты (DeepSeek, роль task) — гоняют бэктесты, собирают метрики, пишут в файлы
- **Результаты прогонов** сохраняй в `/srv/projects/rolgi/.omp-lab/runs/` (JSON): стратегия, лига, сезон, конфиг, summary, дата
- **Минимизируй** число Opus-вызовов: собирай контекст пачкой, отвечай планом

---

## Быстрый старт

- [ ] Прочитать этот файл и AGENTS.md
- [ ] Проверить доступ к БД: `sudo rolgi-psql-ro "SELECT count(*) FROM games"`
- [ ] Проверить контейнеры: `sudo agent-dc rolgi ps`
- [ ] API health: `curl http://localhost:3000/health`
- [ ] Проверить логи: `sudo agent-dc rolgi logs --tail 20 api`
- [ ] Каталог анализаторов: `ls src/analytics/analyzers/` (JS) и `ls src/analytics-python/analyzers/` (Python)
- [ ] Бэктест стратегии: `POST /api/strategies/backtest` (см. раздел Backend API)
- [ ] Результаты прогонов → `.omp-lab/runs/` (JSON с датой и конфигом)
- [ ] **Не пиши в БД напрямую** — только через `rolgi-psql-ro` для чтения
