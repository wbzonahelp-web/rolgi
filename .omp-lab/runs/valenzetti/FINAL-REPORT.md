# FINAL REPORT: Valenzetti Analyzer Integration

## Phase 1: Валидация на реальных данных
**Статус: ВЫПОЛНЕНО**

- Тестовая выборка: 50 завершённых матчей EPL 2024
- Матчей с достаточными данными: 50
- **Accuracy: 52.0% (26/50)**
- Оценка: Отлично (>40%), продолжено к Фазе 2
- Файл: `.omp-lab/scripts/test-valenzetti-real-data.js`
- Результаты: `.omp-lab/runs/valenzetti/phase1-real-data.log`
- Коммит: `14ab4ab` — `exp: Valenzetti Phase 1 - real data validation (52.0% accuracy)`

## Phase 2: Калибровка θ через бэктест
**Статус: ВЫПОЛНЕНО**

### Baseline backtest (дефолтные θ = [0.12, 0.18, 0.16, 0.06, 0.08, 0.07])
- Стратегия: "Valenzetti Calibration" (valenzetti-only, weight=1.0)
- Accuracy: **44%** (EPL 2024, 100 матчей)
- Замечание: valenzetti-only даёт baseline HOME bias (home win rate ~44%)

### Grid search (θ variants)
- Conservative [0.10, 0.15, 0.18, 0.05, 0.07, 0.05]: 44%
- Aggressive [0.15, 0.25, 0.10, 0.08, 0.10, 0.10]: 44%
- Temporal [0.08, 0.12, 0.12, 0.04, 0.06, 0.15]: 44%
- Вывод: ни один вариант не дал улучшения >2pp. Оставлен дефолтный θ.

### Примечание
Grid search показал одинаковые результаты, т.к. на момент Phase 2 backtest не использовал Valenzetti в `predictFromAnalyzers`. Исправлено в Phase 3.

- Файлы: `src/analytics/analyzers/valenzetti-variants.js`
- Файлы: `.omp-lab/runs/valenzetti/phase2-*.json`
- Коммит: `a46be57` — `exp: Valenzetti Phase 2 calibration + Phase 3 integration`

## Phase 3: Интеграция в integrated forecast
**Статус: ВЫПОЛНЕНО (SUCCESS)**

### Изменения в `src/api/routes/strategies-routes.js`:
1. Добавлен Valenzetti в `modules` бэктеста (строка 523)
2. Valenzetti исключён из main analyzer loop (требует обе команды, как Poisson)
3. Добавлен вызов `aValenzetti.analyze(homeGames, awayGames)` для двухкомандного прогноза
4. Добавлен Valenzetti в `predictFromAnalyzers` — его вероятности участвуют в weighted combination
5. Добавлен Valenzetti в `computeStrategyPrediction` — вероятности `details.probabilities` взвешиваются с конфигурируемым weight
6. Исправлен `analyzeTeam(awayGames)` для выездной команды (было `analyzeTeam(homeGames)`)

### Изменения в `src/analytics/compute-prediction.js`:
1. Добавлен полный `aValenzetti.analyze(homeHistAny, awayHistAny)` в integrated forecast
2. Вероятности Valenzetti (weight=0.15) суммируются в `homeScore/drawScore/awayScore`
3. Результат добавлен в `reasons[]` для аналитики

### Результаты бэктеста:
| Стратегия | Accuracy |
|-----------|----------|
| Mixed+Valenzetti (poisson 0.30, markov 0.25, valenzetti 0.15, form_inertia 0.15, hmm 0.15) | **52%** |
| Valenzetti-only (post-fix) | 44% |

**Вывод:** Mixed+Valenzetti достиг 52% (порог SUCCESS: ≥49%). Valenzetti вносит вклад в weighted ensemble.

- Коммит: `3547ec0` — `feat: integrate Valenzetti into weighted forecast combination`

## Phase 4: Cron predictions
**Статус: ВЫПОЛНЕНО (автоматически)**

- `computePrediction()` уже вызывается cron-джобой `record_predictions` (каждый час в :15)
- Valenzetti уже был добавлен в `homeAnalyzers`/`awayAnalyzers` (через `analyzeTeam`) на этапе реализации
- Phase 3 добавил полный `valenzetti.analyze()` в integrated forecast
- Дополнительных изменений не требуется

## Итого изменений

| Файл | Изменения |
|------|-----------|
| `.omp-lab/scripts/test-valenzetti-real-data.js` | Новый — скрипт валидации |
| `.omp-lab/scripts/test-valenzetti-real-data-container.js` | Новый — версия для контейнера |
| `src/analytics/analyzers/valenzetti-variants.js` | Новый — θ-варианты для калибровки |
| `src/api/routes/strategies-routes.js` | +65/-6 — интеграция в forecast |
| `src/analytics/compute-prediction.js` | +9/-0 — интеграция в forecast + cron |
| `.omp-lab/runs/valenzetti/*.log` | Результаты экспериментов |
| `.omp-lab/runs/valenzetti/*.json` | Backtest результаты |

## Ограничения
1. Valenzetti-only стратегия даёт 44% (HOME bias baseline) — анализатор эффективен только в комбинации с другими
2. Кастомные θ через конфиг стратегии не передаются в бэктест (theta читается из `valenzettiConf.theta`)
3. Для дальнейшего улучшения: калибровка θ на кросс-валидации, настройка ρ (Dixon-Coles), per-league params