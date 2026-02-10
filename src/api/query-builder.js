/**
 * Dynamic Query Builder for Flashscore API
 * Система динамического построения запросов
 * 
 * @module query-builder
 */

/**
 * Класс для построения динамических запросов к Flashscore API
 */
class FlashscoreQueryBuilder {
  constructor() {
    this.filters = {};
  }

  /**
   * Сбросить все фильтры
   */
  reset() {
    this.filters = {};
    return this;
  }

  // ============================================================
  // DATE FILTERS
  // ============================================================

  /**
   * Установить конкретную дату
   */
  date(date) {
    this.filters.Date = date;
    delete this.filters.From;
    delete this.filters.To;
    return this;
  }

  /**
   * Установить диапазон дат
   */
  dateRange(from, to) {
    this.filters.From = from;
    this.filters.To = to;
    delete this.filters.Date;
    return this;
  }

  /**
   * Установить начальную дату
   */
  from(date) {
    this.filters.From = date;
    delete this.filters.Date;
    return this;
  }

  /**
   * Установить конечную дату
   */
  to(date) {
    this.filters.To = date;
    delete this.filters.Date;
    return this;
  }

  /**
   * Установить часовой пояс
   */
  timezone(tz) {
    this.filters.TimeZone = tz;
    return this;
  }

  /**
   * Матчи сегодня
   */
  today() {
    this.filters.Date = new Date().toISOString().split('T')[0];
    delete this.filters.From;
    delete this.filters.To;
    return this;
  }

  /**
   * Матчи завтра
   */
  tomorrow() {
    const tomorrow = new Date(Date.now() + 86400000);
    this.filters.Date = tomorrow.toISOString().split('T')[0];
    delete this.filters.From;
    delete this.filters.To;
    return this;
  }

  /**
   * Матчи за последние N дней
   */
  lastDays(days) {
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    this.filters.From = from.toISOString().split('T')[0];
    this.filters.To = to.toISOString().split('T')[0];
    delete this.filters.Date;
    return this;
  }

  /**
   * Матчи за следующие N дней
   */
  nextDays(days) {
    const from = new Date();
    const to = new Date(Date.now() + days * 86400000);
    this.filters.From = from.toISOString().split('T')[0];
    this.filters.To = to.toISOString().split('T')[0];
    delete this.filters.Date;
    return this;
  }

  // ============================================================
  // TEAM FILTERS
  // ============================================================

  /**
   * Фильтр по команде (хозяева или гости)
   */
  team(teamId) {
    this.filters.Team = teamId;
    delete this.filters.HomeTeam;
    delete this.filters.AwayTeam;
    delete this.filters.BothTeams;
    return this;
  }

  /**
   * Фильтр по команде хозяев
   */
  homeTeam(teamId) {
    this.filters.HomeTeam = teamId;
    delete this.filters.Team;
    delete this.filters.BothTeams;
    return this;
  }

  /**
   * Фильтр по команде гостей
   */
  awayTeam(teamId) {
    this.filters.AwayTeam = teamId;
    delete this.filters.Team;
    delete this.filters.BothTeams;
    return this;
  }

  /**
   * История встреч между двумя командами
   */
  h2h(team1, team2) {
    this.filters.BothTeams = `${team1},${team2}`;
    delete this.filters.Team;
    delete this.filters.HomeTeam;
    delete this.filters.AwayTeam;
    return this;
  }

  /**
   * Несколько команд (через запятую)
   */
  teams(teamIds) {
    if (Array.isArray(teamIds)) {
      this.filters.Team = teamIds.join(',');
    } else {
      this.filters.Team = teamIds;
    }
    return this;
  }

  // ============================================================
  // LEAGUE FILTERS
  // ============================================================

  /**
   * Фильтр по лиге
   */
  league(leagueId) {
    this.filters.LeagueId = leagueId;
    return this;
  }

  /**
   * Фильтр по сезону
   */
  season(seasonId) {
    this.filters.SeasonId = seasonId;
    return this;
  }

  /**
   * Фильтр по годам сезона
   */
  years(years) {
    this.filters.Years = years;
    return this;
  }

  /**
   * Фильтр по ID матчей
   */
  gameIds(ids) {
    if (Array.isArray(ids)) {
      this.filters.Id = ids.join(',');
    } else {
      this.filters.Id = ids;
    }
    return this;
  }

  // ============================================================
  // STATUS FILTERS
  // ============================================================

  /**
   * Фильтр по статусу матча
   */
  status(statusCode) {
    this.filters.Status = statusCode;
    delete this.filters.Live;
    delete this.filters.Ended;
    delete this.filters.Upcoming;
    return this;
  }

  /**
   * Только live матчи
   */
  live() {
    this.filters.Live = true;
    delete this.filters.Ended;
    delete this.filters.Upcoming;
    delete this.filters.Status;
    return this;
  }

  /**
   * Только завершённые матчи
   */
  ended() {
    this.filters.Ended = true;
    delete this.filters.Live;
    delete this.filters.Upcoming;
    delete this.filters.Status;
    return this;
  }

  /**
   * Только предстоящие матчи
   */
  upcoming() {
    this.filters.Upcoming = true;
    delete this.filters.Live;
    delete this.filters.Ended;
    delete this.filters.Status;
    return this;
  }

  // ============================================================
  // PAGINATION & SORTING
  // ============================================================

  /**
   * Установить лимит результатов
   */
  limit(count) {
    this.filters.Limit = Math.min(Math.max(count, 1), 1000);
    return this;
  }

  /**
   * Установить offset (пропустить N матчей)
   */
  offset(count) {
    this.filters.Offset = Math.max(count, 0);
    return this;
  }

  /**
   * Пагинация (page начинается с 1)
   */
  page(pageNumber, pageSize = 100) {
    this.filters.Limit = pageSize;
    this.filters.Offset = (pageNumber - 1) * pageSize;
    return this;
  }

  /**
   * Сортировка по дате (по убыванию - новые первыми)
   */
  sortDesc() {
    this.filters.Order = -1;
    return this;
  }

  /**
   * Сортировка по дате (по возрастанию - старые первыми)
   */
  sortAsc() {
    this.filters.Order = 1;
    return this;
  }

  /**
   * Установить порядок сортировки
   */
  order(direction) {
    this.filters.Order = direction === 'asc' || direction === 1 ? 1 : -1;
    return this;
  }

  // ============================================================
  // SHORTCUTS (Быстрые методы)
  // ============================================================

  /**
   * Live матчи конкретной команды
   */
  teamLive(teamId) {
    return this.team(teamId).live();
  }

  /**
   * Предстоящие матчи команды
   */
  teamUpcoming(teamId, limit = 10) {
    return this.team(teamId).upcoming().limit(limit).sortAsc();
  }

  /**
   * Последние матчи команды
   */
  teamRecent(teamId, limit = 10) {
    return this.team(teamId).ended().limit(limit).sortDesc();
  }

  /**
   * Домашние матчи команды (последние)
   */
  teamHome(teamId, limit = 50) {
    return this.homeTeam(teamId).ended().limit(limit).sortDesc();
  }

  /**
   * Выездные матчи команды (последние)
   */
  teamAway(teamId, limit = 50) {
    return this.awayTeam(teamId).ended().limit(limit).sortDesc();
  }

  /**
   * Матчи лиги сегодня
   */
  leagueToday(leagueId) {
    return this.league(leagueId).today().timezone(3);
  }

  /**
   * Live матчи лиги
   */
  leagueLive(leagueId) {
    return this.league(leagueId).live();
  }

  /**
   * Предстоящие матчи лиги
   */
  leagueUpcoming(leagueId, limit = 50) {
    return this.league(leagueId).upcoming().limit(limit).sortAsc();
  }

  // ============================================================
  // BUILD & EXECUTE
  // ============================================================

  /**
   * Построить объект фильтров
   */
  build() {
    return { ...this.filters };
  }

  /**
   * Получить query string
   */
  toQueryString() {
    return Object.entries(this.filters)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Получить полный URL
   */
  toUrl(baseUrl = 'https://api.sstats.net') {
    const queryString = this.toQueryString();
    return queryString ? `${baseUrl}/Ls/List?${queryString}` : `${baseUrl}/Ls/List`;
  }

  /**
   * Клонировать builder
   */
  clone() {
    const newBuilder = new FlashscoreQueryBuilder();
    newBuilder.filters = { ...this.filters };
    return newBuilder;
  }

  /**
   * Получить JSON представление
   */
  toJSON() {
    return {
      filters: this.filters,
      url: this.toUrl(),
      queryString: this.toQueryString()
    };
  }
}

/**
 * Фабричная функция для создания builder
 */
function createQueryBuilder() {
  return new FlashscoreQueryBuilder();
}

/**
 * Предустановленные builders для частых сценариев
 */
const presets = {
  /**
   * Матчи сегодня
   */
  today: () => createQueryBuilder().today().timezone(3),

  /**
   * Матчи завтра
   */
  tomorrow: () => createQueryBuilder().tomorrow().timezone(3),

  /**
   * Live матчи
   */
  live: () => createQueryBuilder().live().limit(100),

  /**
   * Предстоящие матчи
   */
  upcoming: () => createQueryBuilder().upcoming().limit(100).sortAsc(),

  /**
   * Завершённые матчи
   */
  ended: () => createQueryBuilder().ended().limit(100).sortDesc(),

  /**
   * Матчи команды
   */
  team: (teamId) => createQueryBuilder().team(teamId).limit(100).sortDesc(),

  /**
   * История встреч
   */
  h2h: (team1, team2) => createQueryBuilder().h2h(team1, team2).sortDesc(),

  /**
   * Матчи лиги
   */
  league: (leagueId) => createQueryBuilder().league(leagueId).limit(1000).sortDesc(),

  /**
   * Матчи лиги сегодня
   */
  leagueToday: (leagueId) => createQueryBuilder().league(leagueId).today().timezone(3),

  /**
   * Матчи за неделю
   */
  week: () => createQueryBuilder().lastDays(7).timezone(3).limit(500),

  /**
   * Матчи за месяц
   */
  month: () => createQueryBuilder().lastDays(30).timezone(3).limit(1000)
};

module.exports = {
  FlashscoreQueryBuilder,
  createQueryBuilder,
  presets
};
