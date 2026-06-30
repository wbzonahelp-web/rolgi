# JS Analyzers — Full Context Summary

## Общая структура

- **Код:** `src/analytics/analyzers/*.js` (10 файлов)
- **Утилиты:** `src/analytics/utils/stats.js` (mean, std, quantile, autocorr, histogram, shannonEntropy, ...)
- **Общий контракт:** каждый анализатор экспортирует `analyze(games, ...)`, возвращает `{ value, confidence, details }`

---

## 1. `poisson.js` — Poisson / Dixon-Coles

### Метрика
Вероятность исходов футбольного матча (HOME/DRAW/AWAY) по модели Пуассона с поправкой Dixon-Coles.

### Формулы

```
λ_home = homeAttack × awayDefense × avgHomeGoals
λ_away = awayAttack × homeDefense × avgAwayGoals
```

где `attack` = (avg_goals_for команды в этом venue) / league_avg, `defense` = (avg_goals_against) / league_avg.

Вероятность конкретного счёта:

```
P(h:a) = PoissonPMF(h, λ_home) × PoissonPMF(a, λ_away) × τ(h, a, λ_home, λ_away, ρ)

PoissonPMF(k, λ) = λ^k × e^{-λ} / k!
```

**Dixon-Coles τ** (коррекция для низких счетов, фикс ρ):

| (h, a)  | τ                                           |
|---------|---------------------------------------------|
| (0, 0)  | 1 - λ_home × λ_away × ρ                     |
| (1, 0)  | 1 + λ_away × ρ                              |
| (0, 1)  | 1 + λ_home × ρ                              |
| (1, 1)  | 1 - ρ                                       |
| прочие  | 1                                           |

где **ρ = -0.10** (снижает вероятность редких низких счетов, подгоняя под наблюдаемые частоты).

Итоговые вероятности суммируются по всем счётам 0..MAX_GOALS (10) и нормализуются.

**Draw boost:** если |λ_home - λ_away| < 0.3, добавляется до +10% к P(DRAW).

### Параметры

| Параметр         | Значение по умолчанию |
|------------------|-----------------------|
| MAX_GOALS        | 10                    |
| RHO              | -0.10                 |
| avgHomeGoals     | 1.52 (leagueParams)   |
| avgAwayGoals     | 1.32 (leagueParams)   |
| MIN_GAMES        | 6                     |
| venue_weight     | 0.6 / raw avg 0.4     |

### Данные
- `homeGames`: матчи команды (gf, ga, venue)
- `awayGames`: матчи соперника (gf, ga, venue)
- `leagueParams`: средние голы лиги дома/в гостях
- Внутреннее разделение по venue: home/home stats и away/away stats, с fallback на общие средние

### Проблемы / ограничения
1. **λ_home/λ_away** вычисляются как взвешенная смесь venue-specific attack×defense (0.6) и сырой средней результативности (0.4) — эвристика, не следующая каноническому Dixon-Coles
2. `homeAttack` берётся только из домашних игр, `awayDefense` только из выездных — при малом количестве матчей одного venue репрезентативность падает
3. League params (avgHomeGoals, avgAwayGoals) — константы из лиги, сезонная динамика не учитывается
4. Ряд соперника (awayGames) нужен для расчета его defense — в реальном пайплайне может отсутствовать
5. Факториал считается итеративно, без кэша, на каждый вызов PMF (11×11 = 121 вызов)
6. ρ фиксирован на -0.10, не подбирается под конкретную лигу/сезон

---

## 2. `game-stats.js` — Game Stats Analyzer

### Метрика
Сила команды (-1..+1) на основе продвинутой статистики: xG, владение, удары.

### Формула

```
score = tanh(avgXGDiff × 2) × 0.50     // xG diff — вес 0.50
      + tanh(xgTrend × 3) × 0.15        // тренд xG — вес 0.15
      + (avgShotAccuracy - 0.35) × 0.10  // точность ударов
      + (bigChanceRatio - 0.10) × 0.10   // ratio больших моментов
      + (avgPossession - 50) / 100 × 0.05
      + tanh(avgGoalsPrevented × 0.5) × 0.05
      + tanh(avgTouchesInBox / 20) × 0.05
```

Все компоненты суммируются, результат зажат в [-1, 1]. Категории: strong (>0.3), above_average (>0.1), average (>-0.1), below_average (>-0.3), weak.

### Параметры

| Параметр           | Значение       |
|--------------------|----------------|
| Recent window      | 20 матчей      |
| Shot accuracy baseline | 0.35 (35%) |
| Big chance baseline | 0.10 (10%)    |

### Данные
- `game.xg_for`, `game.xg_against`, `game.possession`, `game.shots`, `game.shots_on_target`, `game.big_chances`, `game.goals_prevented`, `game.touches_in_opp_box`, `game.outcome`, `game.gd`

### Проблемы / ограничения
1. **Нет confidence** — всегда undefined (поле не возвращается)
2. Компоненты xG diff, shot accuracy и big_chance_ratio не нормированы к лиге; сравнивать команды из разных лиг некорректно
3. Базовые уровни (shot accuracy 35%, big chance ratio 10%) — хардкод, могут не соответствовать лиге
4. `tanh` насыщает сигнал, теряя различие между avgXGDiff=2 и avgXGDiff=5
5. Если xg_diff=0, xG conversion = 1 (деление на ноль защищено)
6. Категоризация хрупкая — границы 0.1/0.3 произвольны

---

## 3. `match-predictor-v3.js` — Match Predictor v3

### Метрика
Вероятности HOME/DRAW/AWAY на основе 6 факторов с весами.

### Формула
```
base: homeProb=0.55, drawProb=0.25, awayProb=0.20
homeProb += eloDiff × 0.20  + formDiff × 0.25  + markovDiff × 0.15  + h2h_corr × 0.15  + context 0.10
awayProb -= eloDiff × 0.20  + formDiff × 0.25  + markovDiff × 0.15  + h2h_corr × 0.15  + context 0.10
```

Сумма нормализуется делением на total.

**ELO:** начальный 1500, K=32, actual=1/0.5/0, expected=0.5 (средний соперник). Результат зажат в [1000, 2500].

**Form:** за последние 5 матчей: W=3, D=1, L=0, нормализация на /15. Серии: 3+W → hot, 3+L → cold.

**H2H:** homeWinRate / total, пороги: >0.6 home_strong, <0.4 away_strong, >0.4 draw_heavy.

### Веса

| Фактор           | Вес    |
|------------------|--------|
| homeAdvantage    | 0.15   |
| ELO              | 0.20   |
| Form             | 0.25   |
| H2H              | 0.15   |
| Markov           | 0.15   |
| Context          | 0.10   |

### Данные
- `homeTeam.recentGames`, `awayTeam.recentGames`: массивы с outcome, gf, ga
- `homeTeam.h2hGames`: матчи между командами
- `homeTeam.markovScore`, `awayTeam.markovScore`: от markov-state анализатора
- `context.isDerby`, `context.isCovid`

### Проблемы / ограничения
1. **ELO** упрощён до expected=0.5 — не учитывает силу соперника, превращаясь в скользящую среднюю
2. **Form** не взвешивает силу соперника; победа над лидером и аутсайдером равна
3. **H2H** не взвешивает давность матчей — старые встречи дают тот же вклад
4. Веса не калиброваны, не выучены на данных
5. Контекстные корректировки (derby/covid) — эвристики × вес контекста
6. Markov score внешний, не вычисляется внутри предиктора
7. MIN_GAMES=5, MIN_H2H=3 — очень мало, high variance

---

## 4. `multipeak-density.js` — MultiPeakDensity

### Метрика
Мультимодальность ряда xG_diff: насколько результаты команды распадаются на кластеры. Значение = 0 (один пик) ... 0.75 (4+ пика).

### Формула
```
nBins = min(20, max(5, round(sqrt(N))))
hist = histogram(series, nBins)
thresholdHeight = mean(counts) + 0.5 × std(counts)
thresholdShare = 0.15

peak = counts[i] > counts[i-1] && counts[i] > counts[i+1] 
        && counts[i] > thresholdHeight
        && counts[i] / total ≥ 0.15

multimodality = peakCount ≤ 1 ? 0 : 1 - 1/peakCount
// 2 пика → 0.5, 3 → 0.67, 4 → 0.75
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 10           |
| thresholdHeight  | mean + 0.5σ  |
| thresholdShare   | 0.15 (15%)   |
| nBins            | √N, [5, 20]  |

### Данные
- `games[].xg_diff` (primary), fallback на `games[].gd`

### Проблемы / ограничения
1. Порог 0.15 от total для пика — может отсекать реальные пики при малом N
2. nBins = √N может давать шумные гистограммы при N < 20
3. Граничные бины (index=0 и index=nBins-1) проверяются с одним соседом — менее надёжно
4. Confidence = N/30, насыщение на 30 — жёстко
5. Поле 'gd' используется как последний fallback без проверки наличия

---

## 5. `monte-carlo.js` — Monte Carlo Betting

### Метрика
`edge_per_bet = posterior_p × odds - 1` — насколько букмекерские odds завышены относительно модели.

### Формула

```
recentN      = min(10, outcomes.length)
recentP      = target_победы / recentN
empiricalP   = target_победы / total
prior        = priorWinRate ?? empiricalP
posteriorP   = 0.5 × prior + 0.5 × recentP   // зажат в [0.01, 0.99]

edge         = posteriorP × odds - 1
impliedP     = 1 / odds                        // вероятность букмекера

Kelly        = ((b × p) - q) / b, где b = odds - 1, q = 1 - p
halfKelly    = Kelly × 0.5, cap 0.10
```

**Monte Carlo:** 5000 симуляций × 50 ставок, compounding: win → bk × (1 + f×(odds-1)), lose → bk × (1 - f). Результаты: mean, median, std, VaR5%/95%, Sharpe ratio.

**Рекомендация** по edge:

| edge         | recommendation |
|--------------|----------------|
| ≤0           | SKIP           |
| <0.03        | CAUTIOUS       |
| <0.10        | TAKE           |
| ≥0.10        | STRONG_TAKE    |

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 8            |
| N_RUNS           | 5000         |
| N_GAMES_PER_RUN  | 50           |
| KELLY_MULTIPLIER | 0.5 (half)   |
| KELLY_CAP        | 0.10 (10%)   |
| wRecent          | 0.5          |

### Данные
- `input.games[].outcome` ('W'/'D'/'L')
- `input.odds` (букмекерский коэффициент)
- `input.target` ('W' по умолчанию)
- `input.priorWinRate` (опционально)

### Проблемы / ограничения
1. wPrior = wRecent = 0.5 — фиксированные веса, не адаптируются под волатильность
2. Recent = последние 10 матчей — жесткое окно
3. RNG (makeRng) — simple LCG (41-45), не криптостойкий, может давать артефакты
4. Monte Carlo проекция на 50 ставок — compounding с Kelly, не учитывает последовательность (каждая симуляция рандомна, порядок не имеет значения, но дисперсия серий не моделируется)
5. Игнорируется корреляция между ставками

---

## 6. `pagerank.js` — League PageRank

### Метрика
PageRank графа побед в лиге. Значение = PR лидера для совместимости; details содержит рейтинг всех команд.

### Формула

```
Граф: directed, ребро loser → winner
Вес ребра: |score_diff| + 1
PageRank: graphology-pagerank, alpha = 0.85, getEdgeWeight = 'weight'

team_stats одновременно собираются:
  games, wins, draws, losses, gf, ga
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_MATCHES      | 20           |
| MIN_TEAM_GAMES   | 5            |
| alpha            | 0.85         |
| getEdgeWeight    | 'weight'     |

### Данные
- `matches[].home_team_id, away_team_id, home_score, away_score`
- Ничьи пропускаются (drawsSkipped)

### Проблемы / ограничения
1. **Ничьи не создают рёбер** — PR теряет информацию о ничьих (половина исходов)
2. Вес ребра >1 для крупных побед — это хорошо, но может перекашивать при аномальных счётах (6-0)
3. Зависимость от `graphology` и `graphology-metrics` — внешние библиотеки
4. MIN_TEAM_GAMES=5 — команды с <5 матчами исключаются из финального рейтинга
5. PR не нормализован — значения лидера могут сильно различаться между лигами
6. Не учитывает home/away — победа дома и в гостях весит одинаково

---

## 7. `form-inertia.js` — FormInertia

### Метрика
Средняя абсолютная автокорреляция ряда (Lag 1..MAX_LAG) — насколько прошлый результат предсказывает следующий.

### Формула

```
chrono = games.slice().reverse()  // oldest → newest
series = xg_diff (или gd)

lim = min(MAX_LAG, floor(N/2))
inertia = mean(|autocorr(series, k)|)  для k=1..lim

trend: ρ₁>0 → 'persistent', ρ₁<0 → 'oscillating', ρ₁≈0 → 'random'
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 8            |
| MAX_LAG          | 9            |
| confidence_sat   | N/20         |

### Данные
- `games[].xg_diff` (primary), fallback `games[].gd`

### Проблемы / ограничения
1. **Автокорреляция** на коротких рядах (N=8..15) — очень шумная оценка
2. MAX_LAG=9 может превышать N/2 при N<18, lim = floor(N/2) в этом случае
3. Ряд переворачивается chrono, но analyze ожидает games от свежих к старым — корректно
4. Confidence = N/20, насыщение на 20 матчах
5. Не штрафует за инфляцию Type I при проверке множества лагов

---

## 8. `shannon-entropy.js` — Shannon Entropy

### Метрика
Нормализованная энтропия Шеннона тотала голов (gf+ga) команды. ∈[0, 1]: 0 = все матчи одинаковы, 1 = максимально разнообразны.

### Формула

```
totalGoals = gf + ga (или xg_for + xg_against)
H = -Σ p_i · log2(p_i) / log2(N_bins)
value = H (нормализованная)
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 6            |
| N_BINS           | 10           |
| confidence_sat   | N/20         |

### Данные
- `games[].gf, .ga` (тоталы голов, обязательные)
- `games[].xg_for, .xg_against` (xG тоталы, опционально)

### Проблемы / ограничения
1. N_BINS=10 для тоталов голов (обычно 0..7) — может давать разреженные бины
2. xG тоталы считаются отдельно и возвращаются как справочные, не влияют на value
3. Отсутствует проверка на «осмысленность»: команда с 5 матчами [1-0, 0-1, 1-0, 0-1, 1-0] даст энтропию ~0.5, но это может быть артефактом малой выборки
4. Нет различения между «предсказуемо плохой» и «предсказуемо хорошей» командой — только разнообразие

---

## 9. `markov-state.js` — Markov Chain State

### Метрика
Предсказуемость команды (0..1) на основе матрицы переходов 4×4 между квартильными состояниями xG_diff/gd.

### Формула

```
1. Квартили: q25, q50, q75
2. Дискретизация: value → LOW(0), MED_LOW(1), MED_HIGH(2), HIGH(3)
3. Матрица переходов 4×4 (counts → prob по строкам)
4. avgRowEntropy = mean( entropy(row) ) для каждой строки
5. maxEntropy = log2(4) = 2
6. predictability = max(0, min(1, 1 - avgRowEntropy / maxEntropy))
7. nextState = argmax(matrix[currentState][:])
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 10           |
| STATES           | 4 (LOW, MED_LOW, MED_HIGH, HIGH) |
| confidence_sat   | N/20         |

### Данные
- `games[].xg_diff` (primary), fallback `games[].gd`
- Ожидает хронологический порядок от свежих к старым (reverse внутри)

### Проблемы / ограничения
1. **Квартили по xG_diff** — дискретизация зависит от распределения выборки; 4 корзины при N=10 (минимум) дают ~2.5 элемента на корзину — статистически шумно
2. predict = 1 - H/max(H). H≈0 означает, что команда всегда из LOW→LOW — это может быть «залипание» в плохой форме, а не истинная предсказуемость
3. Матрица 4×4 = 16 параметров, при N=10..20 ячейки почти пустые, probabilities ненадёжны
4. Состояния пересчитываются с нуля на каждом вызове — не накапливаются между матчами
5. Состояние LOW неотличимо от MED_LOW для прогноза, если распределение смещено

---

## 10. `markov-outcome.js` — Markov Match Outcome

### Метрика
Произведение вероятности argmax перехода × стабильность серий: значение ∈ [0, 1], где выше = увереннее прогноз.

### Формула

```
1. Матрица переходов 3×3 (W/D/L)
2. currentState = последний outcome в хронологическом порядке
3. bestProb = max(matrix[currentState][:])  // argmax
4. Серии: avgStreakLen = mean(lengths of consecutive same outcomes)
5. streakPredictability = 1 - 1 / (1 + avgStreakLen)  // ∈ (0, 1]
   avg=1 → 0.5, avg=3 → 0.75, avg→∞ → 1
6. value = bestProb × streakPredictability
```

### Параметры

| Параметр         | Значение     |
|------------------|--------------|
| MIN_GAMES        | 6            |
| STATES           | 3 (W, D, L)  |
| confidence_sat   | N/20         |

### Данные
- `games[].outcome` ('W'/'D'/'L')

### Проблемы / ограничения
1. **Матрица 3×3 = 9 параметров**, при MIN_GAMES=6 оценка крайне шумная (всего 5 переходов)
2. bestProb может быть 1.0 при одном наблюдении в строке — overconfidence
3. streakPredictability растёт с длиной серии, но не штрафует за малое количество данных
4. Серии считаются в хронологическом порядке, а зная только outcome, нельзя отличить 3W подряд от 3W с пропусками
5. Ничьи (D) систематически менее вероятны (≈25%), что смещает матрицу

---

## Кросс-аналитические наблюдения

### Связи между анализаторами
- `match-predictor-v3.js` вызывает `markov-state.js` через `markovScore`
- `form-inertia.js` и `multipeak-density.js` анализируют один и тот же ряд (xg_diff, fallback gd)
- `markov-state.js` и `markov-outcome.js` — две разные марковские модели (состояния по xG vs outcomes)

### Общие параметры
- **MIN_GAMES** варьируется от 6 до 10 — минимальный порог для работы анализатора
- **Confidence** почти везде = min(1, N / X), где X = 20 или 30 — линейная шкала
- **Утилиты:** все используют `src/analytics/utils/stats.js` для mean, std, autocorr, histogram, quantiles, shannonEntropy

### Общие ограничения
1. **Малая выборка** — большинство анализаторов работают на 6..20 матчах, статистическая значимость низкая
2. **Отсутствие калибровки** — веса и пороги фиксированы, не выучены на исторических данных
3. **Нет различения по лигам** — параметры (avg goals, shot accuracy baselines) одинаковы для всех турниров
4. **Simple fallback chains** — xg_diff → gd; при отсутствии обоих анализ возвращает 0/error
5. **Confidence ≠ прогностическая уверенность** — confidence отражает только количество данных, не качество или дисперсию оценки
