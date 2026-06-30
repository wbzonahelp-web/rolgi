# League Parameters Analysis for Poisson Analyzer

**Generated:** 2026-06-30  
**Data Source:** `rolgi_v6` (PostgreSQL), games from seasons 2023-2024  
**Filter:** Only finished matches, >=50 matches per season  
**Leagues:** 22 top leagues across 16 countries  

---

## 1. League-by-League Stats

| # | League | Country | 2023 Avg Goals (H/A) | 2024 Avg Goals (H/A) | Combined (H/A) | Combined Total | Matches |
|---|--------|---------|---------------------|---------------------|----------------|---------------|---------|
| 1 | **Bundesliga** | Germany | 1.7955 / 1.4221 | 1.6331 / 1.5032 | **1.7143 / 1.4627** | **3.1770** | 616 |
| 2 | **Eredivisie** | Netherlands | 1.7882 / 1.4922 | 1.6916 / 1.2773 | **1.7399 / 1.3847** | **3.1246** | 642 |
| 3 | **Premier League** | England | 1.8000 / 1.4789 | 1.5132 / 1.4211 | **1.6566 / 1.4500** | **3.1066** | 760 |
| 4 | **2. Bundesliga** | Germany | 1.7143 / 1.3831 | 1.6266 / 1.3896 | **1.6704 / 1.3864** | **3.0568** | 616 |
| 5 | **Major League Soccer** | USA | 1.6910 / 1.0653 | 1.7299 / 1.3831 | **1.7105 / 1.2244** | **2.9349** | 1043 |
| 6 | **Süper Lig** | Turkey | 1.5789 / 1.2158 | 1.6608 / 1.2690 | **1.6177 / 1.2414** | **2.8591** | 722 |
| 7 | **Premiership** | Scotland | 1.5256 / 1.2479 | 1.6709 / 1.2778 | **1.5983 / 1.2629** | **2.8612** | 468 |
| 8 | **Super League** | Switzerland | 1.6130 / 1.2174 | 1.7261 / 1.2478 | **1.6696 / 1.2326** | **2.9022** | 460 |
| 9 | **Primeira Liga** | Portugal | 1.5844 / 1.2825 | 1.4091 / 1.1656 | **1.4967 / 1.2240** | **2.7207** | 616 |
| 10 | **Liga MX** | Mexico | 1.6000 / 1.2441 | 1.5912 / 1.1529 | **1.5956 / 1.1985** | **2.7941** | 680 |
| 11 | **Ligue 1** | France | 1.4513 / 1.2500 | 1.6039 / 1.3669 | **1.5276 / 1.3085** | **2.8361** | 616 |
| 12 | **Premier League** | Russia | 1.4795 / 1.1721 | 1.5164 / 1.1885 | **1.4980 / 1.1803** | **2.6783** | 488 |
| 13 | **La Liga** | Spain | 1.4842 / 1.1605 | 1.4526 / 1.1658 | **1.4684 / 1.1632** | **2.6316** | 760 |
| 14 | **Serie A** | Italy | 1.4342 / 1.1763 | 1.3395 / 1.2211 | **1.3869 / 1.1987** | **2.5856** | 760 |
| 15 | **Championship** | England | 1.4811 / 1.1921 | 1.4309 / 1.0215 | **1.4560 / 1.1068** | **2.5628** | 1114 |
| 16 | **Super League 1** | Greece | 1.6708 / 1.2958 | 1.2966 / 1.1525 | **1.4863 / 1.2257** | **2.7120** | 476 |
| 17 | **Bundesliga** | Austria | 1.3385 / 1.2410 | 1.5692 / 1.1846 | **1.4539 / 1.2128** | **2.6667** | 390 |
| 18 | **Serie B** | Italy | 1.3410 / 1.1795 | 1.3548 / 1.1054 | **1.3479 / 1.1425** | **2.4904** | 779 |
| 19 | **Serie A** | Brazil | 1.4184 / 1.0711 | 1.4105 / 1.0342 | **1.4144 / 1.0526** | **2.4670** | 760 |
| 20 | **Premier League** | Ukraine | 1.2705 / 1.2131 | 1.2389 / 1.0202 | **1.2546 / 1.1161** | **2.3707** | 491 |
| 21 | **Serie B** | Brazil | 1.2553 / 0.8395 | 1.3237 / 0.8658 | **1.2895 / 0.8527** | **2.1422** | 760 |
| 22 | **Liga Profesional Argentina** | Argentina | 1.1969 / 0.8362 | 1.2063 / 0.8280 | **1.2006 / 0.8329** | **2.0335** | 952 |

---

## 2. Comparison with Current Constants

**Current defaults (fallback in code):** `avg_home = 1.52`, `avg_away = 1.32`  
**Actual global DB average (2023-2024):** `avg_home = 1.6029`, `avg_away = 1.3124`  
**Average across these 22 top leagues:** `avg_home = 1.5115`, `avg_away = 1.2027`

| Metric | Current Default | Actual Global Avg | Top-22 Avg |
|--------|----------------|-------------------|------------|
| avg_home_goals | 1.52 | 1.6029 | 1.5115 |
| avg_away_goals | 1.32 | 1.3124 | 1.2027 |
| avg_total_goals | 2.84 | 2.9153 | 2.7141 |

### Key deviations from defaults:

- **Big 5 European leagues** generally score **higher** than 1.52/1.32 defaults:
  - **Premier League**: home +8.9%, away +9.8% vs defaults
  - **Bundesliga**: home +12.8%, away +10.8% vs defaults
  - **Eredivisie**: home +14.5%, away +4.9% vs defaults
  - **Ligue 1**: home +0.5%, away -0.9% (close to defaults)

- **South American leagues** score **lower** than defaults:
  - **Liga Profesional Argentina**: home -21.0%, away -36.9% vs defaults
  - **Serie A (Brazil)**: home -6.9%, away -20.3% vs defaults
  - **Serie B (Brazil)**: home -15.2%, away -35.4% vs defaults

- Current defaults are a reasonable compromise but miss significant league-specific variation.

---

## 3. Spread Analysis

| Stat | Home Goals | Away Goals | Total Goals |
|------|-----------|-----------|-------------|
| **Min** | 1.2006 (Arg) | 0.8329 (Arg) | 2.0335 (Arg) |
| **Max** | 1.7399 (Eredivisie) | 1.4627 (Bundesliga) | 3.1770 (Bundesliga) |
| **Mean** | 1.5115 | 1.2027 | 2.7141 |
| **Std Dev** | 0.1548 | 0.1571 | 0.2985 |
| **Range** | 0.5393 | 0.6298 | 1.1435 |

### Notable observations:

- **Highest home advantage**: Premier League (H/A ratio: 1.14), Bundesliga (1.17), MLS (1.40)
- **Lowest home advantage**: Serie B Brazil (1.51 -- still significant but both sides low), Ukrainian Premier League (1.12)
- **Most goals**: Bundesliga (3.18/game), Eredivisie (3.12/game), Premier League (3.11/game)
- **Fewest goals**: Liga Profesional Argentina (2.03/game), Serie B Brazil (2.14/game)
- **Most variable**: Bundesliga home scoring (stddev_home up to 1.44), indicating high-scoring volatility
- **Most consistent**: Liga Profesional Argentina (stddev_home ~1.08, stddev_away ~0.94)

---

## 4. Season-on-Season Stability

| League | 2023 Home | 2024 Home | Change | 2023 Away | 2024 Away | Change |
|--------|----------|----------|--------|----------|----------|--------|
| Premier League | 1.8000 | 1.5132 | -0.2868 | 1.4789 | 1.4211 | -0.0578 |
| Bundesliga | 1.7955 | 1.6331 | -0.1624 | 1.4221 | 1.5032 | +0.0811 |
| La Liga | 1.4842 | 1.4526 | -0.0316 | 1.1605 | 1.1658 | +0.0053 |
| Serie A (Italy) | 1.4342 | 1.3395 | -0.0947 | 1.1763 | 1.2211 | +0.0448 |
| Ligue 1 | 1.4513 | 1.6039 | +0.1526 | 1.2500 | 1.3669 | +0.1169 |
| Eredivisie | 1.7882 | 1.6916 | -0.0966 | 1.4922 | 1.2773 | -0.2149 |
| Liga Profesional Arg | 1.1969 | 1.2063 | +0.0094 | 0.8362 | 0.8280 | -0.0082 |

Most leagues show moderate year-to-year variation (0.05-0.15 goals/game), confirming the need for **season-specific** params where data is sufficient.

---

## 5. Recommendations for Integration

### 5.1 File Placement
JSON params file is already at `.omp-lab/league-params.json`. The existing `league-params.js` loader at `src/analytics/utils/league-params.js` references this exact path.

### 5.2 Code Changes Needed
1. **`src/analytics/utils/league-params.js`**: Update `global_avg` defaults from 1.52/1.32 to 1.60/1.31 (actual DB average) or keep as-is for backward compatibility.
2. **Hardcoded values**: Replace inline `1.52`/`1.32` in `src/api/routes/db-routes.js` (lines 947-948) and `src/api/routes/strategies-routes.js` (lines 118, 648) with `getLeagueParams(leagueId)` calls.

### 5.3 Expected Impact
- **Big improvers**: Bundesliga predictions (currently using ~1.52 instead of ~1.71/~1.46), Premier League
- **Moderate improvers**: Eredivisie, MLS, Liga MX
- **Important fix**: Liga Profesional Argentina (currently overestimating by ~21% home, ~37% away)
- **Overall**: More accurate score predictions, especially for leagues far from the global average

### 5.4 Data Quality Notes
- All leagues have >=50 matches per season (most have 195-557 per season)
- Strongest statistical basis: Premier League/La Liga/Serie A (380 matches per season)
- Weakest statistical basis: Austrian Bundesliga (195 per season), Switzerland Super League (230 per season)
- For very sparse leagues (<50 matches), the `global_avg` fallback (1.60/1.31) provides a reasonable baseline

### 5.5 Edge Cases
- **Ukrainian Premier League**: Only 244-247 matches per season due to war; use with caution
- **Super League 1 (Greece)**: 2024 shows significant drop (1.67 -> 1.30 home); may need monitoring
- **MLS**: Playoff structure means higher match count; home advantage varies significantly between regular season and playoffs

---

*Analysis based on 14,969 finished matches from 22 top leagues, seasons 2023-2024.*
