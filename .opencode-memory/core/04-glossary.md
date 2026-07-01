# Глоссарий терминов

> Важные термины проекта rolgi для единого понимания.

## Идентификаторы

### sstats_id
**External ID** из sstats.io API. Может быть:
- League sstats_id
- Team sstats_id  
- Game sstats_id

⚠️ **Проблема:** могут быть дубликаты в БД (старая версия + обновлённая). Всегда использовать резолвинг с `ORDER BY last_updated DESC`.

### id (internal_id)
**Internal PostgreSQL ID** (serial, автоинкремент). Уникальный в пределах БД.

### Резолвинг паттерн
```sql
WHERE sstats_id = $1 OR id = $1
ORDER BY (sstats_id = $1) DESC, last_updated DESC NULLS LAST
LIMIT 1
```

## Статусы матчей

| Status | Описание |
|--------|----------|
| `upcoming` | Запланирован, ещё не начался |
| `live` | Идёт прямо сейчас |
| `finished` | Завершён, есть счёт |
| `postponed` | Отложен |
| `cancelled` | Отменён |

## Исходы (outcomes)

| Outcome | Описание |
|---------|----------|
| `HOME` | Победа хозяев |
| `DRAW` | Ничья |
| `AWAY` | Победа гостей |
| `W` | Win (в контексте конкретной команды) |
| `D` | Draw |
| `L` | Loss |

## Анализаторы (analyzers)

### poisson
Dixon-Coles Poisson model. Вычисляет λ_home, λ_away, P(H/D/A), predicted_score.

**Требует:** venue split (home/away раздельно для каждой команды).

### markov_outcome
Марковская цепь по исходам (W/D/L). Вычисляет матрицу переходов и next_state_probs.

### markov_state
Марковская цепь по уровням формы (0=very_bad, 1=bad, 2=normal, 3=good, 4=excellent).

### form_inertia
Lag-1 автокорреляция формы. Если persistent (lag1 > 0.15) — команда "на волне", форма инерционна.

### game_stats
Momentum-based анализатор. Scoring (goals/game), conceding, clean sheets, fail to score, avg xG.

### shannon_entropy
Энтропия исходов последних N игр. Низкая энтропия (<0.35) — предсказуемость, возможен DRAW.

### multipeak
Бимодальность распределения голов. Высокий multipeak — команда нестабильна.

### hmm
Hidden Markov Model (Python, hmmlearn). Уровни формы как скрытые состояния. Expected next level.

### monte_carlo
Monte Carlo симуляция (1000 итераций) на основе исторических распределений.

### pagerank
PageRank команд по результатам матчей. Высокий rank = сильная команда.

### match_predictor_v3
**Устарел.** Эвристика v3 до Poisson (team_strength на основе GD/XGD). Заменён на Integrated Forecast v4.

## Integrated Forecast v4

Взвешенное голосование анализаторов (db-routes.js):
- **Poisson:** 0.60 (основа)
- **Momentum (game_stats streaks):** 0.15
- **HMM:** 0.15
- **Form inertia direction:** 0.10

**Confidence** = реальная вероятность (не нормализованный score). Используется для фильтрации прогнозов.

## Venue

**home** или **away** — где играла команда в данном матче (относительно этой команды, не матча!).

Пример: Man City vs Liverpool
- Для Man City: все матчи Man City дома → venue=home, все Man City в гостях → venue=away
- Для Liverpool: все матчи Liverpool дома → venue=home, все Liverpool в гостях → venue=away

## N-window (n, n_window)

Количество последних матчей для анализа. По умолчанию `n=20` (параметр `?n=20` в API).

## League filter (league_filter)

Если `true` — учитываются только матчи из той же лиги что и текущий матч. Если `false` — все матчи команды.

## Predictions

### predicted_outcome
`HOME` | `DRAW` | `AWAY` — что предсказала модель.

### actual_outcome
Реальный результат после завершения матча.

### is_hit
`true` если predicted_outcome === actual_outcome, иначе `false`.

### confidence
Вероятность предсказания (0.00 .. 1.00). Используется для фильтрации:
- conf >= 0.80 — высокая уверенность
- conf >= 0.70 — средняя
- conf >= 0.60 — низкая
- conf < 0.60 — не рекомендуется использовать

## Cron jobs

Все cron jobs зарегистрированы в `src/jobs/scheduled-jobs.js`. См. `knowledge/15-cron-jobs.md` для полного списка.

## Стратегии (strategies)

User-defined конфигурации анализаторов с кастомными весами. Можно создать стратегию и прогнать бэктест на исторических данных.

### Backtest
Проверка стратегии на завершённых матчах (league_id + season). Возвращает:
- `accuracy` — процент попаданий
- `by_outcome` — точность по HOME/DRAW/AWAY раздельно
- Confidence buckets — accuracy на разных порогах confidence

## ROI, Profitability

ROI команды = процент выигрыша при ставках на эту команду (учитывая odds). Кэшируется в `team_profitability_cache` (cron 8).

## Lambda (λ)

В контексте Poisson:
- **λ_home** — expected goals хозяев
- **λ_away** — expected goals гостей

Формулы:
```
λ_home = attack_home × defense_away × avg_home_goals
λ_away = attack_away × defense_home × avg_away_goals
```

## Dixon-Coles τ (tau)

Корректирующий фактор для низких счетов (0:0, 1:0, 0:1, 1:1) в Poisson модели. Учитывает корреляцию через параметр ρ (rho).

## ρ (rho)

Dixon-Coles correlation parameter. В `poisson.js` установлен `-0.10`. Отрицательное значение = меньше вероятность низких счетов чем предсказывает независимый Poisson.

## Draw boost

В `poisson.js`: если `|λ_home - λ_away| < 0.3`, вероятность DRAW увеличивается до +10%. Эмпирическая коррекция для случаев когда команды равны.

## Calibration

Подбор оптимальных параметров модели (веса анализаторов, ρ, draw_boost threshold, min_confidence) на исторических данных. Цель — максимизация accuracy.

**Текущий статус:** `league_calibration` таблица создана, но calibrator не активен (использовался для v3 эвристики). Для Poisson нужен новый grid search calibrator.

## Expected Goals (xG)

xG home, xG away — ожидаемое количество голов на основе качества моментов (предоставляется sstats.io).

## Goal Difference (GD)

`goals_for - goals_against` (для конкретной команды в конкретном матче).

## Avg goals (avg_home_goals, avg_away_goals)

Среднее количество голов в лиге:
- `avg_home_goals` — среднее голов хозяев за матч
- `avg_away_goals` — среднее голов гостей за матч

Используется в Poisson. Сейчас хардкод 1.52 / 1.32 (EPL значения). Нужна per-league калибровка (P1 приоритет).
