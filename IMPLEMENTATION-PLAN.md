# Implementation Plan: Strategy Predictions Refactor

## Обзор

Переписан `record-strategy-predictions.js` для использования протестированного `computePrediction` вместо багованного `computeStrategyPrediction`.

## Изменения

### Файл: `src/jobs/record-strategy-predictions.js`

#### Было (166 строк)
```javascript
const { computeStrategyPrediction } = require('../services/strategy-prediction-service');

// Для каждой стратегии и игры вызывался computeStrategyPrediction
for (const strategy of strategies) {
    for (const game of upcomingGames) {
        const result = await computeStrategyPrediction(db, game.id, config);
        // INSERT результат
    }
}
```

#### Стало (336 строк)
```javascript
const { computePrediction } = require('../analytics/compute-prediction.js');

// Для каждой игры вызывается computePrediction ОДИН РАЗ
for (const game of upcomingGames) {
    const basePrediction = await computePrediction({ db, gameId: game.id, ... });
    
    // Для каждой стратегии применяются веса
    for (const strategy of strategies) {
        const strategyPred = applyStrategyWeights(basePrediction, strategy.config);
        // INSERT результат
    }
}
```

## Ключевые компоненты

### 1. Функция `loadStrategies(db)` - БЕЗ ИЗМЕНЕНИЙ
```javascript
async function loadStrategies(db) {
    const res = await db.query(`
        SELECT id, config, name
        FROM user_strategies
        ORDER BY id ASC
    `);
    return res.rows;
}
```

### 2. Функция `loadUpcomingGames(db)` - БЕЗ ИЗМЕНЕНИЙ
```javascript
async function loadUpcomingGames(db) {
    const res = await db.query(`
        SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id, g.date
        FROM games g
        WHERE g.status = 'scheduled'
          AND g.is_deleted = false
          AND g.date >= now()
          AND g.date <= now() + ($1 || ' hours')::INTERVAL
          AND g.home_team_id IS NOT NULL
          AND g.away_team_id IS NOT NULL
        ORDER BY g.date ASC
        LIMIT $2
    `, [String(WINDOW_HOURS), String(MAX_GAMES_PER_STRATEGY)]);
    return res.rows;
}
```

### 3. Новая функция `applyStrategyWeights(basePrediction, strategyConfig)`

**Цель:** Применить веса стратегии к базовому прогнозу

**Вход:**
- `basePrediction` - результат `computePrediction().data`
- `strategyConfig` - конфиг стратегии с `analyzers` и весами

**Выход:**
```javascript
{
    predicted_outcome: 'HOME' | 'AWAY' | 'DRAW',
    confidence: 0-1,
    analyzer_snapshot: {
        home: { markov_outcome, markov_state, ... },
        away: { markov_outcome, markov_state, ... },
        integrated: { predicted_outcome, confidence, reasons, _scores },
        history_sizes: { home_any, home_home, away_any, away_away },
        strategy_weights: { markov_outcome: 0.3, form_inertia: 0.2, ... }
    }
}
```

**Логика:**
1. Парсит `strategyConfig.analyzers` и строит карту весов
2. Для каждого enabled анализатора вычисляет его confidence
3. Применяет веса: `weighted_conf = Σ(analyzer_conf * weight)`
4. Финальная confidence: `base * 0.5 + weighted * 0.5`
5. Outcome берётся из базового прогноза (не пересчитывается)

**Обработка анализаторов:**
- `markov_outcome`: средний confidence home/away
- `markov_state`: средний confidence home/away
- `shannon_entropy`: средний confidence home/away
- `form_inertia`: средний confidence home/away
- `multipeak`: обратная логика (1 - value)
- `valenzetti`, `poisson`, `hmm`: используется базовая confidence

### 4. Функция `recordStrategyPredictions(db)` - ПЕРЕПИСАНА

**Старая логика:**
```
for strategy in strategies:
    for game in upcomingGames (batches):
        prediction = computeStrategyPrediction(db, gameId, strategy.config)
        INSERT prediction
```

**Новая логика:**
```
for game in upcomingGames (batches):
    basePrediction = computePrediction({ db, gameId, n: 20, ... })
    
    for strategy in strategies:
        strategyPred = applyStrategyWeights(basePrediction, strategy.config)
        INSERT strategyPred
```

**Ключевые изменения:**
- ✅ Порядок циклов инвертирован: сначала игры, потом стратегии
- ✅ `computePrediction` вызывается один раз на игру
- ✅ Используются фиксированные параметры: `n=20, leagueFilterFlag=true, venueFilter=true`
- ✅ `applyStrategyWeights` - легковесная функция, быстрая
- ✅ INSERT с `ON CONFLICT DO NOTHING` остался без изменений

## Последовательность выполнения

```
1. loadStrategies(db)
   └─> SELECT id, config, name FROM user_strategies
   
2. loadUpcomingGames(db)
   └─> SELECT games WHERE status='scheduled' AND date IN [now, +48h]
   
3. for (i = 0; i < upcomingGames.length; i += BATCH_CONCUR)
   │
   ├─> batch = upcomingGames.slice(i, i + BATCH_CONCUR)
   │
   ├─> batchPredictions = Promise.all(
   │       batch.map(game => 
   │           computePrediction({ db, gameId: game.id, n: 20, ... })
   │       )
   │   )
   │
   └─> for (pred of batchPredictions)
       │
       ├─> if (pred.error) continue
       │
       └─> for (strategy of strategies)
           │
           ├─> strategyPred = applyStrategyWeights(pred.data, strategy.config)
           │
           └─> INSERT INTO strategy_predictions
                   (strategy_id, game_id, predicted_at, 
                    predicted_outcome, confidence, analyzer_snapshot)
               VALUES (...)
               ON CONFLICT (strategy_id, game_id) DO NOTHING
```

## Изменения в зависимостях

### Импорты

**Было:**
```javascript
const { computeStrategyPrediction } = require('../services/strategy-prediction-service');
```

**Стало:**
```javascript
const { computePrediction } = require('../analytics/compute-prediction.js');
```

### Используемые модули

- ✅ `../monitoring/logger` - без изменений
- ✅ `../analytics/compute-prediction.js` - теперь используется
- ❌ `../services/strategy-prediction-service` - больше не используется в этом файле

## Константы

```javascript
const WINDOW_HOURS = 48;              // Без изменений
const BATCH_CONCUR = 4;               // Без изменений
const MAX_GAMES_PER_STRATEGY = 100;   // Без изменений

// Новые (неявные, в вызове computePrediction)
const N_WINDOW = 20;
const LEAGUE_FILTER = true;
const VENUE_FILTER = true;
```

## Схема БД

### Таблица `strategy_predictions` - БЕЗ ИЗМЕНЕНИЙ

```sql
CREATE TABLE strategy_predictions (
    strategy_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    predicted_at TIMESTAMP NOT NULL,
    predicted_outcome VARCHAR(10) NOT NULL,  -- 'HOME', 'AWAY', 'DRAW'
    confidence NUMERIC(5,4) NOT NULL,        -- 0.0000 - 1.0000
    analyzer_snapshot JSONB,
    
    PRIMARY KEY (strategy_id, game_id)
);
```

INSERT остался идентичным:
```sql
INSERT INTO strategy_predictions
    (strategy_id, game_id, predicted_at, predicted_outcome, confidence, analyzer_snapshot)
VALUES ($1, $2, NOW(), $3, $4, $5)
ON CONFLICT (strategy_id, game_id) DO NOTHING
```

## Обратная совместимость

### API - БЕЗ ИЗМЕНЕНИЙ
- `GET /api/strategies/:id/predictions` - работает как прежде
- `POST /api/strategies/:id/backtest` - работает как прежде

### Другие модули
- `strategy-prediction-service.js` - остаётся в кодовой базе
- `computeStrategyPrediction` - используется в API routes, не трогаем
- `predictFromAnalyzers` - используется в backtests, не трогаем

### Cron jobs
- `scheduled-jobs.js` - регистрация без изменений
- `recordStrategyPredictions` - экспорт с тем же именем

## Тестирование

### Smoke test
```bash
cd /srv/projects/rolgi
node -c src/jobs/record-strategy-predictions.js
# Синтаксис валиден ✓
```

### Интеграционный тест
```javascript
const { getDatabase } = require('../database/connection');
const { recordStrategyPredictions } = require('./record-strategy-predictions');

(async () => {
    try {
        const db = await getDatabase();
        console.log('Running recordStrategyPredictions...');
        const stats = await recordStrategyPredictions(db);
        console.log('✓ Success:', stats);
        process.exit(0);
    } catch (err) {
        console.error('✗ Error:', err.message);
        process.exit(1);
    }
})();
```

### Проверка результатов
```sql
-- Прогнозы за последний час
SELECT 
    s.name,
    COUNT(*) as count,
    AVG(sp.confidence) as avg_confidence
FROM strategy_predictions sp
JOIN user_strategies s ON s.id = sp.strategy_id
WHERE sp.predicted_at >= NOW() - INTERVAL '1 hour'
GROUP BY s.id, s.name;

-- Сравнение с базовыми прогнозами
SELECT 
    g.home_name || ' vs ' || g.away_name as match,
    pl.predicted_outcome as base_outcome,
    pl.confidence as base_confidence,
    sp.predicted_outcome as strategy_outcome,
    sp.confidence as strategy_confidence,
    s.name as strategy_name
FROM strategy_predictions sp
JOIN user_strategies s ON s.id = sp.strategy_id
JOIN games g ON g.id = sp.game_id
LEFT JOIN predictions_log pl ON pl.game_id = g.id
WHERE sp.predicted_at >= NOW() - INTERVAL '1 hour'
ORDER BY sp.predicted_at DESC
LIMIT 20;
```

## Откат (если нужен)

```bash
cd /srv/projects/rolgi/src/jobs
cp record-strategy-predictions.js.backup record-strategy-predictions.js
# Перезапуск сервиса
pm2 restart rolgi-backend
```

## Метрики производительности

### Ожидаемые улучшения

**Для N стратегий и M игр:**

| Метрика | Старый код | Новый код |
|---------|-----------|-----------|
| Вызовов computeStrategyPrediction | N × M | 0 |
| Вызовов computePrediction | 0 | M |
| Вызовов applyStrategyWeights | 0 | N × M |
| Запросов к БД (анализаторы) | N × M × ~20 | M × ~20 |
| Общее время (N=5, M=20) | ~100s | ~25s |

**Ускорение: ~4x** за счёт переиспользования базового прогноза

### Логирование

```javascript
// Start
logger.info({
    job: 'record_strategy_predictions',
    strategies: 5,
    upcomingGames: 23,
}, 'Starting strategy prediction run');

// Per-game errors
logger.warn({
    job: 'record_strategy_predictions',
    gameId: 12345,
    error: 'Game not found',
}, 'Failed to compute base prediction');

// Per-strategy errors
logger.error({
    job: 'record_strategy_predictions',
    strategyId: 42,
    gameId: 12345,
    error: 'INSERT failed',
}, 'Failed to insert strategy prediction');

// Completion
logger.info({
    job: 'record_strategy_predictions',
    strategies: 5,
    games: 23,
    predicted: 115,
    errors: 0,
    skipped: 0,
    durationMs: 12450,
}, 'Strategy prediction run completed');
```

## Acceptance Criteria

- ✅ Синтаксис валиден (`node -c`)
- ✅ Использует `computePrediction` из `analytics/compute-prediction.js`
- ✅ Применяет веса стратегии через `applyStrategyWeights`
- ✅ INSERT в `strategy_predictions` с ON CONFLICT DO NOTHING
- ✅ Экспортирует `recordStrategyPredictions` (API совместимо)
- ✅ Логирует статистику выполнения
- ✅ Обрабатывает ошибки без прерывания других игр/стратегий
- ✅ Батчинг с `BATCH_CONCUR = 4`
- ✅ Окно 48h и лимит 100 игр
- ✅ Документация в `ARCHITECTURE-STRATEGY-PREDICTIONS.md`

## Готово к деплою

- ✅ Код написан
- ✅ Синтаксис проверен
- ✅ Бэкап создан (`.backup`)
- ✅ Архитектурная документация
- ✅ План имплементации
- ⏳ Интеграционный тест (требует запуск на живой БД)
- ⏳ Мониторинг логов после деплоя
