/**
 * Полный список доступных полей для Advanced Games Query
 * 
 * Источник: SStats API v0.9.13.0
 * Обновлено: 2026-01-31
 * Всего: 170 полей
 */

const AVAILABLE_FIELDS = {
  // Основная информация о матче
  basic: {
    name: 'Основная информация',
    icon: 'ℹ️',
    fields: [
      { name: 'Id', type: 'int', description: 'Уникальный идентификатор матча' },
      { name: 'FlashId', type: 'string', description: 'Идентификатор матча в системе LiveScore' },
      { name: 'SeasonUid', type: 'string', description: 'Уникальный идентификатор сезона' },
      { name: 'Year', type: 'int', description: 'Год проведения сезона' },
      { name: 'Status', type: 'int', description: 'Статус матча (не начат, идет, завершен)' },
      { name: 'Date', type: 'Date', description: 'Дата и время проведения матча' },
      { name: 'LeagueId', type: 'int', description: 'Идентификатор лиги' },
      { name: 'LeagueName', type: 'string', description: 'Название лиги' },
      { name: 'CountryName', type: 'string', description: 'Название страны' },
      { name: 'CountryCode', type: 'string', description: 'Код страны (два символа)' }
    ]
  },

  // Счет матча
  score: {
    name: 'Счет',
    icon: '⚽',
    fields: [
      { name: 'ScoreHome', type: 'int', description: 'Голы домашней команды (итоговый счет)' },
      { name: 'ScoreAway', type: 'int', description: 'Голы гостевой команды (итоговый счет)' },
      { name: 'ScoreHomeFT', type: 'int', description: 'Голы домашней команды (основное время)' },
      { name: 'ScoreAwayFT', type: 'int', description: 'Голы гостевой команды (основное время)' },
      { name: 'ScoreHomeHT', type: 'int', description: 'Голы домашней команды (первый тайм)' },
      { name: 'ScoreAwayHT', type: 'int', description: 'Голы гостевой команды (первый тайм)' },
      { name: 'ScoreHomeET', type: 'int', description: 'Голы домашней команды (доп. время)' },
      { name: 'ScoreAwayET', type: 'int', description: 'Голы гостевой команды (доп. время)' },
      { name: 'ScoreHomePT', type: 'int', description: 'Голы домашней команды (пенальти)' },
      { name: 'ScoreAwayPT', type: 'int', description: 'Голы гостевой команды (пенальти)' }
    ]
  },

  // Команды
  teams: {
    name: 'Команды',
    icon: '👥',
    fields: [
      { name: 'HomeTeamId', type: 'int', description: 'Идентификатор домашней команды' },
      { name: 'AwayTeamId', type: 'int', description: 'Идентификатор гостевой команды' },
      { name: 'HomeTeamName', type: 'string', description: 'Название домашней команды' },
      { name: 'AwayTeamName', type: 'string', description: 'Название гостевой команды' }
    ]
  },

  // Тренеры
  coaches: {
    name: 'Тренеры',
    icon: '👨‍💼',
    fields: [
      { name: 'HomeTeamCoachId', type: 'int', description: 'ID тренера домашней команды' },
      { name: 'AwayTeamCoachId', type: 'int', description: 'ID тренера гостевой команды' },
      { name: 'HomeTeamCoachName', type: 'string', description: 'Полное имя тренера домашней команды' },
      { name: 'AwayTeamCoachName', type: 'string', description: 'Полное имя тренера гостевой команды' },
      { name: 'HomeTeamCoachFirstName', type: 'string', description: 'Имя тренера домашней команды' },
      { name: 'AwayTeamCoachFirstName', type: 'string', description: 'Имя тренера гостевой команды' },
      { name: 'HomeTeamCoachLastName', type: 'string', description: 'Фамилия тренера домашней команды' },
      { name: 'AwayTeamCoachLastName', type: 'string', description: 'Фамилия тренера гостевой команды' },
      { name: 'HomeTeamCoachNationality', type: 'string', description: 'Национальность тренера домашней команды' },
      { name: 'AwayTeamCoachNationality', type: 'string', description: 'Национальность тренера гостевой команды' }
    ]
  },

  // Стадион
  venue: {
    name: 'Стадион',
    icon: '🏟️',
    fields: [
      { name: 'VenueId', type: 'int', description: 'Идентификатор стадиона' },
      { name: 'VenueName', type: 'string', description: 'Название стадиона' },
      { name: 'VenueAddress', type: 'string', description: 'Адрес стадиона' },
      { name: 'VenueCity', type: 'string', description: 'Город стадиона' }
    ]
  },

  // Коэффициенты
  odds: {
    name: 'Коэффициенты',
    icon: '💰',
    fields: [
      { name: 'Winner1', type: 'float', description: 'Коэффициент на победу домашней команды (1)' },
      { name: 'WinnerX', type: 'float', description: 'Коэффициент на ничью (X)' },
      { name: 'Winner2', type: 'float', description: 'Коэффициент на победу гостевой команды (2)' },
      { name: 'DC_1X', type: 'float', description: 'Двойной шанс 1X (победа дома или ничья)' },
      { name: 'DC_12', type: 'float', description: 'Двойной шанс 12 (победа любой команды)' },
      { name: 'DC_2X', type: 'float', description: 'Двойной шанс 2X (победа гостей или ничья)' },
      { name: 'DNB_1', type: 'float', description: 'Ничья не учитывается - домашняя команда' },
      { name: 'DNB_2', type: 'float', description: 'Ничья не учитывается - гостевая команда' },
      { name: 'OddsXgHome', type: 'float', description: 'Ожидаемые голы домашней команды по букмекерам' },
      { name: 'OddsXgAway', type: 'float', description: 'Ожидаемые голы гостевой команды по букмекерам' }
    ]
  },

  // Glicko рейтинг
  glicko: {
    name: 'Glicko Рейтинг',
    icon: '🎓',
    fields: [
      { name: 'GlickoRatingHome', type: 'float', description: 'Рейтинг Glicko 2 домашней команды' },
      { name: 'GlickoRatingAway', type: 'float', description: 'Рейтинг Glicko 2 гостевой команды' },
      { name: 'GlickoRdHome', type: 'float', description: 'Отклонение рейтинга Glicko домашней команды' },
      { name: 'GlickoRdAway', type: 'float', description: 'Отклонение рейтинга Glicko гостевой команды' },
      { name: 'GlickoXgHome', type: 'float', description: 'Ожидаемые голы домашней команды по Glicko' },
      { name: 'GlickoXgAway', type: 'float', description: 'Ожидаемые голы гостевой команды по Glicko' },
      { name: 'GlickoWinProbHome', type: 'float', description: 'Вероятность победы домашней команды по Glicko' },
      { name: 'GlickoWinProbAway', type: 'float', description: 'Вероятность победы гостевой команды по Glicko' }
    ]
  },

  // Удары
  shots: {
    name: 'Удары',
    icon: '🎯',
    fields: [
      { name: 'ShotsOnGoalHome', type: 'int', description: 'Удары в створ ворот домашней команды' },
      { name: 'ShotsOnGoalAway', type: 'int', description: 'Удары в створ ворот гостевой команды' },
      { name: 'ShotsOffGoalHome', type: 'int', description: 'Удары мимо ворот домашней команды' },
      { name: 'ShotsOffGoalAway', type: 'int', description: 'Удары мимо ворот гостевой команды' },
      { name: 'TotalShotsHome', type: 'int', description: 'Общее количество ударов домашней команды' },
      { name: 'TotalShotsAway', type: 'int', description: 'Общее количество ударов гостевой команды' },
      { name: 'BlockedShotsHome', type: 'int', description: 'Заблокированные удары домашней команды' },
      { name: 'BlockedShotsAway', type: 'int', description: 'Заблокированные удары гостевой команды' },
      { name: 'ShotsInsideBoxHome', type: 'int', description: 'Удары из штрафной домашней команды' },
      { name: 'ShotsInsideBoxAway', type: 'int', description: 'Удары из штрафной гостевой команды' },
      { name: 'ShotsOutsideBoxHome', type: 'int', description: 'Удары вне штрафной домашней команды' },
      { name: 'ShotsOutsideBoxAway', type: 'int', description: 'Удары вне штрафной гостевой команды' }
    ]
  },

  // Игровая статистика
  gameplay: {
    name: 'Игровая статистика',
    icon: '📊',
    fields: [
      { name: 'FoulsHome', type: 'int', description: 'Фолы домашней команды' },
      { name: 'FoulsAway', type: 'int', description: 'Фолы гостевой команды' },
      { name: 'CornerKicksHome', type: 'int', description: 'Угловые удары домашней команды' },
      { name: 'CornerKicksAway', type: 'int', description: 'Угловые удары гостевой команды' },
      { name: 'BallPossessionHome', type: 'int', description: 'Владение мячом домашней команды (%)' },
      { name: 'BallPossessionAway', type: 'int', description: 'Владение мячом гостевой команды (%)' },
      { name: 'OffsidesHome', type: 'int', description: 'Офсайды домашней команды' },
      { name: 'OffsidesAway', type: 'int', description: 'Офсайды гостевой команды' }
    ]
  },

  // Дисциплина
  discipline: {
    name: 'Дисциплина',
    icon: '🟨🟥',
    fields: [
      { name: 'YellowCardsHome', type: 'int', description: 'Желтые карточки домашней команды' },
      { name: 'YellowCardsAway', type: 'int', description: 'Желтые карточки гостевой команды' },
      { name: 'RedCardsHome', type: 'int', description: 'Красные карточки домашней команды' },
      { name: 'RedCardsAway', type: 'int', description: 'Красные карточки гостевой команды' }
    ]
  },

  // Вратари
  goalkeepers: {
    name: 'Вратари',
    icon: '🧤',
    fields: [
      { name: 'GoalkeeperSavesHome', type: 'int', description: 'Сейвы вратаря домашней команды' },
      { name: 'GoalkeeperSavesAway', type: 'int', description: 'Сейвы вратаря гостевой команды' }
    ]
  },

  // Передачи
  passes: {
    name: 'Передачи',
    icon: '🔄',
    fields: [
      { name: 'TotalPassesHome', type: 'int', description: 'Общее количество передач домашней команды' },
      { name: 'TotalPassesAway', type: 'int', description: 'Общее количество передач гостевой команды' },
      { name: 'PassesAccurateHome', type: 'int', description: 'Точные передачи домашней команды' },
      { name: 'PassesAccurateAway', type: 'int', description: 'Точные передачи гостевой команды' }
    ]
  },

  // Expected Goals (xG)
  xg: {
    name: 'Expected Goals (xG)',
    icon: '📈',
    fields: [
      { name: 'ExpectedGoalsHome', type: 'float', description: 'Ожидаемые голы домашней команды (xG)' },
      { name: 'ExpectedGoalsAway', type: 'float', description: 'Ожидаемые голы гостевой команды (xG)' },
      { name: 'CalculatedXgHome', type: 'float', description: 'Расчетные ожидаемые голы домашней команды' },
      { name: 'CalculatedXgAway', type: 'float', description: 'Расчетные ожидаемые голы гостевой команды' }
    ]
  },

  // Покрытие данных
  coverage: {
    name: 'Покрытие данных',
    icon: '✅',
    fields: [
      { name: 'CoverageSeasonPlayers', type: 'boolean', description: 'Доступность данных об игроках' },
      { name: 'CoverageSeasonEvents', type: 'boolean', description: 'Доступность данных о событиях' },
      { name: 'CoverageSeasonLineups', type: 'boolean', description: 'Доступность данных о составах' },
      { name: 'CoverageSeasonStatisticsFixtures', type: 'boolean', description: 'Доступность статистики матчей' },
      { name: 'CoverageSeasonStatisticsPlayers', type: 'boolean', description: 'Доступность статистики игроков' },
      { name: 'CoverageSeasonStandings', type: 'boolean', description: 'Доступность турнирной таблицы' },
      { name: 'CoverageSeasonOdds', type: 'boolean', description: 'Доступность коэффициентов' }
    ]
  }
};

/**
 * Получить все поля в плоском списке
 */
function getAllFields() {
  const allFields = [];
  Object.values(AVAILABLE_FIELDS).forEach(group => {
    allFields.push(...group.fields);
  });
  return allFields;
}

/**
 * Получить поля по группе
 */
function getFieldsByGroup(groupName) {
  return AVAILABLE_FIELDS[groupName]?.fields || [];
}

/**
 * Получить информацию о поле
 */
function getFieldInfo(fieldName) {
  const allFields = getAllFields();
  return allFields.find(f => f.name === fieldName);
}

/**
 * Получить список имен всех полей
 */
function getAllFieldNames() {
  return getAllFields().map(f => f.name);
}

/**
 * Получить список групп
 */
function getGroups() {
  return Object.keys(AVAILABLE_FIELDS).map(key => ({
    id: key,
    name: AVAILABLE_FIELDS[key].name,
    icon: AVAILABLE_FIELDS[key].icon,
    count: AVAILABLE_FIELDS[key].fields.length
  }));
}

/**
 * Получить статистику по полям
 */
function getFieldsStats() {
  const groups = getGroups();
  const totalFields = getAllFields().length;
  
  return {
    total: totalFields,
    groups: groups.length,
    byGroup: groups.reduce((acc, group) => {
      acc[group.id] = group.count;
      return acc;
    }, {})
  };
}

/**
 * Популярные поля для быстрого доступа
 */
const POPULAR_FIELDS = [
  'Date',
  'HomeTeamName',
  'AwayTeamName',
  'ScoreHomeFT',
  'ScoreAwayFT',
  'LeagueName',
  'Winner1',
  'WinnerX',
  'Winner2',
  'ExpectedGoalsHome',
  'ExpectedGoalsAway',
  'TotalShotsHome',
  'TotalShotsAway',
  'BallPossessionHome',
  'BallPossessionAway',
  'CornerKicksHome',
  'CornerKicksAway',
  'YellowCardsHome',
  'YellowCardsAway',
  'GlickoRatingHome',
  'GlickoRatingAway'
];

module.exports = {
  AVAILABLE_FIELDS,
  POPULAR_FIELDS,
  getAllFields,
  getFieldsByGroup,
  getFieldInfo,
  getAllFieldNames,
  getGroups,
  getFieldsStats
};
