const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6' });
function buildScoutFilters(filters, whereConditions, params, paramIndex) {
  const srcFilters = {genius:filters.filter_genius,running:filters.filter_running,radar:filters.filter_radar,feedcon:filters.filter_feedcon,img:filters.filter_img,rts:filters.filter_rts};
  for(const[c,v]of Object.entries(srcFilters)){if(!v)continue;if(v==='NONE'){whereConditions.push('('+c+' IS NULL OR '+c+"=\'\' OR "+c+"=\'0\')");}else{whereConditions.push('UPPER('+c+')=$'+paramIndex);params.push(v.toUpperCase());paramIndex++;}}
  if(filters.filter_min_ven&&parseInt(filters.filter_min_ven)>0){const mvc=parseInt(filters.filter_min_ven);whereConditions.push('((CASE WHEN UPPER(genius)=\'VEN\' THEN 1 ELSE 0 END)+(CASE WHEN UPPER(running)=\'VEN\' THEN 1 ELSE 0 END)+(CASE WHEN UPPER(radar)=\'VEN\' THEN 1 ELSE 0 END)+(CASE WHEN UPPER(feedcon)=\'VEN\' THEN 1 ELSE 0 END)+(CASE WHEN UPPER(img)=\'VEN\' THEN 1 ELSE 0 END)+(CASE WHEN UPPER(rts)=\'VEN\' THEN 1 ELSE 0 END))>=$'+paramIndex);params.push(mvc);paramIndex++;}
   if(filters.filter_cat!==undefined&&filters.filter_cat!==''){const cv=parseInt(filters.filter_cat);if(!isNaN(cv)){whereConditions.push('cat=$'+paramIndex);params.push(cv);paramIndex++;}} if(filters.filter_total&&filters.filter_total!=='all'){const _p=filters.filter_total.split('-');const _t=parseFloat(_p[1]);whereConditions.push('home_score IS NOT NULL AND away_score IS NOT NULL');whereConditions.push('(home_score+away_score)'+(_p[0]==='over'?'>':'<')+_t);}
  if(filters.dateFrom){whereConditions.push('event_date >= $'+paramIndex);params.push(filters.dateFrom);paramIndex++;}
  if(filters.dateTo){whereConditions.push('event_date <= $'+paramIndex);params.push(filters.dateTo);paramIndex++;}
  return paramIndex;
}
async function scoutStrategyRoutes(fastify, options) {
  fastify.post('/api/scout/strategy-analysis', async (request, reply) => {
    try {
      const filters = request.body || {};
      const whereConditions = ['matched_game_sstats_id IS NOT NULL', 'home_score IS NOT NULL', 'away_score IS NOT NULL'];
      const params = [];
      buildScoutFilters(filters, whereConditions, params, 1);
      const where = whereConditions.join(' AND ');
      const result = await pool.query(`
        SELECT COUNT(*) as total,
          ROUND(AVG(home_score + away_score)::numeric, 2) as avg_total,
          ROUND(STDDEV(home_score + away_score)::numeric, 2) as stddev_total,
          MAX(home_score + away_score) as max_total,
          MIN(home_score + away_score) as min_total,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY home_score + away_score) as median_total,
          COUNT(*) FILTER (WHERE home_score + away_score > 0.5) as over_0_5,
          COUNT(*) FILTER (WHERE home_score + away_score > 1.5) as over_1_5,
          COUNT(*) FILTER (WHERE home_score + away_score > 2.5) as over_2_5,
          COUNT(*) FILTER (WHERE home_score + away_score > 3.5) as over_3_5,
          COUNT(*) FILTER (WHERE home_score + away_score > 4.5) as over_4_5,
          COUNT(*) FILTER (WHERE home_score > away_score) as home_wins,
          COUNT(*) FILTER (WHERE home_score < away_score) as away_wins,
          COUNT(*) FILTER (WHERE home_score = away_score) as draws,
          COUNT(*) FILTER (WHERE home_score > 0 AND away_score > 0) as btts_yes,
          COUNT(*) FILTER (WHERE home_score = 0 OR away_score = 0) as btts_no,
          SUM(home_score) as total_home_goals,
          SUM(away_score) as total_away_goals
        FROM scout_events WHERE ${where}`, params);
      const r = result.rows[0];
      const total = parseInt(r.total) || 0;
      const pct = n => total > 0 ? Math.round(parseInt(n||0) * 100 / total) : 0;
      return { success: true, filters, stats: {
        total,
        avg_total: parseFloat(r.avg_total)||0,
        stddev_total: parseFloat(r.stddev_total)||0,
        median_total: parseFloat(r.median_total)||0,
        max_total: parseInt(r.max_total)||0,
        min_total: parseInt(r.min_total)||0,
        totals: {
          over_0_5:{count:parseInt(r.over_0_5),pct:pct(r.over_0_5)},
          over_1_5:{count:parseInt(r.over_1_5),pct:pct(r.over_1_5)},
          over_2_5:{count:parseInt(r.over_2_5),pct:pct(r.over_2_5)},
          over_3_5:{count:parseInt(r.over_3_5),pct:pct(r.over_3_5)},
          over_4_5:{count:parseInt(r.over_4_5),pct:pct(r.over_4_5)}
        },
        results: {
          home_wins:{count:parseInt(r.home_wins),pct:pct(r.home_wins)},
          draws:{count:parseInt(r.draws),pct:pct(r.draws)},
          away_wins:{count:parseInt(r.away_wins),pct:pct(r.away_wins)}
        },
        btts: {
          yes:{count:parseInt(r.btts_yes),pct:pct(r.btts_yes)},
          no:{count:parseInt(r.btts_no),pct:pct(r.btts_no)}
        },
        goals: { home: parseInt(r.total_home_goals)||0, away: parseInt(r.total_away_goals)||0 }
      }};
    } catch(e){ console.error(e); return reply.code(500).send({error:e.message}); }
  });
  fastify.get('/api/scout/match-detail/:sstatsId', async (request, reply) => {
    try {
      const sstatsId = parseInt(request.params.sstatsId);
      const game = await pool.query(`
        SELECT g.id, g.sstats_id, g.date, g.home_score, g.away_score,
          g.home_score_ht, g.away_score_ht, g.odds_data,
          th.name as home_team, ta.name as away_team, l.name as league
        FROM games g
        JOIN teams th ON g.home_team_id=th.id
        JOIN teams ta ON g.away_team_id=ta.id
        LEFT JOIN leagues l ON g.league_id=l.id
        WHERE g.sstats_id=$1 LIMIT 1`, [sstatsId]);
      if (!game.rows[0]) return reply.code(404).send({error:'Game not found'});
      const gm = game.rows[0];
      const [events, stats] = await Promise.all([
        pool.query(`SELECT type, subtype, minute, minute_extra, player_name, assist_player_name, team_id FROM game_events WHERE game_id=$1 AND type IN ('goal','card','penalty') ORDER BY minute, minute_extra NULLS LAST`, [gm.id]),
        pool.query(`SELECT expected_goals_home, expected_goals_away, shots_home, shots_away, shots_on_target_home, shots_on_target_away, corners_home, corners_away, possession_home, possession_away, yellow_cards_home, yellow_cards_away, red_cards_home, red_cards_away, big_chances_home, big_chances_away FROM game_statistics WHERE game_id=$1`, [gm.id])
      ]);
      return { success:true, game:gm, events:events.rows, stats:stats.rows[0]||null };
    } catch(e){ return reply.code(500).send({error:e.message}); }
  });
  fastify.post('/api/scout/time-analysis', async (request, reply) => {
    try {
      const filters = request.body || {};
      const mode = filters.mode || 'hourly';
      const tz = Number.isFinite(parseInt(filters.tzOffset)) ? parseInt(filters.tzOffset) : 3;
      const whereConditions = ['matched_game_sstats_id IS NOT NULL', 'home_score IS NOT NULL', 'away_score IS NOT NULL'];
      const params = [];
      let paramIndex = buildScoutFilters(filters, whereConditions, params, 1);
      const tzParam = paramIndex;
      params.push(tz);
      paramIndex++;
      const where = whereConditions.join(' AND ');
      const hourExpr ='EXTRACT(HOUR FROM event_date + make_interval(hours => $' + tzParam + '))::int';
      let rows;
      if (mode === 'slots') {
        const q = `WITH s AS (SELECT (home_score+away_score) AS tot, home_score, away_score,
          CASE WHEN ${hourExpr} BETWEEN 0 AND 5 THEN '1) Ночь 00-06'
               WHEN ${hourExpr} BETWEEN 6 AND 10 THEN '2) Утро 06-11'
               WHEN ${hourExpr} BETWEEN 11 AND 16 THEN '3) День 11-17'
               WHEN ${hourExpr} BETWEEN 17 AND 20 THEN '4) Вечер 17-21'
               ELSE '5) Поздний 21-00' END AS slot
          FROM scout_events WHERE ${where})
        SELECT slot AS label, COUNT(*) AS matches,
          ROUND(AVG(tot)::numeric,2) AS avg_total,
          ROUND(COUNT(*) FILTER (WHERE tot>1.5)*100.0/COUNT(*),0) AS over15,
          ROUND(COUNT(*) FILTER (WHERE tot>2.5)*100.0/COUNT(*),0) AS over25,
          ROUND(COUNT(*) FILTER (WHERE tot<2.5)*100.0/COUNT(*),0) AS under25,
          ROUND(COUNT(*) FILTER (WHERE tot>3.5)*100.0/COUNT(*),0) AS over35,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>0.5)*100.0/COUNT(*),0) AS over05,
              ROUND(COUNT(*) FILTER (WHERE home_score+away_score<1.5)*100.0/COUNT(*),0) AS under15,
              ROUND(COUNT(*) FILTER (WHERE home_score>0 AND away_score>0)*100.0/COUNT(*),0) AS btts_yes,
              ROUND(COUNT(*) FILTER (WHERE home_score=0 OR away_score=0)*100.0/COUNT(*),0) AS btts_no,
              ROUND(COUNT(*) FILTER (WHERE home_score>away_score)*100.0/COUNT(*),0) AS p1,
              ROUND(COUNT(*) FILTER (WHERE home_score=away_score)*100.0/COUNT(*),0) AS x,
              ROUND(COUNT(*) FILTER (WHERE home_score<away_score)*100.0/COUNT(*),0) AS p2
        FROM s GROUP BY slot ORDER BY slot`;
        rows = (await pool.query(q, params)).rows;
      } else if (mode === 'custom') {
        const hFrom = parseInt(filters.hourFrom);
        const hTo = parseInt(filters.hourTo);
        const fromP = paramIndex; params.push(Number.isFinite(hFrom)?hFrom:0); paramIndex++;
        const toP = paramIndex; params.push(Number.isFinite(hTo)?hTo:23); paramIndex++;
        const rangeCond = `(CASE WHEN $${fromP}::int <= $${toP}::int THEN ${hourExpr} BETWEEN $${fromP}::int AND $${toP}::int ELSE (${hourExpr} >= $${fromP}::int OR ${hourExpr} <= $${toP}::int) END)`;
        const q = `SELECT COUNT(*) AS matches,
          ROUND(AVG(home_score+away_score)::numeric,2) AS avg_total,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>1.5)*100.0/NULLIF(COUNT(*),0),0) AS over15,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>2.5)*100.0/NULLIF(COUNT(*),0),0) AS over25,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score<2.5)*100.0/NULLIF(COUNT(*),0),0) AS under25,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>3.5)*100.0/NULLIF(COUNT(*),0),0) AS over35,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>0.5)*100.0/NULLIF(COUNT(*),0),0) AS over05,
              ROUND(COUNT(*) FILTER (WHERE home_score+away_score<1.5)*100.0/NULLIF(COUNT(*),0),0) AS under15,
              ROUND(COUNT(*) FILTER (WHERE home_score>0 AND away_score>0)*100.0/NULLIF(COUNT(*),0),0) AS btts_yes,
              ROUND(COUNT(*) FILTER (WHERE home_score=0 OR away_score=0)*100.0/NULLIF(COUNT(*),0),0) AS btts_no,
              ROUND(COUNT(*) FILTER (WHERE home_score>away_score)*100.0/NULLIF(COUNT(*),0),0) AS p1,
              ROUND(COUNT(*) FILTER (WHERE home_score=away_score)*100.0/NULLIF(COUNT(*),0),0) AS x,
              ROUND(COUNT(*) FILTER (WHERE home_score<away_score)*100.0/NULLIF(COUNT(*),0),0) AS p2
        FROM scout_events WHERE ${where} AND ${rangeCond}`;
        const r = (await pool.query(q, params)).rows[0];
        rows = [{ label: (filters.hourFrom||0)+':00-'+(filters.hourTo||23)+':00', ...r }];
      } else {
        const q = `SELECT ${hourExpr} AS hour, COUNT(*) AS matches,
          ROUND(AVG(home_score+away_score)::numeric,2) AS avg_total,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>1.5)*100.0/COUNT(*),0) AS over15,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>2.5)*100.0/COUNT(*),0) AS over25,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score<2.5)*100.0/COUNT(*),0) AS under25,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>3.5)*100.0/COUNT(*),0) AS over35,
          ROUND(COUNT(*) FILTER (WHERE home_score+away_score>0.5)*100.0/COUNT(*),0) AS over05,
              ROUND(COUNT(*) FILTER (WHERE home_score+away_score<1.5)*100.0/COUNT(*),0) AS under15,
              ROUND(COUNT(*) FILTER (WHERE home_score>0 AND away_score>0)*100.0/COUNT(*),0) AS btts_yes,
              ROUND(COUNT(*) FILTER (WHERE home_score=0 OR away_score=0)*100.0/COUNT(*),0) AS btts_no,
              ROUND(COUNT(*) FILTER (WHERE home_score>away_score)*100.0/COUNT(*),0) AS p1,
              ROUND(COUNT(*) FILTER (WHERE home_score=away_score)*100.0/COUNT(*),0) AS x,
              ROUND(COUNT(*) FILTER (WHERE home_score<away_score)*100.0/COUNT(*),0) AS p2
        FROM scout_events WHERE ${where} GROUP BY hour ORDER BY hour`;
        rows = (await pool.query(q, params)).rows;
      }
      const gapWhere = whereConditions.join(' AND ')
    .replace(/(^|[^.\w])home_score/g, '$1se.home_score')
    .replace(/(^|[^.\w])away_score/g, '$1se.away_score')
    .replace(/(^|[^.\w])matched_game_sstats_id/g, '$1se.matched_game_sstats_id')
    .replace(/(^|[^.\w])event_date/g, '$1se.event_date')
    .replace(/(^|[^.\w])genius/g, '$1se.genius')
    .replace(/(^|[^.\w])running/g, '$1se.running')
    .replace(/(^|[^.\w])radar/g, '$1se.radar')
    .replace(/(^|[^.\w])feedcon/g, '$1se.feedcon')
    .replace(/(^|[^.\w])img/g, '$1se.img')
    .replace(/(^|[^.\w])rts/g, '$1se.rts')
    .replace(/(^|[^.\w])cat/g, '$1se.cat');
      const gapParams = params.slice(0, tzParam - 1);
      const gapQ = `WITH goals AS (
        SELECT se.id AS sid, ge.minute + COALESCE(ge.minute_extra,0) AS m,
          LAG(ge.minute + COALESCE(ge.minute_extra,0)) OVER (
            PARTITION BY se.id ORDER BY ge.minute, COALESCE(ge.minute_extra,0)
          ) AS prev_m
        FROM scout_events se
        JOIN games g ON g.sstats_id = se.matched_game_sstats_id
        JOIN game_events ge ON ge.game_id = g.id AND ge.type='goal'
        WHERE ${gapWhere}),
      gaps AS (SELECT sid, m - prev_m AS gap FROM goals WHERE prev_m IS NOT NULL),
      pm AS (SELECT sid, AVG(gap) AS mag FROM gaps GROUP BY sid)
      SELECT COUNT(*) AS matches,
        ROUND(AVG(mag)::numeric,1) AS avg_gap,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mag)::numeric,1) AS median_gap,
        ROUND(MIN(mag)::numeric,1) AS min_gap,
        ROUND(MAX(mag)::numeric,1) AS max_gap
      FROM pm`;
      const gaps = (await pool.query(gapQ, gapParams)).rows[0];
      return { success: true, mode, tzOffset: tz, data: rows, gaps };
    } catch (e) {
      console.error('time-analysis error:', e);
      return reply.code(500).send({ error: e.message });
    }
  });
}
module.exports = scoutStrategyRoutes;
