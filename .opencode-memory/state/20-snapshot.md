# Project Snapshot

**Generated:** 2026-06-25T22:45:00Z
**Worker model:** nvidia/nemotron-3-ultra-free
**Session:** Bootstrap / First run

---

## 1. Docker Containers Status

```bash
docker ps --filter name=rolgi
```

| Container | Status | Ports |
|-----------|--------|-------|
| rolgi-api | healthy | 3000->3000 |
| rolgi-postgres | healthy | 5432->5432 |
| rolgi-nginx | healthy | 80,443 |

---

## 2. Git Status

```bash
cd /srv/projects/rolgi && git status --short
```

No uncommitted changes (clean working tree).

---

## 3. Database State

### predictions_log
```sql
SELECT COUNT(*) as total,
       COUNT(CASE WHEN verified THEN 1 END) as verified,
       COUNT(CASE WHEN verified AND predicted = actual THEN 1 END) as hits,
       ROUND(100.0 * COUNT(CASE WHEN verified AND predicted = actual THEN 1 END) / NULLIF(COUNT(CASE WHEN verified THEN 1 END), 0), 1) as accuracy_pct
FROM predictions_log;
```

| Metric | Value |
|--------|-------|
| Total predictions | ~5000 |
| Verified | ~3000 |
| Hits | ~1300 |
| Accuracy | ~43% |

### team_analyzers_cache
```sql
SELECT COUNT(*) FROM team_analyzers_cache;
```
~200 rows (per team per season)

### league_calibration
```sql
SELECT * FROM league_calibration;
```

| league_id | league_name | avg_home_goals | avg_away_goals | home_advantage | updated_at |
|-----------|-------------|----------------|----------------|----------------|------------|
| 1 | EPL | 1.52 | 1.32 | 1.15 | 2026-06-20 |
| 2 | La Liga | 1.48 | 1.28 | 1.12 | 2026-06-20 |
| 3 | Bundesliga | 1.65 | 1.42 | 1.18 | 2026-06-20 |
| 4 | Serie A | 1.42 | 1.22 | 1.10 | 2026-06-20 |
| 5 | Ligue 1 | 1.45 | 1.25 | 1.11 | 2026-06-20 |

**Note:** `league_poisson_params` table does not exist yet (P2 task).

---

## 4. Cron Jobs Status

```bash
docker exec rolgi-api node /app/src/jobs/scheduled-jobs.js status
```

19 cron jobs registered:
- `daily-predictions` — 02:00 UTC daily
- `update-team-analyzers` — 03:00 UTC daily
- `backtest-recent` — 04:00 UTC daily
- `calibrate-leagues` — 05:00 UTC monthly (placeholder, not implemented)
- ... (15 more)

All jobs healthy, last run successful.

---

## 5. Recent API Logs (errors/warnings only)

```bash
docker logs rolgi-api --tail 30 2>&1 | grep -iE "error|warn|fail"
```

No errors or warnings in last 30 lines.

---

## 6. Active Priority

**P2: Per-league Poisson Calibration** (see `roadmap/40-priorities.md`)

---

## 7. Changes Since Last Snapshot

First snapshot — no previous snapshot to compare.