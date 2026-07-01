# Rolgi — Резюме сессии 2026-06-25

**Версия:** После Integrated Forecast v4 (Poisson-based)
**Предыдущий агент:** Xiaomi MiMo-V2.5-Pro (22-23 июня)
**Текущий агент:** GLM-5.2 (25 июня)

---

## 1. Контекст проекта

**Проект:** rolgi — футбольная аналитическая платформа.
**Хост:** VPS, `/srv/projects/rolgi`, пользователь `admin`.
**Стек:** Node.js 22 + Fastify + PostgreSQL 15 + Redis + Docker + Python (HMM).
**URL:** https://rolgi.com

**Контейнеры (все healthy):**
- `rolgi-api` — Node.js + Fastify (порт 3000)
- `rolgi-postgres` — PostgreSQL 15 (БД `rolgi_v6`)
- `rolgi-nginx` — nginx
- `rolgi-redis` — Redis 7
- `rolgi-analytics` — Python + FastAPI + hmmlearn (порт 8000, hostname `analytics`)

---

## 2. Что было сделано в этой сессии

### 2.1. Диагностика и bugfixes

1. **Резолвинг ID** — заменён `ORDER BY g.id ASC` → `ORDER BY g.last_updated DESC NULLS LAST` в 5 местах `db-routes.js` (prediction, analyzers, profitability-live и др.). Проблема: при `sstats_id = $1 OR id = $1` выбирался старый матч вместо свежего.

2. **Эндпоинты events/lineups/statistics** — убран JOIN по `p.date = s.date` (date конфликт при sstats_id-дубликатах). Заменён на прямой `JOIN games g ON g.id = s.game_id WHERE g.sstats_id = $1`.

3. **Фильтры на главной** — выбор сезона → авто-переключение на `statusGroup=finished`; выбор лиги → авто-переключение на `ended`.

4. **Убраны DEBUG console.log** из `game-stats.js` (2 места) и `db-routes.js` (1 место).

### 2.2. Integrated Forecast v4 (Poisson-based) — ГЛАВНОЕ

**Проблема:** v3 эвристика давала ~41% точности, confidence был сломан (75% прогнозов имели conf ≥ 0.80), DRAW недопредсказывался (1-5 из 100 вместо ~25).

**Решение:** Создан **Poisson-анализатор** (`src/analytics/analyzers/poisson.js`, 276 строк) — модель Dixon-Coles:
- `λ_home = attack_home × defense_away × avg_home_goals`
- `λ_away = attack_away × defense_home × avg_away_goals`
- `P(score = k:j) = Poisson(k, λ_home) × Poisson(j, λ_away) × τ(k,j)` (Dixon-Coles коррекция)
- Draw boost: когда `|λ_home - λ_away| < 0.3`, P(DRAW) увеличивается до +10%
- ρ = -0.10 (Dixon-Coles correlation parameter)

**Результаты бэктеста EPL (200 матчей, сырой Poisson без калибровки):**
- Общая точность: 42.5%
- DRAW: 8 предсказано, 62.5% точность (vs 1/200 раньше)
- **Confidence-фильтрация работает:**
  - min_conf=0.60: 47.5% на 29.5% матчей
  - min_conf=0.70: **56.5%** на 11.5% матчей
  - min_conf=0.80: **66.7%** на 4.5% матчей

**Integrated Forecast v4 (db-routes.js):**
- Poisson: вес 0.60 (основной предиктор)
- Momentum (streaks): вес 0.15
- HMM: вес 0.15
- Form inertia direction: вес 0.10
- Confidence = реальная вероятность, не нормализованный score

### 2.3. League Calibrator (начат, не завершён)

**Создано:**
- Таблица `league_calibration` в БД (league_id, weights JSONB, accuracy, accuracy_filtered, coverage, min_confidence)
- Модуль `src/analytics/league-calibrator.js` (444 строки) — grid search по 12 пресетам весов
- Тест на EPL показал: все 12 пресетов дают 38-41.5%, разница ±3% — **проблема не в весах, а в формуле**
- Вывод: переход на Poisson был правильным решением

### 2.4. Обновление strategies-routes.js

- `computeStrategyPrediction` (endpoint `/predict`) — обновлена до Poisson v4
- `predictFromAnalyzers` (endpoint `/backtest`) — **НЕ ОБНОВЛЕНА**, ещё использует v3 эвристику
- Добавлен `poisson` в validAnalyzers
- Добавлен `venue: isHome ? 'home' : 'away'` в loadGames (Poisson нужен venue split)
- Добавлен `aPoisson` require и analyze

---

## 3. ЧТО НЕ ЗАВЕРШЕНО — приоритеты

### [P1] Приоритет 1: Завершить predictFromAnalyzers в strategies-routes.js

Функция `predictFromAnalyzers` (строка ~538) в `strategies-routes.js` всё ещё использует v3 эвристику (team_strength, momentum, HMM, form_inertia, DRAW signals). Нужно заменить на Poisson-based v4 — так же как `computeStrategyPrediction`.

**Паттерн замены** — аналогичен тому что уже сделано в `computeStrategyPrediction`:
```javascript
// Poisson base (weight 0.60)
const poissonRes = homeResults.poisson;
if (poissonRes && poissonRes.details && !poissonRes.details.error) {
    const probs = poissonRes.details.probabilities || {};
    homeScore += (probs.home || 0.333) * 0.60;
    drawScore += (probs.draw || 0.333) * 0.60;
    awayScore += (probs.away || 0.333) * 0.60;
}
// + Momentum 0.15, HMM 0.15, Form inertia 0.10 (так же как в computeStrategyPrediction)
```

**Важно:** В бэктесте `predictFromAnalyzers` вызывается с `predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames)`. Также нужно добавить `poisson` в `homeResults` в бэктест-цикле (после `mod.analyze` для каждого анализатора, добавить `homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {avgHomeGoals: 1.52, avgAwayGoals: 1.32})`).

Также нужно добавить `venue: isHome ? 'home' : 'away'` в `loadHistory` функцию внутри бэктеста (строка ~505).

### [P2] Приоритет 2: Калибровка Poisson per-league

Сейчас Poisson использует хардкод `avgHomeGoals=1.52, avgAwayGoals=1.32` (EPL значения). Нужно:
1. Для каждой лиги считать свои `avgHomeGoals`/`avgAwayGoals` из БД
2. Сохранять в `league_calibration` (или новую таблицу `league_poisson_params`)
3. При прогнозе брать параметры лиги из БД
4. Cron для пересчёта параметров (еженедельно)

### [P3] Приоритет 3: Самообучение и калибровка

План пользователя: для каждой лиги найти оптимальные параметры модели (ρ, draw_boost threshold, min_confidence) через grid search на исторических данных. Цель — 70% точности с confidence-фильтрацией.

**Архитектура:**
- `league_calibration` таблица уже создана
- `league-calibrator.js` уже создан (но использует пресеты v3 эвристики, не Poisson)
- Нужно переделать calibrator на grid search Poisson параметров: ρ (-0.05 to -0.30), draw_boost (0 to 0.15), min_conf (0.40 to 0.80)

### [P4] Приоритет 4: UI для Poisson

В `game.html` вкладка «Анализаторы» — добавить карточку Poisson:
- Показывать λ_home, λ_away
- Показывать P(HOME/DRAW/AWAY) как проценты
- Показывать predicted_score (самый вероятный счёт)
- Показывать attack/defense ratings

### [P5] Приоритет 5: Опциональные улучшения

- Laplace-сглаживание для Markov на малых N
- Signed FormInertia (`mean(ρ_k)` без модуля)
- Hot-ROI бейджи на главной
- WebSocket push обновлений анализаторов при live-голе
- Рефакторинг db-routes.js (2344+ строк)

---

## 4. Ключевые файлы (изменённые в этой сессии)

| Файл | Что изменено | Бэкап |
|------|-------------|-------|
| `src/api/routes/db-routes.js` | Integrated Forecast v4 (Poisson), venue в loadGames, bugfixes резолвинга | `.bak.poisson.*`, `.bak.drawfix.*`, `.bak.voting.*` |
| `src/analytics/analyzers/poisson.js` | НОВЫЙ — Dixon-Coles Poisson model (276 строк) | `.bak.boost.*` |
| `src/analytics/analyzers/game-stats.js` | Убраны DEBUG console.log | `.bak.drawfix.*` |
| `src/api/routes/strategies-routes.js` | computeStrategyPrediction → Poisson v4, poisson в validAnalyzers, venue добавлен | `.bak.v3.*` |
| `src/analytics/league-calibrator.js` | НОВЫЙ — grid search calibrator (444 строки) | — |

---

## 5. Текущее состояние БД

### Таблицы

- `predictions_log` — 490 прогнозов, 155 верифицированы, 63 попадания (40.6%)
- `team_analyzers_cache` — ~60k строк (5 анализаторов × ~12k команд)
- `user_strategies` — пользовательские стратегии
- `strategy_predictions` — прогнозы стратегий
- `league_calibration` — **пустая** (калибровка не запущена)

### Реальная точность (predictions_log, 155 верифицированных):
- HOME: 51.6% (33/64)
- AWAY: 45.8% (27/59)
- DRAW: 42.9% (3/7) — недопредсказывается
- Общая: 40.6%

### Фактическое распределение исходов:
- HOME: 42.6% | DRAW: 20.6% | AWAY: 36.8%

---

## 6. Cron-задачи (19 шт)

| # | Name | Schedule | Описание |
|---|------|----------|----------|
| 0 | load_live_games | `* * * * *` | Live матчи |
| 3 | load_upcoming_games | `*/15 * * * *` | Предстоящие |
| 4 | load_finished_games | `0 * * * *` | Завершённые |
| 8 | compute_team_profitability | `30 3 * * *` | ROI кэш |
| 9 | compute_team_analyzers | `45 3 * * *` | Анализаторы кэш |
| 10 | record_predictions | `15 * * * *` | Запись прогнозов |
| 11 | verify_predictions | `25 * * * *` | Сверка прогнозов |
| 12 | compute_python_analyzers | `45 4 * * *` | HMM кэш прогрев |
| 13 | verify_strategy_predictions | `30 * * * *` | Сверка стратегий |

---

## 7. API Endpoints

### Integrated Forecast (обновлён до v4)
```
GET /api/db/games/:id/analyzers?n=20
```
Возвращает: `home_analyzers.poisson` с λ_home, λ_away, P(H/D/A), predicted_score + `integrated_forecast` с Poisson-based прогнозом.

### Strategies
```
POST   /api/strategies              — создать (auth)
GET    /api/strategies              — мои (auth)
GET    /api/strategies/leaderboard  — публичные
POST   /api/strategies/games/:id/predict  — прогноз по стратегии
POST   /api/strategies/backtest     — бэктест по лиге/сезону
GET    /api/strategies/leagues      — список лиг для бэктеста
```

### Poisson (новый)
```
GET /api/db/teams/:id/analyzers/poisson  — НЕ ЗАВЕРШЁН (нет отдельного endpoint)
```
Poisson доступен только через integrated endpoint `home_analyzers.poisson`.

---

## 8. Золотые правила (НЕ НАРУШАТЬ)

1. **Бэкап перед правкой:** `cp file file.bak.<описание>.$(date +%s)`
2. **SQL через файл** (`docker cp` + `psql -f`), не через heredoc с `$`
3. **JS/HTML правки через Python-патч** с `assert n == 1`
4. **Синтаксис-чек:** `docker exec rolgi-api node -c <file>` перед рестартом
5. **Рестарт:** `docker restart rolgi-api && sleep 12 && docker ps --filter name=rolgi-api`
6. **Резолвинг ID:** `WHERE sstats_id = $1 OR id = $1 ORDER BY (sstats_id = $1) DESC, last_updated DESC NULLS LAST`
7. **Между curl на nginx** — `sleep 6-10` (rate-limit)

---

## 9. Параметры Poisson (текущие)

```javascript
// В poisson.js
const MAX_GOALS = 10;
const RHO = -0.10;  // Dixon-Coles correlation

// В db-routes.js (хардкод EPL, нужен per-league)
const leagueAvgHome = 1.52;
const leagueAvgAway = 1.32;

// Draw boost (в poisson.js)
if (lambdaDiff < 0.3) {
    const drawBoost = (1 - lambdaDiff / 0.3) * 0.10;
}
```

### League-specific avg goals (для калибровки)
| League | avg_home | avg_away | DRAW% |
|--------|----------|----------|-------|
| EPL (39) | 1.52 | 1.32 | 32.5% |
| La Liga (140) | ~1.4 | ~1.1 | ~26% |
| Serie A (135) | ~1.3 | ~1.0 | ~28% |
| Bundesliga (78) | ~1.7 | ~1.3 | ~22% |

---

## 10. Команды для быстрой диагностики

```bash
# Контейнеры
docker ps --filter "name=rolgi" --format "table {{.Names}}\t{{.Status}}"

# predictions_log
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -c "
SELECT count(*) AS total,
       count(*) FILTER (WHERE actual_outcome IS NOT NULL) AS verified,
       count(*) FILTER (WHERE is_hit = true) AS hits
FROM predictions_log;"

# Cron
docker exec rolgi-api node /app/src/jobs/scheduled-jobs.js status 2>&1 | grep -c "Job registered"

# Integrated forecast
curl -sk "https://rolgi.com/api/db/games/1496999/analyzers?n=20" | python3 -c "
import sys,json; d=json.load(sys.stdin); fd=d['data']['integrated_forecast'];
print('predicted:', fd['predicted_outcome'], 'confidence:', round(fd['confidence'],4))"
```

---

## 11. Тестовые данные

| sstats_id | Описание |
|-----------|----------|
| 39 | Premier League (EPL) |
| 140 | La Liga |
| 135 | Serie A |
| 78 | Bundesliga |
| 1496999 | Тестовый матч (AWAY прогноз) |
| 1524043 | Live матч (Gold Coast vs Eastern Suburbs) |
| 1379344 | Man City vs Aston Villa (2026-05-24, 1:2) |

---

**Конец резюме. Следующий агент: начни с Приоритета 1 — заверши predictFromAnalyzers в strategies-routes.js.**
