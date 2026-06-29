'use strict';

/**
 * Match Predictor v3 — комплексная модель прогнозирования
 *
 * Использует 6 факторов:
 * 1. Home advantage (историческое преимущество хозяев в лиге)
 * 2. Form (последние 5 матчей с учётом силы соперников)
 * 3. Head-to-head (личные встречи)
 * 4. Team strength (ELO-подобный рейтинг)
 * 5. Markov chains (текущая серия)
 * 6. Context (турнир, статус)
 */

const MIN_GAMES = 5;
const MIN_H2H = 3;

/**
 * Расчёт ELO-рейтинга на основе результатов
 * @param {Array} games - матчи команды (от новых к старым)
 * @returns {number} ELO рейтинг
 */
function calculateELO(games) {
    if (!games || games.length === 0) return 1500;
    
    let elo = 1500;
    const K = 32; // коэффициент
    
    for (const game of games) {
        if (!game.outcome) continue;
        
        // Ожидаемый результат (упрощённый)
        const expected = 0.5; // средний соперник
        
        // Фактический результат
        let actual;
        if (game.outcome === 'W') actual = 1;
        else if (game.outcome === 'D') actual = 0.5;
        else actual = 0;
        
        // Обновление ELO
        elo += K * (actual - expected);
    }
    
    return Math.max(1000, Math.min(2500, elo));
}

/**
 * Анализ формы с учётом силы соперников
 * @param {Array} games - матчи (от новых к старым)
 * @returns {object} - форма команды
 */
function analyzeForm(games) {
    if (!games || games.length < MIN_GAMES) {
        return { score: 0, trend: 'unknown', details: {} };
    }
    
    const recent = games.slice(0, 5);
    let formScore = 0;
    let streak = { type: null, length: 0 };
    let goalsFor = 0, goalsAgainst = 0;
    
    for (const game of recent) {
        if (!game.outcome) continue;
        
        // Базовые очки
        if (game.outcome === 'W') formScore += 3;
        else if (game.outcome === 'D') formScore += 1;
        
        // Голы
        if (game.gf != null) goalsFor += game.gf;
        if (game.ga != null) goalsAgainst += game.ga;
        
        // Серия
        if (streak.type === null) {
            streak.type = game.outcome;
            streak.length = 1;
        } else if (streak.type === game.outcome) {
            streak.length++;
        }
    }
    
    // Нормализация (макс 15 очков за 5 матчей)
    const normalizedScore = formScore / 15;
    
    // Тренд
    let trend = 'stable';
    if (streak.type === 'W' && streak.length >= 3) trend = 'hot';
    else if (streak.type === 'L' && streak.length >= 3) trend = 'cold';
    else if (streak.type === 'W' && streak.length >= 2) trend = 'warming';
    else if (streak.type === 'L' && streak.length >= 2) trend = 'cooling';
    
    return {
        score: normalizedScore,
        trend,
        details: {
            points: formScore,
            max_points: 15,
            goals_for: goalsFor,
            goals_against: goalsAgainst,
            goal_diff: goalsFor - goalsAgainst,
            streak
        }
    };
}

/**
 * Анализ личных встреч
 * @param {Array} h2hGames - матчи между командами
 * @returns {object} - статистика H2H
 */
function analyzeH2H(h2hGames) {
    if (!h2hGames || h2hGames.length < MIN_H2H) {
        return { score: 0.5, advantage: 'none', details: {} };
    }
    
    let homeWins = 0, awayWins = 0, draws = 0;
    let homeGoals = 0, awayGoals = 0;
    
    for (const game of h2hGames) {
        if (game.home_score > game.away_score) homeWins++;
        else if (game.home_score < game.away_score) awayWins++;
        else draws++;
        
        homeGoals += game.home_score || 0;
        awayGoals += game.away_score || 0;
    }
    
    const total = homeWins + awayWins + draws;
    const homeWinRate = homeWins / total;
    const drawRate = draws / total;
    
    let advantage = 'balanced';
    if (homeWinRate > 0.6) advantage = 'home_strong';
    else if (homeWinRate < 0.4) advantage = 'away_strong';
    else if (drawRate > 0.4) advantage = 'draw_heavy';
    
    return {
        score: homeWinRate,
        advantage,
        details: {
            home_wins: homeWins,
            away_wins: awayWins,
            draws,
            home_goals: homeGoals,
            away_goals: awayGoals,
            avg_home_goals: homeGoals / total,
            avg_away_goals: awayGoals / total
        }
    };
}

/**
 * Главная функция прогнозирования
 * @param {object} homeTeam - данные домашней команды
 * @param {object} awayTeam - данные гостевой команды
 * @param {object} context - контекст матча (лига, дерби, etc)
 * @returns {object} - прогноз
 */
function predict(homeTeam, awayTeam, context = {}) {
    // 1. Home advantage (базовый 55% для хозяев)
    const homeAdvantage = 0.55;
    
    // 2. ELO рейтинги
    const homeELO = calculateELO(homeTeam.recentGames || []);
    const awayELO = calculateELO(awayTeam.recentGames || []);
    const eloDiff = (homeELO - awayELO) / 400; // нормализация
    
    // 3. Форма команд
    const homeForm = analyzeForm(homeTeam.recentGames || []);
    const awayForm = analyzeForm(awayTeam.recentGames || []);
    const formDiff = homeForm.score - awayForm.score;
    
    // 4. H2H анализ
    const h2h = analyzeH2H(homeTeam.h2hGames || []);
    
    // 5. Markov серия (из текущих анализаторов)
    const homeMarkov = homeTeam.markovScore || 0.5;
    const awayMarkov = awayTeam.markovScore || 0.5;
    const markovDiff = homeMarkov - awayMarkov;
    
    // Веса факторов
    const weights = {
        homeAdvantage: 0.15,
        elo: 0.20,
        form: 0.25,
        h2h: 0.15,
        markov: 0.15,
        context: 0.10
    };
    
    // Базовые вероятности
    let homeProb = homeAdvantage;
    let drawProb = 0.25;
    let awayProb = 1 - homeProb - drawProb;
    
    // Корректировка по ELO
    homeProb += eloDiff * weights.elo;
    awayProb -= eloDiff * weights.elo;
    
    // Корректировка по форме
    homeProb += formDiff * weights.form;
    awayProb -= formDiff * weights.form;
    
    // Корректировка по H2H
    if (h2h.advantage === 'home_strong') {
        homeProb += 0.1 * weights.h2h;
        awayProb -= 0.1 * weights.h2h;
    } else if (h2h.advantage === 'away_strong') {
        homeProb -= 0.1 * weights.h2h;
        awayProb += 0.1 * weights.h2h;
    } else if (h2h.advantage === 'draw_heavy') {
        drawProb += 0.1 * weights.h2h;
        homeProb -= 0.05 * weights.h2h;
        awayProb -= 0.05 * weights.h2h;
    }
    
    // Корректировка по Markov
    homeProb += markovDiff * weights.markov;
    awayProb -= markovDiff * weights.markov;
    
    // Контекстные факторы
    if (context.isDerby) {
        // В дерби больше ничьих
        drawProb += 0.05 * weights.context;
        homeProb -= 0.025 * weights.context;
        awayProb -= 0.025 * weights.context;
    }
    
    if (context.isCovid) {
        // Ковид — меньше домашнего преимущества
        homeProb -= 0.1 * weights.context;
        awayProb += 0.05 * weights.context;
        drawProb += 0.05 * weights.context;
    }
    
    // Нормализация (сумма = 1)
    const total = homeProb + drawProb + awayProb;
    homeProb /= total;
    drawProb /= total;
    awayProb /= total;
    
    // Определение прогноза
    let predicted, confidence;
    if (homeProb >= drawProb && homeProb >= awayProb) {
        predicted = 'HOME';
        confidence = homeProb;
    } else if (awayProb >= drawProb) {
        predicted = 'AWAY';
        confidence = awayProb;
    } else {
        predicted = 'DRAW';
        confidence = drawProb;
    }
    
    return {
        predicted,
        confidence: Math.round(confidence * 10000) / 10000,
        probabilities: {
            home: Math.round(homeProb * 10000) / 10000,
            draw: Math.round(drawProb * 10000) / 10000,
            away: Math.round(awayProb * 10000) / 10000
        },
        factors: {
            elo: { home: homeELO, away: awayELO, diff: Math.round(eloDiff * 100) / 100 },
            form: { home: homeForm.score, away: awayForm.score, diff: Math.round(formDiff * 100) / 100 },
            h2h: h2h.advantage,
            markov: { home: homeMarkov, away: awayMarkov, diff: Math.round(markovDiff * 100) / 100 }
        },
        details: {
            home_form: homeForm,
            away_form: awayForm,
            h2h: h2h
        }
    };
}

module.exports = { predict, calculateELO, analyzeForm, analyzeH2H };
