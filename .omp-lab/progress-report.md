# Текущий статус улучшения анализаторов rolgi

**Дата:** 2026-06-30  
**Ветка:** `agent/analyzer-improvements`  
**Статус:** 🔄 В процессе (фаза активной реализации)

---

## ✅ Что уже сделано

### 1. Исследование и анализ (100%)
- **JS-анализаторы:** Изучены все 10 файлов, выявлены проблемы в каждом
  - Poisson: ρ=-0.10 фиксирован, avg_goals=константы, draw boost недостаточен
  - Game-stats: нет confidence, базовые значения захардкожены
  - Markov: матрицы на малых данных (6-10 матчей) = шум
  - Match-predictor-v3: упрощённый ELO, форма не взвешена
  
- **Python-анализаторы:** HMM изучен, использует GaussianHMM с 4 состояниями
  
- **Результаты бэктестов:** baseline accuracy 35-57%, медиана 52.5%
  - Лучшие лиги: Eredivisie 56.5%, Premier League 55.5%
  - Худшие: Liga Argentina 41.5%, Ligue 1 46.5%
  - **DRAW катастрофа:** только 0-6% предсказаний, hit rate 0-29%

- **База данных:** 1.35M матчей, xG coverage 4% (только с 2023)

### 2. Критические исправления

#### ✅ Баг с весами (ИСПРАВЛЕН, закоммичен)
**Проблема:** Веса анализаторов были захардкожены в `predictFromAnalyzers`  
**Решение:** Веса теперь читаются из `strategyConfig.analyzers[].weight`  
**Файл:** `src/api/routes/strategies-routes.js`  
**Коммит:** `d2824f9`

```js
// До: hardcoded 0.60, 0.15, 0.10
homeScore += (probs.home || 0.333) * 0.60;

// После: динамические с fallback
const w = (name) => _w[name] ?? defaultWeights[name] ?? 0;
homeScore += (probs.home || 0.333) * w('poisson');
```

#### ✅ Инфраструктура для league-specific параметров (СОЗДАНА)
**Файл:** `src/analytics/utils/league-params.js`  
**Функции:**
- `getLeagueParams(leagueId, season)` → {avg_home_goals, avg_away_goals}
- `getLeagueRho(leagueId)` → Dixon-Coles ρ
- `getLeagueDrawBoost(leagueId)` → draw boost multiplier
- Кэширование 5 минут, fallback на глобальные дефолты

### 3. Анализы и калибровочные данные

#### ✅ DRAW Calibration (ЗАВЕРШЁН)
**Ключевые находки:**
- Модель недооценивает DRAW в **3.63x раз** (диапазон 1.28x-25.2x)
- Текущий draw boost cap **+10%** недостаточен
- **Рекомендация:** увеличить до **+25-30%** глобально
- Per-league multipliers:
  - Bundesliga: 17.3x (нужно +50%)
  - Eredivisie: 25.2x (нужно +50%)
  - Premier League: 4.18x (нужно +42%)
  - Serie A: 3.21x (нужно +32%)
  - La Liga: 1.91x (нужно +19%)
  - Ligue 1: 2.24x (нужно +22%)
  - Liga Argentina: 1.28x (нужно +13%)

**Файлы:**
- `.omp-lab/draw-calibration.json` — калибровочные коэффициенты
- `.omp-lab/draw-analysis.md` — полный анализ с рекомендациями

#### ✅ Analyzer Invocation Analysis (ЗАВЕРШЁН)
**Ключевые находки:**
- `predictFromAnalyzers` не получает league_id/season, но они доступны выше
- Два call site: backtest handler (имеет league_id/season) и computeStrategyPrediction (имеет league_id, нужно добавить season в SELECT)
- Оба site вызывают Poisson с хардкодом {1.52, 1.32}

**Рекомендации:**
1. Добавить import getLeagueParams в strategies-routes.js
2. Добавить g.season в SELECT в computeStrategyPrediction
3. Заменить хардкод на getLeagueParams() в обоих call sites

**Файл:** `.omp-lab/analyzer-invocation-analysis.md`

---

## 🔄 В работе (3 субагента)

### LeagueParams (League Parameters Specialist)
**Задача:** Собрать avg_home_goals/avg_away_goals по топ-20 лигам из БД  
**Период:** 2023-2024 сезоны  
**Выход:** `.omp-lab/league-params.json` (будет заполнен реальными данными)  
**Статус:** 🔄 Running (сбор из PostgreSQL)

### PoissonImprove (Poisson Analyzer Enhancement Specialist)
**Задача:** Интегрировать league-specific параметры в Poisson анализатор  
**Изменения:**
- Добавить параметры leagueId, season в analyze()
- Использовать getLeagueParams(), getLeagueRho(), getLeagueDrawBoost()
- Динамический draw boost с per-league multiplier
- Обратная совместимость

**Статус:** 🔄 Running (модификация poisson.js)

### StrategiesIntegration (Strategies Routes Integration Specialist)
**Задача:** Интегрировать getLeagueParams() в вызовы Poisson  
**Изменения:**
- Import getLeagueParams в strategies-routes.js
- Добавить g.season в SELECT
- Заменить хардкод на getLeagueParams() в backtest handler
- Заменить хардкод на getLeagueParams() в computeStrategyPrediction

**Статус:** 🔄 Running (модификация strategies-routes.js)

---

## 📋 Что будет дальше

### После завершения текущих задач (через ~5-10 минут):

1. **Интеграция draw calibration данных**
   - Обновить league-params.json с draw_boost_multiplier per league
   - Применить рекомендованные значения из draw-calibration.json

2. **Коммиты**
   - Закоммитить Poisson improvements
   - Закоммитить strategies-routes.js integration
   - Закоммитить league-params.json с реальными данными

3. **Первый тест**
   - Запустить baseline бэктест (14 тестов: 7 лиг × 2 сезона)
   - Сравнить: было 52.5% → стало ?%
   - Проверить DRAW predictions: было 0-6% → стало ?%
   - Проверить DRAW hit rate: было 0-29% → стало ?%

4. **Анализ результатов**
   - Если accuracy выросла >55% → продолжить Phase 2
   - Если DRAW predictions выросли >15% → калибровка работает
   - Если хуже → откатить, проанализировать

### Phase 2 (после успешного теста):
- Байесовское сглаживание для Markov анализаторов
- Увеличение MIN_GAMES (6→12-15)
- Confidence метрики для game-stats
- League-specific baselines для shot accuracy

---

## 📊 Ожидаемые улучшения

### Консервативная оценка (после Phase 1):
- **Общая accuracy:** 52.5% → **56-58%** (+3.5-5.5pp)
- **DRAW predictions:** 0-6% → **20-30%** (приближение к реальным 23-33%)
- **DRAW hit rate:** 0-29% → **30-40%** (улучшение калибровки)
- **Стабильность между лигами:** σ уменьшится

### Причины улучшения:
1. **League-specific avg_goals** вместо константных 1.52/1.32
2. **Динамический draw boost** вместо фиксированного +10%
3. **Per-league calibration** вместо one-size-fits-all

---

## 🛠️ Технические детали

### Созданные файлы:
```
src/analytics/utils/league-params.js      # Утилита загрузки параметров
.omp-lab/league-params.json               # Параметры лиг (пока placeholder)
.omp-lab/draw-calibration.json            # Калибровочные коэффициенты
.omp-lab/draw-analysis.md                 # Анализ DRAW underprediction
.omp-lab/analyzer-invocation-analysis.md  # Анализ цепочки вызовов
.omp-lab/improvement-plan.md              # Полный план улучшений
.omp-lab/progress-report.md               # Этот файл
.omp-lab/test-improvements.sh             # Скрипт проверки
.omp-lab/apply-draw-calibration.sh        # Скрипт применения калибровки
```

### Изменённые файлы:
```
src/api/routes/strategies-routes.js       # Веса из конфига (✅ закоммичено)
                                          # + интеграция getLeagueParams (🔄 в работе)
src/analytics/analyzers/poisson.js        # League-specific params (🔄 в работе)
```

### Git:
- Ветка: `agent/analyzer-improvements`
- Коммиты: 1 (weight fix)
- Ожидается: +3-4 коммита после завершения субагентов

---

## ⏱️ Время работы

- **Разведка:** ~2.5 часа (изучение, анализ, калибровка)
- **Критические исправления:** ~1 час (weight bug, инфраструктура)
- **Текущая фаза:** ~30 минут (ожидание субагентов)

**Всего:** ~4 часа работы  
**Оценка до первого теста:** +30-60 минут  
**Оценка до конца Phase 1:** +1-2 часа

---

## 🎯 Ближайшие цели

1. ✅ Дождаться завершения 3 субагентов
2. ⏳ Интегрировать draw calibration данные
3. ⏳ Закоммитить все изменения
4. ⏳ Запустить baseline бэктест
5. ⏳ Проверить результаты и принять решение о Phase 2

**Прогресс:** ~65% Phase 1 завершено
