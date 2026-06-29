# DB Schema — структура БД rolgi_v6

> Основные таблицы БД PostgreSQL 15. Обновляется при миграциях.

## Таблица games

**Описание:** Все футбольные матчи.

```sql
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    sstats_id INT,
    date TIMESTAMPTZ,
    status VARCHAR(20),  -- upcoming, live, finished, postponed, cancelled
    home_team_id INT REFERENCES teams(id),
    away_team_id INT REFERENCES teams(id),
    league_id INT REFERENCES leagues(id),
    season INT,
    home_score INT,
    away_score INT,
    venue VARCHAR(255),
    stadium VARCHAR(255),
    referee VARCHAR(255),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE (sstats_id)
);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_date ON games(date);
CREATE INDEX idx_games_league_season ON games(league_id, season);
CREATE INDEX idx_games_teams ON games(home_team_id, away_team_id);
```

**Важно:** `sstats_id` не абсолютно уникален — могут быть дубликаты (старая + новая версия). Используй резолвинг.

---

## Таблица teams

```sql
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    sstats_id INT UNIQUE,
    name VARCHAR(255),
    logo_url TEXT,
    country VARCHAR(100),
    founded INT,
    venue_name VARCHAR(255),
    venue_capacity INT
);
```

---

## Таблица leagues

```sql
CREATE TABLE leagues (
    id SERIAL PRIMARY KEY,
    sstats_id INT UNIQUE,
    name VARCHAR(255),
    country_name VARCHAR(100),
    country_code CHAR(2),
    logo_url TEXT,
    type VARCHAR(50)  -- League, Cup
);
```

---

## Таблица game_statistics

**Описание:** Статистика матча (shots, possession, xG и т.д.).

```sql
CREATE TABLE game_statistics (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    shots_on_target_home INT,
    shots_on_target_away INT,
    shots_off_target_home INT,
    shots_off_target_away INT,
    possession_home NUMERIC(5,2),
    possession_away NUMERIC(5,2),
    passes_home INT,
    passes_away INT,
    passes_accurate_home INT,
    passes_accurate_away INT,
    fouls_home INT,
    fouls_away INT,
    yellow_cards_home INT,
    yellow_cards_away INT,
    red_cards_home INT,
    red_cards_away INT,
    offsides_home INT,
    offsides_away INT,
    corners_home INT,
    corners_away INT,
    expected_goals_home NUMERIC(4,2),
    expected_goals_away NUMERIC(4,2),
    UNIQUE (game_id)
);
```

---

## Таблица game_events

**Описание:** События матча (голы, карточки, замены).

```sql
CREATE TABLE game_events (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    time_elapsed INT,  -- минута
    time_extra INT,    -- доп. время
    team_id INT REFERENCES teams(id),
    player_id INT,
    player_name VARCHAR(255),
    type VARCHAR(50),  -- Goal, Card, Subst
    detail VARCHAR(100),  -- Normal Goal, Yellow Card, Penalty и т.д.
    comments TEXT
);
CREATE INDEX idx_game_events_game ON game_events(game_id);
```

---

## Таблица odds_data

**Описание:** Коэффициенты букмекеров на матч.

```sql
CREATE TABLE odds_data (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    bookmaker VARCHAR(100),
    odd_home NUMERIC(6,2),
    odd_draw NUMERIC(6,2),
    odd_away NUMERIC(6,2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_odds_game ON odds_data(game_id);
```

---

## Таблица predictions_log

**Описание:** Лог прогнозов (от integrated forecast).

```sql
CREATE TABLE predictions_log (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id),
    predicted_outcome VARCHAR(10),  -- HOME, DRAW, AWAY
    confidence NUMERIC(5,4),
    actual_outcome VARCHAR(10),
    is_hit BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);
CREATE INDEX idx_predictions_game ON predictions_log(game_id);
CREATE INDEX idx_predictions_verified ON predictions_log(verified_at);
```

---

## Таблица team_analyzers_cache

**Описание:** Кэш JS-анализаторов для команд (обновляется cron 9 daily).

```sql
CREATE TABLE team_analyzers_cache (
    id SERIAL PRIMARY KEY,
    team_id INT REFERENCES teams(id),
    analyzer_name VARCHAR(50),  -- markov_outcome, form_inertia, game_stats и т.д.
    n_window INT DEFAULT 20,
    result JSONB,  -- JSON результат анализатора
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, analyzer_name, n_window)
);
CREATE INDEX idx_analyzers_cache_team ON team_analyzers_cache(team_id, analyzer_name);
```

---

## Таблица team_profitability_cache

**Описание:** ROI команды (обновляется cron 8 daily).

```sql
CREATE TABLE team_profitability_cache (
    id SERIAL PRIMARY KEY,
    team_id INT REFERENCES teams(id) UNIQUE,
    roi NUMERIC(8,4),
    total_bets INT,
    wins INT,
    calculated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Таблица users

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
```

---

## Таблица user_strategies

**Описание:** Пользовательские стратегии.

```sql
CREATE TABLE user_strategies (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    config JSONB,  -- { n_window, analyzers: [{name, enabled, weight}] }
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_strategies_user ON user_strategies(user_id);
CREATE INDEX idx_strategies_public ON user_strategies(is_public) WHERE is_public = TRUE;
```

---

## Таблица strategy_predictions

**Описание:** Прогнозы по стратегиям (для отслеживания accuracy).

```sql
CREATE TABLE strategy_predictions (
    id SERIAL PRIMARY KEY,
    strategy_id INT REFERENCES user_strategies(id) ON DELETE CASCADE,
    game_id INT REFERENCES games(id),
    predicted_outcome VARCHAR(10),
    confidence NUMERIC(5,4),
    actual_outcome VARCHAR(10),
    is_hit BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);
CREATE INDEX idx_strategy_preds_strategy ON strategy_predictions(strategy_id);
CREATE INDEX idx_strategy_preds_verified ON strategy_predictions(verified_at);
```

---

## Таблица league_calibration

**Описание:** Калибровка параметров моделей per league (создана, но не активна).

```sql
CREATE TABLE league_calibration (
    id SERIAL PRIMARY KEY,
    league_id INT REFERENCES leagues(id) UNIQUE,
    weights JSONB,  -- {"poisson": 0.60, "momentum": 0.15, ...}
    accuracy NUMERIC(5,2),
    accuracy_filtered NUMERIC(5,2),  -- при min_confidence
    coverage NUMERIC(5,2),  -- процент матчей выше min_confidence
    min_confidence NUMERIC(4,3),
    n_matches INT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

**Статус:** таблица пустая, calibrator не запущен.

---

## Таблица alerts (опционально)

**Описание:** Алерты пользователей (уведомления при событиях).

```sql
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),  -- game_start, goal, high_confidence_prediction
    game_id INT REFERENCES games(id),
    team_id INT REFERENCES teams(id),
    league_id INT REFERENCES leagues(id),
    conditions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Важные индексы

```sql
CREATE INDEX idx_games_last_updated ON games(last_updated);
CREATE INDEX idx_games_sstats_id ON games(sstats_id);
CREATE INDEX idx_teams_sstats_id ON teams(sstats_id);
CREATE INDEX idx_leagues_sstats_id ON leagues(sstats_id);
```

---

## Миграции

Миграции хранятся в `src/database/sql/` (если есть). Формат имени: `YYYY-MM-DD-<описание>.sql`.

Применение:
```bash
docker cp migration.sql rolgi-postgres:/tmp/
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -f /tmp/migration.sql
```
