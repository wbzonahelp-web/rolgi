# 🚀 Flashscore API - Быстрый старт

## 📋 Оглавление
- [Обзор](#обзор)
- [Эндпоинты](#эндпоинты)
- [Быстрые примеры](#быстрые-примеры)
- [Параметры фильтрации](#параметры-фильтрации)
- [Статусы матчей](#статусы-матчей)

---

## Обзор

Flashscore API (`/Ls/*`) предоставляет доступ к футбольным данным с гибкими возможностями фильтрации.

**Base URL**: `https://api.sstats.net`

### Доступные эндпоинты:
1. `GET /Ls/List` - Список матчей с фильтрацией
2. `GET /Ls/GameInfo` - Детальная информация о матче
3. `GET /Ls/Leagues` - Список лиг
4. `GET /Ls/Seasons` - Сезоны лиги

---

## Эндпоинты

### 1. GET /Ls/List - Список матчей

Получение списка матчей с гибкой фильтрацией.

**Параметры**:
```javascript
{
  // Фильтрация по дате
  Date: '2025-06-21',              // Конкретная дата
  From: '2025-06-01',              // Начальная дата
  To: '2025-06-30',                // Конечная дата
  TimeZone: 3,                     // Часовой пояс (по умолчанию 3)
  
  // Фильтрация по командам
  Team: 'arsenal/hA1Zm19f',        // Одна из команд
  HomeTeam: 'arsenal/hA1Zm19f',    // Команда хозяев
  AwayTeam: 'chelsea/4fGZN2oK',    // Команда гостей
  BothTeams: 'hA1Zm19f,tUxUbLR2',  // H2H (история встреч)
  
  // Фильтрация по турнирам
  LeagueId: 'england/premier-league',
  SeasonId: 'england/premier-league-2024-2025',
  Years: '2024-2025',
  Id: 'abc123,def456',             // ID матчей через запятую
  
  // Фильтрация по статусу
  Status: 3,                       // Конкретный статус
  Ended: true,                     // Только завершённые
  Live: true,                      // Только live
  Upcoming: true,                  // Только предстоящие
  
  // Пагинация и сортировка
  Limit: 100,                      // Лимит (1-1000)
  Offset: 0,                       // Пропустить N матчей
  Order: -1                        // Сортировка (-1: новые→старые, 1: старые→новые)
}
```

**Ответ**:
```json
{
  "status": "OK",
  "count": 321,
  "data": [...],
  "offset": 0,
  "TotalCount": 321,
  "traceId": "..."
}
```

---

### 2. GET /Ls/GameInfo - Детальная информация о матче

**Параметры**:
```javascript
{
  id: '000agg7D'  // ID матча
}
```

**Возвращает**:
- Полные данные о матче
- Составы команд
- События (голы, карточки, замены)
- Букмекерские коэффициенты
- Статистика
- Хронология событий

---

### 3. GET /Ls/Leagues - Список лиг

**Параметры**:
```javascript
{
  guid: '4a491dde-d6f7-ed11-aee5-96d15e4a6f69',  // GUID лиги (наивысший приоритет)
  id: 'england/premier-league',                   // ID лиги
  name: 'Premier'                                 // Поиск по названию (регистронезависимый)
}
```

**Без параметров**: возвращает все лиги

---

### 4. GET /Ls/Seasons - Сезоны лиги

**Параметры**:
```javascript
{
  leagueUid: '4a491dde-d6f7-ed11-aee5-96d15e4a6f69',  // UUID лиги
  leagueId: 'england/premier-league'                  // ID лиги
}
```

---

## Быстрые примеры

### JavaScript/Node.js

```javascript
const SStatsClient = require('./src/api/sstats-client');

const client = new SStatsClient({
  apiKey: process.env.SSTATS_API_KEY
});

// Пример 1: Матчи за конкретную дату
const todayGames = await client.getFlashscoreGames({
  Date: '2025-06-21',
  TimeZone: 3
});
console.log(`Найдено матчей: ${todayGames.count}`);

// Пример 2: Предстоящие матчи команды
const arsenalUpcoming = await client.getFlashscoreGames({
  Team: 'arsenal/hA1Zm19f',
  Upcoming: true
});

// Пример 3: История встреч двух команд (H2H)
const h2h = await client.getFlashscoreGames({
  BothTeams: 'hA1Zm19f,tUxUbLR2'  // Arsenal vs Manchester United
});

// Пример 4: Завершённые матчи лиги за период
const epl = await client.getFlashscoreGames({
  LeagueId: 'england/premier-league',
  From: '2025-06-01',
  To: '2025-06-30',
  Ended: true,
  Limit: 100
});

// Пример 5: Live матчи
const live = await client.getFlashscoreGames({
  Live: true,
  Limit: 50
});

// Пример 6: Детальная информация о матче
const gameDetails = await client.getFlashscoreGameInfo('000agg7D');
console.log(gameDetails.lineups);  // Составы
console.log(gameDetails.events);   // События
console.log(gameDetails.odds);     // Коэффициенты
console.log(gameDetails.stats);    // Статистика

// Пример 7: Поиск лиги
const premierLeagues = await client.getFlashscoreLeagues({
  name: 'Premier'
});

// Пример 8: Сезоны лиги
const seasons = await client.getFlashscoreSeasons({
  leagueId: 'england/premier-league'
});

// Пример 9: Пагинация (получить следующие 1000 матчей)
const nextPage = await client.getFlashscoreGames({
  LeagueId: 'england/premier-league',
  Offset: 1000,
  Limit: 1000
});
```

### cURL примеры

```bash
# Матчи за конкретную дату
curl "https://api.sstats.net/Ls/List?Date=2025-06-21&TimeZone=3" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# Предстоящие матчи команды
curl "https://api.sstats.net/Ls/List?Team=arsenal/hA1Zm19f&Upcoming=true" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# История встреч (H2H)
curl "https://api.sstats.net/Ls/List?BothTeams=hA1Zm19f,tUxUbLR2" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# Детальная информация о матче
curl "https://api.sstats.net/Ls/GameInfo?id=000agg7D" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# Список лиг
curl "https://api.sstats.net/Ls/Leagues" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# Поиск лиги по названию
curl "https://api.sstats.net/Ls/Leagues?name=Premier" \
  -H "Authorization: ApiKey YOUR_API_KEY"

# Сезоны лиги
curl "https://api.sstats.net/Ls/Seasons?leagueId=england/premier-league" \
  -H "Authorization: ApiKey YOUR_API_KEY"
```

---

## Параметры фильтрации

### Фильтрация по дате

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `Date` | string | Конкретная дата (все матчи за день) | `2025-06-21` |
| `From` | string | Начальная дата | `2025-06-01` |
| `To` | string | Конечная дата (строго до) | `2025-06-30` |
| `TimeZone` | number | Часовой пояс (-12 до 12) | `3` (по умолчанию) |

**Форматы дат**:
- Дата: `2025-06-17`
- Дата + время: `2025-06-17T14:23:30`
- Дата + время + пояс: `2025-06-17T14:23:30+02:00`

---

### Фильтрация по командам

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `Team` | string | ID одной из команд (хозяева ИЛИ гости) | `arsenal/hA1Zm19f` |
| `HomeTeam` | string | ID команды хозяев | `arsenal/hA1Zm19f` |
| `AwayTeam` | string | ID команды гостей | `chelsea/4fGZN2oK` |
| `BothTeams` | string | ID двух команд для H2H | `hA1Zm19f,tUxUbLR2` |

**Форматы ID команд**:
- Полный: `arsenal/hA1Zm19f`
- Короткий: `hA1Zm19f`

**Несколько команд**: Через запятую, например `hA1Zm19f,tUxUbLR2,4fGZN2oK`

---

### Фильтрация по турнирам

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `Id` | string | ID матча(ей) через запятую | `abc123,def456` |
| `LeagueId` | string | ID лиги | `england/premier-league` |
| `SeasonId` | string | ID сезона | `england/premier-league-2024-2025` |
| `Years` | string | Года сезона | `2024-2025` |

---

### Фильтрация по статусу

| Параметр | Тип | Описание |
|----------|-----|----------|
| `Status` | number | Конкретный статус (см. таблицу статусов) |
| `Ended` | boolean | Только завершённые матчи |
| `Live` | boolean | Только live матчи |
| `Upcoming` | boolean | Только предстоящие матчи |

---

### Пагинация и сортировка

| Параметр | Тип | Описание | Диапазон |
|----------|-----|----------|----------|
| `Limit` | number | Лимит результатов | 1-1000 (по умолчанию 1000) |
| `Offset` | number | Пропустить N матчей | 0-2147483647 |
| `Order` | number | Сортировка по дате | `-1` (новые→старые), `1` (старые→новые) |

**Пример пагинации**:
```javascript
// Страница 1: первые 1000 матчей
const page1 = await client.getFlashscoreGames({ LeagueId: 'england/premier-league', Limit: 1000, Offset: 0 });

// Страница 2: следующие 1000 матчей
const page2 = await client.getFlashscoreGames({ LeagueId: 'england/premier-league', Limit: 1000, Offset: 1000 });

// Страница 3: следующие 1000 матчей
const page3 = await client.getFlashscoreGames({ LeagueId: 'england/premier-league', Limit: 1000, Offset: 2000 });
```

---

## Статусы матчей

| ID | Название | Группа | Описание |
|----|----------|--------|----------|
| 1 | Не начался | Предстоящие | Матч ещё не начался |
| 2 | В прямом эфире | Live | Матч идёт |
| 3 | Завершён | Завершённые | Матч завершён |
| 5 | Отменён | Завершённые | Матч отменён |
| 6 | Дополнительное время | Live | Дополнительное время |
| 7 | Пенальти | Live | Серия пенальти |
| 9 | Техническая победа | Завершённые | Техническая победа |
| 10 | После дополнительного времени | Завершённые | Завершён после доп. времени |
| 11 | После пенальти | Завершённые | Завершён после пенальти |
| 12 | Первый тайм | Live | Идёт первый тайм |
| 13 | Второй тайм | Live | Идёт второй тайм |
| 36 | Прерван | Специальные | Матч прерван |
| 42 | Ожидание обновлений | Специальные | Ожидание обновлений |
| 43 | Отложен | Специальные | Матч отложен |
| 45 | К завершению | Live | К завершению |
| 46 | Технический перерыв | Live | Технический перерыв |
| 54 | Присуждён | Завершённые | Результат присуждён |

**Группы статусов**:
- **Предстоящие**: `Upcoming=true` → статусы 1, 2
- **Live**: `Live=true` → статусы 2, 6, 7, 12, 13, 45, 46
- **Завершённые**: `Ended=true` → статусы 3, 5, 9, 10, 11, 54

---

## 📝 Заметки

### Форматы ID команд
API поддерживает два формата ID команд:
1. **Полный**: `arsenal/hA1Zm19f` (slug + ID)
2. **Короткий**: `hA1Zm19f` (только ID)

Оба формата работают одинаково во всех параметрах (`Team`, `HomeTeam`, `AwayTeam`, `BothTeams`).

### H2H (История встреч)
Для получения истории встреч двух команд используйте параметр `BothTeams`:
```javascript
const h2h = await client.getFlashscoreGames({
  BothTeams: 'hA1Zm19f,tUxUbLR2'  // Arsenal vs Manchester United
});
```

### Обязательные параметры
⚠️ **ВАЖНО**: Эндпоинт `/Ls/List` требует хотя бы один параметр фильтрации.  
Запрос без параметров будет отклонён.

### Пагинация
- Максимум за один запрос: **1000 матчей**
- Для получения большего количества используйте `Offset`
- Поле `TotalCount` в ответе показывает общее количество

### Обновление данных
- **Матчевые данные и коэффициенты**: обновляются каждые 2-3 часа
- **Live матчи**: обновляются каждые 1-2 минуты

---

## 🔗 Дополнительные ресурсы

- **Тестовый скрипт**: `tests/manual/test-flashscore-api.js`
- **Отчёт о тестировании**: `FLASHSCORE_API_TEST_REPORT.md`
- **Клиент API**: `src/api/sstats-client.js`
- **Манифест эндпоинтов**: `src/api/sstats-endpoints.manifest.json`

---

**Документация подготовлена**: 2026-01-31  
**API Version**: SStats API v6.0.0  
**Статус**: Production Ready ✅
