# Prometheus + Grafana Monitoring

**Версия**: 6.1.0  
**Task ID**: 21  
**Статус**: ✅ Implemented

## 📋 Обзор

Production-ready monitoring stack для Rolgi SStats Analytics Platform на основе Prometheus и Grafana.

**Компоненты**:
- **Prometheus** — time-series database для сбора метрик
- **Grafana** — визуализация и dashboards
- **Alertmanager** — управление алертами
- **prom-client** — Node.js client для экспорта метрик

**Метрики**:
- ✅ HTTP requests (duration, count, size)
- ✅ Database queries (duration, count, pool stats)
- ✅ Redis cache (hits, misses, operations)
- ✅ WebSocket connections (count, messages, errors)
- ✅ Authentication (login attempts, sessions, tokens)
- ✅ Alerting system (sent, failed, history size)
- ✅ Rate limiting (hits, requests)
- ✅ Data loader (sessions, duration, records)
- ✅ Business metrics (games, teams, players)
- ✅ System resources (CPU, memory, GC)

---

## 🚀 Быстрый старт

### 1. Запуск Monitoring Stack

```bash
# Start Prometheus + Grafana + Alertmanager
docker-compose -f docker-compose.monitoring.yml up -d

# Check status
docker-compose -f docker-compose.monitoring.yml ps

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f
```

**Endpoints**:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin123)
- **Alertmanager**: http://localhost:9093

### 2. Запуск Backend API

Backend API должен быть запущен для экспорта метрик:

```bash
# Start backend (если ещё не запущен)
npm start

# Check metrics endpoint
curl http://localhost:3000/metrics
```

### 3. Открыть Grafana

1. Откройте http://localhost:3001
2. Login: `admin` / `admin123`
3. Dashboards → Browse → "Rolgi API Overview"

---

## 📊 Metrics Endpoints

### `/metrics` — Prometheus Metrics

```bash
curl http://localhost:3000/metrics
```

**Output** (Prometheus format):
```
# HELP rolgi_http_requests_total Total number of HTTP requests
# TYPE rolgi_http_requests_total counter
rolgi_http_requests_total{method="GET",route="/api/games",status_code="200"} 1234

# HELP rolgi_http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE rolgi_http_request_duration_seconds histogram
rolgi_http_request_duration_seconds_bucket{method="GET",route="/api/games",status_code="200",le="0.005"} 100
...
```

---

## 📈 Available Metrics

### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_http_request_duration_seconds` | Histogram | Request duration (p50, p95, p99) |
| `rolgi_http_requests_total` | Counter | Total requests count |
| `rolgi_http_request_size_bytes` | Histogram | Request body size |
| `rolgi_http_response_size_bytes` | Histogram | Response body size |

**Labels**: `method`, `route`, `status_code`

### Database Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_db_query_duration_seconds` | Histogram | Query execution time |
| `rolgi_db_queries_total` | Counter | Total queries count |
| `rolgi_db_pool_connections` | Gauge | Connection pool stats (total/idle/active/waiting) |
| `rolgi_db_errors_total` | Counter | Database errors count |

**Labels**: `operation`, `table`, `status`, `state`, `error_type`

### Cache Metrics (Redis)

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_cache_hits_total` | Counter | Cache hits |
| `rolgi_cache_misses_total` | Counter | Cache misses |
| `rolgi_cache_operation_duration_seconds` | Histogram | Cache operation time |
| `rolgi_cache_size_bytes` | Gauge | Cache size |
| `rolgi_cache_keys_total` | Gauge | Number of keys |

**Labels**: `cache_key`, `operation`, `status`

### WebSocket Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_websocket_connections` | Gauge | Active WS connections |
| `rolgi_websocket_messages_total` | Counter | WS messages count |
| `rolgi_websocket_message_size_bytes` | Histogram | Message size |
| `rolgi_websocket_errors_total` | Counter | WS errors |

**Labels**: `channel`, `direction`, `type`, `error_type`

### Authentication Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_auth_login_attempts_total` | Counter | Login attempts |
| `rolgi_auth_token_operations_total` | Counter | Token operations (issue/refresh/revoke) |
| `rolgi_auth_active_sessions` | Gauge | Active user sessions |

**Labels**: `status`, `role`, `operation`

### Alerting Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_alerts_sent_total` | Counter | Alerts sent |
| `rolgi_alerts_failed_total` | Counter | Failed alerts |
| `rolgi_alert_history_size` | Gauge | History size |

**Labels**: `channel`, `severity`, `type`

### Rate Limiting Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_rate_limit_hits_total` | Counter | Rate limit hits (blocked) |
| `rolgi_rate_limit_requests_total` | Counter | Rate limit checks |

**Labels**: `limit_type`, `identifier`, `status`

### Data Loader Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_loader_sessions_total` | Counter | Loader sessions |
| `rolgi_loader_duration_seconds` | Histogram | Session duration |
| `rolgi_loader_records_total` | Counter | Records processed |

**Labels**: `entity_type`, `status`, `operation`

### Business Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_games_total` | Gauge | Total games count |
| `rolgi_teams_total` | Gauge | Total teams count |
| `rolgi_players_total` | Gauge | Total players count |

**Labels**: `status` (for games)

### System Metrics (Default)

| Metric | Type | Description |
|--------|------|-------------|
| `rolgi_process_cpu_seconds_total` | Counter | CPU time |
| `rolgi_process_resident_memory_bytes` | Gauge | Memory usage |
| `rolgi_nodejs_heap_size_total_bytes` | Gauge | Heap size |
| `rolgi_nodejs_gc_duration_seconds` | Histogram | GC duration |

---

## 🔔 Alerting Rules

### Configured Alerts

#### API Health
- **APIHighErrorRate** — Error rate > 5% for 2 minutes
- **APIHighLatency** — p95 latency > 2s for 5 minutes
- **APIDown** — API not responding for 1 minute

#### Database
- **DatabaseHighConnectionUsage** — Pool usage > 80% for 5 minutes
- **DatabaseSlowQueries** — p95 query time > 1s for 5 minutes
- **DatabaseHighErrorRate** — Error rate > 1/sec for 2 minutes

#### Cache
- **CacheLowHitRate** — Hit rate < 50% for 10 minutes

#### WebSocket
- **WebSocketHighConnectionCount** — Connections > 9000 for 5 minutes
- **WebSocketHighErrorRate** — Error rate > 10/sec for 2 minutes

#### Authentication
- **HighFailedLoginAttempts** — Failed logins > 5/sec for 2 minutes
- **SuspiciousLoginActivity** — Failed logins > 20/sec for 1 minute (possible attack)

#### Rate Limiting
- **HighRateLimitHits** — Rate limit hits > 50/sec for 5 minutes

#### System Resources
- **HighMemoryUsage** — Memory > 2GB for 5 minutes
- **HighCPUUsage** — CPU > 80% for 5 minutes

#### Business Metrics
- **NoRecentGames** — No game updates in last hour

---

## 📊 Grafana Dashboards

### Rolgi API Overview

**Panels**:
1. **API Requests/sec** — Gauge с current rate
2. **API Latency (p50, p95, p99)** — Time series график
3. **Error Rate** — % errors по endpoint
4. **Request Volume by Endpoint** — Bar chart
5. **Database Pool Stats** — Gauge connections (total/idle/active/waiting)
6. **Cache Hit Rate** — % hit rate
7. **WebSocket Connections** — Gauge по каналам
8. **Authentication Activity** — Login attempts (success/failure)
9. **Alert Statistics** — Sent/failed по каналам

### Variables

- `$datasource` — Prometheus datasource
- `$interval` — Time range

---

## 🐳 Docker Setup

### docker-compose.monitoring.yml

Includes:
- **Prometheus** (port 9090)
- **Grafana** (port 3001)
- **Alertmanager** (port 9093)

**Volumes**:
- `prometheus-data` — Prometheus TSDB (30 days retention)
- `grafana-data` — Grafana database
- `alertmanager-data` — Alertmanager storage

**Networks**:
- `monitoring` — Bridge network

### Environment Variables

Grafana:
```env
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin123
GF_SERVER_ROOT_URL=http://localhost:3001
```

---

## ⚙️ Configuration

### Prometheus Configuration

`monitoring/prometheus/prometheus.yml`:
- Scrape interval: 15s
- Evaluation interval: 15s
- Targets: `host.docker.internal:3000` (backend API)
- Alerting rules: `/etc/prometheus/alerts.yml`

### Alertmanager Configuration

`monitoring/prometheus/alertmanager.yml`:
- Routes: critical → multiple channels, warning → slack only
- Receivers: email, slack, webhook
- Inhibit rules: suppress warnings when critical fires

### Grafana Provisioning

- **Datasources**: Prometheus (auto-configured)
- **Dashboards**: `monitoring/grafana/dashboards/*.json`

---

## 🔧 Integration

### Backend API Integration

Prometheus middleware автоматически подключается в `backend-api.js`:

```javascript
const { setupPrometheusMiddleware } = require('../monitoring/prometheus/middleware');

// In start() method
setupPrometheusMiddleware(this.app);
```

### Metrics Collector

Периодический сбор метрик:

```javascript
const PrometheusCollector = require('../monitoring/prometheus/collector');

const collector = new PrometheusCollector(db);
collector.start(); // Start collecting every 30s
```

### Manual Metrics Recording

```javascript
const metrics = require('../monitoring/prometheus/metrics-registry');

// Record HTTP request
metrics.httpRequestTotal.inc({ method: 'GET', route: '/api/games', status_code: 200 });

// Record DB query
metrics.dbQueryDuration.observe({ operation: 'select', table: 'games', status: 'success' }, 0.05);

// Record cache hit
metrics.cacheHitsTotal.inc({ cache_key: 'games:all' });

// Record WS message
metrics.wsMessagesTotal.inc({ direction: 'sent', channel: 'game', type: 'update' });
```

---

## 📈 PromQL Query Examples

### HTTP Metrics

```promql
# Requests per second
rate(rolgi_http_requests_total[5m])

# Error rate
sum(rate(rolgi_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(rolgi_http_requests_total[5m]))

# P95 latency
histogram_quantile(0.95, sum(rate(rolgi_http_request_duration_seconds_bucket[5m])) by (le, route))

# Requests by status code
sum by (status_code) (rate(rolgi_http_requests_total[5m]))
```

### Database Metrics

```promql
# Connection pool usage
rolgi_db_pool_connections{state="active"} / rolgi_db_pool_connections{state="total"}

# Query rate
rate(rolgi_db_queries_total[5m])

# Slow queries
topk(5, histogram_quantile(0.95, sum(rate(rolgi_db_query_duration_seconds_bucket[5m])) by (le, table)))
```

### Cache Metrics

```promql
# Hit rate
rate(rolgi_cache_hits_total[5m]) / (rate(rolgi_cache_hits_total[5m]) + rate(rolgi_cache_misses_total[5m]))

# Cache size
rolgi_cache_size_bytes

# Operations per second
rate(rolgi_cache_operation_duration_seconds_count[5m])
```

### WebSocket Metrics

```promql
# Active connections
sum(rolgi_websocket_connections)

# Messages per second
rate(rolgi_websocket_messages_total[5m])

# Error rate
rate(rolgi_websocket_errors_total[5m])
```

---

## 🐛 Troubleshooting

### Prometheus не видит metrics endpoint

**Problem**: `Up: 0/1` в Prometheus targets

**Solutions**:
1. Check backend API running: `curl http://localhost:3000/metrics`
2. Check Docker network: use `host.docker.internal:3000` (Mac/Windows) or `172.17.0.1:3000` (Linux)
3. Check firewall rules

### Grafana не показывает данные

**Problem**: Empty graphs

**Solutions**:
1. Check Prometheus datasource: Configuration → Datasources → Test
2. Check time range: должен быть "Last 6 hours" или больше
3. Check query: Run query in Prometheus UI first
4. Wait for data: metrics собираются каждые 15s

### Alertmanager не отправляет алерты

**Problem**: Alerts firing but no notifications

**Solutions**:
1. Check Alertmanager config: `docker exec -it rolgi-alertmanager cat /etc/alertmanager/alertmanager.yml`
2. Configure SMTP/Slack webhooks properly
3. Check logs: `docker logs rolgi-alertmanager`

---

## 📝 Best Practices

### 1. Metric Naming

- Use `rolgi_` prefix for all custom metrics
- Use descriptive names: `rolgi_http_request_duration_seconds`
- Use base units: seconds, bytes, not milliseconds or KB

### 2. Labels

- Keep cardinality low (< 100 unique values per label)
- Use meaningful labels: `method`, `route`, `status_code`
- Don't use user IDs or request IDs as labels

### 3. Histograms

- Use appropriate buckets for your use case
- Standard buckets: `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]`

### 4. Dashboards

- Group related metrics
- Use variables for filtering
- Add annotations for deploys/incidents
- Set appropriate refresh intervals

### 5. Alerts

- Set appropriate thresholds and durations
- Avoid alert fatigue (don't alert on everything)
- Use inhibit rules to reduce noise
- Test alerts in dev/staging first

---

## 🔄 Production Deployment

### 1. Persistent Storage

Ensure volumes are backed up:
```bash
# Backup Prometheus data
docker run --rm -v prometheus-data:/data -v $(pwd):/backup alpine tar czf /backup/prometheus-backup.tar.gz /data

# Backup Grafana data
docker run --rm -v grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-backup.tar.gz /data
```

### 2. High Availability

For production, consider:
- Multiple Prometheus replicas with Thanos
- Grafana behind load balancer
- Alertmanager cluster (3+ nodes)

### 3. Security

- Change default Grafana password
- Use HTTPS (reverse proxy)
- Restrict /metrics endpoint (authentication)
- Use secrets management for sensitive data

---

## 📚 См. также

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client GitHub](https://github.com/siimon/prom-client)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)

---

**Автор**: Rolgi Development Team  
**Дата**: 2026-01-30  
**Task ID**: 21 — Prometheus + Grafana Monitoring  
**Версия**: v6.1.0
