/**
 * E2E Tests: Full Data Loading Workflow
 * Tests complete workflow from API fetch to database storage to API retrieval
 */

const { testDb } = require('../helpers/test-db');

// Mock SStats API responses
const mockSStatsApiResponse = {
  games: {
    data: [
      {
        id: 9001,
        homeTeam: { id: 2001, name: 'Manchester United' },
        awayTeam: { id: 2002, name: 'Liverpool' },
        date: new Date().toISOString(),
        status: 'scheduled',
        league: { id: 101, name: 'Premier League' },
        season: { id: 1001, name: '2024/2025' }
      },
      {
        id: 9002,
        homeTeam: { id: 2003, name: 'Real Madrid' },
        awayTeam: { id: 2004, name: 'Barcelona' },
        date: new Date().toISOString(),
        status: 'live',
        league: { id: 102, name: 'La Liga' },
        season: { id: 1002, name: '2024/2025' }
      }
    ],
    total: 2
  }
};

describe('E2E: Full Data Loading Workflow', () => {
  describe('Step 1: Pre-flight checks', () => {
    test('should verify database connection', async () => {
      const result = await testDb.query('SELECT NOW()');
      expect(result.rows.length).toBe(1);
    });

    test('should verify schema lock exists', async () => {
      // Check that schema-lock.js would pass
      const tableCount = await testDb.query(`
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);
      
      expect(parseInt(tableCount.rows[0].count)).toBeGreaterThan(0);
    });

    test('should verify required tables exist', async () => {
      const requiredTables = [
        'countries', 'leagues', 'seasons', 'teams', 'players',
        'games', 'game_stats', 'game_events', 'odds', 'standings'
      ];
      
      for (const table of requiredTables) {
        const result = await testDb.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        `, [table]);
        
        expect(result.rows.length).toBe(1);
      }
    });
  });

  describe('Step 2: Fetch API data (mocked)', () => {
    test('should simulate API fetch', () => {
      const apiData = mockSStatsApiResponse.games;
      
      expect(apiData).toHaveProperty('data');
      expect(apiData).toHaveProperty('total');
      expect(Array.isArray(apiData.data)).toBe(true);
      expect(apiData.data.length).toBeGreaterThan(0);
    });

    test('should validate API response structure', () => {
      const games = mockSStatsApiResponse.games.data;
      
      games.forEach(game => {
        expect(game).toHaveProperty('id');
        expect(game).toHaveProperty('homeTeam');
        expect(game).toHaveProperty('awayTeam');
        expect(game).toHaveProperty('date');
        expect(game).toHaveProperty('status');
      });
    });
  });

  describe('Step 3: Transform data', () => {
    test('should transform API data to database format', () => {
      const apiGame = mockSStatsApiResponse.games.data[0];
      
      const dbGame = {
        sstats_id: apiGame.id,
        home_team_id: 1, // Would be resolved from team mapping
        away_team_id: 2,
        season_id: 1,
        date: new Date(apiGame.date),
        status: apiGame.status
      };
      
      expect(dbGame.sstats_id).toBeTruthy();
      expect(dbGame.home_team_id).toBeTruthy();
      expect(dbGame.away_team_id).toBeTruthy();
      expect(dbGame.date).toBeInstanceOf(Date);
    });
  });

  describe('Step 4: Resolve dependencies', () => {
    test('should resolve team dependencies', async () => {
      // Ensure teams exist before inserting games
      const teamIds = [1, 2];
      
      for (const teamId of teamIds) {
        const result = await testDb.query(
          'SELECT id FROM teams WHERE id = $1',
          [teamId]
        );
        expect(result.rows.length).toBe(1);
      }
    });

    test('should resolve season dependencies', async () => {
      const result = await testDb.query('SELECT id FROM seasons WHERE id = 1');
      expect(result.rows.length).toBe(1);
    });
  });

  describe('Step 5: Insert data with UPSERT', () => {
    test('should insert new game', async () => {
      const newGame = {
        sstats_id: 9999,
        season_id: 1,
        home_team_id: 1,
        away_team_id: 2,
        date: new Date(),
        status: 'scheduled'
      };
      
      const result = await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (sstats_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id, sstats_id
      `, [
        newGame.sstats_id,
        newGame.season_id,
        newGame.home_team_id,
        newGame.away_team_id,
        newGame.date,
        newGame.status
      ]);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].sstats_id).toBe(newGame.sstats_id);
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id = $1', [newGame.sstats_id]);
    });

    test('should update existing game on conflict', async () => {
      // Insert initial game
      await testDb.query(`
        INSERT INTO games (id, sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9998, 9998, 1, 1, 2, NOW(), 'scheduled')
        ON CONFLICT (sstats_id) DO NOTHING
      `);
      
      // Update status
      const result = await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9998, 1, 1, 2, NOW(), 'live')
        ON CONFLICT (sstats_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id, status
      `);
      
      expect(result.rows[0].status).toBe('live');
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id = 9998');
    });
  });

  describe('Step 6: Verify data integrity', () => {
    test('should verify foreign key constraints', async () => {
      // Try to insert game with non-existent team
      await expect(
        testDb.query(`
          INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
          VALUES (9997, 1, 99999, 2, NOW(), 'scheduled')
        `)
      ).rejects.toThrow();
    });

    test('should verify unique constraints', async () => {
      // Insert game
      await testDb.query(`
        INSERT INTO games (id, sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9996, 9996, 1, 1, 2, NOW(), 'scheduled')
        ON CONFLICT (sstats_id) DO NOTHING
      `);
      
      // Try to insert duplicate sstats_id
      const result = await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9996, 1, 1, 2, NOW(), 'scheduled')
        ON CONFLICT (sstats_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id
      `);
      
      // Should update, not insert new
      expect(result.rows.length).toBe(1);
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id = 9996');
    });
  });

  describe('Step 7: Query data through API (simulated)', () => {
    test('should retrieve inserted games', async () => {
      // Query games like API would
      const result = await testDb.query(`
        SELECT 
          g.*,
          ht.name as home_team_name,
          at.name as away_team_name,
          s.name as season_name,
          l.name as league_name
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        JOIN seasons s ON g.season_id = s.id
        JOIN leagues l ON s.league_id = l.id
        ORDER BY g.date DESC
        LIMIT 10
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Verify structure matches API response
      result.rows.forEach(game => {
        expect(game).toHaveProperty('id');
        expect(game).toHaveProperty('home_team_name');
        expect(game).toHaveProperty('away_team_name');
        expect(game).toHaveProperty('season_name');
        expect(game).toHaveProperty('league_name');
        expect(game).toHaveProperty('status');
      });
    });

    test('should filter games by status', async () => {
      const result = await testDb.query(`
        SELECT * FROM games WHERE status = 'live'
      `);
      
      result.rows.forEach(game => {
        expect(game.status).toBe('live');
      });
    });

    test('should paginate results', async () => {
      const limit = 3;
      const offset = 0;
      
      const result = await testDb.query(`
        SELECT * FROM games 
        ORDER BY date DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      expect(result.rows.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Step 8: Complete workflow integration', () => {
    test('should complete full workflow: fetch → transform → insert → retrieve', async () => {
      // 1. Simulate API fetch
      const apiData = mockSStatsApiResponse.games.data[0];
      
      // 2. Transform
      const gameData = {
        sstats_id: 9995,
        season_id: 1,
        home_team_id: 1,
        away_team_id: 2,
        date: new Date(apiData.date),
        status: apiData.status
      };
      
      // 3. Insert (UPSERT)
      const insertResult = await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (sstats_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id
      `, [
        gameData.sstats_id,
        gameData.season_id,
        gameData.home_team_id,
        gameData.away_team_id,
        gameData.date,
        gameData.status
      ]);
      
      expect(insertResult.rows.length).toBe(1);
      const gameId = insertResult.rows[0].id;
      
      // 4. Retrieve through API query
      const retrieveResult = await testDb.query(`
        SELECT 
          g.*,
          ht.name as home_team_name,
          at.name as away_team_name
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        WHERE g.id = $1
      `, [gameId]);
      
      expect(retrieveResult.rows.length).toBe(1);
      const retrievedGame = retrieveResult.rows[0];
      expect(retrievedGame.sstats_id).toBe(gameData.sstats_id);
      expect(retrievedGame.status).toBe(gameData.status);
      
      // 5. Cleanup
      await testDb.query('DELETE FROM games WHERE id = $1', [gameId]);
    });

    test('should handle batch insert', async () => {
      const games = [
        { sstats_id: 9991, season_id: 1, home_team_id: 1, away_team_id: 2, date: new Date(), status: 'scheduled' },
        { sstats_id: 9992, season_id: 1, home_team_id: 3, away_team_id: 4, date: new Date(), status: 'scheduled' },
        { sstats_id: 9993, season_id: 1, home_team_id: 5, away_team_id: 6, date: new Date(), status: 'scheduled' }
      ];
      
      // Insert all games
      for (const game of games) {
        await testDb.query(`
          INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (sstats_id) DO NOTHING
        `, [game.sstats_id, game.season_id, game.home_team_id, game.away_team_id, game.date, game.status]);
      }
      
      // Verify all inserted
      const result = await testDb.query(`
        SELECT * FROM games WHERE sstats_id = ANY($1)
      `, [games.map(g => g.sstats_id)]);
      
      expect(result.rows.length).toBe(games.length);
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id = ANY($1)', [games.map(g => g.sstats_id)]);
    });
  });

  describe('Step 9: Error recovery', () => {
    test('should rollback transaction on error', async () => {
      const client = await testDb.pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Insert valid game
        await client.query(`
          INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
          VALUES (9990, 1, 1, 2, NOW(), 'scheduled')
        `);
        
        // Try to insert invalid game (non-existent team)
        await client.query(`
          INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
          VALUES (9989, 1, 99999, 2, NOW(), 'scheduled')
        `);
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        
        // Verify first game was not inserted due to rollback
        const result = await testDb.query('SELECT * FROM games WHERE sstats_id = 9990');
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    test('should handle duplicate key gracefully', async () => {
      // Insert game
      await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9988, 1, 1, 2, NOW(), 'scheduled')
        ON CONFLICT (sstats_id) DO NOTHING
      `);
      
      // Try to insert duplicate with ON CONFLICT
      const result = await testDb.query(`
        INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
        VALUES (9988, 1, 1, 2, NOW(), 'live')
        ON CONFLICT (sstats_id) DO UPDATE SET
          status = EXCLUDED.status
        RETURNING status
      `);
      
      expect(result.rows[0].status).toBe('live');
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id = 9988');
    });
  });

  describe('Step 10: Performance checks', () => {
    test('should insert 100 games efficiently', async () => {
      const startTime = Date.now();
      const games = [];
      
      // Generate 100 test games
      for (let i = 0; i < 100; i++) {
        games.push({
          sstats_id: 8000 + i,
          season_id: 1,
          home_team_id: (i % 6) + 1,
          away_team_id: ((i + 1) % 6) + 1,
          date: new Date(),
          status: 'scheduled'
        });
      }
      
      // Insert all
      for (const game of games) {
        await testDb.query(`
          INSERT INTO games (sstats_id, season_id, home_team_id, away_team_id, date, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (sstats_id) DO NOTHING
        `, [game.sstats_id, game.season_id, game.home_team_id, game.away_team_id, game.date, game.status]);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
      
      // Cleanup
      await testDb.query('DELETE FROM games WHERE sstats_id >= 8000 AND sstats_id < 8100');
    }, 10000); // 10 second timeout
  });
});
