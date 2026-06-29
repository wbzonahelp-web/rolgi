BEGIN;

TRUNCATE team_profitability_cache;

WITH target_teams AS (
  SELECT team_id FROM (
    SELECT home_team_id AS team_id FROM games
    WHERE status='finished' AND odds_data IS NOT NULL AND home_score IS NOT NULL AND is_deleted=false
    UNION ALL
    SELECT away_team_id FROM games
    WHERE status='finished' AND odds_data IS NOT NULL AND home_score IS NOT NULL AND is_deleted=false
  ) u
  GROUP BY team_id HAVING COUNT(*) >= 10
),
team_games_raw AS (
  SELECT g.home_team_id AS team_id, 'home'::text AS side, g.date,
         g.home_score, g.away_score, g.odds_data
  FROM games g JOIN target_teams t ON t.team_id = g.home_team_id
  WHERE g.status='finished' AND g.odds_data IS NOT NULL
    AND g.home_score IS NOT NULL AND g.is_deleted=false
  UNION ALL
  SELECT g.away_team_id, 'away'::text, g.date, g.home_score, g.away_score, g.odds_data
  FROM games g JOIN target_teams t ON t.team_id = g.away_team_id
  WHERE g.status='finished' AND g.odds_data IS NOT NULL
    AND g.home_score IS NOT NULL AND g.is_deleted=false
),
team_games AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY date DESC) AS rn
  FROM team_games_raw
),
recent AS (SELECT * FROM team_games WHERE rn <= 50),
with_odds AS (
  SELECT team_id, side, rn, home_score, away_score,
    -- marketId=1: Home/Draw/Away
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Home").value')::text)::numeric,0) AS o_home,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Draw").value')::text)::numeric,0) AS o_draw,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Away").value')::text)::numeric,0) AS o_away,
    -- marketId=2: Draw No Bet (Home / Away без ничьи — возврат при ничье)
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 2).odds[*] ? (@.name == "Home").value')::text)::numeric,0) AS o_dnb_home,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 2).odds[*] ? (@.name == "Away").value')::text)::numeric,0) AS o_dnb_away,
    -- marketId=12: Double Chance
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Home/Draw").value')::text)::numeric,0) AS o_homedraw,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Home/Away").value')::text)::numeric,0) AS o_homeaway,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Draw/Away").value')::text)::numeric,0) AS o_drawaway,
    -- marketId=5: Total 2.5
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Over 2.5").value')::text)::numeric,0) AS o_over25,
    NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Under 2.5").value')::text)::numeric,0) AS o_under25
  FROM recent
),
profits AS (
  SELECT team_id, rn,
    -- WIN: ставим на победу команды
    CASE WHEN side='home' AND home_score>away_score THEN o_home-1
         WHEN side='away' AND away_score>home_score THEN o_away-1
         WHEN (side='home' AND o_home IS NOT NULL) OR (side='away' AND o_away IS NOT NULL) THEN -1
         ELSE NULL END AS p_win,
    -- DRAW
    CASE WHEN home_score=away_score THEN o_draw-1
         WHEN o_draw IS NOT NULL THEN -1 ELSE NULL END AS p_draw,
    -- LOSS: ставим на победу соперника
    CASE WHEN side='home' AND home_score<away_score THEN o_away-1
         WHEN side='away' AND away_score<home_score THEN o_home-1
         WHEN (side='home' AND o_away IS NOT NULL) OR (side='away' AND o_home IS NOT NULL) THEN -1
         ELSE NULL END AS p_loss,
    -- WIN_OR_DRAW: двойной шанс (1X для home, X2 для away)
    CASE WHEN side='home' AND home_score>=away_score THEN o_homedraw-1
         WHEN side='away' AND away_score>=home_score THEN o_drawaway-1
         WHEN (side='home' AND o_homedraw IS NOT NULL) OR (side='away' AND o_drawaway IS NOT NULL) THEN -1
         ELSE NULL END AS p_windraw,
    -- WIN_OR_LOSS: marketId=12 "Home/Away" (без ничьи, проигрываем при X)
    CASE WHEN home_score!=away_score THEN o_homeaway-1
         WHEN o_homeaway IS NOT NULL THEN -1 ELSE NULL END AS p_winloss,
    -- DRAW_OR_LOSS: двойной шанс (X2 для home, 1X для away)
    CASE WHEN side='home' AND home_score<=away_score THEN o_drawaway-1
         WHEN side='away' AND away_score<=home_score THEN o_homedraw-1
         WHEN (side='home' AND o_drawaway IS NOT NULL) OR (side='away' AND o_homedraw IS NOT NULL) THEN -1
         ELSE NULL END AS p_drawloss,
    -- DNB (Draw No Bet): возврат ставки при ничье
    CASE WHEN home_score=away_score THEN 0  -- возврат
         WHEN side='home' AND home_score>away_score THEN o_dnb_home-1
         WHEN side='away' AND away_score>home_score THEN o_dnb_away-1
         WHEN (side='home' AND o_dnb_home IS NOT NULL) OR (side='away' AND o_dnb_away IS NOT NULL) THEN -1
         ELSE NULL END AS p_dnb,
    -- OVER/UNDER 2.5
    CASE WHEN (home_score+away_score)>2 THEN o_over25-1
         WHEN o_over25 IS NOT NULL THEN -1 ELSE NULL END AS p_over25,
    CASE WHEN (home_score+away_score)<=2 THEN o_under25-1
         WHEN o_under25 IS NOT NULL THEN -1 ELSE NULL END AS p_under25
  FROM with_odds
),
flat AS (
  SELECT team_id, rn, 'win'         AS market, p_win      AS profit FROM profits WHERE p_win      IS NOT NULL UNION ALL
  SELECT team_id, rn, 'draw'        AS market, p_draw     AS profit FROM profits WHERE p_draw     IS NOT NULL UNION ALL
  SELECT team_id, rn, 'loss'        AS market, p_loss     AS profit FROM profits WHERE p_loss     IS NOT NULL UNION ALL
  SELECT team_id, rn, 'winOrDraw'   AS market, p_windraw  AS profit FROM profits WHERE p_windraw  IS NOT NULL UNION ALL
  SELECT team_id, rn, 'winOrLoss'   AS market, p_winloss  AS profit FROM profits WHERE p_winloss  IS NOT NULL UNION ALL
  SELECT team_id, rn, 'drawOrLoss'  AS market, p_drawloss AS profit FROM profits WHERE p_drawloss IS NOT NULL UNION ALL
  SELECT team_id, rn, 'dnb'         AS market, p_dnb      AS profit FROM profits WHERE p_dnb      IS NOT NULL UNION ALL
  SELECT team_id, rn, 'over25'      AS market, p_over25   AS profit FROM profits WHERE p_over25   IS NOT NULL UNION ALL
  SELECT team_id, rn, 'under25'     AS market, p_under25  AS profit FROM profits WHERE p_under25  IS NOT NULL
),
periods AS (SELECT 10 AS p UNION ALL SELECT 20 UNION ALL SELECT 50)
INSERT INTO team_profitability_cache (team_id, market, period_n, roi, sample_size, profit_total, updated_at)
SELECT
  f.team_id, f.market, p.p AS period_n,
  ROUND(AVG(f.profit)::numeric, 4) AS roi,
  COUNT(*)::int AS sample_size,
  ROUND(SUM(f.profit)::numeric, 3) AS profit_total,
  NOW()
FROM flat f
CROSS JOIN periods p
WHERE f.rn <= p.p
GROUP BY f.team_id, f.market, p.p
HAVING COUNT(*) >= 5;

COMMIT;

-- Финальная статистика
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT team_id) AS teams,
  COUNT(DISTINCT market) AS markets
FROM team_profitability_cache;

-- По рынкам
SELECT market,
  COUNT(*) AS rows,
  COUNT(DISTINCT team_id) AS teams,
  ROUND(AVG(roi)::numeric, 4) AS avg_roi
FROM team_profitability_cache WHERE period_n = 50
GROUP BY market ORDER BY market;
