# 🔍 Advanced Query Builder - Документация

## Обзор

Advanced Query Builder - это интерактивный инструмент для создания и выполнения продвинутых запросов к SStats API с графическим интерфейсом.

## Основные возможности

### ✅ 30+ готовых пресетов запросов

Все пресеты разделены на 7 категорий:

#### 🏆 Лиги (5 пресетов)
- Английская Премьер-лига 2024
- Ла Лига 2024  
- Серия А 2024
- Бундеслига 2024
- Лига 1 (Франция) 2024

#### 💰 Коэффициенты (5 пресетов)
- Явные фавориты (коэфф. 1.1-1.5)
- Средние фавориты (коэфф. 1.5-2.0)
- Равные противники (коэфф. 2.0-3.5)
- Высокие коэффициенты на ничью (> 3.5)
- Value bets (фаворит проиграл)

#### ⚽ Результативность (5 пресетов)
- Результативные матчи (> 4 голов)
- Очень результативные (> 6 голов)
- Малорезультативные (< 2 голов)
- Обе забили (BTTS)
- Разгромы (разница > 3 голов)

#### 📊 Expected Goals (4 пресета)
- Превышение xG хозяев (> 1.5)
- Недобор xG (забили < xG - 1.5)
- Точное соответствие xG (±0.5)
- Высокий xG, мало голов

#### 📈 Статистика (4 пресета)
- Много ударов, мало голов
- Высокая точность ударов (> 50% в створ)
- Доминирование владения (> 65%)
- Победа с низким владением (< 40%)

#### 👥 Команды (3 пресета)
- Топ-команды Англии
- Эль Класико (Real vs Barcelona)
- Дерби Манчестера

#### ⏰ Время (2 пресета)
- Матчи за последний месяц
- Матчи выходных

## API Эндпоинты

### GET /api/query/presets
Получить список всех готовых пресетов

**Response:**
```json
{
  "success": true,
  "count": 30,
  "categories": {...},
  "presets": [...]
}
```

### GET /api/query/presets/category/:category
Получить пресеты по категории

**Параметры:**
- `category` - leagues, odds, scoring, xg, stats, teams, time

### GET /api/query/presets/:id
Получить конкретный пресет по ID

### POST /api/query/execute
Выполнить кастомный запрос

**Body:**
```json
{
  "Condition": "LeagueId = 39 AND Year = 2024",
  "Fields": ["Date", "HomeTeamName", "AwayTeamName"],
  "Order": "Date DESC",
  "format": "json"
}
```

### POST /api/query/execute/preset/:id
Выполнить готовый пресет

**Body (optional):**
```json
{
  "overrides": {
    "Order": "ScoreHomeFT DESC"
  }
}
```

### GET /api/query/fields
Получить список доступных полей для запросов

## Frontend

### Доступ
Откройте браузер: `http://localhost:3000/query-builder.html`

### Интерфейс

#### Вкладка "Пресеты"
1. Выберите готовый запрос из списка слева
2. Просмотрите детали запроса
3. Нажмите "Выполнить запрос"
4. Результаты отобразятся внизу

#### Вкладка "Свой запрос"
1. Введите SQL-подобное условие
2. Выберите поля для вывода (чекбоксы)
3. Укажите сортировку (опционально)
4. Выберите формат (JSON/CSV)
5. Нажмите "Выполнить"

## Примеры использования

### JavaScript (Backend)
```javascript
const sstatsClient = new SStatsClient();

// Выполнить кастомный запрос
const result = await sstatsClient.queryGamesAdvanced({
  Condition: 'LeagueId = 39 AND (ScoreHomeFT + ScoreAwayFT) > 3',
  Fields: ['Date', 'HomeTeamName', 'AwayTeamName', 'ScoreHomeFT + ScoreAwayFT AS TotalGoals'],
  Order: 'TotalGoals DESC'
});
```

### JavaScript (Frontend)
```javascript
// Получить все пресеты
const response = await fetch('/api/query/presets');
const data = await response.json();

// Выполнить пресет
const result = await fetch('/api/query/execute/preset/high_scoring', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});
```

### cURL
```bash
# Получить пресеты по категории
curl http://localhost:3000/api/query/presets/category/odds

# Выполнить пресет
curl -X POST http://localhost:3000/api/query/execute/preset/high_scoring \
  -H "Content-Type: application/json" \
  -d '{}'

# Выполнить кастомный запрос
curl -X POST http://localhost:3000/api/query/execute \
  -H "Content-Type: application/json" \
  -d '{
    "Condition": "LeagueId = 39 AND Year = 2024",
    "Fields": ["Date", "HomeTeamName", "AwayTeamName"],
    "Order": "Date DESC"
  }'
```

## Доступные поля

### Основная информация
- `Id`, `Date`, `Year`
- `LeagueId`, `LeagueName`
- `HomeTeamName`, `AwayTeamName`
- `HomeTeamId`, `AwayTeamId`

### Счет
- `ScoreHomeFT`, `ScoreAwayFT`
- `ScoreHomeHT`, `ScoreAwayHT`

### Коэффициенты
- `Winner1`, `WinnerX`, `Winner2`

### Удары
- `TotalShotsHome`, `TotalShotsAway`
- `ShotsOnTargetHome`, `ShotsOnTargetAway`

### Expected Goals
- `ExpectedGoalsHome`, `ExpectedGoalsAway`

### Владение
- `PossessionHome`, `PossessionAway`

## SQL-подобный синтаксис

### Операторы сравнения
- `=`, `!=`, `>`, `>=`, `<`, `<=`

### Логические операторы
- `AND`, `OR`, `()`

### Математические операторы
- `+`, `-`, `*`, `/`
- `ABS()` - абсолютное значение

### Строковые операторы
- `LIKE 'Arsenal'` - точное совпадение
- `LIKE '%Manchester%'` - частичное совпадение

### Функции даты (примеры)
- `DATEADD(day, -30, GETDATE())`
- `DATEPART(weekday, Date)`

## Расширение системы

### Добавление нового пресета

Откройте `src/api/query-presets.js` и добавьте:

```javascript
my_custom_preset: {
  id: 'my_custom_preset',
  name: 'Мой пресет',
  category: 'scoring',
  description: 'Описание пресета',
  query: {
    Condition: 'LeagueId = 39',
    Fields: ['Date', 'HomeTeamName'],
    Order: 'Date DESC',
    format: 'json'
  },
  icon: '⚽'
}
```

Пресет автоматически появится в UI и API.

### Добавление новой категории

В `src/api/query-presets.js` в функции `getCategories()`:

```javascript
my_category: { name: 'Моя категория', icon: '🎯' }
```

## Производительность

- **Кэширование**: Результаты кэшируются на 5 минут
- **Rate Limiting**: 300 запросов/минуту с API ключом
- **Среднее время ответа**: 400-500ms

## Troubleshooting

### Ошибка: "Condition is required"
Убедитесь, что поле Condition заполнено

### Ошибка: "Fields array is empty"
Выберите хотя бы одно поле для вывода

### Ошибка: Syntax error
Проверьте SQL-синтаксис условия

### Пресеты не загружаются
Проверьте, что backend запущен и доступен

## См. также

- [ADVANCED_GAMES_QUERY.md](ADVANCED_GAMES_QUERY.md) - Полная документация API
- [TEST_REPORT.md](TEST_REPORT.md) - Отчет о тестировании
- [README.md](README.md) - Главная документация проекта
