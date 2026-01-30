# 🚀 Руководство по развертыванию Rolgi на сервер

## Информация о сервере

- **IP**: 158.69.195.140
- **User**: sshauto
- **SSH Port**: 22
- **OS**: Linux (предположительно Ubuntu/Debian)

---

## 📋 Предварительные требования

### На сервере должны быть установлены:

1. **Node.js** (v20+)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **PostgreSQL** (14+)
```bash
sudo apt-get install -y postgresql postgresql-contrib
```

3. **Redis** (7+)
```bash
sudo apt-get install -y redis-server
```

4. **Nginx**
```bash
sudo apt-get install -y nginx
```

5. **PM2** (глобально)
```bash
sudo npm install -g pm2
```

6. **Git**
```bash
sudo apt-get install -y git
```

---

## 🔧 Шаги развертывания

### Вариант 1: Автоматический деплой (рекомендуется)

#### 1. Сделайте скрипт исполняемым:
```bash
chmod +x scripts/deploy.sh
```

#### 2. Установите переменные окружения (опционально):
```bash
export DEPLOY_HOST="158.69.195.140"
export DEPLOY_USER="sshauto"
export DEPLOY_PORT="22"
```

#### 3. Запустите деплой:
```bash
# Production deployment
./scripts/deploy.sh production

# Staging deployment
./scripts/deploy.sh staging
```

#### 4. В случае проблем - откат:
```bash
./scripts/deploy.sh production --rollback
```

---

### Вариант 2: Ручное развертывание

#### Шаг 1: Подключитесь к серверу

```bash
ssh sshauto@158.69.195.140
```

#### Шаг 2: Создайте директории

```bash
mkdir -p /home/sshauto/apps/rolgi
mkdir -p /home/sshauto/apps/rolgi/logs
mkdir -p /home/sshauto/backups/rolgi
cd /home/sshauto/apps/rolgi
```

#### Шаг 3: Клонируйте репозиторий

```bash
git clone https://github.com/wbzonahelp-web/rolgi.git webapp
cd webapp
git checkout main
```

#### Шаг 4: Установите зависимости

```bash
# Backend dependencies
npm ci --production

# Admin Panel
cd admin-panel
npm ci
npm run build
cd ..
```

#### Шаг 5: Настройте переменные окружения

```bash
# Скопируйте шаблон
cp .env.example .env

# Отредактируйте .env
nano .env
```

**Важные переменные для .env:**

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/rolgi"
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="rolgi"
DB_USER="rolgi_user"
DB_PASSWORD="your_secure_password"
DB_SSL="false"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""  # Если установлен

# API
API_PORT="3000"
API_HOST="0.0.0.0"
NODE_ENV="production"

# JWT
JWT_SECRET="your_very_long_random_secret_key_here"
JWT_ACCESS_EXPIRY="24h"
JWT_REFRESH_EXPIRY="7d"

# Rate Limiting
RATE_LIMIT_ENABLED="true"
RATE_LIMIT_MAX="100"
RATE_LIMIT_WINDOW="60000"

# Alerting (опционально)
# Email
EMAIL_ENABLED="true"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
ALERT_EMAIL_FROM="alerts@rolgi.com"
ALERT_EMAIL_TO="admin@rolgi.com"

# Slack (опционально)
ALERT_SLACK_ENABLED="true"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
SLACK_CHANNEL="#alerts"

# Webhook (опционально)
ALERT_WEBHOOK_ENABLED="false"
ALERT_WEBHOOK_URL=""
```

#### Шаг 6: Настройте PostgreSQL

```bash
# Войдите в PostgreSQL
sudo -u postgres psql

# Создайте пользователя и базу данных
CREATE USER rolgi_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE rolgi OWNER rolgi_user;
GRANT ALL PRIVILEGES ON DATABASE rolgi TO rolgi_user;

# Выход
\q
```

#### Шаг 7: Запустите миграции

```bash
cd /home/sshauto/apps/rolgi/webapp
node migrations/run-migrations.js
```

#### Шаг 8: Настройте PM2

```bash
# Запустите API сервер
pm2 start ecosystem.config.json

# Проверьте статус
pm2 status

# Посмотрите логи
pm2 logs rolgi-api

# Сохраните конфигурацию
pm2 save

# Настройте автозапуск
pm2 startup
# Выполните команду, которую выведет PM2
```

#### Шаг 9: Настройте Nginx

```bash
# Создайте конфигурацию Nginx
sudo nano /etc/nginx/sites-available/rolgi
```

**Конфигурация Nginx:**

```nginx
# Основной сервер
server {
    listen 80;
    server_name 158.69.195.140;  # Или ваш домен

    # Логи
    access_log /var/log/nginx/rolgi_access.log;
    error_log /var/log/nginx/rolgi_error.log;

    # Увеличиваем лимиты
    client_max_body_size 20M;

    # REST API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # GraphQL
    location /graphql {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Swagger docs
    location /docs {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }

    # Metrics (защитите в production!)
    location /metrics {
        proxy_pass http://localhost:3000;
        # allow 127.0.0.1;
        # deny all;
    }

    # Admin Panel (статические файлы)
    location /admin {
        alias /home/sshauto/apps/rolgi/webapp/admin-panel/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Корневая страница
    location / {
        return 200 '{"status":"ok","message":"Rolgi API is running"}';
        add_header Content-Type application/json;
    }
}

# Prometheus (опционально)
server {
    listen 9090;
    server_name 158.69.195.140;
    
    location / {
        proxy_pass http://localhost:9090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        
        # Ограничьте доступ
        # allow 192.168.1.0/24;
        # deny all;
    }
}

# Grafana (опционально)
server {
    listen 3001;
    server_name 158.69.195.140;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

**Активируйте конфигурацию:**

```bash
# Включите сайт
sudo ln -s /etc/nginx/sites-available/rolgi /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезагрузите Nginx
sudo systemctl reload nginx
```

#### Шаг 10: Настройте Firewall (UFW)

```bash
# Разрешите необходимые порты
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (для будущего)

# Опционально для monitoring (закройте позже)
sudo ufw allow 9090/tcp  # Prometheus
sudo ufw allow 3001/tcp  # Grafana

# Включите firewall
sudo ufw enable

# Проверьте статус
sudo ufw status
```

#### Шаг 11: Настройте мониторинг (опционально)

```bash
cd /home/sshauto/apps/rolgi/webapp

# Запустите Prometheus + Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# Проверьте статус
docker-compose -f docker-compose.monitoring.yml ps
```

---

## ✅ Проверка развертывания

### 1. Проверьте процессы PM2:
```bash
pm2 status
pm2 logs rolgi-api --lines 50
```

### 2. Проверьте API:
```bash
# Health check
curl http://localhost:3000/health

# API version info
curl http://localhost:3000/api/versions

# REST API (V2)
curl http://localhost:3000/api/v2/games?limit=5
```

### 3. Проверьте через внешний IP:
```bash
curl http://158.69.195.140/health
curl http://158.69.195.140/api/versions
```

### 4. Проверьте WebSocket:
```bash
# Установите wscat
npm install -g wscat

# Подключитесь к WebSocket
wscat -c ws://158.69.195.140/ws
```

### 5. Проверьте мониторинг:
```bash
# Prometheus
curl http://158.69.195.140:9090

# Grafana
curl http://158.69.195.140:3001

# Metrics endpoint
curl http://158.69.195.140/metrics
```

---

## 🔄 Обновление приложения

### Автоматическое обновление:
```bash
./scripts/deploy.sh production
```

### Ручное обновление:
```bash
ssh sshauto@158.69.195.140

cd /home/sshauto/apps/rolgi/webapp
git pull origin main
npm ci --production

# Rebuild Admin Panel если нужно
cd admin-panel && npm run build && cd ..

# Перезапустите PM2
pm2 restart rolgi-api

# Проверьте
pm2 logs rolgi-api
```

---

## 🔙 Откат к предыдущей версии

### Автоматический откат:
```bash
./scripts/deploy.sh production --rollback
```

### Ручной откат:
```bash
ssh sshauto@158.69.195.140

cd /home/sshauto/backups/rolgi
ls -lt  # Найдите нужный бэкап

# Восстановите
cd /home/sshauto/apps/rolgi
rm -rf webapp
tar -xzf /home/sshauto/backups/rolgi/rolgi_TIMESTAMP.tar.gz

cd webapp
npm ci --production
pm2 restart rolgi-api
```

---

## 📊 Мониторинг и логи

### PM2 команды:
```bash
pm2 status              # Статус процессов
pm2 logs rolgi-api      # Просмотр логов
pm2 monit               # Мониторинг в реальном времени
pm2 restart rolgi-api   # Перезапуск
pm2 stop rolgi-api      # Остановка
pm2 delete rolgi-api    # Удаление процесса
```

### Логи Nginx:
```bash
sudo tail -f /var/log/nginx/rolgi_access.log
sudo tail -f /var/log/nginx/rolgi_error.log
```

### Системные логи:
```bash
journalctl -u nginx -f
journalctl -u postgresql -f
```

---

## 🔒 Безопасность

### 1. Настройте SSL/TLS (Let's Encrypt):
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 2. Защитите endpoints:
```nginx
# В /etc/nginx/sites-available/rolgi
location /metrics {
    proxy_pass http://localhost:3000;
    allow 127.0.0.1;
    deny all;
}
```

### 3. Настройте fail2ban:
```bash
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. Регулярные обновления:
```bash
sudo apt-get update
sudo apt-get upgrade
```

---

## 🛠️ Troubleshooting

### Проблема: API не запускается

**Решение:**
```bash
# Проверьте логи PM2
pm2 logs rolgi-api

# Проверьте .env файл
cat /home/sshauto/apps/rolgi/webapp/.env

# Проверьте PostgreSQL
sudo systemctl status postgresql

# Проверьте Redis
sudo systemctl status redis-server
```

### Проблема: Nginx 502 Bad Gateway

**Решение:**
```bash
# Проверьте, запущен ли API
pm2 status

# Проверьте порты
sudo netstat -tulpn | grep :3000

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/rolgi_error.log
```

### Проблема: Database connection failed

**Решение:**
```bash
# Проверьте PostgreSQL
sudo systemctl status postgresql

# Проверьте подключение
psql -h localhost -U rolgi_user -d rolgi

# Проверьте .env
grep DATABASE /home/sshauto/apps/rolgi/webapp/.env
```

---

## 📞 Полезные команды

```bash
# Системная информация
uname -a
cat /etc/os-release
df -h
free -h
top

# Node.js и npm
node -v
npm -v
which node

# Проверка портов
sudo netstat -tulpn | grep LISTEN
sudo lsof -i :3000

# Проверка процессов
ps aux | grep node
ps aux | grep nginx

# Перезагрузка служб
sudo systemctl restart nginx
sudo systemctl restart postgresql
sudo systemctl restart redis-server
```

---

## 📚 Дополнительные ресурсы

- **GitHub**: https://github.com/wbzonahelp-web/rolgi
- **API Docs**: http://158.69.195.140/docs
- **Prometheus**: http://158.69.195.140:9090
- **Grafana**: http://158.69.195.140:3001

---

## ✅ Чеклист развертывания

- [ ] Node.js 20+ установлен
- [ ] PostgreSQL 14+ установлен и настроен
- [ ] Redis 7+ установлен
- [ ] Nginx установлен и настроен
- [ ] PM2 установлен глобально
- [ ] Репозиторий склонирован
- [ ] Зависимости установлены
- [ ] .env файл настроен
- [ ] База данных создана
- [ ] Миграции выполнены
- [ ] PM2 запущен и настроен автозапуск
- [ ] Nginx конфигурация активирована
- [ ] Firewall настроен
- [ ] Health check проходит
- [ ] API доступен извне
- [ ] WebSocket работает
- [ ] Мониторинг настроен (опционально)
- [ ] SSL/TLS настроен (рекомендуется)
- [ ] Бэкапы настроены

---

**Последнее обновление**: 2026-01-30  
**Версия**: 1.0.0
