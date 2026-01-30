# ✅ Git Workflow Checklist

Используйте этот чек-лист для каждой новой функции или исправления.

---

## 📋 Checklist: Начало работы

### Перед началом разработки

- [ ] **Обновить main ветку**
  ```bash
  git checkout main
  git pull origin main
  ```

- [ ] **Проверить статус репозитория**
  ```bash
  git status  # Должно быть: "nothing to commit, working tree clean"
  ```

- [ ] **Создать новую ветку**
  ```bash
  git checkout -b feature/название-функции
  # или bugfix/название-бага
  # или hotfix/критическое-исправление
  ```

- [ ] **Проверить, что находитесь на правильной ветке**
  ```bash
  git branch  # Должна быть отмечена ваша новая ветка
  ```

---

## 💻 Checklist: Разработка

### Во время разработки

- [ ] **После КАЖДОГО логического изменения делать коммит**
  ```bash
  git add .
  git commit -m "type(scope): краткое описание"
  ```

- [ ] **Использовать правильный формат коммитов**
  - [ ] Начинается с типа: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
  - [ ] Указан scope (если применимо): `feat(auth):`
  - [ ] Описание начинается с маленькой буквы
  - [ ] Описание короткое и ясное (до 50 символов)
  - [ ] Используется повелительное наклонение: "add" не "added"

- [ ] **Проверять статус после каждого коммита**
  ```bash
  git status
  git log --oneline -5
  ```

- [ ] **Регулярно сохранять работу локально**
  - Рекомендуется коммитить каждые 15-30 минут работы

---

## 🔄 Checklist: Синхронизация с main

### Перед созданием Pull Request

- [ ] **Получить последние изменения из main**
  ```bash
  git fetch origin main
  ```

- [ ] **Применить изменения поверх текущей работы**
  ```bash
  git rebase origin/main
  ```

- [ ] **Если есть конфликты - разрешить их**
  - [ ] Посмотреть конфликтные файлы:
    ```bash
    git status
    ```
  - [ ] Открыть файлы и найти маркеры конфликтов:
    ```
    <<<<<<< HEAD
    ваш код
    =======
    код из main
    >>>>>>> origin/main
    ```
  - [ ] Разрешить конфликты (приоритет коду из main, если ваши изменения не критичны)
  - [ ] Добавить разрешенные файлы:
    ```bash
    git add <файлы>
    ```
  - [ ] Продолжить rebase:
    ```bash
    git rebase --continue
    ```

- [ ] **Проверить, что всё работает после rebase**
  - [ ] Запустить тесты (если есть)
  - [ ] Проверить функциональность вручную

---

## 🔨 Checklist: Подготовка к PR

### Объединение коммитов (Squash)

- [ ] **Посмотреть количество коммитов для объединения**
  ```bash
  git log --oneline origin/main..HEAD
  ```

- [ ] **Объединить все коммиты в один** (если их больше одного)
  ```bash
  # N = количество коммитов
  git reset --soft HEAD~N
  ```

- [ ] **Создать один комплексный коммит**
  ```bash
  git commit -m "type(scope): comprehensive description

  - Feature/fix 1
  - Feature/fix 2
  - Feature/fix 3
  
  Additional context if needed"
  ```

- [ ] **Проверить результат**
  ```bash
  git log --oneline -3
  # Должен быть виден один новый коммит
  ```

---

## 📤 Checklist: Отправка и PR

### Push изменений

- [ ] **Отправить ветку в GitHub**
  ```bash
  # Первый раз:
  git push -u origin feature/название
  
  # После squash/rebase (требуется force):
  git push -f origin feature/название
  ```

- [ ] **Проверить, что push успешен**
  - Должно быть сообщение: `[new branch]` или `(forced update)`

### Создание Pull Request

- [ ] **Открыть GitHub и перейти в репозиторий**
  ```
  https://github.com/wbzonahelp-web/rolgi
  ```

- [ ] **Нажать "Compare & pull request"** (или использовать прямую ссылку)

- [ ] **Заполнить шаблон PR:**
  - [ ] Написать понятное описание изменений
  - [ ] Отметить тип изменений (feat/fix/docs/etc)
  - [ ] Указать, как протестировано
  - [ ] Отметить все пункты чеклиста
  - [ ] Указать связанные Issue (если есть)

- [ ] **Проверить diff в PR**
  - Убедиться, что включены только нужные изменения

- [ ] **Создать PR** (кнопка "Create pull request")

- [ ] **Скопировать ссылку на PR** и сохранить её

---

## 👀 Checklist: Code Review

### После создания PR

- [ ] **Дождаться прохождения CI/CD** (если настроено)
  - [ ] Все проверки должны быть зелёными

- [ ] **Ответить на комментарии ревьюеров**
  - [ ] Внести необходимые изменения
  - [ ] Повторить процесс (commit → rebase → squash → push)

- [ ] **Получить approval** от ревьюера

---

## ✅ Checklist: Завершение

### После merge PR

- [ ] **Переключиться на main**
  ```bash
  git checkout main
  ```

- [ ] **Обновить main**
  ```bash
  git pull origin main
  ```

- [ ] **Удалить локальную feature ветку** (опционально)
  ```bash
  git branch -d feature/название
  ```

- [ ] **Удалить удаленную ветку** (обычно делается автоматически на GitHub)
  ```bash
  git push origin --delete feature/название
  ```

- [ ] **Проверить, что изменения в main**
  ```bash
  git log --oneline -5
  ```

---

## 🚨 Checklist: Troubleshooting

### Если что-то пошло не так

#### Забыли сделать rebase перед push

- [ ] Не паниковать
- [ ] Выполнить rebase сейчас:
  ```bash
  git fetch origin main
  git rebase origin/main
  git push -f origin feature/название
  ```

#### Нужно отменить последний коммит

- [ ] **Soft reset** (сохранить изменения):
  ```bash
  git reset --soft HEAD~1
  ```
- [ ] **Hard reset** (удалить изменения):
  ```bash
  git reset --hard HEAD~1
  ```

#### Нужно отменить rebase

- [ ] Пока rebase не завершён:
  ```bash
  git rebase --abort
  ```

#### Случайно начали работу в main

- [ ] Создать новую ветку прямо сейчас:
  ```bash
  git checkout -b feature/название
  ```
- [ ] Изменения автоматически перейдут в новую ветку

#### Потеряли код после неудачного rebase

- [ ] Использовать reflog:
  ```bash
  git reflog  # Найти хеш коммита до rebase
  git reset --hard <хеш>
  ```

---

## 📊 Quick Status Check

В любой момент можно проверить:

```bash
# Текущий статус
git status

# Текущая ветка
git branch

# Последние коммиты
git log --oneline -10

# Изменения относительно main
git diff origin/main

# Список файлов с изменениями
git diff --name-only origin/main
```

---

## 🎯 Быстрый Reference

### Основные команды в правильном порядке:

```bash
# 1. Начало
git checkout main
git pull origin main
git checkout -b feature/my-feature

# 2. Разработка
git add .
git commit -m "feat(module): add feature"

# 3. Синхронизация
git fetch origin main
git rebase origin/main

# 4. Squash
git reset --soft HEAD~N
git commit -m "feat(module): comprehensive description"

# 5. Push & PR
git push -f origin feature/my-feature
# Создать PR на GitHub
```

---

## 💡 Tips & Best Practices

- ✅ **Делайте маленькие, логичные коммиты** во время разработки
- ✅ **Объединяйте их в один** перед PR
- ✅ **Синхронизируйтесь с main** каждый день
- ✅ **Тестируйте после каждого rebase**
- ✅ **Пишите понятные commit messages**
- ✅ **Используйте force push** только для своих веток
- ✅ **Не бойтесь задавать вопросы** при возникновении проблем

---

## 📝 Шаблон для копирования

Для каждой новой функции:

```markdown
## Feature: [Название]

- [ ] Создал ветку: feature/название
- [ ] Сделал N коммитов
- [ ] Выполнил rebase с main
- [ ] Объединил коммиты (squash)
- [ ] Отправил в GitHub
- [ ] Создал PR: [ссылка]
- [ ] Получил approval
- [ ] PR смержен
- [ ] Обновил локальный main
```

---

Сохраните этот чеклист и используйте его для каждой новой задачи! ✨
