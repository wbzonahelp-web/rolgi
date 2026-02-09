/**
 * Test Database Helper
 * Manages test database setup, teardown, and fixtures
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

/**
 * Test Database Manager
 */
class TestDatabase {
  constructor() {
    this.pool = null;
    this.isSetup = false;
  }

  /**
   * Setup test database connection
   */
  async setup() {
    if (this.isSetup) return;

    const dbConfig = {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || 5433,
      database: process.env.TEST_DB_NAME || 'rolgi_v6_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(dbConfig);

    // Test connection
    try {
      await this.pool.query('SELECT NOW()');
      this.isSetup = true;
    } catch (error) {
      throw new Error(`Failed to connect to test database: ${error.message}`);
    }
  }

  /**
   * Apply database schema
   */
  async applySchema() {
    const schemaPath = path.join(__dirname, '../../src/database/schema/postgres/001_init.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf-8');

    // Execute schema (split by semicolon to handle multiple statements)
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        await this.pool.query(statement);
      } catch (error) {
        // Ignore errors for already existing objects
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }

  /**
   * Clean all tables (truncate)
   */
  async clean() {
    const tables = [
      'odds_movements',
      'odds',
      'predictions',
      'insights',
      'standings',
      'game_events',
      'game_stats',
      'player_stats',
      'team_stats',
      'team_players',
      'games',
      'players',
      'teams',
      'seasons',
      'leagues',
      'bookmakers',
      'countries',
      'data_sync_log',
      'api_request_log',
      'system_alerts',
      'schema_versions',
      'loader_sessions'
    ];

    for (const table of tables) {
      try {
        await this.pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      } catch (error) {
        // Table might not exist yet
        if (!error.message.includes('does not exist')) {
          console.warn(`Warning: Failed to truncate ${table}:`, error.message);
        }
      }
    }
  }

  /**
   * Seed test data
   */
  async seed() {
    // Insert countries
    await this.pool.query(`
      INSERT INTO countries (id, name, code, fifa_code) VALUES
      (1, 'England', 'ENG', 'ENG'),
      (2, 'Spain', 'ESP', 'ESP'),
      (3, 'Germany', 'GER', 'GER')
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert leagues
    await this.pool.query(`
      INSERT INTO leagues (id, name, country_id, tier, sstats_id) VALUES
      (1, 'Premier League', 1, 1, 101),
      (2, 'La Liga', 2, 1, 102),
      (3, 'Bundesliga', 3, 1, 103)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert seasons
    await this.pool.query(`
      INSERT INTO seasons (id, league_id, name, year, start_date, end_date, sstats_id) VALUES
      (1, 1, '2024/2025', 2024, '2024-08-01', '2025-05-31', 1001),
      (2, 2, '2024/2025', 2024, '2024-08-01', '2025-05-31', 1002),
      (3, 3, '2024/2025', 2024, '2024-08-01', '2025-05-31', 1003)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert teams
    await this.pool.query(`
      INSERT INTO teams (id, name, short_name, country_id, sstats_id) VALUES
      (1, 'Manchester United', 'Man Utd', 1, 2001),
      (2, 'Liverpool', 'Liverpool', 1, 2002),
      (3, 'Real Madrid', 'Real Madrid', 2, 2003),
      (4, 'Barcelona', 'Barcelona', 2, 2004),
      (5, 'Bayern Munich', 'Bayern', 3, 2005),
      (6, 'Borussia Dortmund', 'Dortmund', 3, 2006)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert games
    await this.pool.query(`
      INSERT INTO games (id, season_id, home_team_id, away_team_id, date, status, sstats_id) VALUES
      (1, 1, 1, 2, NOW() - INTERVAL '1 day', 'finished', 3001),
      (2, 1, 2, 1, NOW() + INTERVAL '1 day', 'scheduled', 3002),
      (3, 2, 3, 4, NOW(), 'live', 3003),
      (4, 2, 4, 3, NOW() + INTERVAL '2 days', 'scheduled', 3004),
      (5, 3, 5, 6, NOW() - INTERVAL '2 days', 'finished', 3005)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert game stats
    await this.pool.query(`
      INSERT INTO game_stats (game_id, team_id, shots, shots_on_target, possession) VALUES
      (1, 1, 15, 8, 55),
      (1, 2, 12, 6, 45),
      (5, 5, 18, 10, 60),
      (5, 6, 10, 5, 40)
      ON CONFLICT (game_id, team_id) DO NOTHING
    `);

    // Insert players
    await this.pool.query(`
      INSERT INTO players (id, name, position, nationality, birth_date, sstats_id) VALUES
      (1, 'Bruno Fernandes', 'midfielder', 'Portugal', '1994-09-08', 4001),
      (2, 'Mohamed Salah', 'forward', 'Egypt', '1992-06-15', 4002),
      (3, 'Vinicius Junior', 'forward', 'Brazil', '2000-07-12', 4003),
      (4, 'Robert Lewandowski', 'forward', 'Poland', '1988-08-21', 4004),
      (5, 'Harry Kane', 'forward', 'England', '1993-07-28', 4005)
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert team_players
    await this.pool.query(`
      INSERT INTO team_players (team_id, player_id, season_id, jersey_number) VALUES
      (1, 1, 1, 8),
      (2, 2, 1, 11),
      (3, 3, 2, 7),
      (4, 4, 2, 9),
      (5, 5, 3, 9)
      ON CONFLICT (team_id, player_id, season_id) DO NOTHING
    `);

    // Insert bookmakers
    await this.pool.query(`
      INSERT INTO bookmakers (id, name, code, website) VALUES
      (1, 'Bet365', 'bet365', 'https://www.bet365.com'),
      (2, '1xBet', '1xbet', 'https://www.1xbet.com')
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert odds
    await this.pool.query(`
      INSERT INTO odds (game_id, bookmaker_id, market_type, home_odds, draw_odds, away_odds) VALUES
      (2, 1, '1x2', 2.10, 3.40, 3.50),
      (3, 1, '1x2', 1.85, 3.60, 4.20),
      (4, 2, '1x2', 1.95, 3.50, 3.80)
      ON CONFLICT (game_id, bookmaker_id, market_type) DO NOTHING
    `);

    // Insert standings
    await this.pool.query(`
      INSERT INTO standings (season_id, team_id, position, played, won, drawn, lost, goals_for, goals_against, points) VALUES
      (1, 1, 1, 10, 7, 2, 1, 22, 10, 23),
      (1, 2, 2, 10, 7, 1, 2, 25, 12, 22),
      (2, 3, 1, 10, 8, 1, 1, 28, 8, 25),
      (2, 4, 2, 10, 7, 2, 1, 26, 10, 23),
      (3, 5, 1, 10, 9, 1, 0, 32, 6, 28),
      (3, 6, 2, 10, 7, 1, 2, 24, 12, 22)
      ON CONFLICT (season_id, team_id) DO NOTHING
    `);
  }

  /**
   * Execute query
   */
  async query(sql, params) {
    if (!this.isSetup) {
      await this.setup();
    }
    return this.pool.query(sql, params);
  }

  /**
   * Teardown test database
   */
  async teardown() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isSetup = false;
    }
  }
}

// Export singleton instance
const testDb = new TestDatabase();

module.exports = {
  testDb,
  setupTestDb: () => testDb.setup(),
  cleanTestDb: () => testDb.clean(),
  seedTestDb: () => testDb.seed(),
  teardownTestDb: () => testDb.teardown(),
  queryTestDb: (sql, params) => testDb.query(sql, params)
};
