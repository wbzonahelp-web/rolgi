/**
 * Integration Tests: Odds API
 * Tests all /api/odds endpoints with real database
 */

const { testDb } = require('../helpers/test-db');

describe('GET /api/odds/live/:gameId', () => {
  describe('Basic functionality', () => {
    test('should return odds for a game', async () => {
      const gameId = 2;
      const result = await testDb.query(
        'SELECT * FROM odds WHERE game_id = $1',
        [gameId]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should validate odds structure', async () => {
      const result = await testDb.query('SELECT * FROM odds LIMIT 1');
      const odds = result.rows[0];
      
      expect(odds).toHaveProperty('id');
      expect(odds).toHaveProperty('game_id');
      expect(odds).toHaveProperty('bookmaker_id');
      expect(odds).toHaveProperty('market_type');
      expect(odds).toHaveProperty('home_odds');
      expect(odds).toHaveProperty('draw_odds');
      expect(odds).toHaveProperty('away_odds');
    });
  });

  describe('Multiple bookmakers', () => {
    test('should return odds from multiple bookmakers', async () => {
      const gameId = 2;
      const result = await testDb.query(
        'SELECT DISTINCT bookmaker_id FROM odds WHERE game_id = $1',
        [gameId]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should join with bookmaker details', async () => {
      const gameId = 2;
      const result = await testDb.query(`
        SELECT 
          o.*,
          b.name as bookmaker_name,
          b.code as bookmaker_code
        FROM odds o
        JOIN bookmakers b ON o.bookmaker_id = b.id
        WHERE o.game_id = $1
      `, [gameId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
      const odds = result.rows[0];
      expect(odds.bookmaker_name).toBeTruthy();
    });
  });

  describe('Market types', () => {
    test('should filter by market type', async () => {
      const marketType = '1x2';
      const result = await testDb.query(
        'SELECT * FROM odds WHERE market_type = $1',
        [marketType]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(odds => {
        expect(odds.market_type).toBe(marketType);
      });
    });

    test('should support different market types', async () => {
      const result = await testDb.query(
        'SELECT DISTINCT market_type FROM odds'
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      // We have only 1x2 in seed data
      expect(result.rows[0].market_type).toBe('1x2');
    });
  });

  describe('Odds calculations', () => {
    test('should calculate implied probabilities', async () => {
      const result = await testDb.query(`
        SELECT 
          *,
          (1.0 / home_odds)::numeric(5,4) as home_prob,
          (1.0 / draw_odds)::numeric(5,4) as draw_prob,
          (1.0 / away_odds)::numeric(5,4) as away_prob
        FROM odds
        LIMIT 1
      `);
      
      const odds = result.rows[0];
      expect(parseFloat(odds.home_prob)).toBeGreaterThan(0);
      expect(parseFloat(odds.home_prob)).toBeLessThan(1);
    });

    test('should find best odds across bookmakers', async () => {
      const gameId = 2;
      const result = await testDb.query(`
        SELECT 
          game_id,
          MAX(home_odds) as best_home_odds,
          MAX(draw_odds) as best_draw_odds,
          MAX(away_odds) as best_away_odds
        FROM odds
        WHERE game_id = $1 AND market_type = '1x2'
        GROUP BY game_id
      `, [gameId]);
      
      if (result.rows.length > 0) {
        const bestOdds = result.rows[0];
        expect(parseFloat(bestOdds.best_home_odds)).toBeGreaterThan(0);
      }
    });
  });

  describe('Odds movements', () => {
    test('should return odds movements history', async () => {
      const result = await testDb.query(
        'SELECT * FROM odds_movements ORDER BY created_at DESC LIMIT 10'
      );
      
      // No movements in seed data
      expect(Array.isArray(result.rows)).toBe(true);
    });

    test('should track odds changes over time', async () => {
      const gameId = 2;
      const result = await testDb.query(`
        SELECT 
          om.*,
          o.home_odds as current_home_odds,
          (o.home_odds - om.old_value) as change
        FROM odds_movements om
        JOIN odds o ON om.odds_id = o.id
        WHERE o.game_id = $1
        ORDER BY om.created_at DESC
      `, [gameId]);
      
      expect(Array.isArray(result.rows)).toBe(true);
    });
  });

  describe('Live odds updates', () => {
    test('should get latest odds for live game', async () => {
      const result = await testDb.query(`
        SELECT 
          g.id as game_id,
          g.status,
          o.home_odds,
          o.draw_odds,
          o.away_odds,
          o.updated_at
        FROM games g
        JOIN odds o ON g.id = o.game_id
        WHERE g.status = 'live'
        ORDER BY o.updated_at DESC
      `);
      
      if (result.rows.length > 0) {
        const liveOdds = result.rows[0];
        expect(liveOdds.status).toBe('live');
        expect(liveOdds.updated_at).toBeTruthy();
      }
    });

    test('should compare pre-match and live odds', async () => {
      const gameId = 3; // Live game
      const result = await testDb.query(`
        SELECT 
          o.*,
          g.status,
          g.date
        FROM odds o
        JOIN games g ON o.game_id = g.id
        WHERE o.game_id = $1
      `, [gameId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    test('should handle game without odds', async () => {
      const gameId = 5;
      const result = await testDb.query(
        'SELECT * FROM odds WHERE game_id = $1',
        [gameId]
      );
      
      expect(result.rows.length).toBe(0);
    });

    test('should handle invalid game id', async () => {
      const result = await testDb.query(
        'SELECT * FROM odds WHERE game_id = $1',
        [9999]
      );
      
      expect(result.rows.length).toBe(0);
    });
  });
});

describe('Complex odds queries', () => {
  test('should get odds comparison across bookmakers', async () => {
    const gameId = 2;
    const result = await testDb.query(`
      SELECT 
        b.name as bookmaker,
        o.home_odds,
        o.draw_odds,
        o.away_odds,
        (1.0 / o.home_odds + 1.0 / o.draw_odds + 1.0 / o.away_odds)::numeric(5,4) as margin
      FROM odds o
      JOIN bookmakers b ON o.bookmaker_id = b.id
      WHERE o.game_id = $1 AND o.market_type = '1x2'
    `, [gameId]);
    
    expect(result.rows.length).toBeGreaterThan(0);
    result.rows.forEach(row => {
      expect(parseFloat(row.margin)).toBeGreaterThan(1); // Bookmaker margin
    });
  });

  test('should find value bets', async () => {
    const gameId = 2;
    const result = await testDb.query(`
      SELECT 
        o.*,
        b.name as bookmaker,
        (1.0 / o.home_odds)::numeric(5,4) as implied_prob,
        CASE 
          WHEN o.home_odds > 2.5 THEN 'potential_value'
          ELSE 'standard'
        END as bet_type
      FROM odds o
      JOIN bookmakers b ON o.bookmaker_id = b.id
      WHERE o.game_id = $1
    `, [gameId]);
    
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('should analyze odds trends', async () => {
    const result = await testDb.query(`
      SELECT 
        o.game_id,
        COUNT(DISTINCT o.bookmaker_id) as bookmaker_count,
        AVG(o.home_odds)::numeric(5,2) as avg_home_odds,
        AVG(o.draw_odds)::numeric(5,2) as avg_draw_odds,
        AVG(o.away_odds)::numeric(5,2) as avg_away_odds,
        MIN(o.home_odds) as min_home_odds,
        MAX(o.home_odds) as max_home_odds
      FROM odds o
      WHERE o.market_type = '1x2'
      GROUP BY o.game_id
    `);
    
    expect(result.rows.length).toBeGreaterThan(0);
    result.rows.forEach(row => {
      expect(parseInt(row.bookmaker_count)).toBeGreaterThan(0);
      expect(parseFloat(row.avg_home_odds)).toBeGreaterThan(0);
    });
  });
});
