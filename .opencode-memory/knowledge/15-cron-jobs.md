# Cron Jobs — все запланированные задачи

> Зарегистрированы в `src/jobs/scheduled-jobs.js`. Всего 19 jobs.

## Job List

| # | Name | Schedule | Файл | Описание |
|---|------|----------|------|----------|
| 0 | `load_live_games` | `* * * * *` (каждую минуту) | `src/loader/data-loader.js` | Загрузка live матчей из sstats.io |
| 1 | `update_live_scores` | `* * * * *` | `src/loader/data-loader.js` | Обновление счёта live матчей |
| 2 | `update_live_statistics` | `*/2 * * * *` (каждые 2 мин) | `src/loader/data-loader.js` | Обновление статистики live матчей |
| 3 | `load_upcoming_games` | `*/15 * * * *` (каждые 15 мин) | `src/loader/data-loader.js` | Загрузка upcoming матчей |
| 4 | `load_finished_games` | `0 * * * *` (каждый час) | `src/loader/data-loader.js` | Загрузка finished матчей за последний час |
| 5 | `load_today_games` | `0 2 * * *` (ежедневно 2:00) | `src/loader/data-loader.js` | Загрузка всех матчей на сегодня |
| 6 | `load_week_games` | `0 3 * * 0` (воскресенье 3:00) | `src/loader/data-loader.js` | Загрузка матчей на неделю |
| 7 | `clean_old_games` | `0 5 * * *` (ежедневно 5:00) | `src/jobs/clean-old-games.js` | Удаление старых матчей (is_deleted=true) |
| 8 | `compute_team_profitability` | `30 3 * * *` (ежедневно 3:30) | `src/jobs/compute-team-profitability.js` | Расчёт ROI команд |
| 9 | `compute_team_analyzers` | `45 3 * * *` (ежедневно 3:45) | `src/jobs/compute-team-analyzers.js` | Кэш JS анализаторов для команд |
| 10 | `record_predictions` | `15 * * * *` (каждый час :15) | `src/jobs/record-predictions.js` | Запись прогнозов для upcoming матчей |
| 11 | `verify_predictions` | `25 * * * *` (каждый час :25) | `src/jobs/verify-predictions.js` | Сверка прогнозов с фактом |
| 12 | `compute_python_analyzers` | `45 4 * * *` (ежедневно 4:45) | `src/jobs/compute-python-analyzers.js` | Прогрев HMM кэша через Python analytics |
| 13 | `verify_strategy_predictions` | `30 * * * *` (каждый час :30) | `src/jobs/verify-strategy-predictions.js` | Сверка прогнозов стратегий |
| 14 | `sync_odds` | `*/10 * * * *` (каждые 10 мин) | `src/jobs/sync-odds.js` | Синхронизация коэффициентов букмекеров |
| 15 | `check_alerts` | `*/5 * * * *` (каждые 5 мин) | `src/jobs/check-alerts.js` | Проверка алертов пользователей |
| 16 | `backup_db` | `0 6 * * *` (ежедневно 6:00) | `src/jobs/backup-db.js` | Бэкап БД (pg_dump) |
| 17 | `cleanup_cache` | `0 4 * * *` (ежедневно 4:00) | `src/jobs/cleanup-cache.js` | Очистка устаревших кэшей |
| 18 | `health_check` | `*/5 * * * *` (каждые 5 мин) | `src/jobs/health-check.js` | Healthcheck всех сервисов |

## Диагностика

### Проверить статус всех jobs

```bash
docker exec rolgi-api node /app/src/jobs/scheduled-jobs.js status
```

Вывод:
```
Job registered: load_live_games (schedule: * * * * *)
Job registered: update_live_scores (schedule: * * * * *)
...
Total jobs registered: 19
```

### Запустить job вручную

```bash
docker exec rolgi-api node -e "
const db = require('/app/src/database/db-pool').getDatabase();
const job = require('/app/src/jobs/compute-team-analyzers.js');
job.run(db).then(() => console.log('done')).catch(e => console.error(e));
"
```

### Логи job'ов

```bash
docker logs rolgi-api --since 1h 2>&1 | grep -E "Job (started|completed|failed)"
```

## Важные моменты

### Job 9 (compute_team_analyzers) — долгий

Прогоняет все анализаторы для всех команд (~60k строк в БД). Может занять 10-15 минут. Запускается ночью (3:45) когда нагрузка низкая.

### Job 10 + 11 (predictions record & verify)

**Job 10** (record_predictions):
- Каждый час находит upcoming матчи без прогноза
- Делает integrated forecast
- INSERT в predictions_log

**Job 11** (verify_predictions):
- Каждый час находит finished матчи с прогнозом но без actual_outcome
- UPDATE predictions_log (actual_outcome, is_hit)

**Важно:** не запускать оба job'а одновременно — могут быть race conditions.

### Job 12 (compute_python_analyzers) — Python HMM

Прогревает кэш HMM для топ-команд. Делает запрос к `http://analytics:8000/analyzers/hmm/team/<id>`. Если Python service down — job пропускает.

### Job 0-2 (live матчи) — частые

Запускаются каждую 1-2 минуты. Если sstats.io API недоступен — job пишет в лог и пропускает итерацию.

## Добавление нового job

1. Создать файл `src/jobs/my-new-job.js`:
```js
'use strict';

async function run(db) {
    console.log('my-new-job started');
    // ... логика ...
    console.log('my-new-job completed');
}

module.exports = { run };
```

2. Зарегистрировать в `src/jobs/scheduled-jobs.js`:
```js
scheduler.register({
    name: 'my_new_job',
    schedule: '0 5 * * *',  // ежедневно 5:00
    handler: async () => {
        const job = require('./my-new-job.js');
        await job.run(db);
    },
});
```

3. Рестарт API:
```bash
docker restart rolgi-api && sleep 12
```

4. Проверка:
```bash
docker exec rolgi-api node /app/src/jobs/scheduled-jobs.js status | grep my_new_job
```

## Мониторинг

Prometheus собирает метрики job'ов (если настроено):
- `rolgi_job_duration_seconds` — время выполнения
- `rolgi_job_errors_total` — количество ошибок
- `rolgi_job_last_success_timestamp` — timestamp последнего успеха
