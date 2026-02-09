# 🔍 Полный список фильтров для всех API
**Дата:** 2026-01-31  
**Версия API:** 5.0.0  
**Всего фильтров:** 50+

---

## 📋 Сводная таблица фильтров

| Категория API | Количество фильтров | Обязательные | Опциональные |
|---------------|---------------------|--------------|--------------|
| **Flashscore API** | 20 | 0 | 20 |
| **Games API** | 18 | 1 | 17 |
| **Teams API** | 5 | 0 | 5 |
| **Odds API** | 4 | 0 | 4 |
| **Players API** | 3 | 0 | 3 |
| **ИТОГО** | **50** | **1** | **49** |

---

## 1️⃣ FLASHSCORE API ФИЛЬТРЫ (20)

### Фильтры для `/api/flashscore/games`

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 1 | `Date` | String | ❌ | - | Дата игр в формате YYYY-MM-DD | `2026-01-31` |
| 2 | `From` | String | ❌ | - | Начальная дата диапазона (YYYY-MM-DD) | `2026-01-01` |
| 3 | `To` | String | ❌ | - | Конечная дата диапазона (YYYY-MM-DD) | `2026-01-31` |
| 4 | `TimeZone` | Integer | ❌ | 0 | Часовой пояс (-12 до +12) | `3` (МСК) |
| 5 | `Team` | Integer/String | ❌ | - | ID команды или название | `42`, `Arsenal` |
| 6 | `HomeTeam` | Integer/String | ❌ | - | ID домашней команды | `42` |
| 7 | `AwayTeam` | Integer/String | ❌ | - | ID гостевой команды | `43` |
| 8 | `BothTeams` | String | ❌ | - | ID обеих команд через запятую | `42,43` |
| 9 | `LeagueId` | Integer/String | ❌ | - | ID лиги | `39` |
| 10 | `SeasonId` | String | ❌ | - | ID сезона | `2025-2026` |
| 11 | `Years` | String | ❌ | - | Год сезона | `2026` |
| 12 | `Live` | Boolean | ❌ | false | Только живые игры | `true`, `1` |
| 13 | `Ended` | Boolean | ❌ | false | Только завершённые игры | `true`, `1` |
| 14 | `Upcoming` | Boolean | ❌ | false | Только предстоящие игры | `true`, `1` |
| 15 | `Status` | Integer | ❌ | - | Статус игры (см. таблицу статусов) | `13` (Live) |
| 16 | `Limit` | Integer | ❌ | 100 | Количество результатов (1-1000) | `50` |
| 17 | `Offset` | Integer | ❌ | 0 | Смещение для пагинации | `100` |
| 18 | `Order` | Integer | ❌ | 1 | Порядок сортировки (-1 desc, 1 asc) | `-1` |

### Фильтры для `/api/flashscore/leagues`

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 19 | `name` | String | ❌ | - | Поиск лиги по названию | `Premier League` |
| 20 | `country` | String | ❌ | - | Фильтр по стране | `England` |

---

## 2️⃣ GAMES API ФИЛЬТРЫ (18)

### Фильтры для `/api/games/list`

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 1 | `Id` | String | ❌* | - | ID игры (обязателен хотя бы один фильтр) | `MwckPFV6` |
| 2 | `FlashId` | String | ❌* | - | Flashscore ID игры | `MwckPFV6` |
| 3 | `LeagueId` | Integer | ❌* | - | ID лиги | `39` |
| 4 | `SeasonUid` | String | ❌* | - | UID сезона | `9eab671c-ad40-11f0-982a-3cecef730a49` |
| 5 | `Year` | Integer | ❌* | - | Год сезона | `2026` |
| 6 | `From` | String | ❌* | - | Начальная дата (YYYY-MM-DD) | `2026-01-01` |
| 7 | `To` | String | ❌* | - | Конечная дата (YYYY-MM-DD) | `2026-01-31` |
| 8 | `HomeTeam` | String | ❌* | - | ID/название домашней команды | `Arsenal` |
| 9 | `AwayTeam` | String | ❌* | - | ID/название гостевой команды | `Chelsea` |
| 10 | `Team` | String | ❌* | - | ID/название любой команды | `Liverpool` |
| 11 | `BothTeams` | String | ❌* | - | ID обеих команд через запятую | `42,43` |
| 12 | `Status` | Integer | ❌* | - | Статус игры | `13` |
| 13 | `Ended` | Boolean | ❌* | false | Только завершённые | `true` |
| 14 | `Live` | Boolean | ❌* | false | Только живые | `true` |
| 15 | `Upcoming` | Boolean | ❌* | false | Только предстоящие | `true` |
| 16 | `Offset` | Integer | ❌ | 0 | Смещение | `0` |
| 17 | `Limit` | Integer | ❌ | 100 | Лимит (1-1000) | `50` |
| 18 | `Order` | Integer | ❌ | 1 | Сортировка | `-1` |

> **\* Важно:** Хотя бы один из фильтров должен быть указан для `/api/games/list`

### Дополнительные параметры

| # | Параметр | Тип | Используется в | Описание | Пример |
|---|----------|-----|----------------|----------|--------|
| 19 | `IncludeOdds` | Boolean | `/api/games/list` | Включить коэффициенты | `true` |
| 20 | `teamId` | Integer | `/api/games/last-games-stats` | ID команды для статистики | `42` |
| 21 | `limit` | Integer | `/api/games/profits` | Лимит для profits | `10` |
| 22 | `gameId` | String | `/api/games/text-summary` | ID игры для сводки | `MwckPFV6` |

---

## 3️⃣ TEAMS API ФИЛЬТРЫ (5)

### Фильтры для `/api/teams/list`

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 1 | `name` | String | ❌ | - | Поиск по названию команды | `Arsenal` |
| 2 | `country` | String | ❌ | - | Фильтр по стране | `England` |
| 3 | `Limit` | Integer | ❌ | 100 | Количество результатов (1-1000) | `50` |
| 4 | `Offset` | Integer | ❌ | 0 | Смещение для пагинации | `100` |

### Параметры в URL

| # | Параметр | Тип | Используется в | Описание | Пример |
|---|----------|-----|----------------|----------|--------|
| 5 | `:id` | Integer | `/api/teams/:id` | ID команды | `42` |

---

## 4️⃣ ODDS API ФИЛЬТРЫ (4)

### Фильтры для коэффициентов

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 1 | `Limit` | Integer | ❌ | 100 | Количество букмекеров | `10` |
| 2 | `gameId` | String | ✅* | - | ID игры для коэффициентов | `MwckPFV6` |

### Параметры в URL

| # | Параметр | Тип | Используется в | Описание | Пример |
|---|----------|-----|----------------|----------|--------|
| 3 | `:gameId` | String | `/api/odds/live/:gameId` | ID игры | `MwckPFV6` |
| 4 | `:gameId` | String | `/api/odds/live-changes/:gameId` | ID игры для изменений | `MwckPFV6` |

> **\*** gameId обязателен для некоторых эндпоинтов odds

---

## 5️⃣ PLAYERS API ФИЛЬТРЫ (3)

### Фильтры для игроков

| # | Параметр | Тип | Обязательный | По умолчанию | Описание | Пример |
|---|----------|-----|--------------|--------------|----------|--------|
| 1 | `name` | String | ❌ | - | Поиск игрока по имени | `Ronaldo` |
| 2 | `Limit` | Integer | ❌ | 100 | Количество результатов | `50` |

### Параметры в URL

| # | Параметр | Тип | Используется в | Описание | Пример |
|---|----------|-----|----------------|----------|--------|
| 3 | `:id` | Integer | `/api/players/:id/events` | ID игрока | `874` |

---

## 📊 Справочная информация

### Статусы игр

| Код | Название | Описание |
|-----|----------|----------|
| `1` | Not started | Игра ещё не началась |
| `2` | First Half | Первый тайм |
| `3` | Ended | Игра завершена |
| `13` | Live | Игра идёт (общий статус для live) |
| `14` | HT | Перерыв (Half Time) |
| `15` | ET | Дополнительное время (Extra Time) |
| `16` | Break Time | Перерыв перед доп. временем |
| `17` | PEN | Пенальти |
| `18` | AET | После доп. времени |
| `19` | Postponed | Отложена |
| `20` | Cancelled | Отменена |
| `21` | Abandoned | Прервана |
| `22` | Suspended | Приостановлена |
| `23` | Awarded | Присуждена победа |

### Коды стран (примеры)

| Код | Название | Abbr2 | Abbr3 |
|-----|----------|-------|-------|
| `8` | World | ww | WRL |
| `39` | England | eng | ENG |
| `176` | Spain | es | ESP |
| `98` | Italy | it | ITA |
| `88` | Germany | de | GER |
| `61` | France | fr | FRA |
| `155` | Portugal | pt | PRT |

### Популярные лиги (ID)

| ID | Название лиги | Страна |
|----|--------------|--------|
| `39` | Premier League | England |
| `140` | La Liga | Spain |
| `135` | Serie A | Italy |
| `78` | Bundesliga | Germany |
| `61` | Ligue 1 | France |
| `2` | Champions League | Europe |
| `3` | Europa League | Europe |

---

## 🔗 Примеры использования фильтров

### 1. Flashscore API - Живые игры Premier League
```bash
curl "http://localhost:3001/api/flashscore/games?Live=true&LeagueId=39&Limit=10"
```

### 2. Games API - Игры команды за период
```bash
curl "http://localhost:3001/api/games/list?Team=Arsenal&From=2026-01-01&To=2026-01-31&Limit=20"
```

### 3. Games API - H2H матчи двух команд
```bash
curl "http://localhost:3001/api/games/h2h/42/43?Limit=10"
```

### 4. Teams API - Поиск команд из England
```bash
curl "http://localhost:3001/api/teams/list?country=England&Limit=50"
```

### 5. Players API - Поиск игрока
```bash
curl "http://localhost:3001/api/players/find?name=Cristiano%20Ronaldo&Limit=10"
```

### 6. Odds API - Live коэффициенты игры
```bash
curl "http://localhost:3001/api/odds/live/MwckPFV6"
```

### 7. Flashscore API - Игры на конкретную дату
```bash
curl "http://localhost:3001/api/flashscore/games/date/2026-01-31?Limit=20"
```

### 8. Games API - Завершённые игры
```bash
curl "http://localhost:3001/api/games/ended?Limit=20"
```

### 9. Flashscore API - Игры с временной зоной
```bash
curl "http://localhost:3001/api/flashscore/games?Date=2026-01-31&TimeZone=3&Limit=10"
```

### 10. Games API - С включением коэффициентов
```bash
curl "http://localhost:3001/api/games/list?LeagueId=39&IncludeOdds=true&Limit=10"
```

---

## ⚙️ Комбинирование фильтров

### Пример 1: Сложный запрос для Flashscore API
```bash
# Живые игры Premier League на определённую дату
curl "http://localhost:3001/api/flashscore/games?\
Date=2026-01-31&\
LeagueId=39&\
Live=true&\
TimeZone=3&\
Limit=20&\
Offset=0&\
Order=-1"
```

### Пример 2: POST запрос с фильтрами (Games Query)
```bash
curl -X POST "http://localhost:3001/api/flashscore/games/query" \
  -H "Content-Type: application/json" \
  -d '{
    "Date": "2026-01-31",
    "LeagueId": 39,
    "Live": true,
    "Limit": 20
  }'
```

### Пример 3: Диапазон дат с командами
```bash
# Игры между двумя датами для конкретной команды
curl "http://localhost:3001/api/games/list?\
Team=Arsenal&\
From=2026-01-01&\
To=2026-01-31&\
Limit=50&\
Order=-1"
```

---

## 📝 Правила валидации

### Общие правила
1. **Limit**: Должен быть между 1 и 1000
2. **Offset**: Должен быть >= 0
3. **TimeZone**: Должен быть между -12 и +12
4. **Order**: Только -1 (DESC) или 1 (ASC)
5. **Boolean параметры**: Принимают `true`, `false`, `1`, `0`
6. **Даты**: Формат `YYYY-MM-DD` (например, `2026-01-31`)

### Специальные правила
- **Games API `/list`**: Требует хотя бы один фильтр из списка
- **Flashscore `/leagues/search`**: Требует параметр `name`
- **Odds endpoints**: Некоторые требуют обязательный `gameId`
- **Players `/find`**: Рекомендуется указать параметр `name`

---

## 🎯 Рекомендации

### Производительность
1. Используйте **Limit** для ограничения результатов
2. Комбинируйте фильтры для точного поиска
3. Используйте **Offset** для пагинации больших результатов
4. Кэшируйте результаты на клиенте

### Лучшие практики
1. Всегда указывайте **Limit** для предсказуемых результатов
2. Используйте **From/To** для диапазонов дат вместо множественных запросов
3. Комбинируйте **Live/Ended/Upcoming** с другими фильтрами
4. Используйте **IncludeOdds** только когда необходимо

---

**Автор:** GenSpark AI Developer  
**Дата создания:** 2026-01-31  
**Версия:** 1.0.0
