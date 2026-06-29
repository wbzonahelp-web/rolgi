# Current Task

**Task:** P2: Per-league Poisson Calibration
**Status:** NOT_STARTED
**Started:** —
**Priority:** HIGH (active priority from roadmap)

---

## Plan (from Orchestrator)

*Waiting for Orchestrator to create detailed plan after first handoff.*

---

## Steps

- [ ] Create `league_poisson_params` table in DB (migration)
- [ ] Populate table with historical averages per league
- [ ] Update `src/analytics/analyzers/poisson.js` to read params from DB by league_id
- [ ] Update `src/api/routes/strategies-routes.js` to pass league_id to Poisson analyzer
- [ ] Run backtest on multiple leagues
- [ ] Compare accuracy before/after
- [ ] Document results

---

## Context

- P1 (Poisson v4) completed successfully on 2026-06-25
- Backtest EPL 2024: 44% accuracy, 66.7% at conf>=0.80
- Hardcoded values in poisson.js: avgHomeGoals=1.52, avgAwayGoals=1.32 (EPL only)
- league_calibration table exists with per-league values
- Need to connect poisson.js to league_calibration table