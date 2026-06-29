# rolgi — проект футбольной аналитики (контекст для агента)

## Что это
Система анализа и прогнозирования футбольных матчей. БД PostgreSQL `rolgi_v6`:
~1.25 млн завершённых матчей по ~1214 лигам. Бэкенд Node.js (контейнер rolgi-api,
порт 3000 внутри docker-сети), Python-аналитика (контейнер rolgi-analytics, uvicorn
порт 8000), PostgreSQL (rolgi-postgres), Redis (rolgi-redis), nginx.

## Ключевые таблицы БД
- `games` — матчи (партиционированы по дате, games_2015..games_2027). Поля: id,
  league_id, season, date, home_team_id, away_team_id, home_score, away_score,
  status, is_finished, odds_data (jsonb).
- `game_statistics` — статистика матча: владение, удары, угловые, xG
  (expected_goals_home/away), и др.
- Прочее: leagues, teams, players, game_events, game_glicko, bookmakers.
- Чтение только через `sudo rolgi-psql-ro "SELECT ..."`. Не пиши в БД напрямую.

## Анализаторы (src/analytics/analyzers/*.js)
Доступные: poisson, markov-outcome, markov-state, shannon-entropy, form-inertia,
multipeak-density, monte-carlo, pagerank, game-stats, match-predictor-v3.
Python-аналитика: src/analytics-python/analyzers/ (hmm.py и др.).

## Стратегии
Стратегия = JSON-конфиг в таблице user_strategies, например:
{"n_window":20,"venue_filter":true,"league_filter":true,
 "analyzers":[{"name":"poisson","weight":0.6,"enabled":true}, ...]}.
API: src/api/routes/strategies-routes.js (CRUD, prediction, backtest endpoints).
Бэктест: POST на /api/strategies/backtest (через rolgi-api). Возвращает summary
с accuracy, hits/misses.

## ИЗВЕСТНЫЙ БАГ (важно)
В predictFromAnalyzers (strategies-routes.js) веса анализаторов ЗАХАРДКОЖЕНЫ
(примерно 0.60/0.15/0.10) и ИГНОРИРУЮТ поле weight из конфига стратегии.
Поэтому настройка весов в стратегии сейчас не влияет на результат.
Текущая точность ~42%, изменение весов даёт лишь ±3%. Основной потенциал
улучшения — в формулах анализаторов и калибровке по лигам, а не только в весах.

## Принципы анализа (избегать переобучения)
- Разделяй данные: in-sample (оптимизация) и out-of-sample (валидация). Никогда
  не оценивай качество на тех же данных, на которых подбирал параметры.
- Walk-forward валидация: обучай на ранних сезонах, проверяй на поздних.
- Мета-стратегию (какие признаки/параметры перебирать) обучай на разнообразном
  наборе лиг (~8-15 из разных регионов), а не на 1-3 — иначе не переносится.
- Держи отложенный набор лиг (hold-out) для финальной проверки переносимости.
- Тесты должны быть детерминированными (фиксируй периоды/seed).

## Рабочий цикл (двухмодельный)
- Ты (Opus) — анализируешь, проектируешь формулы, ставишь план.
- Субагенты (DeepSeek, роль task) — гоняют бэктесты, собирают метрики, пишут в файлы.
- Результаты прогонов сохраняй в /srv/projects/rolgi/.omp-lab/runs/ (JSON):
  стратегия, лига, сезон, конфиг, summary, дата.
- Минимизируй число своих (Opus) вызовов: собирай контекст пачкой, отвечай планом.

## Управление контейнерами
- Перезапуск аналитики после правок: `sudo rolgi-restart-analytics`
  или `sudo agent-dc rolgi restart analytics`.
- Логи: `sudo agent-dc rolgi logs --tail 100 <service>`.
- Пересборка: `sudo agent-dc rolgi build <service>` затем up.
