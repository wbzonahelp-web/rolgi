#!/usr/bin/env node
'use strict';

/**
 * Baseline backtest runner
 * 
 * Прогоняет текущую стратегию (с багом захардкоженных весов) 
 * по разным лигам и сезонам для установления baseline accuracy.
 */

const fs = require('fs');
const path = require('path');

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 135, name: 'Serie A' },
  { id: 78, name: 'Bundesliga' },
  { id: 61, name: 'Ligue 1' },
  { id: 88, name: 'Eredivisie' },
  { id: 128, name: 'Liga Argentina' },
];

const SEASONS = [2023, 2024]; // in-sample для анализа
const LIMIT = 100; // матчей на тест

// Default strategy config (как в текущем коде)
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
    throw new Error(`Backtest failed: ${response.status} ${await response.text()}`);
  }

  return await response.json();
}

async function main() {
  console.log('=== Baseline Backtest Runner ===\n');
  console.log('Strategy:', JSON.stringify(DEFAULT_STRATEGY, null, 2));
  console.log('\nRunning tests...\n');

  const results = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      console.log(`Testing ${league.name} ${season}...`);
      
      try {
        const result = await runBacktest(league.id, season, LIMIT);
        
        if (result.success) {
          const summary = result.data.summary;
          console.log(`  ✓ Accuracy: ${summary.accuracy}% (${summary.hits}/${summary.hits + summary.misses})`);
          
          results.push({
            league_id: league.id,
            league_name: league.name,
            season,
            ...summary,
            timestamp,
          });
        } else {
          console.log(`  ✗ Failed: ${result.error}`);
        }
      } catch (err) {
        console.log(`  ✗ Error: ${err.message}`);
      }
    }
  }

  // Save results
  const outDir = path.join(__dirname, 'runs');
  fs.mkdirSync(outDir, { recursive: true });
  
  const outFile = path.join(outDir, `baseline_${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    run_type: 'baseline',
    strategy: DEFAULT_STRATEGY,
    timestamp,
    results,
    summary: {
      total_tests: results.length,
      avg_accuracy: results.reduce((s, r) => s + r.accuracy, 0) / results.length,
      by_league: LEAGUES.map(l => ({
        league: l.name,
        avg_accuracy: results.filter(r => r.league_id === l.id)
          .reduce((s, r) => s + r.accuracy, 0) / SEASONS.length,
      })),
    },
  }, null, 2));
  
  console.log(`\n✓ Results saved to ${outFile}`);
  
  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Average accuracy: ${(results.reduce((s, r) => s + r.accuracy, 0) / results.length).toFixed(2)}%`);
  console.log('\nBy league:');
  for (const league of LEAGUES) {
    const leagueResults = results.filter(r => r.league_id === league.id);
    if (leagueResults.length > 0) {
      const avg = leagueResults.reduce((s, r) => s + r.accuracy, 0) / leagueResults.length;
      console.log(`  ${league.name}: ${avg.toFixed(2)}%`);
    }
  }
}

main().catch(console.error);
