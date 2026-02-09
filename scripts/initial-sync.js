#!/usr/bin/env node
/**
 * Initial Data Sync Script v2
 */

const { Pool } = require('pg');
const axios = require('axios');

const API_BASE = 'https://api.sstats.net';
const API_KEY = process.env.SSTATS_API_KEY || 'fl3qjc4crvx8cppm';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6'
});

async function fetchAPI(endpoint, params = {}) {
  const url = new URL(endpoint, API_BASE);
  url.searchParams.append('apikey', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  
  console.log(`  Fetching: ${endpoint}...`);
  const response = await axios.get(url.toString(), { timeout: 30000 });
  return response.data;
}

async function syncLeagues() {
  console.log('\n📋 Syncing leagues...');
  
  try {
    const result = await fetchAPI('/Leagues');
    const leagues = result.data || result || [];
    console.log(`  Found ${leagues.length} leagues`);
    
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
        inserted++;
      } catch (err) {
        // Skip errors silently
      }
    }
    
    console.log(`  ✅ Inserted/updated ${inserted} leagues`);
    return inserted;
  } catch (error) {
    console.error(`  ❌ Error syncing leagues: ${error.message}`);
    return 0;
  }
}

async function syncGames(date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  console.log(`\n🎮 Syncing games for ${targetDate}...`);
  
  try {
    const result = await fetchAPI('/Games/list', { date: targetDate, limit: 500 });
    const games = result.data || result || [];
    console.log(`  Found ${games.length} games`);
    
    // Get league and team IDs from our DB
    const leaguesMap = new Map();
    const teamsMap = new Map();
    
    const leaguesResult = await pool.query('SELECT id, sstats_id FROM leagues');
    leaguesResult.rows.forEach(r => leaguesMap.set(r.sstats_id, r.id));
    
    const teamsResult = await pool.query('SELECT id, sstats_id FROM teams');
    teamsResult.rows.forEach(r => teamsMap.set(r.sstats_id, r.id));
    
    // First, insert missing teams
    for (const game of games) {
      for (const team of [game.homeTeam, game.awayTeam]) {
        if (team && team.id && !teamsMap.has(team.id)) {
          try {
            const res = await pool.query(`
              INSERT INTO teams (sstats_id, name, short_name, logo, is_active)
              VALUES ($1, $2, $3, $4, true)
              ON CONFLICT (sstats_id) DO NOTHING
              RETURNING id
            `, [team.id, team.name, team.shortName || team.name?.substring(0, 20), team.logo]);
            if (res.rows[0]) teamsMap.set(team.id, res.rows[0].id);
          } catch (err) {
            // Skip
          }
        }
      }
    }
    
    let inserted = 0;
    for (const game of games) {
      try {
        // Extract leagueId from season.league (API structure)
        let apiLeagueId = game.leagueId || game.league?.id;
        if (!apiLeagueId && game.season && typeof game.season === 'object') {
          apiLeagueId = game.season.league?.id;
        }
        
        const leagueId = leaguesMap.get(apiLeagueId);
        const homeTeamId = teamsMap.get(game.homeTeam?.id);
        const awayTeamId = teamsMap.get(game.awayTeam?.id);
        
        // Extract season year
        let seasonYear = new Date(game.date).getFullYear();
        if (game.season) {
          if (typeof game.season === 'object') {
            seasonYear = game.season.year || new Date(game.date).getFullYear();
          } else if (typeof game.season === 'number') {
            seasonYear = game.season;
          }
        }
        
        // Map status
        let status = 'scheduled';
        if (game.status === 3 || game.status === 4) status = 'live';
        else if (game.status === 5) status = 'finished';
        else if (game.status === 6) status = 'postponed';
        else if (game.status === 7) status = 'cancelled';
        
        await pool.query(`
          INSERT INTO games (sstats_id, league_id, season, date, home_team_id, away_team_id, 
                           home_score, away_score, home_score_ht, away_score_ht, status, 
                           is_live, is_finished)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (sstats_id, date) DO UPDATE SET
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            home_score_ht = EXCLUDED.home_score_ht,
            away_score_ht = EXCLUDED.away_score_ht,
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
          game.homeScore,
          game.awayScore,
          game.homeScoreHT,
          game.awayScoreHT,
          status,
          status === 'live',
          status === 'finished'
        ]);
        inserted++;
      } catch (err) {
        // Skip silently
      }
    }
    
    console.log(`  ✅ Inserted/updated ${inserted} games`);
    return inserted;
  } catch (error) {
    console.error(`  ❌ Error syncing games: ${error.message}`);
    return 0;
  }
}

async function main() {
  console.log('🚀 Starting initial data sync v2...\n');
  
  const stats = { leagues: 0, teams: 0, games: 0 };
  
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected\n');
    
    // Sync leagues first
    stats.leagues = await syncLeagues();
    
    // Sync games for today and yesterday (this will also sync teams)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    stats.games += await syncGames(today.toISOString().split('T')[0]);
    stats.games += await syncGames(yesterday.toISOString().split('T')[0]);
    
    // Get team count
    const teamCount = await pool.query('SELECT COUNT(*) FROM teams');
    stats.teams = parseInt(teamCount.rows[0].count);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SYNC COMPLETE');
    console.log('='.repeat(50));
    console.log(`  Leagues: ${stats.leagues}`);
    console.log(`  Teams:   ${stats.teams}`);
    console.log(`  Games:   ${stats.games}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
