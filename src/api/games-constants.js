/**
 * Games API Constants
 * Константы для работы с Games API
 * 
 * @module games-constants
 * @version 2.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

/**
 * Статусы матчей
 * @readonly
 * @enum {number}
 */
const MATCH_STATUS = {
  /** Дата матча ещё не объявлена */
  DATE_NOT_ANNOUNCED: 1,
  
  /** Матч ещё не начался */
  NOT_STARTED: 2,
  
  /** Начало первого тайма */
  FIRST_HALF: 3,
  
  /** Перерыв между таймами */
  HALF_TIME: 4,
  
  /** Начало второго тайма */
  SECOND_HALF: 5,
  
  /** Дополнительное время */
  EXTRA_TIME: 6,
  
  /** Идёт серия пенальти */
  PENALTY_SHOOTOUT: 7,
  
  /** Матч завершён */
  FINISHED: 8,
  
  /** Матч завершён после доп. времени */
  FINISHED_AFTER_EXTRA_TIME: 9,
  
  /** Матч завершён после серии пенальти */
  FINISHED_AFTER_PENALTIES: 10,
  
  /** Перерыв в дополнительном времени */
  EXTRA_TIME_HALF_TIME: 11,
  
  /** Матч приостановлен */
  SUSPENDED: 12,
  
  /** Матч прерван */
  INTERRUPTED: 13,
  
  /** Матч перенесён */
  POSTPONED: 14,
  
  /** Матч отменён */
  CANCELLED: 15,
  
  /** Техническое поражение */
  TECHNICAL_LOSS: 17,
  
  /** Победа без игры (соперник не явился) */
  WALKOVER: 18,
  
  /** Матч в процессе */
  IN_PROGRESS: 19
};

/**
 * Названия статусов матчей
 * @readonly
 * @enum {string}
 */
const MATCH_STATUS_NAMES = {
  1: 'Дата не объявлена',
  2: 'Не начался',
  3: '1-й тайм',
  4: 'Перерыв',
  5: '2-й тайм',
  6: 'Доп. время',
  7: 'Пенальти',
  8: 'Завершён',
  9: 'Завершён (доп. время)',
  10: 'Завершён (пенальти)',
  11: 'Перерыв (доп. время)',
  12: 'Приостановлен',
  13: 'Прерван',
  14: 'Перенесён',
  15: 'Отменён',
  17: 'Техническое поражение',
  18: 'Победа без игры',
  19: 'В процессе'
};

/**
 * Группы статусов матчей
 */
const MATCH_STATUS_GROUPS = {
  /** Живые матчи */
  LIVE: [3, 4, 5, 6, 7, 11, 18, 19],
  
  /** Завершенные матчи */
  ENDED: [8, 9, 10, 17, 18],
  
  /** Предстоящие матчи */
  UPCOMING: [1, 2],
  
  /** Отменённые/перенесённые */
  CANCELLED_OR_POSTPONED: [12, 13, 14, 15]
};

/**
 * Популярные лиги
 * @readonly
 */
const POPULAR_LEAGUES = {
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  LIGUE_1: 61,
  BUNDESLIGA: 78,
  SERIE_A: 135,
  CHAMPIONS_LEAGUE: 2,
  EUROPA_LEAGUE: 3,
  CHAMPIONSHIP: 40,
  EREDIVISIE: 88,
  PRIMEIRA_LIGA: 94
};

/**
 * Лимиты API
 */
const API_LIMITS = {
  /** Максимальное количество записей за один запрос */
  MAX_LIMIT: 1000,
  
  /** Минимальное количество записей */
  MIN_LIMIT: 1,
  
  /** Лимит по умолчанию */
  DEFAULT_LIMIT: 100,
  
  /** Минимальный offset */
  MIN_OFFSET: 0
};

/**
 * Порядок сортировки
 */
const SORT_ORDER = {
  /** По возрастанию (oldest first) */
  ASCENDING: 1,
  
  /** По убыванию (newest first) */
  DESCENDING: -1
};

/**
 * Диапазоны валидации
 */
const VALIDATION_RANGES = {
  /** Диапазон годов */
  YEAR: {
    MIN: 2011,
    MAX: 2070
  },
  
  /** Диапазон статусов */
  STATUS: {
    MIN: 1,
    MAX: 20
  },
  
  /** Диапазон часовых поясов */
  TIMEZONE: {
    MIN: -12,
    MAX: 12,
    DEFAULT: 3
  }
};

/**
 * Получить название статуса по коду
 * @param {number} statusCode - Код статуса
 * @returns {string} Название статуса
 */
function getStatusName(statusCode) {
  return MATCH_STATUS_NAMES[statusCode] || `Unknown (${statusCode})`;
}

/**
 * Проверить, является ли матч живым
 * @param {number} statusCode - Код статуса
 * @returns {boolean}
 */
function isLive(statusCode) {
  return MATCH_STATUS_GROUPS.LIVE.includes(statusCode);
}

/**
 * Проверить, завершён ли матч
 * @param {number} statusCode - Код статуса
 * @returns {boolean}
 */
function isEnded(statusCode) {
  return MATCH_STATUS_GROUPS.ENDED.includes(statusCode);
}

/**
 * Проверить, является ли матч предстоящим
 * @param {number} statusCode - Код статуса
 * @returns {boolean}
 */
function isUpcoming(statusCode) {
  return MATCH_STATUS_GROUPS.UPCOMING.includes(statusCode);
}

/**
 * Проверить, отменён/перенесён ли матч
 * @param {number} statusCode - Код статуса
 * @returns {boolean}
 */
function isCancelledOrPostponed(statusCode) {
  return MATCH_STATUS_GROUPS.CANCELLED_OR_POSTPONED.includes(statusCode);
}

module.exports = {
  MATCH_STATUS,
  MATCH_STATUS_NAMES,
  MATCH_STATUS_GROUPS,
  POPULAR_LEAGUES,
  API_LIMITS,
  SORT_ORDER,
  VALIDATION_RANGES,
  
  // Helper functions
  getStatusName,
  isLive,
  isEnded,
  isUpcoming,
  isCancelledOrPostponed
};
