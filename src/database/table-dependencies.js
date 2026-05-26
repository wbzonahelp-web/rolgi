/**
 * TABLE DEPENDENCIES GRAPH
 * 
 * Граф зависимостей таблиц для обеспечения правильного порядка загрузки данных.
 * Предотвращает нарушения FK constraints путём определения явной иерархии таблиц.
 * 
 * @version 6.0.0
 * @module database/table-dependencies
 */

/**
 * Граф зависимостей таблиц
 * 
 * Структура:
 * - level: уровень в иерархии (0 = нет зависимостей, выше = больше зависимостей)
 * - dependencies: массив имён таблиц, от которых зависит данная таблица
 * 
 * Уровни:
 * 0 - Справочники (countries, bookmakers)
 * 1 - Основные сущности (leagues, teams, players, seasons)
 * 2 - Матчи и связанные данные (games, odds)
 * 3 - Детали матчей и аналитика (statistics, events, standings)
 * 4 - Мониторинг и логи (error_log, trace_log, etc.)
 */
const TABLE_DEPENDENCIES = {
  // Level 0: Справочники (нет зависимостей)
  'countries': {
    level: 0,
    dependencies: []
  },
  'bookmakers': {
    level: 0,
    dependencies: []
  },

  // Level 1: Основные сущности
  'leagues': {
    level: 1,
    dependencies: ['countries']
  },
  'seasons': {
    level: 1,
    dependencies: ['leagues']
  },
  'teams': {
    level: 1,
    dependencies: ['countries']
  },
  'players': {
    level: 1,
    dependencies: ['countries']
  },

  // Level 2: Матчи и коэффициенты
  'games': {
    level: 2,
    dependencies: ['leagues', 'teams', 'seasons']
  },
  'odds_prematch': {
    level: 2,
    dependencies: ['games', 'bookmakers']
  },
  'odds_live': {
    level: 2,
    dependencies: ['games', 'bookmakers']
  },

  // Level 3: Детали матчей и аналитика
  'game_statistics': {
    level: 3,
    dependencies: ['games']
  },
  'game_events': {
    level: 3,
    dependencies: ['games', 'players', 'teams']
  },
  'game_lineups': {
    level: 3,
    dependencies: ['games', 'players', 'teams']
  },
  'game_player_stats': {
    level: 3,
    dependencies: ['games', 'players']
  },
  'game_glicko': {
    level: 3,
    dependencies: ['games', 'teams']
  },
  'standings': {
    level: 3,
    dependencies: ['leagues', 'teams', 'seasons']
  },

  // Level 4: Мониторинг и логи
  'error_log': {
    level: 4,
    dependencies: []
  },
  'trace_log': {
    level: 4,
    dependencies: []
  },
  'performance_metrics': {
    level: 4,
    dependencies: []
  },
  'sync_log': {
    level: 4,
    dependencies: []
  },
  'loader_runs': {
    level: 4,
    dependencies: []
  },
  'loader_step_results': {
    level: 4,
    dependencies: ['loader_runs']
  },
  'loader_cursors': {
    level: 4,
    dependencies: ['loader_runs', 'loader_step_results']
  }
};

/**
 * Получить порядок загрузки таблиц
 * 
 * Возвращает массив имён таблиц, отсортированных по уровню зависимости.
 * Таблицы без зависимостей идут первыми, с наибольшим количеством зависимостей - последними.
 * 
 * @returns {string[]} Массив имён таблиц в порядке загрузки
 * 
 * @example
 * const order = getLoadOrder();
 * // ['countries', 'bookmakers', 'leagues', 'teams', ...]
 */
function getLoadOrder() {
  const tables = Object.keys(TABLE_DEPENDENCIES);
  
  // Сортировка по level, затем по алфавиту
  return tables.sort((a, b) => {
    const levelDiff = TABLE_DEPENDENCIES[a].level - TABLE_DEPENDENCIES[b].level;
    if (levelDiff !== 0) {
      return levelDiff;
    }
    return a.localeCompare(b);
  });
}

/**
 * Валидация целостности графа зависимостей
 * 
 * Проверяет:
 * 1. Все зависимости существуют в графе
 * 2. Нет циклических зависимостей
 * 3. Уровни согласованы с зависимостями
 * 
 * @returns {{valid: boolean, errors: string[]}}
 * 
 * @example
 * const { valid, errors } = validateDependencies();
 * if (!valid) {
 *   console.error('Invalid dependency graph:', errors);
 * }
 */
function validateDependencies() {
  const errors = [];
  const tables = Object.keys(TABLE_DEPENDENCIES);

  for (const table of tables) {
    const config = TABLE_DEPENDENCIES[table];

    // Проверка существования всех зависимостей
    for (const dep of config.dependencies) {
      if (!TABLE_DEPENDENCIES[dep]) {
        errors.push(`Table "${table}" depends on non-existent table "${dep}"`);
      }
    }

    // Проверка согласованности уровней
    for (const dep of config.dependencies) {
      if (TABLE_DEPENDENCIES[dep]) {
        const depLevel = TABLE_DEPENDENCIES[dep].level;
        if (depLevel >= config.level) {
          errors.push(
            `Table "${table}" (level ${config.level}) depends on "${dep}" (level ${depLevel}). ` +
            `Dependency should have lower level.`
          );
        }
      }
    }
  }

  // Проверка циклических зависимостей (простая версия)
  function hasCycle(table, visited = new Set(), stack = new Set()) {
    if (stack.has(table)) {
      return true; // Найден цикл
    }
    if (visited.has(table)) {
      return false;
    }

    visited.add(table);
    stack.add(table);

    const deps = TABLE_DEPENDENCIES[table]?.dependencies || [];
    for (const dep of deps) {
      if (hasCycle(dep, visited, stack)) {
        errors.push(`Circular dependency detected involving "${table}" and "${dep}"`);
        return true;
      }
    }

    stack.delete(table);
    return false;
  }

  for (const table of tables) {
    hasCycle(table);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Проверить, можно ли загружать указанную таблицу
 * 
 * Проверяет, что все зависимости таблицы уже загружены.
 * 
 * @param {string} tableName - Имя таблицы
 * @param {Set<string>} loadedTables - Множество уже загруженных таблиц
 * @returns {boolean} true, если таблицу можно загружать
 * 
 * @example
 * const loaded = new Set(['countries', 'bookmakers', 'leagues']);
 * if (canLoadTable('teams', loaded)) {
 *   await loadTableData('teams');
 *   loaded.add('teams');
 * }
 */
function canLoadTable(tableName, loadedTables) {
  const config = TABLE_DEPENDENCIES[tableName];
  if (!config) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  // Проверить, что все зависимости загружены
  for (const dep of config.dependencies) {
    if (!loadedTables.has(dep)) {
      return false;
    }
  }

  return true;
}

/**
 * Получить все таблицы, которые зависят от указанной
 * 
 * @param {string} tableName - Имя таблицы
 * @returns {string[]} Массив имён зависимых таблиц
 * 
 * @example
 * const dependents = getDependents('games');
 * // ['game_statistics', 'game_events', 'odds_prematch', ...]
 */
function getDependents(tableName) {
  const dependents = [];
  
  for (const [table, config] of Object.entries(TABLE_DEPENDENCIES)) {
    if (config.dependencies.includes(tableName)) {
      dependents.push(table);
    }
  }

  return dependents;
}

/**
 * Получить информацию о таблице
 * 
 * @param {string} tableName - Имя таблицы
 * @returns {{level: number, dependencies: string[], dependents: string[]} | null}
 * 
 * @example
 * const info = getTableInfo('games');
 * console.log(info);
 * // {
 * //   level: 2,
 * //   dependencies: ['leagues', 'teams', 'seasons'],
 * //   dependents: ['game_statistics', 'game_events', ...]
 * // }
 */
function getTableInfo(tableName) {
  const config = TABLE_DEPENDENCIES[tableName];
  if (!config) {
    return null;
  }

  return {
    level: config.level,
    dependencies: [...config.dependencies],
    dependents: getDependents(tableName)
  };
}

/**
 * Получить таблицы по уровню
 * 
 * @param {number} level - Уровень (0-4)
 * @returns {string[]} Массив имён таблиц на указанном уровне
 * 
 * @example
 * const level0Tables = getTablesByLevel(0);
 * // ['countries', 'bookmakers']
 */
function getTablesByLevel(level) {
  return Object.entries(TABLE_DEPENDENCIES)
    .filter(([_, config]) => config.level === level)
    .map(([table, _]) => table)
    .sort();
}

// Экспорт
/**
 * Получить список таблиц-зависимостей для заданной таблицы.
 * @param {string} tableName
 * @returns {string[]} массив имён зависимых таблиц (или [])
 */
function getDependencies(tableName) {
  const cfg = TABLE_DEPENDENCIES[tableName];
  return cfg ? (cfg.dependencies || []).slice() : [];
}

module.exports = {
  TABLE_DEPENDENCIES,
  getLoadOrder,
  validateDependencies,
  canLoadTable,
  getDependents,
  getTableInfo,
  getTablesByLevel,
  getDependencies
};

// Самотестирование при запуске
if (require.main === module) {
  console.log('🔍 Validating table dependencies graph...\n');

  const { valid, errors } = validateDependencies();

  if (valid) {
    console.log('✅ Dependency graph is valid!\n');
    
    console.log('📊 Load order:');
    const order = getLoadOrder();
    let currentLevel = -1;
    
    order.forEach(table => {
      const level = TABLE_DEPENDENCIES[table].level;
      if (level !== currentLevel) {
        console.log(`\n  Level ${level}:`);
        currentLevel = level;
      }
      console.log(`    - ${table}`);
    });

    console.log('\n📈 Statistics:');
    console.log(`  Total tables: ${order.length}`);
    for (let level = 0; level <= 4; level++) {
      const tables = getTablesByLevel(level);
      console.log(`  Level ${level}: ${tables.length} tables`);
    }
  } else {
    console.error('❌ Dependency graph validation FAILED:\n');
    errors.forEach(error => {
      console.error(`  - ${error}`);
    });
    process.exit(1);
  }
}
