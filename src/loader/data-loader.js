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

    this.apiClient = config.apiClient || new SStatsClient({ apiKey: this.config.apiKey });
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
   * Записать начало load run в loader_runs (audit).
   * Fire-and-forget: ошибки не валят пайплайн.
   * @private
   */
  async _persistRunStart() {
    try {
      const sess = this.currentSession;
      if (!sess) return;
      await this.db.query(
        `INSERT INTO loader_runs (run_id, mode, status, params, started_at, total_steps)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (run_id) DO NOTHING`,
        [
          sess.sessionId,
          sess.entityType || 'unknown',
          'RUNNING',
          JSON.stringify(sess.metadata || {}),
          sess.startTime,
          (sess.steps || []).length
        ]
      );
    } catch (e) {
      logger.warn({ err: e.message }, 'audit: _persistRunStart failed');
    }
  }

  /**
   * Записать завершение load run.
   * @private
   * @param {string} status - 'COMPLETED' | 'FAILED'
   * @param {string|null} errorMessage
   */
  async _persistRunEnd(status, errorMessage = null) {
    try {
      const sess = this.currentSession;
      if (!sess) return;
      const completed = (sess.steps || []).filter(s => s.status === 'completed').length;
      const failed = (sess.steps || []).filter(s => s.status === 'failed').length;
      const endTime = sess.endTime || new Date();
      const duration = sess.startTime ? (endTime - sess.startTime) : null;
      await this.db.query(
        `UPDATE loader_runs
         SET status = $2,
             completed_at = $3,
             duration_ms = $4,
             completed_steps = $5,
             failed_steps = $6,
             error_message = $7
         WHERE run_id = $1`,
        [sess.sessionId, status, endTime, duration, completed, failed, errorMessage]
      );
    } catch (e) {
      logger.warn({ err: e.message }, 'audit: _persistRunEnd failed');
    }
  }

  /**
   * Записать результат шага в loader_step_results (UPSERT по run_id,step_name).
   * @private
   * @param {number} stepNumber
   */
  async _persistStepResult(stepNumber) {
    try {
      const sess = this.currentSession;
      if (!sess) return;
      const step = sess.steps[stepNumber - 1];
      if (!step) return;

      const r = (step.result && typeof step.result === 'object') ? step.result : {};
      const recordsProcessed = r.totalRecords ?? r.recordsProcessed ?? null;
      const recordsInserted  = r.insertedRecords ?? null;
      const recordsUpdated   = r.updatedRecords ?? null;
      const recordsFailed    = r.failedRecords ?? null;

      const isCompleted = step.status === 'completed';
      const isFailed = step.status === 'failed';

      await this.db.query(
        `INSERT INTO loader_step_results
           (run_id, step_name, step_order, status,
            records_processed, records_inserted, records_updated, records_failed,
            started_at, completed_at, failed_at, duration_ms,
            error_message, error_stack)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          sess.sessionId,
          step.name,
          stepNumber,
          step.status,
          recordsProcessed,
          recordsInserted,
          recordsUpdated,
          recordsFailed,
          step.startTime || null,
          isCompleted ? (step.endTime || null) : null,
          isFailed ? (step.endTime || null) : null,
          step.duration || null,
          step.error ? step.error.message : null,
          step.error && step.error.stack ? step.error.stack.slice(0, 5000) : null
        ]
      );
    } catch (e) {
      logger.warn({ err: e.message, step: stepNumber }, 'audit: _persistStepResult failed');
    }
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

    // Audit (fire-and-forget)
    this._persistStepResult(stepNumber).catch(() => {});
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

    // Audit (fire-and-forget)
    this._persistStepResult(stepNumber).catch(() => {});
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

    // Audit (fire-and-forget)
    this._persistStepResult(stepNumber).catch(() => {});
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

  /**
   * Постраничная загрузка games через offset-based pagination.
   * SStats возвращает максимум 1000 записей на запрос (limit=1000).
   * Останавливаемся когда data.length < limit (последняя страница).
   * @private
   */
  async _fetchGamesListPaginated(fetchParams) {
    const PAGE_LIMIT = 1000;
    const MAX_PAGES = 50; // anti-loop guard (50000 игр в день — невероятно)
    const all = [];
    let offset = 0;
    let page = 0;
    const baseParams = { ...fetchParams, limit: PAGE_LIMIT };

    while (page < MAX_PAGES) {
      const resp = await this.apiClient.getGamesList({ ...baseParams, offset });
      // SStats возвращает { status, count, data, offset, traceId }
      const items = Array.isArray(resp)
        ? resp
        : (resp && Array.isArray(resp.data) ? resp.data : []);

      if (this.currentSession) this.currentSession.stats.apiCalls++;

      logger.info({
        page: page + 1,
        offset,
        received: items.length,
        accumulated: all.length + items.length
      }, 'Games page fetched');

      if (items.length === 0) break;
      all.push(...items);

      // Последняя страница: получили меньше лимита
      if (items.length < PAGE_LIMIT) break;

      offset += PAGE_LIMIT;
      page++;
    }

    if (page >= MAX_PAGES) {
      logger.warn({ pages: page, total: all.length },
        'Pagination hit MAX_PAGES limit — data may be incomplete');
    }

    logger.info({
      totalPages: page + 1,
      totalGames: all.length,
      fetchParams
    }, 'Games pagination complete');

    return all;
  }

    async _step2_fetchApiData(entityType, fetchParams) {
    this._startStep(2);

    try {
      let data;
      // apiCalls инкрементируется внутри ветки entity (для games — на каждую страницу)
      switch (entityType) {
        case 'games':
          data = await this._fetchGamesListPaginated(fetchParams);
          break;
        case 'game_details':
          this.currentSession.stats.apiCalls++;
          data = await this.apiClient.getGameDetails(fetchParams.gameId);
          break;
        case 'teams':
          this.currentSession.stats.apiCalls++;
          data = await this.apiClient.getTeams(fetchParams);
          break;
        case 'players':
          this.currentSession.stats.apiCalls++;
          data = await this.apiClient.getTeamPlayers(fetchParams.teamId);
          break;
        case 'odds':
          this.currentSession.stats.apiCalls++;
          data = await this.apiClient.getGameOddsLive(fetchParams.gameId);
          break;
        case 'standings':
          this.currentSession.stats.apiCalls++;
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
    // gameDetails приходит как массив [data] после step 3/5 unwrap
    const raw = Array.isArray(gameDetails) ? (gameDetails[0] || {}) : (gameDetails || {});
    const d = raw.data ? raw.data : raw;
    const game = d.game || {};
    const gameSstatsId = game.id || d.id || raw.id;
    const gameDate = game.date || game.dateUtc || null;

    const num = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };
    const float = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (v, max) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      return max ? s.slice(0, max) : s;
    };

    const eventTypeMap = { 1: 'goal', 2: 'card', 3: 'substitution', 4: 'var', 5: 'penalty', 6: 'own_goal' };
    const mapEventType = (t) => eventTypeMap[parseInt(t, 10)] || 'other';

    let stadium = null;
    if (d.venue) {
      stadium = d.venue.name || null;
      if (stadium && d.venue.city) stadium = stadium + ', ' + d.venue.city;
    }

    const gameUpdate = {
      sstats_id: gameSstatsId,
      referee: str(d.refereeName, 100),
      stadium: str(stadium, 200),
      attendance: num(d.attendance || game.attendance),
      round: num(game.round || game.roundNumber)
    };

    const s = d.statistics || {};
    const parseOther = (obj) => {
      if (!obj || typeof obj !== 'object') return { xgOnTarget: null, xA: null };
      return {
        xgOnTarget: float(obj['xG on target (xGOT)']),
        xA: float(obj['Expected assists (xA)'])
      };
    };
    const otherH = parseOther(s.otherStatsHome);
    const otherA = parseOther(s.otherStatsAway);
    const jsonOrNull = (v) => (v && typeof v === 'object') ? JSON.stringify(v) : null;

    const statistics = {
      _game_sstats: gameSstatsId,
      possession_home: num(s.ballPossessionHome), possession_away: num(s.ballPossessionAway),
      shots_home: num(s.totalShotsHome), shots_away: num(s.totalShotsAway),
      shots_on_target_home: num(s.shotsOnGoalHome), shots_on_target_away: num(s.shotsOnGoalAway),
      shots_off_target_home: num(s.shotsOffGoalHome), shots_off_target_away: num(s.shotsOffGoalAway),
      shots_blocked_home: num(s.blockedShotsHome), shots_blocked_away: num(s.blockedShotsAway),
      shots_inside_box_home: num(s.shotsInsideBoxHome), shots_inside_box_away: num(s.shotsInsideBoxAway),
      shots_outside_box_home: num(s.shotsOutsideBoxHome), shots_outside_box_away: num(s.shotsOutsideBoxAway),
      hit_woodwork_home: num(s.hitTheWoodworkHome), hit_woodwork_away: num(s.hitTheWoodworkAway),
      corners_home: num(s.cornerKicksHome), corners_away: num(s.cornerKicksAway),
      fouls_home: num(s.foulsHome), fouls_away: num(s.foulsAway),
      yellow_cards_home: num(s.yellowCardsHome), yellow_cards_away: num(s.yellowCardsAway),
      red_cards_home: num(s.redCardsHome), red_cards_away: num(s.redCardsAway),
      offsides_home: num(s.offsidesHome), offsides_away: num(s.offsidesAway),
      free_kicks_home: num(s.freeKicksHome), free_kicks_away: num(s.freeKicksAway),
      throwins_home: num(s.throwinsHome), throwins_away: num(s.throwinsAway),
      expected_goals_home: float(s.expectedGoalsHome), expected_goals_away: float(s.expectedGoalsAway),
      expected_assists_home: otherH.xA, expected_assists_away: otherA.xA,
      xg_on_target_home: otherH.xgOnTarget, xg_on_target_away: otherA.xgOnTarget,
      goals_prevented_home: float(s.goalsPreventedHome), goals_prevented_away: float(s.goalsPreventedAway),
      big_chances_home: num(s.bigChancesHome), big_chances_away: num(s.bigChancesAway),
      calculated_xg_home: float(s.calculatedXgHome), calculated_xg_away: float(s.calculatedXgAway),
      total_passes_home: num(s.totalPassesHome), total_passes_away: num(s.totalPassesAway),
      passes_accurate_home: num(s.passesAccurateHome), passes_accurate_away: num(s.passesAccurateAway),
      accurate_through_passes_home: num(s.accurateThroughPassesHome), accurate_through_passes_away: num(s.accurateThroughPassesAway),
      long_passes_home: num(s.longPassesHome), long_passes_away: num(s.longPassesAway),
      passes_in_final_third_home: num(s.passesInFinalThirdHome), passes_in_final_third_away: num(s.passesInFinalThirdAway),
      crosses_home: num(s.crossesHome), crosses_away: num(s.crossesAway),
      touches_in_opp_box_home: num(s.touchesInOppositionBoxHome), touches_in_opp_box_away: num(s.touchesInOppositionBoxAway),
      total_tackles_home: num(s.totalTacklesHome), total_tackles_away: num(s.totalTacklesAway),
      success_tackles_home: num(s.successTacklesHome), success_tackles_away: num(s.successTacklesAway),
      duels_won_home: num(s.duelsWonHome), duels_won_away: num(s.duelsWonAway),
      clearances_home: num(s.clearancesHome), clearances_away: num(s.clearancesAway),
      interceptions_home: num(s.interceptionsHome), interceptions_away: num(s.interceptionsAway),
      goalkeeper_saves_home: num(s.goalkeeperSavesHome), goalkeeper_saves_away: num(s.goalkeeperSavesAway),
      errors_leading_to_shot_home: num(s.errorsLeadingToShotHome), errors_leading_to_shot_away: num(s.errorsLeadingToShotAway),
      errors_leading_to_goal_home: num(s.errorsLeadingToGoalHome), errors_leading_to_goal_away: num(s.errorsLeadingToGoalAway),
      other_stats_home: jsonOrNull(s.otherStatsHome), other_stats_away: jsonOrNull(s.otherStatsAway)
    };
    const hasStats = Object.entries(statistics)
      .filter(([k]) => k !== '_game_sstats')
      .some(([_, v]) => v !== null);

    const events = (Array.isArray(d.events) ? d.events : [])
      .filter(e => e && e.id != null)
      .map(e => ({
        sstats_id: num(e.id),
        _game_sstats: gameSstatsId,
        _team_sstats: num(e.teamId),
        _player_sstats: num(e.player && e.player.id),
        _assist_sstats: num(e.assistPlayer && e.assistPlayer.id),
        player_name: str(e.player && e.player.name, 200),
        assist_player_name: str(e.assistPlayer && e.assistPlayer.name, 200),
        minute: num(e.elapsed) || 0,
        minute_extra: num(e.extra),
        type: mapEventType(e.type),
        subtype: str(e.name, 50),
        description: null
      }));

    const lineupPlayers = Array.isArray(d.lineupPlayers) ? d.lineupPlayers : [];
    const lineups = lineupPlayers
      .filter(p => p && p.playerId != null && p.teamId != null)
      .map(p => ({
        _game_sstats: gameSstatsId,
        _team_sstats: num(p.teamId),
        _player_sstats: num(p.playerId),
        player_name: str(p.playerName, 200),
        position: str(p.position, 20),
        shirt_number: num(p.number),
        is_starter: !!p.startXI,
        is_captain: !!p.capitan,
        substituted_in_minute: null,
        substituted_out_minute: null
      }));

    const playerStatsArr = Array.isArray(d.playerStats) ? d.playerStats : [];
    const playerToTeam = new Map();
    for (const lp of lineupPlayers) {
      if (lp.playerId != null) playerToTeam.set(lp.playerId, lp.teamId);
    }
    const playerStats = playerStatsArr
      .filter(ps => ps && ps.playerId != null)
      .map(ps => ({
        _game_sstats: gameSstatsId,
        _player_sstats: num(ps.playerId),
        _team_sstats: num(playerToTeam.get(ps.playerId)),
        minutes_played: num(ps.minutes),
        goals: num(ps.goalsTotal) || 0,
        assists: num(ps.goalsAssists) || 0,
        yellow_cards: num(ps.cardsYellow) || 0,
        red_cards: num(ps.cardsRed) || 0,
        shots: num(ps.shotsTotal) || 0,
        shots_on_target: num(ps.shotsOn) || 0,
        shots_blocked: num(ps.tacklesBlocks),
        passes: num(ps.passesTotal) || 0,
        passes_completed: num(ps.passesAccuracy) || 0,
        key_passes: num(ps.passesKey),
        tackles: num(ps.tacklesTotal) || 0,
        interceptions: num(ps.tacklesInterceptions) || 0,
        duels_total: num(ps.duelsTotal),
        duels_won: num(ps.duelsWon),
        dribbles_attempts: num(ps.dribblesAttempts),
        dribbles_success: num(ps.dribblesSuccess),
        dribbles_past: num(ps.dribblesPast),
        fouls_committed: num(ps.foulsCommitted) || 0,
        fouls_suffered: num(ps.foulsDrawn) || 0,
        offsides: num(ps.offsides),
        goals_conceded: num(ps.goalsConceded),
        goals_saves: num(ps.goalsSaves),
        penalty_won: num(ps.penaltyWon),
        penalty_committed: num(ps.penaltyCommited),
        penalty_scored: num(ps.penaltyScored),
        penalty_missed: num(ps.penaltyMissed),
        penalty_saved: num(ps.penaltySaved),
        is_captain: !!ps.capitan,
        is_substitute: !!ps.substitute,
        rating: float(ps.rating)
      }));

    const playersToPresync = new Map();
    for (const lp of lineupPlayers) {
      if (lp.playerId != null && lp.playerName) {
        playersToPresync.set(lp.playerId, { sstats_id: num(lp.playerId), name: str(lp.playerName, 200) });
      }
    }
    for (const e of (d.events || [])) {
      if (e.player && e.player.id != null && e.player.name) {
        playersToPresync.set(e.player.id, { sstats_id: num(e.player.id), name: str(e.player.name, 200) });
      }
      if (e.assistPlayer && e.assistPlayer.id != null && e.assistPlayer.name) {
        playersToPresync.set(e.assistPlayer.id, { sstats_id: num(e.assistPlayer.id), name: str(e.assistPlayer.name, 200) });
      }
    }

    return {
      _isGameDetails: true,
      gameUpdate,
      statistics: hasStats ? statistics : null,
      events,
      lineups,
      playerStats,
      _playersToPresync: Array.from(playersToPresync.values()),
      _gameDate: gameDate
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

      // Дедупликация по flashscore_id перед UPSERT
      // SStats иногда возвращает разные sstats_id с одинаковым flashscore_id —
      // ON CONFLICT (sstats_id) не сработает, и второй INSERT падает на unique(flashscore_id).
      const dedupByFlashscore = (arr) => {
        const seenFs = new Set();
        const out = [];
        for (const r of arr) {
          if (!r.flashscore_id) { out.push(r); continue; }
          if (seenFs.has(r.flashscore_id)) continue;
          seenFs.add(r.flashscore_id);
          out.push(r);
        }
        return out;
      };

      // Pre-sync sstats_id для строк, у которых flashscore_id совпадает,
      // но sstats_id в БД отличается от входящего (SStats иногда меняет внутренний ID).
      // Без этого batch UPSERT падает на unique(flashscore_id).
      const presyncSstatsId = async (tableName, arr) => {
        const withFs = arr.filter(r => r.flashscore_id && r.sstats_id);
        if (withFs.length === 0) return 0;
        const fsList = withFs.map(r => r.flashscore_id);
        const ssList = withFs.map(r => r.sstats_id);
        try {
          // UPDATE через UNNEST: обновляем sstats_id там, где flashscore_id совпадает,
          // а sstats_id отличается от входящего.
          const r = await this.db.query(
            `UPDATE ${tableName} t
             SET sstats_id = v.new_sstats_id
             FROM (SELECT UNNEST($1::text[]) AS flashscore_id,
                          UNNEST($2::bigint[]) AS new_sstats_id) v
             WHERE t.flashscore_id = v.flashscore_id
               AND t.sstats_id IS DISTINCT FROM v.new_sstats_id`,
            [fsList, ssList]
          );
          return r.rowCount || 0;
        } catch (e) {
          logger.warn({ err: e.message, table: tableName }, 'Enriched: presyncSstatsId failed');
          return 0;
        }
      };

      // Upsert leagues и teams через пул (вне активной транзакции)
      if (leaguesMap.size > 0) {
        try {
          const leaguesArr = dedupByFlashscore(Array.from(leaguesMap.values()));
          const synced = await presyncSstatsId('leagues', leaguesArr);
          await this.db.batchUpsert('leagues', leaguesArr);
          logger.info({
            count: leaguesArr.length,
            dedup: leaguesMap.size - leaguesArr.length,
            presynced: synced
          }, 'Enriched: leagues upserted');
        } catch (e) {
          logger.warn({ err: e.message }, 'Enriched: leagues upsert failed');
        }
      }
      if (teamsMap.size > 0) {
        try {
          const teamsArr = dedupByFlashscore(Array.from(teamsMap.values()));
          const synced = await presyncSstatsId('teams', teamsArr);
          await this.db.batchUpsert('teams', teamsArr);
          logger.info({
            count: teamsArr.length,
            dedup: teamsMap.size - teamsArr.length,
            presynced: synced
          }, 'Enriched: teams upserted');
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
      if (data && data._isGameDetails) {
        this._completeStep(10, { totalRecords: 0, insertedRecords: 0, updatedRecords: 0, skipped: 'handled in step 11' });
        return { totalRecords: 0, insertedRecords: 0, updatedRecords: 0 };
      }

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
      if (!data || !data._isGameDetails) {
        this._skipStep(11, 'No relations to update for this entity type');
        return { updated: 0 };
      }

      const { gameUpdate, statistics, events, lineups, playerStats, _playersToPresync } = data;
      const gameSstatsId = gameUpdate.sstats_id;

      const gRes = await transaction.query(
        'SELECT id, date FROM games WHERE sstats_id = $1 LIMIT 1',
        [gameSstatsId]
      );
      if (gRes.rows.length === 0) {
        throw new Error('game with sstats_id=' + gameSstatsId + ' not found in games');
      }
      const gameId = gRes.rows[0].id;
      const gameDate = gRes.rows[0].date;

      let presyncedPlayers = 0;
      if (_playersToPresync && _playersToPresync.length > 0) {
        try {
          await transaction.batchUpsert('players', _playersToPresync);
          presyncedPlayers = _playersToPresync.length;
        } catch (e) {
          logger.warn({ err: e.message, count: _playersToPresync.length }, 'players presync failed');
        }
      }

      const collectSstats = (arr, key) => [...new Set((arr || []).map(x => x[key]).filter(v => v != null))];
      const uniqueTeams = [...new Set([
        ...collectSstats(events, '_team_sstats'),
        ...collectSstats(lineups, '_team_sstats'),
        ...collectSstats(playerStats, '_team_sstats')
      ])];
      const uniquePlayers = [...new Set([
        ...collectSstats(events, '_player_sstats'),
        ...collectSstats(events, '_assist_sstats'),
        ...collectSstats(lineups, '_player_sstats'),
        ...collectSstats(playerStats, '_player_sstats')
      ])];

      const teamMap = new Map();
      if (uniqueTeams.length > 0) {
        const ph = uniqueTeams.map((_, i) => '$' + (i+1)).join(',');
        const r = await transaction.query(
          'SELECT id, sstats_id FROM teams WHERE sstats_id IN (' + ph + ')',
          uniqueTeams
        );
        for (const row of r.rows) teamMap.set(row.sstats_id, row.id);
      }
      const playerMap = new Map();
      if (uniquePlayers.length > 0) {
        const ph = uniquePlayers.map((_, i) => '$' + (i+1)).join(',');
        const r = await transaction.query(
          'SELECT id, sstats_id FROM players WHERE sstats_id IN (' + ph + ')',
          uniquePlayers
        );
        for (const row of r.rows) playerMap.set(row.sstats_id, row.id);
      }

      // Spread всех полей statistics (auto-sync с трансформером)
      let mappedStats = null;
      if (statistics) {
        const { _game_sstats, ...statsFields } = statistics;
        mappedStats = { game_id: gameId, date: gameDate, ...statsFields };
      }

      const mappedEvents = events.map(e => ({
        sstats_id: e.sstats_id,
        game_id: gameId, date: gameDate,
        team_id: teamMap.get(e._team_sstats) || null,
        player_id: playerMap.get(e._player_sstats) || null,
        player_name: e.player_name,
        minute: e.minute, minute_extra: e.minute_extra,
        type: e.type, subtype: e.subtype,
        assist_player_id: playerMap.get(e._assist_sstats) || null,
        assist_player_name: e.assist_player_name,
        description: e.description
      })).filter(e => e.sstats_id != null);

      const mappedLineups = lineups.map(l => ({
        game_id: gameId, date: gameDate,
        team_id: teamMap.get(l._team_sstats) || null,
        player_id: playerMap.get(l._player_sstats) || null,
        player_name: l.player_name,
        position: l.position, shirt_number: l.shirt_number,
        is_starter: l.is_starter, is_captain: l.is_captain,
        substituted_in_minute: l.substituted_in_minute,
        substituted_out_minute: l.substituted_out_minute
      })).filter(l => l.team_id && l.player_id);

      // Spread всех полей playerStats (auto-sync с трансформером)
      const mappedPlayerStats = playerStats.map(ps => {
        const { _game_sstats, _player_sstats, _team_sstats, ...psFields } = ps;
        return {
          game_id: gameId, date: gameDate,
          team_id: teamMap.get(_team_sstats) || null,
          player_id: playerMap.get(_player_sstats) || null,
          ...psFields
        };
      }).filter(p => p.player_id);

      const counts = { statistics: 0, events: 0, lineups: 0, playerStats: 0, gameUpdated: 0 };

      if (mappedStats) {
        try { await transaction.batchUpsert('game_statistics', [mappedStats]); counts.statistics = 1; }
        catch (e) { logger.warn({ err: e.message }, 'game_statistics upsert failed'); }
      }
      if (mappedEvents.length > 0) {
        try { await transaction.batchUpsert('game_events', mappedEvents); counts.events = mappedEvents.length; }
        catch (e) { logger.warn({ err: e.message, count: mappedEvents.length }, 'game_events upsert failed'); }
      }
      if (mappedLineups.length > 0) {
        try { await transaction.batchUpsert('game_lineups', mappedLineups); counts.lineups = mappedLineups.length; }
        catch (e) { logger.warn({ err: e.message, count: mappedLineups.length }, 'game_lineups upsert failed'); }
      }
      if (mappedPlayerStats.length > 0) {
        try { await transaction.batchUpsert('game_player_stats', mappedPlayerStats); counts.playerStats = mappedPlayerStats.length; }
        catch (e) { logger.warn({ err: e.message, count: mappedPlayerStats.length }, 'game_player_stats upsert failed'); }
      }

      const updates = [];
      const params = [];
      let i = 1;
      if (gameUpdate.referee != null) { updates.push('referee = $' + (i++)); params.push(gameUpdate.referee); }
      if (gameUpdate.stadium != null) { updates.push('stadium = $' + (i++)); params.push(gameUpdate.stadium); }
      if (gameUpdate.attendance != null) { updates.push('attendance = $' + (i++)); params.push(gameUpdate.attendance); }
      if (gameUpdate.round != null) { updates.push('round = $' + (i++)); params.push(gameUpdate.round); }
      if (updates.length > 0) {
        params.push(gameSstatsId);
        await transaction.query(
          'UPDATE games SET ' + updates.join(', ') + ' WHERE sstats_id = $' + i,
          params
        );
        counts.gameUpdated = 1;
      }

      this._completeStep(11, {
        presyncedPlayers,
        teamsLookedUp: teamMap.size,
        playersLookedUp: playerMap.size,
        statistics: counts.statistics,
        events: counts.events,
        lineups: counts.lineups,
        playerStats: counts.playerStats,
        gameUpdated: counts.gameUpdated
      });

      return { updated: counts.statistics + counts.events + counts.lineups + counts.playerStats };
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

      // Audit: записать начало run (await — гарантия FK для child-шагов)
      await this._persistRunStart();

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

      // Audit: завершение run (await — финальный апдейт статуса)
      await this._persistRunEnd('COMPLETED', null);

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

      // Audit: провал run (fire-and-forget)
      await this._persistRunEnd('FAILED', error && error.message ? error.message : 'unknown error');

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
