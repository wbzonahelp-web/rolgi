'use strict';

/**
 * Извлечение истории матчей команды из БД для анализаторов.
 *
 * Все функции принимают:
 *   - client: pg.Pool или pg.Client
 *   - teamInternalId: уже отрезолвленный internal id команды (не sstats_id!)
 *   - opts: { n, leagueFilterInternalId, beforeDate, status }
 *
 * Возвращают массивы объектов или плоские числовые ряды.
 *
 * ВАЖНО: все запросы используют WHERE g.home_team_id = $1 OR g.away_team_id = $1
 * и ORDER BY date DESC LIMIT n. Если задан leagueFilterInternalId, фильтр по
 * лиге включается. is_deleted = false всегда.
 */

const DEFAULT_N = 20;
const MAX_N = 200;

function normalizeN(n) {
  const x = parseInt(n, 10);
  if (!isFinite(x) || x < 5) return DEFAULT_N;
  if (x > MAX_N) return MAX_N;
  return x;
}

/**
 * Резолв team_id из sstats_id (или того же id). Возвращает internal id или null.
 * Канонический паттерн ORDER BY (sstats_id = $1) DESC.
 */
async function resolveTeamId(client, anyId) {
  const id = parseInt(anyId, 10);
  if (!isFinite(id) || id <= 0) return null;
  const { rows } = await client.query(
    `SELECT id FROM teams
     WHERE sstats_id = $1 OR id = $1
     ORDER BY (sstats_id = $1) DESC, id ASC
     LIMIT 1`,
    [id]
  );
  return rows[0] ? rows[0].id : null;
}

/**
 * То же для league_id.
 */
async function resolveLeagueId(client, anyId) {
  const id = parseInt(anyId, 10);
  if (!isFinite(id) || id <= 0) return null;
  const { rows } = await client.query(
    `SELECT id FROM leagues
     WHERE sstats_id = $1 OR id = $1
     ORDER BY (sstats_id = $1) DESC, id ASC
     LIMIT 1`,
    [id]
  );
  return rows[0] ? rows[0].id : null;
}

/**
 * Резолв game_id (для совместимости — может пригодиться в live).
 */
async function resolveGameId(client, anyId) {
  const id = parseInt(anyId, 10);
  if (!isFinite(id) || id <= 0) return null;
  const { rows } = await client.query(
    `SELECT id, date, home_team_id, away_team_id, league_id, status,
            home_score, away_score, season
     FROM games
     WHERE (sstats_id = $1 OR id = $1) AND is_deleted = false
     ORDER BY (sstats_id = $1) DESC, id ASC
     LIMIT 1`
  , [id]);
  return rows[0] || null;
}

/**
 * Последние N матчей команды. Возвращает массив объектов в порядке от
 * НОВЫХ к СТАРЫМ (как в SQL ORDER BY date DESC). Внутри анализаторов часто
 * нужно перевернуть в хронологический порядок (oldest → newest) — делайте
 * это там, где требуется.
 *
 * Каждая строка содержит достаточные поля для всех 7 анализаторов:
 *   id, date, league_id, season, home_team_id, away_team_id,
 *   home_score, away_score, status,
 *   xg_home, xg_away (NULL если статистики нет),
 *   shots_home, shots_away, possession_home, possession_away,
 *   shots_on_target_home, shots_on_target_away,
 *   odds_data (полный jsonb),
 *   side: 'home' | 'away'  (на чьей стороне играла наша команда),
 *   gf: голы забитые нашей командой,
 *   ga: голы пропущенные нашей командой,
 *   gd: gf - ga,
 *   outcome: 'W' | 'D' | 'L',
 *   xg_for, xg_against, xg_diff,
 *   shots_for, shots_against,
 *   sot_for, sot_against,
 *   possession_for, possession_against.
 */
async function getTeamRecentGames(client, teamInternalId, opts = {}) {
  const n = normalizeN(opts.n);
  const leagueId = opts.leagueFilterInternalId || null;
  const beforeDate = opts.beforeDate || null; // ISO string or Date
  const status = opts.status || 'finished';

  const params = [teamInternalId];
  let where = `(g.home_team_id = $1 OR g.away_team_id = $1)
               AND g.is_deleted = false
               AND g.status = $${params.length + 1}`;
  params.push(status);

  if (leagueId) {
    params.push(leagueId);
    where += ` AND g.league_id = $${params.length}`;
  }
  if (beforeDate) {
    params.push(beforeDate);
    where += ` AND g.date < $${params.length}`;
  }

  params.push(n);
  const limitIdx = params.length;

  const sql = `
    SELECT
      g.id, g.date, g.league_id, g.season,
      g.home_team_id, g.away_team_id,
      g.home_score, g.away_score, g.status,
      g.odds_data,
      gs.expected_goals_home AS xg_home,
      gs.expected_goals_away AS xg_away,
      gs.shots_home, gs.shots_away,
      gs.shots_on_target_home, gs.shots_on_target_away,
      gs.possession_home, gs.possession_away
    FROM games g
    LEFT JOIN game_statistics gs ON gs.game_id = g.id
    WHERE ${where}
    ORDER BY g.date DESC
    LIMIT $${limitIdx}
  `;

  const { rows } = await client.query(sql, params);

  return rows.map((r) => {
    const isHome = r.home_team_id === teamInternalId;
    const gf = isHome ? r.home_score : r.away_score;
    const ga = isHome ? r.away_score : r.home_score;
    let outcome = null;
    if (gf != null && ga != null) {
      if (gf > ga) outcome = 'W';
      else if (gf < ga) outcome = 'L';
      else outcome = 'D';
    }
    const xgFor = isHome ? r.xg_home : r.xg_away;
    const xgAgainst = isHome ? r.xg_away : r.xg_home;
    return {
      id: r.id,
      date: r.date,
      league_id: r.league_id,
      season: r.season,
      home_team_id: r.home_team_id,
      away_team_id: r.away_team_id,
      home_score: r.home_score,
      away_score: r.away_score,
      status: r.status,
      odds_data: r.odds_data,
      side: isHome ? 'home' : 'away',
      gf,
      ga,
      gd: gf != null && ga != null ? gf - ga : null,
      outcome,
      xg_for: xgFor != null ? Number(xgFor) : null,
      xg_against: xgAgainst != null ? Number(xgAgainst) : null,
      xg_diff: xgFor != null && xgAgainst != null
        ? Number(xgFor) - Number(xgAgainst)
        : null,
      shots_for: isHome ? r.shots_home : r.shots_away,
      shots_against: isHome ? r.shots_away : r.shots_home,
      sot_for: isHome ? r.shots_on_target_home : r.shots_on_target_away,
      sot_against: isHome ? r.shots_on_target_away : r.shots_on_target_home,
      possession_for: isHome ? r.possession_home : r.possession_away,
      possession_against: isHome ? r.possession_away : r.possession_home,
    };
  });
}

/**
 * Все завершённые матчи лиги за сезон (для PageRank).
 * Возвращает [{winner_team_id, loser_team_id, score_diff, date}], где
 * для ничьих обе строки пропускаются.
 */
async function getLeagueResults(client, leagueInternalId, opts = {}) {
  const season = opts.season || null;
  const params = [leagueInternalId];
  let where = `g.league_id = $1 AND g.is_deleted = false
               AND g.status = 'finished'
               AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL`;
  if (season) {
    params.push(season);
    where += ` AND g.season = $${params.length}`;
  }
  const sql = `
    SELECT g.id, g.date, g.home_team_id, g.away_team_id,
           g.home_score, g.away_score
    FROM games g
    WHERE ${where}
    ORDER BY g.date ASC
  `;
  const { rows } = await client.query(sql, params);
  return rows;
}

module.exports = {
  DEFAULT_N,
  MAX_N,
  normalizeN,
  resolveTeamId,
  resolveLeagueId,
  resolveGameId,
  getTeamRecentGames,
  getLeagueResults,
};
