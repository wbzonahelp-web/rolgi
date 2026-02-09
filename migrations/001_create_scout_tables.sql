-- Migration: Create Scout tables
-- Date: 2026-02-09
-- Description: Creates scout_users, scout_sessions, scout_uploads, scout_events tables

-- Scout Users table
CREATE TABLE IF NOT EXISTS scout_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(200),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  can_save_results BOOLEAN DEFAULT false,
  can_view_history BOOLEAN DEFAULT false,
  can_edit_events BOOLEAN DEFAULT false,
  can_manage_users BOOLEAN DEFAULT false,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scout Sessions table
CREATE TABLE IF NOT EXISTS scout_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES scout_users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scout_sessions_token ON scout_sessions(token);
CREATE INDEX IF NOT EXISTS idx_scout_sessions_user_id ON scout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scout_sessions_expires ON scout_sessions(expires_at);

-- Scout Uploads table
CREATE TABLE IF NOT EXISTS scout_uploads (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(500),
  total_rows INTEGER DEFAULT 0,
  football_rows INTEGER DEFAULT 0,
  matched_rows INTEGER DEFAULT 0,
  user_id INTEGER REFERENCES scout_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scout Events table
CREATE TABLE IF NOT EXISTS scout_events (
  id SERIAL PRIMARY KEY,
  upload_batch_id INTEGER REFERENCES scout_uploads(id) ON DELETE CASCADE,
  row_num INTEGER,
  event_date TIMESTAMP WITH TIME ZONE,
  sport VARCHAR(100) DEFAULT 'Футбол',
  competition VARCHAR(500),
  event_name VARCHAR(500),
  home_team_original VARCHAR(300),
  away_team_original VARCHAR(300),
  sources VARCHAR(500),
  matched_game_sstats_id INTEGER,
  match_confidence NUMERIC(5,4),
  home_score INTEGER,
  away_score INTEGER,
  result_status VARCHAR(50) DEFAULT 'pending',
  bet_amount NUMERIC(12,2),
  bet_odds NUMERIC(8,3),
  bet_result VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scout_events_batch ON scout_events(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_scout_events_date ON scout_events(event_date);
CREATE INDEX IF NOT EXISTS idx_scout_events_matched ON scout_events(matched_game_sstats_id);
CREATE INDEX IF NOT EXISTS idx_scout_events_status ON scout_events(result_status);
CREATE INDEX IF NOT EXISTS idx_scout_events_bet_result ON scout_events(bet_result);

-- Default admin user (password: admin)
INSERT INTO scout_users (username, password_hash, display_name, role, is_active, can_save_results, can_view_history, can_edit_events, can_manage_users)
VALUES ('admin', 'admin', 'Администратор', 'admin', true, true, true, true, true)
ON CONFLICT (username) DO NOTHING;
