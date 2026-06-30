/**
 * League-specific parameters loader
 * Provides calibrated parameters for analyzers (Poisson, etc.)
 */

const fs = require('fs');
const path = require('path');

let cachedParams = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load league parameters from JSON file
 * @returns {Object} League parameters object
 */
function loadLeagueParams() {
  const now = Date.now();
  
  // Return cached if fresh
  if (cachedParams && (now - lastLoadTime) < CACHE_TTL_MS) {
    return cachedParams;
  }

  const paramsPath = path.join(__dirname, '../../../.omp-lab/league-params.json');
  
  try {
    if (fs.existsSync(paramsPath)) {
      const raw = fs.readFileSync(paramsPath, 'utf8');
      cachedParams = JSON.parse(raw);
      lastLoadTime = now;
      return cachedParams;
    }
  } catch (err) {
    console.warn('Failed to load league-params.json, using defaults:', err.message);
  }

  // Fallback to defaults
  cachedParams = {
    params: {},
    global_avg: {
      avg_home_goals: 1.52,
      avg_away_goals: 1.32
    }
  };
  lastLoadTime = now;
  return cachedParams;
}

/**
 * Get league parameters for specific league and season
 * @param {number|string} leagueId - League ID
 * @param {number|string} season - Season year (e.g. 2024)
 * @returns {Object} { avg_home_goals, avg_away_goals }
 */
function getLeagueParams(leagueId, season = null) {
  const params = loadLeagueParams();
  const leagueData = params.params?.[String(leagueId)];
  
  if (!leagueData) {
    // Fallback to global average
    return params.global_avg;
  }

  // If season specified and exists
  if (season && leagueData.seasons?.[String(season)]) {
    const seasonData = leagueData.seasons[String(season)];
    return {
      avg_home_goals: seasonData.avg_home_goals,
      avg_away_goals: seasonData.avg_away_goals
    };
  }

  // Use combined average if available
  if (leagueData.combined_2023_2024) {
    return {
      avg_home_goals: leagueData.combined_2023_2024.avg_home_goals,
      avg_away_goals: leagueData.combined_2023_2024.avg_away_goals
    };
  }

  // Fallback to global
  return params.global_avg;
}

/**
 * Get Dixon-Coles rho parameter for league
 * @param {number|string} leagueId - League ID
 * @returns {number} Rho value (default -0.10)
 */
function getLeagueRho(leagueId) {
  const params = loadLeagueParams();
  const leagueData = params.params?.[String(leagueId)];
  
  if (leagueData?.dixon_coles_rho !== undefined) {
    return leagueData.dixon_coles_rho;
  }

  // Default Dixon-Coles rho
  return -0.10;
}

/**
 * Get draw boost multiplier for league
 * @param {number|string} leagueId - League ID
 * @returns {number} Draw boost multiplier (default 1.0)
 */
function getLeagueDrawBoost(leagueId) {
  const params = loadLeagueParams();
  const leagueData = params.params?.[String(leagueId)];
  
  if (leagueData?.draw_boost_multiplier !== undefined) {
    return leagueData.draw_boost_multiplier;
  }

  // Default: no additional boost beyond formula
  return 1.0;
}

/**
 * Invalidate cache (useful for testing or manual reload)
 */
function invalidateCache() {
  cachedParams = null;
  lastLoadTime = 0;
}

module.exports = {
  loadLeagueParams,
  getLeagueParams,
  getLeagueRho,
  getLeagueDrawBoost,
  invalidateCache
};
