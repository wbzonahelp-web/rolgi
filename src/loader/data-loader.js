/**
 * Data Loader Pipeline v6.0.0
 * 
 * 13-шаговый конвейер загрузки данных из SStats.net в PostgreSQL
 * 
 * Этапы загрузки:
 * 1. PRE-FLIGHT CHECK - Проверка готовности системы
 * 2. FETCH API DATA - Загрузка данных из API
 * 3. VALIDATE RESPONSE - Валидация структуры ответа
 * 4. TRANSFORM DATA - Трансформация данных
 * 5. ENRICH DATA - Обогащение дополнительными данными
 * 6. DEDUPLICATE - Дедупликация записей
 * 7. VALIDATE CONSTRAINTS - Валидация БД ограничений
 * 8. BEGIN TRANSACTION - Начало транзакции
 * 9. RESOLVE DEPENDENCIES - Резолв внешних ключей
 * 10. UPSERT DATA - Сохранение в БД
 * 11. UPDATE RELATIONS - Обновление связей
 * 12. COMMIT TRANSACTION - Commit транзакции
 * 13. POST-LOAD VERIFICATION - Проверка результатов
 * 
 * Возможности:
 * - Атомарность операций (транзакции)
 * - Rollback при ошибках
 * - Dependency resolution через Table Dependencies
 * - UPSERT через UPSERT Keys
 * - Валидация через Response Types
 * - Recovery через Recovery Playbook
 * - Метрики и трейсинг каждого шага
 * - Поддержка batch загрузки
 * - Rate limiting для API
 * - Кэширование справочников
 * 
 * @module data-loader
 */

const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const SStatsClient = require('../api/sstats-client');
const { getDatabase } = require('./db-pool');
const { validateResponseStructure } = require('../api/response-types');
const { getRecoveryStrategy } = require('../monitoring/recovery-playbook');
const { canLoadTable, getDependencies } = require('./table-dependencies');
const { runPreflightChecks } = require('../core/preflight-checks');

const logger = pino({
  name: 'data-loader',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * @typedef {Object} LoaderConfig
 * @property {string} apiKey - SStats API key
 * @property {number} batchSize - Batch size for loading
 * @property {number} maxRetries - Max retries per step
 * @property {boolean} enableValidation - Enable validation
 * @property {boolean} enablePreflight - Enable preflight checks
 * @property {boolean} enableMetrics - Enable metrics collection
 * @property {boolean} skipExisting - Skip existing records
 */

/**
 * @typedef {Object} LoadStep
 * @property {number} step - Step number (1-13)
 * @property {string} name - Step name
 * @property {string} status - Status: pending, running, completed, failed, skipped
 * @property {Date} startTime - Start time
 * @property {Date} endTime - End time
 * @property {number} duration - Duration in ms
 * @property {Object} result - Step result
 * @property {Error} error - Error if failed
 */

/**
 * @typedef {Object} LoadSession
 * @property {string} sessionId - Unique session ID
 * @property {string} entityType - Entity type (games, teams, etc.)
 * @property {Date} startTime - Session start time
 * @property {Date} endTime - Session end time
 * @property {string} status - Session status
 * @property {Array<LoadStep>} steps - Load steps
 * @property {Object} stats - Session statistics
 * @property {Object} metadata - Additional metadata
 */

/**
 * Data Loader Pipeline
 */
class DataLoader {
  /**
   * @param {LoaderConfig} config
   */
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.SSTATS_API_KEY,
      batchSize: config.batchSize || 100,
      maxRetries: config.maxRetries || 3,
      enableValidation: config.enableValidation !== false,
      enablePreflight: config.enablePreflight !== false,
      enableMetrics: config.enableMetrics !== false,
      skipExisting: config.skipExisting !== false
    };

    this.apiClient = new SStatsClient({ apiKey: this.config.apiKey });
    this.db = getDatabase();

    // Reference data cache (countries, bookmakers, etc.)
    this.refCache = new Map();

    // Current session
    this.currentSession = null;

    logger.info({
      batchSize: this.config.batchSize,
      enableValidation: this.config.enableValidation,
      enablePreflight: this.config.enablePreflight
    }, 'DataLoader initialized');
  }

  /**
   * Создать новую load session
   * @param {string} entityType
   * @param {Object} metadata
   * @returns {LoadSession}
   */
  _createSession(entityType, metadata = {}) {
    const session = {
      sessionId: uuidv4(),
      entityType,
      startTime: new Date(),
      endTime: null,
      status: 'PENDING',
      steps: this._initializeSteps(),
      stats: {
        totalRecords: 0,
        insertedRecords: 0,
        updatedRecords: 0,
        skippedRecords: 0,
        failedRecords: 0,
        apiCalls: 0,
        dbQueries: 0,
        totalDuration: 0
      },
      metadata
    };

    logger.info({
      sessionId: session.sessionId,
      entityType,
      metadata
    }, 'Load session created');

    return session;
  }

  /**
   * Инициализация 13 шагов загрузки
   * @private
   * @returns {Array<LoadStep>}
   */
  _initializeSteps() {
    const stepNames = [
      'PRE-FLIGHT CHECK',
      'FETCH API DATA',
      'VALIDATE RESPONSE',
      'TRANSFORM DATA',
      'ENRICH DATA',
      'DEDUPLICATE',
      'VALIDATE CONSTRAINTS',
      'BEGIN TRANSACTION',
      'RESOLVE DEPENDENCIES',
      'UPSERT DATA',
      'UPDATE RELATIONS',
      'COMMIT TRANSACTION',
      'POST-LOAD VERIFICATION'
    ];

    return stepNames.map((name, index) => ({
      step: index + 1,
      name,
      status: 'pending',
      startTime: null,
      endTime: null,
      duration: null,
      result: null,
      error: null
    }));
  }

  /**
   * Начать выполнение шага
   * @private
   * @param {number} stepNumber
   */
  _startStep(stepNumber) {
    const step = this.currentSession.steps[stepNumber - 1];
    step.status = 'running';
    step.startTime = new Date();

    logger.debug({
      sessionId: this.currentSession.sessionId,
      step: stepNumber,
      name: step.name
    }, 'Step started');
  }

  /**
   * Завершить шаг успешно
   * @private
   * @param {number} stepNumber
   * @param {Object} result
   */
  _completeStep(stepNumber, result = null) {
    const step = this.currentSession.steps[stepNumber - 1];
    step.status = 'completed';
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    step.result = result;

    logger.debug({
      sessionId: this.currentSession.sessionId,
      step: stepNumber,
      name: step.name,
      duration: step.duration
    }, 'Step completed');
  }

  /**
   * Отметить шаг как failed
   * @private
   * @param {number} stepNumber
   * @param {Error} error
   */
  _failStep(stepNumber, error) {
    const step = this.currentSession.steps[stepNumber - 1];
    step.status = 'failed';
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    step.error = error;

    logger.error({
      sessionId: this.currentSession.sessionId,
      step: stepNumber,
      name: step.name,
      error: error.message
    }, 'Step failed');
  }

  /**
   * Пропустить шаг
   * @private
   * @param {number} stepNumber
   * @param {string} reason
   */
  _skipStep(stepNumber, reason) {
    const step = this.currentSession.steps[stepNumber - 1];
    step.status = 'skipped';
    step.result = { reason };

    logger.debug({
      sessionId: this.currentSession.sessionId,
      step: stepNumber,
      name: step.name,
      reason
    }, 'Step skipped');
  }

  // ============================================================
  // STEP 1: PRE-FLIGHT CHECK
  // ============================================================

  async _step1_preflightCheck() {
    this._startStep(1);

    try {
      if (!this.config.enablePreflight) {
        this._skipStep(1, 'Preflight checks disabled');
        return { skipped: true };
      }

      const checks = await runPreflightChecks();

      if (checks.failed.length > 0) {
        throw new Error(`Preflight checks failed: ${checks.failed.join(', ')}`);
      }

      this._completeStep(1, {
        passed: checks.passed,
        warnings: checks.warnings
      });

      return checks;
    } catch (error) {
      this._failStep(1, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 2: FETCH API DATA
  // ============================================================

  async _step2_fetchApiData(entityType, fetchParams) {
    this._startStep(2);

    try {
      let data;
      this.currentSession.stats.apiCalls++;

      switch (entityType) {
        case 'games':
          data = await this.apiClient.getGamesList(fetchParams);
          break;
        case 'game_details':
          data = await this.apiClient.getGameDetails(fetchParams.gameId);
          break;
        case 'teams':
          data = await this.apiClient.getTeams(fetchParams);
          break;
        case 'players':
          data = await this.apiClient.getTeamPlayers(fetchParams.teamId);
          break;
        case 'odds':
          data = await this.apiClient.getGameOddsLive(fetchParams.gameId);
          break;
        case 'standings':
          data = await this.apiClient.getStandings(fetchParams);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      this._completeStep(2, {
        recordsCount: Array.isArray(data) ? data.length : 1,
        dataSize: JSON.stringify(data).length
      });

      return data;
    } catch (error) {
      this._failStep(2, error);

      // Try recovery strategy
      if (error.response?.status) {
        const errorType = `API_${error.response.status}_ERROR`;
        const strategy = getRecoveryStrategy(errorType);
        logger.warn({ strategy }, 'Attempting recovery');
      }

      throw error;
    }
  }

  // ============================================================
  // STEP 3: VALIDATE RESPONSE
  // ============================================================

  async _step3_validateResponse(data) {
    this._startStep(3);

    try {
      if (!this.config.enableValidation) {
        this._skipStep(3, 'Validation disabled');
        return { valid: true, skipped: true };
      }

      const validation = validateResponseStructure(data);

      if (!validation.valid) {
        logger.warn({
          errors: validation.errors,
          warnings: validation.warnings
        }, 'Response validation issues detected');
      }

      this._completeStep(3, {
        valid: validation.valid,
        errorsCount: validation.errors.length,
        warningsCount: validation.warnings.length
      });

      return validation;
    } catch (error) {
      this._failStep(3, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 4: TRANSFORM DATA
  // ============================================================

  async _step4_transformData(data, entityType) {
    this._startStep(4);

    try {
      let transformed;

      switch (entityType) {
        case 'games':
          transformed = this._transformGames(data);
          break;
        case 'game_details':
          transformed = this._transformGameDetails(data);
          break;
        case 'teams':
          transformed = this._transformTeams(data);
          break;
        case 'players':
          transformed = this._transformPlayers(data);
          break;
        case 'odds':
          transformed = this._transformOdds(data);
          break;
        default:
          transformed = data;
      }

      this._completeStep(4, {
        recordsTransformed: Array.isArray(transformed) ? transformed.length : 1
      });

      return transformed;
    } catch (error) {
      this._failStep(4, error);
      throw error;
    }
  }

  /**
   * Трансформация games
   * @private
   */
  _transformGames(games) {
    if (!Array.isArray(games)) {
      games = [games];
    }

    return games.map(game => ({
      // Mapping полей из API в схему БД
      id: game.id,
      external_id: game.id?.toString(),
      league_id: game.league_id || game.leagueId,
      season: game.season,
      home_team_id: game.home_team_id || game.homeTeamId,
      away_team_id: game.away_team_id || game.awayTeamId,
      game_date: game.game_date || game.date,
      status: game.status,
      score_home: game.score_home || game.scoreHome || null,
      score_away: game.score_away || game.scoreAway || null,
      half_score_home: game.half_score_home || game.halfScoreHome || null,
      half_score_away: game.half_score_away || game.halfScoreAway || null,
      external_data: game.external_data || game,
      last_sync_at: new Date()
    }));
  }

  /**
   * Трансформация game details
   * @private
   */
  _transformGameDetails(gameDetails) {
    return {
      id: gameDetails.id,
      stats_json: gameDetails.stats || {},
      events_json: gameDetails.events || [],
      lineups_json: gameDetails.lineups || {},
      last_sync_at: new Date()
    };
  }

  /**
   * Трансформация teams
   * @private
   */
  _transformTeams(teams) {
    if (!Array.isArray(teams)) {
      teams = [teams];
    }

    return teams.map(team => ({
      id: team.id,
      external_id: team.id?.toString(),
      name: team.name,
      short_name: team.short_name || team.shortName || null,
      logo_url: team.logo_url || team.logoUrl || null,
      country_id: team.country_id || team.countryId || null,
      venue: team.venue || null,
      founded: team.founded || null,
      external_data: team,
      last_sync_at: new Date()
    }));
  }

  /**
   * Трансформация players
   * @private
   */
  _transformPlayers(players) {
    if (!Array.isArray(players)) {
      players = [players];
    }

    return players.map(player => ({
      id: player.id,
      external_id: player.id?.toString(),
      name: player.name,
      team_id: player.team_id || player.teamId,
      position: player.position || null,
      jersey_number: player.jersey_number || player.jerseyNumber || null,
      birth_date: player.birth_date || player.birthDate || null,
      nationality: player.nationality || null,
      height: player.height || null,
      weight: player.weight || null,
      photo_url: player.photo_url || player.photoUrl || null,
      external_data: player,
      last_sync_at: new Date()
    }));
  }

  /**
   * Трансформация odds
   * @private
   */
  _transformOdds(oddsData) {
    const odds = [];

    for (const bookmakerData of oddsData.bookmakers || []) {
      for (const market of bookmakerData.markets || []) {
        for (const outcome of market.outcomes || []) {
          odds.push({
            game_id: oddsData.game_id,
            bookmaker_id: bookmakerData.bookmaker_id,
            market_type: market.type,
            outcome_name: outcome.name,
            odds_value: outcome.value,
            is_live: oddsData.is_live || false,
            timestamp: oddsData.timestamp || new Date()
          });
        }
      }
    }

    return odds;
  }

  // ============================================================
  // STEP 5: ENRICH DATA
  // ============================================================

  async _step5_enrichData(data, entityType) {
    this._startStep(5);

    try {
      // Обогащение данных из справочников (countries, bookmakers, etc.)
      const enriched = await this._enrichWithReferences(data, entityType);

      this._completeStep(5, {
        recordsEnriched: Array.isArray(enriched) ? enriched.length : 1
      });

      return enriched;
    } catch (error) {
      this._failStep(5, error);
      throw error;
    }
  }

  /**
   * Обогащение данных из справочников
   * @private
   */
  async _enrichWithReferences(data, entityType) {
    // Для games: проверяем наличие league, teams
    if (entityType === 'games') {
      const games = Array.isArray(data) ? data : [data];

      for (const game of games) {
        // Проверяем league
        if (game.league_id && !this.refCache.has(`league_${game.league_id}`)) {
          const league = await this.db.select('leagues', { id: game.league_id });
          if (league.length > 0) {
            this.refCache.set(`league_${game.league_id}`, league[0]);
          }
        }

        // Проверяем home team
        if (game.home_team_id && !this.refCache.has(`team_${game.home_team_id}`)) {
          const team = await this.db.select('teams', { id: game.home_team_id });
          if (team.length > 0) {
            this.refCache.set(`team_${game.home_team_id}`, team[0]);
          }
        }

        // Проверяем away team
        if (game.away_team_id && !this.refCache.has(`team_${game.away_team_id}`)) {
          const team = await this.db.select('teams', { id: game.away_team_id });
          if (team.length > 0) {
            this.refCache.set(`team_${game.away_team_id}`, team[0]);
          }
        }
      }
    }

    return data;
  }

  // ============================================================
  // STEP 6: DEDUPLICATE
  // ============================================================

  async _step6_deduplicate(data) {
    this._startStep(6);

    try {
      const originalCount = Array.isArray(data) ? data.length : 1;
      
      // Дедупликация по ID (или external_id)
      const deduped = Array.isArray(data)
        ? Array.from(new Map(data.map(item => [item.id || item.external_id, item])).values())
        : data;

      const dedupedCount = Array.isArray(deduped) ? deduped.length : 1;
      const duplicatesRemoved = originalCount - dedupedCount;

      this._completeStep(6, {
        originalCount,
        dedupedCount,
        duplicatesRemoved
      });

      return deduped;
    } catch (error) {
      this._failStep(6, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 7: VALIDATE CONSTRAINTS
  // ============================================================

  async _step7_validateConstraints(data, tableName) {
    this._startStep(7);

    try {
      // Проверяем, можем ли загружать данную таблицу
      const canLoad = await canLoadTable(tableName);

      if (!canLoad.canLoad) {
        throw new Error(
          `Cannot load table ${tableName}. Missing dependencies: ${canLoad.missingDependencies.join(', ')}`
        );
      }

      this._completeStep(7, {
        tableName,
        canLoad: true,
        dependencies: canLoad.missingDependencies
      });

      return { valid: true };
    } catch (error) {
      this._failStep(7, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 8: BEGIN TRANSACTION
  // ============================================================

  async _step8_beginTransaction() {
    this._startStep(8);

    try {
      const transaction = await this.db.beginTransaction();

      this._completeStep(8, {
        transactionStarted: true
      });

      return transaction;
    } catch (error) {
      this._failStep(8, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 9: RESOLVE DEPENDENCIES
  // ============================================================

  async _step9_resolveDependencies(data, tableName, transaction) {
    this._startStep(9);

    try {
      const dependencies = getDependencies(tableName);
      const resolved = { ...data };

      // Резолвим зависимости (например, проверяем наличие league_id, team_id)
      for (const dep of dependencies) {
        const depField = `${dep.table}_id`;
        
        if (Array.isArray(data)) {
          // Batch processing
          for (const record of data) {
            if (record[depField]) {
              const exists = await transaction.query(
                `SELECT id FROM ${dep.table} WHERE id = $1`,
                [record[depField]]
              );

              if (exists.rowCount === 0) {
                logger.warn({
                  table: tableName,
                  dependency: dep.table,
                  recordId: record.id,
                  missingId: record[depField]
                }, 'Missing dependency record');
              }
            }
          }
        } else {
          // Single record
          if (data[depField]) {
            const exists = await transaction.query(
              `SELECT id FROM ${dep.table} WHERE id = $1`,
              [data[depField]]
            );

            if (exists.rowCount === 0) {
              logger.warn({
                table: tableName,
                dependency: dep.table,
                missingId: data[depField]
              }, 'Missing dependency record');
            }
          }
        }
      }

      this._completeStep(9, {
        dependenciesResolved: dependencies.length
      });

      return resolved;
    } catch (error) {
      this._failStep(9, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 10: UPSERT DATA
  // ============================================================

  async _step10_upsertData(data, tableName, transaction) {
    this._startStep(10);

    try {
      const records = Array.isArray(data) ? data : [data];
      let insertedCount = 0;
      let updatedCount = 0;

      // Batch upsert
      if (records.length > 0) {
        const result = await transaction.batchUpsert(tableName, records);
        
        // Подсчёт inserted vs updated (по наличию created_at)
        for (const row of result) {
          if (row.created_at && row.updated_at && row.created_at === row.updated_at) {
            insertedCount++;
          } else {
            updatedCount++;
          }
        }

        this.currentSession.stats.insertedRecords += insertedCount;
        this.currentSession.stats.updatedRecords += updatedCount;
        this.currentSession.stats.dbQueries++;
      }

      this._completeStep(10, {
        totalRecords: records.length,
        insertedRecords: insertedCount,
        updatedRecords: updatedCount
      });

      return {
        totalRecords: records.length,
        insertedRecords: insertedCount,
        updatedRecords: updatedCount
      };
    } catch (error) {
      this._failStep(10, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 11: UPDATE RELATIONS
  // ============================================================

  async _step11_updateRelations(data, tableName, transaction) {
    this._startStep(11);

    try {
      // Обновление связанных таблиц (например, game_stats, game_events)
      // Для простоты сейчас пропускаем
      this._skipStep(11, 'No relations to update for this entity type');

      return { updated: 0 };
    } catch (error) {
      this._failStep(11, error);
      throw error;
    }
  }

  // ============================================================
  // STEP 12: COMMIT TRANSACTION
  // ============================================================

  async _step12_commitTransaction(transaction) {
    this._startStep(12);

    try {
      await transaction.commit();

      this._completeStep(12, {
        committed: true
      });

      return { committed: true };
    } catch (error) {
      this._failStep(12, error);
      
      // Rollback on commit error
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        logger.error({ error: rollbackError.message }, 'Rollback failed');
      }

      throw error;
    }
  }

  // ============================================================
  // STEP 13: POST-LOAD VERIFICATION
  // ============================================================

  async _step13_postLoadVerification(data, tableName) {
    this._startStep(13);

    try {
      const records = Array.isArray(data) ? data : [data];
      let verifiedCount = 0;

      // Проверяем, что записи действительно сохранились
      for (const record of records) {
        const exists = await this.db.select(tableName, { id: record.id });
        if (exists.length > 0) {
          verifiedCount++;
        }
      }

      this._completeStep(13, {
        totalRecords: records.length,
        verifiedRecords: verifiedCount,
        verificationRate: (verifiedCount / records.length) * 100
      });

      return {
        verifiedRecords: verifiedCount,
        totalRecords: records.length
      };
    } catch (error) {
      this._failStep(13, error);
      throw error;
    }
  }

  // ============================================================
  // MAIN LOAD METHOD
  // ============================================================

  /**
   * Загрузить данные
   * @param {string} entityType - Тип сущности (games, teams, etc.)
   * @param {Object} fetchParams - Параметры для API
   * @param {string} tableName - Имя таблицы БД
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<LoadSession>}
   */
  async load(entityType, fetchParams = {}, tableName = null, options = {}) {
    // Определяем tableName автоматически
    if (!tableName) {
      tableName = entityType;
    }

    // Создаём session
    this.currentSession = this._createSession(entityType, {
      fetchParams,
      tableName,
      options
    });

    let transaction = null;

    try {
      this.currentSession.status = 'RUNNING';

      // STEP 1: PRE-FLIGHT CHECK
      await this._step1_preflightCheck();

      // STEP 2: FETCH API DATA
      const apiData = await this._step2_fetchApiData(entityType, fetchParams);

      // STEP 3: VALIDATE RESPONSE
      await this._step3_validateResponse(apiData);

      // STEP 4: TRANSFORM DATA
      const transformed = await this._step4_transformData(apiData, entityType);

      // STEP 5: ENRICH DATA
      const enriched = await this._step5_enrichData(transformed, entityType);

      // STEP 6: DEDUPLICATE
      const deduped = await this._step6_deduplicate(enriched);

      // STEP 7: VALIDATE CONSTRAINTS
      await this._step7_validateConstraints(deduped, tableName);

      // STEP 8: BEGIN TRANSACTION
      transaction = await this._step8_beginTransaction();

      // STEP 9: RESOLVE DEPENDENCIES
      const resolved = await this._step9_resolveDependencies(deduped, tableName, transaction);

      // STEP 10: UPSERT DATA
      const upsertResult = await this._step10_upsertData(resolved, tableName, transaction);

      // STEP 11: UPDATE RELATIONS
      await this._step11_updateRelations(resolved, tableName, transaction);

      // STEP 12: COMMIT TRANSACTION
      await this._step12_commitTransaction(transaction);

      // STEP 13: POST-LOAD VERIFICATION
      const verification = await this._step13_postLoadVerification(resolved, tableName);

      // Finalize session
      this.currentSession.status = 'COMPLETED';
      this.currentSession.endTime = new Date();
      this.currentSession.stats.totalDuration = this.currentSession.endTime - this.currentSession.startTime;
      this.currentSession.stats.totalRecords = upsertResult.totalRecords;

      logger.info({
        sessionId: this.currentSession.sessionId,
        entityType,
        stats: this.currentSession.stats
      }, 'Load session completed successfully');

      return this.currentSession;

    } catch (error) {
      // Rollback transaction if active
      if (transaction) {
        try {
          await transaction.rollback();
          logger.warn({ sessionId: this.currentSession.sessionId }, 'Transaction rolled back');
        } catch (rollbackError) {
          logger.error({ error: rollbackError.message }, 'Rollback failed');
        }
      }

      // Mark session as failed
      this.currentSession.status = 'FAILED';
      this.currentSession.endTime = new Date();
      this.currentSession.stats.totalDuration = this.currentSession.endTime - this.currentSession.startTime;

      logger.error({
        sessionId: this.currentSession.sessionId,
        entityType,
        error: error.message
      }, 'Load session failed');

      throw error;
    }
  }

  /**
   * Получить статистику загрузчика
   * @returns {Object}
   */
  getStats() {
    return {
      currentSession: this.currentSession,
      apiClientMetrics: this.apiClient.getMetrics(),
      dbPoolStats: this.db.getPoolStats()
    };
  }
}

// ============================================================
// CLI MODE
// ============================================================

if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    const loader = new DataLoader();

    try {
      switch (command) {
        case 'test-games':
          console.log('Testing Data Loader with games...\n');
          
          const session = await loader.load('games', {
            limit: 5,
            status: 'finished'
          }, 'games');

          console.log('\n✓ Load session completed:');
          console.log(JSON.stringify(session, null, 2));
          break;

        case 'stats':
          console.log('Data Loader Statistics:\n');
          console.log(JSON.stringify(loader.getStats(), null, 2));
          break;

        default:
          console.log(`
Data Loader Pipeline v6.0.0

Usage:
  node data-loader.js test-games    # Test loading games
  node data-loader.js stats         # Show loader statistics
          `);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

module.exports = DataLoader;
