const logger = require('../monitoring/logger');
const modelPredictionsService = require('../services/model-predictions-service');

/**
 * Генерация прогнозов моделей для upcoming матчей
 */
async function generateModelPredictionsJob(db) {
  logger.info({ job: 'generate_model_predictions' }, 'Starting model predictions generation...');
  try {
    const results = await modelPredictionsService.generatePredictionsForUpcoming(48);
    logger.info({
      job: 'generate_model_predictions',
      gamesCount: results.length
    }, 'Model predictions generated');
    return { generated: results.length };
  } catch (error) {
    logger.error({
      job: 'generate_model_predictions',
      error: error.message
    }, 'Error generating model predictions');
    throw error;
  }
}

/**
 * Верификация прогнозов моделей для завершённых матчей
 */
async function verifyModelPredictionsJob(db) {
  logger.info({ job: 'verify_model_predictions' }, 'Starting model predictions verification...');
  try {
    const result = await modelPredictionsService.verifyPredictions();
    logger.info({
      job: 'verify_model_predictions',
      verified: result.verified
    }, 'Model predictions verified');
    return result;
  } catch (error) {
    logger.error({
      job: 'verify_model_predictions',
      error: error.message
    }, 'Error verifying model predictions');
    throw error;
  }
}

module.exports = {
  generateModelPredictionsJob,
  verifyModelPredictionsJob
};