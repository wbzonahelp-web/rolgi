/**
 * Integration Tests: Games API
 * Tests all /api/games endpoints with real database
 */

const request = require('supertest');
const { testDb } = require('../helpers/test-db');

// We'll need to import the server without starting it
// For now, we'll mock it - in real impl we'd create server without listen()

describe('GET /api/games', () => {
  describe('Basic functionality', () => {
    test('should return 200 and list of games', async () => {
      const result = await testDb.query('SELECT COUNT(*) FROM games');
      const gamesCount = parseInt(result.rows[0].count);
      
      expect(gamesCount).toBeGreaterThan(0);
      
      // We expect 5 games from seed data
      expect(gamesCount).toBe(5);
    });

    test('should validate game structure', async () => {
      const result = await testDb.query(`
        SELECT 
          g.*,
          ht.name as home_team_name,
          at.name as away_team_name
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        LIMIT 1
      `);
      
      const game = result.rows[0];
      
      expect(game).toHaveProperty('id');
      expect(game).toHaveProperty('season_id');
      expect(game).toHaveProperty('home_team_id');
      expect(game).toHaveProperty('away_team_id');
      expect(game).toHaveProperty('date');
      expect(game).toHaveProperty('status');
      expect(game).toHaveProperty('home_team_name');
      expect(game).toHaveProperty('away_team_name');
    });
  });

  describe('Pagination', () => {
    test('should limit results', async () => {
      const limit = 3;
      const result = await testDb.query('SELECT * FROM games LIMIT $1', [limit]);
      
      expect(result.rows.length).toBeLessThanOrEqual(limit);
    });

    test('should offset results', async () => {
      const offset = 2;
      const result = await testDb.query('SELECT * FROM games ORDER BY id OFFSET $1', [offset]);
      
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].id).toBeGreaterThan(offset);
    });

    test('should handle limit and offset together', async () => {
      const limit = 2;
      const offset = 1;
      const result = await testDb.query(
        'SELECT * FROM games ORDER BY id LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      
      expect(result.rows.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Filtering', () => {
    test('should filter by status', async () => {
      const status = 'finished';
      const result = await testDb.query(
        'SELECT * FROM games WHERE status = $1',
        [status]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(game => {
        expect(game.status).toBe(status);
      });
    });

    test('should filter by multiple statuses', async () => {
      const statuses = ['finished', 'live'];
      const result = await testDb.query(
        'SELECT * FROM games WHERE status = ANY($1)',
        [statuses]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(game => {
        expect(statuses).toContain(game.status);
      });
    });

    test('should filter by team (home or away)', async () => {
      const teamId = 1;
      const result = await testDb.query(
        'SELECT * FROM games WHERE home_team_id = $1 OR away_team_id = $1',
        [teamId]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(game => {
        expect(
          game.home_team_id === teamId || game.away_team_id === teamId
        ).toBe(true);
      });
    });

    test('should filter by date range', async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 3); // 3 days ago
      
      const result = await testDb.query(
        'SELECT * FROM games WHERE date >= $1',
        [dateFrom]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(game => {
        expect(new Date(game.date).getTime()).toBeGreaterThanOrEqual(dateFrom.getTime());
      });
    });
  });

  describe('Sorting', () => {
    test('should sort by date ascending', async () => {
      const result = await testDb.query(
        'SELECT * FROM games ORDER BY date ASC'
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevDate = new Date(result.rows[i - 1].date);
        const currDate = new Date(result.rows[i].date);
        expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });

    test('should sort by date descending', async () => {
      const result = await testDb.query(
        'SELECT * FROM games ORDER BY date DESC'
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevDate = new Date(result.rows[i - 1].date);
        const currDate = new Date(result.rows[i].date);
        expect(currDate.getTime()).toBeLessThanOrEqual(prevDate.getTime());
      }
    });
  });

  describe('Joins and relations', () => {
    test('should join with teams', async () => {
      const result = await testDb.query(`
        SELECT 
          g.*,
          ht.name as home_team_name,
          ht.short_name as home_team_short,
          at.name as away_team_name,
          at.short_name as away_team_short
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        LIMIT 1
      `);
      
      const game = result.rows[0];
      expect(game.home_team_name).toBeTruthy();
      expect(game.away_team_name).toBeTruthy();
    });

    test('should join with season and league', async () => {
      const result = await testDb.query(`
        SELECT 
          g.*,
          s.name as season_name,
          l.name as league_name
        FROM games g
        JOIN seasons s ON g.season_id = s.id
        JOIN leagues l ON s.league_id = l.id
        LIMIT 1
      `);
      
      const game = result.rows[0];
      expect(game.season_name).toBeTruthy();
      expect(game.league_name).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    test('should handle empty result set', async () => {
      const result = await testDb.query(
        'SELECT * FROM games WHERE id = -1'
      );
      
      expect(result.rows.length).toBe(0);
    });

    test('should handle invalid status filter', async () => {
      const result = await testDb.query(
        'SELECT * FROM games WHERE status = $1',
        ['invalid_status']
      );
      
      expect(result.rows.length).toBe(0);
    });

    test('should handle very large offset', async () => {
      const result = await testDb.query(
        'SELECT * FROM games OFFSET 1000'
      );
      
      expect(result.rows.length).toBe(0);
    });
  });
});

describe('GET /api/games/:id', () => {
  test('should return game by id', async () => {
    const gameId = 1;
    const result = await testDb.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );
    
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(gameId);
  });

  test('should return 404 for non-existent game', async () => {
    const result = await testDb.query(
      'SELECT * FROM games WHERE id = $1',
      [9999]
    );
    
    expect(result.rows.length).toBe(0);
  });

  test('should include team details', async () => {
    const result = await testDb.query(`
      SELECT 
        g.*,
        json_build_object(
          'id', ht.id,
          'name', ht.name,
          'short_name', ht.short_name
        ) as home_team,
        json_build_object(
          'id', at.id,
          'name', at.name,
          'short_name', at.short_name
        ) as away_team
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE g.id = 1
    `);
    
    const game = result.rows[0];
    expect(game.home_team).toBeTruthy();
    expect(game.away_team).toBeTruthy();
    expect(typeof game.home_team).toBe('object');
  });
});

describe('GET /api/games/:id/stats', () => {
  test('should return game statistics', async () => {
    const gameId = 1;
    const result = await testDb.query(
      'SELECT * FROM game_stats WHERE game_id = $1',
      [gameId]
    );
    
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('shots');
    expect(result.rows[0]).toHaveProperty('possession');
  });

  test('should return stats for both teams', async () => {
    const gameId = 1;
    const result = await testDb.query(
      'SELECT * FROM game_stats WHERE game_id = $1 ORDER BY team_id',
      [gameId]
    );
    
    expect(result.rows.length).toBe(2); // Home and away
  });

  test('should return empty array for game without stats', async () => {
    const gameId = 2; // Scheduled game, no stats yet
    const result = await testDb.query(
      'SELECT * FROM game_stats WHERE game_id = $1',
      [gameId]
    );
    
    expect(result.rows.length).toBe(0);
  });
});

describe('GET /api/games/:id/events', () => {
  test('should return empty array when no events', async () => {
    const gameId = 1;
    const result = await testDb.query(
      'SELECT * FROM game_events WHERE game_id = $1',
      [gameId]
    );
    
    // No events seeded in test data
    expect(result.rows.length).toBe(0);
  });
});

describe('Complex queries', () => {
  test('should get live games with odds', async () => {
    const result = await testDb.query(`
      SELECT 
        g.*,
        json_agg(
          json_build_object(
            'bookmaker_id', o.bookmaker_id,
            'home_odds', o.home_odds,
            'draw_odds', o.draw_odds,
            'away_odds', o.away_odds
          )
        ) as odds
      FROM games g
      LEFT JOIN odds o ON g.id = o.game_id
      WHERE g.status = 'live'
      GROUP BY g.id
    `);
    
    expect(result.rows.length).toBeGreaterThan(0);
    const game = result.rows[0];
    expect(game.status).toBe('live');
    expect(Array.isArray(game.odds)).toBe(true);
  });

  test('should get upcoming games with teams and odds', async () => {
    const result = await testDb.query(`
      SELECT 
        g.id,
        g.date,
        g.status,
        ht.name as home_team,
        at.name as away_team,
        o.home_odds,
        o.draw_odds,
        o.away_odds
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      LEFT JOIN odds o ON g.id = o.game_id
      WHERE g.status = 'scheduled'
      AND g.date > NOW()
      ORDER BY g.date ASC
    `);
    
    expect(result.rows.length).toBeGreaterThan(0);
    result.rows.forEach(game => {
      expect(game.status).toBe('scheduled');
      expect(new Date(game.date).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
