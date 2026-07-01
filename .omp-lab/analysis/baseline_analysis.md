# Baseline Analysis — 2026-06-30

## Summary
- **Average Accuracy: 50%**
- Tests: 14 (7 leagues × 2 seasons)
- Window: 20 games
- Strategy: Poisson (60%) + Markov (15%) + Form Inertia (10%)

## Results by League

| League | 2023 | 2024 | Avg | Notes |
|--------|------|------|-----|-------|
| Eredivisie | 57% | 56% | **56.5%** | Best |
| Premier League | 56% | 55% | **55.5%** | Good |
| Bundesliga | 53% | 48% | **50.5%** | OK |
| La Liga | 45% | 55% | **50.0%** | Unstable |
| Serie A | 53% | 46% | **49.5%** | OK |
| Ligue 1 | 41% | 52% | **46.5%** | Poor |
| Liga Argentina | 35% | 48% | **41.5%** | Worst |

## Critical Issues

### 1. DRAW Blindness ❌
Model almost NEVER predicts draws:
- Bundesliga: 1-2 draws predicted out of 100 games (should be ~20-25)
- Eredivisie: 1 draw predicted
- La Liga 2023: 10 draws (better, but still low)

**Root cause**: Poisson with hardcoded weights heavily favors HOME/AWAY.

### 2. Wrong League Parameters 🎯
Current: avgHomeGoals=1.52, avgAwayGoals=1.32 (global)

Actual:
- Liga Argentina: 1.23 / 0.94 (**25% error!**)
- Bundesliga: 1.75 / 1.40 (15% underestimation)
- La Liga: 1.45 / 1.12 (close)

### 3. HOME Bias 📊
Model predicts HOME in 60-73% of cases (should be ~45-50%).

Bundesliga 2023: 79% HOME predictions!

## Next Steps

1. ✅ **Fix hardcoded weights** — use config.analyzers[].weight
2. ✅ **Add league calibration** — dynamic avgHomeGoals/avgAwayGoals
3. ✅ **Improve DRAW prediction** — stronger draw boost in Poisson
4. ⏳ **Add explicit home advantage factor**
5. ⏳ **Better analyzer combination** — logistic regression vs simple sum

Target: **55-60% accuracy** across all leagues.
