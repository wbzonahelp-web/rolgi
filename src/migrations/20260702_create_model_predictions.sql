-- Создаём таблицу model_predictions для хранения прогнозов отдельных анализаторов
-- по матчам. INSERT записи делает cron record-predictions.js после integrated прогноза.

CREATE TABLE IF NOT EXISTS model_predictions (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(64) NOT NULL,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    predicted_outcome VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    home_prob NUMERIC(6,4),
    draw_prob NUMERIC(6,4),
    away_prob NUMERIC(6,4),
    confidence NUMERIC(6,4) NOT NULL DEFAULT 0,
    details JSONB,
    actual_outcome VARCHAR(10),
    is_hit BOOLEAN,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_mp_game_id ON model_predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_mp_model_name ON model_predictions(model_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mp_game_model_date ON model_predictions(game_id, model_name, prediction_date);