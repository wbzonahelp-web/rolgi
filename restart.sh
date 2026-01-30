#!/bin/bash
echo 'Перезапуск сервисов...'
docker compose -f docker-compose.prod.yml restart
echo '✓ Сервисы перезапущены'
