#!/bin/bash
set -e

echo '========================================='
echo '   Rolgi Deployment Script v6.0.0'
echo '========================================='
echo ''

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода ошибок
error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Функция для вывода успеха
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Функция для вывода предупреждений
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Проверка наличия .env файла
if [ ! -f .env ]; then
    error '.env файл не найден! Создайте его на основе .env.example'
fi

# Проверка Docker
if ! command -v docker &> /dev/null; then
    error 'Docker не установлен!'
fi

echo '1. Остановка существующих контейнеров...'
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
success 'Контейнеры остановлены'
echo ''

echo '2. Очистка старых образов...'
docker image prune -f > /dev/null 2>&1 || true
success 'Старые образы удалены'
echo ''

echo '3. Сборка Docker образа...'
docker compose -f docker-compose.prod.yml build --no-cache
success 'Образ собран'
echo ''

echo '4. Запуск контейнеров...'
docker compose -f docker-compose.prod.yml up -d
success 'Контейнеры запущены'
echo ''

echo '5. Ожидание готовности сервисов...'
sleep 10

# Проверка здоровья контейнеров
echo '6. Проверка статуса контейнеров...'
docker compose -f docker-compose.prod.yml ps
echo ''

echo '7. Проверка логов...'
docker compose -f docker-compose.prod.yml logs --tail=20
echo ''

success '========================================='
success '   Развертывание завершено!'
success '========================================='
echo ''
echo 'API доступен по адресу: http://158.69.195.140:3000'
echo 'Swagger UI: http://158.69.195.140:3000/docs'
echo 'Health Check: http://158.69.195.140:3000/health'
echo ''
echo 'Полезные команды:'
echo '  Логи всех сервисов: docker compose -f docker-compose.prod.yml logs -f'
echo '  Логи API: docker compose -f docker-compose.prod.yml logs -f api'
echo '  Перезапуск: docker compose -f docker-compose.prod.yml restart'
echo '  Остановка: docker compose -f docker-compose.prod.yml down'
echo ''
