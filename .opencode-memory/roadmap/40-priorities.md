# Roadmap — Priorities

> Append-only. Orchestrator добавляет/обновляет приоритеты. Worker читает для понимания контекста.

---

## P1 — ✅ COMPLETED: Poisson v4 в strategies-routes.js

**Status:** DONE (2026-06-25T15:00:00Z)

**What was done:**
- Updated `predictFromAnalyzers` in `src/api/routes/strategies-routes.js` to Poisson v4
- Weights: Poisson 0.60, Momentum 0.15, HMM 0.15, Form 0.10
- Added `venue: isHome ? 'home' : 'away'` in `loadHistory` inside backtest
- Added `aPoisson.analyze` in backtest loop

**Backtest Results (EPL 2024, 100 matches):**
| Metric | Value |
|--------|-------|
| Overall accuracy | 44% |
| HOME accuracy | 46.8% (29/62) |
| DRAW accuracy | 66.7% (2/3) |
| AWAY accuracy | 37.1% (13/35) |
| conf >= 0.80 | 66.7% (6 matches) |
| conf >= 0.70 | 66.7% (18 matches) |
| conf >= 0.60 | 60.6% (33 matches) |
| conf >= 0.50 | 48.1% (54 matches) |

**Files changed:**
- `src/api/routes/strategies-routes.js` (backup: `strategies-routes.js.bak.poissonv4.1782400123`)

---

## P2 — 🎯 ACTIVE: Per-league Poisson Calibration

**Status:** ACTIVE (2026-06-25T22:00:00Z)

**Goal:** Replace hardcoded `avgHomeGoals=1.52, avgAwayGoals=1.32` (EPL-specific) with per-league values from database.

**Expected improvement:** +1-3% accuracy on non-EPL leagues.

**Plan (to be detailed by Orchestrator after first handoff):**
1. Create `league_poisson_params` table in DB (or extend `league_calibration`)
2. Populate with historical averages per league
3. Update `src/analytics/analyzers/poisson.js` to read from DB
4. Update `strategies-routes.js` to pass league_id to Poisson analyzer
5. Backtest on multiple leagues (EPL, La Liga, Bundesliga, Serie A, Ligue 1, etc.)

**Blockers:** None (awaiting Orchestrator plan)

---

## P3 — 📋 BACKLOG: Grid Search Calibrator

**Status:** BACKLOG

**Goal:** Automated calibration of Poisson parameters per league using grid search / optimization.

**Details:**
- Input: historical matches per league
- Output: optimal `avgHomeGoals`, `avgAwayGoals` per league
- Schedule: monthly re-calibration via cron
- Store results in `league_poisson_params` table

**Dependencies:** P2 must be completed first (DB schema + read path)

---

## Backlog / Future

- **P4:** HMM analyzer v2 (state transitions per league)
- **P5:** Momentum analyzer — form weighting by opponent strength
- **P6:** Kelly criterion bet sizing integration
- **P7:** Real-time odds integration (API-Football / Betfair)
- **P8:** Ensemble model (XGBoost / LightGBM) on top of analyzers
- **P9:** Web UI for predictions dashboard
- **P10:** Alerting system (Telegram/Discord) for high-confidence predictions

---

## Decision Log References

- [2026-06-25T22:00:00Z] DECISION: Two-Agent architecture с filesystem memory
- [2026-06-25T22:00:30Z] DECISION: Memory location — на сервере под git
- [2026-06-25T22:01:00Z] DECISION: Worker model — Nemotron 3 Ultra Free

See `flow/32-decisions-log.md` for full details.