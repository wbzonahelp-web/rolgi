#!/usr/bin/env node
/**
 * Backfill games for a date range.
 *
 * Usage:
 *   node scripts/backfill-games.js --from=2025-01-01 --to=2025-12-31
 *   node scripts/backfill-games.js --from=2025-01-01 --to=2025-12-31 --concurrency=5
 *   node scripts/backfill-games.js --from=2025-01-01 --to=2025-12-31 --skip-existing
 *   node scripts/backfill-games.js --from=2025-01-01 --to=2025-12-31 --dry-run
 *
 * From inside docker:
 *   docker exec rolgi-api node scripts/backfill-games.js --from=... --to=...
 */

const DataLoader = require('../src/loader/data-loader');
const { getDatabase } = require('../src/database/db-pool');

// ---------- CLI args ----------
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function* dateRange(from, to) {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end)) throw new Error('Invalid --from/--to date');
  if (start > end) throw new Error('--from must be <= --to');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield isoDate(d);
  }
}

// Limited concurrency runner
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

// ---------- Main ----------
(async () => {
  const args = parseArgs();
  if (!args.from || !args.to) {
    console.error('Usage: node scripts/backfill-games.js --from=YYYY-MM-DD --to=YYYY-MM-DD [--concurrency=N] [--skip-existing] [--dry-run]');
    process.exit(2);
  }

  const concurrency = parseInt(args.concurrency || '3', 10);
  const skipExisting = !!args['skip-existing'];
  const dryRun = !!args['dry-run'];

  const dates = [...dateRange(args.from, args.to)];
  console.log(`Backfill plan: ${dates.length} dates (${args.from} → ${args.to}), concurrency=${concurrency}, skipExisting=${skipExisting}, dryRun=${dryRun}`);

  const db = getDatabase();

  let plan = dates;
  if (skipExisting) {
    const r = await db.query(
      `SELECT DATE(date) AS d, COUNT(*) AS n
       FROM games
       WHERE date >= $1::date AND date < ($2::date + INTERVAL '1 day')
       GROUP BY DATE(date)
       HAVING COUNT(*) > 0`,
      [args.from, args.to]
    );
    const have = new Set(r.rows.map(row => isoDate(new Date(row.d))));
    plan = dates.filter(d => !have.has(d));
    console.log(`After skip-existing: ${plan.length} dates remain (skipped ${dates.length - plan.length})`);
  }

  if (dryRun) {
    console.log('--dry-run: would load these dates:');
    plan.forEach(d => console.log('  ', d));
    process.exit(0);
  }

  if (plan.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  // loader создаётся per-date внутри worker (изоляция this.currentSession)
  const startedAt = Date.now();
  let done = 0, ok = 0, fail = 0, totalGames = 0;

  const results = await runWithConcurrency(plan, concurrency, async (date) => {
    const t0 = Date.now();
    try {
      // Retry с экспоненциальным backoff для deadlock / временных ошибок
      const maxAttempts = 3;
      let lastErr = null;
      let session = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const loader = new DataLoader();
          session = await loader.load('games', { date }, 'games');
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = e && e.message ? e.message : String(e);
          const retriable = /deadlock|serialization|timeout|ECONNRESET|ETIMEDOUT/i.test(msg);
          if (!retriable || attempt === maxAttempts) throw e;
          const backoff = 300 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
          console.warn(`[retry ${attempt}/${maxAttempts}] ${date}  ${msg} — wait ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
      const ins = session.stats.insertedRecords || 0;
      const upd = session.stats.updatedRecords  || 0;
      totalGames += ins + upd;
      ok++;
      done++;
      console.log(`[${done}/${plan.length}] ${date}  OK inserted=${ins} updated=${upd} dur=${Date.now()-t0}ms`);
      return { date, ok: true, inserted: ins, updated: upd };
    } catch (e) {
      fail++;
      done++;
      console.error(`[${done}/${plan.length}] ${date}  FAIL ${e.message}`);
      return { date, ok: false, error: e.message };
    }
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('===== Backfill summary =====');
  console.log(`Dates:    ${plan.length}`);
  console.log(`OK:       ${ok}`);
  console.log(`Failed:   ${fail}`);
  console.log(`Games:    ${totalGames}`);
  console.log(`Elapsed:  ${elapsed}s`);

  const failed = results.filter(r => r && !r.ok);
  if (failed.length) {
    console.log('');
    console.log('Failed dates:');
    failed.forEach(f => console.log(`  ${f.date}: ${f.error}`));
  }

  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
