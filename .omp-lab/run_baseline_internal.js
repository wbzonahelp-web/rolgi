#!/usr/bin/env node
'use strict';

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 135, name: 'Serie A' },
  { id: 78, name: 'Bundesliga' },
  { id: 61, name: 'Ligue 1' },
  { id: 88, name: 'Eredivisie' },
  { id: 128, name: 'Liga Argentina' },
];

const SEASONS = [2023, 2024];
const LIMIT = 100;

const DEFAULT_STRATEGY = {
  n_window: 20,
  venue_filter: true,
  league_filter: true,
  analyzers: [
    { name: 'poisson', weight: 0.60, enabled: true },
    { name: 'markov_outcome', weight: 0.15, enabled: true },
    { name: 'form_inertia', weight: 0.10, enabled: true },
  ],
};

async function runBacktest(leagueId, season, limit) {
  const response = await fetch('http://localhost:3000/api/strategies/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: DEFAULT_STRATEGY,
      league_id: leagueId,
      season,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(`Backtest failed: ${response.status}`);
  }

  return await response.json();
}

async function main() {
  console.log('=== Baseline Backtest (Internal) ===\n');
  
  const results = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      const key = `${league.name} ${season}`;
      process.stdout.write(`${key}... `);
      
      try {
        const result = await runBacktest(league.id, season, LIMIT);
        
        if (result.success) {
          const s = result.data.summary;
          console.log(`${s.accuracy}% (${s.hits}/${s.hits + s.misses})`);
          
          results.push({
            league_id: league.id,
            league_name: league.name,
            season,
            ...s,
            timestamp,
          });
        } else {
          console.log(`FAIL: ${result.error}`);
        }
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
    }
  }

  // Output JSON to stdout for capture
  console.log('\n=== RESULTS_JSON ===');
  console.log(JSON.stringify({
    run_type: 'baseline',
    strategy: DEFAULT_STRATEGY,
    timestamp,
    results,
    summary: {
      total_tests: results.length,
      avg_accuracy: results.length > 0 
        ? results.reduce((s, r) => s + r.accuracy, 0) / results.length 
        : 0,
      by_league: LEAGUES.map(l => {
        const lr = results.filter(r => r.league_id === l.id);
        return {
          league: l.name,
          avg_accuracy: lr.length > 0
            ? lr.reduce((s, r) => s + r.accuracy, 0) / lr.length
            : 0,
          count: lr.length,
        };
      }).filter(x => x.count > 0),
    },
  }, null, 2));
  console.log('=== END_JSON ===');
}

main().catch(console.error);
