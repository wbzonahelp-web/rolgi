/**
 * Games Query Examples
 * Примеры запросов к Games API (GET /games/list)
 * 
 * API позволяет получить список футбольных матчей с возможностью фильтрации
 * по различным параметрам.
 * 
 * @module games-query-examples
 * @version 2.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

const GamesQueryBuilder = require('./games-query-builder');

/**
 * ===========================================================================
 * КАТЕГОРИЯ: DATE (Запросы по дате)
 * ===========================================================================
 */

/**
 * Получить матчи на сегодня
 * @returns {Object} Query object
 */
function getMatchesToday() {
  return new GamesQueryBuilder()
    .forToday()
    .limit(100)
    .build();
}

/**
 * Получить матчи на завтра
 * @returns {Object} Query object
 */
function getMatchesTomorrow() {
  return new GamesQueryBuilder()
    .forTomorrow()
    .limit(100)
    .build();
}

/**
 * Получить матчи на вчера
 * @returns {Object} Query object
 */
function getMatchesYesterday() {
  return new GamesQueryBuilder()
    .forYesterday()
    .limit(100)
    .build();
}

/**
 * Получить матчи за конкретную дату
 * @returns {Object} Query object
 */
function getMatchesByDate() {
  return new GamesQueryBuilder()
    .forDate('2026-02-15')
    .limit(100)
    .build();
}

/**
 * Получить матчи за период
 * @returns {Object} Query object
 */
function getMatchesByDateRange() {
  return new GamesQueryBuilder()
    .fromDate('2026-02-01')
    .toDate('2026-02-07')
    .limit(500)
    .build();
}

/**
 * Получить матчи за последние N дней
 * @returns {Object} Query object
 */
function getMatchesLastNDays() {
  return new GamesQueryBuilder()
    .lastDays(7)
    .limit(500)
    .build();
}

/**
 * Получить матчи за следующие N дней
 * @returns {Object} Query object
 */
function getMatchesNextNDays() {
  return new GamesQueryBuilder()
    .nextDays(7)
    .limit(500)
    .build();
}

/**
 * Получить матчи с указанием времени и часового пояса
 * @returns {Object} Query object
 */
function getMatchesWithTimeAndTimezone() {
  return new GamesQueryBuilder()
    .fromDate('2026-02-15T14:00:00+03:00')
    .toDate('2026-02-15T18:00:00+03:00')
    .limit(100)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: TEAM (Запросы по командам)
 * ===========================================================================
 */

/**
 * Получить все матчи команды
 * @returns {Object} Query object
 */
function getTeamMatches() {
  return new GamesQueryBuilder()
    .forTeam(42) // Arsenal
    .limit(50)
    .orderByDateDesc()
    .build();
}

/**
 * Получить матчи команды за определенный период
 * @returns {Object} Query object
 */
function getTeamMatchesByPeriod() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .fromDate('2026-01-01')
    .toDate('2026-03-01')
    .limit(50)
    .build();
}

/**
 * Получить домашние матчи команды
 * @returns {Object} Query object
 */
function getHomeMatches() {
  return new GamesQueryBuilder()
    .forHomeTeam(42) // Arsenal
    .limit(50)
    .orderByDateDesc()
    .build();
}

/**
 * Получить выездные матчи команды
 * @returns {Object} Query object
 */
function getAwayMatches() {
  return new GamesQueryBuilder()
    .forAwayTeam(42) // Arsenal
    .limit(50)
    .orderByDateDesc()
    .build();
}

/**
 * Получить матчи между двумя командами (Head to Head)
 * @returns {Object} Query object
 */
function getHeadToHead() {
  return new GamesQueryBuilder()
    .bothTeams([42, 529]) // Arsenal vs Barcelona
    .limit(20)
    .orderByDateDesc()
    .build();
}

/**
 * Получить матчи нескольких команд
 * @returns {Object} Query object
 */
function getMultipleTeamsMatches() {
  return new GamesQueryBuilder()
    .forTeams([42, 529, 530]) // Arsenal, Barcelona, Atletico Madrid
    .limit(100)
    .orderByDateDesc()
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: LEAGUE (Запросы по лигам)
 * ===========================================================================
 */

/**
 * Получить матчи лиги
 * @returns {Object} Query object
 */
function getLeagueMatches() {
  return new GamesQueryBuilder()
    .forLeague(39) // Premier League
    .limit(100)
    .orderByDateDesc()
    .build();
}

/**
 * Получить матчи лиги за конкретный сезон
 * @returns {Object} Query object
 */
function getLeagueMatchesBySeason() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .forYear(2025)
    .limit(500)
    .build();
}

/**
 * Получить матчи лиги по SeasonUid
 * @returns {Object} Query object
 */
function getLeagueMatchesBySeasonUid() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .forSeasonUid('12345678-1234-1234-1234-123456789abc')
    .limit(500)
    .build();
}

/**
 * Получить матчи нескольких лиг
 * @returns {Object} Query object
 */
function getMultipleLeaguesMatches() {
  return new GamesQueryBuilder()
    .forLeagues([39, 140, 61]) // Premier League, La Liga, Ligue 1
    .forYear(2025)
    .limit(500)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: STATUS (Запросы по статусу матча)
 * ===========================================================================
 */

/**
 * Получить живые матчи
 * @returns {Object} Query object
 */
function getLiveMatches() {
  return new GamesQueryBuilder()
    .liveOnly()
    .limit(100)
    .build();
}

/**
 * Получить предстоящие матчи
 * @returns {Object} Query object
 */
function getUpcomingMatches() {
  return new GamesQueryBuilder()
    .upcomingOnly()
    .limit(100)
    .build();
}

/**
 * Получить завершенные матчи
 * @returns {Object} Query object
 */
function getEndedMatches() {
  return new GamesQueryBuilder()
    .endedOnly()
    .limit(100)
    .build();
}

/**
 * Получить матчи по конкретному статусу
 * @returns {Object} Query object
 */
function getMatchesByStatus() {
  return new GamesQueryBuilder()
    .forStatus(1) // FT - Full Time
    .limit(100)
    .build();
}

/**
 * Получить живые матчи на сегодня
 * @returns {Object} Query object
 */
function getTodayLiveMatches() {
  return new GamesQueryBuilder()
    .forToday()
    .liveOnly()
    .limit(100)
    .build();
}

/**
 * Получить предстоящие матчи на сегодня
 * @returns {Object} Query object
 */
function getTodayUpcomingMatches() {
  return new GamesQueryBuilder()
    .forToday()
    .upcomingOnly()
    .limit(100)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: COMBINED (Комбинированные запросы)
 * ===========================================================================
 */

/**
 * Получить живые матчи команды
 * @returns {Object} Query object
 */
function getTeamLiveMatches() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .liveOnly()
    .limit(10)
    .build();
}

/**
 * Получить предстоящие матчи команды
 * @returns {Object} Query object
 */
function getTeamUpcomingMatches() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .upcomingOnly()
    .limit(20)
    .build();
}

/**
 * Получить завершенные матчи команды
 * @returns {Object} Query object
 */
function getTeamEndedMatches() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .endedOnly()
    .limit(50)
    .build();
}

/**
 * Получить живые матчи лиги
 * @returns {Object} Query object
 */
function getLeagueLiveMatches() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .liveOnly()
    .limit(50)
    .build();
}

/**
 * Получить предстоящие матчи лиги на сегодня
 * @returns {Object} Query object
 */
function getLeagueTodayUpcomingMatches() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .forToday()
    .upcomingOnly()
    .limit(50)
    .build();
}

/**
 * Получить матчи команды в лиге
 * @returns {Object} Query object
 */
function getTeamLeagueMatches() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .forLeague(39)
    .forYear(2025)
    .limit(50)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: ADVANCED (Расширенные запросы)
 * ===========================================================================
 */

/**
 * Получить матчи с коэффициентами
 * @returns {Object} Query object
 */
function getMatchesWithOdds() {
  return new GamesQueryBuilder()
    .forToday()
    .includeOdds()
    .limit(100)
    .build();
}

/**
 * Получить матчи с пагинацией
 * @returns {Object} Query object
 */
function getMatchesWithPagination() {
  return new GamesQueryBuilder()
    .forToday()
    .offset(0)
    .limit(50)
    .build();
}

/**
 * Получить матчи с сортировкой по дате (по возрастанию)
 * @returns {Object} Query object
 */
function getMatchesOrderedAsc() {
  return new GamesQueryBuilder()
    .lastDays(7)
    .orderByDateAsc()
    .limit(100)
    .build();
}

/**
 * Получить матчи с сортировкой по дате (по убыванию)
 * @returns {Object} Query object
 */
function getMatchesOrderedDesc() {
  return new GamesQueryBuilder()
    .lastDays(7)
    .orderByDateDesc()
    .limit(100)
    .build();
}

/**
 * Получить матчи по нескольким ID
 * @returns {Object} Query object
 */
function getMatchesByIds() {
  return new GamesQueryBuilder()
    .forIds(['1377788', '1363444', '1353374'])
    .build();
}

/**
 * Получить матчи по FlashId
 * @returns {Object} Query object
 */
function getMatchesByFlashIds() {
  return new GamesQueryBuilder()
    .forFlashIds(['ABC123', 'DEF456', 'GHI789'])
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: POPULAR (Популярные запросы)
 * ===========================================================================
 */

/**
 * Получить топ матчи на сегодня
 * @returns {Object} Query object
 */
function getTopMatchesToday() {
  return new GamesQueryBuilder()
    .forToday()
    .forLeagues([39, 140, 61, 78, 135]) // Top 5 European leagues
    .limit(100)
    .build();
}

/**
 * Получить матчи выходных дней
 * @returns {Object} Query object
 */
function getWeekendMatches() {
  const saturday = new Date();
  saturday.setDate(saturday.getDate() + (6 - saturday.getDay()));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  
  return new GamesQueryBuilder()
    .fromDate(saturday.toISOString().split('T')[0])
    .toDate(sunday.toISOString().split('T')[0])
    .limit(500)
    .build();
}

/**
 * Получить матчи тура выходного дня для топ лиг
 * @returns {Object} Query object
 */
function getTopLeaguesWeekendMatches() {
  return new GamesQueryBuilder()
    .forLeagues([39, 140, 61, 78, 135])
    .lastDays(3)
    .limit(200)
    .build();
}

/**
 * Получить вечерние матчи сегодня (с 18:00)
 * @returns {Object} Query object
 */
function getTodayEveningMatches() {
  const today = new Date().toISOString().split('T')[0];
  return new GamesQueryBuilder()
    .fromDate(`${today}T18:00:00+03:00`)
    .toDate(`${today}T23:59:59+03:00`)
    .limit(100)
    .build();
}

/**
 * Получить матчи Лиги Чемпионов
 * @returns {Object} Query object
 */
function getChampionsLeagueMatches() {
  return new GamesQueryBuilder()
    .forLeague(2) // UEFA Champions League
    .forYear(2025)
    .limit(200)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: SPECIAL (Специальные запросы)
 * ===========================================================================
 */

/**
 * Получить дерби (матчи между командами из одного города)
 * @returns {Object} Query object
 */
function getDerbyMatches() {
  // Manchester Derby
  return new GamesQueryBuilder()
    .bothTeams([33, 50]) // Man United vs Man City
    .limit(20)
    .orderByDateDesc()
    .build();
}

/**
 * Получить матчи топ-6 АПЛ между собой
 * @returns {Object} Query object
 */
function getTop6Matches() {
  return new GamesQueryBuilder()
    .forTeams([42, 33, 50, 47, 49, 40]) // Arsenal, Man Utd, Man City, Tottenham, Chelsea, Liverpool
    .forLeague(39)
    .forYear(2025)
    .limit(100)
    .build();
}

/**
 * Получить матчи за последние 2 часа
 * @returns {Object} Query object
 */
function getRecentMatches() {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  return new GamesQueryBuilder()
    .fromDate(twoHoursAgo.toISOString())
    .toDate(now.toISOString())
    .limit(100)
    .build();
}

/**
 * Получить матчи которые начнутся в следующий час
 * @returns {Object} Query object
 */
function getMatchesStartingSoon() {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  
  return new GamesQueryBuilder()
    .fromDate(now.toISOString())
    .toDate(oneHourLater.toISOString())
    .upcomingOnly()
    .limit(50)
    .build();
}

/**
 * Получить матчи в прямом эфире с коэффициентами
 * @returns {Object} Query object
 */
function getLiveMatchesWithOdds() {
  return new GamesQueryBuilder()
    .liveOnly()
    .includeOdds()
    .limit(50)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: PAGINATION (Примеры с пагинацией)
 * ===========================================================================
 */

/**
 * Получить первую страницу матчей
 * @returns {Object} Query object
 */
function getMatchesPage1() {
  return new GamesQueryBuilder()
    .forToday()
    .offset(0)
    .limit(50)
    .build();
}

/**
 * Получить вторую страницу матчей
 * @returns {Object} Query object
 */
function getMatchesPage2() {
  return new GamesQueryBuilder()
    .forToday()
    .offset(50)
    .limit(50)
    .build();
}

/**
 * Получить третью страницу матчей
 * @returns {Object} Query object
 */
function getMatchesPage3() {
  return new GamesQueryBuilder()
    .forToday()
    .offset(100)
    .limit(50)
    .build();
}

/**
 * ===========================================================================
 * КАТЕГОРИЯ: ANALYTICS (Запросы для аналитики)
 * ===========================================================================
 */

/**
 * Получить все матчи команды за сезон для анализа
 * @returns {Object} Query object
 */
function getTeamSeasonAnalytics() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .forYear(2025)
    .endedOnly()
    .limit(100)
    .build();
}

/**
 * Получить домашние и выездные матчи для анализа преимущества поля
 * @returns {Object} Query object
 */
function getHomeAwayAnalytics() {
  return new GamesQueryBuilder()
    .forHomeTeam(42)
    .forYear(2025)
    .endedOnly()
    .limit(50)
    .build();
}

/**
 * Получить матчи для анализа формы команды (последние 5)
 * @returns {Object} Query object
 */
function getTeamFormAnalytics() {
  return new GamesQueryBuilder()
    .forTeam(42)
    .endedOnly()
    .orderByDateDesc()
    .limit(5)
    .build();
}

/**
 * Получить матчи лиги для статистики результатов
 * @returns {Object} Query object
 */
function getLeagueStatsAnalytics() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .forYear(2025)
    .endedOnly()
    .limit(1000)
    .build();
}

/**
 * Получить матчи для анализа тоталов
 * @returns {Object} Query object
 */
function getTotalsAnalytics() {
  return new GamesQueryBuilder()
    .forLeague(39)
    .forYear(2025)
    .endedOnly()
    .includeOdds()
    .limit(500)
    .build();
}

// ===========================================================================
// ЭКСПОРТ ВСЕХ ПРИМЕРОВ
// ===========================================================================

module.exports = {
  // DATE
  getMatchesToday,
  getMatchesTomorrow,
  getMatchesYesterday,
  getMatchesByDate,
  getMatchesByDateRange,
  getMatchesLastNDays,
  getMatchesNextNDays,
  getMatchesWithTimeAndTimezone,
  
  // TEAM
  getTeamMatches,
  getTeamMatchesByPeriod,
  getHomeMatches,
  getAwayMatches,
  getHeadToHead,
  getMultipleTeamsMatches,
  
  // LEAGUE
  getLeagueMatches,
  getLeagueMatchesBySeason,
  getLeagueMatchesBySeasonUid,
  getMultipleLeaguesMatches,
  
  // STATUS
  getLiveMatches,
  getUpcomingMatches,
  getEndedMatches,
  getMatchesByStatus,
  getTodayLiveMatches,
  getTodayUpcomingMatches,
  
  // COMBINED
  getTeamLiveMatches,
  getTeamUpcomingMatches,
  getTeamEndedMatches,
  getLeagueLiveMatches,
  getLeagueTodayUpcomingMatches,
  getTeamLeagueMatches,
  
  // ADVANCED
  getMatchesWithOdds,
  getMatchesWithPagination,
  getMatchesOrderedAsc,
  getMatchesOrderedDesc,
  getMatchesByIds,
  getMatchesByFlashIds,
  
  // POPULAR
  getTopMatchesToday,
  getWeekendMatches,
  getTopLeaguesWeekendMatches,
  getTodayEveningMatches,
  getChampionsLeagueMatches,
  
  // SPECIAL
  getDerbyMatches,
  getTop6Matches,
  getRecentMatches,
  getMatchesStartingSoon,
  getLiveMatchesWithOdds,
  
  // PAGINATION
  getMatchesPage1,
  getMatchesPage2,
  getMatchesPage3,
  
  // ANALYTICS
  getTeamSeasonAnalytics,
  getHomeAwayAnalytics,
  getTeamFormAnalytics,
  getLeagueStatsAnalytics,
  getTotalsAnalytics,
  
  // Группировка по категориям
  categories: {
    DATE: [
      'getMatchesToday',
      'getMatchesTomorrow',
      'getMatchesYesterday',
      'getMatchesByDate',
      'getMatchesByDateRange',
      'getMatchesLastNDays',
      'getMatchesNextNDays',
      'getMatchesWithTimeAndTimezone'
    ],
    TEAM: [
      'getTeamMatches',
      'getTeamMatchesByPeriod',
      'getHomeMatches',
      'getAwayMatches',
      'getHeadToHead',
      'getMultipleTeamsMatches'
    ],
    LEAGUE: [
      'getLeagueMatches',
      'getLeagueMatchesBySeason',
      'getLeagueMatchesBySeasonUid',
      'getMultipleLeaguesMatches'
    ],
    STATUS: [
      'getLiveMatches',
      'getUpcomingMatches',
      'getEndedMatches',
      'getMatchesByStatus',
      'getTodayLiveMatches',
      'getTodayUpcomingMatches'
    ],
    COMBINED: [
      'getTeamLiveMatches',
      'getTeamUpcomingMatches',
      'getTeamEndedMatches',
      'getLeagueLiveMatches',
      'getLeagueTodayUpcomingMatches',
      'getTeamLeagueMatches'
    ],
    ADVANCED: [
      'getMatchesWithOdds',
      'getMatchesWithPagination',
      'getMatchesOrderedAsc',
      'getMatchesOrderedDesc',
      'getMatchesByIds',
      'getMatchesByFlashIds'
    ],
    POPULAR: [
      'getTopMatchesToday',
      'getWeekendMatches',
      'getTopLeaguesWeekendMatches',
      'getTodayEveningMatches',
      'getChampionsLeagueMatches'
    ],
    SPECIAL: [
      'getDerbyMatches',
      'getTop6Matches',
      'getRecentMatches',
      'getMatchesStartingSoon',
      'getLiveMatchesWithOdds'
    ],
    PAGINATION: [
      'getMatchesPage1',
      'getMatchesPage2',
      'getMatchesPage3'
    ],
    ANALYTICS: [
      'getTeamSeasonAnalytics',
      'getHomeAwayAnalytics',
      'getTeamFormAnalytics',
      'getLeagueStatsAnalytics',
      'getTotalsAnalytics'
    ]
  }
};
