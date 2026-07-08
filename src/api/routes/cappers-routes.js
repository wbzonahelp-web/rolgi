'use strict';
/**
 * Cappers routes. Префикс: /api/db (регистрируется вместе с db-routes через отдельный register).
 * Данные читаются из PostgreSQL (таблицы cappers, capper_picks), наполняются ETL etl_cappers.py.
 */

module.exports = async function (fastify, opts) {
    const db = fastify.db || require('../../database/db-pool').getDatabase();

    // Список всех капперов со сводной статистикой
    fastify.get('/cappers', async (request, reply) => {
        const { rows } = await db.query(`
            SELECT channel_id, title, username, language, total_forecasts,
                   claimed_winrate, real_winrate,
                   honest_cnt, dishonest_cnt, unverified_cnt, no_report_cnt,
                   updated_at
            FROM cappers
            ORDER BY total_forecasts DESC
        `);
        return { cappers: rows };
    });

    // Детали одного каппера + его прогнозы
    fastify.get('/cappers/:id', async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (!Number.isFinite(id)) {
            reply.code(400);
            return { error: 'bad channel_id' };
        }

        const capRes = await db.query(`SELECT * FROM cappers WHERE channel_id = $1`, [id]);
        if (capRes.rows.length === 0) {
            reply.code(404);
            return { error: 'capper not found' };
        }

        const picksRes = await db.query(`
            SELECT forecast_id, sport, event_norm, bet_type, stake, created_at,
                   verdict, verified, score, match_date, source
            FROM capper_picks
            WHERE channel_id = $1
            ORDER BY created_at DESC NULLS LAST, forecast_id DESC
        `, [id]);

        return { capper: capRes.rows[0], picks: picksRes.rows };
    });
};
