# 📊 Advanced Games Query Endpoint Documentation

## Обзор

Эндпоинт `/Games/query` предоставляет мощный инструмент для продвинутой фильтрации футбольных матчей с использованием SQL-подобного синтаксиса.

## URL

```
POST https://api.sstats.net/Games/query
```

## Преимущества

- ✅ **Сложные фильтры** - комбинируйте множество условий с помощью логики AND/OR
- ✅ **Выбор полей** - выводите только нужные данные от базовой информации до детальной статистики
- ✅ **Математические выражения** - создавайте вычисляемые поля прямо в запросе
- ✅ **Гибкая сортировка** - упорядочивайте результаты по любым полям
- ✅ **Форматы экспорта** - JSON или CSV

## Параметры запроса

### Обязательные параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `Condition` | string | SQL-подобное условие фильтрации |
| `Fields` | array | Массив полей для вывода |

### Необязательные параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `Order` | string | - | Порядок сортировки |
| `format` | string | "json" | Формат ответа: "json" или "csv" |

## Синтаксис

### Операторы сравнения

- `=` - равно
- `!=` - не равно
- `>`, `>=` - больше, больше или равно
- `<`, `<=` - меньше, меньше или равно
- `LIKE` - поиск по строке (для текстовых полей)

### Логические операторы

- `AND` - логическое И
- `OR` - логическое ИЛИ
- `()` - группировка условий

### Математические операторы

- `+` - сложение
- `-` - вычитание
- `*` - умножение
- `/` - деление

### Работа со строками

- `LIKE 'Arsenal'` - точное совпадение
- `LIKE '%Manchester%'` - частичное совпадение
- ⚠️ **Внимание**: строки чувствительны к регистру!
- ⚠️ **Важно**: используйте одинарные кавычки `'`, а не двойные `"`

## Примеры использования

### Пример 1: Простой поиск матчей лиги

**Задача**: Найти все матчи Английской Премьер-лиги за 2024 год

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "LeagueId = 39 AND Year = 2024",
  Fields: ["Date", "HomeTeamName", "AwayTeamName", "ScoreHomeFT", "ScoreAwayFT"],
  format: "json"
});
```

**Результат**:
```json
[
  {
    "Date": "2024-01-20T15:00:00Z",
    "HomeTeamName": "Arsenal",
    "AwayTeamName": "Manchester City",
    "ScoreHomeFT": 2,
    "ScoreAwayFT": 1
  }
]
```

---

### Пример 2: Поиск матчей с определенными коэффициентами

**Задача**: Найти матчи, где фаворит имеет коэффициент от 1.3 до 1.7

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "(Winner1 >= 1.3 AND Winner1 <= 1.7) OR (Winner2 >= 1.3 AND Winner2 <= 1.7)",
  Fields: ["Date", "HomeTeamName", "AwayTeamName", "Winner1", "WinnerX", "Winner2"],
  Order: "Date DESC",
  format: "json"
});
```

---

### Пример 3: Результативные матчи

**Задача**: Найти матчи с общим количеством голов больше 3.5

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "(ScoreHomeFT + ScoreAwayFT) > 3",
  Fields: [
    "Date", "LeagueName", "HomeTeamName", "AwayTeamName",
    "ScoreHomeFT", "ScoreAwayFT",
    "ScoreHomeFT + ScoreAwayFT AS TotalGoals"
  ],
  Order: "TotalGoals DESC"
});
```

**Результат**:
```json
[
  {
    "Date": "2024-01-20T15:00:00Z",
    "LeagueName": "Premier League",
    "HomeTeamName": "Liverpool",
    "AwayTeamName": "Manchester United",
    "ScoreHomeFT": 4,
    "ScoreAwayFT": 3,
    "TotalGoals": 7
  }
]
```

---

### Пример 4: Анализ xG (ожидаемые голы)

**Задача**: Найти матчи, где команды забили больше ожидаемого

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "ExpectedGoalsHome > 0 AND (ScoreHomeFT - ExpectedGoalsHome) > 1",
  Fields: [
    "Date", "HomeTeamName", "ScoreHomeFT", "ExpectedGoalsHome",
    "ScoreHomeFT - ExpectedGoalsHome AS OverPerformance"
  ],
  Order: "OverPerformance DESC"
});
```

---

### Пример 5: Поиск матчей с интересной статистикой

**Задача**: Матчи с большим количеством ударов, но малым количеством голов

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "(TotalShotsHome + TotalShotsAway) > 30 AND (ScoreHomeFT + ScoreAwayFT) < 2",
  Fields: [
    "Date", "HomeTeamName", "AwayTeamName",
    "TotalShotsHome", "TotalShotsAway",
    "ScoreHomeFT", "ScoreAwayFT",
    "(TotalShotsHome + TotalShotsAway) / (ScoreHomeFT + ScoreAwayFT + 0.1) AS ShotsPerGoal"
  ],
  Order: "ShotsPerGoal DESC"
});
```

---

### Пример 6: Поиск по названию команды

**Задача**: Arsenal дома vs Manchester в гостях

```javascript
const result = await client.queryGamesAdvanced({
  Condition: "HomeTeamName LIKE 'Arsenal' AND AwayTeamName LIKE '%Manchester%'",
  Fields: ["Id", "Date", "HomeTeamName", "AwayTeamName"],
  Order: "Date DESC",
  format: "csv"
});
```

**Результат (CSV)**:
```csv
Id,Date,HomeTeamName,AwayTeamName
12345,2024-02-15,Arsenal,Manchester City
12346,2024-01-20,Arsenal,Manchester United
```

---

## Доступные поля

### Основная информация
- `Id` - ID матча
- `Date` - Дата и время матча
- `Year` - Год матча
- `LeagueId` - ID лиги
- `LeagueName` - Название лиги
- `HomeTeamName` - Название команды хозяев
- `AwayTeamName` - Название команды гостей
- `HomeTeamId` - ID команды хозяев
- `AwayTeamId` - ID команды гостей

### Счет
- `ScoreHomeFT` - Счет хозяев (full time)
- `ScoreAwayFT` - Счет гостей (full time)
- `ScoreHomeHT` - Счет хозяев (half time)
- `ScoreAwayHT` - Счет гостей (half time)

### Коэффициенты
- `Winner1` - Коэффициент на победу хозяев
- `WinnerX` - Коэффициент на ничью
- `Winner2` - Коэффициент на победу гостей

### Статистика ударов
- `TotalShotsHome` - Всего ударов хозяев
- `TotalShotsAway` - Всего ударов гостей
- `ShotsOnTargetHome` - Удары в створ хозяев
- `ShotsOnTargetAway` - Удары в створ гостей

### xG (Expected Goals)
- `ExpectedGoalsHome` - Ожидаемые голы хозяев
- `ExpectedGoalsAway` - Ожидаемые голы гостей

### Владение мячом
- `PossessionHome` - Владение мячом хозяев (%)
- `PossessionAway` - Владение мячом гостей (%)

## Использование в коде

### JavaScript/Node.js

```javascript
const SStatsClient = require('./sstats-client');

const client = new SStatsClient({
  apiKey: 'YOUR_API_KEY'
});

// Простой запрос
const games = await client.queryGamesAdvanced({
  Condition: "LeagueId = 39 AND Year = 2024",
  Fields: ["Date", "HomeTeamName", "AwayTeamName"]
});

// Сложный запрос с вычислениями
const analysis = await client.queryGamesAdvanced({
  Condition: "(ScoreHomeFT + ScoreAwayFT) > 3 AND ExpectedGoalsHome > 0",
  Fields: [
    "Date", "HomeTeamName", "AwayTeamName",
    "ScoreHomeFT", "ScoreAwayFT",
    "ScoreHomeFT + ScoreAwayFT AS TotalGoals",
    "ExpectedGoalsHome",
    "ScoreHomeFT - ExpectedGoalsHome AS Overperformance"
  ],
  Order: "Overperformance DESC"
});
```

### cURL

```bash
curl -X POST https://api.sstats.net/Games/query \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "Condition": "LeagueId = 39 AND Year = 2024",
    "Fields": ["Date", "HomeTeamName", "AwayTeamName"],
    "format": "json"
  }'
```

## Обработка ошибок

```javascript
try {
  const result = await client.queryGamesAdvanced({
    Condition: "Invalid syntax",
    Fields: ["Date"]
  });
} catch (error) {
  if (error.response?.status === 400) {
    console.error('Invalid query syntax:', error.response.data);
  } else if (error.response?.status === 401) {
    console.error('Invalid API key');
  } else {
    console.error('Request failed:', error.message);
  }
}
```

## Лучшие практики

1. **Валидация параметров**: Всегда проверяйте обязательные параметры перед отправкой
2. **Ограничение результатов**: Используйте специфичные условия для ограничения результатов
3. **Выбор полей**: Запрашивайте только необходимые поля для оптимизации производительности
4. **Обработка ошибок**: Всегда оборачивайте вызовы в try-catch
5. **Rate limiting**: Учитывайте лимиты API (300 запросов/минуту)
6. **Кэширование**: Используйте кэширование для часто запрашиваемых данных

## Ограничения

- Максимум **300 запросов в минуту** (с API ключом)
- Строки в условиях чувствительны к **регистру**
- Используйте **одинарные кавычки** для строковых значений
- Некоторые поля могут быть недоступны для определенных лиг

## Тестирование

Запустите тестовый скрипт:

```bash
# Установите API ключ в .env файл
echo "SSTATS_API_KEY=your_key_here" >> .env

# Запустите тесты
node tests/manual/test-games-query.js
```

## Поддержка

При возникновении проблем:
1. Проверьте синтаксис SQL-условий
2. Убедитесь, что API ключ валиден
3. Проверьте доступные поля для вашей лиги
4. Обратитесь к документации SStats API
