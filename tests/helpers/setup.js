/**
 * Jest Setup File
 * Runs before all tests
 */

const { setupTestDb, cleanTestDb, seedTestDb, teardownTestDb } = require('./test-db');

// Setup test database before all tests
beforeAll(async () => {
  try {
    console.log('Setting up test database...');
    await setupTestDb();
    await cleanTestDb();
    await seedTestDb();
    console.log('Test database ready!');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}, 30000); // 30 seconds timeout

// Clean database before each test
beforeEach(async () => {
  // Note: We don't clean here to preserve seed data
  // Tests should handle their own cleanup if needed
});

// Teardown test database after all tests
afterAll(async () => {
  try {
    console.log('Tearing down test database...');
    await teardownTestDb();
    console.log('Test database closed!');
  } catch (error) {
    console.error('Failed to teardown test database:', error);
  }
});

// Set test timeout globally
jest.setTimeout(10000); // 10 seconds
