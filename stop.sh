#!/bin/bash
echo 'Остановка всех сервисов...'
docker compose -f docker-compose.prod.yml down
echo '✓ Сервисы остановлены'
