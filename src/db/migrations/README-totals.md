# Migration: Add Over/Under (Totals) fields to strategy_predictions

## Файл миграции

`20260701120000-add-totals-to-strategy-predictions.sql`

## Что делает

Добавляет колонки для прогноза тотала (Over/Under) в таблицу `strategy_predictions`:

| Колонка | Тип | Описание |
|---|---|---|
| `predicted_total` | VARCHAR(10) | 'OVER' или 'UNDER' |
| `total_line` | NUMERIC(4,1) | Линия тотала (например, 2.5) |
| `total_confidence` | NUMERIC(5,4) | Уверенность в прогнозе тотала |
| `total_over_prob` | NUMERIC(5,4) | Вероятность OVER |
| `total_under_prob` | NUMERIC(5,4) | Вероятность UNDER |

## Применение

```bash
# Через docker compose
cat src/db/migrations/20260701120000-add-totals-to-strategy-predictions.sql | docker compose exec -T db psql -U rolgi

# Или через psql напрямую
psql -U rolgi -d rolgi -f src/db/migrations/20260701120000-add-totals-to-strategy-predictions.sql
```

## Откат

```sql
DROP INDEX IF EXISTS idx_strategy_predictions_total;

ALTER TABLE strategy_predictions
  DROP COLUMN IF EXISTS predicted_total,
  DROP COLUMN IF EXISTS total_line,
  DROP COLUMN IF EXISTS total_confidence,
  DROP COLUMN IF EXISTS total_over_prob,
  DROP COLUMN IF EXISTS total_under_prob;
```

## Примечания

- Миграция использует `IF NOT EXISTS` / `IF EXISTS` для идемпотентности
- Индекс создаётся частичным (только для не-NULL записей)
- После применения миграции перезапустите API
