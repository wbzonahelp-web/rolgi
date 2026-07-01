'use strict';
/**
 * DB-only routes. Префикс: /api/db
 * Все данные читаются ИСКЛЮЧИТЕЛЬНО из PostgreSQL.
 */

const STATUS_MAP = {
    scheduled:        { kind: 'scheduled', label: 'Запланирован' },
    live:             { kind: 'live',      label: 'Live' },
    interrupted:      { kind: 'live',      label: 'Прерван' },
    finished:         { kind: 'finished',  label: 'Завершён' },
    postponed:        { kind: 'postponed', label: 'Перенесён' },
    cancelled:        { kind: 'cancelled', label: 'Отменён' },
    abandoned:        { kind: 'cancelled', label: 'Прерван' },
    'technical loss': { kind: 'cancelled', label: 'Тех. поражение' },
    'walk over':      { kind: 'finished',  label: 'Без игры' },
};

// Хардкоженный список топ-лиг по (country_name, name) для вкладки "Популярные"
const POPULAR_LEAGUES = [
    ['England',     'Premier League'],
    ['Spain',       'LaLiga'],
    ['Germany',     'Bundesliga'],
    ['Italy',       'Serie A'],
    ['France',      'Ligue 1'],
    ['England',     'Championship'],
    ['Netherlands', 'Eredivisie'],
    ['Portugal',    'Primeira Liga'],
    ['Belgium',     'Pro League'],
    ['Turkey',      'Süper Lig'],
    ['Brazil',      'Serie A'],
    ['Brazil',      'Serie B'],
    ['Argentina',   'Liga Profesional Argentina'],
    ['Mexico',      'Liga MX'],
    ['USA',         'Major League Soccer'],
    ['Russia',      'Premier League'],
    ['Ukraine',     'Premier League'],
    ['Greece',      'Super League'],
    ['Scotland',    'Premiership'],
    ['Austria',     'Bundesliga'],
    ['Switzerland', 'Super League'],
    ['World',       'Champions League'],
    ['World',       'Europa League'],
    ['World',       'Conference League'],
    ['World',       'World Cup'],
    ['World',       'European Championship'],
    ['World',       'Copa America'],
    ['Spain',       'Segunda División'],
    ['Italy',       'Serie B'],
    ['Germany',     '2. Bundesliga'],
];

function seasonDateRange(year) {
    const y = parseInt(year, 10);
    return [`${y - 1}-07-01`, `${y + 1}-07-01`];
}

// INDEX1-MIGRATION: API contract
// Contract: all `id` fields in requests/responses are sstats_id.
// Internal DB ids are hidden (exposed as `internal_id` for debug only).
async function dbRoutes(fastify) {
    const db = fastify.db || require('../../database/db-pool').getDatabase();

    // ────────────────────────────────────────────────────────────
    // GET /api/db/leagues
    // Все активные лиги + сезоны + popularity rank + games_recent
    // ────────────────────────────────────────────────────────────
    fastify.get('/leagues', async () => {
        // Динамический rank popular для тех, что в списке
        const popularRanks = POPULAR_LEAGUES.map(([c, n], idx) => `(${idx + 1}::int, $${idx * 2 + 1}::text, $${idx * 2 + 2}::text)`).join(', ');
        const popularParams = POPULAR_LEAGUES.flat();

        const sql = `
            WITH popular(rank, country, name) AS (VALUES ${popularRanks})
            SELECT
                l.sstats_id AS id, l.id AS internal_id,
                l.name, l.country_name, l.priority, l.logo,
                p.rank AS popular_rank,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'year',       s.season,
                            'startDate',  s.start_date,
                            'endDate',    s.end_date,
                            'isCurrent',  s.is_current
                        ) ORDER BY s.season DESC
                    ) FILTER (WHERE s.id IS NOT NULL),
                    '[]'::json
                ) AS seasons
            FROM leagues l
            LEFT JOIN seasons s ON s.league_id = l.id
            LEFT JOIN popular  p ON p.country = l.country_name AND p.name = l.name
            WHERE l.is_active = true
            GROUP BY l.id, p.rank
            ORDER BY p.rank NULLS LAST, l.country_name, l.name`;
        const { rows } = await db.query(sql, popularParams);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/leagues/popular
    // Только популярные (топ-30) с последним сезоном
    // ────────────────────────────────────────────────────────────
    fastify.get('/leagues/popular', async () => {
        const popularRanks = POPULAR_LEAGUES.map(([c, n], idx) => `(${idx + 1}::int, $${idx * 2 + 1}::text, $${idx * 2 + 2}::text)`).join(', ');
        const popularParams = POPULAR_LEAGUES.flat();
        const sql = `
            WITH popular(rank, country, name) AS (VALUES ${popularRanks})
            SELECT l.sstats_id AS id, l.id AS internal_id,
                   l.name, l.country_name, p.rank AS popular_rank,
                COALESCE(
                    json_agg(json_build_object('year', s.season, 'isCurrent', s.is_current)
                             ORDER BY s.season DESC)
                    FILTER (WHERE s.id IS NOT NULL),
                    '[]'::json
                ) AS seasons
            FROM popular p
            JOIN leagues l ON l.country_name = p.country AND l.name = p.name AND l.is_active = true
            LEFT JOIN seasons s ON s.league_id = l.id
            GROUP BY l.id, p.rank
            ORDER BY p.rank`;
        const { rows } = await db.query(sql, popularParams);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/list?leagueId=&season=&status=&limit=
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/list', async (request, reply) => {
        // INDEX1-PART3: leagueId is sstats_id (resolved via JOIN leagues)
        const leagueId    = request.query.leagueId ? parseInt(request.query.leagueId, 10) : null;
        const season      = request.query.season   ? parseInt(request.query.season, 10) : null;
        const status      = request.query.status || null;
        const statusGroup = request.query.statusGroup || null;
        const date        = request.query.date     || null;
        const dateFrom    = request.query.dateFrom || null;
        const dateTo      = request.query.dateTo   || null;
        const team        = request.query.team     || null;
        const limit       = Math.min(parseInt(request.query.limit || 50, 10), 200);
        const offset      = parseInt(request.query.offset || 0, 10);

        if (!leagueId && !date && !dateFrom && !dateTo && statusGroup !== 'live' && !team) {
            return reply.code(400).send({ success: false,
                error: 'at least one filter required: leagueId | date | dateFrom/dateTo | statusGroup=live | team' });
        }

        const where = ['g.is_deleted = false'];
        const params = [];
        let i = 1;

        if (leagueId) { where.push(`l.sstats_id = $${i++}`); params.push(leagueId); }
        if (season) {
            const [from, to] = seasonDateRange(season);
            where.push(`g.season = $${i++}`); params.push(season);
            where.push(`g.date >= $${i++}`); params.push(from);
            where.push(`g.date <  $${i++}`); params.push(to);
        }
        if (date)     { where.push(`g.date::date = $${i++}::date`); params.push(date); }
        if (dateFrom) { where.push(`g.date >= $${i++}`); params.push(dateFrom); }
        if (dateTo)   { where.push(`g.date <= $${i++}`); params.push(dateTo); }
        if (status)   { where.push(`g.status = $${i++}`); params.push(status); }
        if (statusGroup === 'upcoming') { where.push(`(g.status = 'scheduled' OR g.status = 'postponed')`); }
        else if (statusGroup === 'live') { where.push(`g.is_live = true`); }
        else if (statusGroup === 'finished') { where.push(`g.status = 'finished'`); }
        if (team) {
            where.push(`(ht.name ILIKE $${i} OR at.name ILIKE $${i})`);
            params.push(`%${team}%`); i++;
        }

        const orderDir = statusGroup === 'upcoming' ? 'ASC' : 'DESC';

        const sql = `
            SELECT g.sstats_id AS id, g.id AS internal_id,
                   g.date, g.status, g.season,
                   g.home_score, g.away_score, g.home_score_ht, g.away_score_ht,
                   g.is_live, g.is_finished, g.round, g.odds_data AS odds,
                   ht.sstats_id AS home_team_id, ht.name AS home_name, ht.logo AS home_logo,
                   at.sstats_id AS away_team_id, at.name AS away_name, at.logo AS away_logo,
                   l.sstats_id AS league_id, l.name AS league_name, l.logo AS league_logo,
                   l.country_name AS league_country
            FROM games g
            LEFT JOIN teams   ht ON ht.id = g.home_team_id
            LEFT JOIN teams   at ON at.id = g.away_team_id
            LEFT JOIN leagues l  ON l.id  = g.league_id
            WHERE ${where.join(' AND ')}
            ORDER BY g.date ${orderDir}
            LIMIT $${i++} OFFSET $${i}`;
        params.push(limit, offset);
        const { rows } = await db.query(sql, params);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });
    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/season-summary?leagueId=&season=
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/season-summary', async (request, reply) => {
        const leagueId = parseInt(request.query.leagueId, 10);
        const season   = parseInt(request.query.season,   10);
        if (!leagueId || !season) return reply.code(400).send({ success: false, error: 'leagueId and season required' });

        const [from, to] = seasonDateRange(season);
        const sql = `
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='finished')  AS finished,
                COUNT(*) FILTER (WHERE is_live=true)       AS live,
                COUNT(*) FILTER (WHERE status='scheduled') AS scheduled,
                COUNT(*) FILTER (WHERE status='postponed') AS postponed,
                COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
                MIN(date) AS first_match, MAX(date) AS last_match
            FROM games
            WHERE league_id=$1 AND season=$2 AND date>=$3 AND date<$4 AND is_deleted=false`;
        const { rows } = await db.query(sql, [leagueId, season, from, to]);
        const r = rows[0];
        // Преобразуем BIGINT-строки в числа
        ['total','finished','live','scheduled','postponed','cancelled'].forEach(k => {
            r[k] = parseInt(r[k], 10);
        });
        return { success: true, data: r, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/live
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/live', async () => {
        const sql = `
            SELECT g.sstats_id AS id, g.id AS internal_id,
                   g.date, g.status,
                   g.home_score, g.away_score, g.home_score_ht, g.away_score_ht,
                   g.is_live, g.is_finished,
                   ht.sstats_id AS home_team_id, ht.name AS home_name, ht.logo AS home_logo,
                   at.sstats_id AS away_team_id, at.name AS away_name, at.logo AS away_logo,
                   l.sstats_id AS league_id, l.name AS league_name, l.logo AS league_logo,
                   l.country_name AS league_country
            FROM games g
            LEFT JOIN teams ht ON ht.id = g.home_team_id
            LEFT JOIN teams at ON at.id = g.away_team_id
            LEFT JOIN leagues l ON l.id  = g.league_id
            WHERE g.is_live = true AND g.is_deleted = false
            ORDER BY g.date DESC LIMIT 100`;
        const { rows } = await db.query(sql);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id (по sstats_id или внутр. id)
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });
        const sql = `
            SELECT g.sstats_id AS id, g.id AS internal_id,
                   g.date, g.status, g.round, g.season,
                   g.home_score, g.away_score, g.home_score_ht, g.away_score_ht,
                   g.is_live, g.is_finished, g.referee, g.stadium, g.attendance, g.odds_data AS odds,
                   ht.sstats_id AS home_team_id, ht.name AS home_name, ht.logo AS home_logo,
                   at.sstats_id AS away_team_id, at.name AS away_name, at.logo AS away_logo,
                   l.sstats_id AS league_id, l.name AS league_name, l.logo AS league_logo,
                   l.country_name AS league_country
            FROM games g
            LEFT JOIN teams ht ON ht.id = g.home_team_id
            LEFT JOIN teams at ON at.id = g.away_team_id
            LEFT JOIN leagues l ON l.id  = g.league_id
            WHERE g.sstats_id = $1 OR g.id = $1
            ORDER BY (CASE WHEN g.sstats_id = $1 THEN 0 ELSE 1 END), g.last_updated DESC NULLS LAST
            LIMIT 1`;
        const { rows } = await db.query(sql, [id]);
        if (!rows.length) return reply.code(404).send({ success: false, error: 'not found' });
        return { success: true, data: rows[0], source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/events — события матча (голы, карточки, замены)
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/events', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });
        const sql = `
            SELECT
                e.id, e.minute, e.minute_extra, e.type, e.subtype,
                t.sstats_id AS team_id,
                CASE
                    WHEN e.team_id = g.home_team_id THEN 'home'
                    WHEN e.team_id = g.away_team_id THEN 'away'
                    ELSE NULL
                END AS side,
                pl.sstats_id AS player_id,
                COALESCE(pl.name, e.player_name) AS player_name,
                apl.sstats_id AS assist_player_id,
                COALESCE(apl.name, e.assist_player_name) AS assist_player_name,
                e.description
            FROM game_events e
            JOIN games g ON g.id = e.game_id
            LEFT JOIN teams t     ON t.id   = e.team_id
            LEFT JOIN players pl  ON pl.id  = e.player_id
            LEFT JOIN players apl ON apl.id = e.assist_player_id
            WHERE g.sstats_id = $1
            ORDER BY g.last_updated DESC NULLS LAST,
                     e.minute ASC NULLS LAST,
                     COALESCE(e.minute_extra, 0) ASC,
                     e.id ASC`;
        const { rows } = await db.query(sql, [id]);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/lineups — составы (group by home/away, starter/sub)
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/lineups', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });
        const sql = `
            SELECT
                t.sstats_id AS team_id,
                CASE
                    WHEN l.team_id = g.home_team_id THEN 'home'
                    WHEN l.team_id = g.away_team_id THEN 'away'
                    ELSE NULL
                END AS side,
                pl.sstats_id AS player_id,
                COALESCE(pl.name, l.player_name) AS player_name,
                pl.position AS player_position,
                pl.photo,
                l.position AS lineup_position,
                l.shirt_number,
                l.is_starter,
                l.is_captain,
                l.substituted_in_minute,
                l.substituted_out_minute
            FROM game_lineups l
            JOIN games g ON g.id = l.game_id
            LEFT JOIN teams t    ON t.id  = l.team_id
            LEFT JOIN players pl ON pl.id = l.player_id
            WHERE g.sstats_id = $1
            ORDER BY g.last_updated DESC NULLS LAST,
                     CASE WHEN l.team_id = g.home_team_id THEN 0 ELSE 1 END,
                     l.is_starter DESC,
                     l.shirt_number ASC NULLS LAST`;
        const { rows } = await db.query(sql, [id]);

        // Группируем на стороне сервера: { home:{starters,substitutes}, away:{...} }
        const out = {
            home: { starters: [], substitutes: [] },
            away: { starters: [], substitutes: [] }
        };
        for (const r of rows) {
            if (!r.side) continue;
            const bucket = r.is_starter ? 'starters' : 'substitutes';
            out[r.side][bucket].push(r);
        }
        return { success: true, data: out, total: rows.length, source: 'db' };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/statistics — статистика матча (home/away pairs)
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/statistics', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });
        const sql = `
            SELECT s.*
            FROM game_statistics s
            JOIN games g ON g.id = s.game_id
            WHERE g.sstats_id = $1
            ORDER BY g.last_updated DESC NULLS LAST
            LIMIT 1`;
        const { rows } = await db.query(sql, [id]);
        if (!rows.length) {
            return { success: true, data: null, source: 'db' };
        }
        const s = rows[0];
        // Список метрик: [key, label, isFloat]
        const METRICS = [
            ['possession',              'Владение, %',        false],
            ['shots',                   'Удары',              false],
            ['shots_on_target',         'Удары в створ',      false],
            ['shots_off_target',        'Мимо',               false],
            ['shots_blocked',           'Заблокированы',      false],
            ['shots_inside_box',        'Удары из штрафной',  false],
            ['shots_outside_box',       'Из-за штрафной',     false],
            ['expected_goals',          'xG',                 true ],
            ['big_chances',             'Голевые моменты',    false],
            ['hit_woodwork',            'В штанги',           false],
            ['corners',                 'Угловые',            false],
            ['offsides',                'Офсайды',            false],
            ['fouls',                   'Фолы',               false],
            ['yellow_cards',            'Жёлтые карточки',    false],
            ['red_cards',               'Красные карточки',   false],
            ['total_passes',            'Передачи',           false],
            ['passes_accurate',         'Точные передачи',    false],
            ['long_passes',             'Длинные передачи',   false],
            ['passes_in_final_third',   'Передачи в фин. треть', false],
            ['crosses',                 'Навесы',             false],
            ['touches_in_opp_box',      'Касания в штрафной соперника', false],
            ['total_tackles',           'Отборы',             false],
            ['duels_won',               'Выиграно единоборств', false],
            ['clearances',              'Выносы',             false],
            ['interceptions',           'Перехваты',          false],
            ['goalkeeper_saves',        'Сейвы вратаря',      false],
            ['free_kicks',              'Штрафные',           false],
            ['throwins',                'Ауты',               false],
        ];
        const metrics = METRICS.map(([k, label, isFloat]) => {
            const hRaw = s[`${k}_home`];
            const aRaw = s[`${k}_away`];
            const norm = v => {
                if (v === null || v === undefined) return null;
                return isFloat ? Number(v) : Number(v);
            };
            return { key: k, label, home: norm(hRaw), away: norm(aRaw) };
        }).filter(m => m.home !== null || m.away !== null);

        return {
            success: true,
            data: {
                game_id: s.game_id,
                metrics,
                raw: s
            },
            source: 'db'
        };
    });

    // INDEX1-PART5: search endpoints
    // GET /api/db/teams/search?q=...&limit=20 - pg_trgm similarity
    fastify.get('/teams/search', async (request, reply) => {
        const q = (request.query.q || '').trim();
        const limit = Math.min(parseInt(request.query.limit || 20, 10), 100);
        if (q.length < 2) {
            return reply.code(400).send({ success: false, error: 'q must be >= 2 chars' });
        }
        const sql = `
            SELECT t.sstats_id AS id, t.id AS internal_id,
                   t.name, t.short_name, t.logo,
                   t.country_name, t.stadium,
                   similarity(t.name, $1) AS score
            FROM teams t
            WHERE t.is_active = true
              AND t.name % $1
            ORDER BY score DESC, t.name ASC
            LIMIT $2`;
        const { rows } = await db.query(sql, [q, limit]);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });

    // GET /api/db/players/search?q=...&limit=20
    fastify.get('/players/search', async (request, reply) => {
        const q = (request.query.q || '').trim();
        const limit = Math.min(parseInt(request.query.limit || 20, 10), 100);
        if (q.length < 2) {
            return reply.code(400).send({ success: false, error: 'q must be >= 2 chars' });
        }
        const sql = `
            SELECT p.sstats_id AS id, p.id AS internal_id,
                   p.name, p.first_name, p.last_name,
                   p.position, p.country_name, p.photo,
                   p.date_of_birth, p.age,
                   similarity(p.name, $1) AS score
            FROM players p
            WHERE p.is_active = true
              AND p.name % $1
            ORDER BY score DESC, p.name ASC
            LIMIT $2`;
        const { rows } = await db.query(sql, [q, limit]);
        return { success: true, data: rows, total: rows.length, source: 'db' };
    });
    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/h2h — личные встречи команд (из БД)
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/h2h', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const limit = Math.min(parseInt(request.query.limit || '20', 10), 50);
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });

        // 1) Берём команды этого матча
        const pickRes = await db.query(
            `SELECT id, home_team_id, away_team_id FROM games
             WHERE sstats_id=$1 OR id=$1
             ORDER BY (CASE WHEN sstats_id=$1 THEN 0 ELSE 1 END), last_updated DESC NULLS LAST
             LIMIT 1`, [id]);
        if (!pickRes.rows.length) return reply.code(404).send({ success: false, error: 'game not found' });
        const pick = pickRes.rows[0];

        // 2) История очных встреч (без текущего матча)
        const sql = `
            SELECT
                g.sstats_id AS id, g.date, g.status,
                g.home_score, g.away_score, g.home_score_ht, g.away_score_ht,
                ht.sstats_id AS home_team_id, ht.name AS home_name, ht.logo AS home_logo,
                at.sstats_id AS away_team_id, at.name AS away_name, at.logo AS away_logo,
                l.sstats_id AS league_id, l.name AS league_name, l.country_name AS league_country
            FROM games g
            LEFT JOIN teams   ht ON ht.id = g.home_team_id
            LEFT JOIN teams   at ON at.id = g.away_team_id
            LEFT JOIN leagues l  ON l.id  = g.league_id
            WHERE g.id <> $1
              AND g.status = 'finished'
              AND g.is_deleted = false
              AND (
                (g.home_team_id = $2 AND g.away_team_id = $3)
                OR (g.home_team_id = $3 AND g.away_team_id = $2)
              )
            ORDER BY g.date DESC
            LIMIT $4`;
        const { rows } = await db.query(sql, [pick.id, pick.home_team_id, pick.away_team_id, limit]);

        // 3) Агрегаты W/D/L относительно команды-хозяина из текущего матча
        let homeWins = 0, draws = 0, awayWins = 0;
        const gamesOut = rows.map(r => {
            const hs = r.home_score, as = r.away_score;
            let outcome = null;
            if (hs != null && as != null) {
                if (hs === as) { draws++; outcome = 'draw'; }
                else {
                    // pick.home_team_id мог играть либо хозяином, либо гостем — определяем по home_team_id строки
                    const pickWasHomeHere = (r.home_team_id != null && r.home_team_id !== r.away_team_id)
                        ? null : null; // вычислим ниже из id
                    // Точнее: r.home_team_id — это sstats_id. Нам нужно сравнить с pick.home_team_id (internal).
                    // Проще: победитель в строке — это либо home_name либо away_name.
                    // Чтобы понять, играл ли pick-home хозяином здесь, добавим side через JOIN ниже.
                }
            }
            return { ...r, outcome };
        });

        // 4) Точные wins считаем отдельным запросом — проще через JOIN с pick.home_team_id (internal id)
        const aggRes = await db.query(`
            SELECT
              COUNT(*) FILTER (WHERE (g.home_team_id=$2 AND g.home_score>g.away_score)
                                  OR (g.away_team_id=$2 AND g.away_score>g.home_score)) AS home_team_wins,
              COUNT(*) FILTER (WHERE g.home_score = g.away_score) AS draws,
              COUNT(*) FILTER (WHERE (g.home_team_id=$3 AND g.home_score>g.away_score)
                                  OR (g.away_team_id=$3 AND g.away_score>g.home_score)) AS away_team_wins,
              COUNT(*) AS total
            FROM games g
            WHERE g.id <> $1
              AND g.status='finished'
              AND g.is_deleted=false
              AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
              AND ((g.home_team_id=$2 AND g.away_team_id=$3)
                OR (g.home_team_id=$3 AND g.away_team_id=$2))
        `, [pick.id, pick.home_team_id, pick.away_team_id]);

        return {
            success: true,
            data: {
                games: gamesOut,
                summary: {
                    total: parseInt(aggRes.rows[0].total, 10) || 0,
                    home_team_wins: parseInt(aggRes.rows[0].home_team_wins, 10) || 0,
                    draws: parseInt(aggRes.rows[0].draws, 10) || 0,
                    away_team_wins: parseInt(aggRes.rows[0].away_team_wins, 10) || 0
                }
            },
            source: 'db'
        };
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/teams/:id/recent-form — последние N матчей команды
    // ────────────────────────────────────────────────────────────
    fastify.get('/teams/:id/recent-form', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        const limit = Math.min(Math.max(parseInt(request.query.limit || '10', 10), 1), 50);
        const leagueIdRaw = request.query.league_id;
        const leagueId = leagueIdRaw ? parseInt(leagueIdRaw, 10) : null;
        if (!id) return reply.code(400).send({ success: false, error: 'id required' });

        const teamRes = await db.query(
            `SELECT id FROM teams WHERE sstats_id=$1 OR id=$1 ORDER BY (sstats_id=$1) DESC, id ASC LIMIT 1`, [id]);
        if (!teamRes.rows.length) return reply.code(404).send({ success: false, error: 'team not found' });
        const teamInternal = teamRes.rows[0].id;

        // league_id из запроса — это sstats_id лиги, резолвим в internal id
        let leagueInternal = null;
        if (leagueId) {
            const lr = await db.query(
                `SELECT id FROM leagues WHERE sstats_id=$1 OR id=$1 ORDER BY (sstats_id=$1) DESC, id ASC LIMIT 1`, [leagueId]);
            if (lr.rows.length) leagueInternal = lr.rows[0].id;
        }

        const sql = `
            SELECT
                g.id AS internal_id,
                g.sstats_id AS id, g.date, g.status,
                g.home_score, g.away_score,
                g.home_team_id AS home_team_internal,
                g.away_team_id AS away_team_internal,
                CASE WHEN g.home_team_id = $1 THEN 'home' ELSE 'away' END AS side,
                ht.sstats_id AS home_team_id, ht.name AS home_name, ht.logo AS home_logo,
                at.sstats_id AS away_team_id, at.name AS away_name, at.logo AS away_logo,
                l.sstats_id AS league_id, l.name AS league_name,
                -- Извлекаем основные коэффициенты (1X2 + Over/Under 2.5)
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Home").value')::text)::numeric AS odd_home,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Draw").value')::text)::numeric AS odd_draw,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Away").value')::text)::numeric AS odd_away,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Over 2.5").value')::text)::numeric AS odd_over25,
                (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Under 2.5").value')::text)::numeric AS odd_under25,
                -- Список голов: [{minute, minute_extra, team_side}]
                (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'minute', ge.minute,
                          'minute_extra', ge.minute_extra,
                          'team_side', CASE WHEN ge.team_id = g.home_team_id THEN 'home' ELSE 'away' END,
                          'subtype', ge.subtype
                        ) ORDER BY ge.minute NULLS LAST, ge.minute_extra NULLS LAST),
                        '[]'::jsonb)
                 FROM game_events ge
                 WHERE ge.game_id = g.id AND ge.type = 'goal') AS goals
            FROM games g
            LEFT JOIN teams   ht ON ht.id = g.home_team_id
            LEFT JOIN teams   at ON at.id = g.away_team_id
            LEFT JOIN leagues l  ON l.id  = g.league_id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.status='finished'
              AND g.is_deleted = false
              AND ($3::int IS NULL OR g.league_id = $3)
            ORDER BY g.date DESC
            LIMIT $2`;
        const { rows } = await db.query(sql, [teamInternal, limit, leagueInternal]);

        let w=0, d=0, ls=0, gf=0, ga=0;
        for (const r of rows) {
            if (r.home_score == null || r.away_score == null) continue;
            const myScore = r.side === 'home' ? r.home_score : r.away_score;
            const opScore = r.side === 'home' ? r.away_score : r.home_score;
            gf += myScore; ga += opScore;
            if (myScore > opScore) w++;
            else if (myScore < opScore) ls++;
            else d++;
            r.outcome = (myScore > opScore) ? 'W' : (myScore < opScore ? 'L' : 'D');
        }

        return {
            success: true,
            data: {
                games: rows,
                summary: {
                    played: rows.length,
                    wins: w, draws: d, losses: ls,
                    goals_for: gf, goals_against: ga,
                    win_pct: rows.length ? Math.round(100*w/rows.length) : 0
                }
            },
            source: 'db'
        };
    });

    // ────────────────────────────────────────────────────────────
    // ============================================================
    // ANALYZERS HELPER: shared function for /teams/:id/analyzers/*
    // Загружает последние N матчей команды с xG/gd/totals/odds,
    // возвращает массив объектов в формате, ожидаемом анализаторами.
    // ============================================================
    async function loadTeamGamesForAnalyzer(teamSstatsId, n, leagueSstatsId) {
        // Резолв команды
        const teamRes = await db.query(
            `SELECT id, sstats_id, name, logo FROM teams
             WHERE sstats_id = $1 OR id = $1
             ORDER BY (sstats_id = $1) DESC, id ASC
             LIMIT 1`,
            [teamSstatsId]
        );
        if (!teamRes.rows.length) return { team: null, games: [], leagueInternal: null };
        const team = teamRes.rows[0];

        // Резолв лиги
        let leagueInternal = null;
        if (leagueSstatsId) {
            const lr = await db.query(
                `SELECT id FROM leagues
                 WHERE sstats_id = $1 OR id = $1
                 ORDER BY (sstats_id = $1) DESC, id ASC
                 LIMIT 1`,
                [leagueSstatsId]
            );
            if (lr.rows.length) leagueInternal = lr.rows[0].id;
        }

        // Последние N завершённых матчей с join на game_statistics
        const sql = `
            SELECT g.id, g.date,
                   g.home_team_id, g.away_team_id,
                   g.home_score, g.away_score,
                   g.odds_data,
                   gs.expected_goals_home, gs.expected_goals_away,
                   gs.shots_home, gs.shots_away,
                   gs.shots_on_target_home, gs.shots_on_target_away,
                   gs.possession_home, gs.possession_away
            FROM games g
            LEFT JOIN game_statistics gs ON gs.game_id = g.id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_deleted = false
              AND g.status = 'finished'
              AND ($3::int IS NULL OR g.league_id = $3)
            ORDER BY g.date DESC
            LIMIT $2`;
        const { rows } = await db.query(sql, [team.id, n, leagueInternal]);

        const games = rows.map((r) => {
            const isHome = r.home_team_id === team.id;
            const gf = isHome ? r.home_score : r.away_score;
            const ga = isHome ? r.away_score : r.home_score;
            let outcome = null;
            if (gf != null && ga != null) {
                if (gf > ga) outcome = 'W';
                else if (gf < ga) outcome = 'L';
                else outcome = 'D';
            }
            const xgHome = r.expected_goals_home != null ? Number(r.expected_goals_home) : null;
            const xgAway = r.expected_goals_away != null ? Number(r.expected_goals_away) : null;
            const xgFor = isHome ? xgHome : xgAway;
            const xgAgainst = isHome ? xgAway : xgHome;
            return {
                id: r.id,
                date: r.date,
                side: isHome ? 'home' : 'away',
                gf, ga,
                gd: gf != null && ga != null ? gf - ga : null,
                outcome,
                xg_for: xgFor,
                xg_against: xgAgainst,
                xg_diff: xgFor != null && xgAgainst != null ? xgFor - xgAgainst : null,
                shots_for: isHome ? r.shots_home : r.shots_away,
                shots_against: isHome ? r.shots_away : r.shots_home,
                sot_for: isHome ? r.shots_on_target_home : r.shots_on_target_away,
                sot_against: isHome ? r.shots_on_target_away : r.shots_on_target_home,
                possession_for: isHome ? r.possession_home : r.possession_away,
                odds_data: r.odds_data,
            };
        });

        return { team, games, leagueInternal };
    }

    // Универсальный обработчик: принимает имя анализатора и его модуль,
    // вешает GET /teams/:id/analyzers/<name>?n=...&league_id=...
    function registerTeamAnalyzer(name, modulePath) {
        fastify.get(`/teams/:id/analyzers/${name}`, async (request, reply) => {
            try {
                const idRaw = request.params.id;
                const id = parseInt(idRaw, 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return reply.code(400).send({ success: false, error: 'Invalid team id' });
                }
                let n = parseInt(request.query.n || '20', 10);
                if (!Number.isFinite(n)) n = 20;
                n = Math.min(Math.max(n, 6), 100);
                const leagueIdRaw = request.query.league_id;
                const leagueIdQ = leagueIdRaw ? parseInt(leagueIdRaw, 10) : null;

                const { team, games, leagueInternal } =
                    await loadTeamGamesForAnalyzer(id, n, leagueIdQ);
                if (!team) {
                    return reply.code(404).send({ success: false, error: 'Team not found' });
                }

                const analyzer = require(modulePath);
                const result = analyzer.analyze(games);

                return {
                    success: true,
                    data: {
                        team: {
                            id: team.sstats_id,
                            internal_id: team.id,
                            name: team.name,
                            logo: team.logo,
                        },
                        analyzer: analyzer.name,
                        n_window: n,
                        games_used: games.length,
                        league_filter: leagueInternal,
                        value: result.value,
                        confidence: result.confidence,
                        details: result.details,
                    },
                    source: 'live',
                };
            } catch (err) {
                request.log.error({ err }, `analyzer ${name} failed`);
                return reply.code(500).send({
                    success: false,
                    error: `Analyzer ${name} failed`,
                    message: err.message,
                });
            }
        });
    }

    // Регистрируем 3 новых анализатора через универсальный обработчик
    registerTeamAnalyzer('markov-state',    '../../analytics/analyzers/markov-state.js');
    registerTeamAnalyzer('shannon-entropy', '../../analytics/analyzers/shannon-entropy.js');
    registerTeamAnalyzer('form-inertia',    '../../analytics/analyzers/form-inertia.js');
    registerTeamAnalyzer('multipeak',       '../../analytics/analyzers/multipeak-density.js');

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/analyzers
    //   ?n=10..100         — окно последних матчей команды (default 20)
    //   ?league_id=X       — фильтр (опц., default = current match's league)
    //   ?venue_filter=true — фильтровать history по венусу (default true)
    // Запускает все 7 анализаторов для обеих команд + интегральный прогноз.
    // Возвращает плоскую структуру для UI.
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/analyzers', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid game id' });
            }
            let n = parseInt(request.query.n || '20', 10);
            if (!Number.isFinite(n)) n = 20;
            n = Math.min(Math.max(n, 6), 100);

            const leagueIdRaw = request.query.league_id;
            const leagueIdQ = leagueIdRaw ? parseInt(leagueIdRaw, 10) : null;
            const venueFilter = request.query.venue_filter !== 'false'; // default true
            // league_filter: true (default) = ограничить историю текущей лигой матча
            //                false          = брать все турниры
            const leagueFilterFlag = request.query.league_filter !== 'false';

            // 1) Резолв матча
            const gRes = await db.query(
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
                 ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
                 LIMIT 1`,
                [id]
            );
            if (!gRes.rows.length) {
                return reply.code(404).send({ success: false, error: 'Game not found' });
            }
            const game = gRes.rows[0];

            // 2) Определяем league filter
            let leagueInternal = null;
            if (leagueIdQ) {
                const lr = await db.query(
                    `SELECT id FROM leagues
                     WHERE sstats_id = $1 OR id = $1
                     ORDER BY (sstats_id = $1) DESC, id ASC LIMIT 1`,
                    [leagueIdQ]
                );
                if (lr.rows.length) leagueInternal = lr.rows[0].id;
            } else if (leagueFilterFlag && game.league_id) {
                leagueInternal = game.league_id;
            }

            // 3) Универсальная загрузка истории команды (опц. venue filter)
            async function loadGames(teamId, venue) {
                let venueCondition = '(g.home_team_id = $1 OR g.away_team_id = $1)';
                if (venueFilter && venue === 'home') venueCondition = 'g.home_team_id = $1';
                else if (venueFilter && venue === 'away') venueCondition = 'g.away_team_id = $1';
                const sql = `
                    SELECT g.id, g.date,
                           g.home_team_id, g.away_team_id,
                           g.home_score, g.away_score,
                           gs.expected_goals_home, gs.expected_goals_away,
                           gs.possession_home, gs.possession_away,
                           gs.shots_home, gs.shots_away,
                           gs.shots_on_target_home, gs.shots_on_target_away,
                           gs.big_chances_home, gs.big_chances_away,
                           gs.goals_prevented_home, gs.goals_prevented_away,
                           gs.touches_in_opp_box_home, gs.touches_in_opp_box_away,
                           gs.corners_home, gs.corners_away
                    FROM games g
                    LEFT JOIN game_statistics gs ON gs.game_id = g.id
                    WHERE ${venueCondition}
                      AND g.is_deleted = false
                      AND g.status = 'finished'
                      AND g.date < $4
                      AND ($3::int IS NULL OR g.league_id = $3)
                    ORDER BY g.date DESC
                    LIMIT $2`;
                const { rows } = await db.query(sql, [teamId, n, leagueInternal, game.date]);
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
                    const xgAg = isHome ? xgA : xgH;
                    return {
                        outcome, gf, ga,
                        gd: gf != null && ga != null ? gf - ga : null,
                        xg_for: xgFor, xg_against: xgAg,
                        xg_diff: xgFor != null && xgAg != null ? xgFor - xgAg : null,
                        // Game statistics fields
                        possession: (isHome ? r.possession_home : r.possession_away) ?? 50,
                        shots: (isHome ? r.shots_home : r.shots_away) ?? 0,
                        shots_on_target: (isHome ? r.shots_on_target_home : r.shots_on_target_away) ?? 0,
                        big_chances: (isHome ? r.big_chances_home : r.big_chances_away) ?? 0,
                        goals_prevented: (isHome ? r.goals_prevented_home : r.goals_prevented_away) ?? 0,
                        touches_in_opp_box: (isHome ? r.touches_in_opp_box_home : r.touches_in_opp_box_away) ?? 0,
                        corners: (isHome ? r.corners_home : r.corners_away) ?? 0,
                        date: r.date,
                    };
                });
            }

            // 4) Параллельная загрузка истории обеих команд
            const [homeHistAny, homeHistHome, awayHistAny, awayHistAway] = await Promise.all([
                loadGames(game.home_team_id, 'any'),
                loadGames(game.home_team_id, 'home'),
                loadGames(game.away_team_id, 'any'),
                loadGames(game.away_team_id, 'away'),
            ]);

            // DEBUG: проверяем данные
            console.log('DEBUG loadGames homeHistHome count:', homeHistHome.length);
            if (homeHistHome.length > 0) {
                console.log('DEBUG homeHistHome[0]:', JSON.stringify(homeHistHome[0]));
            }
            
            // 5) Загружаем все 7 модулей
            const aMarkovOut  = require('../../analytics/analyzers/markov-outcome.js');
            const aMarkovSt   = require('../../analytics/analyzers/markov-state.js');
            const aShannon    = require('../../analytics/analyzers/shannon-entropy.js');
            const aInertia    = require('../../analytics/analyzers/form-inertia.js');
            const aMultipeak  = require('../../analytics/analyzers/multipeak-density.js');
            const aMC         = require('../../analytics/analyzers/monte-carlo.js');
            const pythonClient = require('../../analytics/python-client.js');
            const aPoisson     = require('../../analytics/analyzers/poisson.js');
            const aValenzetti  = require('../../analytics/analyzers/valenzetti.js');

            const leagueWeights = require('../../analytics/league-weights.js');
            const gameStatsAnalyzer = require('../../analytics/analyzers/game-stats.js');
            // 6) Прогон для home team
            // Poisson league params (will be per-league from calibration)
            const leagueAvgHome = 1.52;
            const leagueAvgAway = 1.32;
            const homeAnalyzers = {
                markov_outcome:   aMarkovOut.analyze(homeHistAny),
                markov_state:     aMarkovSt.analyze(homeHistAny),
                shannon_entropy:  aShannon.analyze(homeHistAny),
                form_inertia:     aInertia.analyze(homeHistAny),
                game_stats:      gameStatsAnalyzer.analyze(homeHistHome, 'home'),
                multipeak:        aMultipeak.analyze(homeHistAny),
                poisson:          aPoisson.analyze(homeHistAny, awayHistAny, { avgHomeGoals: leagueAvgHome, avgAwayGoals: leagueAvgAway }),
                valenzetti:        aValenzetti.analyze(homeHistAny, awayHistAny, {}),
            };
            const awayAnalyzers = {
                markov_outcome:   aMarkovOut.analyze(awayHistAny),
                markov_state:     aMarkovSt.analyze(awayHistAny),
                shannon_entropy:  aShannon.analyze(awayHistAny),
                form_inertia:     aInertia.analyze(awayHistAny),
                game_stats:      gameStatsAnalyzer.analyze(awayHistAway, 'away'),
                multipeak:        aMultipeak.analyze(awayHistAny),
                valenzetti:        aValenzetti.analyzeTeam(awayHistAny),
            };

            // 6b) HMM (async, graceful degradation)
            const [homeHmmResult, awayHmmResult] = await Promise.allSettled([
                pythonClient.getTeamAnalyzer('hmm', game.home_team_id, { nWindow: n }),
                pythonClient.getTeamAnalyzer('hmm', game.away_team_id, { nWindow: n }),
            ]);
            homeAnalyzers.hmm = homeHmmResult.status === 'fulfilled' ? homeHmmResult.value : null;
            awayAnalyzers.hmm = awayHmmResult.status === 'fulfilled' ? awayHmmResult.value : null;

            // 7) Monte Carlo betting для всех трёх исходов
            const betting = {
                home: null,
                draw: null,
                away: null,
            };
            if (game.odd_home && Number(game.odd_home) > 1) {
                betting.home = aMC.analyze({
                    games: venueFilter ? homeHistHome : homeHistAny,
                    odds: Number(game.odd_home),
                    target: 'W',
                });
            }
            if (game.odd_draw && Number(game.odd_draw) > 1) {
                // Для DRAW смотрим home команду без venue (ничья — взаимодействие)
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

            // 8) Интегральный прогноз v4 — Poisson primary + corrections
            //    Poisson (Dixon-Coles) — основной предиктор (вес 0.60)
            //    Momentum streaks — корректировка (вес 0.15)
            //    HMM hidden state — корректировка (вес 0.15)
            //    Form inertia direction — корректировка (вес 0.10)

            let predictedOutcome = 'D';
            let predictedConfidence = 0;
            const reasons = [];

            // === Poisson base probabilities ===
            const poissonResult = homeAnalyzers.poisson;
            let pHome = 0.333, pDraw = 0.333, pAway = 0.333;

            if (poissonResult && poissonResult.details && !poissonResult.details.error) {
                const probs = poissonResult.details.probabilities || {};
                pHome = probs.home || 0.333;
                pDraw = probs.draw || 0.333;
                pAway = probs.away || 0.333;

                reasons.push({
                    type: 'poisson', weight: 0.60,
                    lambda_home: poissonResult.details.lambda_home,
                    lambda_away: poissonResult.details.lambda_away,
                    p_home: pHome, p_draw: pDraw, p_away: pAway,
                    predicted_score: poissonResult.details.predicted_score,
                    home_attack: poissonResult.details.attack_defense?.home_attack,
                    away_attack: poissonResult.details.attack_defense?.away_attack,
                });
            }
  
            // === Valenzetti correction (вес 0.15) ===
            const valResult = homeAnalyzers.valenzetti;
            if (valResult && valResult.details && !valResult.details.error) {
                reasons.push({
                    type: 'valenzetti', weight: 0.15,
                    lambda_home: valResult.details?.lambda_home,
                    lambda_away: valResult.details?.lambda_away,
                    entropy: valResult.details?.entropy,
                    confidence_level: valResult.details?.confidence_level,
                    p_home: valResult.details?.probabilities?.home,
                    p_draw: valResult.details?.probabilities?.draw,
                    p_away: valResult.details?.probabilities?.away,
                });
            }

            // === Corrections (applied as adjustments to Poisson probs) ===
            // Convert to scores for adjustment
            let homeScore = pHome * 0.60;
            let drawScore = pDraw * 0.60;
            let awayScore = pAway * 0.60;

            // === Momentum (вес 0.15) ===
            const homeStreak = homeAnalyzers.markov_outcome?.details?.streak || {};
            const awayStreak = awayAnalyzers.markov_outcome?.details?.streak || {};
            if (homeStreak.current_outcome === 'W' && homeStreak.current_length >= 3) homeScore += 0.15 * 0.5;
            else if (homeStreak.current_outcome === 'L' && homeStreak.current_length >= 3) awayScore += 0.15 * 0.5;
            if (awayStreak.current_outcome === 'W' && awayStreak.current_length >= 3) awayScore += 0.15 * 0.7;
            else if (awayStreak.current_outcome === 'L' && awayStreak.current_length >= 3) homeScore += 0.15 * 0.5;
            reasons.push({
                type: 'momentum', weight: 0.15,
                home_streak: (homeStreak.current_outcome || '') + (homeStreak.current_length || 0),
                away_streak: (awayStreak.current_outcome || '') + (awayStreak.current_length || 0),
            });

            // === HMM (вес 0.15) ===
            if (homeAnalyzers.hmm && awayAnalyzers.hmm &&
                !homeAnalyzers.hmm.details?.degenerate_fit &&
                !awayAnalyzers.hmm.details?.degenerate_fit) {
                const homeExp = homeAnalyzers.hmm.details?.expected_next_level ?? 1;
                const awayExp = awayAnalyzers.hmm.details?.expected_next_level ?? 1;
                const hmmAdv = (homeExp - awayExp) / 3;
                if (hmmAdv > 0) homeScore += hmmAdv * 0.15;
                else if (hmmAdv < 0) awayScore += Math.abs(hmmAdv) * 0.15;
                if (Math.abs(hmmAdv) < 0.1) drawScore += 0.15 * 0.2;
                reasons.push({ type: 'hmm', weight: 0.15, advantage: Math.round(hmmAdv * 1000) / 1000 });
            }

            // === Form inertia direction (вес 0.10) ===
            const homeFI = homeAnalyzers.form_inertia;
            const awayFI = awayAnalyzers.form_inertia;
            if (homeFI?.details && awayFI?.details) {
                const hLag1 = homeFI.details.lag1_corr || 0;
                const aLag1 = awayFI.details.lag1_corr || 0;
                const hMean = homeFI.details.mean_value || 0;
                const aMean = awayFI.details.mean_value || 0;
                if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean > 0.3) homeScore += 0.10 * Math.min(hLag1, 1);
                else if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean < -0.3) awayScore += 0.10 * Math.min(hLag1, 1);
                if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean > 0.3) awayScore += 0.10 * Math.min(aLag1, 1);
                else if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean < -0.3) homeScore += 0.10 * Math.min(aLag1, 1);
                reasons.push({
                    type: 'form_inertia', weight: 0.10,
                    home: { trend: homeFI.details.trend, lag1: Math.round(hLag1*1000)/1000, mean: Math.round(hMean*100)/100 },
                    away: { trend: awayFI.details.trend, lag1: Math.round(aLag1*1000)/1000, mean: Math.round(aMean*100)/100 },
                });
            }
            // === Determine outcome (Poisson-based) ===
            const totalScore = homeScore + drawScore + awayScore;
            if (totalScore > 0) {
                const normH = homeScore / totalScore;
                const normD = drawScore / totalScore;
                const normA = awayScore / totalScore;
                if (normH >= normD && normH >= normA) { predictedOutcome = 'HOME'; predictedConfidence = normH; }
                else if (normA >= normD) { predictedOutcome = 'AWAY'; predictedConfidence = normA; }
                else { predictedOutcome = 'DRAW'; predictedConfidence = normD; }
            }

            return {
                success: true,
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
                        home_any: homeHistAny.length,
                        home_home: homeHistHome.length,
                        away_any: awayHistAny.length,
                        away_away: awayHistAway.length,
                    },
                    home_analyzers: homeAnalyzers,
                    away_analyzers: awayAnalyzers,
                    betting,
                    integrated_forecast: {
                        predicted_outcome: predictedOutcome,
                        confidence: predictedConfidence,
                        reasons,
                    },
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, 'integrated analyzers failed');
            return reply.code(500).send({
                success: false,
                error: 'Integrated analyzers failed',
                message: err.message,
            });
        }
    });


    // ────────────────────────────────────────────────────────────
    // GET /api/db/leagues/:id/pagerank
    //   ?season=2025      — фильтр по сезону (default = последний)
    //   ?min_team_games=5 — игнорировать команды с <N матчами
    // PageRank по графу побед: альтернативный рейтинг команд лиги.
    // ────────────────────────────────────────────────────────────
    fastify.get('/leagues/:id/pagerank', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid league id' });
            }

            const seasonRaw = request.query.season;
            const seasonQ = seasonRaw ? parseInt(seasonRaw, 10) : null;

            let minTeamGames = parseInt(request.query.min_team_games || '5', 10);
            if (!Number.isFinite(minTeamGames) || minTeamGames < 1) minTeamGames = 5;
            if (minTeamGames > 50) minTeamGames = 50;

            // Резолв лиги
            const lRes = await db.query(
                `SELECT id, sstats_id, name, country_id FROM leagues
                 WHERE sstats_id = $1 OR id = $1
                 ORDER BY (sstats_id = $1) DESC, id ASC
                 LIMIT 1`,
                [id]
            );
            if (!lRes.rows.length) {
                return reply.code(404).send({ success: false, error: 'League not found' });
            }
            const league = lRes.rows[0];

            // Определяем сезон
            let season = seasonQ;
            if (!season) {
                const sRes = await db.query(
                    `SELECT season FROM games
                     WHERE league_id = $1 AND status = 'finished' AND is_deleted = false
                     GROUP BY season
                     HAVING count(*) >= 20
                     ORDER BY season DESC
                     LIMIT 1`,
                    [league.id]
                );
                if (!sRes.rows.length) {
                    return reply.send({
                        success: true,
                        data: {
                            league: { id: league.sstats_id, name: league.name },
                            season: null,
                            value: 0,
                            confidence: 0,
                            details: { error: 'no_seasons_with_enough_matches', teams: [] },
                        },
                        source: 'live',
                    });
                }
                season = sRes.rows[0].season;
            }

            // Тянем все завершённые матчи лиги в этом сезоне
            const mRes = await db.query(
                `SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score
                 FROM games g
                 WHERE g.league_id = $1 AND g.season = $2
                   AND g.status = 'finished' AND g.is_deleted = false
                   AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL`,
                [league.id, season]
            );

            // Запуск анализатора
            const analyzer = require('../../analytics/analyzers/pagerank.js');
            const result = analyzer.analyze(mRes.rows);

            // Дозаливаем имена команд
            let teamsEnriched = [];
            if (result.details && Array.isArray(result.details.teams) && result.details.teams.length) {
                const filtered = result.details.teams.filter((t) => t.games >= minTeamGames);
                const ids = filtered.map((t) => t.team_id);
                if (ids.length) {
                    const tn = await db.query(
                        `SELECT id, sstats_id, name, logo FROM teams WHERE id = ANY($1::int[])`,
                        [ids]
                    );
                    const byId = new Map(tn.rows.map((r) => [r.id, r]));
                    teamsEnriched = filtered.map((t, i) => {
                        const meta = byId.get(t.team_id) || {};
                        return {
                            ...t,
                            rank: i + 1,
                            sstats_id: meta.sstats_id || null,
                            name: meta.name || `Team ${t.team_id}`,
                            logo: meta.logo || null,
                        };
                    });
                }
            }

            return {
                success: true,
                data: {
                    league: {
                        id: league.sstats_id,
                        internal_id: league.id,
                        name: league.name,
                    },
                    season,
                    analyzer: analyzer.name,
                    n_matches: result.details.n_matches || 0,
                    draws_skipped: result.details.draws_skipped || 0,
                    edges: result.details.edges || 0,
                    nodes: result.details.nodes || 0,
                    value: result.value,
                    confidence: result.confidence,
                    teams: teamsEnriched,
                    details_error: result.details.error || null,
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, 'pagerank analyzer failed');
            return reply.code(500).send({
                success: false,
                error: 'Analyzer pagerank failed',
                message: err.message,
            });
        }
    });


    // GET /api/db/teams/:id/analyzers/markov-outcome
    //   ?n=10..100   — окно последних матчей команды (default 20)
    //   ?league_id=X — sstats_id лиги (опционально, фильтр)
    // Анализатор Markov Match Outcome: прогноз следующего W/D/L по матрице
    // переходов 3x3, считаемой по последним N матчам.
    // ────────────────────────────────────────────────────────────
    fastify.get('/teams/:id/analyzers/markov-outcome', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid team id' });
            }

            // Окно N: clamp в [5, 100], default 20
            let n = parseInt(request.query.n || '20', 10);
            if (!Number.isFinite(n)) n = 20;
            n = Math.min(Math.max(n, 6), 100);

            // league_id из запроса = sstats_id лиги
            const leagueIdRaw = request.query.league_id;
            const leagueIdQ = leagueIdRaw ? parseInt(leagueIdRaw, 10) : null;

            // Резолв команды (sstats_id → internal id)
            const teamRes = await db.query(
                `SELECT id, sstats_id, name, logo FROM teams
                 WHERE sstats_id = $1 OR id = $1
                 ORDER BY (sstats_id = $1) DESC, id ASC
                 LIMIT 1`,
                [id]
            );
            if (!teamRes.rows.length) {
                return reply.code(404).send({ success: false, error: 'Team not found' });
            }
            const team = teamRes.rows[0];

            // Резолв лиги, если задана
            let leagueInternal = null;
            if (leagueIdQ) {
                const lr = await db.query(
                    `SELECT id FROM leagues
                     WHERE sstats_id = $1 OR id = $1
                     ORDER BY (sstats_id = $1) DESC, id ASC
                     LIMIT 1`,
                    [leagueIdQ]
                );
                if (lr.rows.length) leagueInternal = lr.rows[0].id;
            }

            // Последние N завершённых матчей (newest first)
            const sql = `
                SELECT g.id, g.date,
                       g.home_team_id, g.away_team_id,
                       g.home_score, g.away_score
                FROM games g
                WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
                  AND g.is_deleted = false
                  AND g.status = 'finished'
                  AND ($3::int IS NULL OR g.league_id = $3)
                ORDER BY g.date DESC
                LIMIT $2`;
            const { rows } = await db.query(sql, [team.id, n, leagueInternal]);

            // Преобразуем в формат, который ждёт анализатор
            const gamesForAnalyzer = rows.map((r) => {
                const isHome = r.home_team_id === team.id;
                const gf = isHome ? r.home_score : r.away_score;
                const ga = isHome ? r.away_score : r.home_score;
                let outcome = null;
                if (gf != null && ga != null) {
                    if (gf > ga) outcome = 'W';
                    else if (gf < ga) outcome = 'L';
                    else outcome = 'D';
                }
                return { outcome, date: r.date };
            });

            // Запуск анализатора
            const analyzer = require('../../analytics/analyzers/markov-outcome.js');
            const result = analyzer.analyze(gamesForAnalyzer);

            return {
                success: true,
                data: {
                    team: {
                        id: team.sstats_id,
                        internal_id: team.id,
                        name: team.name,
                        logo: team.logo,
                    },
                    analyzer: analyzer.name,
                    n_window: n,
                    games_used: gamesForAnalyzer.length,
                    league_filter: leagueInternal,
                    value: result.value,
                    confidence: result.confidence,
                    details: result.details,
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, 'markov-outcome analyzer failed');
            return reply.code(500).send({
                success: false,
                error: 'Analyzer failed',
                message: err.message,
            });
        }
    });

    // ────────────────────────────────────────────────────────────
    // GET /api/db/games/:id/analyzers/monte-carlo
    //   ?side=home|away|draw  — на какой исход считать edge (default home)
    //   ?n=10..100            — окно команды (default 20)
    //   ?league_id=X          — фильтр (опц.)
    //   ?odds=X.XX            — переопределить коэф из БД (опц., для what-if)
    // Анализатор: edge per bet = posterior_p × odds - 1, Half-Kelly, 50-bet MC.
    // ────────────────────────────────────────────────────────────
    fastify.get('/games/:id/analyzers/monte-carlo', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid game id' });
            }

            const sideRaw = (request.query.side || 'home').toLowerCase();
            if (!['home', 'away', 'draw'].includes(sideRaw)) {
                return reply.code(400).send({ success: false, error: 'side must be home|away|draw' });
            }

            const venueRaw = (request.query.venue || 'any').toLowerCase();
            if (!['any', 'home', 'away'].includes(venueRaw)) {
                return reply.code(400).send({ success: false, error: 'venue must be any|home|away' });
            }

            let n = parseInt(request.query.n || '20', 10);
            if (!Number.isFinite(n)) n = 20;
            n = Math.min(Math.max(n, 6), 100);

            const leagueIdRaw = request.query.league_id;
            const leagueIdQ = leagueIdRaw ? parseInt(leagueIdRaw, 10) : null;

            const oddsOverrideRaw = request.query.odds;
            const oddsOverride = oddsOverrideRaw ? parseFloat(oddsOverrideRaw) : null;

            // Резолв матча + получение odds_data
            const gRes = await db.query(
                `SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id,
                        g.league_id, g.status, g.home_score, g.away_score,
                        g.date, g.odds_data,
                        ht.sstats_id AS home_sstats_id, ht.name AS home_name, ht.logo AS home_logo,
                        at.sstats_id AS away_sstats_id, at.name AS away_name, at.logo AS away_logo,
                        (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Home").value')::text)::numeric AS odd_home,
                        (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Draw").value')::text)::numeric AS odd_draw,
                        (jsonb_path_query_first(g.odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Away").value')::text)::numeric AS odd_away
                 FROM games g
                 LEFT JOIN teams ht ON ht.id = g.home_team_id
                 LEFT JOIN teams at ON at.id = g.away_team_id
                 WHERE g.sstats_id = $1 OR g.id = $1
                 ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
                 LIMIT 1`,
                [id]
            );
            if (!gRes.rows.length) {
                return reply.code(404).send({ success: false, error: 'Game not found' });
            }
            const game = gRes.rows[0];

            // Выбираем команду и target
            let teamInternalId, teamSstatsId, teamName, oddsFromDb, target;
            if (sideRaw === 'home') {
                teamInternalId = game.home_team_id;
                teamSstatsId = game.home_sstats_id;
                teamName = game.home_name;
                oddsFromDb = game.odd_home != null ? Number(game.odd_home) : null;
                target = 'W';  // home команда выигрывает = её W
            } else if (sideRaw === 'away') {
                teamInternalId = game.away_team_id;
                teamSstatsId = game.away_sstats_id;
                teamName = game.away_name;
                oddsFromDb = game.odd_away != null ? Number(game.odd_away) : null;
                target = 'W';  // away команда выигрывает = её W
            } else { // draw
                teamInternalId = game.home_team_id;  // ничью считаем с позиции домашних
                teamSstatsId = game.home_sstats_id;
                teamName = game.home_name + ' (DRAW)';
                oddsFromDb = game.odd_draw != null ? Number(game.odd_draw) : null;
                target = 'D';
            }

            const odds = oddsOverride || oddsFromDb;
            if (!odds || odds <= 1) {
                return reply.code(400).send({
                    success: false,
                    error: 'No valid odds available',
                    details: { side: sideRaw, odds_from_db: oddsFromDb, odds_override: oddsOverride },
                });
            }

            // Резолв league filter (если задан)
            let leagueInternal = null;
            if (leagueIdQ) {
                const lr = await db.query(
                    `SELECT id FROM leagues
                     WHERE sstats_id = $1 OR id = $1
                     ORDER BY (sstats_id = $1) DESC, id ASC
                     LIMIT 1`,
                    [leagueIdQ]
                );
                if (lr.rows.length) leagueInternal = lr.rows[0].id;
            }

            // Загрузка истории команды (берём матчи ДО даты текущей игры, чтобы не было ликажа)
            // venue filter: any | home (only home matches of team) | away (only away)
            let venueCondition = '(g.home_team_id = $1 OR g.away_team_id = $1)';
            if (venueRaw === 'home') venueCondition = 'g.home_team_id = $1';
            else if (venueRaw === 'away') venueCondition = 'g.away_team_id = $1';

            const histSql = `
                SELECT g.id, g.date,
                       g.home_team_id, g.away_team_id,
                       g.home_score, g.away_score
                FROM games g
                WHERE ${venueCondition}
                  AND g.is_deleted = false
                  AND g.status = 'finished'
                  AND g.date < $4
                  AND ($3::int IS NULL OR g.league_id = $3)
                ORDER BY g.date DESC
                LIMIT $2`;
            const { rows: hist } = await db.query(histSql, [teamInternalId, n, leagueInternal, game.date]);

            const gamesForAnalyzer = hist.map((r) => {
                const isHome = r.home_team_id === teamInternalId;
                const gf = isHome ? r.home_score : r.away_score;
                const ga = isHome ? r.away_score : r.home_score;
                let outcome = null;
                if (gf != null && ga != null) {
                    if (gf > ga) outcome = 'W';
                    else if (gf < ga) outcome = 'L';
                    else outcome = 'D';
                }
                return { outcome, date: r.date };
            });

            const analyzer = require('../../analytics/analyzers/monte-carlo.js');
            const result = analyzer.analyze({
                games: gamesForAnalyzer,
                odds,
                target,
            });

            return {
                success: true,
                data: {
                    game: {
                        id: game.sstats_id,
                        internal_id: game.id,
                        date: game.date,
                        status: game.status,
                        home: { id: game.home_sstats_id, name: game.home_name, logo: game.home_logo },
                        away: { id: game.away_sstats_id, name: game.away_name, logo: game.away_logo },
                    },
                    odds_used: {
                        home: game.odd_home != null ? Number(game.odd_home) : null,
                        draw: game.odd_draw != null ? Number(game.odd_draw) : null,
                        away: game.odd_away != null ? Number(game.odd_away) : null,
                        selected: odds,
                        source: oddsOverride ? 'override' : 'db',
                    },
                    side: sideRaw,
                    venue: venueRaw,
                    target,
                    team: { id: teamSstatsId, internal_id: teamInternalId, name: teamName },
                    analyzer: analyzer.name,
                    n_window: n,
                    games_used: gamesForAnalyzer.length,
                    league_filter: leagueInternal,
                    value: result.value,
                    confidence: result.confidence,
                    details: result.details,
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, 'monte-carlo analyzer failed');
            return reply.code(500).send({
                success: false,
                error: 'Analyzer monte-carlo failed',
                message: err.message,
            });
        }
    });

        // GET /api/db/games/:id/profitability — ROI обеих команд из team_profitability_cache
    fastify.get('/games/:id/profitability', async (request, reply) => {
      try {
        const idRaw = request.params.id;
        const id = parseInt(idRaw, 10);
        if (!Number.isFinite(id) || id <= 0) {
          return reply.code(400).send({ success: false, error: 'Invalid game id' });
        }

        // Резолвим home_team_id / away_team_id по sstats_id (или внутреннему id)
        const gameSql = `
          SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id,
                 ht.name AS home_name, at.name AS away_name,
                 ht.logo AS home_logo, at.logo AS away_logo
          FROM games g
          LEFT JOIN teams ht ON ht.id = g.home_team_id
          LEFT JOIN teams at ON at.id = g.away_team_id
          WHERE g.sstats_id = $1 OR g.id = $1
           ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
           LIMIT 1`;
        const gRes = await db.query(gameSql, [id]);
        if (!gRes.rows || !gRes.rows.length) {
          return reply.code(404).send({ success: false, error: 'Game not found' });
        }
        const game = gRes.rows[0];

        const rowsSql = `
          SELECT team_id, market, period_n, roi, sample_size, profit_total, updated_at
          FROM team_profitability_cache
          WHERE team_id IN ($1, $2)
          ORDER BY team_id, market, period_n`;
        const pRes = await db.query(rowsSql, [game.home_team_id, game.away_team_id]);

        // Группируем: { [teamId]: { [market]: { p10, p20, p50 } } }
        const byTeam = { [game.home_team_id]: {}, [game.away_team_id]: {} };
        for (const r of (pRes.rows || [])) {
          const t = r.team_id;
          if (!byTeam[t][r.market]) byTeam[t][r.market] = {};
          byTeam[t][r.market]['p' + r.period_n] = {
            roi: r.roi !== null ? Number(r.roi) : null,
            sample_size: r.sample_size,
            profit_total: r.profit_total !== null ? Number(r.profit_total) : null
          };
        }

        const lastUpdated = (pRes.rows || []).reduce(
          (acc, r) => (r.updated_at > acc ? r.updated_at : acc),
          null
        );

        return {
          success: true,
          source: 'db',
          data: {
            game: {
              id: game.id,
              sstats_id: game.sstats_id,
              home: { id: game.home_team_id, name: game.home_name, logo: game.home_logo },
              away: { id: game.away_team_id, name: game.away_name, logo: game.away_logo }
            },
            home_profitability: byTeam[game.home_team_id] || {},
            away_profitability: byTeam[game.away_team_id] || {},
            markets: ['win', 'draw', 'loss', 'winOrDraw', 'winOrLoss', 'drawOrLoss', 'dnb', 'over25', 'under25'],
            periods: [10, 20, 50],
            updated_at: lastUpdated
          }
        };
      } catch (err) {
        request.log.error({ err }, 'profitability route failed');
        return reply.code(500).send({ success: false, error: err.message });
      }
    });

        // GET /api/db/games/:id/profitability-live — live ROI для произвольного N и опционально по лиге матча
    fastify.get('/games/:id/profitability-live', async (request, reply) => {
      try {
        const idRaw = request.params.id;
        const id = parseInt(idRaw, 10);
        if (!Number.isFinite(id) || id <= 0) {
          return reply.code(400).send({ success: false, error: 'Invalid game id' });
        }
        const n = Math.min(Math.max(parseInt(request.query.n || '20', 10), 5), 50);
        const onlyLeague = String(request.query.only_league || '').toLowerCase() === 'true';

        // Резолвим матч → home/away/league
        const gRes = await db.query(
          `SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, g.league_id,
                  ht.name AS home_name, at.name AS away_name,
                  l.name AS league_name, l.sstats_id AS league_sstats_id
           FROM games g
           LEFT JOIN teams ht ON ht.id = g.home_team_id
           LEFT JOIN teams at ON at.id = g.away_team_id
           LEFT JOIN leagues l ON l.id = g.league_id
           WHERE g.sstats_id = $1 OR g.id = $1
           ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
           LIMIT 1`, [id]
        );
        if (!gRes.rows.length) return reply.code(404).send({ success: false, error: 'Game not found' });
        const game = gRes.rows[0];
        const leagueFilter = onlyLeague ? game.league_id : null;

        // Один SQL для обеих команд × 9 рынков × произвольного N
        const sql = `
          WITH params(team_id, league_id, n) AS (VALUES ($1::int, $3::int, $4::int), ($2::int, $3::int, $4::int)),
          team_games_raw AS (
            SELECT p.team_id, 'home'::text AS side, g.date,
                   g.home_score, g.away_score, g.odds_data
            FROM games g JOIN params p ON g.home_team_id = p.team_id
            WHERE g.status='finished' AND g.odds_data IS NOT NULL
              AND g.home_score IS NOT NULL AND g.is_deleted=false
              AND (p.league_id IS NULL OR g.league_id = p.league_id)
            UNION ALL
            SELECT p.team_id, 'away'::text, g.date, g.home_score, g.away_score, g.odds_data
            FROM games g JOIN params p ON g.away_team_id = p.team_id
            WHERE g.status='finished' AND g.odds_data IS NOT NULL
              AND g.home_score IS NOT NULL AND g.is_deleted=false
              AND (p.league_id IS NULL OR g.league_id = p.league_id)
          ),
          ordered AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY date DESC) AS rn
            FROM team_games_raw
          ),
          recent AS (SELECT o.* FROM ordered o JOIN params p ON o.team_id=p.team_id WHERE o.rn <= p.n),
          with_odds AS (
            SELECT team_id, side, rn, home_score, away_score,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Home").value')::text)::numeric,0) AS o_home,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Draw").value')::text)::numeric,0) AS o_draw,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 1).odds[*] ? (@.name == "Away").value')::text)::numeric,0) AS o_away,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 2).odds[*] ? (@.name == "Home").value')::text)::numeric,0) AS o_dnb_home,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 2).odds[*] ? (@.name == "Away").value')::text)::numeric,0) AS o_dnb_away,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Home/Draw").value')::text)::numeric,0) AS o_homedraw,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Home/Away").value')::text)::numeric,0) AS o_homeaway,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 12).odds[*] ? (@.name == "Draw/Away").value')::text)::numeric,0) AS o_drawaway,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Over 2.5").value')::text)::numeric,0) AS o_over25,
              NULLIF((jsonb_path_query_first(odds_data,'$[*] ? (@.marketId == 5).odds[*] ? (@.name == "Under 2.5").value')::text)::numeric,0) AS o_under25
            FROM recent
          ),
          profits AS (
            SELECT team_id, rn,
              CASE WHEN side='home' AND home_score>away_score THEN o_home-1
                   WHEN side='away' AND away_score>home_score THEN o_away-1
                   WHEN (side='home' AND o_home IS NOT NULL) OR (side='away' AND o_away IS NOT NULL) THEN -1 END AS p_win,
              CASE WHEN home_score=away_score THEN o_draw-1 WHEN o_draw IS NOT NULL THEN -1 END AS p_draw,
              CASE WHEN side='home' AND home_score<away_score THEN o_away-1
                   WHEN side='away' AND away_score<home_score THEN o_home-1
                   WHEN (side='home' AND o_away IS NOT NULL) OR (side='away' AND o_home IS NOT NULL) THEN -1 END AS p_loss,
              CASE WHEN side='home' AND home_score>=away_score THEN o_homedraw-1
                   WHEN side='away' AND away_score>=home_score THEN o_drawaway-1
                   WHEN (side='home' AND o_homedraw IS NOT NULL) OR (side='away' AND o_drawaway IS NOT NULL) THEN -1 END AS p_windraw,
              CASE WHEN home_score!=away_score THEN o_homeaway-1 WHEN o_homeaway IS NOT NULL THEN -1 END AS p_winloss,
              CASE WHEN side='home' AND home_score<=away_score THEN o_drawaway-1
                   WHEN side='away' AND away_score<=home_score THEN o_homedraw-1
                   WHEN (side='home' AND o_drawaway IS NOT NULL) OR (side='away' AND o_homedraw IS NOT NULL) THEN -1 END AS p_drawloss,
              CASE WHEN home_score=away_score THEN 0
                   WHEN side='home' AND home_score>away_score THEN o_dnb_home-1
                   WHEN side='away' AND away_score>home_score THEN o_dnb_away-1
                   WHEN (side='home' AND o_dnb_home IS NOT NULL) OR (side='away' AND o_dnb_away IS NOT NULL) THEN -1 END AS p_dnb,
              CASE WHEN (home_score+away_score)>2 THEN o_over25-1 WHEN o_over25 IS NOT NULL THEN -1 END AS p_over25,
              CASE WHEN (home_score+away_score)<=2 THEN o_under25-1 WHEN o_under25 IS NOT NULL THEN -1 END AS p_under25
            FROM with_odds
          ),
          flat AS (
            SELECT team_id, rn, 'win' AS market, p_win AS profit FROM profits WHERE p_win IS NOT NULL UNION ALL
            SELECT team_id, rn, 'draw', p_draw FROM profits WHERE p_draw IS NOT NULL UNION ALL
            SELECT team_id, rn, 'loss', p_loss FROM profits WHERE p_loss IS NOT NULL UNION ALL
            SELECT team_id, rn, 'winOrDraw', p_windraw FROM profits WHERE p_windraw IS NOT NULL UNION ALL
            SELECT team_id, rn, 'winOrLoss', p_winloss FROM profits WHERE p_winloss IS NOT NULL UNION ALL
            SELECT team_id, rn, 'drawOrLoss', p_drawloss FROM profits WHERE p_drawloss IS NOT NULL UNION ALL
            SELECT team_id, rn, 'dnb', p_dnb FROM profits WHERE p_dnb IS NOT NULL UNION ALL
            SELECT team_id, rn, 'over25', p_over25 FROM profits WHERE p_over25 IS NOT NULL UNION ALL
            SELECT team_id, rn, 'under25', p_under25 FROM profits WHERE p_under25 IS NOT NULL
          )
          SELECT team_id, market,
                 ROUND(AVG(profit)::numeric, 4) AS roi,
                 COUNT(*)::int AS sample_size,
                 ROUND(SUM(profit)::numeric, 3) AS profit_total,
                 -- series: массив отдельных профитов по матчам (от свежих к старым)
                 jsonb_agg(ROUND(profit::numeric, 3) ORDER BY rn DESC) AS series_raw
          FROM flat GROUP BY team_id, market
          HAVING COUNT(*) >= 3
          ORDER BY team_id, market`;

        const result = await db.query(sql, [game.home_team_id, game.away_team_id, leagueFilter, n]);

        const byTeam = { [game.home_team_id]: {}, [game.away_team_id]: {} };
        for (const r of result.rows) {
          // series — массив отдельных профитов, от старых к новым (для нарастающего графика)
          const rawSeries = Array.isArray(r.series_raw) ? r.series_raw.slice().reverse() : [];
          // Кумулятивный профит (нарастающий итог) для отрисовки линии
          let acc = 0;
          const cumSeries = rawSeries.map(v => { acc += Number(v) || 0; return Math.round(acc * 1000) / 1000; });
          byTeam[r.team_id][r.market] = {
            roi: r.roi !== null ? Number(r.roi) : null,
            sample_size: r.sample_size,
            profit_total: r.profit_total !== null ? Number(r.profit_total) : null,
            series: cumSeries
          };
        }

        return {
          success: true,
          source: 'db-live',
          data: {
            game: {
              id: game.id,
              sstats_id: game.sstats_id,
              home: { id: game.home_team_id, name: game.home_name },
              away: { id: game.away_team_id, name: game.away_name },
              league: { id: game.league_id, sstats_id: game.league_sstats_id, name: game.league_name }
            },
            params: { n, only_league: onlyLeague },
            home_profitability: byTeam[game.home_team_id] || {},
            away_profitability: byTeam[game.away_team_id] || {},
            markets: ['win', 'draw', 'loss', 'winOrDraw', 'winOrLoss', 'drawOrLoss', 'dnb', 'over25', 'under25']
          }
        };
      } catch (err) {
        request.log.error({ err }, 'profitability-live route failed');
        return reply.code(500).send({ success: false, error: err.message });
      }
    });

    // ============================================================
    // ЭТАП 12: Predictions log — stats & list
    // ============================================================

    /**
     * GET /api/db/teams/:id/analyzers/hmm
     *
     * Этап 13: прокси к Python-сервису rolgi-analytics (HMM анализатор).
     * Graceful degradation: если Python-сервис недоступен → 503 с понятной ошибкой.
     *
     * Query:
     *   n          int 15..100 (default 30; HMM требует больше истории чем JS-анализаторы)
     *   league_id  int (опц.; sstats_id или internal id лиги)
     *   venue      any|home|away (default any)
     *   no_cache   true|false (default false; обход кэша для отладки)
     *   n_states   int 2..8 (опц.; кастомное число скрытых состояний)
     */
    fastify.get('/teams/:id/analyzers/hmm', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid team id' });
            }

            let n = parseInt(request.query.n || '30', 10);
            if (!Number.isFinite(n)) n = 30;
            n = Math.min(Math.max(n, 15), 100);

            const leagueIdQ = request.query.league_id ? parseInt(request.query.league_id, 10) : null;
            const venue = String(request.query.venue || 'any');
            const noCache = request.query.no_cache === 'true';
            const nStates = request.query.n_states ? parseInt(request.query.n_states, 10) : null;

            // Краткая мета о команде из локальной БД (имя/logo для UI) — этот же резолв
            // делает и Python, но нам нужно вернуть meta даже если Python вернёт null.
            const tRes = await db.query(
                `SELECT id, sstats_id, name, short_name, logo
                 FROM teams
                 WHERE sstats_id = $1 OR id = $1
                 ORDER BY (sstats_id = $1) DESC, id ASC LIMIT 1`,
                [id]
            );
            if (!tRes.rows.length) {
                return reply.code(404).send({ success: false, error: 'Team not found' });
            }
            const team = tRes.rows[0];

            const pythonClient = require('../../analytics/python-client.js');
            const extra = {};
            if (nStates) extra.n_states = nStates;

            const result = await pythonClient.getTeamAnalyzer('hmm', id, {
                nWindow: n,
                leagueId: leagueIdQ || undefined,
                venue,
                noCache,
                extra,
            });

            if (result === null) {
                // Python недоступен ИЛИ команда не имеет данных в Python (но мы её нашли локально)
                // Различаем эти случаи через circuit breaker state.
                const cbState = pythonClient.getCircuitState();
                if (cbState.is_open) {
                    return reply.code(503).send({
                        success: false,
                        error: 'Analytics service unavailable',
                        circuit_breaker: cbState,
                    });
                }
                // 404 / no data — возвращаем 200 с data:null, как и остальные predictions-эндпоинты
                return {
                    success: true,
                    data: null,
                    source: 'live',
                    team: { id: team.sstats_id, internal_id: team.id, name: team.name, logo: team.logo },
                    note: 'analyzer returned no result (possibly insufficient history)',
                };
            }

            return {
                success: true,
                data: result,
                source: 'live',
                team: { id: team.sstats_id, internal_id: team.id, name: team.name, logo: team.logo },
            };
        } catch (err) {
            request.log.error({ err }, '/teams/:id/analyzers/hmm failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    /**
     * GET /api/db/games/:id/prediction
     *
     * Возвращает последний прогноз модели для конкретного матча (если он был
     * записан до начала игры). Поведение:
     *   - если запись есть → success:true, data:{...} с полями prediction + actual (если уже сверено)
     *   - если записи нет  → success:true, data:null
     */
    fastify.get('/games/:id/prediction', async (request, reply) => {
        try {
            const idRaw = request.params.id;
            const id = parseInt(idRaw, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return reply.code(400).send({ success: false, error: 'Invalid game id' });
            }

            // Резолв матча для получения internal id (берём самый свежий)
            const gr = await db.query(
                `SELECT g.id, g.sstats_id
                 FROM games g
                 WHERE g.sstats_id = $1 OR g.id = $1
                 ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
                 LIMIT 1`,
                [id]
            );
            if (!gr.rows.length) {
                return reply.code(404).send({ success: false, error: 'Game not found' });
            }
            const internalId = gr.rows[0].id;

            // Берём самую свежую запись (если их несколько — например, разные n_window)
            const pr = await db.query(
                `SELECT pl.id, pl.game_id, pl.game_sstats_id, pl.game_date,
                        pl.predicted_at, pl.n_window, pl.league_filter, pl.venue_filter,
                        pl.predicted_outcome, pl.confidence,
                        pl.home_score_pred, pl.draw_score_pred, pl.away_score_pred,
                        pl.home_markov_pred, pl.home_markov_prob,
                        pl.away_markov_pred, pl.away_markov_prob,
                        pl.betting_edges, pl.betting_recs, pl.odds_snapshot,
                        pl.actual_outcome, pl.actual_home_score, pl.actual_away_score,
                        pl.is_hit, pl.brier_component, pl.verified_at
                 FROM predictions_log pl
                 WHERE pl.game_id = $1
                   AND pl.predicted_outcome IN ('HOME','DRAW','AWAY')
                 ORDER BY pl.predicted_at DESC
                 LIMIT 1`,
                [internalId]
            );

            if (!pr.rows.length) {
                return { success: true, data: null, source: 'live' };
            }

            const r = pr.rows[0];
            return {
                success: true,
                data: {
                    id: r.id,
                    game_id: r.game_id,
                    game_sstats_id: r.game_sstats_id,
                    game_date: r.game_date,
                    predicted_at: r.predicted_at,
                    config: {
                        n_window: r.n_window,
                        league_filter: r.league_filter,
                        venue_filter: r.venue_filter,
                    },
                    predicted_outcome: r.predicted_outcome,
                    confidence: r.confidence != null ? Number(r.confidence) : null,
                    scores_pred: {
                        home: r.home_score_pred != null ? Number(r.home_score_pred) : null,
                        draw: r.draw_score_pred != null ? Number(r.draw_score_pred) : null,
                        away: r.away_score_pred != null ? Number(r.away_score_pred) : null,
                    },
                    markov: {
                        home: r.home_markov_pred ? { prediction: r.home_markov_pred, probability: r.home_markov_prob != null ? Number(r.home_markov_prob) : null } : null,
                        away: r.away_markov_pred ? { prediction: r.away_markov_pred, probability: r.away_markov_prob != null ? Number(r.away_markov_prob) : null } : null,
                    },
                    betting: {
                        edges: r.betting_edges,
                        recs:  r.betting_recs,
                        odds:  r.odds_snapshot,
                    },
                    actual: r.actual_outcome ? {
                        outcome:    r.actual_outcome,
                        home_score: r.actual_home_score,
                        away_score: r.actual_away_score,
                        is_hit:     r.is_hit,
                        brier_component: r.brier_component != null ? Number(r.brier_component) : null,
                        verified_at: r.verified_at,
                    } : null,
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, '/games/:id/prediction failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    /**
     * GET /api/db/predictions/stats
     *   ?range=7d|30d|90d|all   (default 30d)
     *   ?league_id=X            (опц.)
     *   ?only_verified=true     (default true; учитывать только сверённые прогнозы)
     *
     * Возвращает агрегаты: total / hits / accuracy / by_outcome / avg_confidence / brier_score.
     */
    fastify.get('/predictions/stats', async (request, reply) => {
        try {
            const range = String(request.query.range || '30d');
            const leagueIdQ = request.query.league_id ? parseInt(request.query.league_id, 10) : null;
            const onlyVerified = request.query.only_verified !== 'false';
            const strategyId = request.query.strategyId || null;

            // Резолв интервала
            let intervalSql = "INTERVAL '30 days'";
            if (range === '7d') intervalSql = "INTERVAL '7 days'";
            else if (range === '90d') intervalSql = "INTERVAL '90 days'";
            else if (range === 'all') intervalSql = null;

            // Резолв leagueId
            let leagueInternal = null;
            if (leagueIdQ) {
                const lr = await db.query(
                    `SELECT id FROM leagues
                     WHERE sstats_id = $1 OR id = $1
                     ORDER BY (sstats_id = $1) DESC, id ASC LIMIT 1`,
                    [leagueIdQ]
                );
                if (lr.rows.length) leagueInternal = lr.rows[0].id;
            }

            const params = [];
            const where = [];

            if (strategyId) {
                // ─── Режим: стратегия ─── Query strategy_predictions
                where.push("sp.predicted_outcome IN ('HOME','DRAW','AWAY')");
                where.push('sp.strategy_id = $' + (params.length + 1));
                params.push(strategyId);

                if (intervalSql) where.push(`g.date >= now() - ${intervalSql}`);
                if (leagueInternal) {
                    params.push(leagueInternal);
                    where.push(`g.league_id = $${params.length}`);
                }
                if (onlyVerified) where.push('sp.actual_outcome IS NOT NULL');

                const whereSql = 'WHERE ' + where.join(' AND ');
                const joinSql = 'FROM strategy_predictions sp JOIN games g ON g.id = sp.game_id';

                const agg = await db.query(`
                    SELECT
                        count(*) AS total,
                        count(*) FILTER (WHERE sp.is_hit IS TRUE) AS hits,
                        count(*) FILTER (WHERE sp.actual_outcome IS NOT NULL) AS verified,
                        count(*) FILTER (WHERE sp.actual_outcome IS NULL) AS pending,
                        avg(sp.confidence) FILTER (WHERE sp.actual_outcome IS NOT NULL) AS avg_confidence,
                        null::numeric AS brier_mean
                    ${joinSql}
                    ${whereSql}
                `, params);

                const byPred = await db.query(`
                    SELECT sp.predicted_outcome, count(*) AS n,
                           count(*) FILTER (WHERE sp.is_hit IS TRUE) AS hits
                    ${joinSql}
                    ${whereSql}
                    GROUP BY sp.predicted_outcome
                `, params);

                const byActual = await db.query(`
                    SELECT sp.actual_outcome, count(*) AS n
                    ${joinSql}
                    ${whereSql} AND sp.actual_outcome IS NOT NULL
                    GROUP BY sp.actual_outcome
                `, params);

                const a = agg.rows[0];
                const total    = Number(a.total) || 0;
                const hits     = Number(a.hits) || 0;
                const verified = Number(a.verified) || 0;
                const pending  = Number(a.pending) || 0;
                const accuracy = verified > 0 ? hits / verified : null;
                const avgConf  = a.avg_confidence != null ? Number(a.avg_confidence) : null;

                const outcomes = ['HOME', 'DRAW', 'AWAY'];
                const byOutcome = {};
                outcomes.forEach(o => {
                    const p = byPred.rows.find(r => r.predicted_outcome === o);
                    const ac = byActual.rows.find(r => r.actual_outcome === o);
                    byOutcome[o] = {
                        predicted: p ? Number(p.n) : 0,
                        hits:      p ? Number(p.hits) : 0,
                        actual:    ac ? Number(ac.n) : 0,
                    };
                });

                return {
                    success: true,
                    data: {
                        range, strategy_id: strategyId, league_id: leagueInternal,
                        only_verified: onlyVerified,
                        total, verified, pending, hits, accuracy,
                        avg_confidence: avgConf,
                        brier_score: null,
                        by_outcome: byOutcome,
                        baselines: {
                            random: 1 / 3,
                            always_home: 0.46,
                            brier_random: 2 / 3,
                        },
                    },
                    source: 'strategy',
                };
            }

            // ─── Режим: глобальные прогнозы (predictions_log) ───
            where.push("predicted_outcome IN ('HOME','DRAW','AWAY')");
            if (intervalSql) where.push(`game_date >= now() - ${intervalSql}`);
            if (leagueInternal) {
                params.push(leagueInternal);
                where.push(`league_id = $${params.length}`);
            }
            if (onlyVerified) where.push('actual_outcome IS NOT NULL');

            const whereSql = 'WHERE ' + where.join(' AND ');

            const agg = await db.query(`
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE is_hit IS TRUE) AS hits,
                    count(*) FILTER (WHERE actual_outcome IS NOT NULL) AS verified,
                    count(*) FILTER (WHERE actual_outcome IS NULL) AS pending,
                    avg(confidence) FILTER (WHERE actual_outcome IS NOT NULL) AS avg_confidence,
                    avg(brier_component) FILTER (WHERE brier_component IS NOT NULL) AS brier_mean
                FROM predictions_log
                ${whereSql}
            `, params);

            const byPred = await db.query(`
                SELECT predicted_outcome, count(*) AS n,
                       count(*) FILTER (WHERE is_hit IS TRUE) AS hits
                FROM predictions_log
                ${whereSql}
                GROUP BY predicted_outcome
            `, params);
            const byActual = await db.query(`
                SELECT actual_outcome, count(*) AS n
                FROM predictions_log
                ${whereSql} AND actual_outcome IS NOT NULL
                GROUP BY actual_outcome
            `, params);

            const a = agg.rows[0];
            const total    = Number(a.total) || 0;
            const hits     = Number(a.hits) || 0;
            const verified = Number(a.verified) || 0;
            const pending  = Number(a.pending) || 0;
            const accuracy = verified > 0 ? hits / verified : null;
            const avgConf  = a.avg_confidence != null ? Number(a.avg_confidence) : null;
            const brier    = a.brier_mean != null ? Number(a.brier_mean) : null;

            const outcomes = ['HOME', 'DRAW', 'AWAY'];
            const byOutcome = {};
            outcomes.forEach(o => {
                const p = byPred.rows.find(r => r.predicted_outcome === o);
                const ac = byActual.rows.find(r => r.actual_outcome === o);
                byOutcome[o] = {
                    predicted: p ? Number(p.n) : 0,
                    hits:      p ? Number(p.hits) : 0,
                    actual:    ac ? Number(ac.n) : 0,
                };
            });

            return {
                success: true,
                data: {
                    range, league_id: leagueInternal,
                    only_verified: onlyVerified,
                    total, verified, pending, hits, accuracy,
                    avg_confidence: avgConf,
                    brier_score: brier,
                    by_outcome: byOutcome,
                    baselines: {
                        random: 1 / 3,
                        always_home: 0.46,
                        brier_random: 2 / 3,
                    },
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, '/predictions/stats failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });

    /**
     * GET /api/db/predictions/list
     *   ?range=7d|30d|90d|all   (default 30d)
     *   ?league_id=X            (опц.)
     *   ?status=verified|pending|all  (default all)
     *   ?outcome=HOME|DRAW|AWAY (фильтр по predicted_outcome, опц.)
     *   ?hit=true|false         (фильтр по is_hit, только для verified)
     *   ?limit=N                (default 50, max 500)
     *   ?offset=N               (default 0)
     *
     * Возвращает: список прогнозов с join'ом названий команд и лиги, сортировка по game_date DESC.
     */
    fastify.get('/predictions/list', async (request, reply) => {
        try {
            const range    = String(request.query.range || '30d');
            const leagueIdQ = request.query.league_id ? parseInt(request.query.league_id, 10) : null;
            const status   = String(request.query.status || 'all');
            const outcome  = request.query.outcome ? String(request.query.outcome).toUpperCase() : null;
            const hitFilter = request.query.hit;
            const strategyId = request.query.strategyId || null;
            let limit  = parseInt(request.query.limit || '50', 10);
            if (!Number.isFinite(limit)) limit = 50;
            limit = Math.min(Math.max(limit, 1), 500);
            let offset = parseInt(request.query.offset || '0', 10);
            if (!Number.isFinite(offset) || offset < 0) offset = 0;

            let intervalSql = "INTERVAL '30 days'";
            if (range === '7d') intervalSql = "INTERVAL '7 days'";
            else if (range === '90d') intervalSql = "INTERVAL '90 days'";
            else if (range === 'all') intervalSql = null;

            let leagueInternal = null;
            if (leagueIdQ) {
                const lr = await db.query(
                    `SELECT id FROM leagues
                     WHERE sstats_id = $1 OR id = $1
                     ORDER BY (sstats_id = $1) DESC, id ASC LIMIT 1`,
                    [leagueIdQ]
                );
                if (lr.rows.length) leagueInternal = lr.rows[0].id;
            }

            if (strategyId) {
                // ─── Режим: стратегия ───
                const where = ["sp.predicted_outcome IN ('HOME','DRAW','AWAY')"];
                const params = [strategyId];
                where.push(`sp.strategy_id = $1`);

                if (intervalSql) where.push(`g.date >= now() - ${intervalSql}`);
                if (leagueInternal) {
                    params.push(leagueInternal);
                    where.push(`g.league_id = $${params.length}`);
                }
                if (status === 'verified') where.push('sp.actual_outcome IS NOT NULL');
                else if (status === 'pending') where.push('sp.actual_outcome IS NULL');
                if (outcome && ['HOME', 'DRAW', 'AWAY'].includes(outcome)) {
                    params.push(outcome);
                    where.push(`sp.predicted_outcome = $${params.length}`);
                }
                if (hitFilter === 'true')  where.push('sp.is_hit IS TRUE');
                if (hitFilter === 'false') where.push('sp.is_hit IS FALSE');

                const whereSql = 'WHERE ' + where.join(' AND ');

                params.push(limit, offset);
                const lidx = params.length - 1; // offset
                const lidx2 = params.length;     // limit

                const sql = `
                    SELECT sp.id,
                           g.id AS game_id, g.sstats_id AS game_sstats_id, g.date AS game_date,
                           g.league_id, l.sstats_id AS league_sstats_id, l.name AS league_name,
                           g.home_team_id, g.away_team_id,
                           ht.sstats_id AS home_sstats_id, ht.name AS home_name, ht.logo AS home_logo,
                           at.sstats_id AS away_sstats_id, at.name AS away_name, at.logo AS away_logo,
                           sp.predicted_outcome, sp.confidence,
                           sp.analyzer_snapshot,
                           sp.predicted_total, sp.total_line, sp.total_confidence,
                           sp.total_over_prob, sp.total_under_prob,
                           sp.actual_outcome, sp.is_hit, sp.verified_at
                    FROM strategy_predictions sp
                    LEFT JOIN games g   ON g.id  = sp.game_id
                    LEFT JOIN leagues l ON l.id  = g.league_id
                    LEFT JOIN teams ht  ON ht.id = g.home_team_id
                    LEFT JOIN teams at  ON at.id = g.away_team_id
                    ${whereSql}
                    ORDER BY g.date DESC
                    LIMIT $${params.length - 1} OFFSET $${params.length}
                `;
                const { rows } = await db.query(sql, params);

                const countParams = params.slice(0, params.length - 2);
                const countRes = await db.query(`
                    SELECT count(*) AS total FROM strategy_predictions sp
                    LEFT JOIN games g ON g.id = sp.game_id ${whereSql}
                `, countParams);

                return {
                    success: true,
                    data: {
                        range, strategy_id: strategyId, league_id: leagueInternal,
                        status, outcome, hit: hitFilter,
                        total: Number(countRes.rows[0].total) || 0,
                        limit, offset,
                        items: rows.map(r => ({
                            id: r.id,
                            game: {
                                id: r.game_sstats_id, internal_id: r.game_id,
                                date: r.game_date,
                                league: { id: r.league_sstats_id, internal_id: r.league_id, name: r.league_name },
                                home: { id: r.home_sstats_id, name: r.home_name, logo: r.home_logo },
                                away: { id: r.away_sstats_id, name: r.away_name, logo: r.away_logo },
                            },
                            predicted_outcome: r.predicted_outcome,
                            confidence: r.confidence != null ? Number(r.confidence) : null,
                            predicted_total: r.predicted_total,
                            total_line: r.total_line != null ? Number(r.total_line) : null,
                            total_confidence: r.total_confidence != null ? Number(r.total_confidence) : null,
                            total_over_prob: r.total_over_prob != null ? Number(r.total_over_prob) : null,
                            total_under_prob: r.total_under_prob != null ? Number(r.total_under_prob) : null,
                            actual: r.actual_outcome ? {
                                outcome: r.actual_outcome,
                                is_hit: r.is_hit,
                                verified_at: r.verified_at,
                            } : null,
                        })),
                    },
                    source: 'strategy',
                };
            }

            // ─── Режим: глобальные прогнозы (predictions_log) ───
            const where = [
                "pl.predicted_outcome IN ('HOME','DRAW','AWAY')",
            ];
            const params = [];
            if (intervalSql) where.push(`pl.game_date >= now() - ${intervalSql}`);
            if (leagueInternal) {
                params.push(leagueInternal);
                where.push(`pl.league_id = $${params.length}`);
            }
            if (status === 'verified') where.push('pl.actual_outcome IS NOT NULL');
            else if (status === 'pending') where.push('pl.actual_outcome IS NULL');
            if (outcome && ['HOME', 'DRAW', 'AWAY'].includes(outcome)) {
                params.push(outcome);
                where.push(`pl.predicted_outcome = $${params.length}`);
            }
            if (hitFilter === 'true')  where.push('pl.is_hit IS TRUE');
            if (hitFilter === 'false') where.push('pl.is_hit IS FALSE');

            const whereSql = 'WHERE ' + where.join(' AND ');

            params.push(limit, offset);

            const sql = `
                SELECT pl.id,
                       pl.game_id, pl.game_sstats_id, pl.game_date,
                       pl.league_id, l.sstats_id AS league_sstats_id, l.name AS league_name,
                       g.home_team_id, g.away_team_id,
                       ht.sstats_id AS home_sstats_id, ht.name AS home_name, ht.logo AS home_logo,
                       at.sstats_id AS away_sstats_id, at.name AS away_name, at.logo AS away_logo,
                       pl.predicted_at, pl.predicted_outcome, pl.confidence,
                       pl.home_score_pred, pl.draw_score_pred, pl.away_score_pred,
                       pl.home_markov_pred, pl.home_markov_prob,
                       pl.away_markov_pred, pl.away_markov_prob,
                       pl.betting_edges, pl.betting_recs, pl.odds_snapshot,
                       pl.actual_outcome, pl.actual_home_score, pl.actual_away_score,
                       pl.is_hit, pl.brier_component, pl.verified_at
                FROM predictions_log pl
                LEFT JOIN games g   ON g.id  = pl.game_id
                LEFT JOIN leagues l ON l.id  = pl.league_id
                LEFT JOIN teams ht  ON ht.id = g.home_team_id
                LEFT JOIN teams at  ON at.id = g.away_team_id
                ${whereSql}
                ORDER BY pl.game_date DESC, pl.id DESC
                LIMIT $${params.length - 1} OFFSET $${params.length}
            `;
            const { rows } = await db.query(sql, params);

            // Counter total (без limit/offset) — для пагинации
            const countParams = params.slice(0, params.length - 2);
            const countRes = await db.query(`
                SELECT count(*) AS total FROM predictions_log pl ${whereSql}
            `, countParams);

            return {
                success: true,
                data: {
                    range,
                    league_id: leagueInternal,
                    status,
                    outcome,
                    hit: hitFilter,
                    total: Number(countRes.rows[0].total) || 0,
                    limit, offset,
                    items: rows.map(r => ({
                        id: r.id,
                        game: {
                            id: r.game_sstats_id, internal_id: r.game_id,
                            date: r.game_date,
                            league: { id: r.league_sstats_id, internal_id: r.league_id, name: r.league_name },
                            home: { id: r.home_sstats_id, name: r.home_name, logo: r.home_logo },
                            away: { id: r.away_sstats_id, name: r.away_name, logo: r.away_logo },
                        },
                        predicted_at: r.predicted_at,
                        predicted_outcome: r.predicted_outcome,
                        confidence: r.confidence != null ? Number(r.confidence) : null,
                        scores_pred: {
                            home: r.home_score_pred != null ? Number(r.home_score_pred) : null,
                            draw: r.draw_score_pred != null ? Number(r.draw_score_pred) : null,
                            away: r.away_score_pred != null ? Number(r.away_score_pred) : null,
                        },
                        markov: {
                            home: r.home_markov_pred ? { prediction: r.home_markov_pred, probability: r.home_markov_prob != null ? Number(r.home_markov_prob) : null } : null,
                            away: r.away_markov_pred ? { prediction: r.away_markov_pred, probability: r.away_markov_prob != null ? Number(r.away_markov_prob) : null } : null,
                        },
                        betting: {
                            edges: r.betting_edges,
                            recs:  r.betting_recs,
                            odds:  r.odds_snapshot,
                        },
                        actual: r.actual_outcome ? {
                            outcome: r.actual_outcome,
                            home_score: r.actual_home_score,
                            away_score: r.actual_away_score,
                            is_hit: r.is_hit,
                            brier_component: r.brier_component != null ? Number(r.brier_component) : null,
                            verified_at: r.verified_at,
                        } : null,
                    })),
                },
                source: 'live',
            };
        } catch (err) {
            request.log.error({ err }, '/predictions/list failed');
            return reply.code(500).send({ success: false, error: err.message });
        }
    });
}

module.exports = dbRoutes;

