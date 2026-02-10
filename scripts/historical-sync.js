#!/usr/bin/env node
/**
 * Historical Data Sync Script
 * Loads all games from 2021 to present
 */

const { Pool } = require('pg');
const axios = require('axios');

const API_BASE = 'https://api.sstats.net';
const API_KEY = process.env.SSTATS_API_KEY || 'fl3qjc4crvx8cppm';

// Configuration
const START_YEAR = parseInt(process.env.START_YEAR || '2021');
const END_DATE = process.env.END_DATE || new Date().toISOString().split('T')[0];
const BATCH_SIZE = parseInt(process.env.BATCH || '500');
const DELAY_MS = parseInt(process.env.DELAY || '300');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6'
});

let leaguesMap = new Map();
let teamsMap = new Map();
let stats = {
  daysProcessed: 0,
  gamesInserted: 0,
  gamesUpdated: 0,
  teamsCreated: 0,
  errors: 0,
  startTime: Date.now()
};

async function fetchAPI(endpoint, params = {}) {
  const url = new URL(endpoint, API_BASE);
  url.searchParams.append('apikey', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  
  const response = await axios.get(url.toString(), { timeout: 30000 });
  return response.data;
}

async function loadMaps() {
  const leaguesResult = await pool.query('SELECT id, sstats_id FROM leagues');
  leaguesResult.rows.forEach(r => leaguesMap.set(r.sstats_id, r.id));
  
  const teamsResult = await pool.query('SELECT id, sstats_id FROM teams');
  teamsResult.rows.forEach(r => teamsMap.set(r.sstats_id, r.id));
  
  console.log(`📋 Loaded: ${leaguesMap.size} leagues, ${teamsMap.size} teams\n`);
}

async function syncLeagues() {
  console.log('📋 Syncing leagues...');
  
  try {
    const result = await fetchAPI('/Leagues');
    const leagues = result.data || result || [];
    
    let inserted = 0;
    for (const league of leagues) {
      try {
        const res = await pool.query(`
          INSERT INTO leagues (sstats_id, name, country_name, logo, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (sstats_id) DO UPDATE SET
            name = EXCLUDED.name,
            country_name = EXCLUDED.country_name,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [league.id, league.name, league.country?.name || league.countryName, league.logo]);
        
        if (res.rows[0]) leaguesMap.set(league.id, res.rows[0].id);
        inserted++;
      } catch (err) {}
    }
    
    console.log(`  ✅ ${inserted} leagues\n`);
    return inserted;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return 0;
  }
}

async function insertTeam(team) {
  if (!team || !team.id) return null;
  
  if (teamsMap.has(team.id)) {
    return teamsMap.get(team.id);
  }
  
  try {
    const res = await pool.query(`
      INSERT INTO teams (sstats_id, name, short_name, logo, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (sstats_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [team.id, team.name, team.shortName || team.name?.substring(0, 20), team.logo]);
    
    if (res.rows[0]) {
      teamsMap.set(team.id, res.rows[0].id);
      stats.teamsCreated++;
      return res.rows[0].id;
    }
  } catch (err) {}
  
  return null;
}

async function syncGamesForDate(dateStr) {
  try {
    const result = await fetchAPI('/Games/list', { date: dateStr, limit: BATCH_SIZE });
    const games = result.data || result || [];
    
    if (games.length === 0) return { inserted: 0, updated: 0 };
    
    let inserted = 0;
    let updated = 0;
    
    for (const game of games) {
      // Insert teams if needed
      const homeTeamId = await insertTeam(game.homeTeam);
      const awayTeamId = await insertTeam(game.awayTeam);
      
      // Get league from season.league
      let apiLeagueId = game.leagueId || game.league?.id;
      if (!apiLeagueId && game.season?.league?.id) {
        apiLeagueId = game.season.league.id;
      }
      const leagueId = leaguesMap.get(apiLeagueId);
      
      // Season year
      let seasonYear = new Date(game.date).getFullYear();
      if (game.season?.year) seasonYear = game.season.year;
      else if (typeof game.season === 'number') seasonYear = game.season;
      
      // Status mapping
      let status = 'scheduled';
      if (game.status === 3 || game.status === 4) status = 'live';
      else if (game.status === 5) status = 'finished';
      else if (game.status === 6) status = 'postponed';
      else if (game.status === 7) status = 'cancelled';
      
      try {
        // Check if exists first
        const existing = await pool.query(
          'SELECT 1 FROM games WHERE sstats_id = $1 LIMIT 1',
          [game.id]
        );
        const isNew = existing.rows.length === 0;
        
        await pool.query(`
          INSERT INTO games (sstats_id, league_id, season, date, home_team_id, away_team_id, 
                           home_score, away_score, home_score_ht, away_score_ht, status, 
                           is_live, is_finished)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (sstats_id, date) DO UPDATE SET
            league_id = COALESCE(EXCLUDED.league_id, games.league_id),
            home_score = COALESCE(EXCLUDED.home_score, games.home_score),
            away_score = COALESCE(EXCLUDED.away_score, games.away_score),
            home_score_ht = COALESCE(EXCLUDED.home_score_ht, games.home_score_ht),
            away_score_ht = COALESCE(EXCLUDED.away_score_ht, games.away_score_ht),
            status = EXCLUDED.status,
            is_live = EXCLUDED.is_live,
            is_finished = EXCLUDED.is_finished,
            last_updated = CURRENT_TIMESTAMP
        `, [
          game.id,
          leagueId,
          seasonYear,
          game.date,
          homeTeamId,
          awayTeamId,
          game.homeScore ?? game.homeFTResult,
          game.awayScore ?? game.awayFTResult,
          game.homeScoreHT ?? game.homeHTResult,
          game.awayScoreHT ?? game.awayHTResult,
          status,
          status === 'live',
          status === 'finished'
        ]);
        
        if (isNew) inserted++;
        else updated++;
      } catch (err) {
        stats.errors++;
      }
    }
    
    return { inserted, updated, total: games.length };
  } catch (error) {
    stats.errors++;
    return { inserted: 0, updated: 0, error: error.message };
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function printProgress(currentDate, dayStats) {
  const elapsed = Date.now() - stats.startTime;
  const rate = stats.daysProcessed / (elapsed / 1000 / 60); // days per minute
  
  process.stdout.write(`\r  ${currentDate} | Games: +${dayStats.inserted} ~${dayStats.updated} | ` +
    `Total: ${stats.gamesInserted + stats.gamesUpdated} | ` +
    `Teams: ${stats.teamsCreated} | ` +
    `${formatDuration(elapsed)} | ${rate.toFixed(1)} days/min    `);
}

async function syncDateRange(startDate, endDate) {
  console.log(`\n🎮 Syncing games from ${startDate} to ${endDate}...\n`);
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  console.log(`  Total days to process: ${totalDays}\n`);
  
  let current = new Date(end);
  
  while (current >= start) {
    const dateStr = current.toISOString().split('T')[0];
    
    const dayStats = await syncGamesForDate(dateStr);
    
    stats.daysProcessed++;
    stats.gamesInserted += dayStats.inserted || 0;
    stats.gamesUpdated += dayStats.updated || 0;
    
    printProgress(dateStr, dayStats);
    
    // Move to previous day
    current.setDate(current.getDate() - 1);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    
    // Progress checkpoint every 100 days
    if (stats.daysProcessed % 100 === 0) {
      console.log(`\n  📊 Checkpoint: ${stats.daysProcessed} days, ${stats.gamesInserted} inserted, ${stats.gamesUpdated} updated`);
    }
  }
  
  console.log('\n');
}

async function main() {
  const startDate = `${START_YEAR}-01-01`;
  
  console.log('═'.repeat(70));
  console.log('🚀 HISTORICAL DATA SYNC');
  console.log('═'.repeat(70));
  console.log(`  Period: ${startDate} → ${END_DATE}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Delay: ${DELAY_MS}ms`);
  console.log('═'.repeat(70));
  
  try {
    await pool.query('SELECT 1');
    console.log('\n✅ Database connected');
    
    // Load existing data
    await loadMaps();
    
    // Sync leagues first
    await syncLeagues();
    
    // Sync all historical games
    await syncDateRange(startDate, END_DATE);
    
    // Final statistics
    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM leagues) as leagues,
        (SELECT COUNT(*) FROM teams) as teams,
        (SELECT COUNT(*) FROM games) as games,
        (SELECT COUNT(*) FROM games WHERE league_id IS NOT NULL) as games_with_league,
        (SELECT COUNT(*) FROM games WHERE is_finished = true) as finished_games
    `);
    
    const c = counts.rows[0];
    const duration = formatDuration(Date.now() - stats.startTime);
    
    console.log('═'.repeat(70));
    console.log('📊 SYNC COMPLETE');
    console.log('═'.repeat(70));
    console.log(`  Duration:        ${duration}`);
    console.log(`  Days processed:  ${stats.daysProcessed}`);
    console.log(`  Games inserted:  ${stats.gamesInserted}`);
    console.log(`  Games updated:   ${stats.gamesUpdated}`);
    console.log(`  Teams created:   ${stats.teamsCreated}`);
    console.log(`  Errors:          ${stats.errors}`);
    console.log('');
    console.log('  📈 Database totals:');
    console.log(`     Leagues:       ${c.leagues}`);
    console.log(`     Teams:         ${c.teams}`);
    console.log(`     Games:         ${c.games}`);
    console.log(`     With league:   ${c.games_with_league} (${Math.round(c.games_with_league / c.games * 100)}%)`);
    console.log(`     Finished:      ${c.finished_games}`);
    console.log('═'.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
