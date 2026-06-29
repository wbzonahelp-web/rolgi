'use strict';

/**
 * League-specific weights для адаптивного прогнозирования
 * 
 * Каждая лига имеет уникальные характеристики:
 * - La Liga: высокий HOME%, высокий DRAW% — усиливаем HOME сигнал
 * - Serie A: максимум DRAW% — усиливаем DRAW сигнал  
 * - Bundesliga: максимум AWAY% — усиливаем AWAY сигнал
 * 
 * Система автоматически калибруется после каждого матча
 */

const DEFAULT_WEIGHTS = {
    // Базовые веса факторов (сумма = 1.0)
    strength: 0.40,    // Разница сил между командами
    momentum: 0.20,    // Серии побед/поражений
    hmm: 0.15,         // Hidden Markov Model
    inertia: 0.10,     // Form inertia
    draw_signal: 0.10, // DRAW-сигналы (entropy, multipeak)
    predictability: 0.05, // Markov predictability
    game_stats: 0.20,     // Game stats (xG, possession, shots)
    
    // Корректировки по исходам
    home_bonus: 0.0,   // Бонус к HOME (может быть отрицательным)
    away_bonus: 0.0,   // Бонус к AWAY
    draw_bonus: 0.0,   // Бонус к DRAW
    
    // Пороги
    strength_threshold: 0.3,  // Порог для "сильнее/слабее"
    momentum_min_streak: 3,   // Минимальная серия для сигнала
    
    // Калибровка
    last_calibration: null,
    games_since_calibration: 0,
    calibration_accuracy: 0
};

// League-specific overrides (based on 2023-2025 data analysis)
const LEAGUE_OVERRIDES = {
    // La Liga: высокий HOME% (45.8%), высокий DRAW% (26.1%), низкоголая (2.65)
    '140': {
        home_bonus: 0.05,      // +5% к HOME (45.8% vs 43.2% baseline)
        draw_bonus: 0.02,      // +2% к DRAW (26.1% vs 24.5% baseline)
        away_bonus: -0.03,     // -3% к AWAY (28.2% vs 32.4% baseline)
        strength_threshold: 0.25, // Ниже порог (нужно меньше разницы для HOME)
        momentum_min_streak: 2,   // Раньше срабатывает (серия 2 уже сигнал)
        // DRAW сигналы сильнее в низкоголых лигах
        draw_signal_weight: 0.15, // +5% к DRAW фактору
    },
    
    // Serie A: максимум DRAW% (28.0%), низкоголая (2.53)
    '135': {
        home_bonus: -0.03,     // -3% к HOME (40.2% vs 43.2% baseline)
        draw_bonus: 0.05,      // +5% к DRAW (28.0% vs 24.5% baseline)
        away_bonus: 0.0,       // AWAY сбалансирован
        strength_threshold: 0.35, // Выше порог (труднее предсказать)
        momentum_min_streak: 4,   // Позже срабатывает (осторожная лига)
        // DRAW сигналы максимально важны
        draw_signal_weight: 0.20, // +10% к DRAW фактору
    },
    
    // Bundesliga: максимум AWAY% (32.6%), высокоголая (3.19)
    '78': {
        home_bonus: -0.02,     // -2% к HOME (41.8% vs 43.2% baseline)
        draw_bonus: 0.0,       // DRAW сбалансирован
        away_bonus: 0.03,      // +3% к AWAY (32.6% vs 32.4% baseline)
        strength_threshold: 0.25, // Ниже порог (атакующая лига)
        momentum_min_streak: 2,   // Раньше срабатывает
        // AWAY сигналы сильнее
        away_momentum_boost: 0.1, // +10% к away momentum
    },
    
    // EPL: сбалансированная, высокоголая (2.99)
    '39': {
        home_bonus: 0.0,       // HOME сбалансирован
        draw_bonus: 0.0,       // DRAW сбалансирован
        away_bonus: 0.0,       // AWAY сбалансирован
        strength_threshold: 0.3,  // Стандартный порог
        momentum_min_streak: 3,   // Стандартная серия
        // Все факторы равны
    },
    
    // Ligue 1: сбалансированная, среднеголая (2.84)
    '61': {
        home_bonus: 0.01,      // +1% к HOME (44.0% vs 43.2% baseline)
        draw_bonus: -0.01,     // -1% к DRAW (23.8% vs 24.5% baseline)
        away_bonus: 0.0,       // AWAY сбалансирован
        strength_threshold: 0.3,  // Стандартный порог
        momentum_min_streak: 3,   // Стандартная серия
    }
};

/**
 * Получить веса для конкретной лиги
 * @param {number} leagueSstatsId - sstats_id лиги
 * @returns {object} - веса с учётом league-specific overrides
 */
function getWeights(leagueSstatsId) {
    const leagueId = String(leagueSstatsId);
    const override = LEAGUE_OVERRIDES[leagueId] || {};
    
    return {
        ...DEFAULT_WEIGHTS,
        ...override,
        league_id: leagueId,
        // Пересчитываем draw_signal_weight если есть override
        draw_signal: override.draw_signal_weight || DEFAULT_WEIGHTS.draw_signal
    };
}

/**
 * Автоматическая калибровка весов на основе последних результатов
 * @param {number} leagueSstatsId - sstats_id лиги
 * @param {Array} recentResults - [{predicted, actual, confidence}]
 * @returns {object} - обновлённые веса
 */
function calibrateWeights(leagueSstatsId, recentResults) {
    if (!recentResults || recentResults.length < 20) {
        return getWeights(leagueSstatsId);
    }
    
    const leagueId = String(leagueSstatsId);
    const currentWeights = getWeights(leagueSstatsId);
    
    // Анализируем точность по исходам
    let homeHits = 0, homeTotal = 0;
    let awayHits = 0, awayTotal = 0;
    let drawHits = 0, drawTotal = 0;
    
    for (const r of recentResults) {
        if (r.predicted === 'HOME') {
            homeTotal++;
            if (r.actual === 'HOME') homeHits++;
        } else if (r.predicted === 'AWAY') {
            awayTotal++;
            if (r.actual === 'AWAY') awayHits++;
        } else if (r.predicted === 'DRAW') {
            drawTotal++;
            if (r.actual === 'DRAW') drawHits++;
        }
    }
    
    const homeAccuracy = homeTotal > 0 ? homeHits / homeTotal : 0;
    const awayAccuracy = awayTotal > 0 ? awayHits / awayTotal : 0;
    const drawAccuracy = drawTotal > 0 ? drawHits / drawTotal : 0;
    
    // Целевая точность: 50% для HOME/AWAY, 30% для DRAW
    const TARGET_HOME = 0.50;
    const TARGET_AWAY = 0.50;
    const TARGET_DRAW = 0.30;
    
    // Корректировка бонусов
    const homeAdj = (homeAccuracy - TARGET_HOME) * 0.1; // ±10% за каждые 10% отклонения
    const awayAdj = (awayAccuracy - TARGET_AWAY) * 0.1;
    const drawAdj = (drawAccuracy - TARGET_DRAW) * 0.1;
    
    // Обновляем веса
    const calibratedWeights = {
        ...currentWeights,
        home_bonus: currentWeights.home_bonus + homeAdj,
        away_bonus: currentWeights.away_bonus + awayAdj,
        draw_bonus: currentWeights.draw_bonus + drawAdj,
        last_calibration: new Date().toISOString(),
        games_since_calibration: 0,
        calibration_accuracy: (homeHits + awayHits + drawHits) / recentResults.length
    };
    
    // Сохраняем в БД (или кэш)
    LEAGUE_OVERRIDES[leagueId] = {
        ...LEAGUE_OVERRIDES[leagueId],
        ...calibratedWeights
    };
    
    return calibratedWeights;
}

/**
 * Получить историю калибровки для лиги
 * @param {number} leagueSstatsId - sstats_id лиги
 * @returns {object} - история калибровки
 */
function getCalibrationHistory(leagueSstatsId) {
    const leagueId = String(leagueSstatsId);
    const weights = LEAGUE_OVERRIDES[leagueId] || DEFAULT_WEIGHTS;
    
    return {
        league_id: leagueId,
        current_weights: weights,
        last_calibration: weights.last_calibration,
        games_since_calibration: weights.games_since_calibration,
        calibration_accuracy: weights.calibration_accuracy
    };
}

module.exports = {
    getWeights,
    calibrateWeights,
    getCalibrationHistory,
    DEFAULT_WEIGHTS,
    LEAGUE_OVERRIDES
};
