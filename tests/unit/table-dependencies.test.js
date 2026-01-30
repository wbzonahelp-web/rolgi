/**
 * Unit Tests for Table Dependencies
 * 
 * @jest-environment node
 */

const { 
  TABLE_DEPENDENCIES, 
  getLoadOrder, 
  canLoadTable, 
  getDependencies 
} = require('../../src/database/table-dependencies');

describe('Table Dependencies', () => {
  describe('TABLE_DEPENDENCIES', () => {
    it('should have all required tables defined', () => {
      const expectedTables = [
        'countries',
        'bookmakers',
        'leagues',
        'seasons',
        'teams',
        'players',
        'games',
        'game_stats',
        'game_events',
        'team_stats',
        'player_stats',
        'odds',
        'odds_movements',
        'standings',
        'predictions',
        'insights',
        'data_sync_log',
        'api_request_log',
        'system_alerts'
      ];

      expectedTables.forEach(table => {
        expect(TABLE_DEPENDENCIES).toHaveProperty(table);
      });
    });

    it('should have correct dependencies for games table', () => {
      const gamesDeps = TABLE_DEPENDENCIES.games;

      expect(gamesDeps.dependsOn).toContain('leagues');
      expect(gamesDeps.dependsOn).toContain('seasons');
      expect(gamesDeps.dependsOn).toContain('teams');
    });

    it('should have empty dependencies for reference tables', () => {
      expect(TABLE_DEPENDENCIES.countries.dependsOn).toEqual([]);
      expect(TABLE_DEPENDENCIES.bookmakers.dependsOn).toEqual([]);
    });
  });

  describe('getLoadOrder', () => {
    it('should return correct load order', () => {
      const loadOrder = getLoadOrder();

      expect(Array.isArray(loadOrder)).toBe(true);
      expect(loadOrder.length).toBeGreaterThan(0);

      // Reference tables should come first
      const countriesIndex = loadOrder.indexOf('countries');
      const bookmakersIndex = loadOrder.indexOf('bookmakers');
      const gamesIndex = loadOrder.indexOf('games');

      expect(countriesIndex).toBeLessThan(gamesIndex);
      expect(bookmakersIndex).toBeLessThan(gamesIndex);
    });

    it('should have all tables in load order', () => {
      const loadOrder = getLoadOrder();
      const allTables = Object.keys(TABLE_DEPENDENCIES);

      allTables.forEach(table => {
        expect(loadOrder).toContain(table);
      });
    });
  });

  describe('canLoadTable', () => {
    it('should allow loading reference tables immediately', async () => {
      const result = await canLoadTable('countries');

      expect(result.canLoad).toBe(true);
      expect(result.missingDependencies).toEqual([]);
    });

    it('should detect missing dependencies', async () => {
      // Mock database query to return empty result
      const mockDb = {
        query: jest.fn().mockResolvedValue({ rowCount: 0 })
      };

      const result = await canLoadTable('games', mockDb);

      expect(result.canLoad).toBe(false);
      expect(result.missingDependencies.length).toBeGreaterThan(0);
    });
  });

  describe('getDependencies', () => {
    it('should return dependencies for a table', () => {
      const deps = getDependencies('games');

      expect(Array.isArray(deps)).toBe(true);
      expect(deps.length).toBeGreaterThan(0);
      
      deps.forEach(dep => {
        expect(dep).toHaveProperty('table');
        expect(dep).toHaveProperty('column');
      });
    });

    it('should return empty array for tables without dependencies', () => {
      const deps = getDependencies('countries');

      expect(deps).toEqual([]);
    });
  });
});
