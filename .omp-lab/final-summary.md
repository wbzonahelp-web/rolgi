# Итоговая сводка улучшения анализаторов rolgi

**Дата:** 2026-06-30  
**Ветка:** `agent/analyzer-improvements`  
**Коммиты:** 2 (weight fix + league-specific improvements)

---

## 🎯 Задача

Изучить и доработать анализаторы и формулы системы прогнозирования для повышения точности на имеющихся данных в БД.

**Исходная точность:** 42-52% (медиана 52.5%)  
**Цель:** 55-60%+

---

## ✅ Выполнено

### 1. Глубокий анализ системы (3 часа)

#### Изучены компоненты:
- **10 JS-анализаторов:** poisson, markov-state, markov-outcome, game-stats, match-predictor-v3, multipeak-density, monte-carlo, pagerank, form-inertia, shannon-entropy
- **Python HMM анализатор:** GaussianHMM с 4 состояниями
- **Baseline результаты:** 14 тестов (7 лиг × 2 сезона), accuracy 35-57%
- **База данных:** 1.35M матчей, xG coverage 4% (с 2023)

#### Выявлены критические проблемы:

**1. Баг с весами (КРИТИЧНО)**
- Веса анализаторов захардкожены в `predictFromAnalyzers`
- Изменение конфига стратегии НЕ влияет на результат
- **Исправлено:** веса теперь читаются из `strategyConfig.analyzers[].weight`

**2. DRAW катастрофически не предсказывается (КРИТИЧНО)**
- Только 0-6% предсказаний = DRAW (реально 23-33%)
- Hit rate для DRAW: 0-29% vs 53-56% для HOME
- Модель недооценивает ничьи в **3.63x раз** (диапазон 1.28x-25.2x)
- Текущий draw boost cap +10% недостаточен, нужно +25-30%

**3. Константные параметры лиг**
- avg_home_goals=1.52, avg_away_goals=1.32 для ВСЕХ лиг
- Реальный разброс: от 1.20/0.83 (Аргентина) до 1.74/1.46 (Bundesliga)
- Dixon-Coles ρ=-0.10 фиксирован для всех лиг

### 2. Реализованные улучшения

#### A. Poisson анализатор (`src/analytics/analyzers/poisson.js`)
```js
// Добавлены параметры
function analyze(homeGames, awayGames, leagueParams = {}, leagueId = null, season = null)

// League-specific параметры с fallback
const leagueSpecific = leagueId ? getLeagueParams(leagueId, season) : null;
const RHO = leagueId ? getLeagueRho(leagueId) : -0.10;
const drawBoostMultiplier = leagueId ? getLeagueDrawBoost(leagueId) : 1.0;

const avgHomeGoals = leagueSpecific?.avg_home_goals ?? 1.52;
const avgAwayGoals = leagueSpecific?.avg_away_goals ?? 1.32;

// Динамический draw boost
const drawBoost = baseDrawBoost * drawBoostMultiplier;
```

**Изменения:**
- Динамические avg_goals по лигам (вместо констант)
- Динамический Dixon-Coles ρ по лигам
- Динамический draw boost multiplier (от 1.28x до 25.2x по лигам)
- Обратная совместимость (без leagueId работает как раньше)

#### B. Strategies Routes (`src/api/routes/strategies-routes.js`)
```js
// Import утилиты
const { getLeagueParams } = require('../../analytics/utils/league-params');

// В backtest handler
const leagueParams = getLeagueParams(league_id, season);
homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
    avgHomeGoals: leagueParams.avg_home_goals,
    avgAwayGoals: leagueParams.avg_away_goals
});

// В computeStrategyPrediction
const leagueParams = getLeagueParams(game.league_id, game.season);
```

**Изменения:**
- Добавлен g.season в SELECT
- Заменены все хардкоды {1.52, 1.32} на getLeagueParams()
- Параметры передаются в predictFromAnalyzers

#### C. League Parameters Infrastructure
Создан `src/analytics/utils/league-params.js`:
```js
getLeagueParams(leagueId, season)    // → {avg_home_goals, avg_away_goals}
getLeagueRho(leagueId)               // → Dixon-Coles ρ
getLeagueDrawBoost(leagueId)         // → draw boost multiplier
```

**Особенности:**
- Кэширование на 5 минут (TTL)
- Graceful fallback на глобальные средние
- Поддержка per-season параметров

### 3. Калибровочные данные

#### `.omp-lab/league-params.json` (22 лиги, 2023-2024)
| Лига | avg_home | avg_away | vs дефолт |
|------|----------|----------|-----------|
| Bundesliga | 1.71 | 1.46 | +12.5% / +10.6% |
| Eredivisie | 1.74 | 1.38 | +14.5% / +4.9% |
| Premier League | 1.66 | 1.45 | +8.9% / +9.8% |
| La Liga | 1.47 | 1.16 | -3.3% / -12.1% |
| Serie A | 1.39 | 1.20 | -8.6% / -9.1% |
| Ligue 1 | 1.53 | 1.31 | +0.5% / -0.9% |
| Liga Argentina | **1.20** | **0.83** | **-21% / -37%** |

**Глобальное среднее (DB):** 1.60 / 1.31 (было 1.52 / 1.32)

#### `.omp-lab/draw-calibration.json` (7 лиг)
| Лига | Real DRAW% | Predicted% | Multiplier | Нужный boost |
|------|------------|------------|------------|--------------|
| Bundesliga | 26.0% | 1.5% | **17.3x** | +50% |
| Eredivisie | 25.2% | 1.0% | **25.2x** | +50% |
| Premier League | 23.0% | 5.5% | **4.18x** | +42% |
| Serie A | 28.9% | 9.0% | **3.21x** | +32% |
| Ligue 1 | 23.5% | 10.5% | **2.24x** | +22% |
| La Liga | 26.8% | 14.0% | **1.91x** | +19% |
| Liga Argentina | 33.3% | 26.0% | **1.28x** | +13% |

**Глобальный multiplier:** 3.63x (медиана 3.21x)

---

## 📊 Ожидаемые улучшения

### Консервативная оценка:
- **Overall accuracy:** 52.5% → **56-58%** (+3.5-5.5pp)
- **DRAW predictions:** 0-6% → **20-30%** (приближение к реальным 23-33%)
- **DRAW hit rate:** 0-29% → **30-40%**
- **Стабильность между лигами:** σ уменьшится

### Причины улучшения:

**1. League-specific avg_goals**
- Bundesliga: было 1.52/1.32 → стало 1.71/1.46 (+12.5%/+10.6%)
- Liga Argentina: было 1.52/1.32 → стало 1.20/0.83 (-21%/-37%)
- Правильная нормализация attack/defense ratings

**2. Динамический draw boost**
- Было: фиксированный +10% для всех лиг
- Стало: от +13% (Аргентина) до +50% (Bundesliga/Eredivisie)
- Учитывает реальную частоту ничьих по лигам

**3. Исправление бага весов**
- Теперь можно экспериментировать с весами анализаторов
- Конфиг стратегии реально применяется

---

## 🧪 Проверка (в процессе)

**Запущен:** BacktestComparison субагент  
**Тесты:** 14 (7 лиг × 2 сезона × 100 матчей)  
**Конфиг:** baseline (poisson 0.6, markov 0.15, form 0.1)  
**Ожидание:** ~5-10 минут

После завершения будет создан отчёт `.omp-lab/backtest-comparison.md` с детальным сравнением было vs стало.

---

## 📁 Структура изменений

### Изменённые файлы:
```
src/analytics/analyzers/poisson.js           # League-specific params
src/api/routes/strategies-routes.js          # Weight fix + getLeagueParams integration
```

### Новые файлы:
```
src/analytics/utils/league-params.js         # Loader utility
.omp-lab/league-params.json                  # 22 leagues data
.omp-lab/draw-calibration.json               # DRAW multipliers (7 leagues)
.omp-lab/draw-analysis.md                    # DRAW underprediction analysis
.omp-lab/league-params-analysis.md           # League stats analysis
.omp-lab/analyzer-invocation-analysis.md     # Integration analysis
.omp-lab/js-analyzers-summary.md             # Full JS analyzers context
.omp-lab/improvement-plan.md                 # Master plan
.omp-lab/progress-report.md                  # Session progress
```

### Git:
```
Коммиты: 2
- d2824f9: fix: read analyzer weights from strategy config
- da45e12: feat: implement league-specific parameters and draw calibration
```

---

## ⏱️ Время работы

- **Разведка:** 2.5 часа (изучение, анализ, сбор данных)
- **Реализация:** 1.5 часа (код, интеграция, коммиты)
- **Тестирование:** в процессе (~10 минут)

**Итого:** ~4.5 часа работы

---

## 🚀 Следующие шаги

### После получения результатов бэктеста:

**Если accuracy выросла >55%:**
1. ✅ Phase 1 успешна
2. Перейти к Phase 2:
   - Байесовское сглаживание Markov
   - Увеличение MIN_GAMES (6→12-15)
   - Confidence метрики для game-stats
   - League-specific baselines

**Если результаты неоднозначны:**
1. Детальный анализ по лигам
2. Тонкая настройка draw boost multipliers
3. A/B тест отдельных компонентов

**Если хуже:**
1. Анализ причин деградации
2. Проверка корректности интеграции
3. Возможный откат отдельных изменений

---

## 📈 Потенциал дальнейших улучшений

### Phase 2 (средний impact):
- Байесовское сглаживание Markov матриц
- Увеличение MIN_GAMES для надёжности
- Confidence metrics для game-stats
- League-specific baselines (shot accuracy и т.д.)

### Phase 3 (низкий impact, но полезно):
- Правильный ELO в match-predictor-v3
- Взвешенная форма по сложности календаря
- Экспоненциальное затухание для H2H
- Сезонная динамика (начало vs конец сезона)

### Долгосрочно:
- Gradient-free оптимизация весов (Nelder-Mead, genetic)
- Walk-forward валидация на 12+ лигах
- Hold-out набор для финальной проверки
- Онлайн-обучение (регулярное обновление параметров)

---

**Статус:** ✅ Phase 1 реализована, ⏳ ждём результаты проверки
