'use strict';

// Absolute paths for inside the container (/app/src/analytics/...)
const valenzetti = require('/app/src/analytics/analyzers/valenzetti');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function formatGame(r, teamId) {
    const isHome = r.home_team_id === teamId;
    const gf = isHome ? r.home_score : r.away_score;
    const ga = isHome ? r.away_score : r.home_score;
    let outcome = null;
    if (gf != null && ga != null) {
        if (gf > ga) outcome = 'W';
        else if (gf < ga) outcome = 'L';
        else outcome = 'D';
    }
    return {
        outcome,
        gf: Number(gf),
        ga: Number(ga),
        gd: gf != null && ga != null ? Number(gf) - Number(ga) : null,
        venue: isHome ? 'home' : 'away',
        xg_for: r.expected_goals_home != null ? (isHome ? Number(r.expected_goals_home) : Number(r.expected_goals_away)) : null,
        xg_against: r.expected_goals_away != null ? (isHome ? Number(r.expected_goals_away) : Number(r.expected_goals_home)) : null,
        shots: r.shots_home != null ? (isHome ? Number(r.shots_home) : Number(r.shots_away)) : null,
    };
}

async function testRealData() {
    const leagueRes = await pool.query(`
        SELECT id FROM leagues
        WHERE name ILIKE '%Premier League%' AND country_name = 'England'
        LIMIT 1
    `);
    if (!leagueRes.rows.length) {
        console.error('League not found');
        process.exit(1);
    }
    const leagueId = leagueRes.rows[0].id;
    console.log('League ID:', leagueId);

    const result = await pool.query(`
        SELECT g.*,
               gs.expected_goals_home, gs.expected_goals_away,
               gs.shots_home, gs.shots_away, gs.possession_home
        FROM games g
        LEFT JOIN game_statistics gs ON g.id = gs.game_id
        WHERE g.league_id = $1
          AND g.season = 2024
          AND g.is_finished = true
          AND g.date < NOW()
        ORDER BY g.date DESC
        LIMIT 50
    `, [leagueId]);

    console.log('Test sample:', result.rows.length, 'matches');

    let correct = 0;
    let total = 0;
    let hasData = 0;
    let noData = 0;

    for (const match of result.rows) {
        const historyH = await pool.query(`
            SELECT g.*, gs.expected_goals_home, gs.expected_goals_away,
                   gs.shots_home, gs.shots_away
            FROM games g
            LEFT JOIN game_statistics gs ON g.id = gs.game_id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_finished = true AND g.date < $2
            ORDER BY g.date DESC LIMIT 20
        `, [match.home_team_id, match.date]);

        const historyA = await pool.query(`
            SELECT g.*, gs.expected_goals_home, gs.expected_goals_away,
                   gs.shots_home, gs.shots_away
            FROM games g
            LEFT JOIN game_statistics gs ON g.id = gs.game_id
            WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
              AND g.is_finished = true AND g.date < $2
            ORDER BY g.date DESC LIMIT 20
        `, [match.away_team_id, match.date]);

        if (historyH.rows.length < 5 || historyA.rows.length < 5) {
            noData++;
            continue;
        }

        const homeGames = historyH.rows.map(r => formatGame(r, match.home_team_id));
        const awayGames = historyA.rows.map(r => formatGame(r, match.away_team_id));

        const prediction = valenzetti.analyze(homeGames, awayGames, {});

        if (prediction.details && prediction.details.error === 'insufficient_data') {
            noData++;
            continue;
        }

        hasData++;
        total++;

        const actual = match.home_score > match.away_score ? 'HOME' :
                       match.home_score < match.away_score ? 'AWAY' : 'DRAW';

        const predOutcome = prediction.details.predicted_outcome;
        if (predOutcome === actual) correct++;

        const dt = prediction.details;
        const dateStr = match.date.toISOString ? match.date.toISOString().slice(0, 10) : String(match.date).slice(0, 10);
        console.log(
            `${dateStr} ${match.home_score}:${match.away_score} ` +
            `Pred:${predOutcome} Actual:${actual} ` +
            `Prob:(${(dt.probabilities.home * 100).toFixed(1)}/${(dt.probabilities.draw * 100).toFixed(1)}/${(dt.probabilities.away * 100).toFixed(1)}) ` +
            `Conf:${prediction.confidence.toFixed(4)}`
        );
    }

    console.log('\n=== RESULTS ===');
    console.log('Total matches:', result.rows.length);
    console.log('With sufficient data:', hasData);
    console.log('Without data (history < 5):', noData);
    console.log('Accuracy:', total > 0 ? (correct / total * 100).toFixed(1) + '%' : 'N/A',
                `(${correct}/${total})`);

    await pool.end();

    return { total, correct, accuracy: total > 0 ? correct / total : 0 };
}

testRealData().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});