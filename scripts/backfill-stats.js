#!/usr/bin/env node
/**
 * Backfill game_details (statistics/events/lineups/player_stats) for a date range.
 *
 * Usage:
 *   node scripts/backfill-stats.js --date=2026-05-26
 *   node scripts/backfill-stats.js --from=2026-05-01 --to=2026-05-26 --concurrency=4
 *   node scripts/backfill-stats.js --from=2026-05-26 --to=2026-05-26 --skip-existing
 *   node scripts/backfill-stats.js --from=2026-05-26 --to=2026-05-26 --limit=20 --dry-run
 *
 * From inside docker:
 *   docker exec rolgi-api node scripts/backfill-stats.js --date=2026-05-26
 */

const DataLoader = require('../src/loader/data-loader');
const { getDatabase } = require('../src/database/db-pool');
const SStatsClient = require('../src/api/sstats-client');

// ---------- CLI args ----------
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

// Limited concurrency runner (same as backfill-games.js)
async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  const next = async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = { ok: false, error: e.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

// Retry с экспоненциальным backoff
async function withRetry(fn, label, maxAttempts = 5) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e && e.message ? e.message : String(e);
      const retriable = /deadlock|serialization|timeout|ECONNRESET|ETIMEDOUT|429|too many|rate limit|socket hang up|circuit/i.test(msg);
      if (!retriable || attempt === maxAttempts) throw e;
      const is429 = /429|too many|rate limit/i.test(msg);
      const isCircuit = /circuit/i.test(msg);
      let backoff;
      if (isCircuit) {
        backoff = 12000 + Math.floor(Math.random() * 3000); // 12-15 sec to wait for HALF_OPEN
      } else if (is429) {
        backoff = 2000 * attempt + Math.floor(Math.random() * 1000);
      } else {
        backoff = 300 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      }
      console.warn(`[retry ${attempt}/${maxAttempts}] ${label}  ${msg} — wait ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// ---------- Main ----------
(async () => {
  const args = parseArgs();

  // Поддерживаем либо --date, либо --from/--to
  let from = args.from, to = args.to;
  if (args.date) { from = args.date; to = args.date; }

  if (!from || !to) {
    console.error('Usage: node scripts/backfill-stats.js (--date=YYYY-MM-DD | --from=YYYY-MM-DD --to=YYYY-MM-DD) [--concurrency=N] [--limit=N] [--skip-existing] [--dry-run]');
    process.exit(2);
  }

  const concurrency = parseInt(args.concurrency || '4', 10);
  const skipExisting = args['skip-existing'] !== undefined ? !!args['skip-existing'] : true; // default true
  const dryRun = !!args['dry-run'];
  const limit = args.limit ? parseInt(args.limit, 10) : null;

  console.log(`Backfill stats plan: ${from} → ${to}, concurrency=${concurrency}, skipExisting=${skipExisting}, dryRun=${dryRun}${limit ? `, limit=${limit}` : ''}`);

  const db = getDatabase();

  // Получаем список finished матчей за период
  let sql = `
    SELECT g.id, g.sstats_id, g.date, l.name AS league, l.country_name AS country,
           ht.name AS home, at.name AS away
    FROM games g
    LEFT JOIN leagues l ON l.id = g.league_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    WHERE g.date >= $1::date
      AND g.date < ($2::date + INTERVAL '1 day')
      AND g.status = 'finished'
      AND g.sstats_id IS NOT NULL
  `;
  if (skipExisting) {
    sql += ` AND NOT EXISTS (SELECT 1 FROM game_statistics gs WHERE gs.game_id = g.id) `;
  }
  sql += ` ORDER BY g.date ASC, g.id ASC `;
  if (limit) sql += ` LIMIT ${parseInt(limit, 10)} `;

  const r = await db.query(sql, [from, to]);
  const plan = r.rows;
  console.log(`Found ${plan.length} matches to process`);

  if (dryRun) {
    console.log('--dry-run: would load these matches:');
    plan.slice(0, 30).forEach(m => console.log(`  ${m.sstats_id}  ${m.date}  ${m.league || '?'}  ${m.home || '?'} vs ${m.away || '?'}`));
    if (plan.length > 30) console.log(`  ... and ${plan.length - 30} more`);
    process.exit(0);
  }

  if (plan.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  // Shared loader (game_details — короткая транзакция per call)
  const loader = new DataLoader({ db, apiClient: new SStatsClient({
    circuitBreakerThreshold: 20,   // tolerate more failures before opening
    circuitBreakerTimeout: 10000,  // 10s recovery window
    maxRetries: 3
  }) });

  const startedAt = Date.now();
  let done = 0, ok = 0, fail = 0, empty = 0;
  let totStats = 0, totEvents = 0, totLineups = 0, totPlayerStats = 0;
  const failures = [];

  const results = await runWithConcurrency(plan, concurrency, async (match) => {
    // Jitter: рассинхронизируем воркеры (0-200ms) — снижаем нагрузку на API
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 200)));
    const t0 = Date.now();
    const label = `sstats=${match.sstats_id} ${match.league || '?'}`;
    try {
      const session = await withRetry(
        () => loader.load('game_details', { gameId: match.sstats_id }, 'games'),
        label
      );

      // Извлекаем счётчики из step 11
      let s11 = null;
      if (session && session.steps) {
        s11 = session.steps.find(s => s.step === 11);
      }
      const res = (s11 && s11.result) || {};
      const stats = res.statistics || 0;
      const events = res.events || 0;
      const lineups = res.lineups || 0;
      const playerStats = res.playerStats || 0;

      totStats += stats;
      totEvents += events;
      totLineups += lineups;
      totPlayerStats += playerStats;

      const isEmpty = (stats + events + lineups + playerStats) === 0;
      if (isEmpty) empty++;
      ok++;
      done++;

      // Прогресс каждые 25 матчей (или каждый матч если plan <= 50)
      if (done % 25 === 0 || plan.length <= 50) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const rate = (done / (elapsed || 1)).toFixed(2);
        console.log(`[${done}/${plan.length}] ${match.sstats_id}  st=${stats} ev=${events} ln=${lineups} ps=${playerStats}  dur=${Date.now()-t0}ms  elapsed=${elapsed}s rate=${rate}/s`);
      }

      return { ok: true, sstats_id: match.sstats_id, stats, events, lineups, playerStats };
    } catch (e) {
      fail++;
      done++;
      failures.push({ sstats_id: match.sstats_id, league: match.league, error: e.message });
      console.error(`[${done}/${plan.length}] ${match.sstats_id}  FAIL ${e.message}`);
      return { ok: false, sstats_id: match.sstats_id, error: e.message };
    }
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const rate = (done / (parseFloat(elapsed) || 1)).toFixed(2);

  console.log('');
  console.log('===== Backfill stats summary =====');
  console.log(`Period:        ${from} → ${to}`);
  console.log(`Matches:       ${plan.length}`);
  console.log(`OK:            ${ok}  (with data: ${ok - empty}, empty: ${empty})`);
  console.log(`FAIL:          ${fail}`);
  console.log(`Elapsed:       ${elapsed}s`);
  console.log(`Rate:          ${rate} matches/sec`);
  console.log('');
  console.log(`Inserted rows:`);
  console.log(`  statistics:  ${totStats}`);
  console.log(`  events:      ${totEvents}`);
  console.log(`  lineups:     ${totLineups}`);
  console.log(`  player_stats:${totPlayerStats}`);

  if (failures.length > 0) {
    console.log('');
    console.log('===== Failures (top 20) =====');
    failures.slice(0, 20).forEach(f => {
      console.log(`  ${f.sstats_id}  [${f.league || '?'}]  ${f.error}`);
    });
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
