-- Migration 004: Add historic partitions for games table (2015-2019)
--
-- Background: Initial schema in 001_init.sql defined yearly partitions
-- starting from 2020. To support historic data backfill (SStats has
-- coverage back to 2015), we need older partitions.
--
-- Idempotent: uses IF NOT EXISTS so safe to re-run.
--
-- Stats after applying + backfill (2026-05-27):
--   - 1,341,849 games over 4,352 days (2015-01-01 → 2026-12-20)
--   - DB size ~539 MB
--   - 2015: 39,063 games  | 2018: 69,832 | 2021: 156,160 | 2024: 172,993
--   - 2016: 53,243        | 2019: 96,386 | 2022: 154,573 | 2025: 168,282
--   - 2017: 64,041        | 2020: 110,529| 2023: 166,550 | 2026: 90,197 (in progress)

CREATE TABLE IF NOT EXISTS games_2015 PARTITION OF games
  FOR VALUES FROM ('2015-01-01 00:00:00') TO ('2016-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS games_2016 PARTITION OF games
  FOR VALUES FROM ('2016-01-01 00:00:00') TO ('2017-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS games_2017 PARTITION OF games
  FOR VALUES FROM ('2017-01-01 00:00:00') TO ('2018-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS games_2018 PARTITION OF games
  FOR VALUES FROM ('2018-01-01 00:00:00') TO ('2019-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS games_2019 PARTITION OF games
  FOR VALUES FROM ('2019-01-01 00:00:00') TO ('2020-01-01 00:00:00');
