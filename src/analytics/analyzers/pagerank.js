'use strict';

/**
 * Анализатор LeaguePageRank.
 *
 * Источник: pkg6/revolutionary_spiral_model/analyzers/enhanced_markov_analyzers.py:202
 *           (SportsPageRankAnalyzer)
 *
 * Идея: PageRank по графу побед в лиге.
 *   Для каждого матча winner vs loser: добавляем ребро loser → winner
 *   с весом |score_diff| + 1 (крупные победы весят больше).
 *
 * Команды, которые часто побеждают сильных соперников, получают высокий
 * PageRank. Это альтернативный рейтинг к Glicko — учитывает структуру
 * победителей-побеждённых, не только разности рейтингов.
 *
 * Вход: массив объектов {home_team_id, away_team_id, home_score, away_score}.
 * Выход: {value, confidence, details: {teams: [{team_id, score, rank, ...}]}}.
 *
 *   value = pagerank_score лидера (для совместимости с интерфейсом)
 *   details.teams — отсортированный по убыванию массив с metadata
 */

const Graph = require('graphology');
const pagerank = require('graphology-metrics/centrality/pagerank').default
                || require('graphology-metrics/centrality/pagerank');

const MIN_MATCHES = 20;     // минимум матчей в лиге для расчёта
const MIN_TEAM_GAMES = 5;   // команды с <5 матчами игнорируются в финальном рейтинге

/**
 * @param {Array<{home_team_id:number, away_team_id:number,
 *                home_score:number, away_score:number}>} matches
 * @returns {{value, confidence, details}}
 */
function analyze(matches) {
  if (!Array.isArray(matches) || matches.length < MIN_MATCHES) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'insufficient_matches',
        required: MIN_MATCHES,
        got: matches ? matches.length : 0,
        teams: [],
      },
    };
  }

  const G = new Graph({ type: 'directed', multi: false });

  // Считаем стат по командам параллельно
  const teamStats = new Map(); // team_id -> {games, wins, draws, losses, gf, ga}
  const addStat = (tid, gf, ga) => {
    let s = teamStats.get(tid);
    if (!s) {
      s = { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
      teamStats.set(tid, s);
    }
    s.games++;
    s.gf += gf;
    s.ga += ga;
    if (gf > ga) s.wins++;
    else if (gf < ga) s.losses++;
    else s.draws++;
  };

  // Строим граф
  let edgesAdded = 0;
  let drawsSkipped = 0;
  for (const m of matches) {
    const h = m.home_team_id, a = m.away_team_id;
    const hs = m.home_score, as = m.away_score;
    if (h == null || a == null || hs == null || as == null) continue;

    addStat(h, hs, as);
    addStat(a, as, hs);

    if (hs === as) {
      drawsSkipped++;
      continue;
    }

    const winner = hs > as ? h : a;
    const loser = hs > as ? a : h;
    const diff = Math.abs(hs - as) + 1;

    const wn = String(winner);
    const ln = String(loser);
    if (!G.hasNode(wn)) G.addNode(wn);
    if (!G.hasNode(ln)) G.addNode(ln);

    // loser → winner с накопительным весом
    if (G.hasEdge(ln, wn)) {
      const cur = G.getEdgeAttribute(ln, wn, 'weight') || 0;
      G.setEdgeAttribute(ln, wn, 'weight', cur + diff);
    } else {
      G.addEdge(ln, wn, { weight: diff });
      edgesAdded++;
    }
  }

  if (G.order < 2 || G.size < 1) {
    return {
      value: 0,
      confidence: 0,
      details: {
        error: 'graph_too_small',
        nodes: G.order,
        edges: G.size,
        teams: [],
      },
    };
  }

  // Считаем PageRank
  const pr = pagerank(G, { alpha: 0.85, getEdgeWeight: 'weight' });

  // Собираем результаты с фильтром по min games
  const teamArr = [];
  for (const [tidStr, score] of Object.entries(pr)) {
    const tid = parseInt(tidStr, 10);
    const st = teamStats.get(tid) || { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    if (st.games < MIN_TEAM_GAMES) continue;
    teamArr.push({
      team_id: tid,
      pagerank_score: score,
      games: st.games,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      goals_for: st.gf,
      goals_against: st.ga,
      goal_diff: st.gf - st.ga,
      points: st.wins * 3 + st.draws,
    });
  }
  teamArr.sort((a, b) => b.pagerank_score - a.pagerank_score);
  teamArr.forEach((t, i) => { t.rank = i + 1; });

  // value = PR лидера для совместимости с интерфейсом
  const leaderScore = teamArr.length > 0 ? teamArr[0].pagerank_score : 0;
  const confidence = Math.min(1, matches.length / 100);

  return {
    value: leaderScore,
    confidence,
    details: {
      n_matches: matches.length,
      draws_skipped: drawsSkipped,
      edges: edgesAdded,
      nodes: G.order,
      teams_in_ranking: teamArr.length,
      damping: 0.85,
      teams: teamArr,
    },
  };
}

module.exports = {
  name: 'league_pagerank',
  minMatches: MIN_MATCHES,
  analyze,
};
