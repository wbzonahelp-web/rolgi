'use strict';

/**
 * Job: compute_team_analyzers
 *
 * Пересчёт кэша team_analyzers_cache для активных команд.
 * Запускается ночью по расписанию из scheduled-jobs.js.
 *
 * Что считает (для каждой активной команды):
 *   - markov_outcome    (W/D/L Markov chain)
 *   - markov_state      (4-state предсказуемость)
 *   - shannon_entropy   (тоталы голов)
 *   - form_inertia      (автокорреляция xG_diff)
 *   - multipeak         (мультимодальность распределения)
 *
 * Параметры по умолчанию:
 *   n_window = 20
 *   league_filter = 0 (все турниры)
 *   venue = any
 *
 * Метрики:
 *   - skipped_few_games: команды с <10 матчами за год → пропуск
 *   - errors:            счётчик ошибок
 *   - upserted:          успешно записанные строки
 */

const logger = require('../monitoring/logger');

const aMarkovOut  = require('../analytics/analyzers/markov-outcome.js');
const aMarkovSt   = require('../analytics/analyzers/markov-state.js');
const aShannon    = require('../analytics/analyzers/shannon-entropy.js');
const aInertia    = require('../analytics/analyzers/form-inertia.js');
const aMultipeak  = require('../analytics/analyzers/multipeak-density.js');

const N_WINDOW = 20;
const MIN_GAMES_LAST_YEAR = 10;
const BATCH_SIZE = 200;
const SQL_QUERY_TIMEOUT_MS = 5000;

// Список анализаторов, которые кэшируем (Monte Carlo не сюда — он на конкретные odds)
const ANALYZERS = [
  { name: 'markov_outcome',  module: aMarkovOut },
  { name: 'markov_state',    module: aMarkovSt },
  { name: 'shannon_entropy', module: aShannon },
  { name: 'form_inertia',    module: aInertia },
  { name: 'multipeak',       module: aMultipeak },
];

/**
 * Главная функция job'а.
 * @param {object} db — pg Pool (this.db в ScheduledJobsManager)
 * @returns {{teams_total, teams_processed, teams_skipped, rows_upserted, errors, duration_ms}}
 */
async function computeTeamAnalyzers(db) {
  const t0 = Date.now();

  // 1) Получаем список активных команд с минимум 10 матчами за последние 365 дней
  logger.info({ job: 'compute_team_analyzers' }, 'Selecting active teams...');
  const teamsRes = await db.query(`
    SELECT t.id AS team_id, t.name
    FROM teams t
    WHERE t.is_active = true
      AND EXISTS (
        SELECT 1 FROM games g
        WHERE (g.home_team_id = t.id OR g.away_team_id = t.id)
          AND g.is_deleted = false
          AND g.status = 'finished'
          AND g.date >= NOW() - INTERVAL '365 days'
        LIMIT 1
      )
    ORDER BY t.id
  `);
  const teams = teamsRes.rows;
  logger.info({
    job: 'compute_team_analyzers',
    teams_total: teams.length,
  }, 'Active teams selected');

  let teamsProcessed = 0;
  let teamsSkipped = 0;
  let rowsUpserted = 0;
  let errors = 0;

  // 2) Обрабатываем команды батчами
  for (let i = 0; i < teams.length; i += BATCH_SIZE) {
    const batch = teams.slice(i, i + BATCH_SIZE);
    const batchT0 = Date.now();

    // Для каждой команды — 5 анализаторов параллельно (в рамках одной команды)
    const tasks = batch.map(async (t) => {
      try {
        // Загружаем последние N_WINDOW матчей команды (все турниры, любой venue)
        const histRes = await db.query(`
          SELECT g.id, g.date,
                 g.home_team_id, g.away_team_id,
                 g.home_score, g.away_score,
                 gs.expected_goals_home, gs.expected_goals_away
          FROM games g
          LEFT JOIN game_statistics gs ON gs.game_id = g.id
          WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
            AND g.is_deleted = false
            AND g.status = 'finished'
          ORDER BY g.date DESC
          LIMIT $2
        `, [t.team_id, N_WINDOW]);

        if (histRes.rows.length < MIN_GAMES_LAST_YEAR) {
          teamsSkipped++;
          return;
        }

        // Приводим к формату, ожидаемому анализаторами
        const games = histRes.rows.map((r) => {
          const isHome = r.home_team_id === t.team_id;
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

        // Запускаем все 5 анализаторов
        for (const a of ANALYZERS) {
          try {
            const result = a.module.analyze(games);
            await db.query(`
              INSERT INTO team_analyzers_cache(
                team_id, analyzer, n_window, league_filter, value, confidence, details, updated_at
              )
              VALUES ($1, $2, $3, 0, $4, $5, $6, NOW())
              ON CONFLICT (team_id, analyzer, n_window, league_filter)
              DO UPDATE SET
                value      = EXCLUDED.value,
                confidence = EXCLUDED.confidence,
                details    = EXCLUDED.details,
                updated_at = NOW()
            `, [
              t.team_id,
              a.name,
              N_WINDOW,
              Number.isFinite(result.value) ? result.value : null,
              Number.isFinite(result.confidence) ? result.confidence : null,
              JSON.stringify(result.details || {}),
            ]);
            rowsUpserted++;
          } catch (innerErr) {
            errors++;
            logger.warn({
              job: 'compute_team_analyzers',
              team_id: t.team_id,
              analyzer: a.name,
              err: innerErr.message,
            }, 'Single-analyzer error');
          }
        }
        teamsProcessed++;
      } catch (err) {
        errors++;
        logger.warn({
          job: 'compute_team_analyzers',
          team_id: t.team_id,
          err: err.message,
        }, 'Team processing failed');
      }
    });

    await Promise.all(tasks);

    if ((i / BATCH_SIZE) % 10 === 0) {
      logger.info({
        job: 'compute_team_analyzers',
        progress: `${i + batch.length}/${teams.length}`,
        teams_processed: teamsProcessed,
        teams_skipped: teamsSkipped,
        rows_upserted: rowsUpserted,
        errors,
        batch_duration_ms: Date.now() - batchT0,
      }, 'Progress');
    }
  }

  const duration = Date.now() - t0;
  return {
    teams_total: teams.length,
    teams_processed: teamsProcessed,
    teams_skipped: teamsSkipped,
    rows_upserted: rowsUpserted,
    errors,
    duration_ms: duration,
  };
}

module.exports = { computeTeamAnalyzers };
