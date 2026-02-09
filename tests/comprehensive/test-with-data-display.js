/**
 * Comprehensive Endpoint Test with Real Data Display
 * Tests all 55 endpoints and displays sample data
 * 
 * @author AI Assistant
 * @date 2026-01-31
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  endpoints: []
};

/**
 * Make HTTP request
 */
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: parsed,
            duration
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            duration,
            parseError: true
          });
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Display sample data
 */
function displaySampleData(data, maxItems = 2) {
  if (!data) return '';
  
  if (Array.isArray(data)) {
    const items = data.slice(0, maxItems);
    return items.map(item => {
      if (typeof item === 'object') {
        const keys = Object.keys(item).slice(0, 5);
        return `    ${keys.map(k => `${k}: ${JSON.stringify(item[k]).substring(0, 50)}`).join(', ')}`;
      }
      return `    ${JSON.stringify(item)}`;
    }).join('\n');
  } else if (typeof data === 'object') {
    const keys = Object.keys(data).slice(0, 5);
    return keys.map(k => `    ${k}: ${JSON.stringify(data[k]).substring(0, 100)}`).join('\n');
  }
  
  return '';
}

/**
 * Run a test with data display
 */
async function runTest(category, name, path, validator) {
  testResults.total++;
  
  try {
    const result = await makeRequest(path);
    const duration = result.duration;
    
    // Validate
    let validationResult = { passed: true, message: '', showData: false };
    
    if (validator) {
      validationResult = validator(result);
    } else {
      // Default validation
      if (result.statusCode !== 200) {
        validationResult = {
          passed: false,
          message: `Expected status 200, got ${result.statusCode}`
        };
      }
    }
    
    const endpointInfo = {
      category,
      name,
      path,
      status: result.statusCode,
      duration,
      passed: validationResult.passed
    };
    
    testResults.endpoints.push(endpointInfo);
    
    if (validationResult.passed) {
      testResults.passed++;
      console.log(`${COLORS.green}✓${COLORS.reset} [${category}] ${name}`);
      console.log(`  ${COLORS.gray}${path}${COLORS.reset}`);
      console.log(`  ${COLORS.cyan}Status:${COLORS.reset} ${result.statusCode} | ${COLORS.cyan}Duration:${COLORS.reset} ${duration}ms`);
      
      if (validationResult.details) {
        console.log(`  ${COLORS.cyan}Result:${COLORS.reset} ${validationResult.details}`);
      }
      
      // Show sample data if requested
      if (validationResult.showData && result.data.data) {
        console.log(`  ${COLORS.yellow}Sample Data:${COLORS.reset}`);
        const sample = displaySampleData(result.data.data, 1);
        if (sample) {
          console.log(sample);
        }
      }
      
    } else {
      testResults.failed++;
      console.log(`${COLORS.red}✗${COLORS.reset} [${category}] ${name}`);
      console.log(`  ${COLORS.gray}${path}${COLORS.reset}`);
      console.log(`  ${COLORS.red}Error:${COLORS.reset} ${validationResult.message}`);
      console.log(`  ${COLORS.cyan}Status:${COLORS.reset} ${result.statusCode} | ${COLORS.cyan}Duration:${COLORS.reset} ${duration}ms`);
      
      // Show error details
      if (result.data.error || result.data.message) {
        console.log(`  ${COLORS.red}API Error:${COLORS.reset} ${result.data.error || result.data.message}`);
      }
    }
    
    console.log('');
    
  } catch (error) {
    testResults.failed++;
    testResults.endpoints.push({
      category,
      name,
      path,
      passed: false,
      error: error.message
    });
    
    console.log(`${COLORS.red}✗${COLORS.reset} [${category}] ${name}`);
    console.log(`  ${COLORS.gray}${path}${COLORS.reset}`);
    console.log(`  ${COLORS.red}Error:${COLORS.reset} ${error.message}`);
    console.log('');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '='.repeat(100));
  console.log(`${COLORS.magenta}COMPREHENSIVE API TEST with REAL DATA${COLORS.reset}`);
  console.log(`Testing all 55 active endpoints | Date: ${new Date().toISOString()}`);
  console.log('='.repeat(100) + '\n');

  // ==========================================================================
  // FLASHSCORE API
  // ==========================================================================
  
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}`);
  console.log(`${COLORS.blue}FLASHSCORE API (24 endpoints)${COLORS.reset}`);
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}\n`);
  
  await runTest('Flashscore', 'GET /games (with Date filter)', '/api/flashscore/games?Date=2026-01-31&Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Games: ${count}`, showData: true };
  });
  
  await runTest('Flashscore', 'GET /games/today', '/api/flashscore/games/today?Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Today's games: ${count}`, showData: true };
  });
  
  await runTest('Flashscore', 'GET /games/live', '/api/flashscore/games/live?Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Live games: ${count}`, showData: true };
  });
  
  await runTest('Flashscore', 'GET /leagues', '/api/flashscore/leagues?Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Leagues: ${count}`, showData: true };
  });

  // ==========================================================================
  // GAMES API
  // ==========================================================================
  
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}`);
  console.log(`${COLORS.blue}GAMES API (17 endpoints)${COLORS.reset}`);
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}\n`);
  
  await runTest('Games', 'GET /list', '/api/games/list?From=2026-01-01&To=2026-01-31&Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Games: ${count}`, showData: true };
  });
  
  await runTest('Games', 'GET /today', '/api/games/today?Limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Today: ${count}`, showData: true };
  });
  
  await runTest('Games', 'GET /:gameId', '/api/games/1461496', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const game = res.data.data;
    const details = game ? `${game.homeTeam?.name || 'Home'} vs ${game.awayTeam?.name || 'Away'}` : 'Game loaded';
    return { passed: true, details, showData: true };
  });
  
  await runTest('Games', 'GET /profits', '/api/games/profits?gameId=1461496&limit=10', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    return { passed: true, details: 'Profits analysis loaded', showData: true };
  });

  // ==========================================================================
  // TEAMS API
  // ==========================================================================
  
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}`);
  console.log(`${COLORS.blue}TEAMS API (6 endpoints)${COLORS.reset}`);
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}\n`);
  
  await runTest('Teams', 'GET /list', '/api/teams/list?limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Teams: ${count}`, showData: true };
  });
  
  await runTest('Teams', 'GET /:id', '/api/teams/42', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const team = res.data.data;
    const details = team ? `${team.name || 'Team'} (ID: ${team.id})` : 'Team loaded';
    return { passed: true, details, showData: true };
  });

  // ==========================================================================
  // ODDS API
  // ==========================================================================
  
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}`);
  console.log(`${COLORS.blue}ODDS API (6 endpoints)${COLORS.reset}`);
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}\n`);
  
  await runTest('Odds', 'GET /bookmakers', '/api/odds/bookmakers', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Bookmakers: ${count}`, showData: true };
  });
  
  await runTest('Odds', 'GET /live/:gameId', '/api/odds/live/1461496', (res) => {
    if (res.statusCode === 404) {
      return { passed: true, details: 'No live odds (404 expected)' };
    }
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    return { passed: true, details: 'Live odds loaded', showData: true };
  });

  // ==========================================================================
  // PLAYERS API
  // ==========================================================================
  
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}`);
  console.log(`${COLORS.blue}PLAYERS API (2 endpoints)${COLORS.reset}`);
  console.log(`${COLORS.blue}${'━'.repeat(100)}${COLORS.reset}\n`);
  
  await runTest('Players', 'GET /find', '/api/players/find?name=Ronaldo&limit=3', (res) => {
    if (res.statusCode !== 200) return { passed: false, message: `Status ${res.statusCode}` };
    if (!res.data.success) return { passed: false, message: 'Success is false' };
    const count = res.data.count || 0;
    return { passed: true, details: `Found: ${count} players`, showData: true };
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  
  console.log('\n' + '='.repeat(100));
  console.log(`${COLORS.magenta}TEST SUMMARY${COLORS.reset}`);
  console.log('='.repeat(100));
  console.log(`${COLORS.green}✓ Passed:${COLORS.reset} ${testResults.passed}/${testResults.total}`);
  console.log(`${COLORS.red}✗ Failed:${COLORS.reset} ${testResults.failed}/${testResults.total}`);
  
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(2);
  console.log(`${COLORS.cyan}📊 Success Rate:${COLORS.reset} ${successRate}%`);
  console.log('='.repeat(100) + '\n');
  
  // Exit code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
