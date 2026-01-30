# 🚀 ГОТОВО К РАЗВЕРТЫВАНИЮ!

## ✅ Все файлы для деплоя созданы и отправлены в GitHub

**Commit**: e0aacba  
**GitHub**: https://github.com/wbzonahelp-web/rolgi  
**Сервер**: 158.69.195.140  
**User**: sshauto  

---

## 📦 Что создано:

### 1. Скрипты автоматического развертывания

✅ **scripts/deploy.sh** (367 строк)
- Автоматический бэкап перед деплоем
- Клонирование/обновление кода из GitHub
- Установка зависимостей (backend + admin panel)
- Настройка окружения (.env)
- Запуск миграций БД
- Настройка PM2 (2 instances, cluster mode)
- Health check
- Автоматический откат при ошибках

✅ **scripts/ssh-connect.sh**
- Быстрое подключение к серверу

✅ **scripts/README.md**
- Документация для скриптов

### 2. Конфигурации

✅ **ecosystem.config.json**
- PM2 конфигурация для production
- 2 инстанса в cluster mode
- Auto-restart, memory limits, логирование

✅ **docker-compose.prod.yml**
- PostgreSQL + Redis + API + Nginx
- Health checks, volumes, networks
- Готовая production конфигурация

### 3. Документация

✅ **docs/DEPLOYMENT.md** (500+ строк)
- Пошаговое руководство по развертыванию
- 2 варианта: автоматический и ручной
- Настройка всех сервисов (PostgreSQL, Redis, Nginx, PM2)
- Конфигурация Nginx с WebSocket поддержкой
- Настройка Firewall (UFW)
- Мониторинг и логи
- Troubleshooting
- Безопасность (SSL, fail2ban)
- Чеклист развертывания

---

## 🎯 КАК РАЗВЕРНУТЬ НА СЕРВЕРЕ

### Вариант 1: Автоматический деплой (Рекомендуется)

#### Шаг 1: Подготовьте сервер (разово)

Подключитесь к серверу:
```bash
ssh sshauto@158.69.195.140
```

Установите необходимое ПО:
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 14
sudo apt-get install -y postgresql postgresql-contrib

# Redis
sudo apt-get install -y redis-server

# Nginx
sudo apt-get install -y nginx

# PM2
sudo npm install -g pm2

# Git
sudo apt-get install -y git
```

Настройте PostgreSQL:
```bash
sudo -u postgres psql

CREATE USER rolgi_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE rolgi OWNER rolgi_user;
GRANT ALL PRIVILEGES ON DATABASE rolgi TO rolgi_user;
\q
```

#### Шаг 2: Запустите автоматический деплой (с вашей машины)

```bash
# На вашей машине
cd /home/user/webapp

# Сделайте скрипт исполняемым (уже сделано)
chmod +x scripts/deploy.sh

# Запустите деплой
./scripts/deploy.sh production
```

Скрипт автоматически:
1. Создаст бэкап текущей версии
2. Склонирует код из GitHub
3. Установит зависимости
4. Настроит окружение
5. Запустит миграции
6. Настроит PM2
7. Проверит health check

⚠️ **ВАЖНО**: После первого деплоя отредактируйте `.env` на сервере:
```bash
ssh sshauto@158.69.195.140
nano /home/sshauto/apps/rolgi/webapp/.env
# Укажите правильные значения для DB, Redis, JWT_SECRET и т.д.

# Перезапустите после изменения .env
pm2 restart rolgi-api
```

---

### Вариант 2: Ручное развертывание

Следуйте подробной инструкции в **docs/DEPLOYMENT.md**

---

## 🔄 Обновление приложения

После изменений в коде просто запустите:

```bash
./scripts/deploy.sh production
```

Скрипт автоматически:
- Сделает бэкап
- Обновит код
- Установит новые зависимости
- Перезапустит PM2
- Проверит health

---

## 🔙 Откат к предыдущей версии

Если что-то пошло не так:

```bash
./scripts/deploy.sh production --rollback
```

---

## 📡 Эндпоинты после деплоя

После успешного развертывания будут доступны:

### API Endpoints
- **Health Check**: http://158.69.195.140/health
- **API Info**: http://158.69.195.140/api/versions
- **REST API v1**: http://158.69.195.140/api/v1/*
- **REST API v2**: http://158.69.195.140/api/v2/*
- **GraphQL**: http://158.69.195.140/graphql
- **Swagger Docs**: http://158.69.195.140/docs
- **Metrics**: http://158.69.195.140/metrics

### WebSocket
- **WebSocket**: ws://158.69.195.140/ws

### Admin Panel
- **Admin UI**: http://158.69.195.140/admin

### Monitoring (если настроен)
- **Prometheus**: http://158.69.195.140:9090
- **Grafana**: http://158.69.195.140:3001

---

## 📊 Проверка после деплоя

```bash
# Подключитесь к серверу
ssh sshauto@158.69.195.140

# Проверьте PM2 процессы
pm2 status

# Проверьте логи
pm2 logs rolgi-api

# Проверьте API
curl http://localhost:3000/health
curl http://localhost:3000/api/versions

# Проверьте извне (с вашей машины)
curl http://158.69.195.140/health
curl http://158.69.195.140/api/versions
```

---

## 🛠️ Полезные команды

### PM2
```bash
pm2 status              # Статус процессов
pm2 logs rolgi-api      # Логи API
pm2 monit               # Мониторинг в реальном времени
pm2 restart rolgi-api   # Перезапуск
pm2 stop rolgi-api      # Остановка
```

### Логи
```bash
# PM2 логи
pm2 logs rolgi-api --lines 100

# Nginx логи
sudo tail -f /var/log/nginx/rolgi_access.log
sudo tail -f /var/log/nginx/rolgi_error.log

# Системные логи
journalctl -u nginx -f
journalctl -u postgresql -f
```

### Система
```bash
# Статус сервисов
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis-server

# Перезапуск сервисов
sudo systemctl restart nginx
sudo systemctl restart postgresql
sudo systemctl restart redis-server
```

---

## 🔒 Важные настройки безопасности

### 1. Настройте .env файл
```bash
ssh sshauto@158.69.195.140
nano /home/sshauto/apps/rolgi/webapp/.env
```

Обязательно установите:
- `JWT_SECRET` - длинный случайный ключ
- `DB_PASSWORD` - надежный пароль PostgreSQL
- `REDIS_PASSWORD` - пароль для Redis (опционально)

### 2. Настройте Firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 3. Настройте SSL (рекомендуется)
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 4. Защитите sensitive endpoints
Отредактируйте `/etc/nginx/sites-available/rolgi`:
```nginx
location /metrics {
    proxy_pass http://localhost:3000;
    allow 127.0.0.1;
    deny all;
}
```

---

## 📚 Документация

- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Полное руководство по развертыванию
- **[scripts/README.md](scripts/README.md)** - Документация скриптов
- **[ecosystem.config.json](ecosystem.config.json)** - PM2 конфигурация
- **[docker-compose.prod.yml](docker-compose.prod.yml)** - Docker Compose

---

## ⚠️ Troubleshooting

### Деплой не запускается
```bash
# Проверьте, что скрипт исполняемый
chmod +x scripts/deploy.sh

# Проверьте доступность сервера
ping 158.69.195.140

# Проверьте SSH
ssh -v sshauto@158.69.195.140
```

### API не стартует
```bash
ssh sshauto@158.69.195.140

# Проверьте логи PM2
pm2 logs rolgi-api

# Проверьте .env
cat /home/sshauto/apps/rolgi/webapp/.env

# Проверьте PostgreSQL
sudo systemctl status postgresql

# Проверьте Redis
sudo systemctl status redis-server
```

### Nginx 502 Bad Gateway
```bash
# Проверьте, что API запущен
pm2 status

# Проверьте порты
sudo netstat -tulpn | grep :3000

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/rolgi_error.log
```

---

## 🎯 Следующие шаги

1. ✅ Запустите автоматический деплой: `./scripts/deploy.sh production`
2. ✅ Настройте `.env` файл на сервере
3. ✅ Проверьте health check: `curl http://158.69.195.140/health`
4. ✅ Настройте Nginx конфигурацию (WebSocket, Admin Panel)
5. ✅ Настройте Firewall (UFW)
6. ⚠️ Настройте SSL/TLS (Let's Encrypt) - РЕКОМЕНДУЕТСЯ
7. ⚠️ Настройте мониторинг (Prometheus + Grafana)
8. ⚠️ Настройте бэкапы БД

---

## 📞 Поддержка

При проблемах:
1. Проверьте **docs/DEPLOYMENT.md** - полное руководство
2. Проверьте логи PM2: `pm2 logs rolgi-api`
3. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/rolgi_error.log`
4. Откатитесь к предыдущей версии: `./scripts/deploy.sh production --rollback`

---

## ✅ Готово!

Все необходимые файлы для развертывания созданы и находятся в GitHub.

**Чтобы развернуть**, просто выполните:
```bash
./scripts/deploy.sh production
```

**GitHub**: https://github.com/wbzonahelp-web/rolgi  
**Commit**: e0aacba  
**Date**: 2026-01-30  

---

**🎉 Проект готов к production deployment!**
