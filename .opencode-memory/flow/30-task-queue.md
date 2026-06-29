# Task Queue — Append-Only

> Orchestrator добавляет задачи. Worker забирает через `/task-next`.
> Формат: `- [ ] Task description` или `- [~] In progress` или `- [x] Done`

---

## Active Tasks

### P2: Per-league Poisson Calibration

- [ ] Create `league_poisson_params` table in DB (migration)
- [ ] Populate table with historical averages per league (EPL, La Liga, Bundesliga, Serie A, Ligue 1, etc.)
- [ ] Update `src/analytics/analyzers/poisson.js` to read params from DB by league_id
- [ ] Update `src/api/routes/strategies-routes.js` to pass league_id to Poisson analyzer
- [ ] Run backtest on multiple leagues (EPL, La Liga, Bundesliga, Serie A, Ligue 1)
- [ ] Compare accuracy before/after per-league calibration
- [ ] Document results in reports

---

## Completed Tasks

### P1: Poisson v4 in strategies-routes.js ✅

- [x] Update `predictFromAnalyzers` to Poisson v4 weights (Poisson 0.60, Momentum 0.15, HMM 0.15, Form 0.10)
- [x] Add `venue` parameter to `loadHistory` in backtest
- [x] Add `aPoisson.analyze` call in backtest loop
- [x] Syntax check and restart API
- [x] Backtest EPL 2024 (100 matches) — 44% accuracy, 66.7% at conf>=0.80
- [x] Report written to `flow/31-reports.md`

---

## Backlog Tasks

### P3: Grid Search Calibrator

- [ ] Design calibration algorithm (grid search / Bayesian optimization)
- [ ] Create cron job for monthly re-calibration
- [ ] Store results in `league_poisson_params` table
- [ ] Add API endpoint to trigger manual calibration

### P4: HMM Analyzer v2

- [ ] Per-league state transition matrices
- [ ] Train on historical data per league

### P5: Momentum Analyzer v2

- [ ] Form weighting by opponent strength
- [ ] Home/away form separation

### P6: Kelly Criterion Integration

- [ ] Bet sizing based on edge and confidence
- [ ] Risk management parameters

### P7: Real-time Odds Integration

- [ ] API-Football odds endpoint
- [ ] Betfair API integration
- [ ] Value bet detection

### P8: Ensemble Model

- [ ] XGBoost/LightGBM on analyzer outputs
- [ ] Feature engineering from Poisson, HMM, Momentum, Form

### P9: Web UI Dashboard

- [ ] Predictions table with filters
- [ ] Backtest results visualization
- [ ] League comparison charts

### P10: Alerting System

- [ ] Telegram bot for high-confidence predictions
- [ ] Discord webhook integration
- [ ] Configurable confidence thresholds