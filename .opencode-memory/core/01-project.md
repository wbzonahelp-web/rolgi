# Проект rolgi — описание

**Тип:** футбольная аналитическая платформа с прогнозами на основе статистических моделей.

**URL:** https://rolgi.com
**Репозиторий:** git@github.com:wbzonahelp-web/rolgi.git
**Хост:** VPS (Hetzner / Netcup), `/srv/projects/rolgi`, пользователь `admin`

## Стек

- **Backend:** Node.js 22 + Fastify (`server.js` — точка входа, `src/` — модули)
- **DB:** PostgreSQL 15 (БД `rolgi_v6`), Redis 7
- **Frontend:** статические HTML (`www/`) + React admin panel (`admin-panel/`)
- **Analytics:**
  - JS анализаторы: `src/analytics/analyzers/` (poisson, markov, form-inertia, monte-carlo, pagerank, multipeak, shannon-entropy, game-stats, match-predictor)
  - Python FastAPI с hmmlearn: `src/analytics-python/` (порт 8000, hostname `analytics`)
- **Infra:** Docker Compose (`docker-compose.yml`, `docker-compose.override.yml`), nginx (контейнер `rolgi-nginx`)

## Контейнеры

| Name | Образ | Назначение | Порт |
|------|-------|-----------|------|
| `rolgi-api` | rolgi-api (build) | Node.js + Fastify API | 3000 |
| `rolgi-postgres` | postgres:16-alpine | PostgreSQL | 5432 |
| `rolgi-redis` | redis:7-alpine | Redis | 6379 |
| `rolgi-nginx` | nginx:alpine | Reverse proxy + SSL | 80, 443 |
| `rolgi-analytics` | rolgi-analytics (build) | Python FastAPI + HMM | 8000 |

## Доступ

- **SSH:** `admin@152.53.187.79:49222` (через bifrost-плагин в OpenCode)
- **DB:** `docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -c "<sql>"`
- **API через nginx:** `https://rolgi.com/api/...` (rate-limited, sleep 6-10s между curl)
- **API напрямую:** `docker exec rolgi-api curl http://localhost:3000/api/...` (без rate-limit)

## Ключевые директории

```
/srv/projects/rolgi/
├── server.js                    # Главный entry point (Fastify)
├── docker-compose.yml           # Основной compose файл
├── docker-compose.override.yml  # Локальные переопределения
├── Dockerfile                   # rolgi-api
├── Dockerfile.analytics         # rolgi-analytics (Python)
├── package.json
├── .env                         # Секреты (читать только грепом по ключу!)
│
├── src/
│   ├── api/
│   │   └── routes/
│   │       ├── db-routes.js          # 2267 строк — все DB endpoints + Integrated Forecast
│   │       ├── strategies-routes.js  # 753 строк — стратегии + бэктест (Poisson v4)
│   │       ├── alerts.js
│   │       ├── auth.js
│   │       ├── cached-proxy.js       # Прокси к sstats API
│   │       └── scout-routes.js       # Live матчи
│   │
│   ├── analytics/
│   │   ├── analyzers/                # JS анализаторы
│   │   │   ├── poisson.js            # Dixon-Coles model (288 строк)
│   │   │   ├── form-inertia.js
│   │   │   ├── game-stats.js
│   │   │   ├── markov-outcome.js
│   │   │   ├── markov-state.js
│   │   │   ├── match-predictor-v3.js
│   │   │   ├── monte-carlo.js
│   │   │   ├── multipeak-density.js
│   │   │   ├── pagerank.js
│   │   │   └── shannon-entropy.js
│   │   ├── python-client.js          # HTTP клиент к Python analytics
│   │   └── league-calibrator.js      # Grid search (444 строк, не активен)
│   │
│   ├── analytics-python/             # Python FastAPI (контейнер rolgi-analytics)
│   │   ├── app/main.py
│   │   └── analyzers/hmm.py
│   │
│   ├── api/                          # ⚠️ src/api/ != src/api/routes/
│   │   ├── backend-api.js
│   │   └── sstats-client.js          # Клиент к sstats.io (внешний API)
│   │
│   ├── database/
│   │   ├── db-pool.js
│   │   ├── upsert-keys.js
│   │   └── sql/                      # SQL миграции
│   │
│   ├── jobs/
│   │   ├── scheduled-jobs.js         # Регистрация всех cron jobs (19 шт)
│   │   ├── compute-team-analyzers.js
│   │   ├── compute-python-analyzers.js
│   │   ├── record-predictions.js
│   │   ├── verify-predictions.js
│   │   ├── verify-strategy-predictions.js
│   │   └── ...
│   │
│   ├── loader/
│   │   └── data-loader.js            # Загрузчик матчей из sstats
│   │
│   ├── monitoring/
│   │   └── prometheus/collector.js
│   │
│   └── websocket/
│       └── game-updates.js           # WebSocket для live обновлений
│
├── www/                              # Статика (Nginx раздаёт)
│   ├── index.html                    # Главная
│   ├── game.html                     # Страница матча с анализаторами
│   ├── leagues.html
│   ├── strategies.html
│   ├── predictions-history.html
│   └── assets/
│
├── admin-panel/                      # React admin (build → www/admin)
│   └── src/pages/...
│
├── nginx/                            # Конфиги nginx
├── monitoring/                       # Prometheus + Grafana
├── tests/
└── .opencode-memory/                 # Эта директория (память для AI)
```

## Базовые URL и эндпоинты

- `https://rolgi.com/` — главная (SPA на www/index.html)
- `https://rolgi.com/api/db/*` — основные эндпоинты (db-routes.js)
- `https://rolgi.com/api/strategies/*` — стратегии (strategies-routes.js)
- `https://rolgi.com/api/auth/*` — авторизация (auth.js)
- `https://rolgi.com/admin/` — React admin panel
- `https://rolgi.com:8000/` — Python analytics (внутренний, не публичный)

## Внешние зависимости

- **sstats.io** — поставщик футбольных данных (матчи, команды, лиги, odds)
- **Python analytics service** — внутренний контейнер для HMM
