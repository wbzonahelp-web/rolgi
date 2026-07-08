# Память проекта rolgi — INDEX

> Этот файл инжектится в системный промпт ОБОИХ агентов при старте сессии.

## Текущая роль

Если ты **orchestrator**: твоя задача — стратегические решения на Opus 4.7. Каждый вызов = 2₽. Прочитай раздел "Файлы для orchestrator" ниже.

Если ты **worker**: ты безлимитный исполнитель (Nemotron 3 Ultra). Прочитай раздел "Файлы для worker".

## Файлы для orchestrator (читать в начале каждой сессии)

1. `state/HANDOFF_BRIEF.md` — главный документ от Worker (если есть)
2. `state/20-snapshot.md` — текущее состояние проекта
3. `flow/30-task-queue.md` — что в очереди
4. `flow/31-reports.md` — последние отчёты Worker (хвост, 500-1000 строк)
5. `flow/32-decisions-log.md` — журнал решений (все)
6. `roadmap/40-priorities.md` — приоритеты
7. `core/01-project.md`, `core/03-conventions.md` — стабильное

После анализа — пиши в `flow/30-task-queue.md` ОЧЕНЬ детальный план (целевой объём **500-900k токенов**).

## Файлы для worker

1. `flow/30-task-queue.md` — что делать сейчас
2. `state/21-current-task.md` — какая задача в работе
3. `state/22-blockers.md` — блокеры
4. `core/03-conventions.md` — golden rules (бэкап, синтаксис-чек, sleep между curl)
5. `knowledge/10-known-issues.md`, `knowledge/11-gotchas.md` — что уже знаем

После исполнения — пиши в `flow/31-reports.md` (append).

## Протокол передачи (handoff)

```
Worker:  /snapshot    →  обновляет state/20-snapshot.md
Worker:  /handoff     →  готовит state/HANDOFF_BRIEF.md (500-900k токенов)
USER:    Tab          →  переключается на @orchestrator
Orch:    [читает]     →  анализирует, выдаёт план в flow/30-task-queue.md (500-900k токенов)
Orch:    /decide      →  записывает решение в flow/32-decisions-log.md
USER:    Tab          →  переключается на @worker
Worker:  /task-next   →  берёт первую задачу
Worker:  [исполняет]  →  пишет в flow/31-reports.md
Worker:  /report      →  финальный отчёт по задаче
[loop]
```

## Правила обоих агентов

1. **Memory is filesystem.** Всё пишем в `.opencode-memory/`. Никогда не полагайся только на свой контекст.
2. **Append-only журналы.** `flow/32-decisions-log.md` и `flow/31-reports.md` — только append.
3. **State регенерируется.** `state/*.md` Worker может полностью перезаписывать.
4. **Конвенции из `core/03-conventions.md` обязательны.** Бэкап перед правкой, синтаксис-чек, sleep между curl на nginx.
5. **Максимальная детализация.** Orchestrator выдаёт 500-900k токенов плана. Worker собирает 500-900k токенов контекста в handoff. Экономия токенов — враг качества.
- knowledge/16-route-crossref.md — карта пересечений роутов (какой роут какие страницы обслуживает)
