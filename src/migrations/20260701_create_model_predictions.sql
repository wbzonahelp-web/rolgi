CREATE TABLE IF NOT EXISTS model_predictions (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(50) NOT NULL,
  game_id INTEGER NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  predicted_outcome VARCHAR(10),
  home_prob NUMERIC(5,4),
  draw_prob NUMERIC(5,4),
  away_prob NUMERIC(5,4),
  confidence NUMERIC(5,4),
  details JSONB,
  actual_outcome VARCHAR(10),
  is_hit BOOLEAN,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_predictions_game ON model_predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_model_predictions_model ON model_predictions(model_name);
CREATE INDEX IF NOT EXISTS idx_model_predictions_predicted_at ON model_predictions(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_verified ON model_predictions(is_hit) WHERE is_hit IS NOT NULL;

COMMENT ON TABLE model_predictions IS 'Прогнозы от отдельных моделей для каждого матча';