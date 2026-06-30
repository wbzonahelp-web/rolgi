#!/usr/bin/env node
'use strict';

const LEAGUES = [
  { sstats_id: 39, name: 'Premier League', country: 'England' },
  { sstats_id: 140, name: 'La Liga', country: 'Spain' },
  { sstats_id: 135, name: 'Serie A', country: 'Italy' },
  { sstats_id: 78, name: 'Bundesliga', country: 'Germany' },
  { sstats_id: 61, name: 'Ligue 1', country: 'France' },
  { sstats_id: 88, name: 'Eredivisie', country: 'Netherlands' },
  { sstats_id: 128, name: 'Liga Profesional Argentina', country: 'Argentina' },
];

// Calibrated rho values
const CALIBRATED_RHO = {
  39: 0.025,  // Premier League
  140: 0.000, // La Liga
  135: -0.025, // Serie A
  78: -0.100, // Bundesliga
  61: -0.075, // Ligue 1
  88: -0.050, // Eredivisie
  128: -0.075, // Liga Profesional Argentina
};

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
  const API_URL = 'https://rolgi.com/api/strategies/backtest';
  const API_KEY = 'c4aa8ed6eeafa4a4210c76232b0a62ef63a62ae287bd628a16db655a4b402076';
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      config: DEFAULT_STRATEGY,
      league_id: leagueId,
      season,
      limit,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Backtest failed (${response.status}): ${errText}`);
  }

  return await response.json();
}

async function main() {
  console.log('=== Phase 2.1 Rho-Calibrated Backtest ===\n');

  const results = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 15).replace('T', '');

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      const rhoVal = CALIBRATED_RHO[league.sstats_id];
      process.stdout.write(`Backtesting ${league.name} (sstats=${league.sstats_id}) season=${season} rho=${rhoVal} ... `);
      try {
        const resp = await runBacktest(league.sstats_id, season, LIMIT);
        const data = resp.data || resp;
        const summary = data.summary || {};
        const acc = summary.accuracy !== undefined ? summary.accuracy :
                    data.accuracy !== undefined ? data.accuracy :
                    data.total_games > 0 ? (data.hits / data.total_games) * 100 : 0;
        const hits = summary.hits !== undefined ? summary.hits :
                     data.hits !== undefined ? data.hits : 0;
        const misses = summary.misses !== undefined ? summary.misses :
                       data.misses !== undefined ? data.misses : 0;
        const total = summary.total_games !== undefined ? summary.total_games :
                      data.total_games !== undefined ? data.total_games : 0;
        console.log(`acc=${acc.toFixed(1)}% (${hits}/${total})`);
        results.push({
          league_id: league.sstats_id,
          league_name: league.name,
          country: league.country,
          season,
          rho: rhoVal,
          accuracy: acc,
          hits,
          misses,
          total_games: total,
        });
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
        results.push({
          league_id: league.sstats_id,
          league_name: league.name,
          country: league.country,
          season,
          rho: rhoVal,
          accuracy: 0,
          error: err.message,
        });
      }
    }
  }

  // Summary stats
  const valid = results.filter(r => r.error === undefined && r.total_games > 0);
  const totalHits = valid.reduce((s, r) => s + r.hits, 0);
  const totalGames = valid.reduce((s, r) => s + r.total_games, 0);
  const avgAccuracy = totalGames > 0 ? (totalHits / totalGames) * 100 : 0;

  // Per-league averages
  const leagueAvg = {};
  for (const r of valid) {
    if (!leagueAvg[r.league_id]) leagueAvg[r.league_id] = { name: r.league_name, hits: 0, total: 0, rhos: [] };
    leagueAvg[r.league_id].hits += r.hits;
    leagueAvg[r.league_id].total += r.total_games;
    leagueAvg[r.league_id].rhos.push(r.rho);
  }

  console.log('\n=== Summary ===');
  console.log(`Total backtests: ${results.length}`);
  console.log(`Valid backtests: ${valid.length}`);
  console.log(`Total matches: ${totalGames}`);
  console.log(`Total hits: ${totalHits}`);
  console.log(`Average accuracy: ${avgAccuracy.toFixed(1)}%`);
  console.log(`Baseline (Phase 1.3): 48.1%`);
  console.log(`Delta: ${(avgAccuracy - 48.1).toFixed(1)} pp\n`);

  for (const [lid, la] of Object.entries(leagueAvg)) {
    const leagueAcc = la.total > 0 ? (la.hits / la.total) * 100 : 0;
    const rho = la.rhos[0];
    console.log(`  ${la.name.padEnd(30)} rho=${rho.toFixed(3)}  acc=${leagueAcc.toFixed(1)}% (${la.hits}/${la.total})`);
  }

  // Save results
  const outputFile = `.omp-lab/runs/phase2.1-rho-calibration-${Date.now()}.json`;

  // Load baseline comparison from phase2.0
  const fs = require('fs');
  const phase2_0 = JSON.parse(fs.readFileSync('.omp-lab/runs/phase2.0-full-backtest-20260630-131421.json', 'utf8'));
  const baselineAvg = 48.1;

  // Build comparison for overlapping leagues
  const overlapResults = [];
  for (const [lid, la] of Object.entries(leagueAvg)) {
    // Find baseline entries for this league
    const lidNum = parseInt(lid);
    const baselineEntries = phase2_0.leagues.filter(l => l.league_id === lidNum);
    const baselineAvgAcc = baselineEntries.length > 0
      ? baselineEntries.reduce((s, l) => s + l.accuracy, 0) / baselineEntries.length
      : null;
    const currentAvgAcc = la.total > 0 ? (la.hits / la.total) * 100 : 0;
    overlapResults.push({
      league_id: lidNum,
      league_name: la.name,
      baseline_avg_accuracy: baselineAvgAcc,
      phase21_avg_accuracy: currentAvgAcc,
      delta_pp: baselineAvgAcc !== null ? currentAvgAcc - baselineAvgAcc : null,
    });
  }

  const output = {
    phase: "2.1",
    timestamp: new Date().toISOString(),
    config: {
      n_window: 20,
      venue_filter: true,
      league_filter: true,
      analyzers: DEFAULT_STRATEGY.analyzers,
    },
    calibration: {
      method: "Maximum likelihood grid search on low scores (0-0, 1-0, 0-1, 1-1)",
      rho_range: "[-0.25, +0.05] step 0.025",
      data_seasons: "2021-2024",
      leagues: LEAGUES.map(l => ({
        league: l.name,
        sstats_id: l.sstats_id,
        calibrated_rho: CALIBRATED_RHO[l.sstats_id],
      })),
    },
    leagues: results,
    summary: {
      total_tests: valid.length,
      total_matches: totalGames,
      total_hits: totalHits,
      avg_accuracy: avgAccuracy,
      baseline_phase1_3: baselineAvg,
      delta_pp: avgAccuracy - baselineAvg,
    },
    comparison_baseline: {
      baseline_avg_accuracy: baselineAvg,
      phase21_avg_accuracy: avgAccuracy,
      delta_pp: avgAccuracy - baselineAvg,
      per_league: overlapResults,
    },
  };

  // Write output to both timestamped file and stdout
  const tsFile = `.omp-lab/runs/phase2.1-rho-calibration-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}.json`;
  fs.writeFileSync(tsFile, JSON.stringify(output, null, 2));
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log('\n=== RESULTS_JSON ===');
  console.log(JSON.stringify(output, null, 2));
  console.log('=== END_JSON ===');
  console.log(`\nResults saved to ${tsFile}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
