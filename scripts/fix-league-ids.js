#!/usr/bin/env node
/**
 * Fix missing league_id in games table
 * Fetches individual game details to get season.league.id
 */

const { Pool } = require('pg');
const axios = require('axios');

const API_BASE = 'https://api.sstats.net';
const API_KEY = process.env.SSTATS_API_KEY || 'fl3qjc4crvx8cppm';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6'
});

async function fetchGameDetails(gameId) {
  try {
    const url = `${API_BASE}/Games/${gameId}?apikey=${API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data?.data?.game;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🔧 Fixing missing league_id in games...\n');
  
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected\n');
    
    // Get leagues map
    const leaguesMap = new Map();
    const leaguesResult = await pool.query('SELECT id, sstats_id FROM leagues');
    leaguesResult.rows.forEach(r => leaguesMap.set(r.sstats_id, r.id));
    console.log(`📋 Loaded ${leaguesMap.size} leagues\n`);
    
    // Get games without league_id
    const gamesResult = await pool.query(`
      SELECT sstats_id FROM games 
      WHERE league_id IS NULL 
      ORDER BY date DESC 
      LIMIT 500
    `);
    
    const games = gamesResult.rows;
    console.log(`🎮 Found ${games.length} games without league_id\n`);
    
    let updated = 0;
    let failed = 0;
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${games.length} (updated: ${updated}, failed: ${failed})`);
      }
      
      const details = await fetchGameDetails(game.sstats_id);
      
      if (details?.season?.league?.id) {
        const leagueId = leaguesMap.get(details.season.league.id);
        
        if (leagueId) {
          await pool.query(
            'UPDATE games SET league_id = $1 WHERE sstats_id = $2',
            [leagueId, game.sstats_id]
          );
          updated++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 FIX COMPLETE');
    console.log('='.repeat(50));
    console.log(`  Processed: ${games.length}`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Failed:    ${failed}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
