# Карта секретов

> Где какие секреты и credentials хранятся. Значения НЕ пишем сюда — только пути и назначение.

## .env файл

**Путь:** `/srv/projects/rolgi/.env`

**Формат:** `KEY=value` (одна переменная на строку)

**Важно:** НЕ читать весь файл (`cat .env`) — только grep по конкретному ключу!

### Переменные

| Ключ | Назначение |
|------|-----------|
| `DB_HOST` | Hostname PostgreSQL (обычно `rolgi-postgres`) |
| `DB_PORT` | Порт PostgreSQL (5432) |
| `DB_USER` | User для PostgreSQL (`postgres`) |
| `DB_PASSWORD` | Пароль для PostgreSQL |
| `DB_NAME` | Имя БД (`rolgi_v6`) |
| `REDIS_HOST` | Hostname Redis (обычно `rolgi-redis`) |
| `REDIS_PORT` | Порт Redis (6379) |
| `JWT_SECRET` | Secret для подписи JWT токенов |
| `SSTATS_API_KEY` | API ключ для sstats.io |
| `ANALYTICS_SERVICE_URL` | URL Python analytics (`http://analytics:8000`) |
| `NODE_ENV` | `production` или `development` |

## SSH ключи

**Путь:** `~/.ssh/` (на локальной машине пользователя)

| Файл | Назначение |
|------|-----------|
| `netcup_rolgi` | Приватный ключ для SSH к серверу |
| `netcup_rolgi.pub` | Публичный ключ |

**Использование через bifrost:**
```bash
# В OpenCode bifrost автоматически использует ключ из ~/.ssh/
bifrost_connect()  # подключается через ключ
```

## Secrets в Docker

Docker контейнеры читают `.env` файл через `env_file` опцию в `docker-compose.yml`.

**Как проверить env внутри контейнера:**
```bash
docker exec rolgi-api printenv | grep DB_
```

## GitHub Deploy Key (если используется)

Если проект деплоится через git pull — может быть deploy key в `~/.ssh/` на сервере.

**Проверка:**
```bash
ssh-add -l  # показывает загруженные ключи в ssh-agent
```

## API tokens для внешних сервисов

### sstats.io
API key хранится в `.env` (`SSTATS_API_KEY`).

**Endpoint:** передаётся в header `X-API-Key` при запросах к sstats.io.

## Как безопасно читать секрет

**Правильно:**
```bash
grep '^JWT_SECRET=' /srv/projects/rolgi/.env
# или
docker exec rolgi-api printenv JWT_SECRET
```

**Неправильно:**
```bash
cat /srv/projects/rolgi/.env  # раскроет ВСЕ секреты в лог!
```

## Ротация секретов

Если нужно изменить секрет:
1. Обновить значение в `.env`
2. Рестартовать контейнеры: `docker-compose restart`
3. НЕ коммитить `.env` в git (он в `.gitignore`)

## Проверка что секреты не в репо

```bash
git ls-files | grep -E '\.env$|secret|password|token'
```

Должно быть пусто (кроме `.env.example` если есть).
