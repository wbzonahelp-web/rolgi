# .opencode-memory — Вечная память проекта rolgi

Эта директория содержит **persistent memory** для Two-Agent системы (Orchestrator на Opus 4.7 + Worker на Nemotron).

## Архитектура

- **Orchestrator (Opus 4.7)**: дорогой (2₽/вызов), умный. Читает 500-900k токенов контекста, выдаёт 500-900k токенов детальных планов.
- **Worker (Nemotron 3 Ultra)**: бесплатный, 1M контекст. Исполняет планы, собирает snapshot'ы, пишет reports.

## Структура

```
.opencode-memory/
├── 00-INDEX.md              # Точка входа, инжектится в промпт
├── README.md                # Этот файл
│
├── core/                    # СТАБИЛЬНОЕ — редко меняется
│   ├── 01-project.md
│   ├── 02-architecture.md
│   ├── 03-conventions.md
│   ├── 04-glossary.md
│   └── 05-credentials-map.md
│
├── knowledge/               # НАКАПЛИВАЕТСЯ
│   ├── 10-known-issues.md
│   ├── 11-gotchas.md
│   ├── 12-patterns.md
│   ├── 13-api-endpoints.md
│   ├── 14-db-schema.md
│   └── 15-cron-jobs.md
│
├── state/                   # РЕГЕНЕРИРУЕТСЯ Worker'ом
│   ├── 20-snapshot.md
│   ├── 21-current-task.md
│   ├── 22-blockers.md
│   ├── 23-git-status.md
│   └── HANDOFF_BRIEF.md
│
├── flow/                    # ПРОТОКОЛ ОБМЕНА
│   ├── 30-task-queue.md     # Orchestrator → Worker
│   ├── 31-reports.md        # Worker → Orchestrator (append-only)
│   └── 32-decisions-log.md  # Orchestrator (append-only)
│
├── roadmap/                 # ПЛАНИРОВАНИЕ
│   ├── 40-priorities.md
│   ├── 41-backlog.md
│   └── 42-done.md
│
├── tasks/                   # АРХИВ ЗАДАЧ
│   └── <date>-<name>.md
│
├── snapshots/               # АРХИВ SNAPSHOT'ОВ
│   └── <timestamp>-pre-opus.md
│
└── sessions/                # ЛОГИ СЕССИЙ
    ├── <date>-opus.md
    └── <date>-worker.md
```

## Workflow

1. Worker делает `/snapshot` → обновляет `state/20-snapshot.md`
2. Worker делает `/handoff` → готовит `state/HANDOFF_BRIEF.md` (500-900k токенов)
3. User: `Tab` → переключается на `@orchestrator`
4. Orchestrator читает память (500-900k токенов) → выдаёт детальный план в `flow/30-task-queue.md` (500-900k токенов)
5. Orchestrator `/decide` → записывает решение в `flow/32-decisions-log.md`
6. User: `Tab` → переключается на `@worker`
7. Worker `/task-next` → исполняет, пишет в `flow/31-reports.md`
8. Loop

## Принципы

- **Memory = Filesystem**: Всё в markdown, версионируется в git
- **Append-only**: `31-reports.md` и `32-decisions-log.md` только растут
- **Regenerable**: `state/*.md` Worker переписывает каждый раз
- **Max tokens**: 500-900k на каждый handoff — чем больше контекста, тем лучше

## Команды

- `/snapshot` — обновить state/20-snapshot.md
- `/handoff` — подготовить state/HANDOFF_BRIEF.md
- `/task-next` — взять задачу из queue
- `/report` — записать отчёт в reports
- `/decide` — записать решение в decisions-log (orchestrator)

---

**Дата создания:** 2026-06-25
**Версия:** 1.0
