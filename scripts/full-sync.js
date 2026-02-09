#!/usr/bin/env node
/**
 * Full Data Sync Script
 * Syncs data for multiple days with proper league linking
 */

const { Pool } = require('pg');
const axios = require('axios');

const API_BASE = 'https://api.sstats.net';
const API_KEY = process.env.SSTATS_API_KEY || 'fl3qjc4crvx8cppm';
const DAYS_TO_SYNC = parseInt(process.env.DAYS || '14');
const BATCH_SIZE = parseInt(process.env.BATCH || '50');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6'
});

let leaguesMap = new Map();
let teamsMap = new Map();

async function fetchAPI(endpoint, params = {}) {
  const url = new URL(endpoint, API_BASE);
  url.searchParams.append('apikey', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  
  const response = await axios.get(url.toString(), { timeout: 30000 });
  return response.data;
}

async function fetchGameDetails(gameId) {
  try {
    const url = `${API_BASE}/Games/${gameId}?apikey=${API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data?.data?.game;
  } catch (error) {
    return null;
  }
}

async function loadMaps() {
  const leaguesResult = await pool.query('SELECT id, sstats_id FROM leagues');
  leaguesResult.rows.forEach(r => leaguesMap.set(r.sstats_id, r.id));
  
  const teamsResult = await pool.query('SELECT id, sstats_id FROM teams');
  teamsResult.rows.forEach(r => teamsMap.set(r.sstats_id, r.id));
  
  console.log(`📋 Maps: ${leaguesMap.size} leagues, ${teamsMap.size} teams`);
}

async function syncLeagues() {
  console.log('\n📋 Syncing leagues...');
  
  try {
    const result = await fetchAPI('/Leagues');
    const leagues = result.data || result || [];
    
    let inserted = 0;
    for (const league of leagues) {
      try {
        await pool.query(`
          INSERT INTO leagues (sstats_id, name, country_name, logo, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (sstats_id) DO UPDATE SET
            name = EXCLUDED.name,
            country_name = EXCLUDED.country_name,
            logo = EXCLUDED.logo,
            updated_at = CURRENT_TIMESTAMP
        `, [league.id, league.name, league.country?.name || league.countryName, league.logo]);
        leaguesMap.set(league.id, inserted + 1);
        inserted++;
      } catch (err) {}
    }
    
    // Reload map with actual IDs
    const leaguesResult = await pool.query('SELECT id, sstats_id FROM leagues');
    leaguesMap.clear();
    leaguesResult.rows.forEach(r => leaguesMap.set(r.sstats_id, r.id));
    
    console.log(`  ✅ ${inserted} leagues synced`);
    return inserted;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return 0;
  }
}

async function insertTeam(team) {
  if (!team || !team.id || teamsMap.has(team.id)) return;
  
  try {
    const res = await pool.query(`
      INSERT INTO teams (sstats_id, name, short_name, logo, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (sstats_id) DO NOTHING
      RETURNING id
    `, [team.id, team.name, team.shortName || team.name?.substring(0, 20), team.logo]);
    
    if (res.rows[0]) teamsMap.set(team.id, res.rows[0].id);
  } catch (err) {}
}

async function syncGamesForDate(date) {
  console.log(`  📅 ${date}...`);
  
  try {
    // Fetch all games with pagination (API limit is 500 per request)
    const PAGE_SIZE = 500;
    let allGames = [];
    let page = 0;
    
    while (true) {
      const result = await fetchAPI('/Games/list', { date, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      const games = result.data || result || [];
      allGames = allGames.concat(games);
      
      if (games.length < PAGE_SIZE) break; // No more pages
      page++;
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit between pages
    }
    
    const games = allGames;
    
    if (games.length === 0) {
      console.log(`     0 games`);
      return { synced: 0, withLeague: 0 };
    }
    
    if (page > 0) {
      console.log(`     📄 Fetched ${games.length} games in ${page + 1} pages`);
    }
    
    // Insert missing teams
    for (const game of games) {
      await insertTeam(game.homeTeam);
      await insertTeam(game.awayTeam);
    }
    
    let synced = 0;
    let withLeague = 0;
    let batch = [];
    
    for (const game of games) {
      // Get league from season.league
      let apiLeagueId = game.leagueId || game.league?.id;
      if (!apiLeagueId && game.season?.league?.id) {
        apiLeagueId = game.season.league.id;
      }
      
      const leagueId = leaguesMap.get(apiLeagueId);
      const homeTeamId = teamsMap.get(game.homeTeam?.id);
      const awayTeamId = teamsMap.get(game.awayTeam?.id);
      
      let seasonYear = new Date(game.date).getFullYear();
      if (game.season?.year) seasonYear = game.season.year;
      else if (typeof game.season === 'number') seasonYear = game.season;
      
      let status = 'scheduled';
      if (game.status === 3 || game.status === 4) status = 'live';
      else if (game.status === 5 || game.status === 8 || game.status === 9 || game.status === 10) status = 'finished';
      else if (game.status === 6) status = 'postponed';
      else if (game.status === 7) status = 'cancelled';
      
      batch.push({
        sstats_id: game.id,
        league_id: leagueId,
        season: seasonYear,
        date: game.date,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_score: game.homeFTResult ?? game.homeScore,
        away_score: game.awayFTResult ?? game.awayScore,
        home_score_ht: game.homeHTResult ?? game.homeScoreHT,
        away_score_ht: game.awayHTResult ?? game.awayScoreHT,
        status,
        is_live: status === 'live',
        is_finished: status === 'finished'
      });
      
      if (leagueId) withLeague++;
    }
    
    // Batch insert
    for (const g of batch) {
      try {
        await pool.query(`
          INSERT INTO games (sstats_id, league_id, season, date, home_team_id, away_team_id, 
                           home_score, away_score, home_score_ht, away_score_ht, status, 
                           is_live, is_finished)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (sstats_id, date) DO UPDATE SET
            league_id = COALESCE(EXCLUDED.league_id, games.league_id),
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            home_score_ht = EXCLUDED.home_score_ht,
            away_score_ht = EXCLUDED.away_score_ht,
            status = EXCLUDED.status,
            is_live = EXCLUDED.is_live,
            is_finished = EXCLUDED.is_finished,
            last_updated = CURRENT_TIMESTAMP
        `, [g.sstats_id, g.league_id, g.season, g.date, g.home_team_id, g.away_team_id,
            g.home_score, g.away_score, g.home_score_ht, g.away_score_ht,
            g.status, g.is_live, g.is_finished]);
        synced++;
      } catch (err) {}
    }
    
    console.log(`     ${synced} synced, ${withLeague} with league`);
    return { synced, withLeague };
  } catch (error) {
    console.log(`     ❌ Error: ${error.message}`);
    return { synced: 0, withLeague: 0 };
  }
}

async function syncGamesRange(startDate, days) {
  console.log(`\n🎮 Syncing games for ${days} days starting ${startDate}...`);
  
  let totalSynced = 0;
  let totalWithLeague = 0;
  
  const start = new Date(startDate);
  
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const result = await syncGamesForDate(dateStr);
    totalSynced += result.synced;
    totalWithLeague += result.withLeague;
    
    // Rate limiting between days
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return { synced: totalSynced, withLeague: totalWithLeague };
}

async function fixMissingLeagueIds() {
  console.log('\n🔧 Fixing missing league IDs...');
  
  const gamesResult = await pool.query(`
    SELECT sstats_id FROM games 
    WHERE league_id IS NULL 
    ORDER BY date DESC 
    LIMIT $1
  `, [BATCH_SIZE]);
  
  const games = gamesResult.rows;
  if (games.length === 0) {
    console.log('  ✅ No games need fixing');
    return 0;
  }
  
  console.log(`  Found ${games.length} games to fix...`);
  
  let updated = 0;
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const details = await fetchGameDetails(game.sstats_id);
    
    if (details?.season?.league?.id) {
      const leagueId = leaguesMap.get(details.season.league.id);
      
      if (leagueId) {
        await pool.query(
          'UPDATE games SET league_id = $1 WHERE sstats_id = $2',
          [leagueId, game.sstats_id]
        );
        updated++;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`  ✅ Updated ${updated}/${games.length} games`);
  return updated;
}

async function main() {
  console.log('🚀 Full Data Sync\n');
  console.log(`  Days: ${DAYS_TO_SYNC}`);
  console.log(`  Batch: ${BATCH_SIZE}`);
  
  const stats = {
    leagues: 0,
    games: 0,
    gamesWithLeague: 0,
    leaguesFix: 0
  };
  
  try {
    await pool.query('SELECT 1');
    console.log('\n✅ Database connected');
    
    // Load existing maps
    await loadMaps();
    
    // Sync leagues
    stats.leagues = await syncLeagues();
    
    // Sync games for date range
    const today = new Date().toISOString().split('T')[0];
    const gamesResult = await syncGamesRange(today, DAYS_TO_SYNC);
    stats.games = gamesResult.synced;
    stats.gamesWithLeague = gamesResult.withLeague;
    
    // Reload teams map
    const teamsResult = await pool.query('SELECT id, sstats_id FROM teams');
    teamsMap.clear();
    teamsResult.rows.forEach(r => teamsMap.set(r.sstats_id, r.id));
    
    // Fix missing league IDs
    stats.leaguesFix = await fixMissingLeagueIds();
    
    // Final counts
    const finalCounts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM leagues) as leagues,
        (SELECT COUNT(*) FROM teams) as teams,
        (SELECT COUNT(*) FROM games) as games,
        (SELECT COUNT(*) FROM games WHERE league_id IS NOT NULL) as games_with_league
    `);
    
    const counts = finalCounts.rows[0];
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Leagues synced:     ${stats.leagues}`);
    console.log(`  Games synced:       ${stats.games}`);
    console.log(`  Games with league:  ${stats.gamesWithLeague}`);
    console.log(`  League IDs fixed:   ${stats.leaguesFix}`);
    console.log('');
    console.log('  📈 Database totals:');
    console.log(`     Leagues: ${counts.leagues}`);
    console.log(`     Teams:   ${counts.teams}`);
    console.log(`     Games:   ${counts.games}`);
    console.log(`     Games with league: ${counts.games_with_league} (${Math.round(counts.games_with_league / counts.games * 100)}%)`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
