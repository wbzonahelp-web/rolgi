# Архитектура rolgi

## Высокоуровневая схема

```
┌──────────────────────────────────────────────────────────────────┐
│                          USER (browser)                           │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS
                             ▼
            ┌────────────────────────────┐
            │   rolgi-nginx (443/80)     │
            │   - SSL termination        │
            │   - Rate limiting          │
            │   - Static files (www/)    │
            └─────┬──────────────────┬───┘
                  │                  │
                  │ /api/*           │ /admin/*
                  ▼                  ▼
        ┌──────────────────┐    ┌─────────────┐
        │  rolgi-api:3000  │    │  Static     │
        │  Node + Fastify  │    │  React SPA  │
        └────┬─────────┬───┘    └─────────────┘
             │         │
             │         │ HMM запросы
             │         ▼
             │    ┌──────────────────────┐
             │    │ rolgi-analytics:8000 │
             │    │ Python FastAPI       │
             │    │ + hmmlearn           │
             │    └──────────────────────┘
             │
             ▼
      ┌──────────────┐    ┌────────────┐
      │ rolgi-       │    │ rolgi-     │
      │ postgres     │    │ redis      │
      │ rolgi_v6 DB  │    │ cache      │
      └──────────────┘    └────────────┘
                          
                          ↑
                 Внешний API (sstats.io)
                  Cron jobs тянут матчи
```

## Поток данных

### 1. Загрузка матчей из sstats

```
Cron (every minute / 15 min / hourly)
  → src/jobs/scheduled-jobs.js
  → src/loader/data-loader.js
  → src/api/sstats-client.js (HTTP к sstats.io)
  → src/database/upsert-keys.js
  → PostgreSQL (games, teams, leagues, odds_data)
```

### 2. Прогнозирование (live)

```
User → /api/db/games/:id/analyzers
  → db-routes.js (резолв матча по sstats_id)
  → загрузка истории команд (last N матчей)
  → параллельный прогон анализаторов:
      - poisson.js (Dixon-Coles)
      - markov-outcome.js (W/D/L matrix)
      - form-inertia.js (lag1 corr, persistent trend)
      - game-stats.js (momentum, scoring)
      - python-client.js → HMM (если кэш свежий)
  → Integrated Forecast v4 weighted vote:
      - Poisson: 0.60
      - Momentum: 0.15
      - HMM: 0.15
      - Form inertia: 0.10
  → JSON ответ с предсказанием + confidence
```

### 3. Стратегии и бэктест

```
User → /api/strategies/games/:id/predict (с config)
  → strategies-routes.js: computeStrategyPrediction()
  → та же логика что в Integrated Forecast но с custom весами
  → опц. сохранение в strategy_predictions

User → /api/strategies/backtest (league_id, season)
  → загрузка finished матчей сезона
  → для каждого: loadHistory + analyzers + predictFromAnalyzers
  → агрегация: hits, misses, by_outcome, accuracy
  → confidence buckets для оценки калибровки
```

### 4. Запись прогнозов и верификация

```
Cron job 10 (record_predictions, hourly)
  → находит upcoming матчи без записи в predictions_log
  → делает прогноз через integrated forecast
  → INSERT predictions_log (predicted_outcome, confidence)

Cron job 11 (verify_predictions, hourly)
  → находит finished матчи с прогнозом но без actual_outcome
  → UPDATE predictions_log (actual_outcome, is_hit)
```

## Архитектурные решения

### Резолвинг ID матча

Из-за дубликатов `sstats_id` критично использовать корректный SQL:

```sql
WHERE sstats_id = $1 OR id = $1
ORDER BY (sstats_id = $1) DESC, last_updated DESC NULLS LAST
LIMIT 1
```

Нельзя `ORDER BY g.id ASC` — берёт самый старый дубль.

### Venue split в Poisson

Анализатор Poisson требует `venue: 'home'|'away'` в каждой игре истории — для расчёта attack/defense per venue. Это добавлено в `loadGames` и `loadHistory`.

### Кэш анализаторов

`team_analyzers_cache` (~60k строк) — суточный кэш JS-анализаторов на команды. Cron 9 пересчитывает.

### Python HMM кэш

Python analytics service хранит HMM кэш на ~24h. Cron 12 прогревает.

## Ключевые модули

| Файл | Строк | Что делает |
|------|-------|-----------|
| `server.js` | ~480 | Fastify + plugins + WebSocket |
| `src/api/routes/db-routes.js` | 2267 | Главные DB endpoints + Integrated Forecast v4 |
| `src/api/routes/strategies-routes.js` | 753 | Стратегии + бэктест |
| `src/analytics/analyzers/poisson.js` | 288 | Dixon-Coles Poisson |
| `src/jobs/scheduled-jobs.js` | ~600 | Регистрация cron + диспетчер |
| `src/loader/data-loader.js` | ~400 | Загрузчик из sstats |
| `src/api/sstats-client.js` | ~300 | HTTP клиент sstats.io |

## Зоны ответственности (Bounded Contexts)

1. **Data ingestion** — `src/loader/`, `src/api/sstats-client.js`, jobs 0/3/4
2. **Analytics** — `src/analytics/`, jobs 8/9/12
3. **Predictions** — `db-routes.js` (integrated_forecast), `strategies-routes.js`, jobs 10/11/13
4. **API & UI** — `src/api/routes/*`, `www/`, `admin-panel/`
5. **WebSocket** — `src/websocket/game-updates.js`
6. **Auth** — `src/auth/`, `src/api/routes/auth.js`
