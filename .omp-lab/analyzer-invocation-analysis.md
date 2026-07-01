# Analysis: League/Season Parameters Integration for Poisson Analyzer

## Call Chain Overview

```
POST /api/strategies/backtest
  └─ fastify handler (line 436)
       ├─ request.body.league_id ──── destructured
       ├─ request.body.season  ────── destructured
       ├─ loadHistory(teamId, beforeDate, leagueFilter)
       │    └─ DB query with optional g.league_id filter
       ├─ (for each game batch):
       │    ├─ aPoisson.analyze(homeGames, awayGames, { avgHomeGoals: 1.52, avgAwayGoals: 1.32 })
       │    └─ predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames)  ← line 666
       └─ summary stats

POST /api/strategies/games/:gameId/predict
  └─ computeStrategyPrediction(db, gameId, config)  ← line 38
       ├─ DB: SELECT g.league_id, g.date, ... FROM games   ← line 41
       ├─ loadGames(teamId)
       ├─ aPoisson.analyze(homeGames, awayGames, { avgHomeGoals: 1.52, avgAwayGoals: 1.32 })  ← line 118
       └─ inline V4 forecast (not predictFromAnalyzers)  ← lines 133-216
```

**Only the backtest handler uses `predictFromAnalyzers`.** `computeStrategyPrediction` has its own inline forecast logic.

---

## Current `predictFromAnalyzers` Signature

**File:** `src/api/routes/strategies-routes.js`, line 540

```js
function predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames) {
```

Parameters:
- `homeResults` — object of analyzer results for the home team (poisson, markov_outcome, form_inertia, hmm)
- `awayResults` — same for the away team
- `homeGames` — array of home team's recent match history
- `awayGames` — array of away team's recent match history

The function itself does NOT pass `leagueParams` anywhere — it only reads the pre-computed `homeResults.poisson` values.

---

## `Poisson.analyze()` Signature

**File:** `src/analytics/analyzers/poisson.js`, line 82

```js
function analyze(homeGames, awayGames, leagueParams = {}) {
```

Extracts:
```js
const avgHomeGoals = leagueParams.avgHomeGoals || 1.52;
const avgAwayGoals = leagueParams.avgAwayGoals || 1.32;
```

These are used to normalize attack/defense ratings. Currently **hardcoded** to `1.52` / `1.32` at both call sites.

---

## Are `league_id` / `season` Accessible?

### Backtest handler (line 436+): **YES — already available**

```js
const { strategy_id, config: inlineConfig, league_id, season, limit: rawLimit } = request.body || {};
```

Both `league_id` (line 438) and `season` (line 443) are destructured from the request body and used in the DB query for games. They persist through the entire handler closure.

### `computeStrategyPrediction` (single-game predict): **Partial**

- `game.league_id` is selected from DB at line 41. Available.
- `game.season` is NOT selected in the query (line 41-42 only selects `g.date`). The `games` table has a `season` column (confirmed by the backtest query at line 477), so it's trivially addable.

---

## League-Specific Params: Ready-made API

**File:** `src/analytics/utils/league-params.js`

```js
function getLeagueParams(leagueId, season = null)
// Returns: { avg_home_goals, avg_away_goals }
```

Also available:
```js
function getLeagueRho(leagueId)     // → rho value for Dixon-Coles
function getLeagueDrawBoost(leagueId)  // → draw boost multiplier
```

Returns per-league calibrated averages, or falls back to global defaults (`global_avg`). The JSON data lives in `.omp-lab/league-params.json`.

---

## Recommended Changes

### 1. Add `leagueParams` to `predictFromAnalyzers` signature

```js
function predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams = {}) {
```

Even though `predictFromAnalyzers` doesn't call Poisson itself, keeping the params in the closure semantically connects the prediction context to the league. (Currently nothing inside the function uses them, but it's future-proof.)

### 2. Compute and pass league-specific params at Poisson call sites

#### Backtest handler (lines 646-648):

```js
// Before:
homeResults.poisson = aPoisson.analyze(homeGames, awayGames, { avgHomeGoals: 1.52, avgAwayGoals: 1.32 });

// After:
const leagueParams = getLeagueParams(league_id, season);
homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
    avgHomeGoals: leagueParams.avg_home_goals,
    avgAwayGoals: leagueParams.avg_away_goals,
});
```

Then pass to `predictFromAnalyzers`:

```js
const pred = predictFromAnalyzers(homeResults, awayResults, homeGames, awayGames, leagueParams);
```

#### `computeStrategyPrediction` (lines 117-118):

```js
// Before (line 41 needs g.season added):
//   SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id,
//          g.date, g.status
// After:
//   SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id,
//          g.date, g.season, g.status

const leagueParams = getLeagueParams(game.league_id, game.season);
homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
    avgHomeGoals: leagueParams.avg_home_goals,
    avgAwayGoals: leagueParams.avg_away_goals,
});
```

### 3. Import `getLeagueParams` at the top of `strategies-routes.js`

```js
const { getLeagueParams } = require('../../analytics/utils/league-params');
```

Or inline per call site if preferred. A single top-level import is cleaner.

### 4. `db-routes.js` also has hardcoded values

**File:** `src/api/routes/db-routes.js`, lines 943-956 — same pattern with hardcoded `leagueAvgHome = 1.52` and `leagueAvgAway = 1.32`. The game context there also has `league_id` (from `game.league_id`), so the same `getLeagueParams(game.league_id, game.season)` fix applies. **Out of scope for this task but worth noting.**

---

## Summary of Files to Touch

| File | Lines | Change |
|------|-------|--------|
| `src/api/routes/strategies-routes.js` | Top (imports) | Add `const { getLeagueParams } = require(...)` |
| `src/api/routes/strategies-routes.js` | 540 | Add `leagueParams = {}` to `predictFromAnalyzers` signature |
| `src/api/routes/strategies-routes.js` | 646-648 | Compute `leagueParams` from `league_id`/`season`, pass to `aPoisson.analyze()` |
| `src/api/routes/strategies-routes.js` | 117-118 | Same fix in `computeStrategyPrediction` |
| `src/api/routes/strategies-routes.js` | 41 | Add `g.season` to the SELECT in `computeStrategyPrediction` |
| `src/api/routes/strategies-routes.js` | 666 | (Optional) pass `leagueParams` to `predictFromAnalyzers` for future-proofing |
