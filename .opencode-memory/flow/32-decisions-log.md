# Decisions Log — Append-Only

> Все стратегические решения. **НИКОГДА не редактировать прошлые записи.**
> Если решение изменилось — добавь новую запись со ссылкой на старое.

---

## [2026-06-25T22:00:00Z] DECISION: Two-Agent architecture с filesystem memory

**Context:** Пользователь хочет автономную систему с вечной памятью где Opus 4.7 (2р/вызов, 900k токенов IO) выдаёт максимально объёмные планы (500-900k токенов), а безлимитный Worker (Nemotron 3 Ultra) исполняет.

**Options considered:**

1. **Внешний плагин памяти (Honcho/Lemma/oc-mnemoria)**
   - Pros: готовые решения, BM25 поиск, MCP tools
   - Cons: добавляет зависимости, снижает контроль над форматом, vendor lock-in

2. **Filesystem-based markdown memory**
   - Pros: простота, прозрачность, версионируется в git, работает offline, полный контроль
   - Cons: при росте памяти — медленный grep

3. **Гибрид (markdown + SQLite индекс)**
   - Pros: совмещает преимущества
   - Cons: лишняя сложность на старте

**Chosen:** Option 2 (filesystem markdown) на старте.

**Rationale:**
- Прозрачность: любой md файл можно открыть и прочитать
- Версионируется автоматически в git проекта
- Если разрастётся — мигрируем на oc-mnemoria без потери данных
- Не зависим от стороннего сервиса

**Reversibility:** reversible. Если станет неудобно — мигрируем на плагин (oc-mnemoria/Lemma) — все данные останутся в .md файлах.

**Affected files:**
- `/srv/projects/rolgi/.opencode-memory/` — вся структура памяти
- `~/.config/opencode/opencode.json` — конфиг с двумя primary agents
- `~/.config/opencode/prompts/orchestrator.md`, `worker.md` — промпты
- `~/.config/opencode/commands/*.md` — slash-команды

**Expected outcome:**
- Opus 4.7 за 1 вызов получает 500-900k токенов контекста
- Выдаёт 500-900k токенов детального плана
- Worker автономно исполняет 1-3 крупных задачи между вызовами Opus

**How to verify:**
1. Через 3-5 циклов handoff'а — оценить сколько токенов в среднем тратит Opus
2. Оценить — теряется ли контекст между вызовами Opus
3. Оценить — насколько детальные планы и хватает ли Worker'у инфы (нет ли вопросов "а что делать?")

---

## [2026-06-25T22:00:30Z] DECISION: Memory location — на сервере под git

**Context:** Где хранить .opencode-memory/?

**Options considered:**

1. На сервере в репо (`/srv/projects/rolgi/.opencode-memory/`)
   - Pros: версионируется в git, бэкапится с проектом, доступна с любой машины
   - Cons: нужен git push для синхронизации

2. Локально на Windows (`C:\Users\bkfon\.opencode-memory\rolgi\`)
   - Pros: быстрый доступ
   - Cons: не версионируется, теряется при смене ПК

3. Гибрид (на сервере + локальный кэш)
   - Pros: скорость + надёжность
   - Cons: сложность синхронизации

**Chosen:** Option 1 (на сервере в репо).

**Rationale:**
- Git автоматически версионирует
- Бэкап сервера = бэкап памяти
- OpenCode на Windows читает через bifrost напрямую с сервера
- Если откатываемся к старой версии кода — память тоже откатывается (синхронность)

**Reversibility:** reversible. Можно скопировать локально в любой момент.

---

## [2026-06-25T22:01:00Z] DECISION: Worker model — Nemotron 3 Ultra Free

**Context:** Какую модель использовать для безлимитного Worker'а?

**Options considered:**

1. **Локальная модель** (Qwen 2.5 Coder 7B / DeepSeek Coder Lite 16B / Llama 3.1 8B)
   - Pros: бесплатно, offline
   - Cons: контекст max 128k, RAM 16GB ограничивает; качество ниже cloud-моделей

2. **Cloud free tier** (Gemini 2.0 Flash 1M context / Groq Llama 3.3 70B / OpenRouter free)
   - Pros: 1M контекст у Gemini, хорошее качество
   - Cons: rate-limits, требует API key

3. **Nemotron 3 Ultra Free** (выбор пользователя)
   - Pros: бесплатно, доступен пользователю
   - Cons: конкретная модель и контекст требует уточнения

**Chosen:** Nemotron 3 Ultra Free (по выбору пользователя).

**Note:** Nemotron 3 Ultra (340B) — это API-модель, не локальная. Локально на 16GB RAM не запустится. Если контекст у выбранной Nemotron меньше 128k — добавим Gemini 2.0 Flash как fallback.

**Reversibility:** легко меняется через `OPENCODE_WORKER_MODEL` env var или в opencode.json.

---

## [Шаблон для будущих решений]

```markdown
## [<UTC timestamp>] DECISION: <название>

**Context:** <что было известно до решения>

**Options considered:**
1. <option A> — pros/cons
2. <option B> — pros/cons

**Chosen:** <option>

**Rationale:** <обоснование>

**Reversibility:** reversible | irreversible | partial

**Affected files/modules:** ...

**Expected outcome:** ...

**How to verify:** ...

---
```
