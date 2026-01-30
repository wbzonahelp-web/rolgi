#!/bin/bash
echo '=== Статус контейнеров ==='
docker compose -f docker-compose.prod.yml ps
echo ''
echo '=== Использование ресурсов ==='
docker stats --no-stream
