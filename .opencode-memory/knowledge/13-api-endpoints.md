# API Endpoints — каталог

> Все публичные API endpoints проекта rolgi. Обновляется при добавлении новых.

## Основной API (db-routes.js)

**Префикс:** `/api/db/`

### Матчи

| Endpoint | Method | Описание | Параметры |
|----------|--------|----------|-----------|
| `/games/:id` | GET | Детали матча | `id` — sstats_id или internal id |
| `/games/:id/analyzers` | GET | Прогноз + анализаторы | `?n=20` (кол-во матчей истории), `?league_filter=true` |
| `/games/:id/events` | GET | События матча | |
| `/games/:id/lineups` | GET | Составы | |
| `/games/:id/statistics` | GET | Статистика | |
| `/games/:id/odds` | GET | Коэффициенты | |
| `/games` | GET | Список матчей | `?status=live|upcoming|finished`, `?league_id=39`, `?date=2024-06-25` |
| `/leagues` | GET | Список лиг | `?country=England` |
| `/leagues/:id` | GET | Детали лиги | |
| `/leagues/:id/games` | GET | Матчи лиги | `?season=2024`, `?status=finished` |
| `/teams/:id` | GET | Детали команды | |
| `/teams/:id/games` | GET | Матчи команды | `?n=20`, `?status=finished` |
| `/teams/:id/analyzers/:name` | GET | Кэшированный анализатор команды | `name` — markov_outcome, form_inertia и т.д. |
| `/teams/:id/profitability` | GET | ROI команды | |

### Predictions

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/predictions` | GET | Список predictions_log | `?limit=100`, `?verified=true` |
| `/predictions/:id` | GET | Детали prediction | |
| `/predictions/stats` | GET | Статистика: accuracy, hits/misses | |

### Cache

| Endpoint | Method | Описание | Auth |
|----------|--------|----------|------|
| `/cache/clear` | POST | Очистить кэш анализаторов | Admin |

---

## Strategies API (strategies-routes.js)

**Префикс:** `/api/strategies/`

| Endpoint | Method | Описание | Auth |
|----------|--------|----------|------|
| `/` | POST | Создать стратегию | User |
| `/` | GET | Мои стратегии | User |
| `/:id` | GET | Детали стратегии | Owner или public |
| `/:id` | PUT | Обновить стратегию | Owner |
| `/:id` | DELETE | Удалить стратегию | Owner |
| `/leaderboard` | GET | Публичные стратегии (сортировка по accuracy) | — |
| `/games/:id/predict` | POST | Прогноз по стратегии | — |
| `/backtest` | POST | Бэктест стратегии | — |
| `/leagues` | GET | Список лиг для бэктеста (с кол-вом матчей) | — |

### POST /games/:id/predict

**Body:**
```json
{
  "config": {
    "n_window": 20,
    "league_filter": false,
    "analyzers": [
      {"name": "poisson", "enabled": true, "weight": 0.60},
      {"name": "markov_outcome", "enabled": true, "weight": 0.15}
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "predicted_outcome": "HOME",
    "confidence": 0.5403,
    "home_analyzers": { "poisson": {...}, "markov_outcome": {...} },
    "away_analyzers": { ... }
  }
}
```

### POST /backtest

**Body:**
```json
{
  "league_id": 39,
  "season": 2024,
  "limit": 100,
  "config": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processed": 100,
    "summary": {
      "hits": 44,
      "misses": 56,
      "accuracy": 44.0,
      "by_outcome": {
        "HOME": {"predicted": 62, "hits": 29, "accuracy": 46.8},
        "DRAW": {"predicted": 3, "hits": 2, "accuracy": 66.7},
        "AWAY": {"predicted": 35, "hits": 13, "accuracy": 37.1}
      }
    },
    "results": [ ... ]
  }
}
```

---

## Auth API (auth.js)

**Префикс:** `/api/auth/`

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/register` | POST | Регистрация | Email + password |
| `/login` | POST | Логин | Email + password → JWT |
| `/me` | GET | Профиль | Auth required |
| `/refresh` | POST | Обновить JWT | |

---

## Scout API (scout-routes.js)

**Префикс:** `/api/scout/`

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/live` | GET | Live матчи с real-time данными | WebSocket alternative |

---

## Cached Proxy API (cached-proxy.js)

**Префикс:** `/api/cached/`

Прокси к sstats.io с кэшем на 10 минут.

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/leagues/:id/games` | GET | Список матчей лиги из sstats (кэш) |

---

## Alerts API (alerts.js)

**Префикс:** `/api/alerts/`

| Endpoint | Method | Описание | Auth |
|----------|--------|----------|------|
| `/` | GET | Мои алерты | User |
| `/` | POST | Создать алерт | User |
| `/:id` | DELETE | Удалить алерт | Owner |

---

## WebSocket

**URL:** `wss://rolgi.com/ws` (или `ws://localhost:3000/ws` напрямую)

**События:**
- `game-update` — обновление матча (live score)
- `analyzer-update` — пересчёт анализаторов при голе

**Формат:**
```json
{
  "type": "game-update",
  "data": {
    "game_id": 123,
    "home_score": 1,
    "away_score": 0,
    "status": "live"
  }
}
```

---

## Rate Limits (nginx)

- **Public endpoints:** 10 req/min per IP
- **Auth endpoints:** 5 req/min per IP
- **Bypass:** прямой доступ через `docker exec rolgi-api curl http://localhost:3000/...`

---

## Integrated Forecast format (в /games/:id/analyzers)

```json
{
  "success": true,
  "data": {
    "game": { ... },
    "home_analyzers": {
      "poisson": {
        "name": "poisson",
        "value": 0.798,
        "details": {
          "lambda_home": 3.83,
          "lambda_away": 0.92,
          "probabilities": {"home": 0.7988, "draw": 0.1117, "away": 0.0895},
          "predicted_score": "3:1",
          "attack_defense": { ... },
          "league_params": {"avg_home_goals": 1.52, "avg_away_goals": 1.32}
        }
      },
      "markov_outcome": { ... },
      "form_inertia": { ... },
      "game_stats": { ... },
      "hmm": { ... }
    },
    "away_analyzers": { ... },
    "integrated_forecast": {
      "predicted_outcome": "HOME",
      "confidence": 0.5403,
      "weights": {"poisson": 0.60, "momentum": 0.15, "hmm": 0.15, "form_inertia": 0.10}
    }
  }
}
```
