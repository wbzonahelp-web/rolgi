/**
 * Teams API Tests
 * 
 * Тестирование всех эндпоинтов Teams API
 * 
 * Запуск: node tests/manual/test-teams-api.js
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';

// Test counter
let testCount = 0;
let passedCount = 0;
let failedCount = 0;

/**
 * Helper function to print test results
 */
function printResult(testName, success, result, error = null) {
  testCount++;
  console.log('\n' + '='.repeat(80));
  console.log(`TEST ${testCount}: ${testName}`);
  console.log('='.repeat(80));
  
  if (success) {
    passedCount++;
    console.log('✅ SUCCESS');
    console.log('Result type:', typeof result);
    
    if (typeof result === 'object') {
      console.log('Keys:', Object.keys(result));
      console.log('Preview:', JSON.stringify(result, null, 2).slice(0, 500) + '...');
    } else {
      console.log('Value:', result);
    }
  } else {
    failedCount++;
    console.log('❌ FAILED');
    console.log('Error:', error?.message || 'Unknown error');
    if (error?.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

/**
 * Test suite
 */
async function runTests() {
  console.log('\n🚀 Starting Teams API tests...');
  console.log(`API URL: ${API_URL}`);
  console.log('');

  // Test 1: Get teams list
  try {
    const response = await axios.get(`${API_URL}/api/teams/list`, {
      params: { limit: 5 }
    });
    printResult(
      'Get teams list (limit 5)',
      true,
      response.data
    );
  } catch (error) {
    printResult('Get teams list (limit 5)', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 2: Search teams by name
  try {
    const response = await axios.get(`${API_URL}/api/teams/search`, {
      params: { name: 'Arsenal', limit: 3 }
    });
    printResult(
      'Search teams by name (Arsenal)',
      true,
      response.data
    );
  } catch (error) {
    printResult('Search teams by name (Arsenal)', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 3: Get team details
  try {
    const response = await axios.get(`${API_URL}/api/teams/42`);
    printResult(
      'Get team details (ID: 42 - Arsenal)',
      true,
      {
        success: response.data.success,
        teamName: response.data.data?.name,
        country: response.data.data?.country,
        seasonsCount: response.data.data?.seasons?.length,
        playersCount: response.data.data?.players?.length,
        hasVenue: !!response.data.data?.venue,
        hasCoach: !!response.data.data?.coach
      }
    );
  } catch (error) {
    printResult('Get team details (ID: 42 - Arsenal)', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 4: Get teams by country
  try {
    const response = await axios.get(`${API_URL}/api/teams/country/Spain`, {
      params: { limit: 5 }
    });
    printResult(
      'Get teams by country (Spain)',
      true,
      {
        success: response.data.success,
        country: response.data.country,
        count: response.data.count,
        teams: response.data.data?.map(t => ({ id: t.id, name: t.name }))
      }
    );
  } catch (error) {
    printResult('Get teams by country (Spain)', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 5: Get teams with pagination
  try {
    const response = await axios.get(`${API_URL}/api/teams/list`, {
      params: { offset: 10, limit: 5 }
    });
    printResult(
      'Get teams with pagination (offset: 10, limit: 5)',
      true,
      {
        success: response.data.success,
        count: response.data.count,
        totalCount: response.data.totalCount,
        metadata: response.data.metadata,
        teams: response.data.data?.map(t => ({ id: t.id, name: t.name }))
      }
    );
  } catch (error) {
    printResult('Get teams with pagination', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 6: Search teams by country code
  try {
    const response = await axios.get(`${API_URL}/api/teams/list`, {
      params: { country: 'ENG', limit: 5 }
    });
    printResult(
      'Search teams by country code (ENG)',
      true,
      {
        success: response.data.success,
        count: response.data.count,
        teams: response.data.data?.map(t => ({ id: t.id, name: t.name, country: t.country }))
      }
    );
  } catch (error) {
    printResult('Search teams by country code (ENG)', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 7: Get examples
  try {
    const response = await axios.get(`${API_URL}/api/teams/examples`);
    printResult(
      'Get API examples',
      true,
      {
        success: response.data.success,
        examplesCount: Object.keys(response.data.examples || {}).length,
        examples: Object.keys(response.data.examples || {})
      }
    );
  } catch (error) {
    printResult('Get API examples', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 8: Health check
  try {
    const response = await axios.get(`${API_URL}/api/teams/health`);
    printResult(
      'Teams API health check',
      true,
      response.data
    );
  } catch (error) {
    printResult('Teams API health check', false, null, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 9: Test 404 error (non-existent team)
  try {
    await axios.get(`${API_URL}/api/teams/999999`);
    printResult('Test 404 error', false, null, new Error('Should have returned 404'));
  } catch (error) {
    if (error.response?.status === 404) {
      printResult(
        'Test 404 error (non-existent team)',
        true,
        {
          status: error.response.status,
          error: error.response.data.error,
          message: error.response.data.message
        }
      );
    } else {
      printResult('Test 404 error', false, null, error);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total tests: ${testCount}`);
  console.log(`✅ Passed: ${passedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log('='.repeat(80) + '\n');

  process.exit(failedCount > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
