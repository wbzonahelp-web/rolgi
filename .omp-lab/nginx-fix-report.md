# Исправление nginx root для фронтенда Rolgi

## Проблема
Nginx 404 ошибки при попытке обращения к статическим файлам фронтенда.

## Диагностика
Файлы статики лежат на хосте в `/srv/projects/rolgi/www/`, но nginx (запущенный в Docker) не видит их по пути `/srv/projects/rolgi/www/`.

### Конфигурация (после мобильной оптимизации):

**nginx/conf.d/default.conf:**
```
root /srv/projects/rolgi/www;  # Путь ВНУТРИ контейнера
```

**docker-compose.override.yml:**
```yaml
volumes:
  - /srv/projects/rolgi/www:/srv/projects/rolgi/www:ro
```

### Причина 404:
Путь `/srv/projects/rolgi/www` внутри контейнера не существует (нет такой директории). Docker volume mount создал только то, что указан в `volumes` — и это пустая директория `/srv/projects/rolgi/www`.

Файлы остаются на хосте в `/srv/projects/rolgi/www/`.

## Решение

1. **nginx/conf.d/default.conf** — вернуть root в `/usr/share/nginx/html` (стандартный путь для nginx Docker image):
```
root /usr/share/nginx/html;
```

2. **docker-compose.override.yml** — volume mount оставить как было:
```yaml
volumes:
  - ./www:/usr/share/nginx/html:ro
```

Это обеспечит:
- Хост `/srv/projects/rolgi/www/` → контейнер `/usr/share/nginx/html/`
- Nginx root внутри контейнера → `/usr/share/nginx/html`
- Файлы будут доступны

## Коммиты

| Commit | Описание |
|---|---|
| `2fbac1d` | Первоначальная попытка: изменён nginx root (не верно) |
| `87426f5` | docker-compose volume mount на абсолютный путь (не верно) |
| (ожидается) | Вернуть nginx root + docker volume mount к правильным значениям |

## Перезапуск

```bash
sudo agent-dc rolgi restart nginx
# или
sudo docker restart rolgi-nginx
```
