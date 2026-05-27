-- ============================================================
-- Migration 005: Extended game statistics & player stats
-- Date: 2026-05-27
-- Purpose: Add 40+ columns to game_statistics, 17 to game_player_stats
--          to capture full SStats getGameDetails response
-- ============================================================

-- ------------------------------------------------------------
-- 1. game_statistics: extended fields
-- ------------------------------------------------------------

ALTER TABLE game_statistics
  -- Shots breakdown
  ADD COLUMN IF NOT EXISTS shots_blocked_home INTEGER,
  ADD COLUMN IF NOT EXISTS shots_blocked_away INTEGER,
  ADD COLUMN IF NOT EXISTS shots_inside_box_home INTEGER,
  ADD COLUMN IF NOT EXISTS shots_inside_box_away INTEGER,
  ADD COLUMN IF NOT EXISTS shots_outside_box_home INTEGER,
  ADD COLUMN IF NOT EXISTS shots_outside_box_away INTEGER,
  ADD COLUMN IF NOT EXISTS shots_off_target_home INTEGER,
  ADD COLUMN IF NOT EXISTS shots_off_target_away INTEGER,
  ADD COLUMN IF NOT EXISTS hit_woodwork_home INTEGER,
  ADD COLUMN IF NOT EXISTS hit_woodwork_away INTEGER,
  ADD COLUMN IF NOT EXISTS headed_goals_home INTEGER,
  ADD COLUMN IF NOT EXISTS headed_goals_away INTEGER,

  -- xG / xA metrics
  ADD COLUMN IF NOT EXISTS expected_goals_home NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS expected_goals_away NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS expected_assists_home NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS expected_assists_away NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS xg_on_target_home NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS xg_on_target_away NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS goals_prevented_home NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS goals_prevented_away NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS big_chances_home INTEGER,
  ADD COLUMN IF NOT EXISTS big_chances_away INTEGER,
  ADD COLUMN IF NOT EXISTS calculated_xg_home NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS calculated_xg_away NUMERIC(6,3);

ALTER TABLE game_statistics
  -- Passes detailed
  ADD COLUMN IF NOT EXISTS total_passes_home INTEGER,
  ADD COLUMN IF NOT EXISTS total_passes_away INTEGER,
  ADD COLUMN IF NOT EXISTS passes_accurate_home INTEGER,
  ADD COLUMN IF NOT EXISTS passes_accurate_away INTEGER,
  ADD COLUMN IF NOT EXISTS accurate_through_passes_home INTEGER,
  ADD COLUMN IF NOT EXISTS accurate_through_passes_away INTEGER,
  ADD COLUMN IF NOT EXISTS long_passes_home INTEGER,
  ADD COLUMN IF NOT EXISTS long_passes_away INTEGER,
  ADD COLUMN IF NOT EXISTS passes_in_final_third_home INTEGER,
  ADD COLUMN IF NOT EXISTS passes_in_final_third_away INTEGER,
  ADD COLUMN IF NOT EXISTS crosses_home INTEGER,
  ADD COLUMN IF NOT EXISTS crosses_away INTEGER,
  ADD COLUMN IF NOT EXISTS touches_in_opp_box_home INTEGER,
  ADD COLUMN IF NOT EXISTS touches_in_opp_box_away INTEGER,

  -- Defense
  ADD COLUMN IF NOT EXISTS total_tackles_home INTEGER,
  ADD COLUMN IF NOT EXISTS total_tackles_away INTEGER,
  ADD COLUMN IF NOT EXISTS success_tackles_home INTEGER,
  ADD COLUMN IF NOT EXISTS success_tackles_away INTEGER,
  ADD COLUMN IF NOT EXISTS duels_won_home INTEGER,
  ADD COLUMN IF NOT EXISTS duels_won_away INTEGER,
  ADD COLUMN IF NOT EXISTS clearances_home INTEGER,
  ADD COLUMN IF NOT EXISTS clearances_away INTEGER,
  ADD COLUMN IF NOT EXISTS interceptions_home INTEGER,
  ADD COLUMN IF NOT EXISTS interceptions_away INTEGER,

  -- Goalkeeper / set pieces / errors
  ADD COLUMN IF NOT EXISTS goalkeeper_saves_home INTEGER,
  ADD COLUMN IF NOT EXISTS goalkeeper_saves_away INTEGER,
  ADD COLUMN IF NOT EXISTS free_kicks_home INTEGER,
  ADD COLUMN IF NOT EXISTS free_kicks_away INTEGER,
  ADD COLUMN IF NOT EXISTS throwins_home INTEGER,
  ADD COLUMN IF NOT EXISTS throwins_away INTEGER,
  ADD COLUMN IF NOT EXISTS errors_leading_to_shot_home INTEGER,
  ADD COLUMN IF NOT EXISTS errors_leading_to_shot_away INTEGER,
  ADD COLUMN IF NOT EXISTS errors_leading_to_goal_home INTEGER,
  ADD COLUMN IF NOT EXISTS errors_leading_to_goal_away INTEGER,

  -- Reserved for future / opaque fields
  ADD COLUMN IF NOT EXISTS other_stats_home JSONB,
  ADD COLUMN IF NOT EXISTS other_stats_away JSONB;

CREATE INDEX IF NOT EXISTS idx_game_statistics_xg_home ON game_statistics(expected_goals_home) WHERE expected_goals_home IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_statistics_xg_away ON game_statistics(expected_goals_away) WHERE expected_goals_away IS NOT NULL;

-- ============================================================
-- game_player_stats: расширение (17 новых колонок)
-- ============================================================
ALTER TABLE game_player_stats
  ADD COLUMN IF NOT EXISTS key_passes        INTEGER,
  ADD COLUMN IF NOT EXISTS duels_total       INTEGER,
  ADD COLUMN IF NOT EXISTS duels_won         INTEGER,
  ADD COLUMN IF NOT EXISTS dribbles_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS dribbles_success  INTEGER,
  ADD COLUMN IF NOT EXISTS dribbles_past     INTEGER,
  ADD COLUMN IF NOT EXISTS goals_conceded    INTEGER,
  ADD COLUMN IF NOT EXISTS goals_saves       INTEGER,
  ADD COLUMN IF NOT EXISTS offsides          INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_won       INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_committed INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_scored    INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_missed    INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_saved     INTEGER,
  ADD COLUMN IF NOT EXISTS shots_blocked     INTEGER,
  ADD COLUMN IF NOT EXISTS is_captain        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_substitute     BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_gps_rating         ON game_player_stats(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gps_captain        ON game_player_stats(game_id) WHERE is_captain = TRUE;

COMMIT;
