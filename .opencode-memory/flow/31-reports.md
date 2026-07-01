# Reports — append-only журнал работы Worker'а

> **APPEND-ONLY!** Никогда не редактируй и не удаляй прошлые записи.
>
> Worker пишет сюда каждый шаг работы. Orchestrator читает хвост (последние 500-1000 строк) для контекста.

<!-- LAST_HANDOFF: 2026-06-25T22:30:00Z -->

---

## [2026-06-25T15:00:00Z] Session: Poisson v4 — Завершение Приоритета 1

**Agent:** Claude Opus 4.7 (bootstrap session)
**Status:** COMPLETED

### Что сделано

Завершён Приоритет 1 — обновление `predictFromAnalyzers` в `strategies-routes.js` на Poisson v4.

**Файлы изменены:**
- `src/api/routes/strategies-routes.js` — обновлена `predictFromAnalyzers` на Poisson v4 (веса: Poisson 0.60, Momentum 0.15, HMM 0.15, Form 0.10)
- Добавлен `venue: isHome ? 'home' : 'away'` в `loadHistory` внутри бэктеста
- Добавлен `aPoisson.analyze` в бэктест-цикл

**Бэкап:** `strategies-routes.js.bak.poissonv4.1782400123`

### Результаты бэктеста (EPL 2024, 100 матчей)

| Metric | Value |
|--------|-------|
| Общая accuracy | 44% |
| HOME accuracy | 46.8% (29/62) |
| DRAW accuracy | 66.7% (2/3) |
| AWAY accuracy | 37.1% (13/35) |
| conf >= 0.80 | 66.7% (6 матчей) |
| conf >= 0.70 | 66.7% (18 матчей) |
| conf >= 0.60 | 60.6% (33 матча) |
| conf >= 0.50 | 48.1% (54 матча) |

### Команды

- `docker exec rolgi-api node -c /app/src/api/routes/strategies-routes.js` → exit 0
- `docker restart rolgi-api && sleep 12` → healthy
- `curl POST /api/strategies/games/1496999/predict` → HOME, conf=0.5403
- `curl POST /api/strategies/backtest` → 44% accuracy

---

## [2026-06-25T22:00:00Z] System bootstrap — создание .opencode-memory/

**Agent:** Claude Opus 4.7 (bootstrap session)
**Task ref:** Phase 1 из ETERNAL_MEMORY_SYSTEM_PLAN.md
**Status:** PARTIAL (95% — блокирован SSH)

### Что сделано локально

Создана полная структура памяти проекта в локальном staging (`C:\Users\bkfon\AppData\Local\Temp\opencode\memory-stage\`):

**Файлы (15 шт, 89 KB):**
- ✅ `00-INDEX.md` — точка входа для обоих агентов
- ✅ `README.md` — документация структуры
- ✅ `core/01-project.md` — описание проекта rolgi
- ✅ `core/02-architecture.md` — архитектурная схема
- ✅ `core/03-conventions.md` — golden rules
- ✅ `core/04-glossary.md` — глоссарий терминов
- ✅ `core/05-credentials-map.md` — карта секретов (БЕЗ значений)
- ✅ `knowledge/10-known-issues.md` — 5 known issues
- ✅ `knowledge/11-gotchas.md` — подводные камни
- ✅ `knowledge/12-patterns.md` — паттерны кода
- ✅ `knowledge/13-api-endpoints.md` — каталог API
- ✅ `knowledge/14-db-schema.md` — структура БД
- ✅ `knowledge/15-cron-jobs.md` — все 19 cron jobs
- ✅ `flow/31-reports.md` — этот файл
- ✅ `flow/32-decisions-log.md` — 3 initial decisions
- ✅ `roadmap/40-priorities.md` — P1 (done), P2 (active), P3, backlog

### Что сделано в конфиге OpenCode

Локально (`C:\Users\bkfon\.config\opencode\`):
- ✅ `opencode.json` — два primary agents (orchestrator + worker)
- ✅ `prompts/orchestrator.md` (19 KB) — детальный промпт для Opus 4.7
- ✅ `prompts/worker.md` (12.6 KB) — промпт для Nemotron 3 Ultra Free
- ✅ `commands/resume.md` — восстановление контекста
- ✅ `commands/snapshot.md` — собрать state
- ✅ `commands/handoff.md` — brief 500-900k токенов для Opus
- ✅ `commands/task-next.md` — взять задачу из queue
- ✅ `commands/report.md` — финальный отчёт
- ✅ `commands/decide.md` — записать решение (orchestrator)
- ✅ `commands/bootstrap.md` — первый запуск (загрузка файлов)
- ✅ `OPENCODE_MANAGEMENT_GUIDE.md` (17.6 KB) — полная документация
- ✅ `QUICK_START.md` — быстрый старт
- ✅ `RESUME_COMMAND.md` — команда восстановления

### Worker model

**Установлен:** `opencode/nemotron-3-ultra-free` (через OpenCode Zen, бесплатно, 1M контекст)

Проверено через `opencode models` — модель видна, авторизация через текущий Anthropic credentials в OpenCode Zen работает.

### Заблокировано

SSH соединение к серверу (`admin@152.53.187.79:49222`) таймаутит с момента ~21:00 UTC. Phase 1 готова к завершению — все файлы готовы к загрузке. Когда SSH восстановится:

1. `bifrost_connect()` — подключиться
2. `bifrost_exec({command: "mkdir -p /srv/projects/rolgi/.opencode-memory/{core,knowledge,state,flow,roadmap,tasks,snapshots,sessions}"})`
3. `bifrost_upload` для каждого из 15 файлов

Или просто `/bootstrap` — команда сделает это сама.

### Следующий шаг (для будущей сессии)

В новом чате OpenCode выполни одну из команд:

**Вариант A (магическая команда):**
```
Подключись к серверу через bifrost. Прочитай /srv/projects/rolgi/.opencode-memory/00-INDEX.md и продолжи работу. Если папка не существует — выполни /bootstrap.
```

**Вариант B (явно):**
```
/bootstrap
```

После загрузки memory:
```
/resume
```

---
