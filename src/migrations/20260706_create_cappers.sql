-- Таблицы для страницы "Капперы": статистика честности прогнозистов из Telegram-каналов.
-- Данные наполняет ETL-скрипт etl_cappers.py (из SQLite verifier'а /srv/userbot).

CREATE TABLE IF NOT EXISTS cappers (
    channel_id      BIGINT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    username        VARCHAR(255),
    profile_text    TEXT,
    language        VARCHAR(8),
    total_forecasts INTEGER NOT NULL DEFAULT 0,
    claimed_winrate INTEGER,          -- % заявленных побед
    real_winrate    INTEGER,          -- % реальных побед (независимая проверка)
    honest_cnt      INTEGER NOT NULL DEFAULT 0,
    dishonest_cnt   INTEGER NOT NULL DEFAULT 0,
    unverified_cnt  INTEGER NOT NULL DEFAULT 0,
    no_report_cnt   INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capper_picks (
    forecast_id   INTEGER PRIMARY KEY,
    channel_id    BIGINT NOT NULL REFERENCES cappers(channel_id) ON DELETE CASCADE,
    sport         VARCHAR(32),
    event_norm    TEXT,
    bet_type      TEXT,
    stake         VARCHAR(32),
    created_at    TIMESTAMPTZ,
    verdict       VARCHAR(24),        -- honest|dishonest|unverified|no_result_post|understated
    verified      VARCHAR(16),        -- won|lost|half_won|half_lost|push|null
    score         VARCHAR(16),
    match_date    DATE,
    source        TEXT
);

CREATE INDEX IF NOT EXISTS idx_capper_picks_channel ON capper_picks(channel_id);
CREATE INDEX IF NOT EXISTS idx_capper_picks_verdict ON capper_picks(verdict);
CREATE INDEX IF NOT EXISTS idx_capper_picks_sport   ON capper_picks(sport);
