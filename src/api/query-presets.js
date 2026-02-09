/**
 * Готовые пресеты запросов для Advanced Games Query
 * 
 * ОБНОВЛЕНО: 2026-01-31
 * Полная поддержка всех 170 доступных полей SStats API v0.9.13.0
 * 
 * Каждый пресет - это готовая конфигурация запроса,
 * которую можно использовать напрямую или модифицировать
 */

const QUERY_PRESETS = {
  // ============================================================
  // КАТЕГОРИЯ: Поиск по лигам (8 пресетов)
  // ============================================================
  
  premier_league_2024: {
    id: 'premier_league_2024',
    name: 'Английская Премьер-лига 2024',
    category: 'leagues',
    description: 'Все матчи Английской Премьер-лиги за 2024 год',
    query: {
      Condition: 'LeagueId = 39 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'VenueName', 'VenueCity'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿'
  },

  la_liga_2024: {
    id: 'la_liga_2024',
    name: 'Ла Лига 2024',
    category: 'leagues',
    description: 'Все матчи Испанской Ла Лиги за 2024 год',
    query: {
      Condition: 'LeagueId = 140 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'VenueName'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🇪🇸'
  },

  serie_a_2024: {
    id: 'serie_a_2024',
    name: 'Серия А 2024',
    category: 'leagues',
    description: 'Все матчи Итальянской Серии А за 2024 год',
    query: {
      Condition: 'LeagueId = 135 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🇮🇹'
  },

  bundesliga_2024: {
    id: 'bundesliga_2024',
    name: 'Бундеслига 2024',
    category: 'leagues',
    description: 'Все матчи Немецкой Бундеслиги за 2024 год',
    query: {
      Condition: 'LeagueId = 78 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🇩🇪'
  },

  ligue1_2024: {
    id: 'ligue1_2024',
    name: 'Лига 1 (Франция) 2024',
    category: 'leagues',
    description: 'Все матчи Французской Лиги 1 за 2024 год',
    query: {
      Condition: 'LeagueId = 61 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🇫🇷'
  },

  champions_league_2024: {
    id: 'champions_league_2024',
    name: 'Лига Чемпионов 2024',
    category: 'leagues',
    description: 'Матчи Лиги Чемпионов УЕФА',
    query: {
      Condition: 'LeagueId = 2 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'VenueName', 'CountryName'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🏆'
  },

  europa_league_2024: {
    id: 'europa_league_2024',
    name: 'Лига Европы 2024',
    category: 'leagues',
    description: 'Матчи Лиги Европы УЕФА',
    query: {
      Condition: 'LeagueId = 3 AND Year = 2024',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🥈'
  },

  top_5_leagues: {
    id: 'top_5_leagues',
    name: 'Топ-5 лиг Европы',
    category: 'leagues',
    description: 'Матчи из всех топ-5 европейских лиг',
    query: {
      Condition: 'LeagueId IN (39, 140, 135, 78, 61) AND Year = 2024',
      Fields: ['Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      Limit: 100,
      format: 'json'
    },
    icon: '⭐'
  },

  // ============================================================
  // КАТЕГОРИЯ: Коэффициенты и ставки (8 пресетов)
  // ============================================================
  
  favorites_low_odds: {
    id: 'favorites_low_odds',
    name: 'Явные фавориты (коэфф. 1.1-1.5)',
    category: 'odds',
    description: 'Матчи с очень низкими коэффициентами на фаворита',
    query: {
      Condition: '(Winner1 >= 1.1 AND Winner1 <= 1.5) OR (Winner2 >= 1.1 AND Winner2 <= 1.5)',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'Winner1', 'WinnerX', 'Winner2', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '💪'
  },

  favorites_medium_odds: {
    id: 'favorites_medium_odds',
    name: 'Средние фавориты (коэфф. 1.5-2.0)',
    category: 'odds',
    description: 'Матчи с умеренными коэффициентами на фаворита',
    query: {
      Condition: '(Winner1 >= 1.5 AND Winner1 <= 2.0) OR (Winner2 >= 1.5 AND Winner2 <= 2.0)',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'Winner1', 'WinnerX', 'Winner2'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '⚖️'
  },

  even_matches: {
    id: 'even_matches',
    name: 'Равные противники (коэфф. 2.0-3.5)',
    category: 'odds',
    description: 'Матчи примерно равных команд',
    query: {
      Condition: 'Winner1 >= 2.0 AND Winner1 <= 3.5 AND Winner2 >= 2.0 AND Winner2 <= 3.5',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'Winner1', 'WinnerX', 'Winner2'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🤝'
  },

  high_draw_odds: {
    id: 'high_draw_odds',
    name: 'Высокие коэффициенты на ничью (> 3.5)',
    category: 'odds',
    description: 'Матчи где маловероятна ничья',
    query: {
      Condition: 'WinnerX > 3.5',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'Winner1', 'WinnerX', 'Winner2', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'WinnerX DESC',
      format: 'json'
    },
    icon: '🎲'
  },

  value_bets: {
    id: 'value_bets',
    name: 'Value bets (фаворит проиграл)',
    category: 'odds',
    description: 'Матчи где фаворит с коэфф. < 2.0 проиграл',
    query: {
      Condition: '(Winner1 < 2.0 AND ScoreHomeFT < ScoreAwayFT) OR (Winner2 < 2.0 AND ScoreAwayFT < ScoreHomeFT)',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'Winner1', 'WinnerX', 'Winner2', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '💎'
  },

  double_chance_value: {
    id: 'double_chance_value',
    name: 'Двойной шанс (DC < 1.5)',
    category: 'odds',
    description: 'Низкие коэффициенты на двойной шанс',
    query: {
      Condition: 'DC_1X < 1.5 OR DC_12 < 1.5 OR DC_2X < 1.5',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'DC_1X', 'DC_12', 'DC_2X', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🎰'
  },

  dnb_analysis: {
    id: 'dnb_analysis',
    name: 'Draw No Bet (DNB) анализ',
    category: 'odds',
    description: 'Сравнение коэффициентов DNB с результатом',
    query: {
      Condition: 'DNB_1 > 0 AND DNB_2 > 0',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'DNB_1', 'DNB_2', 'Winner1', 'Winner2', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🚫'
  },

  odds_xg_comparison: {
    id: 'odds_xg_comparison',
    name: 'Сравнение коэфф. xG с реальным xG',
    category: 'odds',
    description: 'Анализ точности букмекерских прогнозов xG',
    query: {
      Condition: 'OddsXgHome > 0 AND ExpectedGoalsHome > 0',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'OddsXgHome', 'ExpectedGoalsHome',
        'OddsXgAway', 'ExpectedGoalsAway',
        'ABS(OddsXgHome - ExpectedGoalsHome) AS HomeXgDiff',
        'ABS(OddsXgAway - ExpectedGoalsAway) AS AwayXgDiff'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🔮'
  },

  // ============================================================
  // КАТЕГОРИЯ: Результативность (8 пресетов)
  // ============================================================
  
  high_scoring: {
    id: 'high_scoring',
    name: 'Результативные матчи (> 4 голов)',
    category: 'scoring',
    description: 'Матчи с общим количеством голов больше 4',
    query: {
      Condition: '(ScoreHomeFT + ScoreAwayFT) > 4',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ScoreHomeFT + ScoreAwayFT AS TotalGoals'
      ],
      Order: 'TotalGoals DESC',
      format: 'json'
    },
    icon: '🔥'
  },

  very_high_scoring: {
    id: 'very_high_scoring',
    name: 'Очень результативные (> 6 голов)',
    category: 'scoring',
    description: 'Матчи с 7+ голами - настоящие перестрелки',
    query: {
      Condition: '(ScoreHomeFT + ScoreAwayFT) > 6',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ScoreHomeFT + ScoreAwayFT AS TotalGoals'
      ],
      Order: 'TotalGoals DESC',
      format: 'json'
    },
    icon: '💥'
  },

  low_scoring: {
    id: 'low_scoring',
    name: 'Малорезультативные (< 2 голов)',
    category: 'scoring',
    description: 'Матчи с 0-1 голами - тактическая борьба',
    query: {
      Condition: '(ScoreHomeFT + ScoreAwayFT) < 2',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ScoreHomeFT + ScoreAwayFT AS TotalGoals'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🔒'
  },

  btts: {
    id: 'btts',
    name: 'Обе забили (BTTS)',
    category: 'scoring',
    description: 'Матчи где обе команды забили минимум по голу',
    query: {
      Condition: 'ScoreHomeFT > 0 AND ScoreAwayFT > 0',
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '⚽⚽'
  },

  one_sided: {
    id: 'one_sided',
    name: 'Разгромы (разница > 3 голов)',
    category: 'scoring',
    description: 'Матчи с крупным счетом',
    query: {
      Condition: 'ABS(ScoreHomeFT - ScoreAwayFT) > 3',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ABS(ScoreHomeFT - ScoreAwayFT) AS GoalDifference'
      ],
      Order: 'GoalDifference DESC',
      format: 'json'
    },
    icon: '📊'
  },

  first_half_goals: {
    id: 'first_half_goals',
    name: 'Результативный 1-й тайм (> 3 голов)',
    category: 'scoring',
    description: 'Матчи с большим количеством голов в первом тайме',
    query: {
      Condition: '(ScoreHomeHT + ScoreAwayHT) > 3',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeHT', 'ScoreAwayHT',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ScoreHomeHT + ScoreAwayHT AS HalfTimeGoals'
      ],
      Order: 'HalfTimeGoals DESC',
      format: 'json'
    },
    icon: '⏱️'
  },

  comeback_matches: {
    id: 'comeback_matches',
    name: 'Камбэки (проигрывал в 1-м тайме)',
    category: 'scoring',
    description: 'Команды перевернули матч',
    query: {
      Condition: '(ScoreHomeHT < ScoreAwayHT AND ScoreHomeFT > ScoreAwayFT) OR (ScoreAwayHT < ScoreHomeHT AND ScoreAwayFT > ScoreHomeFT)',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeHT', 'ScoreAwayHT',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🔄'
  },

  extra_time_drama: {
    id: 'extra_time_drama',
    name: 'Дополнительное время',
    category: 'scoring',
    description: 'Матчи с голами в дополнительное время',
    query: {
      Condition: 'ScoreHomeET > 0 OR ScoreAwayET > 0',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ScoreHomeET', 'ScoreAwayET',
        'ScoreHomePT', 'ScoreAwayPT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '⏳'
  },

  // ============================================================
  // КАТЕГОРИЯ: xG (Expected Goals) - 6 пресетов
  // ============================================================
  
  xg_overperformance: {
    id: 'xg_overperformance',
    name: 'Превышение xG хозяев (> 1.5)',
    category: 'xg',
    description: 'Команды хозяев забили намного больше ожидаемого',
    query: {
      Condition: 'ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) > 1.5',
      Fields: [
        'Date', 'HomeTeamName', 'ScoreHomeFT', 'ExpectedGoalsHome',
        'ScoreHomeFT - ExpectedGoalsHome AS OverPerformance'
      ],
      Order: 'OverPerformance DESC',
      format: 'json'
    },
    icon: '📈'
  },

  xg_underperformance: {
    id: 'xg_underperformance',
    name: 'Недобор xG (забили < xG - 1.5)',
    category: 'xg',
    description: 'Команды забили меньше ожидаемого',
    query: {
      Condition: 'ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) < -1.5',
      Fields: [
        'Date', 'HomeTeamName', 'ScoreHomeFT', 'ExpectedGoalsHome',
        'ExpectedGoalsHome - ScoreHomeFT AS UnderPerformance'
      ],
      Order: 'UnderPerformance DESC',
      format: 'json'
    },
    icon: '📉'
  },

  xg_accuracy: {
    id: 'xg_accuracy',
    name: 'Точное соответствие xG (±0.5)',
    category: 'xg',
    description: 'Матчи где команды забили ровно по xG',
    query: {
      Condition: 'ExpectedGoalsHome > 0 AND ABS(ScoreHomeFT - ExpectedGoalsHome) <= 0.5',
      Fields: [
        'Date', 'HomeTeamName', 'ScoreHomeFT', 'ExpectedGoalsHome',
        'ABS(ScoreHomeFT - ExpectedGoalsHome) AS Difference'
      ],
      Order: 'Difference ASC',
      format: 'json'
    },
    icon: '🎯'
  },

  high_xg_low_score: {
    id: 'high_xg_low_score',
    name: 'Высокий xG, мало голов (xG > 2, голов < 2)',
    category: 'xg',
    description: 'Команды создавали моменты, но не реализовали',
    query: {
      Condition: '(ExpectedGoalsHome > 2 AND ScoreHomeFT < 2) OR (ExpectedGoalsAway > 2 AND ScoreAwayFT < 2)',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ExpectedGoalsHome',
        'ScoreAwayFT', 'ExpectedGoalsAway'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '😤'
  },

  calculated_vs_real_xg: {
    id: 'calculated_vs_real_xg',
    name: 'Расчётный vs Реальный xG',
    category: 'xg',
    description: 'Сравнение CalculatedXg и ExpectedGoals',
    query: {
      Condition: 'CalculatedXgHome > 0 AND ExpectedGoalsHome > 0',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'ExpectedGoalsHome', 'CalculatedXgHome',
        'ExpectedGoalsAway', 'CalculatedXgAway',
        'ABS(ExpectedGoalsHome - CalculatedXgHome) AS HomeDiff',
        'ABS(ExpectedGoalsAway - CalculatedXgAway) AS AwayDiff'
      ],
      Order: 'HomeDiff DESC',
      format: 'json'
    },
    icon: '🔬'
  },

  glicko_xg_analysis: {
    id: 'glicko_xg_analysis',
    name: 'Glicko xG vs Реальный результат',
    category: 'xg',
    description: 'Точность прогноза Glicko модели',
    query: {
      Condition: 'GlickoXgHome > 0 AND ScoreHomeFT >= 0',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GlickoXgHome', 'GlickoXgAway',
        'ScoreHomeFT', 'ScoreAwayFT',
        'ABS(GlickoXgHome - ScoreHomeFT) AS HomeAccuracy',
        'ABS(GlickoXgAway - ScoreAwayFT) AS AwayAccuracy'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🎓'
  },

  // ============================================================
  // КАТЕГОРИЯ: Детальная статистика (10 пресетов)
  // ============================================================
  
  many_shots_few_goals: {
    id: 'many_shots_few_goals',
    name: 'Много ударов, мало голов (> 30 ударов, < 2 голов)',
    category: 'stats',
    description: 'Неэффективная реализация моментов',
    query: {
      Condition: '(TotalShotsHome + TotalShotsAway) > 30 AND (ScoreHomeFT + ScoreAwayFT) < 2',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'TotalShotsHome', 'TotalShotsAway',
        'ScoreHomeFT', 'ScoreAwayFT',
        '(TotalShotsHome + TotalShotsAway) / (ScoreHomeFT + ScoreAwayFT + 0.1) AS ShotsPerGoal'
      ],
      Order: 'ShotsPerGoal DESC',
      format: 'json'
    },
    icon: '🎯❌'
  },

  high_shot_accuracy: {
    id: 'high_shot_accuracy',
    name: 'Высокая точность ударов (> 50% в створ)',
    category: 'stats',
    description: 'Команды эффективно били в створ',
    query: {
      Condition: 'TotalShotsHome > 10 AND (ShotsOnGoalHome * 100 / TotalShotsHome) > 50',
      Fields: [
        'Date', 'HomeTeamName',
        'TotalShotsHome', 'ShotsOnGoalHome',
        '(ShotsOnGoalHome * 100 / TotalShotsHome) AS Accuracy'
      ],
      Order: 'Accuracy DESC',
      format: 'json'
    },
    icon: '🎯✅'
  },

  possession_dominance: {
    id: 'possession_dominance',
    name: 'Доминирование владения (> 65%)',
    category: 'stats',
    description: 'Команды с подавляющим владением мячом',
    query: {
      Condition: 'BallPossessionHome > 65 OR BallPossessionAway > 65',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'BallPossessionHome', 'BallPossessionAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🏐'
  },

  low_possession_win: {
    id: 'low_possession_win',
    name: 'Победа с низким владением (< 40%)',
    category: 'stats',
    description: 'Эффективный контратакующий футбол',
    query: {
      Condition: '(BallPossessionHome < 40 AND ScoreHomeFT > ScoreAwayFT) OR (BallPossessionAway < 40 AND ScoreAwayFT > ScoreHomeFT)',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'BallPossessionHome', 'BallPossessionAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '⚡'
  },

  corner_kicks_analysis: {
    id: 'corner_kicks_analysis',
    name: 'Много угловых (> 15 угловых)',
    category: 'stats',
    description: 'Матчи с большим количеством угловых',
    query: {
      Condition: '(CornerKicksHome + CornerKicksAway) > 15',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'CornerKicksHome', 'CornerKicksAway',
        'ScoreHomeFT', 'ScoreAwayFT',
        'CornerKicksHome + CornerKicksAway AS TotalCorners'
      ],
      Order: 'TotalCorners DESC',
      format: 'json'
    },
    icon: '🚩'
  },

  fouls_and_cards: {
    id: 'fouls_and_cards',
    name: 'Грубая игра (> 5 карточек)',
    category: 'stats',
    description: 'Матчи с большим количеством нарушений',
    query: {
      Condition: '(YellowCardsHome + YellowCardsAway + RedCardsHome + RedCardsAway) > 5',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'YellowCardsHome', 'YellowCardsAway',
        'RedCardsHome', 'RedCardsAway',
        'FoulsHome', 'FoulsAway',
        'YellowCardsHome + YellowCardsAway + RedCardsHome + RedCardsAway AS TotalCards'
      ],
      Order: 'TotalCards DESC',
      format: 'json'
    },
    icon: '🟨🟥'
  },

  red_cards_matches: {
    id: 'red_cards_matches',
    name: 'Матчи с красными карточками',
    category: 'stats',
    description: 'Игры с удалениями',
    query: {
      Condition: 'RedCardsHome > 0 OR RedCardsAway > 0',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'RedCardsHome', 'RedCardsAway',
        'ScoreHomeFT', 'ScoreAwayFT',
        'YellowCardsHome', 'YellowCardsAway'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🟥'
  },

  goalkeeper_saves: {
    id: 'goalkeeper_saves',
    name: 'Много сейвов вратаря (> 8)',
    category: 'stats',
    description: 'Выдающаяся работа голкиперов',
    query: {
      Condition: 'GoalkeeperSavesHome > 8 OR GoalkeeperSavesAway > 8',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GoalkeeperSavesHome', 'GoalkeeperSavesAway',
        'ShotsOnGoalHome', 'ShotsOnGoalAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'GoalkeeperSavesHome DESC',
      format: 'json'
    },
    icon: '🧤'
  },

  passing_accuracy: {
    id: 'passing_accuracy',
    name: 'Высокая точность передач (> 85%)',
    category: 'stats',
    description: 'Команды с отличным контролем мяча',
    query: {
      Condition: 'TotalPassesHome > 0 AND (PassesAccurateHome * 100 / TotalPassesHome) > 85',
      Fields: [
        'Date', 'HomeTeamName',
        'TotalPassesHome', 'PassesAccurateHome',
        'BallPossessionHome',
        '(PassesAccurateHome * 100 / TotalPassesHome) AS PassAccuracy'
      ],
      Order: 'PassAccuracy DESC',
      format: 'json'
    },
    icon: '🎯'
  },

  offsides_analysis: {
    id: 'offsides_analysis',
    name: 'Много офсайдов (> 8)',
    category: 'stats',
    description: 'Команды играют на грани офсайда',
    query: {
      Condition: '(OffsidesHome + OffsidesAway) > 8',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'OffsidesHome', 'OffsidesAway',
        'ScoreHomeFT', 'ScoreAwayFT',
        'OffsidesHome + OffsidesAway AS TotalOffsides'
      ],
      Order: 'TotalOffsides DESC',
      format: 'json'
    },
    icon: '🚫⚽'
  },

  // ============================================================
  // КАТЕГОРИЯ: Glicko рейтинги (4 пресета)
  // ============================================================

  glicko_rating_diff: {
    id: 'glicko_rating_diff',
    name: 'Большая разница в Glicko рейтинге (> 300)',
    category: 'glicko',
    description: 'Матчи команд разного уровня по Glicko',
    query: {
      Condition: 'ABS(GlickoRatingHome - GlickoRatingAway) > 300',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GlickoRatingHome', 'GlickoRatingAway',
        'ABS(GlickoRatingHome - GlickoRatingAway) AS RatingDiff',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'RatingDiff DESC',
      format: 'json'
    },
    icon: '⚖️'
  },

  glicko_win_prob: {
    id: 'glicko_win_prob',
    name: 'Высокая вероятность победы Glicko (> 75%)',
    category: 'glicko',
    description: 'Явные фавориты по модели Glicko',
    query: {
      Condition: 'GlickoWinProbHome > 75 OR GlickoWinProbAway > 75',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GlickoWinProbHome', 'GlickoWinProbAway',
        'GlickoRatingHome', 'GlickoRatingAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '📊'
  },

  glicko_upset: {
    id: 'glicko_upset',
    name: 'Glicko сенсации (фаворит проиграл)',
    category: 'glicko',
    description: 'Команда с высокой вероятностью победы проиграла',
    query: {
      Condition: '(GlickoWinProbHome > 70 AND ScoreHomeFT < ScoreAwayFT) OR (GlickoWinProbAway > 70 AND ScoreAwayFT < ScoreHomeFT)',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GlickoWinProbHome', 'GlickoWinProbAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '💥'
  },

  glicko_even_teams: {
    id: 'glicko_even_teams',
    name: 'Равные команды по Glicko (±50 рейтинга)',
    category: 'glicko',
    description: 'Матчи команд с близким рейтингом',
    query: {
      Condition: 'ABS(GlickoRatingHome - GlickoRatingAway) <= 50',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'GlickoRatingHome', 'GlickoRatingAway',
        'GlickoWinProbHome', 'GlickoWinProbAway',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🤝'
  },

  // ============================================================
  // КАТЕГОРИЯ: Команды и тренеры (5 пресетов)
  // ============================================================
  
  top_teams_matches: {
    id: 'top_teams_matches',
    name: 'Топ-команды Англии',
    category: 'teams',
    description: 'Матчи с участием топ-6 АПЛ',
    query: {
      Condition: "LeagueId = 39 AND (HomeTeamName LIKE '%Manchester City%' OR HomeTeamName LIKE '%Liverpool%' OR HomeTeamName LIKE '%Arsenal%' OR HomeTeamName LIKE '%Chelsea%' OR HomeTeamName LIKE '%Tottenham%' OR HomeTeamName LIKE '%Manchester United%' OR AwayTeamName LIKE '%Manchester City%' OR AwayTeamName LIKE '%Liverpool%' OR AwayTeamName LIKE '%Arsenal%' OR AwayTeamName LIKE '%Chelsea%' OR AwayTeamName LIKE '%Tottenham%' OR AwayTeamName LIKE '%Manchester United%')",
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'HomeTeamCoachName', 'AwayTeamCoachName'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '⭐'
  },

  el_clasico: {
    id: 'el_clasico',
    name: 'Эль Класико (Real vs Barcelona)',
    category: 'teams',
    description: 'Исторические матчи Real Madrid vs Barcelona',
    query: {
      Condition: "(HomeTeamName LIKE '%Real Madrid%' AND AwayTeamName LIKE '%Barcelona%') OR (HomeTeamName LIKE '%Barcelona%' AND AwayTeamName LIKE '%Real Madrid%')",
      Fields: ['Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'VenueName'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🇪🇸⚔️'
  },

  derby_matches: {
    id: 'derby_matches',
    name: 'Дерби Манчестера',
    category: 'teams',
    description: 'Manchester City vs Manchester United',
    query: {
      Condition: "(HomeTeamName LIKE '%Manchester City%' AND AwayTeamName LIKE '%Manchester United%') OR (HomeTeamName LIKE '%Manchester United%' AND AwayTeamName LIKE '%Manchester City%')",
      Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT', 'ScoreAwayFT', 'Winner1', 'WinnerX', 'Winner2', 'VenueName'],
      Order: 'Date DESC',
      format: 'json'
    },
    icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿⚔️'
  },

  coach_analysis: {
    id: 'coach_analysis',
    name: 'Анализ тренеров',
    category: 'teams',
    description: 'Матчи с подробной информацией о тренерах',
    query: {
      Condition: 'HomeTeamCoachName IS NOT NULL AND AwayTeamCoachName IS NOT NULL',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'HomeTeamCoachName', 'HomeTeamCoachNationality',
        'AwayTeamCoachName', 'AwayTeamCoachNationality',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      Limit: 50,
      format: 'json'
    },
    icon: '👨‍💼'
  },

  venue_analysis: {
    id: 'venue_analysis',
    name: 'Анализ стадионов',
    category: 'teams',
    description: 'Матчи с информацией о стадионах',
    query: {
      Condition: 'VenueName IS NOT NULL',
      Fields: [
        'Date', 'HomeTeamName', 'AwayTeamName',
        'VenueName', 'VenueCity', 'VenueAddress',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      Limit: 50,
      format: 'json'
    },
    icon: '🏟️'
  },

  // ============================================================
  // КАТЕГОРИЯ: Покрытие данных (4 пресета)
  // ============================================================

  full_coverage_matches: {
    id: 'full_coverage_matches',
    name: 'Полное покрытие данных',
    category: 'coverage',
    description: 'Матчи со всеми доступными данными',
    query: {
      Condition: 'CoverageSeasonPlayers = 1 AND CoverageSeasonEvents = 1 AND CoverageSeasonLineups = 1 AND CoverageSeasonStatisticsFixtures = 1 AND CoverageSeasonStatisticsPlayers = 1',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'CoverageSeasonPlayers', 'CoverageSeasonEvents',
        'CoverageSeasonStatisticsFixtures'
      ],
      Order: 'Date DESC',
      Limit: 50,
      format: 'json'
    },
    icon: '✅'
  },

  odds_coverage: {
    id: 'odds_coverage',
    name: 'Матчи с коэффициентами',
    category: 'coverage',
    description: 'Матчи где доступны коэффициенты',
    query: {
      Condition: 'CoverageSeasonOdds = 1 AND Winner1 > 0',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'Winner1', 'WinnerX', 'Winner2',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      Limit: 100,
      format: 'json'
    },
    icon: '💰'
  },

  lineups_available: {
    id: 'lineups_available',
    name: 'Доступны составы',
    category: 'coverage',
    description: 'Матчи с информацией о составах',
    query: {
      Condition: 'CoverageSeasonLineups = 1',
      Fields: [
        'Date', 'LeagueName', 'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT',
        'HomeTeamCoachName', 'AwayTeamCoachName'
      ],
      Order: 'Date DESC',
      Limit: 50,
      format: 'json'
    },
    icon: '👥'
  },

  standings_available: {
    id: 'standings_available',
    name: 'Доступна турнирная таблица',
    category: 'coverage',
    description: 'Матчи лиг с турнирной таблицей',
    query: {
      Condition: 'CoverageSeasonStandings = 1',
      Fields: [
        'Date', 'LeagueName', 'CountryName',
        'HomeTeamName', 'AwayTeamName',
        'ScoreHomeFT', 'ScoreAwayFT'
      ],
      Order: 'Date DESC',
      Limit: 100,
      format: 'json'
    },
    icon: '📊'
  }
};

/**
 * Получить все пресеты
 */
function getAllPresets() {
  return Object.values(QUERY_PRESETS);
}

/**
 * Получить пресеты по категории
 */
function getPresetsByCategory(category) {
  return Object.values(QUERY_PRESETS).filter(p => p.category === category);
}

/**
 * Получить пресет по ID
 */
function getPresetById(id) {
  return QUERY_PRESETS[id] || null;
}

/**
 * Получить список категорий
 */
function getCategories() {
  return {
    leagues: { name: 'Лиги', icon: '🏆', count: getPresetsByCategory('leagues').length },
    odds: { name: 'Коэффициенты', icon: '💰', count: getPresetsByCategory('odds').length },
    scoring: { name: 'Результативность', icon: '⚽', count: getPresetsByCategory('scoring').length },
    xg: { name: 'Expected Goals', icon: '📊', count: getPresetsByCategory('xg').length },
    stats: { name: 'Статистика', icon: '📈', count: getPresetsByCategory('stats').length },
    glicko: { name: 'Glicko Рейтинг', icon: '🎓', count: getPresetsByCategory('glicko').length },
    teams: { name: 'Команды', icon: '👥', count: getPresetsByCategory('teams').length },
    coverage: { name: 'Покрытие данных', icon: '✅', count: getPresetsByCategory('coverage').length }
  };
}

/**
 * Получить статистику по пресетам
 */
function getPresetsStats() {
  const presets = getAllPresets();
  const categories = getCategories();
  
  return {
    total: presets.length,
    byCategory: Object.keys(categories).reduce((acc, cat) => {
      acc[cat] = getPresetsByCategory(cat).length;
      return acc;
    }, {}),
    categories: Object.keys(categories)
  };
}

module.exports = {
  QUERY_PRESETS,
  getAllPresets,
  getPresetsByCategory,
  getPresetById,
  getCategories,
  getPresetsStats
};
