# Pull Request: Advanced Games Query Endpoint Implementation

## 🎯 Описание

Реализован продвинутый эндпоинт `/Games/query` для гибкой фильтрации футбольных матчей с использованием SQL-подобного синтаксиса.

## ✨ Что добавлено

### 1. Доработан метод `queryGamesAdvanced` в `src/api/sstats-client.js`

- ✅ Полная валидация входных параметров (`Condition`, `Fields`)
- ✅ Поддержка сложных SQL-подобных условий (AND/OR логика)
- ✅ Поддержка оператора LIKE для поиска по строкам
- ✅ Поддержка математических выражений в полях
- ✅ Гибкая сортировка (параметр `Order`)
- ✅ Экспорт в JSON и CSV форматы
- ✅ Подробная JSDoc документация с примерами

### 2. Создан тестовый скрипт `tests/manual/test-games-query.js`

Содержит 7 реальных примеров использования:
1. **Простой поиск матчей лиги** - Английская Премьер-лига 2024
2. **Поиск по коэффициентам** - фавориты с коэффициентом 1.3-1.7
3. **Результативные матчи** - с вычисляемым полем TotalGoals
4. **Анализ xG** - команды, забившие больше ожидаемого
5. **Статистика ударов** - много ударов, мало голов
6. **Поиск по названию** - Arsenal vs Manchester (LIKE оператор)
7. **CSV экспорт** - базовая информация в CSV

### 3. Документация `docs/ADVANCED_GAMES_QUERY.md`

- 📘 Полное описание API
- 📋 Таблица доступных полей
- 💡 Примеры использования
- 🔧 Синтаксис и операторы
- ⚠️ Ограничения и best practices
- 🧪 Инструкции по тестированию

### 4. Обновлен README.md

- Добавлена секция "Advanced Query"
- Добавлен пример использования продвинутого поиска
- Ссылка на подробную документацию

## 🧪 Тестирование

Все 7 примеров из документации SStats API полностью покрыты тестами:

```bash
# Установите API ключ
echo "SSTATS_API_KEY=your_key_here" >> .env

# Запустите тесты
node tests/manual/test-games-query.js
```

## 📊 Примеры использования

### Пример 1: Результативные матчи
```javascript
const result = await client.queryGamesAdvanced({
  Condition: "(ScoreHomeFT + ScoreAwayFT) > 3",
  Fields: [
    "Date", "HomeTeamName", "AwayTeamName",
    "ScoreHomeFT + ScoreAwayFT AS TotalGoals"
  ],
  Order: "TotalGoals DESC"
});
```

### Пример 2: Поиск по названию команды
```javascript
const result = await client.queryGamesAdvanced({
  Condition: "HomeTeamName LIKE 'Arsenal' AND AwayTeamName LIKE '%Manchester%'",
  Fields: ["Date", "HomeTeamName", "AwayTeamName"],
  format: "csv"
});
```

## 🔧 Технические детали

### Изменения в коде

- **Файл**: `src/api/sstats-client.js`
- **Метод**: `queryGamesAdvanced(queryParams)`
- **Строки**: 845-945 (ориентировочно)

### Новые возможности

1. **Валидация параметров**:
   - Проверка обязательного параметра `Condition`
   - Проверка массива `Fields` на пустоту
   - Опциональные параметры `Order` и `format`

2. **Поддержка форматов**:
   - JSON (по умолчанию)
   - CSV (с автоматическим изменением `responseType`)

3. **Логирование**:
   - Debug логи с информацией о запросе
   - Метрики выполнения

## ✅ Чеклист

- [x] Код реализован и протестирован
- [x] Добавлена JSDoc документация
- [x] Созданы тестовые сценарии
- [x] Написана подробная документация
- [x] Обновлен README.md
- [x] Все примеры из SStats API покрыты
- [x] Код соответствует стилю проекта
- [x] Коммит следует conventional commits

## 📝 Связанные файлы

- `src/api/sstats-client.js` - основная реализация
- `tests/manual/test-games-query.js` - тестовый скрипт
- `docs/ADVANCED_GAMES_QUERY.md` - документация
- `README.md` - обновленный README

## 🚀 Готово к deploy

Эндпоинт полностью готов к использованию и соответствует всем требованиям SStats API v0.9.13.0.

---

## 🔗 Ссылки

- SStats API Documentation: https://sstats.net/docs
- GitHub Issue: N/A (feature implementation)
- Related PR: N/A

---

**Reviewer checklist:**
- [ ] Код проверен и соответствует стандартам
- [ ] Документация полная и понятная
- [ ] Тесты запущены и проходят
- [ ] Нет конфликтов с main веткой
