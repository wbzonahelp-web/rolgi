-- Делаем публичными стратегии Valenzetti для всеобщего использования
UPDATE user_strategies
SET is_public = true
WHERE user_id = 1 AND name IN (
  'Valenzetti Calibration',
  'Valenzetti Conservative',
  'Valenzetti Aggressive',
  'Valenzetti Temporal',
  'Mixed+Valenzetti'
);
