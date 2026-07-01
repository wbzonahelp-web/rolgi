const getDatabase = require('../database/db-pool').getDatabase;
const poissonAnalyzer = require('../analytics/analyzers/poisson');
const markovOutcome = require('../analytics/analyzers/markov-outcome');
const markovState = require('../analytics/analyzers/markov-state');
const shannonEntropy = require('../analytics/analyzers/shannon-entropy');
const formInertia = require('../analytics/analyzers/form-inertia');
const multipeakDensity = require('../analytics/analyzers/multipeak-density');
const valenzetti = require('../analytics/analyzers/valenzetti');
const pagerank = require('../analytics/analyzers/pagerank');
const gameStats = require('../analytics/analyzers/game-stats');
const matchPredictorV3 = require('../analytics/analyzers/match-predictor-v3');
const monteCarlo = require('../analytics/analyzers/monte-carlo');
const axios = require('axios');

// Список всех моделей
const MODELS = [
  'poisson',
  'markov_outcome',
  'markov_state',
  'shannon_entropy',
  'form_inertia',
  'multipeak_density',
  'valenzetti',
  'pagerank',
  'game_stats',
  'match_predictor_v3',
  'monte_carlo',
  'hmm'
];

// Унифицированный вызов модели
async function runModel(modelName, gameData) {
  try {
    const { homeGames, awayGames, game, leagueParams } = gameData;

    let result;
    switch(modelName) {
      case 'poisson':
        result = await poissonAnalyzer.analyze(homeGames, awayGames, leagueParams, game.league_id, game.season);
        break;
      case 'markov_outcome':
        result = await markovOutcome.analyze(homeGames.concat(awayGames));
        break;
      case 'markov_state':
        result = await markovState.analyze(homeGames.concat(awayGames));
        break;
      case 'shannon_entropy':
        result = await shannonEntropy.analyze(homeGames.concat(awayGames));
        break;
      case 'form_inertia':
        result = await formInertia.analyze(homeGames.concat(awayGames));
        break;
      case 'multipeak_density':
        result = await multipeakDensity.analyze(homeGames.concat(awayGames));
        break;
      case 'valenzetti':
        result = await valenzetti.analyze(homeGames, awayGames);
        break;
      case 'pagerank':
        const matches = homeGames.concat(awayGames);
        result = await pagerank.analyze(matches);
        break;
      case 'game_stats':
        result = await gameStats.analyze(homeGames.concat(awayGames), 'home');
        break;
      case 'match_predictor_v3':
        const homeTeam = { recentGames: homeGames, h2hGames: [], markovScore: 0.5 };
        const awayTeam = { recentGames: awayGames, h2hGames: [], markovScore: 0.5 };
        result = await matchPredictorV3.predict(homeTeam, awayTeam, {});
        break;
      case 'monte_carlo':
        result = await monteCarlo.analyze({ games: homeGames, odds: 2.0, target: 'W' });
        break;
      case 'hmm':
        // Вызов Python API
        const hmmResult = await axios.get(`http://localhost:8000/api/db/teams/${game.home_team_id}/analyzers/hmm`);
        result = hmmResult.data;
        break;
      default:
        throw new Error(`Unknown model: ${modelName}`);
    }

    return normalizePrediction(result, modelName);
  } catch (error) {
    console.error(`Error running model ${modelName}:`, error.message);
    return null;
  }
}

// Нормализация результата в единый формат
function normalizePrediction(result, modelName) {
  if (!result) return null;

  // Извлекаем вероятности в зависимости от структуры результата
  let homeProb, drawProb, awayProb, confidence, predictedOutcome;

  if (result.details && result.details.probabilities) {
    homeProb = result.details.probabilities.home;
    drawProb = result.details.probabilities.draw;
    awayProb = result.details.probabilities.away;
  } else if (result.probabilities) {
    homeProb = result.probabilities.home;
    drawProb = result.probabilities.draw;
    awayProb = result.probabilities.away;
  } else {
    // Модели без явных вероятностей - конвертируем value
    const val = result.value || 0.5;
    homeProb = val > 0.5 ? val : 0.33;
    drawProb = 0.34;
    awayProb = val < 0.5 ? (1 - val) : 0.33;
  }

  // Клиппинг вероятностей в [0, 1]
  homeProb = Math.max(0, Math.min(1, homeProb));
  drawProb = Math.max(0, Math.min(1, drawProb));
  awayProb = Math.max(0, Math.min(1, awayProb));

  // Нормализация суммы до 1.0
  const sum = homeProb + drawProb + awayProb;
  if (sum > 0) {
    homeProb = homeProb / sum;
    drawProb = drawProb / sum;
    awayProb = awayProb / sum;
  } else {
    homeProb = 0.34;
    drawProb = 0.33;
    awayProb = 0.33;
  }

  confidence = result.confidence || 0.5;

  // Определяем predicted_outcome
  if (homeProb > drawProb && homeProb > awayProb) {
    predictedOutcome = 'W';
  } else if (awayProb > homeProb && awayProb > drawProb) {
    predictedOutcome = 'L';
  } else {
    predictedOutcome = 'D';
  }

  return {
    predicted_outcome: predictedOutcome,
    home_prob: homeProb,
    draw_prob: drawProb,
    away_prob: awayProb,
    confidence: confidence,
    details: result
  };
}

module.exports = {
  MODELS,
  runModel,
  normalizePrediction
};