# Сессия 2026-06-30: Работа над анализаторами rolgi

## Сделано
- **Баг с весами исправлен полностью**: унифицирована логика чтения весов между `computeStrategyPrediction` и `predictFromAnalyzers` (оба endpoint — predict и backtest — теперь читают веса из `config.analyzers[].weight` с fallback на defaultWeights). **Коммит 1a7c3b1**.
- **Phase 1 (завершена)**: league-specific параметры (avg_goals, draw_boost, rho), калиброванный draw boost (threshold=0.40, cap=0.20, степень=1.5)
- **API перезапущен** и smoke test пройден после каждого коммита
- **Phase 2.0 full backtest** выполнен: 10 лиг, 2000 матчей, avg accuracy 47.2% (сравнение с Phase 1.3 48.1%)
- **Калибровка Dixon-Coles rho** (Phase 2.1): собранные per-league rho через grid search MLE на low scores 2021-2024

## Текущее состояние
- **Ветка**: `agent/analyzer-improvements`
- **Последний коммит**: `1a7c3b1` — "fix: read analyzer weights from config in computeStrategyPrediction" (Tue Jun 30 14:16:05 2026 +0200)
- **Коммиты в этой сессии** (все закоммичены):
  - `1a7c3b1` — fix: read analyzer weights from config in computeStrategyPrediction
  - `934814a` — chore: cleanup Phase 1 experiments
  - `3d1d926` — feat: Phase 1.4 conservative calibration
  - `2779e65` — feat: Phase 1.3 confidence threshold
  - `bebc69a` — feat: Phase 1.2 draw boost calibration
  - `da45e12` — feat: league-specific parameters and draw calibration
  - `d2824f9` — fix: read analyzer weights from strategy config
  - `8970a24` — Baseline: 50% accuracy
- **Accuracy Phase 1 (лучшая)**: ~48% avg (baseline was 42-52%, медиана 52.5%)
- **Accuracy Phase 2.0 (no rho calibration)**: 47.2% avg (10 лиг, 2000 матчей) — slight regression vs 48.1% Phase 1.3
- **Файлы изменены**: `strategies-routes.js`, `poisson.js`, создан `league-params.js` и конфигурационные JSON

## В процессе
- **Phase 2.1: Калибровка Dixon-Coles rho** — запущена, но **не завершена**
  - Калибровка per-league rho **выполнена** (grid search MLE):
    - Premier League: rho=0.025
    - La Liga: rho=0.000
    - Serie A: rho=-0.025
    - Eredivisie: rho=-0.050
    - Ligue 1: rho=-0.075
    - Bundesliga: rho=-0.100
    - Liga Argentina: rho=-0.075
  - Backtest с этими rho-значениями **не выполнен**: API сервер не смог подключиться к БД (hostname resolution — `postgres` Docker hostname vs `localhost` в runner)
  - Результаты калибровки сохранены в `.omp-lab/runs/phase2.1-rho-calibration-*.json`
  - Субагент `Phase21RhoCalibration` остановлен

## Не закоммичено
- Изменения в `.omp-lab/runs/` (результаты экспериментов)
- Изменён `.omp-lab/league-params.json` (Phase 2.1 мог его обновить)
- Phase 2.1 runner (`phase2.1-runner.js`)

## Следующий шаг при "продолжить"

### Основная команда
```
# Перезапустить API с localhost PostgreSQL
# Запустить Phase 2.1 backtest с per-league rho
# Продолжить по плану Phase 2
```

### Phase 2: Poisson оптимизация
1. **2.1 (прервана)**: Запустить backtest с calibrated per-league rho. Ожидание: +3-5% accuracy (с 48% до 51-53%)
2. **2.2**: League-specific avg goals (уже калиброваны, но могут быть улучшены)
3. **2.3**: Динамический draw boost (уже калиброван, но может быть адаптирован)

### Необходимые действия
1. Убедиться что API запущен и подключён к БД (через Docker hostname `postgres`, не `localhost`)
2. Запустить `node .omp-lab/runs/phase2.1-runner.js` для backtest с calibrated rho
3. Проанализировать результаты
4. Если положительные — продолжить к Phase 2.2 и 2.3
5. Итоговый backtest и предложение PR

### Ожидания
- После Phase 2 (2.1 + 2.2 + 2.3): **51-56% avg accuracy** (+3-8pp)
- DRAW hit rate: улучшение при rho-коррекции
- Стабильность между лигами: уменьшение σ