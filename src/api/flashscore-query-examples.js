/**
 * Flashscore API Query Examples
 * Коллекция готовых примеров запросов для различных сценариев использования
 * 
 * @module flashscore-query-examples
 */

/**
 * Категории примеров запросов
 */
const QUERY_CATEGORIES = {
  DATE: 'Фильтрация по дате',
  TEAM: 'Фильтрация по командам',
  LEAGUE: 'Фильтрация по турнирам',
  STATUS: 'Фильтрация по статусу матча',
  ADVANCED: 'Продвинутые запросы',
  ANALYTICS: 'Аналитические запросы'
};

/**
 * Примеры запросов по категориям
 */
const QUERY_EXAMPLES = {
  
  // ============================================================
  // ФИЛЬТРАЦИЯ ПО ДАТЕ
  // ============================================================
  DATE: [
    {
      id: 'date_today',
      name: 'Матчи сегодня',
      description: 'Все матчи за текущую дату',
      params: {
        Date: new Date().toISOString().split('T')[0],
        TimeZone: 3
      },
      category: 'DATE'
    },
    {
      id: 'date_tomorrow',
      name: 'Матчи завтра',
      description: 'Все матчи на следующий день',
      params: {
        Date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        TimeZone: 3
      },
      category: 'DATE'
    },
    {
      id: 'date_week',
      name: 'Матчи за неделю',
      description: 'Матчи за текущую неделю',
      params: {
        From: new Date().toISOString().split('T')[0],
        To: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        TimeZone: 3,
        Order: 1
      },
      category: 'DATE'
    },
    {
      id: 'date_month',
      name: 'Матчи за месяц',
      description: 'Матчи за текущий месяц',
      params: {
        From: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        To: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
        TimeZone: 3,
        Limit: 1000
      },
      category: 'DATE'
    },
    {
      id: 'date_weekend',
      name: 'Матчи на выходных',
      description: 'Матчи субботы и воскресенья',
      params: {
        From: '2025-02-01',  // Настроить на ближайшую субботу
        To: '2025-02-03',    // Настроить на следующий понедельник
        TimeZone: 3
      },
      category: 'DATE'
    }
  ],

  // ============================================================
  // ФИЛЬТРАЦИЯ ПО КОМАНДАМ
  // ============================================================
  TEAM: [
    {
      id: 'team_all_games',
      name: 'Все матчи команды',
      description: 'Получить все матчи конкретной команды (дома и в гостях)',
      params: {
        Team: 'arsenal/hA1Zm19f',
        Limit: 100,
        Order: -1
      },
      category: 'TEAM'
    },
    {
      id: 'team_home_games',
      name: 'Домашние матчи команды',
      description: 'Только домашние матчи команды',
      params: {
        HomeTeam: 'arsenal/hA1Zm19f',
        Limit: 50,
        Order: -1
      },
      category: 'TEAM'
    },
    {
      id: 'team_away_games',
      name: 'Гостевые матчи команды',
      description: 'Только выездные матчи команды',
      params: {
        AwayTeam: 'arsenal/hA1Zm19f',
        Limit: 50,
        Order: -1
      },
      category: 'TEAM'
    },
    {
      id: 'team_h2h',
      name: 'История встреч (H2H)',
      description: 'Все матчи между двумя командами',
      params: {
        BothTeams: 'hA1Zm19f,tUxUbLR2',  // Arsenal vs Manchester United
        Order: -1
      },
      category: 'TEAM'
    },
    {
      id: 'team_upcoming',
      name: 'Предстоящие матчи команды',
      description: 'Ближайшие матчи команды',
      params: {
        Team: 'arsenal/hA1Zm19f',
        Upcoming: true,
        Limit: 10,
        Order: 1
      },
      category: 'TEAM'
    },
    {
      id: 'team_recent',
      name: 'Последние матчи команды',
      description: 'Недавно завершённые матчи команды',
      params: {
        Team: 'arsenal/hA1Zm19f',
        Ended: true,
        Limit: 10,
        Order: -1
      },
      category: 'TEAM'
    }
  ],

  // ============================================================
  // ФИЛЬТРАЦИЯ ПО ТУРНИРАМ
  // ============================================================
  LEAGUE: [
    {
      id: 'league_all',
      name: 'Все матчи лиги',
      description: 'Получить все матчи конкретной лиги',
      params: {
        LeagueId: 'england/premier-league',
        Limit: 1000,
        Order: -1
      },
      category: 'LEAGUE'
    },
    {
      id: 'league_season',
      name: 'Матчи сезона',
      description: 'Матчи конкретного сезона лиги',
      params: {
        SeasonId: 'england/premier-league-2024-2025',
        Limit: 1000,
        Order: 1
      },
      category: 'LEAGUE'
    },
    {
      id: 'league_years',
      name: 'Матчи по годам',
      description: 'Матчи за конкретные годы',
      params: {
        LeagueId: 'england/premier-league',
        Years: '2024-2025',
        Limit: 500
      },
      category: 'LEAGUE'
    },
    {
      id: 'league_today',
      name: 'Матчи лиги сегодня',
      description: 'Сегодняшние матчи конкретной лиги',
      params: {
        LeagueId: 'england/premier-league',
        Date: new Date().toISOString().split('T')[0],
        TimeZone: 3
      },
      category: 'LEAGUE'
    },
    {
      id: 'league_upcoming',
      name: 'Предстоящие матчи лиги',
      description: 'Ближайшие матчи лиги',
      params: {
        LeagueId: 'england/premier-league',
        Upcoming: true,
        Limit: 50,
        Order: 1
      },
      category: 'LEAGUE'
    }
  ],

  // ============================================================
  // ФИЛЬТРАЦИЯ ПО СТАТУСУ
  // ============================================================
  STATUS: [
    {
      id: 'status_live',
      name: 'Live матчи',
      description: 'Все матчи, идущие в данный момент',
      params: {
        Live: true,
        Limit: 100
      },
      category: 'STATUS'
    },
    {
      id: 'status_ended',
      name: 'Завершённые матчи',
      description: 'Все завершённые матчи',
      params: {
        Ended: true,
        Limit: 100,
        Order: -1
      },
      category: 'STATUS'
    },
    {
      id: 'status_upcoming',
      name: 'Предстоящие матчи',
      description: 'Все предстоящие матчи',
      params: {
        Upcoming: true,
        Limit: 100,
        Order: 1
      },
      category: 'STATUS'
    },
    {
      id: 'status_first_half',
      name: 'Матчи в первом тайме',
      description: 'Матчи, где идёт первый тайм',
      params: {
        Status: 12,
        Limit: 50
      },
      category: 'STATUS'
    },
    {
      id: 'status_second_half',
      name: 'Матчи во втором тайме',
      description: 'Матчи, где идёт второй тайм',
      params: {
        Status: 13,
        Limit: 50
      },
      category: 'STATUS'
    },
    {
      id: 'status_extra_time',
      name: 'Матчи в дополнительное время',
      description: 'Матчи в овертайме',
      params: {
        Status: 6,
        Limit: 20
      },
      category: 'STATUS'
    },
    {
      id: 'status_penalties',
      name: 'Матчи на пенальти',
      description: 'Матчи, где идёт серия пенальти',
      params: {
        Status: 7,
        Limit: 20
      },
      category: 'STATUS'
    }
  ],

  // ============================================================
  // ПРОДВИНУТЫЕ ЗАПРОСЫ
  // ============================================================
  ADVANCED: [
    {
      id: 'advanced_derby',
      name: 'Дерби в live',
      description: 'Live матчи между топ-командами',
      params: {
        LeagueId: 'england/premier-league',
        Live: true
      },
      category: 'ADVANCED'
    },
    {
      id: 'advanced_weekend_live',
      name: 'Live матчи выходных',
      description: 'Все live матчи в выходные дни',
      params: {
        Date: new Date().toISOString().split('T')[0],  // Настроить на субботу/воскресенье
        Live: true,
        TimeZone: 3
      },
      category: 'ADVANCED'
    },
    {
      id: 'advanced_top_leagues_today',
      name: 'Топ-лиги сегодня',
      description: 'Матчи из топ-5 лиг Европы',
      params: {
        Date: new Date().toISOString().split('T')[0],
        TimeZone: 3,
        Limit: 200
      },
      category: 'ADVANCED',
      note: 'Нужна фильтрация по нескольким лигам (реализовать через множественные запросы)'
    },
    {
      id: 'advanced_champions_league',
      name: 'Лига Чемпионов',
      description: 'Все матчи Лиги Чемпионов',
      params: {
        LeagueId: 'europe/champions-league',
        Limit: 500,
        Order: -1
      },
      category: 'ADVANCED'
    },
    {
      id: 'advanced_national_teams',
      name: 'Матчи сборных',
      description: 'Международные товарищеские матчи',
      params: {
        LeagueId: 'world/friendlies',
        Limit: 100,
        Order: -1
      },
      category: 'ADVANCED'
    }
  ],

  // ============================================================
  // АНАЛИТИЧЕСКИЕ ЗАПРОСЫ
  // ============================================================
  ANALYTICS: [
    {
      id: 'analytics_h2h_statistics',
      name: 'Статистика H2H',
      description: 'История встреч для анализа',
      params: {
        BothTeams: 'hA1Zm19f,tUxUbLR2',
        Ended: true,
        Order: -1,
        Limit: 50
      },
      category: 'ANALYTICS',
      analysis: ['wins', 'draws', 'losses', 'goals_scored', 'goals_conceded']
    },
    {
      id: 'analytics_form',
      name: 'Форма команды',
      description: 'Последние 10 матчей для анализа формы',
      params: {
        Team: 'arsenal/hA1Zm19f',
        Ended: true,
        Limit: 10,
        Order: -1
      },
      category: 'ANALYTICS',
      analysis: ['wins', 'draws', 'losses', 'points', 'goals_for', 'goals_against']
    },
    {
      id: 'analytics_home_form',
      name: 'Домашняя форма',
      description: 'Последние домашние матчи',
      params: {
        HomeTeam: 'arsenal/hA1Zm19f',
        Ended: true,
        Limit: 10,
        Order: -1
      },
      category: 'ANALYTICS'
    },
    {
      id: 'analytics_away_form',
      name: 'Гостевая форма',
      description: 'Последние выездные матчи',
      params: {
        AwayTeam: 'arsenal/hA1Zm19f',
        Ended: true,
        Limit: 10,
        Order: -1
      },
      category: 'ANALYTICS'
    },
    {
      id: 'analytics_league_table',
      name: 'Данные для турнирной таблицы',
      description: 'Все матчи сезона для расчёта таблицы',
      params: {
        LeagueId: 'england/premier-league',
        Years: '2024-2025',
        Ended: true,
        Limit: 1000
      },
      category: 'ANALYTICS'
    }
  ]
};

/**
 * Получить все примеры
 */
function getAllExamples() {
  return Object.values(QUERY_EXAMPLES).flat();
}

/**
 * Получить примеры по категории
 */
function getExamplesByCategory(category) {
  return QUERY_EXAMPLES[category] || [];
}

/**
 * Получить пример по ID
 */
function getExampleById(id) {
  const allExamples = getAllExamples();
  return allExamples.find(ex => ex.id === id);
}

/**
 * Получить список категорий
 */
function getCategories() {
  return QUERY_CATEGORIES;
}

/**
 * Построить query string из параметров
 */
function buildQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Получить полный URL для примера
 */
function getExampleUrl(exampleId, baseUrl = 'https://api.sstats.net') {
  const example = getExampleById(exampleId);
  if (!example) return null;
  
  const queryString = buildQueryString(example.params);
  return `${baseUrl}/Ls/List?${queryString}`;
}

module.exports = {
  QUERY_CATEGORIES,
  QUERY_EXAMPLES,
  getAllExamples,
  getExamplesByCategory,
  getExampleById,
  getCategories,
  buildQueryString,
  getExampleUrl
};
