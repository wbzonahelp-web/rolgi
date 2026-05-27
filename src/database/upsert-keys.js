/**
 * UPSERT KEYS SYSTEM
 * 
 * Единый источник истины для UPSERT-ключей всех таблиц.
 * Предотвращает ошибки ON CONFLICT путём явного определения конфликтных ключей.
 * 
 * @version 6.0.0
 * @module database/upsert-keys
 */

/**
 * Манифест UPSERT-ключей для всех таблиц
 * 
 * Структура:
 * - conflictKeys: массив полей для ON CONFLICT
 * - updateColumns: массив полей для UPDATE (все кроме id и ключей конфликта)
 * - idColumn: имя primary key столбца
 */
const UPSERT_KEYS_MANIFEST = {
  // Level 0: Справочники
  countries: {
    conflictKeys: ['code'],
    updateColumns: ['name', 'flag_url', 'updated_at'],
    idColumn: 'id'
  },

  bookmakers: {
    conflictKeys: ['sstats_id'],
    updateColumns: ['name', 'website', 'is_active', 'updated_at'],
    idColumn: 'id'
  },

  // Level 1: Основные сущности
  leagues: {
    conflictKeys: ['sstats_id'],
    updateColumns: [
      'flashscore_id', 'name', 'country_id', 'country_name',
      'logo', 'is_active', 'priority', 'type', 'updated_at'
    ],
    idColumn: 'id'
  },

  seasons: {
    conflictKeys: ['league_id', 'season'],
    updateColumns: ['start_date', 'end_date', 'is_current', 'updated_at'],
    idColumn: 'id'
  },

  teams: {
    conflictKeys: ['sstats_id'],
    updateColumns: [
      'flashscore_id', 'name', 'short_name', 'country_id', 'country_name',
      'logo', 'stadium', 'founded', 'website', 'is_active', 'updated_at'
    ],
    idColumn: 'id'
  },

  players: {
    conflictKeys: ['sstats_id'],
    updateColumns: [
      'flashscore_id', 'name', 'first_name', 'last_name', 'date_of_birth',
      'age', 'height', 'weight', 'position', 'country_id', 'country_name',
      'photo', 'is_active', 'updated_at'
    ],
    idColumn: 'id'
  },

  // Level 2: Матчи и коэффициенты
  games: {
    conflictKeys: ['sstats_id', 'date'],
    updateColumns: [
      'flashscore_id', 'league_id', 'season', 'round',
      'home_team_id', 'away_team_id', 'home_score', 'away_score',
      'home_score_ht', 'away_score_ht', 'status', 'referee', 'stadium',
      'attendance', 'is_live', 'is_finished', 'is_deleted', 'deleted_at',
      'last_updated'
    ],
    idColumn: 'id',
    partitioned: true
  },

  odds_prematch: {
    conflictKeys: ['game_id', 'bookmaker_id', 'market_id', 'selection', 'timestamp'],
    updateColumns: ['bookmaker_name', 'market_name', 'odds'],
    idColumn: 'id'
  },

  odds_live: {
    conflictKeys: ['game_id', 'bookmaker_id', 'market_id', 'selection', 'timestamp'],
    updateColumns: ['bookmaker_name', 'market_name', 'odds', 'minute'],
    idColumn: 'id'
  },

  // Level 3: Детали матчей и аналитика
  game_statistics: {
    conflictKeys: ['game_id'],
    updateColumns: [
      'date',
      'possession_home', 'possession_away',
      'shots_home', 'shots_away',
      'shots_on_target_home', 'shots_on_target_away',
      'shots_off_target_home', 'shots_off_target_away',
      'shots_blocked_home', 'shots_blocked_away',
      'shots_inside_box_home', 'shots_inside_box_away',
      'shots_outside_box_home', 'shots_outside_box_away',
      'hit_woodwork_home', 'hit_woodwork_away',
      'corners_home', 'corners_away',
      'fouls_home', 'fouls_away',
      'yellow_cards_home', 'yellow_cards_away',
      'red_cards_home', 'red_cards_away',
      'offsides_home', 'offsides_away',
      'expected_goals_home', 'expected_goals_away',
      'expected_assists_home', 'expected_assists_away',
      'xg_on_target_home', 'xg_on_target_away',
      'goals_prevented_home', 'goals_prevented_away',
      'big_chances_home', 'big_chances_away',
      'calculated_xg_home', 'calculated_xg_away',
      'total_passes_home', 'total_passes_away',
      'passes_accurate_home', 'passes_accurate_away',
      'accurate_through_passes_home', 'accurate_through_passes_away',
      'long_passes_home', 'long_passes_away',
      'passes_in_final_third_home', 'passes_in_final_third_away',
      'crosses_home', 'crosses_away',
      'touches_in_opp_box_home', 'touches_in_opp_box_away',
      'total_tackles_home', 'total_tackles_away',
      'success_tackles_home', 'success_tackles_away',
      'duels_won_home', 'duels_won_away',
      'clearances_home', 'clearances_away',
      'interceptions_home', 'interceptions_away',
      'goalkeeper_saves_home', 'goalkeeper_saves_away',
      'free_kicks_home', 'free_kicks_away',
      'throwins_home', 'throwins_away',
      'errors_leading_to_shot_home', 'errors_leading_to_shot_away',
      'errors_leading_to_goal_home', 'errors_leading_to_goal_away',
      'other_stats_home', 'other_stats_away',
      'updated_at'
    ],
    idColumn: 'id'
  },

  game_events: {
    conflictKeys: ['sstats_id'],
    updateColumns: [
      'game_id', 'date', 'team_id', 'player_id', 'player_name', 'minute',
      'minute_extra', 'type', 'subtype', 'assist_player_id', 'assist_player_name',
      'description'
    ],
    idColumn: 'id'
  },

  game_lineups: {
    conflictKeys: ['game_id', 'team_id', 'player_id'],
    updateColumns: [
      'player_name', 'position', 'shirt_number', 'is_starter', 'is_captain',
      'substituted_in_minute', 'substituted_out_minute'
    ],
    idColumn: 'id'
  },

  game_player_stats: {
    conflictKeys: ['game_id', 'player_id'],
    updateColumns: [
      'team_id', 'date',
      'minutes_played', 'goals', 'assists',
      'yellow_cards', 'red_cards',
      'shots', 'shots_on_target', 'shots_blocked',
      'passes', 'passes_completed', 'key_passes',
      'tackles', 'interceptions',
      'duels_total', 'duels_won',
      'dribbles_attempts', 'dribbles_success', 'dribbles_past',
      'fouls_committed', 'fouls_suffered', 'offsides',
      'goals_conceded', 'goals_saves',
      'penalty_won', 'penalty_committed', 'penalty_scored',
      'penalty_missed', 'penalty_saved',
      'is_captain', 'is_substitute',
      'rating',
      'updated_at'
    ],
    idColumn: 'id'
  },

  game_glicko: {
    conflictKeys: ['game_id', 'team_id'],
    updateColumns: ['team_name', 'rating', 'rd', 'vol', 'win_probability'],
    idColumn: 'id'
  },

  standings: {
    conflictKeys: ['league_id', 'season', 'team_id'],
    updateColumns: [
      'team_name', 'position', 'played', 'won', 'drawn', 'lost',
      'goals_for', 'goals_against', 'goal_difference', 'points', 'form',
      'home_played', 'home_won', 'home_drawn', 'home_lost',
      'away_played', 'away_won', 'away_drawn', 'away_lost',
      'updated_at'
    ],
    idColumn: 'id'
  },

  // Level 4: Мониторинг и логи
  error_log: {
    conflictKeys: ['error_id'],
    updateColumns: [
      'severity', 'category', 'source', 'message', 'stack_trace', 'trace_id',
      'url', 'method', 'params', 'function_name', 'file_name', 'line_number',
      'user_agent', 'ip_address', 'breadcrumbs', 'is_resolved', 'resolved_at',
      'resolved_by', 'resolution_notes'
    ],
    idColumn: 'id'
  },

  trace_log: {
    conflictKeys: ['span_id'],
    updateColumns: [
      'trace_id', 'parent_trace_id', 'span_name', 'operation_type', 'status',
      'duration_ms', 'metadata', 'error_message'
    ],
    idColumn: 'id'
  },

  performance_metrics: {
    conflictKeys: [],  // Нет уникальных ключей, только INSERT
    updateColumns: [],
    idColumn: 'id',
    insertOnly: true
  },

  sync_log: {
    conflictKeys: [],  // Нет уникальных ключей, только INSERT
    updateColumns: [],
    idColumn: 'id',
    insertOnly: true
  },

  loader_runs: {
    conflictKeys: ['run_id'],
    updateColumns: [
      'mode', 'status', 'params', 'started_at', 'completed_at', 'paused_at',
      'resumed_at', 'duration_ms', 'total_steps', 'completed_steps', 'failed_steps',
      'error_message'
    ],
    idColumn: 'id'
  },

  loader_step_results: {
    conflictKeys: ['run_id', 'step_name'],
    updateColumns: [
      'step_order', 'status', 'records_processed', 'records_inserted',
      'records_updated', 'records_failed', 'started_at', 'completed_at',
      'failed_at', 'duration_ms', 'error_message', 'error_stack'
    ],
    idColumn: 'id'
  },

  loader_cursors: {
    conflictKeys: ['run_id', 'step_id'],
    updateColumns: ['cursor_data', 'updated_at'],
    idColumn: 'id'
  }
};

/**
 * Получить UPSERT ключи для таблицы
 * 
 * @param {string} tableName - Имя таблицы
 * @returns {Object | null} Конфигурация ключей или null
 * 
 * @example
 * const keys = getUpsertKeys('leagues');
 * // { conflictKeys: ['sstats_id'], updateColumns: [...], idColumn: 'id' }
 */
function getUpsertKeys(tableName) {
  return UPSERT_KEYS_MANIFEST[tableName] || null;
}

/**
 * Сгенерировать SQL для UPSERT
 * 
 * @param {string} tableName - Имя таблицы
 * @param {Object} data - Данные для вставки/обновления
 * @param {boolean} returnId - Вернуть ID после вставки
 * @returns {Object} {sql: string, values: Array}
 * 
 * @example
 * const {sql, values} = generateUpsertSQL('leagues', {
 *   sstats_id: 123,
 *   name: 'Premier League',
 *   country_id: 1
 * });
 */
function generateUpsertSQL(tableName, data, returnId = true) {
  const config = getUpsertKeys(tableName);
  
  if (!config) {
    throw new Error(`No UPSERT configuration found for table: ${tableName}`);
  }

  // Если это таблица только для INSERT
  if (config.insertOnly) {
    return generateInsertSQL(tableName, data, returnId);
  }

  // Извлечь поля и значения
  const fields = Object.keys(data);
  const values = Object.values(data);
  
  // Построить список полей для INSERT
  const insertFields = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  
  // Построить conflict target
  const conflictTarget = config.conflictKeys.join(', ');
  
  // Построить SET clause для UPDATE
  const updateSet = config.updateColumns
    .filter(col => fields.includes(col))
    .map(col => {
      const index = fields.indexOf(col);
      return `${col} = $${index + 1}`;
    })
    .join(', ');

  // Собрать SQL
  let sql = `INSERT INTO ${tableName} (${insertFields}) VALUES (${placeholders})`;
  
  if (config.conflictKeys.length > 0 && updateSet) {
    sql += ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
  } else if (config.conflictKeys.length > 0) {
    sql += ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  }
  
  if (returnId) {
    sql += ` RETURNING ${config.idColumn}`;
  }

  return { sql, values };
}

/**
 * Сгенерировать SQL для INSERT (без UPSERT)
 * 
 * @param {string} tableName - Имя таблицы
 * @param {Object} data - Данные для вставки
 * @param {boolean} returnId - Вернуть ID
 * @returns {Object} {sql: string, values: Array}
 */
function generateInsertSQL(tableName, data, returnId = true) {
  const config = getUpsertKeys(tableName);
  
  if (!config) {
    throw new Error(`No configuration found for table: ${tableName}`);
  }

  const fields = Object.keys(data);
  const values = Object.values(data);
  
  const insertFields = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  
  let sql = `INSERT INTO ${tableName} (${insertFields}) VALUES (${placeholders})`;
  
  if (returnId) {
    sql += ` RETURNING ${config.idColumn}`;
  }

  return { sql, values };
}

/**
 * Сгенерировать SQL для батч UPSERT
 * 
 * @param {string} tableName - Имя таблицы
 * @param {Array<Object>} dataArray - Массив объектов для вставки
 * @param {boolean} returnId - Вернуть ID'шники
 * @returns {Object} {sql: string, values: Array}
 * 
 * @example
 * const {sql, values} = generateBatchUpsertSQL('teams', [
 *   { sstats_id: 1, name: 'Team A' },
 *   { sstats_id: 2, name: 'Team B' }
 * ]);
 */
function generateBatchUpsertSQL(tableName, dataArray, returnId = false) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    throw new Error('dataArray must be a non-empty array');
  }

  const config = getUpsertKeys(tableName);
  
  if (!config) {
    throw new Error(`No UPSERT configuration found for table: ${tableName}`);
  }

  // Извлечь все возможные поля из первого объекта
  const fields = Object.keys(dataArray[0]);
  const insertFields = fields.join(', ');
  
  // Построить placeholders для каждой строки
  const allValues = [];
  const rowPlaceholders = [];
  
  dataArray.forEach((data, rowIndex) => {
    const rowValues = fields.map(field => data[field]);
    allValues.push(...rowValues);
    
    const startIndex = rowIndex * fields.length + 1;
    const placeholders = fields.map((_, i) => `$${startIndex + i}`).join(', ');
    rowPlaceholders.push(`(${placeholders})`);
  });

  // Построить conflict target
  const conflictTarget = config.conflictKeys.join(', ');
  
  // Построить SET clause для UPDATE
  const updateSet = config.updateColumns
    .filter(col => fields.includes(col))
    .map(col => `${col} = EXCLUDED.${col}`)
    .join(', ');

  // Собрать SQL
  let sql = `INSERT INTO ${tableName} (${insertFields}) VALUES ${rowPlaceholders.join(', ')}`;
  
  if (config.conflictKeys.length > 0 && updateSet) {
    sql += ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
  } else if (config.conflictKeys.length > 0) {
    sql += ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  }
  
  if (returnId) {
    sql += ` RETURNING ${config.idColumn}`;
  }

  return { sql, values: allValues };
}

/**
 * Валидировать данные перед UPSERT
 * 
 * @param {string} tableName - Имя таблицы
 * @param {Object} data - Данные для валидации
 * @returns {{valid: boolean, errors: Array}}
 * 
 * @example
 * const validation = validateUpsertData('leagues', { sstats_id: 123 });
 * if (!validation.valid) {
 *   console.error(validation.errors);
 * }
 */
function validateUpsertData(tableName, data) {
  const config = getUpsertKeys(tableName);
  
  if (!config) {
    return {
      valid: false,
      errors: [`No UPSERT configuration for table: ${tableName}`]
    };
  }

  const errors = [];
  const providedFields = new Set(Object.keys(data));

  // Проверить наличие conflict keys
  for (const key of config.conflictKeys) {
    if (!providedFields.has(key)) {
      errors.push(`Missing required conflict key: ${key}`);
    }
  }

  // Проверить что поля не пустые
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      errors.push(`Field ${key} is undefined`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Получить информацию о ключах таблицы
 * 
 * @param {string} tableName - Имя таблицы
 * @returns {Object | null}
 * 
 * @example
 * const info = getUpsertKeyInfo('leagues');
 * console.log(info.conflictKeys);
 * console.log(info.updateColumns);
 */
function getUpsertKeyInfo(tableName) {
  const config = getUpsertKeys(tableName);
  
  if (!config) {
    return null;
  }

  return {
    tableName,
    idColumn: config.idColumn,
    conflictKeys: [...config.conflictKeys],
    updateColumns: [...config.updateColumns],
    insertOnly: config.insertOnly || false,
    partitioned: config.partitioned || false
  };
}

/**
 * Получить список всех таблиц с UPSERT конфигурацией
 * 
 * @returns {Array<string>} Массив имён таблиц
 */
function listTables() {
  return Object.keys(UPSERT_KEYS_MANIFEST);
}

/**
 * Получить статистику по манифесту
 * 
 * @returns {Object} Статистика
 */
function getManifestStats() {
  const tables = listTables();
  
  const stats = {
    totalTables: tables.length,
    insertOnlyTables: 0,
    partitionedTables: 0,
    tablesWithConflictKeys: 0,
    averageConflictKeys: 0,
    averageUpdateColumns: 0
  };

  let totalConflictKeys = 0;
  let totalUpdateColumns = 0;

  for (const table of tables) {
    const config = UPSERT_KEYS_MANIFEST[table];
    
    if (config.insertOnly) {
      stats.insertOnlyTables++;
    }
    
    if (config.partitioned) {
      stats.partitionedTables++;
    }
    
    if (config.conflictKeys.length > 0) {
      stats.tablesWithConflictKeys++;
      totalConflictKeys += config.conflictKeys.length;
    }
    
    totalUpdateColumns += config.updateColumns.length;
  }

  stats.averageConflictKeys = (totalConflictKeys / stats.tablesWithConflictKeys).toFixed(2);
  stats.averageUpdateColumns = (totalUpdateColumns / tables.length).toFixed(2);

  return stats;
}

// Экспорт
module.exports = {
  UPSERT_KEYS_MANIFEST,
  getUpsertKeys,
  generateUpsertSQL,
  generateInsertSQL,
  generateBatchUpsertSQL,
  validateUpsertData,
  getUpsertKeyInfo,
  listTables,
  getManifestStats
};

// CLI интерфейс
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  (async () => {
    try {
      switch (command) {
        case 'list':
          console.log('\n📋 Tables with UPSERT configuration\n');
          const tables = listTables();
          tables.forEach(table => console.log(`  - ${table}`));
          console.log(`\nTotal: ${tables.length}\n`);
          break;

        case 'info':
          if (!arg) {
            console.error('Usage: node upsert-keys.js info <table>\n');
            process.exit(1);
          }
          
          const info = getUpsertKeyInfo(arg);
          
          if (!info) {
            console.error(`❌ No configuration found for table: ${arg}\n`);
            process.exit(1);
          }
          
          console.log(`\n📊 UPSERT Keys Info: ${info.tableName}\n`);
          console.log(`ID Column:        ${info.idColumn}`);
          console.log(`Conflict Keys:    ${info.conflictKeys.join(', ')}`);
          console.log(`Update Columns:   ${info.updateColumns.length}`);
          console.log(`Insert Only:      ${info.insertOnly}`);
          console.log(`Partitioned:      ${info.partitioned}`);
          console.log('\nUpdate columns:');
          info.updateColumns.forEach(col => console.log(`  - ${col}`));
          console.log('');
          break;

        case 'stats':
          const stats = getManifestStats();
          
          console.log('\n📊 UPSERT Keys Manifest Statistics\n');
          console.log(`Total tables:            ${stats.totalTables}`);
          console.log(`Insert-only tables:      ${stats.insertOnlyTables}`);
          console.log(`Partitioned tables:      ${stats.partitionedTables}`);
          console.log(`With conflict keys:      ${stats.tablesWithConflictKeys}`);
          console.log(`Avg conflict keys:       ${stats.averageConflictKeys}`);
          console.log(`Avg update columns:      ${stats.averageUpdateColumns}\n`);
          break;

        case 'generate':
          if (!arg) {
            console.error('Usage: node upsert-keys.js generate <table>\n');
            process.exit(1);
          }
          
          const exampleData = process.argv[4] 
            ? JSON.parse(process.argv[4])
            : { id: 1, example_field: 'value' };
          
          const {sql, values} = generateUpsertSQL(arg, exampleData);
          
          console.log(`\n🔧 Generated UPSERT SQL for: ${arg}\n`);
          console.log('SQL:');
          console.log(sql);
          console.log('\nValues:');
          console.log(values);
          console.log('');
          break;

        default:
          console.log('UPSERT Keys System v6.0.0\n');
          console.log('Usage:');
          console.log('  node upsert-keys.js list                    - List all tables');
          console.log('  node upsert-keys.js info <table>            - Show table info');
          console.log('  node upsert-keys.js stats                   - Show statistics');
          console.log('  node upsert-keys.js generate <table> [data] - Generate SQL\n');
          console.log('Examples:');
          console.log('  node upsert-keys.js list');
          console.log('  node upsert-keys.js info leagues');
          console.log('  node upsert-keys.js stats');
          console.log('  node upsert-keys.js generate leagues \'{"sstats_id": 123, "name": "Premier League"}\'\n');
          process.exit(command ? 1 : 0);
      }
    } catch (error) {
      console.error('\n💥 Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
