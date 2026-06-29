# Patterns — паттерны кода в проекте

> Стандартные паттерны которые повторяются по проекту. При написании нового кода — следовать этим паттернам.

## Резолвинг ID (game / team / league)

```sql
-- Резолв через sstats_id ИЛИ internal id, с приоритетом sstats и last_updated
SELECT g.id, g.sstats_id, g.home_team_id, g.away_team_id, ...
FROM games g
WHERE g.sstats_id = $1 OR g.id = $1
ORDER BY (g.sstats_id = $1) DESC, g.last_updated DESC NULLS LAST
LIMIT 1
```

То же для teams и leagues:
```sql
WHERE sstats_id = $1 OR id = $1
ORDER BY (sstats_id = $1) DESC, id ASC
LIMIT 1
```

(Для teams и leagues `last_updated` может отсутствовать — используем `id ASC` или `id DESC` по контексту.)

## Загрузка истории команды

```js
async function loadGames(teamId, beforeDate, leagueFilter, n) {
    const sql = `
        SELECT g.home_team_id, g.away_team_id, g.home_score, g.away_score,
               gs.expected_goals_home, gs.expected_goals_away, g.date
        FROM games g
        LEFT JOIN game_statistics gs ON gs.game_id = g.id
        WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
          AND g.is_deleted = false AND g.status = 'finished'
          AND g.date < $3
          AND ($4::int IS NULL OR g.league_id = $4)
        ORDER BY g.date DESC
        LIMIT $2`;
    const { rows } = await db.query(sql, [teamId, n, beforeDate, leagueFilter]);
    return rows.map(r => {
        const isHome = r.home_team_id === teamId;
        const gf = isHome ? r.home_score : r.away_score;
        const ga = isHome ? r.away_score : r.home_score;
        let outcome = null;
        if (gf != null && ga != null) {
            if (gf > ga) outcome = 'W';
            else if (gf < ga) outcome = 'L';
            else outcome = 'D';
        }
        const xgH = r.expected_goals_home != null ? Number(r.expected_goals_home) : null;
        const xgA = r.expected_goals_away != null ? Number(r.expected_goals_away) : null;
        return {
            outcome, gf, ga,
            gd: gf != null && ga != null ? gf - ga : null,
            xg_for: isHome ? xgH : xgA,
            xg_against: isHome ? xgA : xgH,
            xg_diff: xgH != null && xgA != null ? (isHome ? xgH - xgA : xgA - xgH) : null,
            venue: isHome ? 'home' : 'away',  // ⚠️ ОБЯЗАТЕЛЬНО для Poisson
        };
    });
}
```

## Прогон анализаторов параллельно

```js
const modules = {
    markov_outcome:  require('../../analytics/analyzers/markov-outcome.js'),
    markov_state:    require('../../analytics/analyzers/markov-state.js'),
    shannon_entropy: require('../../analytics/analyzers/shannon-entropy.js'),
    form_inertia:    require('../../analytics/analyzers/form-inertia.js'),
    multipeak:       require('../../analytics/analyzers/multipeak-density.js'),
};
const aPoisson = require('../../analytics/analyzers/poisson.js');

const homeResults = {};
const awayResults = {};

for (const a of config.analyzers) {
    if (!a.enabled) continue;
    if (a.name === 'hmm') continue; // HMM async через Python
    if (a.name === 'poisson') continue; // Poisson требует обе команды
    const mod = modules[a.name];
    if (!mod) continue;
    homeResults[a.name] = mod.analyze(homeGames);
    awayResults[a.name] = mod.analyze(awayGames);
}

// Poisson — единожды для пары (home, away)
const poissonConf = config.analyzers.find(a => a.name === 'poisson' && a.enabled);
if (poissonConf) {
    homeResults.poisson = aPoisson.analyze(homeGames, awayGames, {
        avgHomeGoals: 1.52,
        avgAwayGoals: 1.32
    });
}

// HMM — async через Python
const hmmConf = config.analyzers.find(a => a.name === 'hmm' && a.enabled);
if (hmmConf) {
    const pythonClient = require('../../analytics/python-client.js');
    const [homeHmm, awayHmm] = await Promise.allSettled([
        pythonClient.getTeamAnalyzer('hmm', game.home_team_id, { nWindow: n }),
        pythonClient.getTeamAnalyzer('hmm', game.away_team_id, { nWindow: n }),
    ]);
    homeResults.hmm = homeHmm.status === 'fulfilled' ? homeHmm.value : null;
    awayResults.hmm = awayHmm.status === 'fulfilled' ? awayHmm.value : null;
}
```

## Integrated Forecast v4 (взвешенное голосование)

```js
let homeScore = 0, drawScore = 0, awayScore = 0;

// Poisson base (weight 0.60)
const poissonRes = homeResults.poisson;
if (poissonRes && poissonRes.details && !poissonRes.details.error) {
    const probs = poissonRes.details.probabilities || {};
    homeScore += (probs.home || 0.333) * 0.60;
    drawScore += (probs.draw || 0.333) * 0.60;
    awayScore += (probs.away || 0.333) * 0.60;
} else {
    homeScore += 0.333 * 0.60;
    drawScore += 0.333 * 0.60;
    awayScore += 0.333 * 0.60;
}

// Momentum (weight 0.15)
const homeStreak = homeResults.markov_outcome?.details?.streak || {};
const awayStreak = awayResults.markov_outcome?.details?.streak || {};
if (homeStreak.current_outcome === 'W' && homeStreak.current_length >= 3) homeScore += 0.15 * 0.5;
else if (homeStreak.current_outcome === 'L' && homeStreak.current_length >= 3) awayScore += 0.15 * 0.5;
if (awayStreak.current_outcome === 'W' && awayStreak.current_length >= 3) awayScore += 0.15 * 0.7;
else if (awayStreak.current_outcome === 'L' && awayStreak.current_length >= 3) homeScore += 0.15 * 0.5;

// HMM (weight 0.15)
if (homeResults.hmm && awayResults.hmm) {
    const homeExp = homeResults.hmm.details?.expected_next_level ?? 1;
    const awayExp = awayResults.hmm.details?.expected_next_level ?? 1;
    const hmmAdv = (homeExp - awayExp) / 3;
    if (hmmAdv > 0) homeScore += hmmAdv * 0.15;
    else if (hmmAdv < 0) awayScore += Math.abs(hmmAdv) * 0.15;
    if (Math.abs(hmmAdv) < 0.1) drawScore += 0.15 * 0.2;
}

// Form inertia (weight 0.10)
const homeFI = homeResults.form_inertia;
const awayFI = awayResults.form_inertia;
if (homeFI?.details && awayFI?.details) {
    const hLag1 = homeFI.details.lag1_corr || 0;
    const aLag1 = awayFI.details.lag1_corr || 0;
    const hMean = homeFI.details.mean_value || 0;
    const aMean = awayFI.details.mean_value || 0;
    if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean > 0.3) homeScore += 0.10 * Math.min(hLag1, 1);
    else if (homeFI.details.trend === 'persistent' && hLag1 > 0.15 && hMean < -0.3) awayScore += 0.10 * Math.min(hLag1, 1);
    if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean > 0.3) awayScore += 0.10 * Math.min(aLag1, 1);
    else if (awayFI.details.trend === 'persistent' && aLag1 > 0.15 && aMean < -0.3) homeScore += 0.10 * Math.min(aLag1, 1);
}

// Determine outcome
let predictedOutcome, confidence;
const totalScore = homeScore + drawScore + awayScore;
if (totalScore > 0) {
    const normH = homeScore / totalScore;
    const normD = drawScore / totalScore;
    const normA = awayScore / totalScore;
    if (normH >= normD && normH >= normA) { predictedOutcome = 'HOME'; confidence = normH; }
    else if (normA >= normD) { predictedOutcome = 'AWAY'; confidence = normA; }
    else { predictedOutcome = 'DRAW'; confidence = normD; }
} else {
    predictedOutcome = 'DRAW'; confidence = 0.33;
}
```

## Fastify route с error handling

```js
fastify.get('/games/:id/analyzers', async (request, reply) => {
    try {
        const idRaw = request.params.id;
        const id = parseInt(idRaw, 10);
        if (!Number.isFinite(id) || id <= 0) {
            return reply.code(400).send({ success: false, error: 'Invalid id' });
        }

        // ... основная логика ...

        return {
            success: true,
            data: { /* ... */ },
            source: 'live',
        };
    } catch (err) {
        request.log.error({ err }, 'analyzers failed');
        return reply.code(500).send({
            success: false,
            error: 'Failed',
            message: err.message,
        });
    }
});
```

## Cron job регистрация

```js
// src/jobs/scheduled-jobs.js
function registerJobs(scheduler, db) {
    // ...
    scheduler.register({
        name: 'compute_python_analyzers',
        schedule: '45 4 * * *',  // ежедневно 4:45
        handler: async () => {
            const job = require('./compute-python-analyzers.js');
            await job.run(db);
        },
    });
    // ...
}
```

Имя файла: `compute-<что-делает>.js`. Файл экспортирует функцию `run(db)`.

## БД миграция через файл

```bash
# 1. Создать SQL файл локально
cat > /tmp/migration.sql <<'EOF'
CREATE TABLE IF NOT EXISTS new_table (
    id SERIAL PRIMARY KEY,
    ...
);
EOF

# 2. Залить в контейнер
docker cp /tmp/migration.sql rolgi-postgres:/tmp/

# 3. Применить
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -f /tmp/migration.sql

# 4. Проверить
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -c "\d new_table"
```

## API smoke-test после правок

```bash
# 1. Syntax check
docker exec rolgi-api node -c /app/src/api/routes/<file>.js

# 2. Restart
docker restart rolgi-api && sleep 12

# 3. Smoke test
curl -sk "https://rolgi.com/api/db/<endpoint>" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('success:', d.get('success'))
print('keys:', list(d.get('data', {}).keys())[:5])
"

# 4. Логи на ошибки
docker logs rolgi-api --since 1m 2>&1 | grep -i error | tail -5
```

## Бэкап перед правкой

```bash
cp file.js file.js.bak.<reason>.$(date +%s)
```

Где reason — короткое описание (`poissonv4`, `bugfix`, `refactor`).

## Запись в reports

```markdown
## [<UTC timestamp>] <task> — Step <N>

**Agent:** worker (model: nemotron-3-ultra)
**Status:** OK | PARTIAL | FAILED | BLOCKED

### Что сделано
- ...

### Команды
- `<cmd>` → exit 0 (✅) или exit 1 (❌)

### Изменённые файлы
- `path/to/file.js` — <описание>

### Результаты
- Backtest accuracy: 42.5% (44/100)
- Confidence ≥ 0.80: 6/100, accuracy 66.7%

### Следующий шаг
- ...

---
```
