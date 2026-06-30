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

// Calibrated rho values (now used via leagueId in Poisson.analyze())
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
  const fs = require('fs');

  console.log('=== Phase 2.2.1 Per-League Parameters (leagueId passed to Poisson.analyze()) ===\n');

  // Load Phase 2.1 results for comparison
  let phase21Results = null;
  let phase21Avg = 49.0;
  const phase21Files = fs.readdirSync('.omp-lab/runs')
    .filter(f => (f.startsWith('phase2.1-rho-calibration-') || f.startsWith('phase2.1-full-')) && f.endsWith('.json'))
    .sort();
  if (phase21Files.length > 0) {
    for (let i = phase21Files.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(fs.readFileSync(`.omp-lab/runs/${phase21Files[i]}`, 'utf8'));
        if (data.summary && data.summary.avg_accuracy !== undefined) {
          phase21Results = data;
          phase21Avg = data.summary.avg_accuracy;
          console.log(`Loaded Phase 2.1 baseline from: ${phase21Files[i]}`);
          console.log(`Phase 2.1 avg accuracy: ${phase21Avg.toFixed(1)}%\n`);
          break;
        }
      } catch (_) {}
    }
  }
  if (!phase21Results) {
    console.log('No Phase 2.1 baseline with summary found, using 49.0% as reference\n');
  }

  const results = [];

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

        // Extract per-outcome stats
        const byOutcome = summary.by_outcome || data.by_outcome || {};
        const drawHits = byOutcome.DRAW?.hits || 0;
        const drawPredicted = byOutcome.DRAW?.predicted || 0;
        const drawActual = byOutcome.DRAW?.actual || 0;

        console.log(`acc=${acc.toFixed(1)}% (${hits}/${total})  DRAW: ${drawHits}/${drawPredicted} predicted, ${drawActual} actual`);
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
          draw_hits: drawHits,
          draw_predicted: drawPredicted,
          draw_actual: drawActual,
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
    if (!leagueAvg[r.league_id]) leagueAvg[r.league_id] = { name: r.league_name, hits: 0, total: 0, rhos: [], draw_hits: 0, draw_predicted: 0, draw_actual: 0 };
    leagueAvg[r.league_id].hits += r.hits;
    leagueAvg[r.league_id].total += r.total_games;
    leagueAvg[r.league_id].rhos.push(r.rho);
    leagueAvg[r.league_id].draw_hits += (r.draw_hits || 0);
    leagueAvg[r.league_id].draw_predicted += (r.draw_predicted || 0);
    leagueAvg[r.league_id].draw_actual += (r.draw_actual || 0);
  }

  const delta = avgAccuracy - phase21Avg;

  console.log('\n=== Summary ===');
  console.log(`Total backtests: ${results.length}`);
  console.log(`Valid backtests: ${valid.length}`);
  console.log(`Total matches: ${totalGames}`);
  console.log(`Total hits: ${totalHits}`);
  console.log(`Average accuracy: ${avgAccuracy.toFixed(1)}%`);
  console.log(`Phase 2.1 (baseline): ${phase21Avg.toFixed(1)}%`);
  console.log(`Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp\n`);

  // Overall DRAW stats
  const totalDrawHits = valid.reduce((s, r) => s + (r.draw_hits || 0), 0);
  const totalDrawPredicted = valid.reduce((s, r) => s + (r.draw_predicted || 0), 0);
  const totalDrawActual = valid.reduce((s, r) => s + (r.draw_actual || 0), 0);
  const drawHitRate = totalDrawPredicted > 0 ? (totalDrawHits / totalDrawPredicted) * 100 : 0;
  console.log(`DRAW stats: ${totalDrawHits}/${totalDrawPredicted} predicted, ${totalDrawActual} actual`);
  console.log(`DRAW hit rate: ${drawHitRate.toFixed(1)}%\n`);

  // Find Phase 2.1 per-league for comparison
  const phase21LeagueAvg = {};
  if (phase21Results) {
    for (const r of phase21Results.leagues) {
      if (r.error === undefined && r.total_games > 0) {
        if (!phase21LeagueAvg[r.league_id]) phase21LeagueAvg[r.league_id] = { hits: 0, total: 0 };
        phase21LeagueAvg[r.league_id].hits += r.hits;
        phase21LeagueAvg[r.league_id].total += r.total_games;
      }
    }
  }

  console.log('Per-league breakdown:');
  for (const [lid, la] of Object.entries(leagueAvg)) {
    const leagueAcc = la.total > 0 ? (la.hits / la.total) * 100 : 0;
    const rho = la.rhos[0];

    // Phase 2.1 comparison
    const p21 = phase21LeagueAvg[parseInt(lid)];
    const p21Acc = p21 && p21.total > 0 ? (p21.hits / p21.total) * 100 : null;
    const ppDelta = p21Acc !== null ? leagueAcc - p21Acc : null;

    // Draw stats for this league
    const ldRate = la.draw_predicted > 0 ? (la.draw_hits / la.draw_predicted) * 100 : 0;

    const deltaStr = ppDelta !== null ? `${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)}pp` : 'N/A';
    console.log(`  ${la.name.padEnd(30)} rho=${rho.toFixed(3)}  acc=${leagueAcc.toFixed(1)}% (${la.hits}/${la.total})  vs P2.1: ${deltaStr}  DRAW: ${ldRate.toFixed(1)}%${la.draw_predicted > 0 ? ` (${la.draw_hits}/${la.draw_predicted})` : ''}`);
  }

  // Build per-league comparison output
  const perLeagueComparison = [];
  for (const [lid, la] of Object.entries(leagueAvg)) {
    const lidNum = parseInt(lid);
    const currentAvgAcc = la.total > 0 ? (la.hits / la.total) * 100 : 0;
    const p21 = phase21LeagueAvg[lidNum];
    const p21AvgAcc = p21 && p21.total > 0 ? (p21.hits / p21.total) * 100 : null;
    perLeagueComparison.push({
      league_id: lidNum,
      league_name: la.name,
      rho: la.rhos[0],
      phase21_avg_accuracy: p21AvgAcc,
      phase221_avg_accuracy: currentAvgAcc,
      delta_pp: p21AvgAcc !== null ? currentAvgAcc - p21AvgAcc : null,
    });
  }

  const output = {
    phase: "2.2.1",
    description: "Per-league parameters via leagueId in Poisson.analyze()",
    timestamp: new Date().toISOString(),
    config: {
      n_window: 20,
      venue_filter: true,
      league_filter: true,
      analyzers: DEFAULT_STRATEGY.analyzers,
    },
    leagues: results,
    summary: {
      total_tests: valid.length,
      total_matches: totalGames,
      total_hits: totalHits,
      avg_accuracy: avgAccuracy,
      phase21_baseline: phase21Avg,
      delta_pp: delta,
      draw_stats: {
        total_predicted: totalDrawPredicted,
        total_hits: totalDrawHits,
        total_actual: totalDrawActual,
        hit_rate: drawHitRate,
      },
    },
    per_league_comparison: perLeagueComparison,
  };

  const tsFile = `.omp-lab/runs/phase2.2.1-per-league-params-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}.json`;
  fs.writeFileSync(tsFile, JSON.stringify(output, null, 2));

  console.log('\n=== RESULTS_JSON ===');
  console.log(JSON.stringify(output, null, 2));
  console.log('=== END_JSON ===');
  console.log(`\nResults saved to ${tsFile}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});