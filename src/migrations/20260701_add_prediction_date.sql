-- Добавляем колонку prediction_date для дедупликации
ALTER TABLE model_predictions
ADD COLUMN IF NOT EXISTS prediction_date DATE DEFAULT CURRENT_DATE;

-- Заполняем существующие строки
UPDATE model_predictions
SET prediction_date = DATE(predicted_at)
WHERE prediction_date IS NULL;

-- Делаем NOT NULL
ALTER TABLE model_predictions
ALTER COLUMN prediction_date SET NOT NULL;

-- Удаляем дубли (оставляем самый свежий)
DELETE FROM model_predictions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY model_name, game_id, prediction_date
      ORDER BY predicted_at DESC
    ) as rn
    FROM model_predictions
  ) sub
  WHERE rn > 1
);

-- Добавляем UNIQUE констрейнт
ALTER TABLE model_predictions
ADD CONSTRAINT unique_model_game_date
UNIQUE (model_name, game_id, prediction_date);

COMMENT ON COLUMN model_predictions.prediction_date IS 'Дата прогноза (без времени) для дедупликации';