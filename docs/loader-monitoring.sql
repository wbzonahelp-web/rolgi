-- =====================================================================
-- Loader Monitoring Queries
-- Использование:
--   docker exec -i rolgi-postgres psql -U postgres -d rolgi_v6 < docs/loader-monitoring.sql
-- или интерактивно:
--   docker exec -it rolgi-postgres psql -U postgres -d rolgi_v6
--   \i /path/to/loader-monitoring.sql
-- =====================================================================

\echo '=== Последние 10 загрузок ==='
SELECT run_id, mode, status, completed_steps, failed_steps,
       duration_ms, started_at
FROM loader_runs
ORDER BY started_at DESC LIMIT 10;

\echo ''
\echo '=== Какие шаги чаще всего падают ==='
SELECT step_name, COUNT(*) AS fails
FROM loader_step_results
WHERE status='failed'
GROUP BY step_name
ORDER BY fails DESC;

\echo ''
\echo '=== Средняя длительность шагов ==='
SELECT step_name, AVG(duration_ms)::int AS avg_ms,
       MAX(duration_ms) AS max_ms, COUNT(*) AS runs
FROM loader_step_results
WHERE status='completed' AND duration_ms IS NOT NULL
GROUP BY step_name
ORDER BY avg_ms DESC;

\echo ''
\echo '=== Стек последней упавшей сессии ==='
SELECT run_id, step_name, error_message,
       LEFT(error_stack, 500) AS stack_head
FROM loader_step_results
WHERE status='failed'
ORDER BY failed_at DESC LIMIT 1;

\echo ''
\echo '=== Сессии за последний час ==='
SELECT mode, status, COUNT(*) AS cnt,
       AVG(duration_ms)::int AS avg_ms
FROM loader_runs
WHERE started_at > NOW() - INTERVAL '1 hour'
GROUP BY mode, status
ORDER BY mode, status;
