'use strict';

const { getLeagueParams, getLeagueRho, getLeagueDrawBoost } = require('../utils/league-params');

/**
 * Poisson Analyzer (Dixon-Coles model)
 *
 * Статистическая модель прогноза футбола на основе распределения Пуассона.
 * Источник: Maher (1982), Dixon-Coles (1997).
 *
 * Формула:
 *   λ_home = attack_home × defense_away × avg_home_goals
 *   λ_away = attack_away × defense_home × avg_away_goals
 *
 *   P(score = k:j) = Poisson(k, λ_home) × Poisson(j, λ_away) × τ(k, j, λ_home, λ_away, ρ)
 *
 *   P(HOME) = Σ_{k>j} P(k:j)
 *   P(DRAW) = Σ_{k=j} P(k:j)
 *   P(AWAY) = Σ_{k<j} P(k:j)
 *
 * Dixon-Coles коррекция τ для низких счетов:
 *   τ(0,0) = 1 - λ_home×λ_away×ρ
 *   τ(1,0) = 1 + λ_away×ρ
 *   τ(0,1) = 1 + λ_home×ρ
 *   τ(1,1) = 1 - ρ
 *   τ(k,j) = 1 для остальных
 *
 * ρ = -0.1 (типичное значение для футбола — корректирует ничьи)
 *
 * Вход: массив матчей команды (gf, ga, venue) + массив соперника
 * Выход: {value, confidence, details: {lambda_home, lambda_away, probabilities, predicted_score}}
 */

const MAX_GOALS = 10; // максимальное количество голов для суммирования

/**
 * Факториал (для Poisson PMF)
 */
function factorial(n) {
    if (n <= 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
}

/**
 * Poisson PMF: P(X = k) = (λ^k × e^(-λ)) / k!
 */
function poissonPMF(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}

/**
 * Dixon-Coles коррекция τ
 */
function dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
    if (homeGoals === 0 && awayGoals === 0) {
        return 1 - lambdaHome * lambdaAway * rho;
    }
    if (homeGoals === 1 && awayGoals === 0) {
        return 1 + lambdaAway * rho;
    }
    if (homeGoals === 0 && awayGoals === 1) {
        return 1 + lambdaHome * rho;
    }
    if (homeGoals === 1 && awayGoals === 1) {
        return 1 - rho;
    }
    return 1;
}

/**
 * Главная функция анализатора.
 *
 * @param {Array} homeGames — последние N матчей home команды
 *   Каждая игра: { gf, ga, venue: 'home'|'away' }
 * @param {Array} awayGames — последние N матчей away команды
 * @param {Object} leagueParams — { avgHomeGoals, avgAwayGoals } (опц., default 1.52/1.32)
 * @param {number|string} [leagueId] — League ID for league-specific params
 * @param {string} [season] — Season for league-specific params
 * @returns {{value, confidence, details}}
 */
function analyze(homeGames, awayGames, leagueParams = {}, leagueId = null, season = null) {
    // Get league-specific parameters or fallback to defaults
    const leagueSpecific = leagueId ? getLeagueParams(leagueId, season) : null;
    const RHO = leagueId ? getLeagueRho(leagueId) : -0.10;
    const drawBoostMultiplier = leagueId ? getLeagueDrawBoost(leagueId) : 1.0;

    const avgHomeGoals = leagueSpecific?.avg_home_goals ?? leagueParams.avgHomeGoals ?? 1.52;
    const avgAwayGoals = leagueSpecific?.avg_away_goals ?? leagueParams.avgAwayGoals ?? 1.32;
    const MIN_GAMES = 6;

    if (!Array.isArray(homeGames) || homeGames.length < MIN_GAMES ||
        !Array.isArray(awayGames) || awayGames.length < MIN_GAMES) {
        return {
            value: 0,
            confidence: 0,
            details: {
                error: 'insufficient_data',
                home_games: homeGames ? homeGames.length : 0,
                away_games: awayGames ? awayGames.length : 0,
                required: MIN_GAMES,
            },
        };
    }

    // 1. Считаем attack/defense для home команды
    // Разделяем по venue: home_attack, home_defense, away_attack, away_defense
    let homeGF_home = 0, homeGA_home = 0, homeGamesHome = 0;
    let homeGF_away = 0, homeGA_away = 0, homeGamesAway = 0;

    for (const g of homeGames) {
        if (g.venue === 'home' || (g.xg_for != null && g.gd != null)) {
            // Используем venue если есть, иначе считаем по данным
            const venue = g.venue || 'any';
            if (venue === 'home') {
                homeGF_home += (g.gf || 0);
                homeGA_home += (g.ga || 0);
                homeGamesHome++;
            } else if (venue === 'away') {
                homeGF_away += (g.gf || 0);
                homeGA_away += (g.ga || 0);
                homeGamesAway++;
            }
        }
    }

    // Если venue не определён — используем все матчи
    if (homeGamesHome === 0 && homeGamesAway === 0) {
        homeGF_home = homeGames.reduce((s, g) => s + (g.gf || 0), 0);
        homeGA_home = homeGames.reduce((s, g) => s + (g.ga || 0), 0);
        homeGamesHome = homeGames.length;
        homeGF_away = homeGF_home;
        homeGA_away = homeGA_home;
        homeGamesAway = homeGames.length;
    }

    // 2. Считаем attack/defense для away команды
    let awayGF_home = 0, awayGA_home = 0, awayGamesHome = 0;
    let awayGF_away = 0, awayGA_away = 0, awayGamesAway = 0;

    for (const g of awayGames) {
        const venue = g.venue || 'any';
        if (venue === 'home') {
            awayGF_home += (g.gf || 0);
            awayGA_home += (g.ga || 0);
            awayGamesHome++;
        } else if (venue === 'away') {
            awayGF_away += (g.gf || 0);
            awayGA_away += (g.ga || 0);
            awayGamesAway++;
        }
    }

    if (awayGamesHome === 0 && awayGamesAway === 0) {
        awayGF_home = awayGames.reduce((s, g) => s + (g.gf || 0), 0);
        awayGA_home = awayGames.reduce((s, g) => s + (g.ga || 0), 0);
        awayGamesHome = awayGames.length;
        awayGF_away = awayGF_home;
        awayGA_away = awayGA_home;
        awayGamesAway = awayGames.length;
    }

    // 3. Вычисляем относительные attack/defense (нормированные к лиге)
    // attack = avg_goals_for / league_avg_goals (>1 = выше среднего)
    // defense = avg_goals_against / league_avg_goals (>1 = слабее среднего)

    // Home команда — играет дома, используем home stats
    const homeAttack = homeGamesHome > 0 ? (homeGF_home / homeGamesHome) / avgHomeGoals : 1.0;
    const homeDefense = homeGamesHome > 0 ? (homeGA_home / homeGamesHome) / avgHomeGoals : 1.0;

    // Away команда — играет в гостях, используем away stats
    const awayAttack = awayGamesAway > 0 ? (awayGF_away / awayGamesAway) / avgAwayGoals : 1.0;
    const awayDefense = awayGamesAway > 0 ? (awayGA_away / awayGamesAway) / avgAwayGoals : 1.0;

    // Также считаем "обратные" — home команда в гостях, away команда дома
    const homeAwayAttack = homeGamesAway > 0 ? (homeGF_away / homeGamesAway) / avgAwayGoals : homeAttack;
    const homeAwayDefense = homeGamesAway > 0 ? (homeGA_away / homeGamesAway) / avgAwayGoals : homeDefense;
    const awayHomeAttack = awayGamesHome > 0 ? (awayGF_home / awayGamesHome) / avgHomeGoals : awayAttack;
    const awayHomeDefense = awayGamesHome > 0 ? (awayGA_home / awayGamesHome) / avgHomeGoals : awayDefense;

    // 4. Вычисляем λ (ожидаемые голы)
    // λ_home = home_attack × away_defense × avg_home_goals
    // λ_away = away_attack × home_defense × avg_away_goals
    //
    // Используем venue-specific: home команда использует home stats, away — away stats
    // Но также усредняем с общими stats для стабильности

    const lambdaHome = Math.max(0.1, homeAttack * awayDefense * avgHomeGoals * 0.6 +
        (homeGF_home / Math.max(homeGamesHome, 1)) * 0.4);
    const lambdaAway = Math.max(0.1, awayAttack * homeDefense * avgAwayGoals * 0.6 +
        (awayGF_away / Math.max(awayGamesAway, 1)) * 0.4);

    // 5. Считаем вероятности всех счетов с Dixon-Coles коррекцией
    let pHome = 0, pDraw = 0, pAway = 0;
    let maxProb = 0;
    let predictedScore = { home: 0, away: 0, prob: 0 };

    for (let h = 0; h <= MAX_GOALS; h++) {
        for (let a = 0; a <= MAX_GOALS; a++) {
            const tau = dixonColesTau(h, a, lambdaHome, lambdaAway, RHO);
            const p = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway) * tau;

            if (h > a) pHome += p;
            else if (h === a) pDraw += p;
            else pAway += p;

            if (p > maxProb) {
                maxProb = p;
                predictedScore = { home: h, away: a, prob: p };
            }
        }
    }

    // Нормализуем (сумма может быть != 1 из-за Dixon-Coles)
    const total = pHome + pDraw + pAway;
    if (total > 0) {
        pHome /= total;
        pDraw /= total;
        pAway /= total;
    }

    // 5b. Draw boost: when λ_home ≈ λ_away, increase P(DRAW)
    // Phase 1.1: enhanced draw boost with wider threshold and quadratic formula
    const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
    const DRAW_THRESHOLD = 0.40;  // Phase 1.4: уже охват для баланса
    const DRAW_CAP = 0.20;        // Phase 1.4: меньше агрессивность
    
    if (lambdaDiff < DRAW_THRESHOLD) {
        // Квадратичная формула: больше boost для очень близких lambda
        const closenessBoost = Math.pow((DRAW_THRESHOLD - lambdaDiff) / DRAW_THRESHOLD, 1.5);
        const baseDrawBoost = Math.min(DRAW_CAP, closenessBoost * 0.35);
        const drawBoost = baseDrawBoost * drawBoostMultiplier;
        pDraw += drawBoost;
        const sumOther = pHome + pAway;
        if (sumOther > 0) {
            pHome -= drawBoost * (pHome / sumOther);
            pAway -= drawBoost * (pAway / sumOther);
        }
    }

    // 6. Определяем прогноз
    // Phase 1.3: confidence threshold для DRAW (предсказываем только при уверенности ≥35%)
    let predicted, confidence;
    const DRAW_CONFIDENCE_THRESHOLD = 0.35;
    
    if (pHome >= pDraw && pHome >= pAway) {
        predicted = 'HOME';
        confidence = pHome;
    } else if (pAway >= pDraw) {
        predicted = 'AWAY';
        confidence = pAway;
    } else if (pDraw >= DRAW_CONFIDENCE_THRESHOLD) {
        // DRAW только если уверенность ≥35%
        predicted = 'DRAW';
        confidence = pDraw;
    } else {
        // Низкая уверенность в DRAW → выбираем между HOME/AWAY
        predicted = pHome > pAway ? 'HOME' : 'AWAY';
        confidence = Math.max(pHome, pAway);
    }

    // 7. Value = вероятность предсказанного исхода
    const value = confidence;

    // 8. Confidence data factor (растёт с количеством матчей)
    const dataConfidence = Math.min(1, Math.min(homeGames.length, awayGames.length) / 20);

    return {
        value: Math.round(value * 10000) / 10000,
        confidence: dataConfidence,
        details: {
            lambda_home: Math.round(lambdaHome * 100) / 100,
            lambda_away: Math.round(lambdaAway * 100) / 100,
            probabilities: {
                home: Math.round(pHome * 10000) / 10000,
                draw: Math.round(pDraw * 10000) / 10000,
                away: Math.round(pAway * 10000) / 10000,
            },
            predicted_outcome: predicted,
            predicted_confidence: Math.round(confidence * 10000) / 10000,
            predicted_score: predictedScore,
            attack_defense: {
                home_attack: Math.round(homeAttack * 1000) / 1000,
                home_defense: Math.round(homeDefense * 1000) / 1000,
                away_attack: Math.round(awayAttack * 1000) / 1000,
                away_defense: Math.round(awayDefense * 1000) / 1000,
            },
            league_params: leagueSpecific ? {
                avg_home_goals: avgHomeGoals,
                avg_away_goals: avgAwayGoals,
                rho: RHO,
                draw_boost_multiplier: drawBoostMultiplier,
                source: 'league_specific'
            } : {
                avg_home_goals: avgHomeGoals,
                avg_away_goals: avgAwayGoals,
                source: 'defaults'
            },
            games_used: {
                home_home: homeGamesHome,
                home_away: homeGamesAway,
                away_home: awayGamesHome,
                away_away: awayGamesAway,
            },
        },
    };
}

module.exports = {
    name: 'poisson',
    minGames: 6,
    analyze,
    poissonPMF,
    dixonColesTau,
};
