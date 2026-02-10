/**
 * Games Query Builder
 * Fluent API для построения запросов к Games API (GET /games/list)
 * 
 * @module games-query-builder
 * @version 2.0.0
 * @author AI Assistant
 * @date 2026-01-31
 */

/**
 * @typedef {Object} QueryParams
 * @property {string} [Id] - Список ID матчей через запятую
 * @property {string} [FlashId] - Список FlashId через запятую
 * @property {number} [LeagueId] - ID лиги
 * @property {string} [SeasonUid] - GUID сезона
 * @property {number} [Year] - Год
 * @property {string} [From] - Дата начала (DateTimeOffset)
 * @property {string} [To] - Дата окончания (DateTimeOffset)
 * @property {number} [HomeTeam] - ID домашней команды
 * @property {number} [AwayTeam] - ID выездной команды
 * @property {number} [Team] - ID команды (домашняя или выездная)
 * @property {string} [BothTeams] - Список ID обеих команд через запятую
 * @property {number} [Status] - Статус матча (byte)
 * @property {boolean} [Ended] - Завершенные матчи
 * @property {boolean} [Live] - Живые матчи
 * @property {boolean} [Upcoming] - Предстоящие матчи
 * @property {number} [Offset] - Смещение для пагинации
 * @property {number} [Limit] - Количество записей (1-1000)
 * @property {number} [Order] - Порядок сортировки (-1 desc, 1 asc)
 * @property {boolean} [IncludeOdds] - Включить коэффициенты
 */

class GamesQueryBuilder {
  constructor() {
    this.params = {};
  }

  // ===========================================================================
  // DATE FILTERS (Фильтры по дате)
  // ===========================================================================

  /**
   * Установить дату начала
   * @param {string|Date} date - Дата в формате YYYY-MM-DD или объект Date
   * @returns {GamesQueryBuilder}
   */
  fromDate(date) {
    if (date instanceof Date) {
      this.params.From = date.toISOString();
    } else {
      this.params.From = date;
    }
    return this;
  }

  /**
   * Установить дату окончания
   * @param {string|Date} date - Дата в формате YYYY-MM-DD или объект Date
   * @returns {GamesQueryBuilder}
   */
  toDate(date) {
    if (date instanceof Date) {
      this.params.To = date.toISOString();
    } else {
      this.params.To = date;
    }
    return this;
  }

  /**
   * Установить конкретную дату
   * @param {string|Date} date - Дата в формате YYYY-MM-DD или объект Date
   * @returns {GamesQueryBuilder}
   */
  forDate(date) {
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
    this.params.From = dateStr;
    const nextDay = new Date(dateStr);
    nextDay.setDate(nextDay.getDate() + 1);
    this.params.To = nextDay.toISOString().split('T')[0];
    return this;
  }

  /**
   * Получить матчи на сегодня
   * @returns {GamesQueryBuilder}
   */
  forToday() {
    const today = new Date().toISOString().split('T')[0];
    return this.forDate(today);
  }

  /**
   * Получить матчи на завтра
   * @returns {GamesQueryBuilder}
   */
  forTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.forDate(tomorrow);
  }

  /**
   * Получить матчи на вчера
   * @returns {GamesQueryBuilder}
   */
  forYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.forDate(yesterday);
  }

  /**
   * Получить матчи за последние N дней
   * @param {number} days - Количество дней
   * @returns {GamesQueryBuilder}
   */
  lastDays(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    this.params.From = start.toISOString().split('T')[0];
    this.params.To = end.toISOString().split('T')[0];
    return this;
  }

  /**
   * Получить матчи за следующие N дней
   * @param {number} days - Количество дней
   * @returns {GamesQueryBuilder}
   */
  nextDays(days) {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + days);
    this.params.From = start.toISOString().split('T')[0];
    this.params.To = end.toISOString().split('T')[0];
    return this;
  }

  // ===========================================================================
  // TEAM FILTERS (Фильтры по командам)
  // ===========================================================================

  /**
   * Фильтр по команде (домашняя или выездная)
   * @param {number} teamId - ID команды
   * @returns {GamesQueryBuilder}
   */
  forTeam(teamId) {
    this.params.Team = teamId;
    return this;
  }

  /**
   * Фильтр по нескольким командам
   * @param {number[]} teamIds - Массив ID команд
   * @returns {GamesQueryBuilder}
   */
  forTeams(teamIds) {
    this.params.Team = teamIds.join(',');
    return this;
  }

  /**
   * Фильтр по домашней команде
   * @param {number} teamId - ID домашней команды
   * @returns {GamesQueryBuilder}
   */
  forHomeTeam(teamId) {
    this.params.HomeTeam = teamId;
    return this;
  }

  /**
   * Фильтр по выездной команде
   * @param {number} teamId - ID выездной команды
   * @returns {GamesQueryBuilder}
   */
  forAwayTeam(teamId) {
    this.params.AwayTeam = teamId;
    return this;
  }

  /**
   * Фильтр по обеим командам (Head to Head)
   * @param {number[]} teamIds - Массив из двух ID команд
   * @returns {GamesQueryBuilder}
   */
  bothTeams(teamIds) {
    if (teamIds.length !== 2) {
      throw new Error('BothTeams requires exactly 2 team IDs');
    }
    this.params.BothTeams = teamIds.join(',');
    return this;
  }

  // ===========================================================================
  // LEAGUE FILTERS (Фильтры по лигам)
  // ===========================================================================

  /**
   * Фильтр по лиге
   * @param {number} leagueId - ID лиги
   * @returns {GamesQueryBuilder}
   */
  forLeague(leagueId) {
    this.params.LeagueId = leagueId;
    return this;
  }

  /**
   * Фильтр по нескольким лигам
   * @param {number[]} leagueIds - Массив ID лиг
   * @returns {GamesQueryBuilder}
   */
  forLeagues(leagueIds) {
    this.params.LeagueId = leagueIds.join(',');
    return this;
  }

  /**
   * Фильтр по сезону (GUID)
   * @param {string} seasonUid - GUID сезона
   * @returns {GamesQueryBuilder}
   */
  forSeasonUid(seasonUid) {
    this.params.SeasonUid = seasonUid;
    return this;
  }

  /**
   * Фильтр по году
   * @param {number} year - Год
   * @returns {GamesQueryBuilder}
   */
  forYear(year) {
    this.params.Year = year;
    return this;
  }

  // ===========================================================================
  // STATUS FILTERS (Фильтры по статусу)
  // ===========================================================================

  /**
   * Фильтр по статусу матча
   * @param {number} status - Код статуса (byte)
   * @returns {GamesQueryBuilder}
   */
  forStatus(status) {
    this.params.Status = status;
    return this;
  }

  /**
   * Только завершенные матчи
   * @returns {GamesQueryBuilder}
   */
  endedOnly() {
    this.params.Ended = true;
    return this;
  }

  /**
   * Только живые матчи
   * @returns {GamesQueryBuilder}
   */
  liveOnly() {
    this.params.Live = true;
    return this;
  }

  /**
   * Только предстоящие матчи
   * @returns {GamesQueryBuilder}
   */
  upcomingOnly() {
    this.params.Upcoming = true;
    return this;
  }

  // ===========================================================================
  // ID FILTERS (Фильтры по ID)
  // ===========================================================================

  /**
   * Фильтр по ID матчей
   * @param {string[]} ids - Массив ID матчей
   * @returns {GamesQueryBuilder}
   */
  forIds(ids) {
    this.params.Id = ids.join(',');
    return this;
  }

  /**
   * Фильтр по FlashId
   * @param {string[]} flashIds - Массив FlashId
   * @returns {GamesQueryBuilder}
   */
  forFlashIds(flashIds) {
    this.params.FlashId = flashIds.join(',');
    return this;
  }

  // ===========================================================================
  // PAGINATION (Пагинация)
  // ===========================================================================

  /**
   * Установить смещение
   * @param {number} offset - Смещение
   * @returns {GamesQueryBuilder}
   */
  offset(offset) {
    this.params.Offset = offset;
    return this;
  }

  /**
   * Установить лимит записей
   * @param {number} limit - Лимит (1-1000)
   * @returns {GamesQueryBuilder}
   */
  limit(limit) {
    if (limit < 1 || limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
    this.params.Limit = limit;
    return this;
  }

  /**
   * Установить номер страницы
   * @param {number} page - Номер страницы (начиная с 1)
   * @param {number} pageSize - Размер страницы
   * @returns {GamesQueryBuilder}
   */
  page(page, pageSize = 50) {
    this.params.Offset = (page - 1) * pageSize;
    this.params.Limit = pageSize;
    return this;
  }

  // ===========================================================================
  // SORTING (Сортировка)
  // ===========================================================================

  /**
   * Сортировка по дате по возрастанию
   * @returns {GamesQueryBuilder}
   */
  orderByDateAsc() {
    this.params.Order = 1;
    return this;
  }

  /**
   * Сортировка по дате по убыванию
   * @returns {GamesQueryBuilder}
   */
  orderByDateDesc() {
    this.params.Order = -1;
    return this;
  }

  // ===========================================================================
  // ADDITIONAL OPTIONS (Дополнительные опции)
  // ===========================================================================

  /**
   * Включить коэффициенты в ответ
   * @returns {GamesQueryBuilder}
   */
  includeOdds() {
    this.params.IncludeOdds = true;
    return this;
  }

  // ===========================================================================
  // UTILITY METHODS (Вспомогательные методы)
  // ===========================================================================

  /**
   * Сбросить все параметры
   * @returns {GamesQueryBuilder}
   */
  reset() {
    this.params = {};
    return this;
  }

  /**
   * Получить параметры запроса
   * @returns {QueryParams}
   */
  getParams() {
    return { ...this.params };
  }

  /**
   * Построить URL query string
   * @returns {string}
   */
  toQueryString() {
    const params = new URLSearchParams();
    Object.entries(this.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
    return params.toString();
  }

  /**
   * Построить полный URL
   * @param {string} baseUrl - Базовый URL (по умолчанию '/games/list')
   * @returns {string}
   */
  toUrl(baseUrl = '/games/list') {
    const queryString = this.toQueryString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  /**
   * Валидация параметров
   * @returns {Object} Результат валидации { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Проверка: должен быть хотя бы один фильтр
    if (Object.keys(this.params).length === 0) {
      errors.push('At least one filter parameter is required');
    }

    // Проверка лимита
    if (this.params.Limit !== undefined) {
      if (this.params.Limit < 1 || this.params.Limit > 1000) {
        errors.push('Limit must be between 1 and 1000');
      }
    }

    // Проверка offset
    if (this.params.Offset !== undefined && this.params.Offset < 0) {
      errors.push('Offset must be >= 0');
    }

    // Проверка Order
    if (this.params.Order !== undefined) {
      if (this.params.Order !== -1 && this.params.Order !== 1) {
        errors.push('Order must be -1 (desc) or 1 (asc)');
      }
    }

    // Проверка дат
    if (this.params.From && this.params.To) {
      const from = new Date(this.params.From);
      const to = new Date(this.params.To);
      if (from >= to) {
        errors.push('From date must be before To date');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Построить и вернуть объект запроса
   * @returns {Object} { params, url, queryString, isValid, errors }
   */
  build() {
    const validation = this.validate();
    return {
      params: this.getParams(),
      url: this.toUrl(),
      queryString: this.toQueryString(),
      isValid: validation.valid,
      errors: validation.errors
    };
  }

  /**
   * Клонировать builder
   * @returns {GamesQueryBuilder}
   */
  clone() {
    const newBuilder = new GamesQueryBuilder();
    newBuilder.params = { ...this.params };
    return newBuilder;
  }

  /**
   * Объединить с другим builder
   * @param {GamesQueryBuilder} otherBuilder - Другой builder
   * @returns {GamesQueryBuilder}
   */
  merge(otherBuilder) {
    this.params = { ...this.params, ...otherBuilder.params };
    return this;
  }

  // ===========================================================================
  // PRESETS (Предустановленные запросы)
  // ===========================================================================

  /**
   * Preset: Топ матчи сегодня (топ-5 европейских лиг)
   * @returns {GamesQueryBuilder}
   */
  presetTopMatchesToday() {
    return this.reset()
      .forToday()
      .forLeagues([39, 140, 61, 78, 135]) // EPL, La Liga, Ligue 1, Bundesliga, Serie A
      .limit(100);
  }

  /**
   * Preset: Живые матчи с коэффициентами
   * @returns {GamesQueryBuilder}
   */
  presetLiveWithOdds() {
    return this.reset()
      .liveOnly()
      .includeOdds()
      .limit(50);
  }

  /**
   * Preset: Предстоящие матчи на сегодня
   * @returns {GamesQueryBuilder}
   */
  presetUpcomingToday() {
    return this.reset()
      .forToday()
      .upcomingOnly()
      .limit(100);
  }

  /**
   * Preset: Завершенные матчи за последнюю неделю
   * @returns {GamesQueryBuilder}
   */
  presetLastWeekEnded() {
    return this.reset()
      .lastDays(7)
      .endedOnly()
      .orderByDateDesc()
      .limit(200);
  }

  /**
   * Preset: Матчи Лиги Чемпионов текущего сезона
   * @returns {GamesQueryBuilder}
   */
  presetChampionsLeague() {
    return this.reset()
      .forLeague(2) // UEFA Champions League
      .forYear(new Date().getFullYear())
      .limit(200);
  }
}

// ===========================================================================
// ЭКСПОРТ
// ===========================================================================

module.exports = GamesQueryBuilder;

// Экспорт helper функций
module.exports.createBuilder = () => new GamesQueryBuilder();

// Экспорт констант
module.exports.CONSTANTS = {
  MAX_LIMIT: 1000,
  MIN_LIMIT: 1,
  DEFAULT_LIMIT: 100,
  ORDER: {
    ASC: 1,
    DESC: -1
  },
  TOP_LEAGUES: {
    EPL: 39,
    LA_LIGA: 140,
    LIGUE_1: 61,
    BUNDESLIGA: 78,
    SERIE_A: 135,
    CHAMPIONS_LEAGUE: 2
  }
};
