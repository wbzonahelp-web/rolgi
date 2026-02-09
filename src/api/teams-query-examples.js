/**
 * Teams API Query Examples
 * 
 * Готовые примеры запросов для работы с Teams API
 * Включает различные сценарии поиска и фильтрации команд
 * 
 * @module teams-query-examples
 */

/**
 * КАТЕГОРИЯ: BASIC - Базовые запросы
 */

/**
 * Получить первые 10 команд
 * @returns {Object} Query parameters
 */
function getFirstTeams() {
  return {
    limit: 10
  };
}

/**
 * Получить команды с пагинацией
 * @param {number} page - Номер страницы (начиная с 1)
 * @param {number} pageSize - Размер страницы
 * @returns {Object} Query parameters
 */
function getTeamsPage(page = 1, pageSize = 20) {
  return {
    offset: (page - 1) * pageSize,
    limit: pageSize
  };
}

/**
 * Получить все команды (максимум 1000)
 * @returns {Object} Query parameters
 */
function getAllTeams() {
  return {
    limit: 1000
  };
}

/**
 * КАТЕГОРИЯ: SEARCH - Поиск команд
 */

/**
 * Поиск команд по названию
 * @param {string} name - Название команды
 * @param {number} limit - Максимальное количество результатов
 * @returns {Object} Query parameters
 */
function searchTeamByName(name, limit = 20) {
  return {
    name,
    limit
  };
}

/**
 * Поиск команд Arsenal
 * @returns {Object} Query parameters
 */
function findArsenal() {
  return {
    name: 'Arsenal',
    limit: 10
  };
}

/**
 * Поиск команд Manchester
 * @returns {Object} Query parameters
 */
function findManchester() {
  return {
    name: 'Manchester',
    limit: 10
  };
}

/**
 * Поиск команд Real
 * @returns {Object} Query parameters
 */
function findReal() {
  return {
    name: 'Real',
    limit: 10
  };
}

/**
 * Поиск команд Barcelona
 * @returns {Object} Query parameters
 */
function findBarcelona() {
  return {
    name: 'Barcelona',
    limit: 10
  };
}

/**
 * Поиск команд Bayern
 * @returns {Object} Query parameters
 */
function findBayern() {
  return {
    name: 'Bayern',
    limit: 10
  };
}

/**
 * КАТЕГОРИЯ: COUNTRY - Команды по странам
 */

/**
 * Получить команды из конкретной страны
 * @param {string} country - Код или название страны
 * @param {number} limit - Максимальное количество
 * @returns {Object} Query parameters
 */
function getTeamsByCountry(country, limit = 50) {
  return {
    country,
    limit
  };
}

/**
 * Английские команды
 * @returns {Object} Query parameters
 */
function getEnglishTeams() {
  return {
    country: 'England',
    limit: 100
  };
}

/**
 * Испанские команды
 * @returns {Object} Query parameters
 */
function getSpanishTeams() {
  return {
    country: 'Spain',
    limit: 100
  };
}

/**
 * Итальянские команды
 * @returns {Object} Query parameters
 */
function getItalianTeams() {
  return {
    country: 'Italy',
    limit: 100
  };
}

/**
 * Немецкие команды
 * @returns {Object} Query parameters
 */
function getGermanTeams() {
  return {
    country: 'Germany',
    limit: 100
  };
}

/**
 * Французские команды
 * @returns {Object} Query parameters
 */
function getFrenchTeams() {
  return {
    country: 'France',
    limit: 100
  };
}

/**
 * Португальские команды
 * @returns {Object} Query parameters
 */
function getPortugueseTeams() {
  return {
    country: 'Portugal',
    limit: 50
  };
}

/**
 * Нидерландские команды
 * @returns {Object} Query parameters
 */
function getDutchTeams() {
  return {
    country: 'Netherlands',
    limit: 50
  };
}

/**
 * Бельгийские команды
 * @returns {Object} Query parameters
 */
function getBelgianTeams() {
  return {
    country: 'Belgium',
    limit: 50
  };
}

/**
 * Аргентинские команды
 * @returns {Object} Query parameters
 */
function getArgentinianTeams() {
  return {
    country: 'Argentina',
    limit: 100
  };
}

/**
 * Бразильские команды
 * @returns {Object} Query parameters
 */
function getBrazilianTeams() {
  return {
    country: 'Brazil',
    limit: 100
  };
}

/**
 * КАТЕГОРИЯ: COMBINED - Комбинированные запросы
 */

/**
 * Поиск английских команд с определенным названием
 * @param {string} name - Название команды
 * @returns {Object} Query parameters
 */
function findEnglishTeam(name) {
  return {
    name,
    country: 'England',
    limit: 20
  };
}

/**
 * Поиск команд United в Англии
 * @returns {Object} Query parameters
 */
function findEnglishUnited() {
  return {
    name: 'United',
    country: 'England',
    limit: 10
  };
}

/**
 * Поиск команд City в Англии
 * @returns {Object} Query parameters
 */
function findEnglishCity() {
  return {
    name: 'City',
    country: 'England',
    limit: 10
  };
}

/**
 * Поиск испанских команд с определенным названием
 * @param {string} name - Название команды
 * @returns {Object} Query parameters
 */
function findSpanishTeam(name) {
  return {
    name,
    country: 'Spain',
    limit: 20
  };
}

/**
 * КАТЕГОРИЯ: POPULAR - Популярные команды
 */

/**
 * Топ-5 лиг Европы
 * @returns {Array} Массив запросов для каждой страны
 */
function getTop5Leagues() {
  return [
    { country: 'England', limit: 20 },
    { country: 'Spain', limit: 20 },
    { country: 'Germany', limit: 18 },
    { country: 'Italy', limit: 20 },
    { country: 'France', limit: 20 }
  ];
}

/**
 * Команды Премьер Лиги (Англия)
 * @returns {Object} Query parameters
 */
function getPremierLeagueTeams() {
  return {
    country: 'England',
    limit: 20
  };
}

/**
 * Команды Ла Лиги (Испания)
 * @returns {Object} Query parameters
 */
function getLaLigaTeams() {
  return {
    country: 'Spain',
    limit: 20
  };
}

/**
 * Команды Бундеслиги (Германия)
 * @returns {Object} Query parameters
 */
function getBundesligaTeams() {
  return {
    country: 'Germany',
    limit: 18
  };
}

/**
 * Команды Серии А (Италия)
 * @returns {Object} Query parameters
 */
function getSerieATeams() {
  return {
    country: 'Italy',
    limit: 20
  };
}

/**
 * Команды Лиги 1 (Франция)
 * @returns {Object} Query parameters
 */
function getLigue1Teams() {
  return {
    country: 'France',
    limit: 20
  };
}

/**
 * КАТЕГОРИЯ: SPECIAL - Специальные запросы
 */

/**
 * Национальные сборные
 * @returns {Object} Query parameters
 */
function getNationalTeams() {
  return {
    limit: 200
    // Примечание: нужна дополнительная логика фильтрации на стороне клиента
  };
}

/**
 * Поиск клубов с определенным словом в названии
 * @param {string} keyword - Ключевое слово
 * @returns {Object} Query parameters
 */
function findTeamsByKeyword(keyword) {
  return {
    name: keyword,
    limit: 50
  };
}

/**
 * Команды, содержащие "FC" в названии
 * @returns {Object} Query parameters
 */
function findFCTeams() {
  return {
    name: 'FC',
    limit: 100
  };
}

/**
 * Команды, содержащие "United" в названии
 * @returns {Object} Query parameters
 */
function findUnitedTeams() {
  return {
    name: 'United',
    limit: 50
  };
}

/**
 * Команды, содержащие "City" в названии
 * @returns {Object} Query parameters
 */
function findCityTeams() {
  return {
    name: 'City',
    limit: 50
  };
}

/**
 * Команды, содержащие "Athletic" в названии
 * @returns {Object} Query parameters
 */
function findAthleticTeams() {
  return {
    name: 'Athletic',
    limit: 50
  };
}

/**
 * КАТЕГОРИЯ: PAGINATION - Примеры пагинации
 */

/**
 * Первая страница команд (1-20)
 * @returns {Object} Query parameters
 */
function getFirstPage() {
  return {
    offset: 0,
    limit: 20
  };
}

/**
 * Вторая страница команд (21-40)
 * @returns {Object} Query parameters
 */
function getSecondPage() {
  return {
    offset: 20,
    limit: 20
  };
}

/**
 * Третья страница команд (41-60)
 * @returns {Object} Query parameters
 */
function getThirdPage() {
  return {
    offset: 40,
    limit: 20
  };
}

/**
 * Получить страницу N
 * @param {number} pageNumber - Номер страницы (1-based)
 * @param {number} pageSize - Размер страницы
 * @returns {Object} Query parameters
 */
function getPage(pageNumber, pageSize = 20) {
  return {
    offset: (pageNumber - 1) * pageSize,
    limit: pageSize
  };
}

/**
 * EXPORT: Все примеры, сгруппированные по категориям
 */
const examples = {
  basic: {
    getFirstTeams,
    getTeamsPage,
    getAllTeams
  },
  search: {
    searchTeamByName,
    findArsenal,
    findManchester,
    findReal,
    findBarcelona,
    findBayern
  },
  country: {
    getTeamsByCountry,
    getEnglishTeams,
    getSpanishTeams,
    getItalianTeams,
    getGermanTeams,
    getFrenchTeams,
    getPortugueseTeams,
    getDutchTeams,
    getBelgianTeams,
    getArgentinianTeams,
    getBrazilianTeams
  },
  combined: {
    findEnglishTeam,
    findEnglishUnited,
    findEnglishCity,
    findSpanishTeam
  },
  popular: {
    getTop5Leagues,
    getPremierLeagueTeams,
    getLaLigaTeams,
    getBundesligaTeams,
    getSerieATeams,
    getLigue1Teams
  },
  special: {
    getNationalTeams,
    findTeamsByKeyword,
    findFCTeams,
    findUnitedTeams,
    findCityTeams,
    findAthleticTeams
  },
  pagination: {
    getFirstPage,
    getSecondPage,
    getThirdPage,
    getPage
  }
};

/**
 * Получить все примеры
 * @returns {Object} Все примеры запросов
 */
function getAllExamples() {
  return examples;
}

/**
 * Получить примеры по категории
 * @param {string} category - Название категории
 * @returns {Object|null} Примеры категории или null
 */
function getExamplesByCategory(category) {
  return examples[category] || null;
}

/**
 * Получить список всех категорий
 * @returns {Array<string>} Список категорий
 */
function getCategories() {
  return Object.keys(examples);
}

module.exports = {
  // Экспорт всех функций
  ...examples.basic,
  ...examples.search,
  ...examples.country,
  ...examples.combined,
  ...examples.popular,
  ...examples.special,
  ...examples.pagination,
  
  // Утилиты
  getAllExamples,
  getExamplesByCategory,
  getCategories,
  
  // Сгруппированные примеры
  examples
};
