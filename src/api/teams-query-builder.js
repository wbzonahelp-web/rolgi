/**
 * Teams Query Builder
 * 
 * Fluent API для динамического построения запросов к Teams API
 * Поддерживает все параметры фильтрации, валидацию и генерацию URL
 * 
 * @module teams-query-builder
 */

/**
 * Teams Query Builder Class
 * 
 * @example
 * const query = new TeamsQueryBuilder()
 *   .searchByName('Arsenal')
 *   .inCountry('England')
 *   .limit(10)
 *   .build();
 */
class TeamsQueryBuilder {
  constructor() {
    this.params = {};
  }

  // ============================================================================
  // SEARCH FILTERS
  // ============================================================================

  /**
   * Поиск команды по названию
   * @param {string} name - Название команды (2-100 символов)
   * @returns {TeamsQueryBuilder}
   */
  searchByName(name) {
    if (name && name.length >= 2 && name.length <= 100) {
      this.params.name = name;
    }
    return this;
  }

  /**
   * Алиас для searchByName
   * @param {string} name - Название команды
   * @returns {TeamsQueryBuilder}
   */
  withName(name) {
    return this.searchByName(name);
  }

  /**
   * Поиск команды по ключевому слову
   * @param {string} keyword - Ключевое слово
   * @returns {TeamsQueryBuilder}
   */
  containing(keyword) {
    return this.searchByName(keyword);
  }

  // ============================================================================
  // COUNTRY FILTERS
  // ============================================================================

  /**
   * Фильтр по стране
   * @param {string} country - Код или название страны (до 50 символов)
   * @returns {TeamsQueryBuilder}
   */
  inCountry(country) {
    if (country && country.length <= 50) {
      this.params.country = country;
    }
    return this;
  }

  /**
   * Алиас для inCountry
   * @param {string} country - Страна
   * @returns {TeamsQueryBuilder}
   */
  fromCountry(country) {
    return this.inCountry(country);
  }

  /**
   * Английские команды
   * @returns {TeamsQueryBuilder}
   */
  inEngland() {
    return this.inCountry('England');
  }

  /**
   * Испанские команды
   * @returns {TeamsQueryBuilder}
   */
  inSpain() {
    return this.inCountry('Spain');
  }

  /**
   * Итальянские команды
   * @returns {TeamsQueryBuilder}
   */
  inItaly() {
    return this.inCountry('Italy');
  }

  /**
   * Немецкие команды
   * @returns {TeamsQueryBuilder}
   */
  inGermany() {
    return this.inCountry('Germany');
  }

  /**
   * Французские команды
   * @returns {TeamsQueryBuilder}
   */
  inFrance() {
    return this.inCountry('France');
  }

  /**
   * Португальские команды
   * @returns {TeamsQueryBuilder}
   */
  inPortugal() {
    return this.inCountry('Portugal');
  }

  /**
   * Нидерландские команды
   * @returns {TeamsQueryBuilder}
   */
  inNetherlands() {
    return this.inCountry('Netherlands');
  }

  /**
   * Бразильские команды
   * @returns {TeamsQueryBuilder}
   */
  inBrazil() {
    return this.inCountry('Brazil');
  }

  /**
   * Аргентинские команды
   * @returns {TeamsQueryBuilder}
   */
  inArgentina() {
    return this.inCountry('Argentina');
  }

  // ============================================================================
  // PAGINATION
  // ============================================================================

  /**
   * Установить лимит результатов
   * @param {number} limit - Максимальное количество (1-1000)
   * @returns {TeamsQueryBuilder}
   */
  limit(limit) {
    const numLimit = parseInt(limit);
    if (numLimit >= 1 && numLimit <= 1000) {
      this.params.limit = numLimit;
    }
    return this;
  }

  /**
   * Установить смещение (offset)
   * @param {number} offset - Количество записей для пропуска (≥ 0)
   * @returns {TeamsQueryBuilder}
   */
  offset(offset) {
    const numOffset = parseInt(offset);
    if (numOffset >= 0) {
      this.params.offset = numOffset;
    }
    return this;
  }

  /**
   * Установить номер страницы
   * @param {number} page - Номер страницы (начиная с 1)
   * @param {number} pageSize - Размер страницы (default: 20)
   * @returns {TeamsQueryBuilder}
   */
  page(page, pageSize = 20) {
    const numPage = parseInt(page);
    const numPageSize = parseInt(pageSize);
    
    if (numPage >= 1 && numPageSize >= 1 && numPageSize <= 1000) {
      this.params.offset = (numPage - 1) * numPageSize;
      this.params.limit = numPageSize;
    }
    return this;
  }

  /**
   * Первая страница результатов
   * @param {number} pageSize - Размер страницы (default: 20)
   * @returns {TeamsQueryBuilder}
   */
  firstPage(pageSize = 20) {
    return this.page(1, pageSize);
  }

  // ============================================================================
  // SHORTCUTS
  // ============================================================================

  /**
   * Топ 10 команд
   * @returns {TeamsQueryBuilder}
   */
  top10() {
    return this.limit(10);
  }

  /**
   * Топ 20 команд
   * @returns {TeamsQueryBuilder}
   */
  top20() {
    return this.limit(20);
  }

  /**
   * Топ 50 команд
   * @returns {TeamsQueryBuilder}
   */
  top50() {
    return this.limit(50);
  }

  /**
   * Все команды (максимум 1000)
   * @returns {TeamsQueryBuilder}
   */
  all() {
    return this.limit(1000);
  }

  // ============================================================================
  // POPULAR SEARCHES
  // ============================================================================

  /**
   * Найти команды Arsenal
   * @returns {TeamsQueryBuilder}
   */
  findArsenal() {
    return this.searchByName('Arsenal').limit(10);
  }

  /**
   * Найти команды Manchester
   * @returns {TeamsQueryBuilder}
   */
  findManchester() {
    return this.searchByName('Manchester').limit(10);
  }

  /**
   * Найти команды Chelsea
   * @returns {TeamsQueryBuilder}
   */
  findChelsea() {
    return this.searchByName('Chelsea').limit(10);
  }

  /**
   * Найти команды Liverpool
   * @returns {TeamsQueryBuilder}
   */
  findLiverpool() {
    return this.searchByName('Liverpool').limit(10);
  }

  /**
   * Найти команды Real Madrid
   * @returns {TeamsQueryBuilder}
   */
  findRealMadrid() {
    return this.searchByName('Real Madrid').limit(10);
  }

  /**
   * Найти команды Barcelona
   * @returns {TeamsQueryBuilder}
   */
  findBarcelona() {
    return this.searchByName('Barcelona').limit(10);
  }

  /**
   * Найти команды Bayern
   * @returns {TeamsQueryBuilder}
   */
  findBayern() {
    return this.searchByName('Bayern').limit(10);
  }

  // ============================================================================
  // LEAGUE SHORTCUTS
  // ============================================================================

  /**
   * Команды Премьер Лиги (примерно)
   * @returns {TeamsQueryBuilder}
   */
  premierLeague() {
    return this.inEngland().limit(20);
  }

  /**
   * Команды Ла Лиги (примерно)
   * @returns {TeamsQueryBuilder}
   */
  laLiga() {
    return this.inSpain().limit(20);
  }

  /**
   * Команды Бундеслиги (примерно)
   * @returns {TeamsQueryBuilder}
   */
  bundesliga() {
    return this.inGermany().limit(18);
  }

  /**
   * Команды Серии А (примерно)
   * @returns {TeamsQueryBuilder}
   */
  serieA() {
    return this.inItaly().limit(20);
  }

  /**
   * Команды Лиги 1 (примерно)
   * @returns {TeamsQueryBuilder}
   */
  ligue1() {
    return this.inFrance().limit(20);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Построить объект запроса
   * @returns {Object} Параметры запроса
   */
  build() {
    return { ...this.params };
  }

  /**
   * Получить параметры как объект
   * @returns {Object} Параметры
   */
  toParams() {
    return this.build();
  }

  /**
   * Преобразовать в URL query string
   * @returns {string} URL query string (например: ?name=Arsenal&limit=10)
   */
  toUrl() {
    const params = new URLSearchParams();
    
    Object.entries(this.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Преобразовать в строку
   * @returns {string} URL query string
   */
  toString() {
    return this.toUrl();
  }

  /**
   * Клонировать builder
   * @returns {TeamsQueryBuilder} Новый экземпляр с теми же параметрами
   */
  clone() {
    const newBuilder = new TeamsQueryBuilder();
    newBuilder.params = { ...this.params };
    return newBuilder;
  }

  /**
   * Сбросить все параметры
   * @returns {TeamsQueryBuilder}
   */
  reset() {
    this.params = {};
    return this;
  }

  /**
   * Валидация параметров
   * @returns {Object} Результат валидации { valid: boolean, errors: Array }
   */
  validate() {
    const errors = [];

    // Validate name
    if (this.params.name !== undefined) {
      if (typeof this.params.name !== 'string') {
        errors.push('name must be a string');
      } else if (this.params.name.length < 2 || this.params.name.length > 100) {
        errors.push('name must be between 2 and 100 characters');
      }
    }

    // Validate country
    if (this.params.country !== undefined) {
      if (typeof this.params.country !== 'string') {
        errors.push('country must be a string');
      } else if (this.params.country.length > 50) {
        errors.push('country must be 50 characters or less');
      }
    }

    // Validate limit
    if (this.params.limit !== undefined) {
      const limit = parseInt(this.params.limit);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        errors.push('limit must be between 1 and 1000');
      }
    }

    // Validate offset
    if (this.params.offset !== undefined) {
      const offset = parseInt(this.params.offset);
      if (isNaN(offset) || offset < 0) {
        errors.push('offset must be 0 or greater');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Предпросмотр запроса
   * @returns {Object} Информация о запросе
   */
  preview() {
    const validation = this.validate();
    
    return {
      params: this.params,
      url: this.toUrl(),
      paramCount: Object.keys(this.params).length,
      validation
    };
  }

  /**
   * Проверить, пустой ли builder
   * @returns {boolean}
   */
  isEmpty() {
    return Object.keys(this.params).length === 0;
  }

  /**
   * Получить количество параметров
   * @returns {number}
   */
  getParamCount() {
    return Object.keys(this.params).length;
  }
}

module.exports = TeamsQueryBuilder;
