# Gotchas — подводные камни

> Тонкие моменты которые легко упустить. Дополняем по мере обнаружения.

## SSH сессии bifrost

### Connection timeouts

SSH соединение может таймаутить. Симптом: `SSH connect timed out after 15000ms`.

**Решение:**
1. `bifrost_disconnect()` — закрыть упавшее
2. `bifrost_connect()` — переподключиться
3. Если не помогает — подождать 30-60s и попробовать снова

### Suspicious unicode в командах

Bifrost блокирует команды с emoji или некоторыми unicode символами. Симптом: `Error: command contains suspicious unicode characters`.

**Решение:** Использовать `bifrost_upload` для загрузки файла вместо передачи через `bifrost_exec` с heredoc.

## SQL и БД

### Heredoc с переменными shell

```bash
# ❌ Неправильно — shell интерполирует $var и ломает SQL
docker exec rolgi-postgres psql -c "
SELECT * FROM games WHERE id = $var;
"

# ✅ Правильно
echo "SELECT * FROM games WHERE id = 123;" > /tmp/q.sql
docker cp /tmp/q.sql rolgi-postgres:/tmp/
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -f /tmp/q.sql
```

### NULL в ORDER BY

```sql
-- ❌ NULLs могут оказаться в начале или конце в зависимости от настроек
ORDER BY last_updated DESC

-- ✅ Явно указываем
ORDER BY last_updated DESC NULLS LAST
```

## Node.js и анализаторы

### Poisson требует venue в каждой игре

```js
// ❌ Без venue — Poisson вернёт некорректный результат
return { outcome, gf, ga, gd, xg_for, xg_against, xg_diff };

// ✅ С venue
return {
    outcome, gf, ga, gd, xg_for, xg_against, xg_diff,
    venue: isHome ? 'home' : 'away',
};
```

### Анализаторы требуют минимум N матчей

| Анализатор | minGames |
|------------|----------|
| poisson | 6 |
| markov_outcome | 5 |
| form_inertia | 6 |
| game_stats | 5 |

Если матчей меньше — анализатор возвращает `{ error: 'insufficient_data' }`.

### HMM через Python — может не ответить

Python analytics service может быть оверлоадед или закэшированный результат может быть устаревшим. Всегда оборачивать в try/catch:

```js
const [homeHmm, awayHmm] = await Promise.allSettled([
    pythonClient.getTeamAnalyzer('hmm', game.home_team_id, { nWindow: n }),
    pythonClient.getTeamAnalyzer('hmm', game.away_team_id, { nWindow: n }),
]);
homeResults.hmm = homeHmm.status === 'fulfilled' ? homeHmm.value : null;
```

## Docker

### Restart timing

После `docker restart rolgi-api`:
- Контейнер запускается ~3-5 секунд
- Healthcheck проходит ещё через ~7 секунд
- Итого: `sleep 12` минимум

### Логи только из этой сессии запуска

```bash
# ❌ Покажет логи всех запусков
docker logs rolgi-api 2>&1 | grep error

# ✅ Только текущий запуск
docker logs rolgi-api --since 5m 2>&1 | grep error
```

## API тесты

### --max-time для долгих запросов

Бэктест на 100+ матчей может занять 60+ секунд:

```bash
# ❌ По умолчанию timeout curl ~60s, может оборваться
curl -sk -X POST "https://rolgi.com/api/strategies/backtest" -d @payload.json

# ✅ Явный timeout
curl -sk --max-time 90 -X POST ...
```

### Content-Type обязателен для POST

```bash
# ❌ Fastify вернёт 400 Bad Request
curl -sk -X POST -d '{"a":1}' ...

# ✅
curl -sk -X POST -H "Content-Type: application/json" -d '{"a":1}' ...
```

## OpenCode-специфичные

### bifrost timeout vs command timeout

В bifrost_exec параметр `timeout` — это **общий timeout команды**, не sleep между exec'ами. Default 30000ms (30s).

Для долгих команд (бэктест, миграции БД) — увеличить:
```javascript
bifrost_exec({ command: "...", timeout: 90000 })  // 90s
```

### opencode на Windows + path

Пути в bifrost — это *remote* пути (Linux), но в bash tool — *local* (Windows).

Не путать:
- `/srv/projects/rolgi/...` — на сервере
- `C:\Users\bkfon\AppData\Local\Temp\opencode\...` — локально

### Memory file paths

Все ссылки в `.opencode-memory/*.md` должны быть **относительными** от корня `.opencode-memory/`. Это позволяет читать память на любой машине.

## Данные

### Sezon в games

`games.season` — год начала сезона (для EPL 2024-2025 → season=2024).

### sstats_id для лиг

Топ-лиги:
- 39 — Premier League (EPL)
- 140 — La Liga
- 135 — Serie A
- 78 — Bundesliga
- 61 — Ligue 1
- 88 — Eredivisie

### Avg goals разные по лигам

Хардкод 1.52/1.32 — это EPL. Для La Liga ~1.4/1.1, для Bundesliga ~1.7/1.3. Для других лиг (низкие лиги, кубки) — могут сильно отличаться.

Это причина почему нужна per-league калибровка (P1 приоритет).

---

## Шаблон для новых gotcha

```markdown
## <Категория>: <название>

**Симптом / Признак:** ...
**Объяснение:** ...
**Что делать:** ...
**Пример кода:** ...
```
