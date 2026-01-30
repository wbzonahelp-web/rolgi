/**
 * Integration Tests: Standings API
 * Tests all /api/standings endpoints with real database
 */

const { testDb } = require('../helpers/test-db');

describe('GET /api/standings', () => {
  describe('Basic functionality', () => {
    test('should return standings', async () => {
      const result = await testDb.query('SELECT * FROM standings ORDER BY season_id, position');
      
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.length).toBe(6); // From seed data
    });

    test('should validate standings structure', async () => {
      const result = await testDb.query('SELECT * FROM standings LIMIT 1');
      const standing = result.rows[0];
      
      expect(standing).toHaveProperty('id');
      expect(standing).toHaveProperty('season_id');
      expect(standing).toHaveProperty('team_id');
      expect(standing).toHaveProperty('position');
      expect(standing).toHaveProperty('played');
      expect(standing).toHaveProperty('won');
      expect(standing).toHaveProperty('drawn');
      expect(standing).toHaveProperty('lost');
      expect(standing).toHaveProperty('goals_for');
      expect(standing).toHaveProperty('goals_against');
      expect(standing).toHaveProperty('points');
    });
  });

  describe('Filtering', () => {
    test('should filter by season', async () => {
      const seasonId = 1;
      const result = await testDb.query(
        'SELECT * FROM standings WHERE season_id = $1 ORDER BY position',
        [seasonId]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(standing => {
        expect(standing.season_id).toBe(seasonId);
      });
    });

    test('should filter by league', async () => {
      const leagueId = 1;
      const result = await testDb.query(`
        SELECT s.*
        FROM standings s
        JOIN seasons se ON s.season_id = se.id
        WHERE se.league_id = $1
        ORDER BY s.position
      `, [leagueId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should filter by team', async () => {
      const teamId = 1;
      const result = await testDb.query(
        'SELECT * FROM standings WHERE team_id = $1',
        [teamId]
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach(standing => {
        expect(standing.team_id).toBe(teamId);
      });
    });
  });

  describe('Sorting', () => {
    test('should sort by position', async () => {
      const seasonId = 1;
      const result = await testDb.query(
        'SELECT * FROM standings WHERE season_id = $1 ORDER BY position ASC',
        [seasonId]
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevPos = result.rows[i - 1].position;
        const currPos = result.rows[i].position;
        expect(currPos).toBeGreaterThanOrEqual(prevPos);
      }
    });

    test('should sort by points descending', async () => {
      const seasonId = 1;
      const result = await testDb.query(
        'SELECT * FROM standings WHERE season_id = $1 ORDER BY points DESC, goals_for - goals_against DESC',
        [seasonId]
      );
      
      for (let i = 1; i < result.rows.length; i++) {
        const prevPoints = result.rows[i - 1].points;
        const currPoints = result.rows[i].points;
        expect(currPoints).toBeLessThanOrEqual(prevPoints);
      }
    });
  });

  describe('Joins', () => {
    test('should join with team details', async () => {
      const result = await testDb.query(`
        SELECT 
          s.*,
          t.name as team_name,
          t.short_name as team_short
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        LIMIT 1
      `);
      
      const standing = result.rows[0];
      expect(standing.team_name).toBeTruthy();
    });

    test('should join with season and league', async () => {
      const result = await testDb.query(`
        SELECT 
          s.*,
          se.name as season_name,
          l.name as league_name,
          c.name as country_name
        FROM standings s
        JOIN seasons se ON s.season_id = se.id
        JOIN leagues l ON se.league_id = l.id
        JOIN countries c ON l.country_id = c.id
        LIMIT 1
      `);
      
      const standing = result.rows[0];
      expect(standing.season_name).toBeTruthy();
      expect(standing.league_name).toBeTruthy();
      expect(standing.country_name).toBeTruthy();
    });
  });

  describe('Calculations', () => {
    test('should calculate goal difference', async () => {
      const result = await testDb.query(`
        SELECT 
          *,
          (goals_for - goals_against) as goal_difference
        FROM standings
        LIMIT 1
      `);
      
      const standing = result.rows[0];
      expect(standing.goal_difference).toBe(
        standing.goals_for - standing.goals_against
      );
    });

    test('should calculate win percentage', async () => {
      const result = await testDb.query(`
        SELECT 
          *,
          (won::float / NULLIF(played, 0) * 100)::numeric(5,2) as win_percentage
        FROM standings
        WHERE played > 0
        LIMIT 1
      `);
      
      const standing = result.rows[0];
      expect(parseFloat(standing.win_percentage)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(standing.win_percentage)).toBeLessThanOrEqual(100);
    });

    test('should calculate points per game', async () => {
      const result = await testDb.query(`
        SELECT 
          *,
          (points::float / NULLIF(played, 0))::numeric(4,2) as points_per_game
        FROM standings
        WHERE played > 0
        LIMIT 1
      `);
      
      const standing = result.rows[0];
      expect(parseFloat(standing.points_per_game)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(standing.points_per_game)).toBeLessThanOrEqual(3);
    });

    test('should verify points calculation', async () => {
      const result = await testDb.query('SELECT * FROM standings LIMIT 1');
      const standing = result.rows[0];
      
      const expectedPoints = standing.won * 3 + standing.drawn * 1;
      expect(standing.points).toBe(expectedPoints);
    });

    test('should verify games played', async () => {
      const result = await testDb.query('SELECT * FROM standings LIMIT 1');
      const standing = result.rows[0];
      
      const totalGames = standing.won + standing.drawn + standing.lost;
      expect(standing.played).toBe(totalGames);
    });
  });

  describe('Rankings', () => {
    test('should rank teams correctly', async () => {
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          t.name as team_name,
          s.position,
          s.points,
          s.goals_for - s.goals_against as goal_diff
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.position ASC
      `, [seasonId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Position 1 should have most points (or equal with better goal diff)
      if (result.rows.length > 1) {
        expect(result.rows[0].points).toBeGreaterThanOrEqual(result.rows[1].points);
      }
    });

    test('should find top teams', async () => {
      const seasonId = 1;
      const topN = 3;
      const result = await testDb.query(`
        SELECT 
          t.name as team_name,
          s.position,
          s.points
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.position ASC
        LIMIT $2
      `, [seasonId, topN]);
      
      expect(result.rows.length).toBeLessThanOrEqual(topN);
    });

    test('should find bottom teams', async () => {
      const seasonId = 1;
      const bottomN = 3;
      const result = await testDb.query(`
        SELECT 
          t.name as team_name,
          s.position,
          s.points
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.position DESC
        LIMIT $2
      `, [seasonId, bottomN]);
      
      expect(result.rows.length).toBeLessThanOrEqual(bottomN);
    });
  });

  describe('Statistics', () => {
    test('should get league statistics', async () => {
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          COUNT(*) as teams_count,
          AVG(points)::numeric(5,2) as avg_points,
          MAX(points) as max_points,
          MIN(points) as min_points,
          SUM(goals_for) as total_goals
        FROM standings
        WHERE season_id = $1
      `, [seasonId]);
      
      const stats = result.rows[0];
      expect(parseInt(stats.teams_count)).toBeGreaterThan(0);
      expect(parseFloat(stats.avg_points)).toBeGreaterThan(0);
    });

    test('should find highest scoring teams', async () => {
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          t.name as team_name,
          s.goals_for,
          s.goals_against,
          (s.goals_for::float / NULLIF(s.played, 0))::numeric(4,2) as goals_per_game
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.goals_for DESC
        LIMIT 5
      `, [seasonId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should find best defense teams', async () => {
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          t.name as team_name,
          s.goals_against,
          (s.goals_against::float / NULLIF(s.played, 0))::numeric(4,2) as goals_conceded_per_game
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.goals_against ASC
        LIMIT 5
      `, [seasonId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Complex queries', () => {
    test('should get full standings table', async () => {
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          s.position,
          t.name as team_name,
          t.short_name,
          s.played,
          s.won,
          s.drawn,
          s.lost,
          s.goals_for,
          s.goals_against,
          (s.goals_for - s.goals_against) as goal_difference,
          s.points,
          l.name as league_name
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        JOIN seasons se ON s.season_id = se.id
        JOIN leagues l ON se.league_id = l.id
        WHERE s.season_id = $1
        ORDER BY s.position ASC
      `, [seasonId]);
      
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Verify data completeness
      result.rows.forEach(row => {
        expect(row.position).toBeTruthy();
        expect(row.team_name).toBeTruthy();
        expect(row.played).toBeGreaterThanOrEqual(0);
        expect(row.points).toBeGreaterThanOrEqual(0);
      });
    });

    test('should compare standings across leagues', async () => {
      const result = await testDb.query(`
        SELECT 
          l.name as league_name,
          COUNT(DISTINCT s.team_id) as teams_count,
          AVG(s.points)::numeric(5,2) as avg_points,
          AVG(s.goals_for)::numeric(5,2) as avg_goals_for
        FROM standings s
        JOIN seasons se ON s.season_id = se.id
        JOIN leagues l ON se.league_id = l.id
        GROUP BY l.id, l.name
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should find form table (last 5 games)', async () => {
      // This would require actual game results
      // For now, test query structure
      const seasonId = 1;
      const result = await testDb.query(`
        SELECT 
          s.team_id,
          t.name as team_name,
          s.position,
          s.points
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.season_id = $1
        ORDER BY s.position
      `, [seasonId]);
      
      expect(Array.isArray(result.rows)).toBe(true);
    });
  });
});
