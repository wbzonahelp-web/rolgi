const getDatabase = require('../database/db-pool').getDatabase;
const modelAdapter = require('./model-adapter');

class ModelPredictionsService {

  // Генерация прогнозов для одного матча по всем моделям
  async generatePredictionsForGame(gameId) {
    try {
      const db = getDatabase();

      // Получаем данные матча
      const game = await this.getGameData(gameId);
      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      // Получаем историю команд
      const homeGames = await this.getTeamHistory(game.home_team_id, game.date, 20);
      const awayGames = await this.getTeamHistory(game.away_team_id, game.date, 20);

      // Параметры лиги
      const leagueParams = await this.getLeagueParams(game.league_id, game.season);

      const gameData = { homeGames, awayGames, game, leagueParams };

      const predictions = [];

      // Запускаем все модели
      for (const modelName of modelAdapter.MODELS) {
        const prediction = await modelAdapter.runModel(modelName, gameData);

        if (prediction) {
          // Сохраняем в БД
          await this.savePrediction(db, {
            model_name: modelName,
            game_id: gameId,
            ...prediction
          });

          predictions.push({ model: modelName, ...prediction });
        }
      }

      return predictions;
    } catch (error) {
      console.error(`Error generating predictions for game ${gameId}:`, error);
      throw error;
    }
  }

  // Генерация прогнозов для всех upcoming матчей
  async generatePredictionsForUpcoming(hoursAhead = 48) {
    try {
      const db = getDatabase();
      const result = await db.query(
        `SELECT id FROM games
         WHERE date > NOW()
         AND date <= NOW() + INTERVAL '${hoursAhead} hours'
         AND is_finished = false
         ORDER BY date ASC
         LIMIT 100`
      );

      console.log(`Found ${result.rows.length} upcoming games`);

      const results = [];
      for (const game of result.rows) {
        try {
          const predictions = await this.generatePredictionsForGame(game.id);
          results.push({ game_id: game.id, predictions: predictions.length });
        } catch (error) {
          console.error(`Failed to generate predictions for game ${game.id}:`, error.message);
        }
      }

      return results;
    } catch (error) {
      console.error('Error generating predictions for upcoming games:', error);
      throw error;
    }
  }

  // Верификация прогнозов для завершенных матчей
  async verifyPredictions() {
    try {
      const db = getDatabase();
      const result = await db.query(
        `SELECT mp.id, mp.model_name, mp.game_id, mp.predicted_outcome,
                g.home_score, g.away_score
         FROM model_predictions mp
         JOIN games g ON mp.game_id = g.id
         WHERE mp.is_hit IS NULL
         AND g.is_finished = true
         AND g.home_score IS NOT NULL
         AND g.away_score IS NOT NULL
         LIMIT 500`
      );

      console.log(`Verifying ${result.rows.length} predictions`);

      for (const pred of result.rows) {
        const actualOutcome = this.calculateOutcome(pred.home_score, pred.away_score);
        const isHit = pred.predicted_outcome === actualOutcome;

        await db.query(
          `UPDATE model_predictions
           SET actual_outcome = $1, is_hit = $2, verified_at = NOW()
           WHERE id = $3`,
          [actualOutcome, isHit, pred.id]
        );
      }

      return { verified: result.rows.length };
    } catch (error) {
      console.error('Error verifying predictions:', error);
      throw error;
    }
  }

  // Статистика по моделям
  async getModelsStatistics() {
    try {
      const db = getDatabase();
      const result = await db.query(
        `SELECT
           model_name,
           COUNT(*)::int as total_predictions,
           COUNT(CASE WHEN is_hit = true THEN 1 END)::int as hits,
           COUNT(CASE WHEN is_hit = false THEN 1 END)::int as misses,
           ROUND(AVG(CASE WHEN is_hit THEN 1.0 ELSE 0.0 END)::numeric, 4) as accuracy,
           ROUND(AVG(confidence)::numeric, 4) as avg_confidence
         FROM model_predictions
         WHERE is_hit IS NOT NULL
         GROUP BY model_name
         ORDER BY accuracy DESC NULLS LAST`
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting models statistics:', error);
      throw error;
    }
  }

  // Получение прогнозов для матча
  async getPredictionsForGame(gameId) {
    try {
      const db = getDatabase();
      const result = await db.query(
        `SELECT * FROM model_predictions
         WHERE game_id = $1
         ORDER BY predicted_at DESC, model_name`,
        [gameId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching game predictions:', error);
      throw error;
    }
  }

  // Вспомогательные методы
  async getGameData(gameId) {
    const db = getDatabase();
    const result = await db.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );
    return result.rows[0];
  }

  async getTeamHistory(teamId, beforeDate, limit = 20) {
    const db = getDatabase();
    const result = await db.query(
      `SELECT g.*, gs.*
       FROM games g
       LEFT JOIN game_statistics gs ON g.id = gs.game_id AND g.date = gs.date
       WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
       AND g.date < $2::timestamp
       AND g.is_finished = true
       ORDER BY g.date DESC
       LIMIT $3`,
      [teamId, beforeDate, limit]
    );
    return result.rows;
  }

  async getLeagueParams(leagueId, season) {
    const db = getDatabase();
    const result = await db.query(
      `SELECT
         AVG(CASE WHEN home_score IS NOT NULL THEN home_score END) as avg_home_goals,
         AVG(CASE WHEN away_score IS NOT NULL THEN away_score END) as avg_away_goals
       FROM games
       WHERE league_id = $1 AND season = $2 AND is_finished = true`,
      [leagueId, season]
    );
    return result.rows[0] || { avg_home_goals: 1.5, avg_away_goals: 1.2 };
  }

  async savePrediction(db, data) {
    await db.query(
      `INSERT INTO model_predictions
       (model_name, game_id, predicted_outcome, home_prob, draw_prob, away_prob, confidence, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.model_name,
        data.game_id,
        data.predicted_outcome,
        data.home_prob,
        data.draw_prob,
        data.away_prob,
        data.confidence,
        JSON.stringify(data.details)
      ]
    );
  }

  calculateOutcome(homeScore, awayScore) {
    if (homeScore > awayScore) return 'W';
    if (awayScore > homeScore) return 'L';
    return 'D';
  }
}

module.exports = new ModelPredictionsService();