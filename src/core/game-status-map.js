/**
 * GAME STATUS MAP
 * 
 * Унифицированная карта статусов матчей для SStats и Flashscore.
 * Предотвращает путаницу и обеспечивает консистентность интерпретации статусов.
 * 
 * @version 6.0.0
 * @module core/game-status-map
 */

/**
 * Статусы SStats (нормализованные)
 */
const SSTATS_STATUS = {
  SCHEDULED: {
    value: 'scheduled',
    label: 'Scheduled',
    description: 'Match is scheduled but not started yet',
    isLive: false,
    isFinished: false,
    isPostponed: false,
    isCancelled: false
  },
  LIVE: {
    value: 'live',
    label: 'Live',
    description: 'Match is currently in progress',
    isLive: true,
    isFinished: false,
    isPostponed: false,
    isCancelled: false
  },
  FINISHED: {
    value: 'finished',
    label: 'Finished',
    description: 'Match has ended normally',
    isLive: false,
    isFinished: true,
    isPostponed: false,
    isCancelled: false
  },
  POSTPONED: {
    value: 'postponed',
    label: 'Postponed',
    description: 'Match has been postponed to a later date',
    isLive: false,
    isFinished: false,
    isPostponed: true,
    isCancelled: false
  },
  CANCELLED: {
    value: 'cancelled',
    label: 'Cancelled',
    description: 'Match has been cancelled and will not be played',
    isLive: false,
    isFinished: true,
    isPostponed: false,
    isCancelled: true
  },
  ABANDONED: {
    value: 'abandoned',
    label: 'Abandoned',
    description: 'Match was started but abandoned before completion',
    isLive: false,
    isFinished: true,
    isPostponed: false,
    isCancelled: false
  }
};

/**
 * Статусы Flashscore (детальные)
 */
const FLASHSCORE_STATUS = {
  // До начала матча
  NS: {
    value: 'NS',
    label: 'Not Started',
    description: 'Match not started yet',
    isLive: false,
    isFinished: false,
    normalizedStatus: 'scheduled'
  },
  TBA: {
    value: 'TBA',
    label: 'To Be Announced',
    description: 'Match time to be announced',
    isLive: false,
    isFinished: false,
    normalizedStatus: 'scheduled'
  },

  // Во время матча (Live)
  '1H': {
    value: '1H',
    label: '1st Half',
    description: 'First half in progress',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  HT: {
    value: 'HT',
    label: 'Half Time',
    description: 'Half time break',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  '2H': {
    value: '2H',
    label: '2nd Half',
    description: 'Second half in progress',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  ET: {
    value: 'ET',
    label: 'Extra Time',
    description: 'Extra time in progress',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  BT: {
    value: 'BT',
    label: 'Break Time',
    description: 'Break before extra time',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  P: {
    value: 'P',
    label: 'Penalties',
    description: 'Penalty shootout in progress',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },
  INT: {
    value: 'INT',
    label: 'Interrupted',
    description: 'Match temporarily interrupted',
    isLive: true,
    isFinished: false,
    normalizedStatus: 'live'
  },

  // Завершённые матчи
  FT: {
    value: 'FT',
    label: 'Full Time',
    description: 'Match finished after 90 minutes',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'finished'
  },
  AET: {
    value: 'AET',
    label: 'After Extra Time',
    description: 'Match finished after extra time',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'finished'
  },
  AP: {
    value: 'AP',
    label: 'After Penalties',
    description: 'Match finished after penalty shootout',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'finished'
  },

  // Отложенные/отменённые
  'Postp.': {
    value: 'Postp.',
    label: 'Postponed',
    description: 'Match postponed',
    isLive: false,
    isFinished: false,
    normalizedStatus: 'postponed'
  },
  'Cancl.': {
    value: 'Cancl.',
    label: 'Cancelled',
    description: 'Match cancelled',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'cancelled'
  },
  'Aban.': {
    value: 'Aban.',
    label: 'Abandoned',
    description: 'Match abandoned',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'abandoned'
  },
  'Await.': {
    value: 'Await.',
    label: 'Awaiting',
    description: 'Awaiting updates',
    isLive: false,
    isFinished: false,
    normalizedStatus: 'scheduled'
  },
  WO: {
    value: 'WO',
    label: 'Walkover',
    description: 'Match awarded (walkover)',
    isLive: false,
    isFinished: true,
    normalizedStatus: 'finished'
  }
};

/**
 * Группы статусов для фильтрации
 */
const STATUS_GROUPS = {
  // Live матчи
  live: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT'],
  
  // Завершённые матчи
  finished: ['FT', 'AET', 'AP', 'WO', 'Cancl.', 'Aban.'],
  
  // Предстоящие матчи
  upcoming: ['NS', 'TBA', 'Await.'],
  
  // Отложенные/отменённые
  postponed: ['Postp.'],
  cancelled: ['Cancl.'],
  abandoned: ['Aban.'],
  
  // Все активные (live + upcoming)
  active: ['NS', 'TBA', '1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'Await.']
};

/**
 * Получить информацию о статусе
 * 
 * @param {string} status - Статус (SStats или Flashscore)
 * @returns {Object | null} Информация о статусе или null
 * 
 * @example
 * const info = getStatusInfo('1H');
 * console.log(info.label);   // '1st Half'
 * console.log(info.isLive);  // true
 */
function getStatusInfo(status) {
  // Проверить в нормализованных статусах SStats
  for (const statusObj of Object.values(SSTATS_STATUS)) {
    if (statusObj.value === status) {
      return statusObj;
    }
  }

  // Проверить в статусах Flashscore
  if (FLASHSCORE_STATUS[status]) {
    return FLASHSCORE_STATUS[status];
  }

  return null;
}

/**
 * Проверить, является ли матч live
 * 
 * @param {string} status - Статус матча
 * @returns {boolean}
 * 
 * @example
 * if (isLive(game.status)) {
 *   console.log('Match is live!');
 * }
 */
function isLive(status) {
  const info = getStatusInfo(status);
  return info ? info.isLive : false;
}

/**
 * Проверить, завершён ли матч
 * 
 * @param {string} status - Статус матча
 * @returns {boolean}
 * 
 * @example
 * if (isFinished(game.status)) {
 *   console.log('Match is finished');
 * }
 */
function isFinished(status) {
  const info = getStatusInfo(status);
  return info ? info.isFinished : false;
}

/**
 * Проверить, отложен ли матч
 * 
 * @param {string} status - Статус матча
 * @returns {boolean}
 */
function isPostponed(status) {
  const info = getStatusInfo(status);
  return info ? (info.isPostponed || info.normalizedStatus === 'postponed') : false;
}

/**
 * Проверить, отменён ли матч
 * 
 * @param {string} status - Статус матча
 * @returns {boolean}
 */
function isCancelled(status) {
  const info = getStatusInfo(status);
  return info ? (info.isCancelled || info.normalizedStatus === 'cancelled') : false;
}

/**
 * Нормализовать статус (Flashscore → SStats)
 * 
 * @param {string} rawStatus - Статус из источника (может быть Flashscore)
 * @returns {string} Нормализованный статус SStats
 * 
 * @example
 * const normalized = normalizeStatus('1H');
 * // 'live'
 * 
 * const normalized2 = normalizeStatus('FT');
 * // 'finished'
 */
function normalizeStatus(rawStatus) {
  // Если уже нормализованный статус SStats
  for (const statusObj of Object.values(SSTATS_STATUS)) {
    if (statusObj.value === rawStatus) {
      return rawStatus;
    }
  }

  // Преобразовать из Flashscore
  const flashscoreStatus = FLASHSCORE_STATUS[rawStatus];
  if (flashscoreStatus) {
    return flashscoreStatus.normalizedStatus;
  }

  // Неизвестный статус - вернуть scheduled по умолчанию
  return 'scheduled';
}

/**
 * Получить все статусы в группе
 * 
 * @param {string} groupName - Название группы (live, finished, upcoming, и т.д.)
 * @returns {string[]} Массив статусов
 * 
 * @example
 * const liveStatuses = getStatusGroup('live');
 * // ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT']
 */
function getStatusGroup(groupName) {
  return STATUS_GROUPS[groupName] || [];
}

/**
 * Проверить, входит ли статус в группу
 * 
 * @param {string} status - Статус матча
 * @param {string} groupName - Название группы
 * @returns {boolean}
 * 
 * @example
 * if (isInGroup(game.status, 'live')) {
 *   // Обновить данные каждые 30 секунд
 * }
 */
function isInGroup(status, groupName) {
  const group = STATUS_GROUPS[groupName];
  return group ? group.includes(status) : false;
}

/**
 * Получить все доступные статусы
 * 
 * @returns {{sstats: string[], flashscore: string[]}}
 * 
 * @example
 * const allStatuses = getAllStatuses();
 * console.log(allStatuses.sstats);     // ['scheduled', 'live', 'finished', ...]
 * console.log(allStatuses.flashscore); // ['NS', '1H', 'HT', ...]
 */
function getAllStatuses() {
  return {
    sstats: Object.values(SSTATS_STATUS).map(s => s.value),
    flashscore: Object.keys(FLASHSCORE_STATUS)
  };
}

/**
 * Получить список всех групп
 * 
 * @returns {string[]} Названия групп
 */
function getGroupNames() {
  return Object.keys(STATUS_GROUPS);
}

/**
 * Валидация статуса
 * 
 * @param {string} status - Статус для проверки
 * @returns {{valid: boolean, source: string | null}} Результат валидации
 * 
 * @example
 * const result = validateStatus('1H');
 * // { valid: true, source: 'flashscore' }
 * 
 * const result2 = validateStatus('INVALID');
 * // { valid: false, source: null }
 */
function validateStatus(status) {
  // Проверить в SStats
  for (const statusObj of Object.values(SSTATS_STATUS)) {
    if (statusObj.value === status) {
      return { valid: true, source: 'sstats' };
    }
  }

  // Проверить в Flashscore
  if (FLASHSCORE_STATUS[status]) {
    return { valid: true, source: 'flashscore' };
  }

  return { valid: false, source: null };
}

/**
 * Получить рекомендуемый интервал обновления для статуса
 * 
 * @param {string} status - Статус матча
 * @returns {number} Интервал в миллисекундах
 * 
 * @example
 * const interval = getRefreshInterval(game.status);
 * setInterval(() => updateGame(game.id), interval);
 */
function getRefreshInterval(status) {
  if (isLive(status)) {
    return 30000; // 30 секунд для live
  } else if (isFinished(status)) {
    return 300000; // 5 минут для завершённых
  } else {
    return 60000; // 1 минута для предстоящих
  }
}

// Экспорт
module.exports = {
  // Константы
  SSTATS_STATUS,
  FLASHSCORE_STATUS,
  STATUS_GROUPS,

  // Функции проверки
  getStatusInfo,
  isLive,
  isFinished,
  isPostponed,
  isCancelled,

  // Нормализация и преобразования
  normalizeStatus,

  // Группы
  getStatusGroup,
  isInGroup,
  getGroupNames,

  // Утилиты
  getAllStatuses,
  validateStatus,
  getRefreshInterval
};

// Самотестирование при запуске
if (require.main === module) {
  console.log('⚽ Game Status Map\n');

  // Статистика
  const allStatuses = getAllStatuses();
  console.log(`SStats statuses: ${allStatuses.sstats.length}`);
  console.log(`Flashscore statuses: ${allStatuses.flashscore.length}`);
  console.log(`Total: ${allStatuses.sstats.length + allStatuses.flashscore.length}\n`);

  // Группы
  console.log('Status groups:');
  const groups = getGroupNames();
  groups.forEach(group => {
    const statuses = getStatusGroup(group);
    console.log(`  ${group}: ${statuses.length} statuses`);
    console.log(`    ${statuses.join(', ')}`);
  });

  // Примеры нормализации
  console.log('\n📋 Normalization examples:');
  const examples = ['NS', '1H', 'HT', '2H', 'FT', 'Postp.', 'Cancl.'];
  examples.forEach(status => {
    const normalized = normalizeStatus(status);
    const info = getStatusInfo(status);
    console.log(`  ${status.padEnd(8)} → ${normalized.padEnd(12)} (${info.label})`);
  });

  // Проверка функций
  console.log('\n✅ Function tests:');
  
  const testCases = [
    { status: '1H', expectedLive: true, expectedFinished: false },
    { status: 'FT', expectedLive: false, expectedFinished: true },
    { status: 'NS', expectedLive: false, expectedFinished: false }
  ];

  let allPassed = true;
  testCases.forEach(test => {
    const liveResult = isLive(test.status);
    const finishedResult = isFinished(test.status);
    const livePassed = liveResult === test.expectedLive;
    const finishedPassed = finishedResult === test.expectedFinished;
    
    if (livePassed && finishedPassed) {
      console.log(`  ✅ ${test.status}: isLive=${liveResult}, isFinished=${finishedResult}`);
    } else {
      console.log(`  ❌ ${test.status}: FAILED`);
      allPassed = false;
    }
  });

  // Интервалы обновления
  console.log('\n⏱️  Recommended refresh intervals:');
  ['NS', '1H', 'FT'].forEach(status => {
    const interval = getRefreshInterval(status);
    console.log(`  ${status.padEnd(8)} → ${interval / 1000}s`);
  });

  console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed!'));
}
