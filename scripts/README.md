# 🚀 Deployment Scripts

Скрипты для автоматического развертывания Rolgi на production сервер.

## Файлы

### `deploy.sh`
Основной скрипт развертывания. Автоматизирует весь процесс деплоя.

**Возможности:**
- Создание бэкапов перед деплоем
- Клонирование/обновление кода из GitHub
- Установка зависимостей
- Настройка окружения
- Запуск миграций БД
- Настройка PM2
- Health check
- Автоматический откат в случае ошибок

**Использование:**
```bash
# Сделать исполняемым
chmod +x deploy.sh

# Production deployment
./deploy.sh production

# Staging deployment
./deploy.sh staging

# Откат к предыдущей версии
./deploy.sh production --rollback
```

### `ssh-connect.sh`
Быстрое подключение к серверу через SSH.

**Использование:**
```bash
chmod +x ssh-connect.sh
./ssh-connect.sh
```

## Переменные окружения

Можно переопределить через environment variables:

```bash
export DEPLOY_HOST="158.69.195.140"
export DEPLOY_USER="sshauto"
export DEPLOY_PORT="22"
```

## Требования

На локальной машине:
- SSH client
- Git
- Bash

На сервере:
- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Nginx
- PM2
- Git

## Процесс деплоя

1. **Проверка зависимостей** - проверяет наличие ssh и git
2. **Создание директорий** - создает /home/sshauto/apps/rolgi
3. **Бэкап** - сохраняет текущую версию в /home/sshauto/backups
4. **Деплой кода** - клонирует/обновляет из GitHub
5. **Установка зависимостей** - npm ci для backend и admin panel
6. **Настройка окружения** - создает .env из .env.example
7. **Миграции БД** - запускает миграции PostgreSQL
8. **Настройка PM2** - запускает API сервер через PM2
9. **Health check** - проверяет /health endpoint
10. **Отчет** - выводит информацию о деплое

## Откат (Rollback)

Если что-то пошло не так, можно откатиться:

```bash
./deploy.sh production --rollback
```

Скрипт восстановит последний бэкап из `/home/sshauto/backups/rolgi`.

Хранится последние 5 бэкапов.

## PM2 Commands

После деплоя полезные команды:

```bash
# На сервере
pm2 status              # Статус процессов
pm2 logs rolgi-api      # Логи API
pm2 restart rolgi-api   # Перезапуск
pm2 monit               # Мониторинг
pm2 stop rolgi-api      # Остановка
```

## Troubleshooting

### Ошибка подключения SSH
```bash
# Проверьте доступность сервера
ping 158.69.195.140

# Проверьте SSH
ssh -v sshauto@158.69.195.140
```

### Ошибка деплоя
```bash
# Проверьте логи PM2 на сервере
ssh sshauto@158.69.195.140
pm2 logs rolgi-api

# Откатитесь к предыдущей версии
./deploy.sh production --rollback
```

### Health check failed
```bash
# На сервере проверьте:
pm2 status
pm2 logs rolgi-api
curl http://localhost:3000/health
```

## Безопасность

⚠️ **ВАЖНО**: 
- Не храните пароли в скриптах
- Используйте SSH ключи вместо паролей
- Настройте .env файл на сервере вручную
- Ограничьте доступ к metrics и admin endpoints

## Ссылки

- [Полное руководство по развертыванию](../docs/DEPLOYMENT.md)
- [PM2 конфигурация](../ecosystem.config.json)
- [Docker Compose для production](../docker-compose.prod.yml)

## Поддержка

При проблемах:
1. Проверьте логи PM2: `pm2 logs rolgi-api`
2. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/rolgi_error.log`
3. Проверьте .env файл на сервере
4. Откатитесь к предыдущей версии: `./deploy.sh production --rollback`

---

**Последнее обновление**: 2026-01-30
