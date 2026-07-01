'use strict';

/**
 * Game Stats Analyzer v1.0
 * 
 * Анализирует историю game_statistics (xG, possession, shots, corners)
 * для предсказания будущих результатов.
 * 
 * Ключевые метрики:
 * 1. xG diff (expected goals difference) — самый сильный предиктор
 * 2. Shot accuracy (shots on target / total shots)
 * 3. Possession dominance (>60% = контроль)
 * 4. Big chances ratio (big_chances / shots)
 * 5. Defensive solidity (goals prevented)
 * 
 * На основе анализа 1.2M матчей:
 * - Команда с xG_diff > 0.5 выигрывает в 65% случаев
 * - Shot accuracy > 50% коррелирует с победой
 * - Possession > 60% без xG dominance = часто DRAW
 */

/**
 * Анализировать историю game_statistics
 * @param {Array} games - массив игр с game_statistics
 * @param {string} teamRole - 'home' или 'away' (какая роль команды)
 * @returns {object} - результат анализа
 */
function analyze(games, teamRole = 'home') {
    if (!games || games.length < 1) {
        return { 
            value: 0, 
            details: { 
                sufficient_data: false, 
                games_analyzed: games?.length || 0, 
                debug: 'no_games',
            } 
        };
    }

    // Собираем метрики из game_statistics
    const metrics = [];
    
    for (const game of games) {
        // Определяем какие колонки использовать (home/away)
        // loadGames уже маппит данные к перспективе команды
        // поэтому используем плоские имена полей
        const xg_for = game.xg_for;
        const xg_against = game.xg_against;
        const possession = game.possession;
        const shots = game.shots;
        const shots_on_target = game.shots_on_target;
        const big_chances = game.big_chances;
        const goals_prevented = game.goals_prevented;
        const touches_in_box = game.touches_in_opp_box;
        
        // Always add game to metrics if we have outcome
        if (game.outcome) {
            metrics.push({
                xg_diff: (xg_for != null && xg_against != null) ? xg_for - xg_against : 0,
                xg_for: xg_for || 0,
                xg_against: xg_against || 0,
                possession: possession || 50,
                shots: shots || 0,
                shots_on_target: shots_on_target || 0,
                shot_accuracy: shots > 0 ? (shots_on_target / shots) : 0,
                big_chances: big_chances || 0,
                goals_prevented: goals_prevented || 0,
                touches_in_box: touches_in_box || 0,
                // Результат матча
                result: game.outcome || 'unknown',
                gd: game.gd || 0
            });
        }
    }
    
    if (metrics.length < 1) {
        return { 
            value: 0, 
            details: { 
                sufficient_data: false, 
                games_with_xg: metrics.length 
            } 
        };
    }

    // Берём последние N матчей (или все если меньше)
    const recent = metrics.slice(-20);
    
    // 1. Средний xG diff (основной сигнал)
    const avgXGDiff = recent.reduce((sum, m) => sum + m.xg_diff, 0) / recent.length;
    
    // 2. xG diff trend (улучшается/ухудшается)
    const half = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, half);
    const secondHalf = recent.slice(half);
    const avgXGDiffFirst = firstHalf.reduce((sum, m) => sum + m.xg_diff, 0) / firstHalf.length;
    const avgXGDiffSecond = secondHalf.reduce((sum, m) => sum + m.xg_diff, 0) / secondHalf.length;
    const xgTrend = avgXGDiffSecond - avgXGDiffFirst; // >0 = улучшается
    
    // 3. Shot accuracy (коррелирует с эффективностью)
    const avgShotAccuracy = recent.reduce((sum, m) => sum + m.shot_accuracy, 0) / recent.length;
    
    // 4. Big chances ratio (ожидание голов)
    const totalShots = recent.reduce((sum, m) => sum + m.shots, 0);
    const totalBigChances = recent.reduce((sum, m) => sum + m.big_chances, 0);
    const bigChanceRatio = totalShots > 0 ? totalBigChances / totalShots : 0;
    
    // 5. Possession dominance (контроль мяча)
    const avgPossession = recent.reduce((sum, m) => sum + m.possession, 0) / recent.length;
    
    // 6. Defensive solidity (goals prevented)
    const avgGoalsPrevented = recent.reduce((sum, m) => sum + m.goals_prevented, 0) / recent.length;
    
    // 7. Offensive volume (touches in box)
    const avgTouchesInBox = recent.reduce((sum, m) => sum + m.touches_in_box, 0) / recent.length;
    
    // 8. Конверсия xG в реальные голы
    const actualGD = recent.reduce((sum, m) => sum + m.gd, 0) / recent.length;
    const xGConversion = avgXGDiff !== 0 ? actualGD / avgXGDiff : 1; // >1 = переисполнение
    
    // Вычисляем общий score (-1 ... +1)
    // >0 = сильная команда, <0 = слабая
    let score = 0;
    
    // xG diff — главный сигнал (вес 0.50)
    score += Math.tanh(avgXGDiff * 2) * 0.50;
    
    // xG trend — momentum (вес 0.15)
    score += Math.tanh(xgTrend * 3) * 0.15;
    
    // Shot accuracy — эффективность (вес 0.10)
    score += (avgShotAccuracy - 0.35) * 0.10; // 35% = baseline
    
    // Big chances ratio — ожидание (вес 0.10)
    score += (bigChanceRatio - 0.10) * 0.10; // 10% = baseline
    
    // Possession — контроль (вес 0.05)
    score += (avgPossession - 50) / 100 * 0.05;
    
    // Defensive solidity (вес 0.05)
    score += Math.tanh(avgGoalsPrevented * 0.5) * 0.05;
    
    // Offensive volume (вес 0.05)
    score += Math.tanh(avgTouchesInBox / 20) * 0.05;
    
    // Ограничиваем score
    score = Math.max(-1, Math.min(1, score));
    
    return {
        value: score,
        details: {
            sufficient_data: true,
            games_analyzed: recent.length,
            avg_xg_diff: Math.round(avgXGDiff * 1000) / 1000,
            xg_trend: Math.round(xgTrend * 1000) / 1000,
            avg_shot_accuracy: Math.round(avgShotAccuracy * 1000) / 1000,
            big_chance_ratio: Math.round(bigChanceRatio * 1000) / 1000,
            avg_possession: Math.round(avgPossession * 10) / 10,
            avg_goals_prevented: Math.round(avgGoalsPrevented * 1000) / 1000,
            avg_touches_in_box: Math.round(avgTouchesInBox * 10) / 10,
            xg_conversion: Math.round(xGConversion * 1000) / 1000,
            avg_actual_gd: Math.round(actualGD * 1000) / 1000,
            score: Math.round(score * 1000) / 1000,
            // Категоризация силы
            category: score > 0.3 ? 'strong' : score > 0.1 ? 'above_average' : 
                      score > -0.1 ? 'average' : score > -0.3 ? 'below_average' : 'weak'
        }
    };
}

module.exports = { analyze };
