#!/bin/bash
echo 'Просмотр логов (Ctrl+C для выхода)...'
docker compose -f docker-compose.prod.yml logs -f "$@"
