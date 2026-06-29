'use strict';

/**
 * src/analytics/compute-prediction.js
 *
 * Этап 12: чистая переиспользуемая функция расчёта integrated forecast
 * для одного матча. Извлечена из обработчика GET /api/db/games/:id/analyzers,
 * чтобы её можно было звать из cron `record_predictions` без HTTP-хопа.
 *
 * Логика 1-в-1 совпадает с inline-реализацией в db-routes.js на момент создания.
 * При расхождении считается источником истины: db-routes.js (handler).
 */

const aMarkovOut = require('./analyzers/markov-outcome.js');
const aMarkovSt  = require('./analyzers/markov-state.js');
const aShannon   = require('./analyzers/shannon-entropy.js');
const aInertia   = require('./analyzers/form-inertia.js');
const aMultipeak = require('./analyzers/multipeak-density.js');
const aMC        = require('./analyzers/monte-carlo.js');

/**
 * Загружает матч по sstats_id или internal id с каноническим резолвом.
 * @returns {Promise<object|null>}
 */
async function loadGame(db, id) {
    const { rows } = await db.query(
        `SELECT g.id, g.sstats_id, g.date, g.status, g.league_id,
                g.home_team_id, g.away_team_id,
                g.home_score, g.away_score,
                ht.sstats_id AS home_sstats_id, ht.name AS home_name, ht.logo AS home_logo,
                at.sstats_id AS away_sstats_id, at.name AS away_name, at.logo AS away_logo,
                l.sstats_id AS league_sstats_id, l.name AS league_name,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Home").value')::text)::numeric AS odd_home,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Draw").value')::text)::numeric AS odd_draw,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Away").value')::text)::numeric AS odd_away
         FROM games g
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         LEFT JOIN teams at ON at.id = g.away_team_id
         LEFT JOIN leagues l ON l.id = g.league_id
         WHERE g.sstats_id = $1 OR g.id = $1
         ORDER BY (g.sstats_id = $1) DESC, g.id ASC
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

/**
 * Резолвит league_id по sstats или internal id с каноническим резолвом.
 */
async function resolveLeagueId(db, leagueIdQ) {
    if (!leagueIdQ) return null;
    const { rows } = await db.query(
        `SELECT id FROM leagues
         WHERE sstats_id = $1 OR id = $1
         ORDER BY (sstats_id = $1) DESC, id ASC LIMIT 1`,
        [leagueIdQ]
    );
    return rows.length ? rows[0].id : null;
}

/**
 * Грузит последние N матчей команды до даты game.date.
 * venue ∈ {'any','home','away'}, venueFilter=true применяет venue, иначе берёт any.
 */
async function loadGames(db, { teamId, venue, n, leagueInternal, beforeDate, venueFilter }) {
    let venueCondition = '(g.home_team_id = $1 OR g.away_team_id = $1)';
    if (venueFilter && venue === 'home') venueCondition = 'g.home_team_id = $1';
    else if (venueFilter && venue === 'away') venueCondition = 'g.away_team_id = $1';

    const sql = `
        SELECT g.id, g.date,
               g.home_team_id, g.away_team_id,
               g.home_score, g.away_score,
               gs.expected_goals_home, gs.expected_goals_away
        FROM games g
        LEFT JOIN game_statistics gs ON gs.game_id = g.id
        WHERE ${venueCondition}
          AND g.is_deleted = false
          AND g.status = 'finished'
          AND g.date < $4
          AND ($3::int IS NULL OR g.league_id = $3)
        ORDER BY g.date DESC
        LIMIT $2`;
    const { rows } = await db.query(sql, [teamId, n, leagueInternal, beforeDate]);
    return rows.map((r) => {
        const isHome = r.home_team_id === teamId;
        const gf = isHome ? r.home_score : r.away_score;
        const ga = isHome ? r.away_score : r.home_score;
        let outcome = null;
        if (gf != null && ga != null) {
            if (gf > ga) outcome = 'W';
            else if (gf < ga) outcome = 'L';
            else outcome = 'D';
        }
        const xgH = r.expected_goals_home != null ? Number(r.expected_goals_home) : null;
        const xgA = r.expected_goals_away != null ? Number(r.expected_goals_away) : null;
        const xgFor = isHome ? xgH : xgA;
        const xgAg  = isHome ? xgA : xgH;
        return {
            outcome, gf, ga,
            gd: gf != null && ga != null ? gf - ga : null,
            xg_for: xgFor, xg_against: xgAg,
            xg_diff: xgFor != null && xgAg != null ? xgFor - xgAg : null,
            date: r.date,
        };
    });
}

/**
 * Основная функция. Возвращает структуру, идентичную data из эндпоинта
 * GET /api/db/games/:id/analyzers, плюс поле internal:
 *   { home_score_pred, draw_score_pred, away_score_pred } — для записи в БД.
 *
 * @param {Object} args
 * @param {Object} args.db                — pg pool / client с .query
 * @param {number} args.gameId            — sstats_id или internal id матча
 * @param {number} [args.n=20]            — окно (6..100)
 * @param {boolean} [args.leagueFilterFlag=true]
 * @param {boolean} [args.venueFilter=true]
 * @param {number|null} [args.leagueIdOverride=null] — sstats/internal id лиги (опц.)
 * @returns {Promise<{data: object} | {error: string, code: number}>}
 */
async function computePrediction({
    db,
    gameId,
    n = 20,
    leagueFilterFlag = true,
    venueFilter = true,
    leagueIdOverride = null,
}) {
    if (!Number.isFinite(gameId) || gameId <= 0) {
        return { error: 'Invalid game id', code: 400 };
    }
    n = Math.min(Math.max(parseInt(n, 10) || 20, 6), 100);

    const game = await loadGame(db, gameId);
    if (!game) return { error: 'Game not found', code: 404 };

    // league filter
    let leagueInternal = null;
    if (leagueIdOverride) {
        leagueInternal = await resolveLeagueId(db, leagueIdOverride);
    } else if (leagueFilterFlag && game.league_id) {
        leagueInternal = game.league_id;
    }

    // 4 параллельных загрузки истории
    const [homeHistAny, homeHistHome, awayHistAny, awayHistAway] = await Promise.all([
        loadGames(db, { teamId: game.home_team_id, venue: 'any',  n, leagueInternal, beforeDate: game.date, venueFilter }),
        loadGames(db, { teamId: game.home_team_id, venue: 'home', n, leagueInternal, beforeDate: game.date, venueFilter }),
        loadGames(db, { teamId: game.away_team_id, venue: 'any',  n, leagueInternal, beforeDate: game.date, venueFilter }),
        loadGames(db, { teamId: game.away_team_id, venue: 'away', n, leagueInternal, beforeDate: game.date, venueFilter }),
    ]);

    // Прогон анализаторов
    const homeAnalyzers = {
        markov_outcome:  aMarkovOut.analyze(homeHistAny),
        markov_state:    aMarkovSt.analyze(homeHistAny),
        shannon_entropy: aShannon.analyze(homeHistAny),
        form_inertia:    aInertia.analyze(homeHistAny),
        multipeak:       aMultipeak.analyze(homeHistAny),
    };
    const awayAnalyzers = {
        markov_outcome:  aMarkovOut.analyze(awayHistAny),
        markov_state:    aMarkovSt.analyze(awayHistAny),
        shannon_entropy: aShannon.analyze(awayHistAny),
        form_inertia:    aInertia.analyze(awayHistAny),
        multipeak:       aMultipeak.analyze(awayHistAny),
    };

    // Monte Carlo betting
    const betting = { home: null, draw: null, away: null };
    if (game.odd_home && Number(game.odd_home) > 1) {
        betting.home = aMC.analyze({
            games: venueFilter ? homeHistHome : homeHistAny,
            odds: Number(game.odd_home),
            target: 'W',
        });
    }
    if (game.odd_draw && Number(game.odd_draw) > 1) {
        betting.draw = aMC.analyze({
            games: homeHistAny,
            odds: Number(game.odd_draw),
            target: 'D',
        });
    }
    if (game.odd_away && Number(game.odd_away) > 1) {
        betting.away = aMC.analyze({
            games: venueFilter ? awayHistAway : awayHistAny,
            odds: Number(game.odd_away),
            target: 'W',
        });
    }

    // Integrated forecast
    const homeMO = homeAnalyzers.markov_outcome;
    const awayMO = awayAnalyzers.markov_outcome;

    let predictedOutcome = 'DRAW';
    let predictedConfidence = 0;
    let homeScore = 0, drawScore = 0, awayScore = 0;
    const reasons = [];

    if (homeMO.details && homeMO.details.next_outcome && awayMO.details && awayMO.details.next_outcome) {
        const homePred = homeMO.details.next_outcome.prediction;
        const awayPred = awayMO.details.next_outcome.prediction;
        const homeProb = homeMO.details.next_outcome.probability;
        const awayProb = awayMO.details.next_outcome.probability;

        if (homePred === 'W') homeScore += homeProb;
        if (homePred === 'D') drawScore += homeProb * 0.5;
        if (homePred === 'L') awayScore += homeProb;
        if (awayPred === 'W') awayScore += awayProb;
        if (awayPred === 'D') drawScore += awayProb * 0.5;
        if (awayPred === 'L') homeScore += awayProb;

        const inertiaFactor = ((homeAnalyzers.form_inertia.value || 0) + (awayAnalyzers.form_inertia.value || 0)) / 2;
        const stateFactor   = ((homeAnalyzers.markov_state.value   || 0) + (awayAnalyzers.markov_state.value   || 0)) / 2;
        const multipeakPenalty = Math.max(homeAnalyzers.multipeak.value || 0, awayAnalyzers.multipeak.value || 0);

        if (homeScore >= drawScore && homeScore >= awayScore) { predictedOutcome = 'HOME'; predictedConfidence = homeScore; }
        else if (awayScore >= drawScore && awayScore >= homeScore) { predictedOutcome = 'AWAY'; predictedConfidence = awayScore; }
        else { predictedOutcome = 'DRAW'; predictedConfidence = drawScore; }

        const adjConfidence = predictedConfidence
            * (0.5 + 0.25 * inertiaFactor + 0.25 * stateFactor)
            * (1 - 0.3 * multipeakPenalty);
        predictedConfidence = Math.max(0, Math.min(1, adjConfidence));

        reasons.push({
            type: 'markov_chain', weight: 0.4,
            home_prediction: homePred, home_prob: homeProb,
            away_prediction: awayPred, away_prob: awayProb,
        });
        reasons.push({
            type: 'form_inertia', weight: 0.25,
            factor: inertiaFactor,
            detail: 'higher = more predictable form',
        });
        reasons.push({
            type: 'multipeak_penalty', weight: 0.3,
            factor: multipeakPenalty,
            detail: 'higher = more bimodal team, less reliable forecast',
        });
    }

    return {
        data: {
            game: {
                id: game.sstats_id,
                internal_id: game.id,
                date: game.date,
                status: game.status,
                league: { id: game.league_sstats_id, name: game.league_name, internal_id: game.league_id },
                home: { id: game.home_sstats_id, name: game.home_name, logo: game.home_logo, score: game.home_score },
                away: { id: game.away_sstats_id, name: game.away_name, logo: game.away_logo, score: game.away_score },
                odds: {
                    home: game.odd_home != null ? Number(game.odd_home) : null,
                    draw: game.odd_draw != null ? Number(game.odd_draw) : null,
                    away: game.odd_away != null ? Number(game.odd_away) : null,
                },
            },
            config: {
                n_window: n,
                league_filter: leagueInternal,
                league_filter_flag: leagueFilterFlag,
                venue_filter: venueFilter,
            },
            history_sizes: {
                home_any:  homeHistAny.length,
                home_home: homeHistHome.length,
                away_any:  awayHistAny.length,
                away_away: awayHistAway.length,
            },
            home_analyzers: homeAnalyzers,
            away_analyzers: awayAnalyzers,
            betting,
            integrated_forecast: {
                predicted_outcome: predictedOutcome,
                confidence: predictedConfidence,
                reasons,
                // Внутренние accumulated scores — нужны для аналитики и хранения
                _scores: { home: homeScore, draw: drawScore, away: awayScore },
            },
        },
    };
}

module.exports = { computePrediction };
