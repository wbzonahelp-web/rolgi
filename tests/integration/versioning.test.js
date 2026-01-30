/**
 * API Versioning Integration Tests
 * Tests for V1 and V2 API compatibility
 * 
 * @jest-environment node
 */

const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { setupTestEnvironment, teardownTestEnvironment } = require('../helpers/setup');
const { createTestDb } = require('../helpers/test-db');

describe('API Versioning', () => {
  let app;
  let db;

  beforeAll(async () => {
    const setup = await setupTestEnvironment();
    app = setup.app;
    db = setup.db;

    // Insert test data
    await db.query(`
      INSERT INTO games (id, game_date, season, week, home_team, away_team, home_score, away_score, status, venue)
      VALUES 
        (1, '2024-01-15', 2024, 1, 'KC', 'BUF', 27, 24, 'Final', 'Arrowhead Stadium'),
        (2, '2024-01-16', 2024, 1, 'SF', 'GB', 24, 21, 'Final', "Levi's Stadium")
    `);

    await db.query(`
      INSERT INTO teams (id, name, abbreviation, city, conference, division, logo_url, established_year)
      VALUES 
        (1, 'Kansas City Chiefs', 'KC', 'Kansas City', 'AFC', 'West', 'https://example.com/kc.png', 1960),
        (2, 'Buffalo Bills', 'BUF', 'Buffalo', 'AFC', 'East', 'https://example.com/buf.png', 1960)
    `);

    await db.query(`
      INSERT INTO players (id, name, number, position, team, height, weight, age, birth_date, college, active)
      VALUES 
        (1, 'Patrick Mahomes', '15', 'QB', 'KC', '6-3', 230, 28, '1995-09-17', 'Texas Tech', true),
        (2, 'Josh Allen', '17', 'QB', 'BUF', '6-5', 237, 27, '1996-05-21', 'Wyoming', true)
    `);
  });

  afterAll(async () => {
    await teardownTestEnvironment({ app, db });
  });

  describe('Version Detection', () => {
    it('should detect version from URL path', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/games'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should detect version from Accept header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/games',
        headers: {
          accept: 'application/vnd.rolgi.v1+json'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should detect version from query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/games?api-version=v1'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should default to v2 when no version specified', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/games'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-api-version']).toBe('v2');
    });
  });

  describe('V1 API (Legacy)', () => {
    describe('GET /api/v1/games', () => {
      it('should return games in V1 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/games'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('games');
        expect(Array.isArray(body.games)).toBe(true);
        
        const game = body.games[0];
        expect(game).toHaveProperty('date'); // V1 uses 'date'
        expect(game).not.toHaveProperty('gameDate');
        expect(game).not.toHaveProperty('metadata');
        expect(game).not.toHaveProperty('createdAt');
      });

      it('should filter games by season', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/games?season=2024'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        body.games.forEach(game => {
          expect(game.season).toBe(2024);
        });
      });
    });

    describe('GET /api/v1/games/:id', () => {
      it('should return single game in V1 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/games/1'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('date');
        expect(body).not.toHaveProperty('gameDate');
        expect(body).not.toHaveProperty('metadata');
      });

      it('should return 404 for non-existent game', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/games/999'
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /api/v1/teams', () => {
      it('should return teams in V1 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/teams'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('teams');
        const team = body.teams[0];
        expect(team).toHaveProperty('abbr'); // V1 uses 'abbr'
        expect(team).not.toHaveProperty('teamAbbreviation');
      });
    });

    describe('GET /api/v1/players', () => {
      it('should return players in V1 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/players'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('players');
        const player = body.players[0];
        expect(player).toHaveProperty('height');
        expect(player).not.toHaveProperty('physicalAttributes');
      });
    });
  });

  describe('V2 API (Current)', () => {
    describe('GET /api/v2/games', () => {
      it('should return games in V2 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/games'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('pagination');
        expect(body).toHaveProperty('metadata');
        
        const game = body.data[0];
        expect(game).toHaveProperty('gameDate'); // V2 uses 'gameDate'
        expect(game).not.toHaveProperty('date');
        expect(game).toHaveProperty('metadata');
        expect(game.metadata).toHaveProperty('createdAt');
      });

      it('should include pagination metadata', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/games?limit=1'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body.pagination).toHaveProperty('total');
        expect(body.pagination).toHaveProperty('limit');
        expect(body.pagination).toHaveProperty('offset');
        expect(body.pagination).toHaveProperty('hasMore');
      });

      it('should support date range filtering', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/games?startDate=2024-01-15&endDate=2024-01-15'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body.data.length).toBe(1);
        expect(body.data[0].gameDate).toBe('2024-01-15');
      });
    });

    describe('GET /api/v2/games/:id', () => {
      it('should return single game in V2 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/games/1'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('metadata');
        expect(body.data).toHaveProperty('gameDate');
        expect(body.data.metadata).toHaveProperty('createdAt');
      });

      it('should return structured error for not found', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/games/999'
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('error');
        expect(body.error).toHaveProperty('code');
        expect(body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('GET /api/v2/teams', () => {
      it('should return teams in V2 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/teams'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('data');
        const team = body.data[0];
        expect(team).toHaveProperty('teamAbbreviation'); // V2 uses full name
        expect(team).not.toHaveProperty('abbr');
      });

      it('should support search filtering', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/teams?search=Chiefs'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0].name).toContain('Chiefs');
      });
    });

    describe('GET /api/v2/players', () => {
      it('should return players in V2 format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v2/players'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        
        expect(body).toHaveProperty('data');
        const player = body.data[0];
        expect(player).toHaveProperty('physicalAttributes');
        expect(player.physicalAttributes).toHaveProperty('height');
      });
    });
  });

  describe('Version Transformation', () => {
    it('should transform V2 data to V1 format when requested', async () => {
      const responseV1 = await app.inject({
        method: 'GET',
        url: '/api/v1/games/1'
      });

      const responseV2 = await app.inject({
        method: 'GET',
        url: '/api/v2/games/1'
      });

      const gameV1 = JSON.parse(responseV1.body);
      const gameV2 = JSON.parse(responseV2.body).data;

      // V1 has 'date', V2 has 'gameDate'
      expect(gameV1).toHaveProperty('date');
      expect(gameV2).toHaveProperty('gameDate');
      
      // Same data, different format
      expect(gameV1.id).toBe(gameV2.id);
      expect(gameV1.date).toBe(gameV2.gameDate);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle V1 requests without breaking', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/games?season=2024&limit=10'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('games');
      expect(body.games.length).toBeLessThanOrEqual(10);
    });

    it('should maintain V1 field names consistently', async () => {
      const gamesResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/games'
      });

      const teamsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/teams'
      });

      const games = JSON.parse(gamesResponse.body).games;
      const teams = JSON.parse(teamsResponse.body).teams;

      // Ensure V1 format is consistent
      games.forEach(game => {
        expect(game).toHaveProperty('date');
        expect(game).not.toHaveProperty('gameDate');
      });

      teams.forEach(team => {
        expect(team).toHaveProperty('abbr');
        expect(team).not.toHaveProperty('teamAbbreviation');
      });
    });
  });

  describe('Version Headers', () => {
    it('should include version headers in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v2/games'
      });

      expect(response.headers).toHaveProperty('x-api-version');
      expect(response.headers).toHaveProperty('x-api-version-info');
      expect(response.headers['x-api-version']).toBe('v2');
    });

    it('should include deprecation headers for deprecated versions', async () => {
      // Note: Currently no versions are marked as deprecated
      // This test is prepared for future deprecation
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/games'
      });

      // When V1 is deprecated, this will pass:
      // expect(response.headers).toHaveProperty('x-api-deprecated');
      expect(response.headers['x-api-version']).toBe('v1');
    });
  });

  describe('Invalid Version Handling', () => {
    it('should reject invalid version in URL', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v99/games'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('Invalid API version');
    });
  });
});
