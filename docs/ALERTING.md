# Система алертов (Alerting System)

**Версия**: 6.1.0  
**Task ID**: 27  
**Статус**: ✅ Implemented

## 📋 Обзор

Система алертов обеспечивает отправку уведомлений о критических событиях и проблемах через различные каналы:
- **Email** — SMTP
- **Slack** — Incoming Webhooks
- **Custom Webhooks** — REST API

Поддерживает:
- 4 уровня severity (critical, error, warning, info)
- 7 типов алертов (system, database, api, loader, rate_limit, cache, security)
- Rate limiting алертов (cooldown 5 минут)
- История алертов (до 1000 записей)
- Batch отправка
- Health check мониторинг

---

## 🏗️ Архитектура

### Компоненты

```
src/alerting/
├── alert-manager.js       # Центральный менеджер алертов
├── alert-helpers.js       # Helper функции для типовых алертов
src/api/routes/
└── alerts.js              # REST API endpoints (admin only)
```

### AlertManager

**Singleton** класс для управления алертами.

```javascript
const { getAlertManager } = require('./src/alerting/alert-manager');

const alertManager = getAlertManager();
```

**Основные методы**:
- `send(alert)` — отправка алерта
- `sendTestAlert(channels)` — тестовый алерт
- `getHistory(limit, filters)` — получение истории
- `getStats()` — статистика
- `clearHistory()` — очистка истории

---

## ⚙️ Конфигурация

### Environment Variables

#### Email (SMTP)

```bash
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_FROM=alerts@rolgi.local
ALERT_EMAIL_TO=admin@example.com,ops@example.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### Slack

```bash
ALERT_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
SLACK_USERNAME=Rolgi Alert Bot
SLACK_ICON_EMOJI=:rotating_light:
```

#### Custom Webhook

```bash
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
ALERT_WEBHOOK_HEADERS='{"Content-Type":"application/json","Authorization":"Bearer YOUR_TOKEN"}'
```

---

## 📊 Severity Levels

| Level | Код | Описание | Каналы по умолчанию |
|-------|-----|----------|---------------------|
| **CRITICAL** | `critical` | Критическая ошибка, требует немедленного вмешательства | Email, Slack, Webhook |
| **ERROR** | `error` | Ошибка, требует внимания | Email, Slack |
| **WARNING** | `warning` | Предупреждение, возможные проблемы | Slack |
| **INFO** | `info` | Информационное сообщение | Slack |

---

## 🔖 Alert Types

| Тип | Код | Описание |
|-----|-----|----------|
| System | `system` | Системные алерты (deployment, recovery, load) |
| Database | `database` | Проблемы с БД (connection, queries, pool) |
| API | `api` | Ошибки API endpoints |
| Loader | `loader` | Проблемы с Data Loader |
| Rate Limit | `rate_limit` | Превышение rate limits |
| Cache | `cache` | Проблемы с кэшем (Redis) |
| Security | `security` | Проблемы безопасности (auth failures, intrusion) |

---

## 💻 Использование

### Базовая отправка алерта

```javascript
const { getAlertManager, SEVERITY, ALERT_TYPES } = require('./src/alerting/alert-manager');

const alertManager = getAlertManager();

await alertManager.send({
  title: 'Database Connection Lost',
  message: 'Failed to connect to PostgreSQL database after 3 retries',
  severity: SEVERITY.CRITICAL,
  type: ALERT_TYPES.DATABASE,
  metadata: {
    host: 'localhost',
    port: 5432,
    database: 'rolgi_v6',
    retries: 3
  },
  channels: ['email', 'slack', 'webhook']
});
```

### Helper функции

```javascript
const {
  alertCriticalError,
  alertDatabaseError,
  alertApiError,
  alertLoaderFailure,
  alertRateLimitExceeded,
  alertCacheIssue,
  alertSecurityIssue,
  alertHighLoad,
  alertDeploymentSuccess,
  alertDeploymentFailure,
  alertServiceRecovered,
  alertHealthCheckFailed
} = require('./src/alerting/alert-helpers');

// Database error
try {
  await db.query('SELECT * FROM games');
} catch (error) {
  await alertDatabaseError(error, {
    query: 'SELECT * FROM games',
    duration: 1500
  });
}

// API error
try {
  const response = await fetch('/api/games');
  if (!response.ok) {
    await alertApiError('/api/games', response.status, new Error(response.statusText));
  }
} catch (error) {
  await alertApiError('/api/games', 500, error);
}

// Security issue
await alertSecurityIssue(
  'Multiple Failed Login Attempts',
  `User ${username} failed to login 5 times from IP ${ip}`,
  { username, ip, attempts: 5 }
);

// High load
if (cpuUsage > 90) {
  await alertHighLoad('CPU', cpuUsage, 90, { instance: 'api-1' });
}

// Deployment
try {
  await deploy(version, environment);
  await alertDeploymentSuccess(version, environment);
} catch (error) {
  await alertDeploymentFailure(version, environment, error);
}
```

### Тестовый алерт

```javascript
// Отправка тестового алерта
await alertManager.sendTestAlert(['slack']);
```

### История алертов

```javascript
// Последние 50 алертов
const history = alertManager.getHistory(50);

// Фильтрация по severity
const criticalAlerts = alertManager.getHistory(50, { 
  severity: SEVERITY.CRITICAL 
});

// Фильтрация по типу
const dbAlerts = alertManager.getHistory(50, { 
  type: ALERT_TYPES.DATABASE 
});

// Комбинированные фильтры
const criticalDbAlerts = alertManager.getHistory(50, {
  severity: SEVERITY.CRITICAL,
  type: ALERT_TYPES.DATABASE
});
```

### Статистика

```javascript
const stats = alertManager.getStats();
console.log(stats);
// {
//   sent: {
//     email: 15,
//     slack: 42,
//     webhook: 38
//   },
//   failed: {
//     email: 1,
//     slack: 0,
//     webhook: 2
//   },
//   historySize: 95,
//   cooldownActive: 3
// }
```

---

## 🔌 REST API (Admin Only)

Все endpoints требуют JWT аутентификации с ролью **admin**.

### Отправка алерта

```http
POST /api/alerts/send
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "Test Alert",
  "message": "This is a test alert",
  "severity": "info",
  "type": "system",
  "metadata": {
    "test": true
  },
  "channels": ["slack", "webhook"]
}
```

**Response**:
```json
{
  "success": true,
  "results": {
    "slack": { "success": true },
    "webhook": { "success": true, "statusCode": 200 }
  }
}
```

### Тестовый алерт

```http
POST /api/alerts/test
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "channels": ["slack"]
}
```

### Получение истории

```http
GET /api/alerts/history?limit=50&severity=critical&type=database
Authorization: Bearer <admin_token>
```

**Response**:
```json
{
  "alerts": [
    {
      "title": "Database Connection Lost",
      "message": "Failed to connect to database",
      "severity": "critical",
      "type": "database",
      "timestamp": "2026-01-30T12:34:56.789Z",
      "hostname": "api-server-1",
      "environment": "production",
      "metadata": { ... }
    }
  ],
  "total": 12,
  "limit": 50
}
```

### Статистика

```http
GET /api/alerts/stats
Authorization: Bearer <admin_token>
```

**Response**:
```json
{
  "sent": {
    "email": 15,
    "slack": 42,
    "webhook": 38
  },
  "failed": {
    "email": 1,
    "slack": 0,
    "webhook": 2
  },
  "historySize": 95,
  "cooldownActive": 3
}
```

### Конфигурация

```http
GET /api/alerts/config
Authorization: Bearer <admin_token>
```

**Response**:
```json
{
  "email": {
    "enabled": true,
    "from": "alerts@rolgi.local",
    "to": ["admin@example.com"],
    "configured": true
  },
  "slack": {
    "enabled": true,
    "channel": "#alerts",
    "configured": true
  },
  "webhook": {
    "enabled": true,
    "url": "[CONFIGURED]",
    "configured": true
  }
}
```

### Очистка истории

```http
DELETE /api/alerts/history
Authorization: Bearer <admin_token>
```

**Response**:
```json
{
  "success": true,
  "message": "Alert history cleared"
}
```

---

## 🎨 Форматирование

### Email

Алерты в Email форматируются как HTML с цветовой кодировкой по severity:
- 🔴 **CRITICAL**: красный (`#d32f2f`)
- 🟠 **ERROR**: оранжевый (`#f57c00`)
- 🟡 **WARNING**: желтый (`#fbc02d`)
- 🔵 **INFO**: синий (`#1976d2`)

### Slack

Slack алерты используют attachments с:
- Цветовая кодировка по severity
- Emoji индикаторы
- Structured fields
- Timestamp

### Webhook

Custom webhooks получают полный JSON объект алерта.

---

## ⏱️ Rate Limiting

### Cooldown период

- **По умолчанию**: 5 минут (300000 ms)
- Один и тот же алерт (title + type) не может быть отправлен чаще

### Alert Key

```javascript
const alertKey = `${type}:${title}`;
// Пример: "database:Database Connection Lost"
```

Если алерт в cooldown, отправка пропускается:
```json
{
  "skipped": true,
  "reason": "cooldown"
}
```

---

## 📝 История алертов

### Размер

- **Максимум**: 1000 алертов в памяти
- Старые алерты удаляются автоматически (FIFO)

### Фильтрация

```javascript
// По severity
alertManager.getHistory(50, { severity: 'critical' });

// По типу
alertManager.getHistory(50, { type: 'database' });

// Комбинированная
alertManager.getHistory(50, { 
  severity: 'critical',
  type: 'database' 
});
```

---

## 🚦 Health Check Интеграция

```javascript
const { alertHealthCheckFailed } = require('./src/alerting/alert-helpers');

const healthChecks = [
  { name: 'database', healthy: false, error: 'Connection timeout' },
  { name: 'redis', healthy: true },
  { name: 'api', healthy: false, error: 'High latency' }
];

// Отправляет алерт только если есть failed checks
await alertHealthCheckFailed(healthChecks, {
  checkInterval: '30s',
  timestamp: new Date().toISOString()
});
```

---

## 🧪 Тестирование

### Unit Tests

```bash
npm run test:unit -- alerts
```

### Integration Tests

```bash
npm run test:integration -- alerts
```

**Покрытие**:
- ✅ AlertManager основные методы
- ✅ Alert helpers
- ✅ REST API endpoints (admin only)
- ✅ Все severity levels
- ✅ Все alert types
- ✅ Rate limiting (cooldown)
- ✅ История и фильтрация
- ✅ Статистика
- ✅ Email/Slack/Webhook форматирование

---

## 📊 Метрики

```javascript
const stats = alertManager.getStats();

// Отправлено алертов по каналам
console.log(stats.sent.email);    // 15
console.log(stats.sent.slack);    // 42
console.log(stats.sent.webhook);  // 38

// Проваленные отправки
console.log(stats.failed.email);  // 1
console.log(stats.failed.slack);  // 0

// История
console.log(stats.historySize);   // 95

// Активные cooldowns
console.log(stats.cooldownActive); // 3
```

---

## 🔐 Безопасность

### Admin Only API

Все API endpoints требуют:
1. JWT authentication
2. Role = `admin`

```javascript
preHandler: [authenticate, requireRole(ROLES.ADMIN)]
```

### Секреты

- SMTP пароли
- Slack webhook URLs
- Custom webhook tokens

**Не логируются и не возвращаются через API.**

API endpoint `/api/alerts/config` возвращает только `[CONFIGURED]` для секретных полей.

---

## 🌐 Production Setup

### 1. Email (Gmail example)

```bash
# .env
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=ops@yourdomain.com,admin@yourdomain.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Gmail**: Используйте App Password (не основной пароль).

### 2. Slack

1. Создайте Incoming Webhook в Slack:
   - Settings → Apps → Incoming Webhooks
   - Add to Slack
   - Выберите channel (#alerts)
   - Скопируйте Webhook URL

```bash
# .env
ALERT_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
SLACK_CHANNEL=#alerts
```

### 3. Custom Webhook

```bash
# .env
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://your-monitoring-system.com/webhooks/alerts
ALERT_WEBHOOK_HEADERS='{"Authorization":"Bearer YOUR_SECRET_TOKEN"}'
```

---

## 📋 Best Practices

### 1. Используйте правильные Severity Levels

```javascript
// ❌ Неправильно
await alertManager.send({
  title: 'User logged in',
  severity: SEVERITY.CRITICAL  // Это не критично!
});

// ✅ Правильно
await alertManager.send({
  title: 'Database connection lost',
  severity: SEVERITY.CRITICAL
});
```

### 2. Добавляйте metadata

```javascript
// ❌ Мало информации
await alertDatabaseError(error);

// ✅ Полная информация
await alertDatabaseError(error, {
  host: 'localhost',
  port: 5432,
  database: 'rolgi_v6',
  query: 'SELECT * FROM games',
  duration: 5000,
  retries: 3
});
```

### 3. Выбирайте правильные каналы

```javascript
// CRITICAL → Email + Slack + Webhook
channels: ['email', 'slack', 'webhook']

// ERROR → Email + Slack
channels: ['email', 'slack']

// WARNING/INFO → Slack
channels: ['slack']
```

### 4. Не спамьте алертами

Cooldown механизм защищает от спама, но:
- Группируйте похожие алерты
- Используйте metadata для деталей
- Настройте адекватные thresholds

---

## 🔄 Обновления

### v6.1.0 (2026-01-30)
- ✅ Первая версия Alerting System
- ✅ Email, Slack, Webhook интеграции
- ✅ Rate limiting (cooldown)
- ✅ История алертов (1000 записей)
- ✅ REST API (admin only)
- ✅ 13 helper функций
- ✅ Полное покрытие тестами

---

## 🆘 Troubleshooting

### Email не отправляется

1. Проверьте SMTP credentials:
```bash
node -e "console.log(process.env.SMTP_USER, process.env.SMTP_PASS)"
```

2. Проверьте логи:
```bash
tail -f logs/backend-api.log | grep "email"
```

3. Тестовый алерт:
```bash
curl -X POST http://localhost:3000/api/alerts/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channels": ["email"]}'
```

### Slack не работает

1. Проверьте webhook URL:
```bash
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

2. Проверьте permissions в Slack workspace

### Алерты в cooldown

Это нормально! Cooldown защищает от спама. Подождите 5 минут или:
```javascript
// Manually clear cooldown (для тестирования)
alertManager.alertCooldown.clear();
```

---

## 📚 См. также

- [Authentication (JWT)](./AUTH.md)
- [WebSocket Real-time](./WEBSOCKET.md)
- [Monitoring & Health Checks](./MONITORING.md)
- [Redis Caching](./CACHE.md)

---

**Автор**: Rolgi Development Team  
**Дата**: 2026-01-30  
**Task ID**: 27 — Alerting System
