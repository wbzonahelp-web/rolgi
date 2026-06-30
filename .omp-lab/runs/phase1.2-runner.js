'use strict';

// Phase 1.2 Draw Boost Calibration Backtest Runner
// 14 tests: 7 leagues x 2 seasons x 100 matches

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = '/srv/projects/rolgi/.omp-lab/runs';
const fs = require('fs');

const LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 135, name: 'Serie A' },
  { id: 78, name: 'Bundesliga' },
  { id: 61, name: 'Ligue 1' },
  { id: 88, name: 'Eredivisie' },
  { id: 128, name: 'Liga Profesional Argentina' },
];

const SEASONS = [2023, 2024];

const CONFIG = {
  n_window: 20,
  venue_filter: true,
  league_filter: true,
  analyzers: [
    { name: 'poisson', weight: 0.6, enabled: true },
    { name: 'markov_outcome', weight: 0.15, enabled: true },
    { name: 'form_inertia', weight: 0.1, enabled: true },
  ],
};

async function runBacktest(leagueId, season) {
  const url = 'http://localhost:3000/api/strategies/backtest';
  const body = JSON.stringify({
    config: CONFIG,
    league_id: leagueId,
    season,
    limit: 100,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('=== Phase 1.2 Draw Boost Calibration Backtest ===');
  console.log(`Timestamp: ${TIMESTAMP}`);
  console.log('');

  const results = [];
  let totalAccuracy = 0;
  let totalTests = 0;
  let totalDrawPred = 0;
  let totalDrawHits = 0;

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      console.log(`Testing: ${league.name} (${league.id}) - Season ${season}`);
      try {
        const data = await runBacktest(league.id, season);
        const summary = data.data && data.data.summary ? data.data.summary : data.summary;
        const accuracy = summary.accuracy || 0;
        const hits = summary.hits || 0;
        const misses = summary.misses || 0;
        const drawPredicted = (summary.by_outcome && summary.by_outcome.DRAW ? summary.by_outcome.DRAW.predicted : 0) || 0;
        const drawHits = (summary.by_outcome && summary.by_outcome.DRAW ? summary.by_outcome.DRAW.hits : 0) || 0;

        console.log(`  → Accuracy: ${accuracy}% (${hits}/${hits + misses} hits, DRAW predicted: ${drawPredicted}, DRAW hits: ${drawHits})`);

        results.push({
          league: league.name,
          league_id: league.id,
          season,
          accuracy,
          hits,
          misses,
          draw_predicted: drawPredicted,
          draw_hits: drawHits,
        });

        totalAccuracy += accuracy;
        totalTests++;
        totalDrawPred += drawPredicted;
        totalDrawHits += drawHits;
      } catch (err) {
        console.error(`  → ERROR: ${err.message}`);
      }

      // Small delay between tests
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('');
  }

  const avgAccuracy = Math.round(totalAccuracy / totalTests);

  console.log('=== Summary ===');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Average accuracy: ${avgAccuracy}%`);
  console.log(`Total DRAW predicted: ${totalDrawPred}`);
  console.log(`Total DRAW hits: ${totalDrawHits}`);
  console.log(`DRAW hit rate: ${totalDrawPred > 0 ? Math.round(totalDrawHits / totalDrawPred * 1000) / 10 : 0}%`);
  console.log('');

  // Save results
  const output = {
    run_type: 'phase1.2-drawboost-calibration',
    timestamp: TIMESTAMP,
    avg_accuracy: avgAccuracy,
    total_tests: totalTests,
    total_draw_predicted: totalDrawPred,
    total_draw_hits: totalDrawHits,
    draw_hit_rate: totalDrawPred > 0 ? totalDrawHits / totalDrawPred : 0,
    results,
  };

  const filename = `${OUTPUT_DIR}/phase1.2-drawboost-calibration-${TIMESTAMP}.json`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${filename}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});