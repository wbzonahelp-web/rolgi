# Architecture: Strategy Predictions Refactor

## Цель

Переписать `record-strategy-predictions.js` чтобы использовать существующий и протестированный `computePrediction` вместо `computeStrategyPrediction`, который имеет баги в headless mode.

## Проблема (до)

```javascript
// Старый подход
for (strategy of strategies) {
  for (game of upcomingGames) {
    // Вызывает computeStrategyPrediction - сложная логика с багами
    result = await computeStrategyPrediction(db, gameId, config);
    INSERT INTO strategy_predictions ...
  }
}
```

**Недостатки:**
- `computeStrategyPrediction` пересчитывает все анализаторы с нуля
- Имеет баги в headless mode
- Дублирует логику из `computePrediction`
- Сложная в поддержке

## Решение (после)

```javascript
// Новый подход
for (game of upcomingGames) {
  // Один раз вызываем ПРОТЕСТИРОВАННЫЙ computePrediction
  basePrediction = await computePrediction({ db, gameId });
  
  for (strategy of strategies) {
    // Применяем веса стратегии к базовому прогнозу
    strategyPred = applyStrategyWeights(basePrediction, strategy.config);
    INSERT INTO strategy_predictions ...
  }
}
```

**Преимущества:**
- Использует проверенный `computePrediction` (как в `record-predictions.js`)
- Вычисляет базовый прогноз один раз на игру
- Простая логика применения весов стратегии
- Нет зависимости от `computeStrategyPrediction`
- Легче поддерживать и тестировать

## Архитектура

### 1. Загрузка данных

```sql
-- Стратегии
SELECT id, config, name FROM user_strategies ORDER BY id ASC

-- Игры (48h окно)
SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id, g.date
FROM games g
WHERE g.status = 'scheduled'
  AND g.date >= now()
  AND g.date <= now() + '48 hours'::INTERVAL
  AND g.home_team_id IS NOT NULL
  AND g.away_team_id IS NOT NULL
ORDER BY g.date ASC
LIMIT 100
```

### 2. Вычисление базового прогноза

```javascript
const result = await computePrediction({
    db,
    gameId: game.id,
    n: 20,                    // дефолтное окно
    leagueFilterFlag: true,   // фильтр по лиге
    venueFilter: true,        // учёт дома/выезда
});

// Возвращает:
// {
//   data: {
//     game: { ... },
//     home_analyzers: { markov_outcome, markov_state, shannon_entropy, form_inertia, multipeak, valenzetti },
//     away_analyzers: { markov_outcome, markov_state, shannon_entropy, form_inertia, multipeak, valenzetti },
//     integrated_forecast: {
//       predicted_outcome: 'HOME'|'AWAY'|'DRAW',
//       confidence: 0-1,
//       reasons: [...],
//       _scores: { home, draw, away }
//     },
//     history_sizes: { ... }
//   }
// }
```

### 3. Применение весов стратегии

```javascript
function applyStrategyWeights(basePrediction, strategyConfig) {
    // 1. Извлекаем базовый прогноз
    const baseOutcome = basePrediction.integrated_forecast.predicted_outcome;
    const baseConfidence = basePrediction.integrated_forecast.confidence;
    
    // 2. Парсим конфиг стратегии
    // config = {
    //   analyzers: [
    //     { name: 'markov_outcome', weight: 0.3, enabled: true },
    //     { name: 'form_inertia', weight: 0.2, enabled: true },
    //     ...
    //   ]
    // }
    
    // 3. Строим карту весов
    const strategyWeights = {};
    for (const a of config.analyzers) {
        if (a.enabled !== false) {
            strategyWeights[a.name] = a.weight;
        }
    }
    
    // 4. Вычисляем weighted confidence на основе анализаторов
    let weightedConfidence = 0;
    for (const name in strategyWeights) {
        const analyzerConf = getAnalyzerConfidence(name, basePrediction);
        weightedConfidence += analyzerConf * strategyWeights[name];
    }
    
    // 5. Финальная confidence = смесь базовой и стратегической
    const strategyConfidence = baseConfidence * 0.5 + weightedConfidence * 0.5;
    
    return {
        predicted_outcome: baseOutcome,
        confidence: strategyConfidence,
        analyzer_snapshot: {
            home: basePrediction.home_analyzers,
            away: basePrediction.away_analyzers,
            integrated: basePrediction.integrated_forecast,
            history_sizes: basePrediction.history_sizes,
            strategy_weights: strategyWeights
        }
    };
}
```

### 4. Запись в БД

```sql
INSERT INTO strategy_predictions
    (strategy_id, game_id, predicted_at, predicted_outcome, confidence, analyzer_snapshot)
VALUES ($1, $2, NOW(), $3, $4, $5)
ON CONFLICT (strategy_id, game_id) DO NOTHING
```

**ON CONFLICT DO NOTHING** защищает от дублирования при повторных запусках.

## Поток данных

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Strategies & Games                   │
│  • user_strategies (id, config, name)                       │
│  • games WHERE status='scheduled' AND date IN [now, +48h]   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Process Games in Batches (concur=4)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │  For each game in batch (parallel):          │
    │                                               │
    │  basePrediction = computePrediction({        │
    │    db, gameId, n: 20,                        │
    │    leagueFilterFlag: true,                   │
    │    venueFilter: true                         │
    │  })                                          │
    │                                               │
    │  Returns:                                    │
    │  • predicted_outcome (HOME/AWAY/DRAW)        │
    │  • confidence (0-1)                          │
    │  • home_analyzers (all analyzers)           │
    │  • away_analyzers (all analyzers)           │
    │  • integrated_forecast                       │
    └──────────────────┬───────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────┐
    │  For each strategy (sequential):             │
    │                                               │
    │  strategyPred = applyStrategyWeights(        │
    │    basePrediction,                           │
    │    strategy.config                           │
    │  )                                           │
    │                                               │
    │  • Extracts strategy weights from config     │
    │  • Computes weighted confidence              │
    │  • Keeps base predicted_outcome              │
    │  • Builds analyzer_snapshot                  │
    └──────────────────┬───────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────┐
    │  INSERT INTO strategy_predictions            │
    │    (strategy_id, game_id, predicted_at,      │
    │     predicted_outcome, confidence,           │
    │     analyzer_snapshot)                       │
    │  VALUES (...)                                │
    │  ON CONFLICT (strategy_id, game_id)          │
    │    DO NOTHING                                │
    └──────────────────────────────────────────────┘
```

## Параметры

```javascript
const WINDOW_HOURS = 48;              // Горизонт планирования
const BATCH_CONCUR = 4;               // Параллельные вычисления базовых прогнозов
const MAX_GAMES_PER_STRATEGY = 100;   // Лимит игр на запуск

// Параметры computePrediction (фиксированы)
const N_WINDOW = 20;
const LEAGUE_FILTER = true;
const VENUE_FILTER = true;
```

## Статистика выполнения

```javascript
return {
    strategies: 5,        // Количество активных стратегий
    games: 23,           // Количество upcoming игр
    predicted: 115,      // Успешно записано (strategies × games)
    errors: 0,           // Ошибки
    skipped: 0,          // Пропущено
    durationMs: 12450    // Время выполнения
}
```

## Пример логики весов

Если стратегия имеет конфиг:
```javascript
{
  analyzers: [
    { name: 'markov_outcome', weight: 0.4, enabled: true },
    { name: 'form_inertia', weight: 0.3, enabled: true },
    { name: 'shannon_entropy', weight: 0.3, enabled: true }
  ]
}
```

То для каждого анализатора:
- Извлекается его `confidence` из `home_analyzers` и `away_analyzers`
- Вычисляется средний confidence: `(home_conf + away_conf) / 2`
- Применяется вес: `analyzer_conf * weight`
- Суммируется: `weighted_conf = Σ(analyzer_conf * weight)`

Финальная confidence:
```javascript
strategy_confidence = base_confidence * 0.5 + weighted_conf * 0.5
```

Это даёт баланс между базовым прогнозом и стратегическими предпочтениями.

## Сравнение с record-predictions.js

| Аспект | record-predictions.js | record-strategy-predictions.js (new) |
|--------|----------------------|--------------------------------------|
| **Источник прогноза** | `computePrediction` | `computePrediction` ✓ |
| **Таблица** | `predictions_log` | `strategy_predictions` |
| **Параметры** | Фиксированные (n=20, league=true, venue=true) | Те же фиксированные + веса стратегии |
| **Батчинг** | 8 игр параллельно | 4 игры параллельно |
| **Резервирование** | INSERT → compute → UPDATE | Сразу INSERT с ON CONFLICT |
| **Применение весов** | Нет (базовый прогноз) | Да (applyStrategyWeights) |

## Миграция

### До (старый файл сохранён)
```bash
/srv/projects/rolgi/src/jobs/record-strategy-predictions.js.backup
```

### После
```bash
/srv/projects/rolgi/src/jobs/record-strategy-predictions.js
```

Регистрация в `scheduled-jobs.js` остаётся без изменений:
```javascript
const { recordStrategyPredictions } = require('./record-strategy-predictions');
const stats = await recordStrategyPredictions(this.db);
```

## Тестирование

### Ручной запуск
```javascript
const { getDatabase } = require('../database/connection');
const { recordStrategyPredictions } = require('./record-strategy-predictions');

(async () => {
    const db = await getDatabase();
    const stats = await recordStrategyPredictions(db);
    console.log('Stats:', stats);
})();
```

### Проверка результатов
```sql
-- Количество прогнозов по стратегиям
SELECT s.name, COUNT(*) as predictions
FROM strategy_predictions sp
JOIN user_strategies s ON s.id = sp.strategy_id
WHERE sp.predicted_at >= NOW() - INTERVAL '1 hour'
GROUP BY s.id, s.name;

-- Последние прогнозы
SELECT 
    s.name as strategy,
    g.home_name,
    g.away_name,
    sp.predicted_outcome,
    sp.confidence,
    sp.predicted_at
FROM strategy_predictions sp
JOIN user_strategies s ON s.id = sp.strategy_id
JOIN games g ON g.id = sp.game_id
ORDER BY sp.predicted_at DESC
LIMIT 20;
```

## Безопасность

- **ON CONFLICT DO NOTHING** - защита от дублей при повторных запусках
- **Транзакции** - не используются, INSERT идемпотентен
- **Ошибки** - логируются, не блокируют обработку других игр/стратегий
- **Timeout** - нет явного, но computePrediction имеет внутренние таймауты

## Производительность

**Для 5 стратегий и 20 игр:**

Старый подход:
- 5 × 20 = 100 вызовов `computeStrategyPrediction`
- Каждый вызов делает полный пересчёт всех анализаторов
- ~100 секунд (по 1 сек на прогноз)

Новый подход:
- 20 вызовов `computePrediction` (батчи по 4)
- 100 вызовов `applyStrategyWeights` (легковесная функция)
- ~25 секунд (по 1 сек на базовый прогноз + negligible для весов)

**Ускорение: ~4x**

## Зависимости

```javascript
// Используется
const { computePrediction } = require('../analytics/compute-prediction.js');

// Больше НЕ используется
// const { computeStrategyPrediction } = require('../services/strategy-prediction-service');
```

`computeStrategyPrediction` остаётся в кодовой базе для других целей (API, ручное тестирование), но больше не используется в cron job'е.
