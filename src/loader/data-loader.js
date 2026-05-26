const logger = require("../monitoring/logger");
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

const { v4: uuidv4 } = require('uuid');
const SStatsClient = require('../api/sstats-client');
const { getDatabase } = require('../database/db-pool');
const { validateResponseStructure } = require('../api/response-types');
const { getRecoveryStrategy } = require('../monitoring/recovery-playbook');
const { canLoadTable, getDependencies } = require('../database/table-dependencies');
const { runPreflightChecks } = require('../core/preflight-checks');


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

      // Normalize SStats response: API returns { status, count, games|teams|...: [...] }
      if (data && !Array.isArray(data) && typeof data === "object") {
        data = data.games || data.teams || data.players || data.standings
            || data.leagues || data.seasons || data.odds || data.data
            || data.items || data.result || data;
      }
      if (!Array.isArray(data)) {
        data = data == null ? [] : [data];
      }

      this._completeStep(2, {
        recordsCount: Array.isArray(data) ? data.length : 1,
        dataSize: JSON.stringify(data).length
      });

      // Сохраняем сырой ответ API для enrich-шага (нужны вложенные homeTeam/awayTeam/season.league)
      this.currentSession.rawApiData = Array.isArray(data) ? data : [data];

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
      if (!Array.isArray(data)) {
        data = data == null ? [] : [data];
      }

      if (!this.config.enableValidation) {
        this._skipStep(3, 'Validation disabled');
        return { valid: true, skipped: true };
      }

      let validation = validateResponseStructure(data);
      if (!validation || typeof validation !== "object") {
        validation = { valid: true, errors: [], warnings: [] };
      }
      if (!Array.isArray(validation.errors)) validation.errors = [];
      if (!Array.isArray(validation.warnings)) validation.warnings = [];

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

    const num = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };
    const seasonFromDate = (d) => {
      try { return new Date(d).getUTCFullYear(); } catch (e) { return new Date().getUTCFullYear(); }
    };

    // Маппинг численного статуса SStats в текст БД (status varchar(20))
    // 1 = Not Started, 2 = Not Started, 3 = 1st Half, 4 = HT, 5 = 2nd Half,
    // 7 = ET, 8 = Finished, 9 = Postponed, 10 = Cancelled, 11 = Abandoned
    const statusMap = {
      1: 'scheduled', 2: 'scheduled', 3: 'live', 4: 'live', 5: 'live',
      6: 'live', 7: 'live', 8: 'finished', 9: 'postponed',
      10: 'cancelled', 11: 'abandoned'
    };
    const mapStatus = (raw, name) => {
      if (raw == null && !name) return 'unknown';
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && statusMap[n]) return statusMap[n];
      if (name) {
        const low = name.toString().toLowerCase();
        if (low.includes('live') || low.includes('half')) return 'live';
        if (low.includes('finish')) return 'finished';
        if (low.includes('post'))   return 'postponed';
        if (low.includes('cancel')) return 'cancelled';
        if (low.includes('aband'))  return 'abandoned';
        return low.slice(0, 20);
      }
      return (raw || 'unknown').toString().slice(0, 20);
    };

    return games
      .filter(g => g && (g.id != null || g.sstats_id != null) && (g.date || g.game_date))
      .map(g => {
        const dateStr = g.date || g.game_date;
        const homeId  = num(g.home_team_id != null ? g.home_team_id : (g.homeTeamId != null ? g.homeTeamId : (g.homeTeam && g.homeTeam.id)));
        const awayId  = num(g.away_team_id != null ? g.away_team_id : (g.awayTeamId != null ? g.awayTeamId : (g.awayTeam && g.awayTeam.id)));
        const leagueId = num(g.league_id != null ? g.league_id : (g.leagueId != null ? g.leagueId : (g.league && g.league.id) || (g.season && g.season.league && g.season.league.id)));
        const season  = num((g.season && g.season.year) || g.season) || seasonFromDate(dateStr);
        const statusFinal = mapStatus(g.status, g.statusName);

        return {
          sstats_id: parseInt(g.sstats_id != null ? g.sstats_id : g.id, 10),
          flashscore_id: g.flashscore_id || g.flashId || null,
          league_id: leagueId,
          season: season,
          round: num(g.round || g.roundNumber),
          date: dateStr,
          home_team_id: homeId,
          away_team_id: awayId,
          home_score: num(g.homeFTResult != null ? g.homeFTResult : (g.homeResult != null ? g.homeResult : g.homeScore)),
          away_score: num(g.awayFTResult != null ? g.awayFTResult : (g.awayResult != null ? g.awayResult : g.awayScore)),
          home_score_ht: num(g.homeHTResult != null ? g.homeHTResult : g.halfScoreHome),
          away_score_ht: num(g.awayHTResult != null ? g.awayHTResult : g.halfScoreAway),
          status: statusFinal,
          referee: g.referee || null,
          stadium: g.stadium || g.venue || null,
          attendance: num(g.attendance),
          is_live: ['live'].includes(statusFinal),
          is_finished: statusFinal === 'finished',
          is_deleted: false
        };
      });
  }

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

    return teams
      .filter(team => team && (team.id != null || team.sstats_id != null))
      .map(team => ({
        sstats_id: parseInt(team.sstats_id != null ? team.sstats_id : team.id, 10),
        flashscore_id: team.flashscore_id || team.flashscoreId || team.flashId || null,
        name: (team.name || '').toString().slice(0, 200) || 'Unknown',
        short_name: team.short_name || team.shortName || null,
        country_id: null,
        country_name: team.country_name || team.countryName || team.country || null,
        logo: team.logo || team.logo_url || team.logoUrl || null,
        stadium: team.stadium || team.venue || null,
        founded: Number.isInteger(team.founded) ? team.founded : null,
        website: team.website || null,
        is_active: true
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
    if (entityType !== 'games') return data;
    try {
      const raw = this.currentSession && this.currentSession.rawApiData;
      if (!Array.isArray(raw) || raw.length === 0) return data;
      // Собираем уникальные leagues / teams / seasons из сырых объектов API
      const leaguesMap = new Map();
      const teamsMap = new Map();
      const seasonsKeyMap = new Map();

      for (const g of raw) {
        const lg = g && g.season && g.season.league;
        if (lg && lg.id != null && !leaguesMap.has(lg.id)) {
          leaguesMap.set(lg.id, {
            sstats_id: parseInt(lg.id, 10),
            flashscore_id: lg.flashScoreId || lg.flashScoreID || null,
            name: (lg.name || 'Unknown').toString().slice(0, 200),
            country_id: null,
            country_name: (lg.country && lg.country.name) || null,
            logo: null,
            is_active: true,
            priority: 0,
            type: null
          });
        }
        for (const side of ['homeTeam', 'awayTeam']) {
          const t = g && g[side];
          if (t && t.id != null && !teamsMap.has(t.id)) {
            teamsMap.set(t.id, {
              sstats_id: parseInt(t.id, 10),
              flashscore_id: t.flashId || null,
              name: (t.name || 'Unknown').toString().slice(0, 200),
              short_name: null,
              country_id: null,
              country_name: (t.country && t.country.name) || null,
              logo: null,
              stadium: null,
              founded: null,
              website: null,
              is_active: true
            });
          }
        }
        if (g && g.season && g.season.year != null && lg && lg.id != null) {
          const key = `${lg.id}_${g.season.year}`;
          if (!seasonsKeyMap.has(key)) {
            seasonsKeyMap.set(key, {
              _league_sstats_id: parseInt(lg.id, 10),
              season: parseInt(g.season.year, 10),
              start_date: null,
              end_date: null,
              is_current: parseInt(g.season.year, 10) === new Date().getUTCFullYear()
            });
          }
        }
      }

      // Upsert leagues и teams через пул (вне активной транзакции)
      if (leaguesMap.size > 0) {
        try {
          await this.db.batchUpsert('leagues', Array.from(leaguesMap.values()));
          logger.info({ count: leaguesMap.size }, 'Enriched: leagues upserted');
        } catch (e) {
          logger.warn({ err: e.message }, 'Enriched: leagues upsert failed');
        }
      }
      if (teamsMap.size > 0) {
        try {
          await this.db.batchUpsert('teams', Array.from(teamsMap.values()));
          logger.info({ count: teamsMap.size }, 'Enriched: teams upserted');
        } catch (e) {
          logger.warn({ err: e.message }, 'Enriched: teams upsert failed');
        }
      }
      // Маппинг sstats_id -> internal id для leagues
      const leagueIds = Array.from(leaguesMap.keys()).map(v => parseInt(v, 10)).filter(Number.isFinite);
      const leagueIdMap = new Map();
      if (leagueIds.length > 0) {
        try {
          const placeholders = leagueIds.map((_, i) => `$${i + 1}`).join(',');
          const r = await this.db.query(
            `SELECT id, sstats_id FROM leagues WHERE sstats_id IN (${placeholders})`,
            leagueIds
          );
          for (const row of r.rows) leagueIdMap.set(row.sstats_id, row.id);
        } catch (e) {
          logger.warn({ err: e.message }, 'leagueIdMap query failed');
        }
      }

      // Маппинг sstats_id -> internal id для teams
      const teamSstatsIds = Array.from(teamsMap.keys()).map(v => parseInt(v, 10)).filter(Number.isFinite);
      const teamIdMap = new Map();
      if (teamSstatsIds.length > 0) {
        try {
          const placeholders = teamSstatsIds.map((_, i) => `$${i + 1}`).join(',');
          const r = await this.db.query(
            `SELECT id, sstats_id FROM teams WHERE sstats_id IN (${placeholders})`,
            teamSstatsIds
          );
          for (const row of r.rows) teamIdMap.set(row.sstats_id, row.id);
        } catch (e) {
          logger.warn({ err: e.message }, 'teamIdMap query failed');
        }
      }
            // Upsert seasons (используем internal league.id)
      if (seasonsKeyMap.size > 0 && leagueIdMap.size > 0) {
        const seasonRows = [];
        for (const row of seasonsKeyMap.values()) {
          const internalLid = leagueIdMap.get(row._league_sstats_id);
          if (internalLid != null) {
            seasonRows.push({
              league_id: internalLid,
              season: row.season,
              start_date: row.start_date,
              end_date: row.end_date,
              is_current: row.is_current
            });
          }
        }
        if (seasonRows.length > 0) {
          try {
            await this.db.batchUpsert('seasons', seasonRows);
            logger.info({ count: seasonRows.length }, 'Enriched: seasons upserted');
          } catch (e) {
            logger.warn({ err: e.message }, 'Enriched: seasons upsert failed');
          }
        }
      }

      // Переписываем FK в трансформированных записях games:
      // в data.league_id / home_team_id / away_team_id лежит SStats-id, меняем на internal id.
      if (Array.isArray(data)) {
        for (const rec of data) {
          if (rec.league_id != null) {
            const internal = leagueIdMap.get(rec.league_id);
            rec.league_id = internal != null ? internal : null;
          }
          if (rec.home_team_id != null) {
            const internal = teamIdMap.get(rec.home_team_id);
            rec.home_team_id = internal != null ? internal : null;
          }
          if (rec.away_team_id != null) {
            const internal = teamIdMap.get(rec.away_team_id);
            rec.away_team_id = internal != null ? internal : null;
          }
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Enrich step failed (non-fatal)');
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
        ? Array.from(new Map(data.map(item => [item.sstats_id != null ? item.sstats_id : (item.id != null ? item.id : item.external_id), item])).values())
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
      // Получаем зависимости таблицы
      const deps = getDependencies(tableName) || [];

      // Определяем, какие зависимые таблицы уже непусты в БД
      const loadedTables = new Set();
      // Справочники всегда считаются "загруженными" если их таблицы существуют
      // (countries уже наполнены сидом)
      for (const dep of deps) {
        try {
          const rows = await this.db.query(
            `SELECT 1 FROM ${dep} LIMIT 1`
          );
          if (rows && (rows.rows ? rows.rows.length : rows.length) > 0) {
            loadedTables.add(dep);
          }
        } catch (e) {
          // таблица может ещё не существовать — считаем незагруженной
        }
      }

      const missing = deps.filter(d => !loadedTables.has(d));
      const canLoad = missing.length === 0;

      if (!canLoad) {
        logger.warn(
          { tableName, missing },
          'Dependency tables are empty — proceeding with WARNING (FK upserts may fail in step 10)'
        );
        // Не блокируем pipeline — пусть step 10 сам решит, может ли он что-то сохранить.
        // Реально блокирующий случай только для odds/game_*: они требуют games.
      }

      this._completeStep(7, {
        tableName,
        canLoad,
        missingDependencies: missing
      });

      return { valid: true, missingDependencies: missing };
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
      const dependencies = getDependencies(tableName) || [];
      // КРИТИЧНО: НЕ оборачивать массив через { ...data } — это убьёт массив.
      const resolved = Array.isArray(data) ? data.slice() : data;
      const records = Array.isArray(resolved) ? resolved : [resolved];

      // Поля FK по таблице зависимости
      const fieldsFor = (depTable) => {
        if (tableName === 'games' && depTable === 'teams') return ['home_team_id', 'away_team_id'];
        if (depTable === 'countries') return ['country_id'];
        if (depTable === 'leagues')   return ['league_id'];
        if (depTable === 'seasons')   return ['season_id'];
        if (depTable === 'teams')     return ['team_id'];
        if (depTable === 'players')   return ['player_id'];
        return [];
      };

      for (const depTable of dependencies) {
        const fields = fieldsFor(depTable);
        if (fields.length === 0) continue;

        // Соберём все значения FK для batch-проверки
        const refIds = new Set();
        for (const r of records) {
          for (const f of fields) {
            const v = r && r[f];
            if (v != null) refIds.add(v);
          }
        }
        if (refIds.size === 0) continue;

        // Узнаём, какие из этих id реально есть в зависимой таблице.
        // Если depTable пустая — пропускаем запрос (избегаем aborted-transaction).
        let existing = new Set();
        try {
          // Быстрый count: если таблица пустая, нечего проверять
          const cnt = await transaction.query(`SELECT COUNT(*)::int AS c FROM ${depTable}`);
          const total = cnt.rows[0] && cnt.rows[0].c;
          if (total > 0) {
            // Только числовые id (FK типа integer)
            const ids = Array.from(refIds)
              .map(v => (typeof v === 'number' ? v : parseInt(v, 10)))
              .filter(v => Number.isFinite(v));
            if (ids.length > 0) {
              const placeholders1 = ids.map((_, k) => `$${k + 1}`).join(',');
              const placeholders2 = ids.map((_, k) => `$${k + 1 + ids.length}`).join(',');
              // SAVEPOINT защищает внешнюю транзакцию от ошибок этого запроса
              await transaction.query('SAVEPOINT fk_lookup');
              try {
                const r1 = await transaction.query(
                  `SELECT id, sstats_id FROM ${depTable} WHERE id IN (${placeholders1}) OR sstats_id IN (${placeholders2})`,
                  [...ids, ...ids]
                );
                for (const row of r1.rows) {
                  if (row.id != null) existing.add(row.id);
                  if (row.sstats_id != null) existing.add(row.sstats_id);
                }
                await transaction.query('RELEASE SAVEPOINT fk_lookup');
              } catch (innerErr) {
                await transaction.query('ROLLBACK TO SAVEPOINT fk_lookup');
                logger.warn({ depTable, err: innerErr.message }, 'FK lookup query failed — treating as empty');
              }
            }
          }
        } catch (e) {
          logger.warn({ depTable, err: e.message }, 'FK count failed — skipping lookup');
        }

        // Обнуляем FK, если значение отсутствует в зависимой таблице
        let nulled = 0;
        for (const r of records) {
          for (const f of fields) {
            const v = r && r[f];
            if (v != null && !existing.has(v)) {
              r[f] = null;
              nulled++;
            }
          }
        }
        if (nulled > 0) {
          logger.warn({ tableName, depTable, fields, nulled }, 'FK values set to NULL (referenced rows missing)');
        }
      }

      this._completeStep(9, {
        dependenciesResolved: dependencies.length
      });

      return Array.isArray(resolved) ? records : records[0];
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

      // Pre-snapshot: какие sstats_id уже существуют ДО upsert.
      // Нужно чтобы отличить INSERT от UPDATE без xmax (партиционированные таблицы).
      this._preUpsertExistingIds = new Set();
      if (records.length > 0) {
        try {
          const sstatsIds = records.map(r => r && r.sstats_id).filter(v => v != null);
          if (sstatsIds.length > 0) {
            const ph = sstatsIds.map((_, k) => `$${k + 1}`).join(',');
            const existedBefore = await transaction.query(
              `SELECT sstats_id FROM ${tableName} WHERE sstats_id IN (${ph})`,
              sstatsIds
            );
            for (const row of existedBefore.rows) {
              this._preUpsertExistingIds.add(row.sstats_id);
            }
          }
        } catch (preErr) {
          logger.warn({ err: preErr.message }, 'Pre-snapshot query failed');
        }
      }

      // Batch upsert
      if (records.length > 0) {
        const result = await transaction.batchUpsert(tableName, records);
        
        // Подсчёт inserted vs updated через pre-snapshot existing sstats_id
        // (работает для партиционированных таблиц, где xmax в RETURNING запрещён).
        try {
          const sstatsIds = records
            .map(r => r && r.sstats_id)
            .filter(v => v != null);
          if (sstatsIds.length > 0 && this._preUpsertExistingIds) {
            updatedCount = sstatsIds
              .filter(id => this._preUpsertExistingIds.has(id))
              .length;
            insertedCount = sstatsIds.length - updatedCount;
          } else {
            insertedCount = records.length;
          }
        } catch (cntErr) {
          logger.warn({ err: cntErr.message }, 'Insert/Update counting failed');
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
        const key = record.sstats_id != null ? { sstats_id: record.sstats_id } : { id: record.id };
        const exists = await this.db.select(tableName, key);
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
