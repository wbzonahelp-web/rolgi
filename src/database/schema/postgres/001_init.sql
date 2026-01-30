-- ============================================================================
-- SSTATS ANALYTICS PLATFORM - DATABASE SCHEMA v6.0.0
-- ============================================================================
-- 
-- Полная схема базы данных для платформы аналитики футбольных матчей
-- 
-- Структура:
-- 1. Справочники (Level 0)
-- 2. Основные сущности (Level 1)
-- 3. Матчи и коэффициенты (Level 2)
-- 4. Детали матчей и аналитика (Level 3)
-- 5. Мониторинг и логи (Level 4)
--
-- Особенности:
-- - Партиционирование таблицы games по годам (2020-2027 + future)
-- - Все таблицы с sstats_id и flashscore_id для двойной интеграции
-- - UPSERT-ready структура (ON CONFLICT DO UPDATE)
-- - Полная нормализация данных
-- - Индексы для производительности
-- ============================================================================

-- Включение расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- LEVEL 0: СПРАВОЧНИКИ
-- ============================================================================

-- Таблица стран
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code CHAR(3) NOT NULL UNIQUE,  -- ISO 3166-1 alpha-3
    flag_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_countries_code ON countries(code);
CREATE INDEX idx_countries_name ON countries(name);

-- Таблица букмекеров
CREATE TABLE IF NOT EXISTS bookmakers (
    id SERIAL PRIMARY KEY,
    sstats_id INTEGER UNIQUE,
    name VARCHAR(100) NOT NULL,
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookmakers_sstats_id ON bookmakers(sstats_id);
CREATE INDEX idx_bookmakers_active ON bookmakers(is_active);

-- ============================================================================
-- LEVEL 1: ОСНОВНЫЕ СУЩНОСТИ
-- ============================================================================

-- Таблица лиг
CREATE TABLE IF NOT EXISTS leagues (
    id SERIAL PRIMARY KEY,
    sstats_id INTEGER UNIQUE NOT NULL,
    flashscore_id VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    country_name VARCHAR(100),
    logo VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    type VARCHAR(50),  -- domestic, international, cup
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leagues_sstats_id ON leagues(sstats_id);
CREATE INDEX idx_leagues_flashscore_id ON leagues(flashscore_id);
CREATE INDEX idx_leagues_country_id ON leagues(country_id);
CREATE INDEX idx_leagues_active ON leagues(is_active);
CREATE INDEX idx_leagues_priority ON leagues(priority DESC);

-- Таблица сезонов
CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,  -- Год начала сезона (2023, 2024, etc.)
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, season)
);

CREATE INDEX idx_seasons_league_id ON seasons(league_id);
CREATE INDEX idx_seasons_season ON seasons(season);
CREATE INDEX idx_seasons_current ON seasons(is_current);

-- Таблица команд
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    sstats_id INTEGER UNIQUE NOT NULL,
    flashscore_id VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(50),
    country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    country_name VARCHAR(100),
    logo VARCHAR(255),
    stadium VARCHAR(200),
    founded INTEGER,
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teams_sstats_id ON teams(sstats_id);
CREATE INDEX idx_teams_flashscore_id ON teams(flashscore_id);
CREATE INDEX idx_teams_country_id ON teams(country_id);
CREATE INDEX idx_teams_name ON teams USING gin(name gin_trgm_ops);
CREATE INDEX idx_teams_active ON teams(is_active);

-- Таблица игроков
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    sstats_id INTEGER UNIQUE NOT NULL,
    flashscore_id VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    age INTEGER,
    height INTEGER,  -- в см
    weight INTEGER,  -- в кг
    position VARCHAR(20),  -- GK, DF, MF, FW
    country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    country_name VARCHAR(100),
    photo VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_players_sstats_id ON players(sstats_id);
CREATE INDEX idx_players_flashscore_id ON players(flashscore_id);
CREATE INDEX idx_players_country_id ON players(country_id);
CREATE INDEX idx_players_name ON players USING gin(name gin_trgm_ops);
CREATE INDEX idx_players_position ON players(position);

-- ============================================================================
-- LEVEL 2: МАТЧИ И КОЭФФИЦИЕНТЫ
-- ============================================================================

-- Таблица матчей (PARTITIONED по годам)
CREATE TABLE IF NOT EXISTS games (
    id SERIAL,
    sstats_id INTEGER NOT NULL,
    flashscore_id VARCHAR(50),
    league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    round INTEGER,
    date TIMESTAMP NOT NULL,
    home_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    away_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    home_score INTEGER,
    away_score INTEGER,
    home_score_ht INTEGER,  -- Half time
    away_score_ht INTEGER,
    status VARCHAR(20) NOT NULL,  -- scheduled, live, finished, postponed, cancelled, abandoned
    referee VARCHAR(100),
    stadium VARCHAR(200),
    attendance INTEGER,
    is_live BOOLEAN DEFAULT false,
    is_finished BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sstats_id, date),
    PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- Создание партиций по годам
DO $$
DECLARE
    year INTEGER;
    start_date DATE;
    end_date DATE;
BEGIN
    -- Партиции для 2020-2027
    FOR year IN 2020..2027 LOOP
        start_date := DATE(year || '-01-01');
        end_date := DATE((year + 1) || '-01-01');
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS games_%s PARTITION OF games
             FOR VALUES FROM (%L) TO (%L)',
            year, start_date, end_date
        );
        
        -- Индексы для каждой партиции
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_sstats_id ON games_%s(sstats_id)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_flashscore_id ON games_%s(flashscore_id)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_league_season ON games_%s(league_id, season)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_teams ON games_%s(home_team_id, away_team_id)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_status ON games_%s(status)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_date ON games_%s(date)', year, year);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_games_%s_live ON games_%s(is_live) WHERE is_live = true', year, year);
    END LOOP;
    
    -- Партиция для будущих матчей (2028+)
    EXECUTE 'CREATE TABLE IF NOT EXISTS games_future PARTITION OF games
             FOR VALUES FROM (''2028-01-01'') TO (MAXVALUE)';
    
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_games_future_sstats_id ON games_future(sstats_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_games_future_league_season ON games_future(league_id, season)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_games_future_date ON games_future(date)';
END $$;

-- Таблица коэффициентов (премэтч)
CREATE TABLE IF NOT EXISTS odds_prematch (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    bookmaker_id INTEGER REFERENCES bookmakers(id) ON DELETE CASCADE,
    bookmaker_name VARCHAR(100),
    market_id VARCHAR(50) NOT NULL,  -- 1x2, ou25, btts, ah, etc.
    market_name VARCHAR(100),
    selection VARCHAR(50) NOT NULL,  -- home, draw, away, over, under, yes, no
    odds DECIMAL(10, 2) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, bookmaker_id, market_id, selection, timestamp),
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_odds_prematch_game_id ON odds_prematch(game_id);
CREATE INDEX idx_odds_prematch_bookmaker ON odds_prematch(bookmaker_id);
CREATE INDEX idx_odds_prematch_market ON odds_prematch(market_id);
CREATE INDEX idx_odds_prematch_timestamp ON odds_prematch(timestamp);

-- Таблица коэффициентов (live)
CREATE TABLE IF NOT EXISTS odds_live (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    bookmaker_id INTEGER REFERENCES bookmakers(id) ON DELETE CASCADE,
    bookmaker_name VARCHAR(100),
    market_id VARCHAR(50) NOT NULL,
    market_name VARCHAR(100),
    selection VARCHAR(50) NOT NULL,
    odds DECIMAL(10, 2) NOT NULL,
    minute INTEGER,  -- Минута матча
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_odds_live_game_id ON odds_live(game_id);
CREATE INDEX idx_odds_live_bookmaker ON odds_live(bookmaker_id);
CREATE INDEX idx_odds_live_market ON odds_live(market_id);
CREATE INDEX idx_odds_live_timestamp ON odds_live(timestamp);
CREATE INDEX idx_odds_live_minute ON odds_live(minute);

-- ============================================================================
-- LEVEL 3: ДЕТАЛИ МАТЧЕЙ И АНАЛИТИКА
-- ============================================================================

-- Таблица статистики матчей
CREATE TABLE IF NOT EXISTS game_statistics (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    possession_home INTEGER,
    possession_away INTEGER,
    shots_home INTEGER,
    shots_away INTEGER,
    shots_on_target_home INTEGER,
    shots_on_target_away INTEGER,
    corners_home INTEGER,
    corners_away INTEGER,
    fouls_home INTEGER,
    fouls_away INTEGER,
    yellow_cards_home INTEGER,
    yellow_cards_away INTEGER,
    red_cards_home INTEGER,
    red_cards_away INTEGER,
    offsides_home INTEGER,
    offsides_away INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id),
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_game_statistics_game_id ON game_statistics(game_id);

-- Таблица событий матчей
CREATE TABLE IF NOT EXISTS game_events (
    id SERIAL PRIMARY KEY,
    sstats_id INTEGER UNIQUE,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    player_name VARCHAR(200),
    minute INTEGER NOT NULL,
    minute_extra INTEGER,  -- Добавленное время
    type VARCHAR(50) NOT NULL,  -- goal, yellow_card, red_card, substitution, penalty, own_goal, penalty_missed
    subtype VARCHAR(50),  -- penalty, free_kick, header, etc.
    assist_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    assist_player_name VARCHAR(200),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_game_events_game_id ON game_events(game_id);
CREATE INDEX idx_game_events_team_id ON game_events(team_id);
CREATE INDEX idx_game_events_player_id ON game_events(player_id);
CREATE INDEX idx_game_events_type ON game_events(type);
CREATE INDEX idx_game_events_minute ON game_events(minute);

-- Таблица составов
CREATE TABLE IF NOT EXISTS game_lineups (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    player_name VARCHAR(200),
    position VARCHAR(20),
    shirt_number INTEGER,
    is_starter BOOLEAN DEFAULT true,
    is_captain BOOLEAN DEFAULT false,
    substituted_in_minute INTEGER,
    substituted_out_minute INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, team_id, player_id),
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_game_lineups_game_id ON game_lineups(game_id);
CREATE INDEX idx_game_lineups_team_id ON game_lineups(team_id);
CREATE INDEX idx_game_lineups_player_id ON game_lineups(player_id);
CREATE INDEX idx_game_lineups_starter ON game_lineups(is_starter);

-- Таблица статистики игроков в матчах
CREATE TABLE IF NOT EXISTS game_player_stats (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    minutes_played INTEGER,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    shots INTEGER DEFAULT 0,
    shots_on_target INTEGER DEFAULT 0,
    passes INTEGER DEFAULT 0,
    passes_completed INTEGER DEFAULT 0,
    tackles INTEGER DEFAULT 0,
    interceptions INTEGER DEFAULT 0,
    fouls_committed INTEGER DEFAULT 0,
    fouls_suffered INTEGER DEFAULT 0,
    rating DECIMAL(3, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, player_id),
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_game_player_stats_game_id ON game_player_stats(game_id);
CREATE INDEX idx_game_player_stats_player_id ON game_player_stats(player_id);
CREATE INDEX idx_game_player_stats_team_id ON game_player_stats(team_id);

-- Таблица Glicko рейтингов
CREATE TABLE IF NOT EXISTS game_glicko (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(200),
    rating DECIMAL(10, 2) NOT NULL,
    rd DECIMAL(10, 2) NOT NULL,  -- Rating Deviation
    vol DECIMAL(10, 4) NOT NULL,  -- Volatility
    win_probability DECIMAL(5, 4),  -- 0.0000 - 1.0000
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, team_id),
    FOREIGN KEY (game_id, date) REFERENCES games(id, date) ON DELETE CASCADE
);

CREATE INDEX idx_game_glicko_game_id ON game_glicko(game_id);
CREATE INDEX idx_game_glicko_team_id ON game_glicko(team_id);
CREATE INDEX idx_game_glicko_rating ON game_glicko(rating DESC);

-- Таблица турнирных таблиц
CREATE TABLE IF NOT EXISTS standings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(200),
    position INTEGER NOT NULL,
    played INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    drawn INTEGER DEFAULT 0,
    lost INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    goal_difference INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    form VARCHAR(10),  -- WWDLL
    home_played INTEGER DEFAULT 0,
    home_won INTEGER DEFAULT 0,
    home_drawn INTEGER DEFAULT 0,
    home_lost INTEGER DEFAULT 0,
    away_played INTEGER DEFAULT 0,
    away_won INTEGER DEFAULT 0,
    away_drawn INTEGER DEFAULT 0,
    away_lost INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, season, team_id),
    CONSTRAINT chk_standings_played CHECK (played = won + drawn + lost)
);

CREATE INDEX idx_standings_league_season ON standings(league_id, season);
CREATE INDEX idx_standings_team_id ON standings(team_id);
CREATE INDEX idx_standings_position ON standings(position);
CREATE INDEX idx_standings_points ON standings(points DESC);

-- ============================================================================
-- LEVEL 4: МОНИТОРИНГ И ЛОГИ
-- ============================================================================

-- Таблица логов ошибок
CREATE TABLE IF NOT EXISTS error_log (
    id SERIAL PRIMARY KEY,
    error_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    severity VARCHAR(20) NOT NULL,  -- CRITICAL, ERROR, WARNING, INFO
    category VARCHAR(50) NOT NULL,  -- API, DATABASE, VALIDATION, LOADER, FRONTEND, SYSTEM, EXTERNAL
    source VARCHAR(100),
    message TEXT NOT NULL,
    stack_trace TEXT,
    trace_id UUID,
    url VARCHAR(500),
    method VARCHAR(10),
    params JSONB,
    function_name VARCHAR(100),
    file_name VARCHAR(255),
    line_number INTEGER,
    user_agent TEXT,
    ip_address INET,
    breadcrumbs JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_error_log_severity ON error_log(severity);
CREATE INDEX idx_error_log_category ON error_log(category);
CREATE INDEX idx_error_log_trace_id ON error_log(trace_id);
CREATE INDEX idx_error_log_created_at ON error_log(created_at DESC);
CREATE INDEX idx_error_log_resolved ON error_log(is_resolved);
CREATE INDEX idx_error_log_category_severity ON error_log(category, severity);

-- Таблица трассировки
CREATE TABLE IF NOT EXISTS trace_log (
    id SERIAL PRIMARY KEY,
    trace_id UUID DEFAULT uuid_generate_v4(),
    parent_trace_id UUID,
    span_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    span_name VARCHAR(200) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,  -- http_request, api_call, db_query, function, cache, external
    status VARCHAR(20) NOT NULL,  -- success, error, timeout, cancelled
    duration_ms INTEGER NOT NULL,
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trace_log_trace_id ON trace_log(trace_id);
CREATE INDEX idx_trace_log_parent_trace_id ON trace_log(parent_trace_id);
CREATE INDEX idx_trace_log_operation_type ON trace_log(operation_type);
CREATE INDEX idx_trace_log_status ON trace_log(status);
CREATE INDEX idx_trace_log_duration ON trace_log(duration_ms DESC);
CREATE INDEX idx_trace_log_created_at ON trace_log(created_at DESC);

-- Таблица метрик производительности
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20, 4) NOT NULL,
    metric_unit VARCHAR(20),  -- ms, count, bytes, percentage
    tags JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_performance_metrics_name ON performance_metrics(metric_name);
CREATE INDEX idx_performance_metrics_created_at ON performance_metrics(created_at DESC);
CREATE INDEX idx_performance_metrics_tags ON performance_metrics USING gin(tags);

-- Таблица логов синхронизации
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,  -- full, incremental, live
    entity_type VARCHAR(50) NOT NULL,  -- leagues, teams, games, odds, etc.
    entity_id INTEGER,
    status VARCHAR(20) NOT NULL,  -- started, completed, failed, skipped
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_log_sync_type ON sync_log(sync_type);
CREATE INDEX idx_sync_log_entity_type ON sync_log(entity_type);
CREATE INDEX idx_sync_log_status ON sync_log(status);
CREATE INDEX idx_sync_log_started_at ON sync_log(started_at DESC);

-- Таблица запусков загрузчика
CREATE TABLE IF NOT EXISTS loader_runs (
    id SERIAL PRIMARY KEY,
    run_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    mode VARCHAR(20) NOT NULL,  -- full, incremental, live
    status VARCHAR(20) NOT NULL,  -- pending, running, paused, completed, failed, resumed
    params JSONB,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    paused_at TIMESTAMP,
    resumed_at TIMESTAMP,
    duration_ms INTEGER,
    total_steps INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    failed_steps INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loader_runs_run_id ON loader_runs(run_id);
CREATE INDEX idx_loader_runs_status ON loader_runs(status);
CREATE INDEX idx_loader_runs_started_at ON loader_runs(started_at DESC);

-- Таблица результатов шагов загрузчика
CREATE TABLE IF NOT EXISTS loader_step_results (
    id SERIAL PRIMARY KEY,
    run_id UUID REFERENCES loader_runs(run_id) ON DELETE CASCADE,
    step_name VARCHAR(100) NOT NULL,
    step_order INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,  -- pending, running, completed, failed
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    error_stack TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loader_step_results_run_id ON loader_step_results(run_id);
CREATE INDEX idx_loader_step_results_step_name ON loader_step_results(step_name);
CREATE INDEX idx_loader_step_results_status ON loader_step_results(status);

-- Таблица курсоров загрузчика
CREATE TABLE IF NOT EXISTS loader_cursors (
    id SERIAL PRIMARY KEY,
    run_id UUID REFERENCES loader_runs(run_id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES loader_step_results(id) ON DELETE CASCADE,
    cursor_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loader_cursors_run_id ON loader_cursors(run_id);
CREATE INDEX idx_loader_cursors_step_id ON loader_cursors(step_id);
CREATE INDEX idx_loader_cursors_updated_at ON loader_cursors(updated_at DESC);

-- ============================================================================
-- TRIGGERS ДЛЯ АВТОМАТИЧЕСКОГО ОБНОВЛЕНИЯ updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Применение триггера к таблицам с updated_at
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'countries', 'bookmakers', 'leagues', 'seasons', 'teams', 'players',
        'game_statistics', 'game_player_stats', 'standings', 'loader_cursors'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ============================================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================================================

-- Вставка базовых стран
INSERT INTO countries (name, code) VALUES
    ('England', 'ENG'),
    ('Spain', 'ESP'),
    ('Germany', 'GER'),
    ('Italy', 'ITA'),
    ('France', 'FRA'),
    ('Portugal', 'POR'),
    ('Netherlands', 'NED'),
    ('Belgium', 'BEL'),
    ('Russia', 'RUS'),
    ('Turkey', 'TUR')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- ЗАВЕРШЕНИЕ
-- ============================================================================

-- Комментарии к таблицам
COMMENT ON TABLE games IS 'Партиционированная таблица матчей по годам (2020-2027 + future)';
COMMENT ON TABLE odds_prematch IS 'Прематч коэффициенты с уникальностью по игре, букмекеру, рынку, выбору и времени';
COMMENT ON TABLE odds_live IS 'Live коэффициенты с минутой матча';
COMMENT ON TABLE standings IS 'Турнирные таблицы с constraint на played = won + drawn + lost';
COMMENT ON TABLE error_log IS 'Централизованный лог ошибок с severity и category';
COMMENT ON TABLE trace_log IS 'Распределённая трассировка операций';
COMMENT ON TABLE loader_runs IS 'История запусков загрузчика данных';

-- ============================================================================
-- SCHEMA VERSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    version VARCHAR(20) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version, description) VALUES
    ('6.0.0', 'Initial schema with full structure, partitioning, and monitoring')
ON CONFLICT (version) DO NOTHING;
