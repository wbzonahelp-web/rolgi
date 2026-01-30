/**
 * RESPONSE TYPE CONTRACTS
 * 
 * Строгие JSDoc контракты для API-ответов SStats.net.
 * Предотвращает неправильную интерпретацию структуры данных AI-агентами.
 * 
 * @version 6.0.0
 * @module api/response-types
 */

// ============================================================================
// БАЗОВЫЕ ТИПЫ
// ============================================================================

/**
 * Стандартный ответ API SStats
 * @typedef {Object} SStatsApiResponse
 * @property {string} status - Статус ответа: 'success' | 'error'
 * @property {*} data - Полезная нагрузка (payload)
 * @property {string} [cursor] - Курсор для пагинации (опционально)
 * @property {Object} [pagination] - Информация о пагинации
 * @property {number} [pagination.total] - Общее количество записей
 * @property {number} [pagination.page] - Текущая страница
 * @property {number} [pagination.limit] - Лимит на странице
 * @property {string} [error] - Сообщение об ошибке (если status === 'error')
 */

// ============================================================================
// СУЩНОСТИ
// ============================================================================

/**
 * Лига (League)
 * @typedef {Object} SStatsLeague
 * @property {number} id - SStats league ID
 * @property {string} name - Название лиги
 * @property {number} countryId - ID страны
 * @property {string} countryName - Название страны
 * @property {string} [logo] - URL логотипа
 * @property {boolean} isActive - Активна ли лига
 * @property {number} [priority] - Приоритет отображения
 */

/**
 * Команда (короткая версия)
 * @typedef {Object} SStatsTeamShort
 * @property {number} id - SStats team ID
 * @property {string} name - Название команды
 * @property {string} [logo] - URL логотипа
 * @property {number} [countryId] - ID страны
 */

/**
 * Команда (полная версия)
 * @typedef {Object} SStatsTeamFull
 * @property {number} id - SStats team ID
 * @property {string} name - Название команды
 * @property {string} [shortName] - Короткое название
 * @property {string} [logo] - URL логотипа
 * @property {number} countryId - ID страны
 * @property {string} countryName - Название страны
 * @property {string} [stadium] - Название стадиона
 * @property {number} [founded] - Год основания
 * @property {string} [website] - Официальный сайт
 */

/**
 * Игрок (короткая версия)
 * @typedef {Object} SStatsPlayerShort
 * @property {number} id - SStats player ID
 * @property {string} name - Имя игрока
 * @property {number} [number] - Номер на футболке
 * @property {string} [position] - Позиция (GK, DF, MF, FW)
 */

/**
 * Игрок (полная версия)
 * @typedef {Object} SStatsPlayerFull
 * @property {number} id - SStats player ID
 * @property {string} name - Имя игрока
 * @property {string} [firstName] - Имя
 * @property {string} [lastName] - Фамилия
 * @property {string} dateOfBirth - Дата рождения (ISO 8601)
 * @property {number} age - Возраст
 * @property {number} height - Рост (см)
 * @property {number} weight - Вес (кг)
 * @property {string} position - Позиция
 * @property {number} countryId - ID страны
 * @property {string} countryName - Название страны
 * @property {string} [photo] - URL фото
 */

// ============================================================================
// МАТЧИ
// ============================================================================

/**
 * Матч (короткая версия - для списков)
 * @typedef {Object} SStatsGameShort
 * @property {number} id - SStats game ID
 * @property {string} date - Дата и время (ISO 8601)
 * @property {number} leagueId - ID лиги
 * @property {string} leagueName - Название лиги
 * @property {number} season - Сезон (год)
 * @property {SStatsTeamShort} homeTeam - Домашняя команда
 * @property {SStatsTeamShort} awayTeam - Гостевая команда
 * @property {number} [homeScore] - Счёт домашней команды
 * @property {number} [awayScore] - Счёт гостевой команды
 * @property {string} status - Статус матча (scheduled, live, finished, postponed, cancelled, abandoned)
 */

/**
 * Матч (полная версия - со всеми деталями)
 * @typedef {Object} SStatsGameFull
 * @property {number} id - SStats game ID
 * @property {string} date - Дата и время (ISO 8601)
 * @property {number} leagueId - ID лиги
 * @property {string} leagueName - Название лиги
 * @property {number} season - Сезон (год)
 * @property {number} round - Тур
 * @property {SStatsTeamFull} homeTeam - Домашняя команда
 * @property {SStatsTeamFull} awayTeam - Гостевая команда
 * @property {number} [homeScore] - Счёт домашней команды
 * @property {number} [awayScore] - Счёт гостевой команды
 * @property {number} [homeScoreHT] - Счёт на перерыве (домашняя)
 * @property {number} [awayScoreHT] - Счёт на перерыве (гостевая)
 * @property {string} status - Статус матча
 * @property {string} [referee] - Судья
 * @property {string} [stadium] - Стадион
 * @property {number} [attendance] - Посещаемость
 * @property {Object} [statistics] - Статистика матча
 * @property {Object[]} [events] - События матча
 * @property {Object[]} [lineups] - Составы команд
 */

/**
 * Статистика матча
 * @typedef {Object} SStatsGameStatistics
 * @property {number} gameId - ID матча
 * @property {number} [possessionHome] - Владение мячом домашней команды (%)
 * @property {number} [possessionAway] - Владение мячом гостевой команды (%)
 * @property {number} [shotsHome] - Удары домашней команды
 * @property {number} [shotsAway] - Удары гостевой команды
 * @property {number} [shotsOnTargetHome] - Удары в створ (домашняя)
 * @property {number} [shotsOnTargetAway] - Удары в створ (гостевая)
 * @property {number} [cornersHome] - Угловые (домашняя)
 * @property {number} [cornersAway] - Угловые (гостевая)
 * @property {number} [foulsHome] - Фолы (домашняя)
 * @property {number} [foulsAway] - Фолы (гостевая)
 * @property {number} [yellowCardsHome] - Жёлтые карточки (домашняя)
 * @property {number} [yellowCardsAway] - Жёлтые карточки (гостевая)
 * @property {number} [redCardsHome] - Красные карточки (домашняя)
 * @property {number} [redCardsAway] - Красные карточки (гостевая)
 * @property {number} [offsideHome] - Офсайды (домашняя)
 * @property {number} [offsideAway] - Офсайды (гостевая)
 */

/**
 * Событие матча (гол, карточка и т.д.)
 * @typedef {Object} SStatsGameEvent
 * @property {number} id - ID события
 * @property {number} gameId - ID матча
 * @property {number} teamId - ID команды
 * @property {number} [playerId] - ID игрока
 * @property {string} playerName - Имя игрока
 * @property {number} minute - Минута события
 * @property {string} type - Тип события (goal, yellow_card, red_card, substitution, penalty, own_goal)
 * @property {string} [subtype] - Подтип (penalty, free_kick и т.д.)
 * @property {number} [assistPlayerId] - ID игрока, сделавшего ассист
 * @property {string} [assistPlayerName] - Имя игрока, сделавшего ассист
 */

// ============================================================================
// КОЭФФИЦИЕНТЫ
// ============================================================================

/**
 * Букмекер
 * @typedef {Object} SStatsBookmaker
 * @property {number} id - ID букмекера
 * @property {string} name - Название букмекера
 * @property {string} [website] - Сайт букмекера
 * @property {boolean} isActive - Активен ли букмекер
 */

/**
 * Коэффициенты на матч
 * @typedef {Object} SStatsOdds
 * @property {number} gameId - ID матча
 * @property {number} bookmakerId - ID букмекера
 * @property {string} bookmakerName - Название букмекера
 * @property {string} marketId - ID рынка (1x2, ou25, btts и т.д.)
 * @property {string} marketName - Название рынка
 * @property {string} selection - Выбор (home, draw, away, over, under, yes, no)
 * @property {number} odds - Коэффициент
 * @property {string} timestamp - Время обновления (ISO 8601)
 * @property {boolean} isLive - Live или prematch
 */

// ============================================================================
// АНАЛИТИКА
// ============================================================================

/**
 * Glicko рейтинг команды
 * @typedef {Object} SStatsGlicko
 * @property {number} gameId - ID матча
 * @property {number} teamId - ID команды
 * @property {string} teamName - Название команды
 * @property {number} rating - Рейтинг
 * @property {number} rd - Rating Deviation
 * @property {number} vol - Волатильность
 * @property {number} winProbability - Вероятность победы (0-1)
 */

/**
 * Турнирная таблица (одна команда)
 * @typedef {Object} SStatsStandingsEntry
 * @property {number} leagueId - ID лиги
 * @property {number} season - Сезон
 * @property {number} teamId - ID команды
 * @property {string} teamName - Название команды
 * @property {number} position - Позиция в таблице
 * @property {number} played - Сыграно матчей
 * @property {number} won - Побед
 * @property {number} drawn - Ничьих
 * @property {number} lost - Поражений
 * @property {number} goalsFor - Забито голов
 * @property {number} goalsAgainst - Пропущено голов
 * @property {number} goalDifference - Разница мячей
 * @property {number} points - Очки
 * @property {string} [form] - Форма команды (WWDLL)
 */

// ============================================================================
// СХЕМЫ ДЛЯ ВАЛИДАЦИИ
// ============================================================================

/**
 * Схемы для валидации структуры ответов
 */
const RESPONSE_SCHEMAS = {
  SStatsLeague: {
    id: { type: 'number', required: true },
    name: { type: 'string', required: true },
    countryId: { type: 'number', required: true },
    countryName: { type: 'string', required: true },
    logo: { type: 'string', required: false },
    isActive: { type: 'boolean', required: true },
    priority: { type: 'number', required: false }
  },

  SStatsTeamShort: {
    id: { type: 'number', required: true },
    name: { type: 'string', required: true },
    logo: { type: 'string', required: false },
    countryId: { type: 'number', required: false }
  },

  SStatsGameShort: {
    id: { type: 'number', required: true },
    date: { type: 'string', required: true },
    leagueId: { type: 'number', required: true },
    leagueName: { type: 'string', required: true },
    season: { type: 'number', required: true },
    homeTeam: { type: 'object', required: true },
    awayTeam: { type: 'object', required: true },
    homeScore: { type: 'number', required: false },
    awayScore: { type: 'number', required: false },
    status: { type: 'string', required: true }
  },

  SStatsOdds: {
    gameId: { type: 'number', required: true },
    bookmakerId: { type: 'number', required: true },
    bookmakerName: { type: 'string', required: true },
    marketId: { type: 'string', required: true },
    marketName: { type: 'string', required: true },
    selection: { type: 'string', required: true },
    odds: { type: 'number', required: true },
    timestamp: { type: 'string', required: true },
    isLive: { type: 'boolean', required: true }
  },

  SStatsStandingsEntry: {
    leagueId: { type: 'number', required: true },
    season: { type: 'number', required: true },
    teamId: { type: 'number', required: true },
    teamName: { type: 'string', required: true },
    position: { type: 'number', required: true },
    played: { type: 'number', required: true },
    won: { type: 'number', required: true },
    drawn: { type: 'number', required: true },
    lost: { type: 'number', required: true },
    goalsFor: { type: 'number', required: true },
    goalsAgainst: { type: 'number', required: true },
    goalDifference: { type: 'number', required: true },
    points: { type: 'number', required: true }
  }
};

/**
 * Валидация структуры ответа
 * 
 * @param {*} data - Данные для валидации
 * @param {string} typeName - Название типа (например, 'SStatsLeague')
 * @returns {{valid: boolean, errors: string[]}}
 * 
 * @example
 * const response = await apiClient.get('/Leagues');
 * const { valid, errors } = validateResponseStructure(response.data[0], 'SStatsLeague');
 * if (!valid) {
 *   throw new ValidationError('Invalid API response', errors);
 * }
 */
function validateResponseStructure(data, typeName) {
  const schema = RESPONSE_SCHEMAS[typeName];
  
  if (!schema) {
    return {
      valid: false,
      errors: [`Unknown type: ${typeName}`]
    };
  }

  const errors = [];

  // Проверка обязательных полей
  for (const [field, config] of Object.entries(schema)) {
    if (config.required && !(field in data)) {
      errors.push(`Missing required field: ${field}`);
    }

    // Проверка типа, если поле присутствует
    if (field in data && data[field] !== null && data[field] !== undefined) {
      const actualType = typeof data[field];
      if (actualType !== config.type) {
        errors.push(
          `Invalid type for field "${field}": expected ${config.type}, got ${actualType}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Валидация массива объектов
 * 
 * @param {Array} dataArray - Массив объектов для валидации
 * @param {string} typeName - Название типа
 * @returns {{valid: boolean, errors: Array<{index: number, errors: string[]}>}}
 * 
 * @example
 * const response = await apiClient.get('/Leagues');
 * const { valid, errors } = validateResponseArray(response.data, 'SStatsLeague');
 */
function validateResponseArray(dataArray, typeName) {
  if (!Array.isArray(dataArray)) {
    return {
      valid: false,
      errors: [{ index: -1, errors: ['Data is not an array'] }]
    };
  }

  const allErrors = [];
  let isValid = true;

  dataArray.forEach((item, index) => {
    const result = validateResponseStructure(item, typeName);
    if (!result.valid) {
      isValid = false;
      allErrors.push({
        index,
        errors: result.errors
      });
    }
  });

  return {
    valid: isValid,
    errors: allErrors
  };
}

/**
 * Получить схему для типа
 * 
 * @param {string} typeName - Название типа
 * @returns {Object | null} Схема или null
 */
function getSchema(typeName) {
  return RESPONSE_SCHEMAS[typeName] || null;
}

/**
 * Список всех доступных типов
 * 
 * @returns {string[]} Массив названий типов
 */
function getAvailableTypes() {
  return Object.keys(RESPONSE_SCHEMAS);
}

// Экспорт
module.exports = {
  // Функции валидации
  validateResponseStructure,
  validateResponseArray,
  getSchema,
  getAvailableTypes,
  
  // Схемы
  RESPONSE_SCHEMAS
};

// Самотестирование при запуске
if (require.main === module) {
  console.log('🔍 Testing Response Type Contracts...\n');

  // Тестовые данные
  const testLeague = {
    id: 123,
    name: 'Premier League',
    countryId: 1,
    countryName: 'England',
    logo: 'https://example.com/logo.png',
    isActive: true,
    priority: 1
  };

  const invalidLeague = {
    id: 'not-a-number', // неправильный тип
    name: 'Test League',
    // countryId отсутствует (обязательное поле)
    countryName: 'Test Country',
    isActive: 'yes' // неправильный тип
  };

  // Тест 1: Валидные данные
  console.log('Test 1: Valid league data');
  const result1 = validateResponseStructure(testLeague, 'SStatsLeague');
  console.log(`  Result: ${result1.valid ? '✅ PASS' : '❌ FAIL'}`);
  if (!result1.valid) {
    console.log('  Errors:', result1.errors);
  }

  // Тест 2: Невалидные данные
  console.log('\nTest 2: Invalid league data');
  const result2 = validateResponseStructure(invalidLeague, 'SStatsLeague');
  console.log(`  Result: ${!result2.valid ? '✅ PASS (expected to fail)' : '❌ FAIL'}`);
  console.log('  Errors found:', result2.errors.length);
  result2.errors.forEach(err => console.log(`    - ${err}`));

  // Тест 3: Валидация массива
  console.log('\nTest 3: Array validation');
  const testArray = [testLeague, invalidLeague];
  const result3 = validateResponseArray(testArray, 'SStatsLeague');
  console.log(`  Result: ${!result3.valid ? '✅ PASS (expected to find errors)' : '❌ FAIL'}`);
  console.log(`  Valid items: 1, Invalid items: ${result3.errors.length}`);

  // Информация о доступных типах
  console.log('\n📋 Available types:');
  getAvailableTypes().forEach(type => {
    console.log(`  - ${type}`);
  });

  console.log('\n✅ Response Type Contracts test completed!');
}
