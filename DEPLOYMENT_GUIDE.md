# 🚀 Руководство по развертыванию Rolgi v6.0.0

## 📋 Информация о сервере

**IP адрес:** 158.69.195.140  
**ОС:** Ubuntu Linux (6.14.0-34-generic)  
**RAM:** 46 GB  
**Диск:** 290 GB  
**Пользователь:** ubuntu

---

## ✅ Установленное ПО

- ✓ Git 2.48.1
- ✓ Docker 29.2.0
- ✓ Docker Compose v5.0.2
- ✓ Node.js v20.20.0
- ✓ npm 10.8.2
- ✓ Make, curl, wget, unzip

---

## 📁 Структура проекта

```
/home/ubuntu/rolgi/
├── .env                      # Production конфигурация
├── docker-compose.prod.yml   # Docker Compose для production
├── deploy.sh                 # Скрипт развертывания
├── logs.sh                   # Просмотр логов
├── restart.sh                # Перезапуск сервисов
├── stop.sh                   # Остановка сервисов
├── status.sh                 # Статус контейнеров
├── src/                      # Исходный код
├── admin-panel/              # Админ панель
├── nginx/                    # Nginx конфигурация
├── logs/                     # Логи приложения
└── data/                     # Данные приложения
```

---

## 🔑 Важная информация о безопасности

### Сгенерированные пароли (сохраните в безопасном месте!):

- **DB_PASSWORD:** P9opPWTMmijND5jnP2B7fvmv0Qldx4OuzKR0G5lfHE
- **REDIS_PASSWORD:** PFy7vnCZQMO5tOFN1iJuuwehhaj2xQL6sSP50t8hU
- **ADMIN_API_KEY:** Bqzp8fVtpbSVV2K8MtiSDWMw8R36O5x72lQtihw

### ⚠️ ВАЖНО: Перед запуском!

**Отредактируйте файл  и замените:**
```bash
SSTATS_API_KEY=YOUR_SSTATS_API_KEY_HERE
```

на ваш настоящий API ключ от SStats!

Для редактирования:
```bash
nano .env
# или
vi .env
```

---

## 🚀 Развертывание

### 1. Первое развертывание

```bash
cd /home/ubuntu/rolgi

# Убедитесь, что .env настроен правильно
nano .env

# Запустите развертывание
./deploy.sh
```

Процесс займет 3-5 минут. Скрипт:
1. Остановит старые контейнеры
2. Очистит старые образы
3. Соберет новый Docker образ
4. Запустит все сервисы (PostgreSQL, Redis, API, Nginx)
5. Проверит статус

### 2. После развертывания

API будет доступен по адресам:
- **API:** http://158.69.195.140:3000
- **Swagger UI:** http://158.69.195.140:3000/docs
- **Health Check:** http://158.69.195.140:3000/health
- **Nginx:** http://158.69.195.140

---

## 📊 Управление приложением

### Просмотр логов

```bash
# Все сервисы
./logs.sh

# Только API
./logs.sh api

# Только PostgreSQL
./logs.sh postgres

# Только Redis
./logs.sh redis
```

### Статус контейнеров

```bash
./status.sh
```

### Перезапуск сервисов

```bash
# Перезапуск всех сервисов
./restart.sh

# Перезапуск конкретного сервиса
docker compose -f docker-compose.prod.yml restart api
```

### Остановка приложения

```bash
./stop.sh
```

---

## 🔧 Полезные команды Docker

```bash
# Подключиться к контейнеру API
docker compose -f docker-compose.prod.yml exec api sh

# Подключиться к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U rolgi_user -d rolgi

# Подключиться к Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli

# Просмотр использования ресурсов
docker stats

# Очистка неиспользуемых ресурсов
docker system prune -a
```

---

## 🔄 Обновление приложения

```bash
cd /home/ubuntu/rolgi

# Получить последние изменения из GitHub
git pull origin main

# Пересобрать и перезапустить
./deploy.sh
```

---

## 🐛 Устранение неполадок

### API не запускается

```bash
# Проверьте логи
./logs.sh api

# Проверьте .env файл
cat .env | grep SSTATS_API_KEY

# Проверьте подключение к БД
docker compose -f docker-compose.prod.yml exec postgres pg_isready
```

### База данных не работает

```bash
# Проверьте логи PostgreSQL
./logs.sh postgres

# Пересоздайте контейнер
docker compose -f docker-compose.prod.yml up -d --force-recreate postgres
```

### Контейнер постоянно перезапускается

```bash
# Проверьте статус
docker compose -f docker-compose.prod.yml ps

# Посмотрите последние логи
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

---

## 📈 Мониторинг

### Health Check

```bash
curl http://localhost:3000/health
```

Ожидаемый ответ:
```json
{
  status: ok,
  timestamp: 2026-01-30T...,
  uptime: 123.45,
  database: connected,
  redis: connected
}
```

### Метрики (Prometheus)

```bash
curl http://localhost:3000/metrics
```

---

## 🔐 Безопасность

### Firewall (рекомендуется настроить)

```bash
# Установка UFW
sudo apt-get install ufw

# Разрешить SSH
sudo ufw allow 22/tcp

# Разрешить HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Разрешить API (опционально, если нужен прямой доступ)
sudo ufw allow 3000/tcp

# Включить firewall
sudo ufw enable
```

### SSL/HTTPS (рекомендуется для production)

1. Установите Certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
```

2. Получите сертификат:
```bash
sudo certbot --nginx -d yourdomain.com
```

---

## 📞 Контакты и поддержка

- **GitHub:** https://github.com/wbzonahelp-web/rolgi
- **API Documentation:** http://158.69.195.140:3000/docs

---

## 📝 Чеклист перед запуском

- [ ]  файл настроен с правильным SSTATS_API_KEY
- [ ] Все пароли сохранены в безопасном месте
- [ ] Docker и Docker Compose установлены
- [ ] Порты 80, 3000, 5432, 6379 свободны
- [ ] Достаточно места на диске (минимум 10 GB свободно)

---

**Создано:** 2026-01-30  
**Версия:** 6.0.0  
**Статус:** Готово к развертыванию ✅
