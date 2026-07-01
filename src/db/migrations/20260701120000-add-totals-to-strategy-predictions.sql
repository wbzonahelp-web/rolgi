-- ============================================================
-- MIGRATION: Add Over/Under (Totals) fields to strategy_predictions
-- ============================================================
-- Created: 2026-07-01
-- Adds columns for total goals prediction (OVER/UNDER) to the
-- strategy_predictions table, enabling per-strategy total goals forecasting.
-- ============================================================

-- Добавление полей Over/Total в strategy_predictions
ALTER TABLE strategy_predictions
  ADD COLUMN IF NOT EXISTS predicted_total VARCHAR(10),     -- 'OVER' или 'UNDER'
  ADD COLUMN IF NOT EXISTS total_line NUMERIC(4,1),        -- линия тотала (2.5, 3.5 и т.д.)
  ADD COLUMN IF NOT EXISTS total_confidence NUMERIC(5,4),  -- уверенность в прогнозе тотала
  ADD COLUMN IF NOT EXISTS total_over_prob NUMERIC(5,4),   -- P(OVER)
  ADD COLUMN IF NOT EXISTS total_under_prob NUMERIC(5,4);  -- P(UNDER)

COMMENT ON COLUMN strategy_predictions.predicted_total IS 'Over/Under prediction for the total line';
COMMENT ON COLUMN strategy_predictions.total_line IS 'The total goals line (e.g., 2.5)';
COMMENT ON COLUMN strategy_predictions.total_confidence IS 'Confidence in total prediction (0-1)';
COMMENT ON COLUMN strategy_predictions.total_over_prob IS 'Probability of OVER the line';
COMMENT ON COLUMN strategy_predictions.total_under_prob IS 'Probability of UNDER the line';

-- Индекс для фильтрации по тоталам
CREATE INDEX IF NOT EXISTS idx_strategy_predictions_total
  ON strategy_predictions(predicted_total)
  WHERE predicted_total IS NOT NULL;

-- ============================================================
-- Rollback:
-- DROP INDEX IF EXISTS idx_strategy_predictions_total;
-- ALTER TABLE strategy_predictions
--   DROP COLUMN IF EXISTS predicted_total,
--   DROP COLUMN IF EXISTS total_line,
--   DROP COLUMN IF EXISTS total_confidence,
--   DROP COLUMN IF EXISTS total_over_prob,
--   DROP COLUMN IF EXISTS total_under_prob;
-- ============================================================
