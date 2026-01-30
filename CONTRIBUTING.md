# Contributing to Rolgi SStats Analytics Platform

🎉 **Спасибо за интерес к контрибуции в Rolgi!**

Мы приветствуем любые формы контрибуции: от исправления опечаток до реализации крупных функций.

---

## 📋 Содержание

- [Code of Conduct](#code-of-conduct)
- [Как контрибутить](#как-контрибутить)
- [Процесс разработки](#процесс-разработки)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Тестирование](#тестирование)
- [Документация](#документация)
- [Отчет об ошибках](#отчет-об-ошибках)
- [Предложения функций](#предложения-функций)

---

## Code of Conduct

Участвуя в этом проекте, вы соглашаетесь соблюдать наш [Code of Conduct](CODE_OF_CONDUCT.md).

Основные принципы:
- 🤝 Уважительное общение
- 🌈 Инклюзивность и разнообразие
- 🎯 Конструктивная критика
- 📚 Помощь новичкам

---

## Как контрибутить

### 1. Fork репозитория

```bash
# Fork через GitHub UI, затем:
git clone https://github.com/your-username/rolgi.git
cd rolgi
git remote add upstream https://github.com/wbzonahelp-web/rolgi.git
```

### 2. Настройка окружения

```bash
# Установить зависимости
npm install

# Создать .env
cp .env.example .env
nano .env  # Настроить DATABASE_URL и SSTATS_API_KEY

# Инициализировать БД
createdb rolgi_v6_dev
npm run db:init

# Проверить установку
npm run preflight
npm test
```

### 3. Создать feature ветку

```bash
# Всегда создавайте ветку от main
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

### 4. Разработка

```bash
# Запустить в dev режиме
npm run dev

# Запустить тесты в watch режиме
npm run test:watch

# Проверить код
npm run lint
npm run format
```

### 5. Commit изменений

```bash
git add .
git commit -m "feat(scope): add your feature"
```

См. [Commit Guidelines](#commit-guidelines) для деталей.

### 6. Push и создание PR

```bash
git push origin feature/your-feature-name

# Создать Pull Request на GitHub
# https://github.com/wbzonahelp-web/rolgi/compare
```

---

## Процесс разработки

### Git Workflow

```
main (production)
  │
  ├── develop (разработка)
  │     │
  │     ├── feature/new-feature
  │     ├── feature/another-feature
  │     └── bugfix/fix-something
  │
  └── hotfix/urgent-fix (срочное исправление для production)
```

### Правила веток

- **`main`** - production ветка (защищена, только через PR)
- **`develop`** - ветка разработки (все фичи мержатся сюда)
- **`feature/*`** - новые функции (создаются от `develop`)
- **`bugfix/*`** - исправления багов (создаются от `develop`)
- **`hotfix/*`** - срочные исправления (создаются от `main`, мержатся в `main` и `develop`)

### Синхронизация с upstream

```bash
# Перед началом работы всегда синхронизируйтесь
git fetch upstream
git rebase upstream/main

# Или через merge
git merge upstream/main

# В случае конфликтов
git status
# Отредактировать конфликтные файлы
git add <resolved-files>
git rebase --continue
```

---

## Code Style

### ESLint & Prettier

```bash
# Проверка кода
npm run lint

# Автофикс проблем
npm run lint:fix

# Форматирование кода
npm run format
```

### Конфигурация

- **ESLint**: `.eslintrc.json`
- **Prettier**: `.prettierrc`
- **EditorConfig**: `.editorconfig`

### Правила кодирования

#### 1. **JavaScript Style**

```javascript
// ✅ GOOD
const getGames = async (filters = {}) => {
  const { limit = 10, offset = 0 } = filters;
  
  try {
    const games = await db.query(
      'SELECT * FROM games LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return { success: true, data: games.rows };
  } catch (error) {
    logger.error('Failed to fetch games', { error, filters });
    throw new Error(`Failed to fetch games: ${error.message}`);
  }
};

// ❌ BAD
function getGames(filters) {
  if (!filters) filters = {};
  let limit = filters.limit || 10;
  let offset = filters.offset || 0;
  
  return db.query('SELECT * FROM games LIMIT $1 OFFSET $2', [limit, offset])
    .then(games => ({ success: true, data: games.rows }))
    .catch(error => {
      console.log('Error:', error);
      throw error;
    });
}
```

#### 2. **JSDoc комментарии**

```javascript
/**
 * Fetches games from database with optional filtering
 * 
 * @param {Object} [filters={}] - Filter options
 * @param {number} [filters.limit=10] - Max number of games to return
 * @param {number} [filters.offset=0] - Offset for pagination
 * @param {string} [filters.status] - Filter by game status
 * @returns {Promise<{success: boolean, data: Array}>} Result object
 * @throws {Error} If database query fails
 * 
 * @example
 * const result = await getGames({ limit: 20, status: 'live' });
 * console.log(result.data); // Array of games
 */
const getGames = async (filters = {}) => {
  // ...
};
```

#### 3. **Обработка ошибок**

```javascript
// ✅ GOOD - детальное логирование и понятное сообщение
try {
  const result = await externalAPI.call();
  return result;
} catch (error) {
  logger.error('External API call failed', {
    error: error.message,
    stack: error.stack,
    endpoint: '/api/games',
    timestamp: new Date().toISOString()
  });
  
  throw new Error(`Failed to fetch data from API: ${error.message}`);
}

// ❌ BAD - проглатывание ошибки
try {
  const result = await externalAPI.call();
  return result;
} catch (error) {
  console.log('Error');
  return null;
}
```

#### 4. **Async/Await vs Promises**

```javascript
// ✅ GOOD - async/await (предпочтительно)
const loadGames = async () => {
  const apiData = await fetchFromAPI();
  const validated = await validateData(apiData);
  const saved = await saveToDatabase(validated);
  return saved;
};

// ❌ AVOID - promise chains (только если необходимо)
const loadGames = () => {
  return fetchFromAPI()
    .then(apiData => validateData(apiData))
    .then(validated => saveToDatabase(validated));
};
```

#### 5. **Константы и конфигурация**

```javascript
// ✅ GOOD - константы в отдельном файле/секции
const DEFAULTS = {
  PAGINATION_LIMIT: 10,
  MAX_RETRY_ATTEMPTS: 3,
  CACHE_TTL_SECONDS: 300
};

const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// ❌ BAD - magic numbers/strings
if (status === 'pending') {  // Что значит 'pending'?
  retry = 3;  // Почему 3?
}
```

---

## Commit Guidelines

### Conventional Commits

Мы используем [Conventional Commits](https://www.conventionalcommits.org/) стандарт:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Типы коммитов

| Тип | Описание | Пример |
|-----|----------|--------|
| `feat` | Новая функциональность | `feat(api): add games endpoint` |
| `fix` | Исправление бага | `fix(loader): resolve race condition` |
| `docs` | Изменения в документации | `docs(readme): update installation guide` |
| `style` | Форматирование, отступы | `style: format with prettier` |
| `refactor` | Рефакторинг кода | `refactor(db): optimize query performance` |
| `test` | Добавление/изменение тестов | `test(api): add games endpoint tests` |
| `chore` | Обновление конфигурации | `chore: update dependencies` |
| `perf` | Улучшение производительности | `perf(loader): reduce memory usage` |
| `ci` | Изменения CI/CD | `ci: add GitHub Actions workflow` |
| `build` | Изменения сборки | `build: update webpack config` |
| `revert` | Откат предыдущего коммита | `revert: revert "feat: add feature"` |

### Scope (область)

| Scope | Описание |
|-------|----------|
| `api` | REST API эндпоинты |
| `db` | Database, схема, миграции |
| `loader` | Data Loader Pipeline |
| `monitoring` | Мониторинг, трейсинг, метрики |
| `auth` | Аутентификация, авторизация |
| `core` | Ядро системы |
| `docs` | Документация |
| `test` | Тесты |
| `config` | Конфигурация |

### Примеры хороших коммитов

```bash
# Feature
git commit -m "feat(api): add pagination support to games endpoint

- Add limit and offset query parameters
- Update swagger documentation
- Add integration tests"

# Bug fix
git commit -m "fix(loader): prevent duplicate entries in games table

The loader was inserting duplicates due to race condition
when multiple instances were running simultaneously.

Fixes #123"

# Documentation
git commit -m "docs(architecture): add data flow diagram"

# Refactoring
git commit -m "refactor(db): extract connection pool logic

Extract database connection pooling into separate module
for better testability and reusability."

# Test
git commit -m "test(api): add unit tests for games endpoint

- Test pagination
- Test filtering by status
- Test error handling"
```

### Примеры плохих коммитов

```bash
# ❌ BAD - неинформативно
git commit -m "fix"
git commit -m "update"
git commit -m "changes"

# ❌ BAD - нет типа
git commit -m "add games endpoint"

# ❌ BAD - слишком общо
git commit -m "fix: fix bugs"

# ❌ BAD - несколько изменений в одном коммите
git commit -m "feat: add api, fix db, update docs"
```

---

## Pull Request Process

### Перед созданием PR

```bash
# 1. Синхронизируйтесь с main
git fetch upstream
git rebase upstream/main

# 2. Запустите тесты
npm test

# 3. Проверьте код
npm run lint
npm run format

# 4. Проверьте pre-flight checks
npm run preflight

# 5. Обновите документацию (если необходимо)
# README.md, docs/, JSDoc комментарии
```

### Создание PR

1. **Push в вашу ветку**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Создать PR на GitHub**
   - Перейти на https://github.com/wbzonahelp-web/rolgi/compare
   - Выбрать базовую ветку (`main`) и вашу ветку
   - Нажать "Create pull request"

3. **Заполнить шаблон PR**
   
   Используйте шаблон `.github/PULL_REQUEST_TEMPLATE.md`:

   ```markdown
   ## Описание
   Краткое описание изменений (1-2 предложения)

   ## Тип изменений
   - [ ] Bug fix (не breaking change)
   - [ ] New feature (не breaking change)
   - [ ] Breaking change (изменение существующего функционала)
   - [ ] Документация

   ## Checklist
   - [ ] Код следует code style проекта
   - [ ] Добавлены/обновлены тесты
   - [ ] Все тесты проходят успешно
   - [ ] Обновлена документация
   - [ ] Нет конфликтов с main

   ## Связанные Issue
   Fixes #123, #456
   ```

4. **Ожидать review**
   - CI/CD checks должны пройти
   - Как минимум 1 approval от maintainer
   - Разрешить все комментарии

### Процесс Review

#### Для автора PR:

- ✅ Отвечайте на комментарии reviewers
- ✅ Вносите запрошенные изменения
- ✅ Запрашивайте повторный review после изменений
- ✅ Будьте открыты к конструктивной критике

#### Для reviewers:

- ✅ Проверяйте функциональность
- ✅ Проверяйте code style
- ✅ Проверяйте тесты
- ✅ Проверяйте документацию
- ✅ Давайте конструктивные комментарии

### Merge стратегии

- **Squash merge** (рекомендуется) - объединить все коммиты в один
- **Rebase merge** - перебазировать коммиты на main
- **Merge commit** - создать merge коммит (не рекомендуется)

---

## Тестирование

### Обязательные тесты

При добавлении новой функциональности **обязательно** добавьте тесты:

#### 1. **Unit тесты** (для всех новых функций)

```javascript
// tests/unit/my-module.test.js
const { myFunction } = require('../../src/my-module');

describe('myFunction', () => {
  test('should return expected result', () => {
    const result = myFunction({ input: 'test' });
    expect(result).toBe('expected');
  });

  test('should throw error for invalid input', () => {
    expect(() => myFunction(null)).toThrow('Invalid input');
  });

  test('should handle edge cases', () => {
    expect(myFunction({ input: '' })).toBe('');
    expect(myFunction({ input: undefined })).toBe(undefined);
  });
});
```

#### 2. **Integration тесты** (для API эндпоинтов)

```javascript
// tests/integration/api.test.js
const request = require('supertest');
const app = require('../../server');

describe('GET /api/games', () => {
  test('should return 200 and games list', async () => {
    const response = await request(app)
      .get('/api/games')
      .query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should handle pagination', async () => {
    const response = await request(app)
      .get('/api/games')
      .query({ limit: 5, offset: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeLessThanOrEqual(5);
  });
});
```

#### 3. **E2E тесты** (для критичных workflows)

```javascript
// tests/e2e/full-workflow.test.js
describe('Full data loading workflow', () => {
  test('should load games from API and save to DB', async () => {
    // 1. Start loader
    const sessionId = await startLoader({ entity: 'games', limit: 10 });
    
    // 2. Wait for completion
    await waitForCompletion(sessionId, { timeout: 30000 });
    
    // 3. Verify data in DB
    const games = await db.query('SELECT COUNT(*) FROM games');
    expect(games.rows[0].count).toBeGreaterThan(0);
  });
});
```

### Запуск тестов

```bash
# Все тесты
npm test

# Unit тесты
npm run test:unit

# Integration тесты
npm run test:integration

# E2E тесты
npm run test:e2e

# Coverage
npm run test:coverage

# Watch режим (для разработки)
npm run test:watch
```

### Coverage требования

- **Минимум 80%** code coverage для новых функций
- **100%** для критичных компонентов (Schema Lock, Data Loader)

---

## Документация

### Обязательная документация

#### 1. **JSDoc комментарии** (для всех public функций)

```javascript
/**
 * Loads games from SStats API and saves to database
 * 
 * @param {Object} options - Loading options
 * @param {number} [options.limit=100] - Max number of games to load
 * @param {string} [options.status='all'] - Filter by status
 * @param {boolean} [options.forceRefresh=false] - Bypass cache
 * @returns {Promise<{success: boolean, inserted: number, sessionId: string}>}
 * @throws {Error} If API request fails or database insert fails
 * 
 * @example
 * const result = await loadGames({ limit: 50, status: 'live' });
 * console.log(result.sessionId); // "abc-123-def"
 * console.log(result.inserted); // 47
 */
const loadGames = async (options = {}) => {
  // ...
};
```

#### 2. **README.md** (для новых компонентов)

Если вы добавляете новый компонент в `src/`, создайте README:

```markdown
# Component Name

## Purpose
Краткое описание назначения компонента (1-2 предложения)

## Usage
\`\`\`javascript
const component = require('./component');
const result = component.doSomething();
\`\`\`

## API
### `functionName(param1, param2)`
Описание функции

## Examples
См. [examples/](examples/)

## Tests
npm run test:unit -- component.test.js
```

#### 3. **Changelog** (для значительных изменений)

Добавьте запись в `CHANGELOG.md`:

```markdown
## [Unreleased]
### Added
- New games API endpoint with pagination support (#123)

### Fixed
- Race condition in data loader (#124)

### Changed
- Improved error handling in API client (#125)
```

---

## Отчет об ошибках

### Перед созданием issue

1. **Поиск существующих issues** - проверьте, не создана ли уже issue
2. **Проверка версии** - убедитесь, что используете последнюю версию
3. **Воспроизведение** - убедитесь, что баг воспроизводится

### Шаблон Bug Report

```markdown
**Описание бага**
Краткое описание проблемы

**Шаги для воспроизведения**
1. Запустить '...'
2. Выполнить '...'
3. Получить ошибку '...'

**Ожидаемое поведение**
Что должно было произойти

**Актуальное поведение**
Что произошло на самом деле

**Скриншоты/логи**
Если возможно, приложите скриншоты или логи

**Окружение**
- OS: [e.g. Ubuntu 22.04]
- Node.js: [e.g. 18.17.0]
- PostgreSQL: [e.g. 14.8]
- Версия Rolgi: [e.g. 6.0.0]

**Дополнительный контекст**
Любая дополнительная информация
```

---

## Предложения функций

### Шаблон Feature Request

```markdown
**Описание функции**
Краткое описание предлагаемой функциональности

**Проблема, которую решает**
Какую проблему решает эта функция?

**Предложенное решение**
Как эта функция должна работать?

**Альтернативы**
Какие альтернативные решения вы рассматривали?

**Дополнительный контекст**
Примеры использования, скриншоты, ссылки
```

---

## 🎓 Ресурсы для новичков

### С чего начать

- 🐛 **Good First Issue** - issues с меткой `good first issue`
- 📚 **Documentation** - issues с меткой `documentation`
- 🧪 **Tests** - написание тестов всегда приветствуется

### Полезные ссылки

- [Git Handbook](https://guides.github.com/introduction/git-handbook/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Jest Documentation](https://jestjs.io/)
- [Fastify Documentation](https://fastify.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 📞 Контакты

- **Questions**: [GitHub Discussions](https://github.com/wbzonahelp-web/rolgi/discussions)
- **Bugs**: [GitHub Issues](https://github.com/wbzonahelp-web/rolgi/issues)
- **Email**: support@example.com

---

## 🙏 Спасибо!

Спасибо за вклад в Rolgi! Ваши усилия делают проект лучше. 🚀

---

<div align="center">

Made with ❤️ by [wbzonahelp-web](https://github.com/wbzonahelp-web)

</div>
