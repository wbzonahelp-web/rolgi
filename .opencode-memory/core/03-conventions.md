# Golden Rules — НИКОГДА не нарушать

> Эти правила выработаны на основе опыта работы с проектом. Нарушение ведёт к поломкам.

## Перед правкой файла

### 1. Обязательный бэкап

```bash
cp file.js file.js.bak.<краткое-описание>.$(date +%s)
```

Примеры:
- `cp strategies-routes.js strategies-routes.js.bak.poissonv4.1782400123`
- `cp db-routes.js db-routes.js.bak.integrated-forecast.1782400456`

### 2. Синтаксис-чек перед рестартом

Для JS файлов:
```bash
docker exec rolgi-api node -c /app/src/api/routes/strategies-routes.js
```

Если exit code ≠ 0 — не рестартовать API! Исправить синтаксис.

### 3. Правки через Edit tool или Python-патч

**Правильно (Edit tool OpenCode):**
```
edit(filePath, oldString, newString)
```

**Правильно (Python-патч с assert):**
```python
import re
with open('file.js') as f: content = f.read()
new_content = content.replace('old', 'new')
assert new_content.count('new_marker') == 1, "Expected exactly 1 replacement"
with open('file.js', 'w') as f: f.write(new_content)
```

**Неправильно:**
- sed/awk без проверки количества замен
- echo >> file (ломает кодировку)
- cat heredoc с переменными shell

## SQL

### НЕ через heredoc с переменными shell

**Неправильно:**
```bash
docker exec rolgi-postgres psql -c "
  UPDATE table SET x = '$var'  -- shell подставит $var и сломает SQL
"
```

**Правильно:**
```bash
cat > /tmp/fix.sql <<'EOF'
UPDATE table SET x = 'value';
EOF

docker cp /tmp/fix.sql rolgi-postgres:/tmp/
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -f /tmp/fix.sql
```

Обратите внимание: `<<'EOF'` (с кавычками) — не интерполирует переменные.

## Рестарт контейнера

### Обязательная последовательность

```bash
docker restart rolgi-api && sleep 12 && docker ps --filter name=rolgi-api
```

12 секунд — время на healthcheck. Если Status не показывает `(healthy)` через 12s — смотреть логи.

### Проверка логов после рестарта

```bash
docker logs rolgi-api --tail 50 2>&1 | grep -i "error\|fatal\|listening"
```

Ищем:
- `Server listening` — норма
- `Error` / `Fatal` — проблема

## API тесты через nginx

### Rate-limit: sleep между запросами

```bash
curl -sk "https://rolgi.com/api/db/games/123/analyzers"
sleep 8
curl -sk "https://rolgi.com/api/db/games/456/analyzers"
```

**Без sleep** — получите 429 Too Many Requests.

### Обход rate-limit (прямой доступ)

```bash
docker exec rolgi-api curl http://localhost:3000/api/db/games/123/analyzers
```

Порт 3000 внутри контейнера — без nginx, без rate-limit.

## Резолвинг ID матча

### Проблема: sstats_id дубликаты

В БД могут быть несколько матчей с одним `sstats_id` (старая версия + новая после обновления). Нужно брать самый свежий.

**Правильный SQL:**
```sql
SELECT * FROM games
WHERE sstats_id = $1 OR id = $1
ORDER BY (sstats_id = $1) DESC, last_updated DESC NULLS LAST
LIMIT 1
```

**Неправильно:**
```sql
ORDER BY g.id ASC  -- берёт самый старый дубль!
```

## Чтение .env и секретов

### НЕ читать весь файл

**Неправильно:**
```bash
cat /srv/projects/rolgi/.env  # раскроет все секреты в лог
```

**Правильно:**
```bash
grep '^DB_PASSWORD=' /srv/projects/rolgi/.env
```

Или через docker env:
```bash
docker exec rolgi-api printenv DB_PASSWORD
```

## Git

### Без явной просьбы пользователя — никогда:

❌ `git commit`
❌ `git push`
❌ `git rebase`
❌ `git reset --hard`
❌ `git clean -f`

Только:
✅ `git status`
✅ `git diff`
✅ `git log`
✅ `git show`

## Docker

### Деструктивные операции требуют подтверждения

❌ `docker rm -f` (без явной просьбы)
❌ `docker volume rm` (без явной просьбы)
❌ `docker system prune -a` (без явной просьбы)

Только:
✅ `docker ps`
✅ `docker logs`
✅ `docker exec`
✅ `docker restart` (после синтаксис-чека)

## Venue split в loadGames / loadHistory

Анализатор Poisson требует `venue: 'home' | 'away'` в каждом матче истории — для расчёта attack/defense per venue.

**Обязательно добавлять venue при загрузке:**
```js
const isHome = (g.home_team_id === teamId);
return {
    // ...
    venue: isHome ? 'home' : 'away',
};
```

Без venue — Poisson вернёт ошибку или некорректный результат.

## Бэктест на большом N

Для бэктеста на 100+ матчей:
- Timeout curl увеличить до 90s: `curl -sk --max-time 90 ...`
- Worker при выполнении бэктеста — не отвлекаться на другие задачи (блокирующая операция)

## Обновление кода после правок

После правки любого файла в `src/`:
1. Бэкап ✅
2. Syntax check ✅
3. Restart контейнера ✅
4. Smoke-test endpoint (хотя бы 1 запрос) ✅
5. Запись в `flow/31-reports.md` что именно изменено ✅

## Контрольный чек-лист перед закрытием задачи

- [ ] Все файлы с бэкапами
- [ ] Синтаксис проверен (node -c для JS)
- [ ] Контейнер перезапущен и (healthy)
- [ ] Smoke-test пройден
- [ ] Git diff просмотрен — нет случайных изменений
- [ ] Запись в flow/31-reports.md добавлена
- [ ] Если добавлены новые таблицы — обновлён knowledge/14-db-schema.md
- [ ] Если добавлены новые endpoints — обновлён knowledge/13-api-endpoints.md
- [ ] Если добавлены новые cron — обновлён knowledge/15-cron-jobs.md
