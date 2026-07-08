# CROSSREF — карта пересечений роутов (ЧИТАТЬ ПЕРЕД ПРАВКОЙ ОБЩЕГО ФАЙЛА)
> Какой роут какие страницы обслуживает. Правка общего файла затрагивает ВСЕ
> перечисленные страницы — проверяй каждую реальным запросом после изменения.

## 3 типа источников данных

### ТИП A — своя БД через db-routes.js (ОБЩИЙ файл, /api/db/*)
| Роут | Зависимые страницы |
|------|------------------|
| /games/list | leagues, strategies, index |
| /games/season-summary | leagues |
| /games/:id (+events, lineups, statistics, h2h, prediction, analyzers, profitability) | game (основное), index |
| /teams/:id/* (recent-form, analyzers, hmm) | game |
| /teams/search, /players/search | index |
| /leagues, /leagues/popular, /leagues/:id/pagerank | leagues, index |
| /predictions/stats, /list, /generate-upcoming | predictions-history |
Правка любого роута db-routes.js → проверь ВСЕ зависимые страницы из строки.

### ТИП B — собственный роутер страницы (менять безопасно, не общий)
| Роутер | Префикс | Страница |
|--------|----------|----------|
| strategies-routes.js | /api/strategies/* | только strategies.html |
| scout-routes.js | /api/scout/* | только scout.html |
| cappers-routes.js | /api/db/cappers* | только cappers.html |

### TИП C — серверный прокси/загрузчик через cached-proxy.js (ОБЩИЙ, /api/cached/*)
**НЕ является источником отображения данных на UI!** Это внутренний fallback/loader/proxy для backend-загрузки. Ключ SSTATS_API_KEY подставляется на сервере — во фронт НЕ передаётся.
Правка cached-proxy.js → потенциально затрагивает загрузку данных для любой страницы.

## Общий фронтенд (затрагивает ВСЕ страницы)
- www/assets/app.js — apiGet (обычные запросы), apiGetAuth/apiAuth (с авторизацией), WebSocket-клиент.
- www/assets/components.js — общие UI-компоненты.
- www/assets/app.css — общие стили.
Правка любого из трёх → потенциально задевает любую страницу сайта.

## ARCHITECTURAL RULE — поток данных

**ФРОНТЕНД НЕ ДОЛЖЕН использовать `/api/cached/*` как источник отображения рабочих данных.**

Правильный поток:
```
SStats API → backend loader/proxy/upsert → PostgreSQL → /api/db/* → frontend
```

- Если данных нет в БД, backend может дозагрузить их из SStats, **но обязан сохранить в БД перед выдачей или сразу после получения**.
- Повторные запросы должны идти **из БД** (`/api/db/*`).
- `/api/cached/*` — только для внутреннего pipeline (loader, proxy, fallback), **не для UI**.

### KNOWN ISSUE
В HTML (index/teams/players) исторически был захардкожен внешний API_KEY. Прямой вызов внешнего API из браузера с ключом — не добавлять, при встрече — убирать.

## Правило
UI/разметка → правь только файл конкретной страницы (www/<page>.html). Роут в общем файле (db-routes.js / cached-proxy.js) или общий JS (app.js/ components.js/app.css) → сверься с этой картой, затем проверь всех потребителей.
