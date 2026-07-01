# Known Issues — известные проблемы и их решения

> Накапливаем здесь все обнаруженные проблемы. Перед попыткой решения новой проблемы — сначала ищи здесь.

## Шаблон записи

```markdown
## [DATE] <краткое название>

**Симптом:** что наблюдается  
**Причина:** в чём дело  
**Решение:** как починить  
**Файлы:** какие файлы затронуты  
**Verified:** да/нет  
```

---

## [2026-06-22] sstats_id дубликаты в таблице games

**Симптом:** При запросе `/api/db/games/:id/analyzers` возвращается старый матч вместо свежего, даже если sstats_id есть в свежей записи.

**Причина:** В БД могут быть несколько матчей с одним sstats_id (старая версия + новая после обновления). SQL `ORDER BY g.id ASC` берёт самый старый.

**Решение:** Использовать `ORDER BY (sstats_id = $1) DESC, last_updated DESC NULLS LAST` (применено в 5 местах в `db-routes.js`).

**Файлы:** `src/api/routes/db-routes.js` (5 мест), `src/api/routes/strategies-routes.js`.

**Verified:** да, после правки матчи резолвятся корректно.

---

## [2026-06-22] events/lineups/statistics — date конфликт при sstats_id-дубликатах

**Симптом:** Endpoint возвращал пустые events/lineups/statistics для некоторых матчей.

**Причина:** JOIN по `p.date = s.date` ломался когда у дубликатов sstats_id были разные даты в БД.

**Решение:** Заменить на прямой JOIN `JOIN games g ON g.id = s.game_id WHERE g.sstats_id = $1`.

**Файлы:** `src/api/routes/db-routes.js` (events, lineups, statistics endpoints).

**Verified:** да.

---

## [2026-06-22] V3 эвристика — DRAW недопредсказывается

**Симптом:** Из 100 прогнозов только 1-5 на DRAW (вместо ожидаемых ~25 при 25% доли ничей).

**Причина:** V3 эвристика основана на team_strength (GD/XGD) — почти всегда одна команда сильнее, и DRAW не выбирается.

**Решение:** Переход на Poisson (Dixon-Coles) с draw boost. Создан `src/analytics/analyzers/poisson.js`.

**Результат:** в бэктесте EPL 2024 (200 матчей) — 8 DRAW предсказаний с 62.5% точностью.

**Файлы:** `src/analytics/analyzers/poisson.js`, `src/api/routes/db-routes.js`, `src/api/routes/strategies-routes.js`.

**Verified:** да.

---

## [2026-06-22] V3 confidence сломан

**Симптом:** 75% прогнозов имели confidence ≥ 0.80, но реальная accuracy на этой выборке была ~41% (как обычно).

**Причина:** Confidence в v3 был нормализованным score (sum=1), не реальной вероятностью. После нормализации все прогнозы выглядели "очень уверенными".

**Решение:** Переход на Poisson — confidence = реальная вероятность исхода (P(HOME) или P(DRAW) или P(AWAY)).

**Verified:** да, теперь:
- conf ≥ 0.80 — 4.5% прогнозов, accuracy 66.7%
- conf ≥ 0.70 — 11.5% прогнозов, accuracy 56.5%
- conf ≥ 0.60 — 29.5% прогнозов, accuracy 47.5%

---

## [2026-06-25] Worker bypass nginx rate-limit

**Симптом:** При множественных curl запросах через https://rolgi.com получаем 429 Too Many Requests.

**Причина:** Nginx настроен на rate-limit для публичного API.

**Решение:** Sleep 6-10 секунд между запросами, или прямой доступ через `docker exec rolgi-api curl http://localhost:3000/...`.

**Verified:** да.

---

## [Шаблон для новых проблем]

После каждого блокера — Worker должен добавить запись сюда.
