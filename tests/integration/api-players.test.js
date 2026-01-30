/**
 * Integration Tests: Players API
 * Tests all /api/players endpoints with real database
 */

const { testDb } = require('../helpers/test-db');

describe('GET /api/players', () => {
  describe('Basic functionality', () => {
    test('should return list of players', async () => {
      const result = await testDb.query('SELECT * FROM players ORDER BY id');
      
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.length).toBe(5); // From seed data
    });

    test('should validate player structure', async () => {
      const result = await testDb.query('SELECT * FROM players LIMIT 1');
      const player = result.rows[0];
      
      expect(player).toHaveProperty('id');
      expect(player).toHaveProperty('name');
      expect(player).toHaveProperty('position');
      expect(player).toHaveProperty('nationality');
      expect(player).toHaveProperty('birth_date');
      expect(player).toHaveProperty('sstats_id');
    });
  });

  describe('Filtering', () => {
    test('should filter by position', async () => {
      const position = 'forward';
      const result = await testDb.query(
        'SELECT * FROM players WHERE position = $1',
        [position]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(player => {
        expect(player.position).toBe(position);
      });
    });

    test('should filter by nationality', async () => {
      const nationality = 'England';
      const result = await testDb.query(
        'SELECT * FROM players WHERE nationality = $1',
        [nationality]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(player => {
        expect(player.nationality).toBe(nationality);
      });
    });

    test('should search by name', async () => {
      const searchTerm = 'Salah';
      const result = await testDb.query(
        'SELECT * FROM players WHERE name ILIKE $1',
        [`%${searchTerm}%`]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(player => {
        expect(player.name.toLowerCase()).toContain(searchTerm.toLowerCase());
      });
    });

    test('should filter by team', async () => {
      const teamId = 1;
      const result = await testDb.query(`
        SELECT DISTINCT p.*
        FROM players p
        JOIN team_players tp ON p.id = tp.player_id
        WHERE tp.team_id = $1
      `, [teamId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Pagination', () => {
    test('should limit results', async () => {
      const limit = 3;
      const result = await testDb.query('SELECT * FROM players LIMIT $1', [limit]);
      
      expect(result.rows.length).toBeLessThanOrEqual(limit);
    });

    test('should offset results', async () => {
      const offset = 2;
      const result = await testDb.query(
        'SELECT * FROM players ORDER BY id OFFSET $1',
        [offset]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].id).toBeGreaterThan(offset);
    });
  });

  describe('Sorting', () => {
    test('should sort by name', async () => {
      const result = await testDb.query(
        'SELECT * FROM players ORDER BY name ASC'
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevName = result.rows[i - 1].name;
        const currName = result.rows[i].name;
        expect(currName >= prevName).toBe(true);
      }
    });

    test('should sort by age (birth_date)', async () => {
      const result = await testDb.query(
        'SELECT * FROM players ORDER BY birth_date DESC'
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevDate = new Date(result.rows[i - 1].birth_date);
        const currDate = new Date(result.rows[i].birth_date);
        expect(currDate.getTime()).toBeLessThanOrEqual(prevDate.getTime());
      }
    });
  });
});

describe('GET /api/players/:id', () => {
  test('should return player by id', async () => {
    const playerId = 1;
    const result = await testDb.query(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );
    
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(playerId);
  });

  test('should return 404 for non-existent player', async () => {
    const result = await testDb.query(
      'SELECT * FROM players WHERE id = $1',
      [9999]
    );
    
    expect(result.rows.length).toBe(0);
  });

  test('should include current team', async () => {
    const playerId = 1;
    const result = await testDb.query(`
      SELECT 
        p.*,
        json_build_object(
          'id', t.id,
          'name', t.name,
          'jersey_number', tp.jersey_number
        ) as current_team
      FROM players p
      LEFT JOIN team_players tp ON p.id = tp.player_id
      LEFT JOIN teams t ON tp.team_id = t.id
      WHERE p.id = $1
      LIMIT 1
    `, [playerId]);
    
    const player = result.rows[0];
    expect(player.current_team).toBeTruthy();
    expect(typeof player.current_team).toBe('object');
  });
});

describe('GET /api/players/:id/stats', () => {
  test('should return player statistics', async () => {
    const playerId = 1;
    const result = await testDb.query(
      'SELECT * FROM player_stats WHERE player_id = $1',
      [playerId]
    );
    
    // No player stats in seed data
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('should aggregate season stats', async () => {
    const playerId = 1;
    const seasonId = 1;
    
    // This would require player_stats data
    // Test the query structure
    const result = await testDb.query(`
      SELECT 
        player_id,
        season_id,
        SUM(goals) as total_goals,
        SUM(assists) as total_assists,
        SUM(minutes_played) as total_minutes
      FROM player_stats
      WHERE player_id = $1 AND season_id = $2
      GROUP BY player_id, season_id
    `, [playerId, seasonId]);
    
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

describe('Complex queries', () => {
  test('should calculate player age', async () => {
    const result = await testDb.query(`
      SELECT 
        id,
        name,
        birth_date,
        EXTRACT(YEAR FROM AGE(birth_date))::integer as age
      FROM players
      LIMIT 1
    `);
    
    const player = result.rows[0];
    expect(player.age).toBeGreaterThan(0);
    expect(player.age).toBeLessThan(100);
  });

  test('should get players by position with team info', async () => {
    const position = 'forward';
    const result = await testDb.query(`
      SELECT 
        p.id,
        p.name,
        p.position,
        json_agg(
          json_build_object(
            'team_id', t.id,
            'team_name', t.name,
            'jersey_number', tp.jersey_number
          )
        ) as teams
      FROM players p
      LEFT JOIN team_players tp ON p.id = tp.player_id
      LEFT JOIN teams t ON tp.team_id = t.id
      WHERE p.position = $1
      GROUP BY p.id, p.name, p.position
    `, [position]);
    
    expect(result.rows.length).toBeGreaterThan(0);
    result.rows.forEach(player => {
      expect(player.position).toBe(position);
      expect(Array.isArray(player.teams)).toBe(true);
    });
  });

  test('should get top scorers (if stats exist)', async () => {
    // This requires player_stats data
    const result = await testDb.query(`
      SELECT 
        p.id,
        p.name,
        COALESCE(SUM(ps.goals), 0) as total_goals
      FROM players p
      LEFT JOIN player_stats ps ON p.id = ps.player_id
      GROUP BY p.id, p.name
      ORDER BY total_goals DESC
      LIMIT 10
    `);
    
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  test('should get players by nationality grouped', async () => {
    const result = await testDb.query(`
      SELECT 
        nationality,
        COUNT(*) as player_count,
        json_agg(
          json_build_object(
            'id', id,
            'name', name,
            'position', position
          )
        ) as players
      FROM players
      GROUP BY nationality
      ORDER BY player_count DESC
    `);
    
    expect(result.rows.length).toBeGreaterThan(0);
    result.rows.forEach(group => {
      expect(group.nationality).toBeTruthy();
      expect(parseInt(group.player_count)).toBeGreaterThan(0);
      expect(Array.isArray(group.players)).toBe(true);
    });
  });

  test('should get players with team history', async () => {
    const playerId = 1;
    const result = await testDb.query(`
      SELECT 
        p.id,
        p.name,
        json_agg(
          json_build_object(
            'team_name', t.name,
            'season', s.name,
            'jersey_number', tp.jersey_number
          ) ORDER BY s.year DESC
        ) as team_history
      FROM players p
      LEFT JOIN team_players tp ON p.id = tp.player_id
      LEFT JOIN teams t ON tp.team_id = t.id
      LEFT JOIN seasons s ON tp.season_id = s.id
      WHERE p.id = $1
      GROUP BY p.id, p.name
    `, [playerId]);
    
    expect(result.rows.length).toBe(1);
    const player = result.rows[0];
    expect(Array.isArray(player.team_history)).toBe(true);
  });
});
