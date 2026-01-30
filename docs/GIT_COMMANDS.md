# Git Команды - Быстрая справка

## 🚀 Начало работы

### Клонирование репозитория
```bash
git clone https://github.com/wbzonahelp-web/rolgi.git
cd rolgi
```

### Проверка статуса
```bash
git status                    # Текущий статус
git log --oneline -10        # Последние 10 коммитов
git branch -a                # Все ветки
```

## 🌿 Работа с ветками

### Создание и переключение
```bash
git checkout main                          # Переключиться на main
git pull origin main                       # Получить последние изменения
git checkout -b feature/my-feature        # Создать новую ветку
```

### Управление ветками
```bash
git branch                   # Список локальных веток
git branch -a                # Список всех веток (включая удаленные)
git branch -d feature/old   # Удалить локальную ветку
```

## 💾 Коммиты

### Добавление изменений
```bash
git add .                    # Добавить все изменения
git add file.txt             # Добавить конкретный файл
git add src/                 # Добавить папку
```

### Создание коммита
```bash
# Формат: type(scope): description
git commit -m "feat(auth): add user login"
git commit -m "fix(api): resolve null pointer exception"
git commit -m "docs(readme): update installation guide"
```

### Типы коммитов
- `feat` - новая функциональность
- `fix` - исправление бага
- `docs` - документация
- `style` - форматирование кода
- `refactor` - рефакторинг
- `test` - тесты
- `chore` - обслуживание, конфигурация

## 🔄 Синхронизация

### Получение изменений
```bash
git fetch origin main        # Получить изменения без применения
git pull origin main         # Получить и применить изменения
```

### Rebase
```bash
git fetch origin main
git rebase origin/main       # Применить изменения поверх текущих

# Если есть конфликты:
git status                   # Посмотреть конфликты
# Отредактировать файлы
git add <resolved-files>
git rebase --continue        # Продолжить rebase

# Отмена rebase
git rebase --abort
```

## 🔨 Объединение коммитов (Squash)

### Неинтерактивный метод (рекомендуется)
```bash
# Объединить последние 3 коммита
git reset --soft HEAD~3
git commit -m "feat(module): comprehensive description

- Added feature X
- Fixed bug Y
- Updated documentation"
```

### Интерактивный метод
```bash
git rebase -i HEAD~3         # Интерактивный rebase последних 3 коммитов
# В редакторе замените "pick" на "squash" для коммитов, которые хотите объединить
```

## 📤 Отправка изменений

### Push
```bash
git push origin feature/my-feature         # Обычный push
git push -f origin feature/my-feature      # Force push (после rebase/squash)
git push -u origin feature/my-feature      # Push с установкой upstream
```

## 🔍 Полезные команды

### Просмотр изменений
```bash
git diff                     # Изменения в рабочей директории
git diff --staged            # Изменения в staging area
git diff main..feature       # Разница между ветками
```

### История
```bash
git log --oneline                          # Краткая история
git log --oneline --graph --all           # График всех веток
git log --author="username"               # Коммиты автора
git show <commit-hash>                    # Детали коммита
```

### Отмена изменений
```bash
git checkout -- file.txt     # Отменить изменения в файле
git reset HEAD file.txt      # Убрать файл из staging
git reset --soft HEAD~1      # Отменить последний коммит (сохранить изменения)
git reset --hard HEAD~1      # Отменить последний коммит (удалить изменения)
```

## 🎯 Workflow для Pull Request

### Полный процесс
```bash
# 1. Создать ветку
git checkout main
git pull origin main
git checkout -b feature/my-feature

# 2. Разработка
git add .
git commit -m "feat(module): add new feature"

# 3. Синхронизация с main
git fetch origin main
git rebase origin/main

# 4. Разрешение конфликтов (если есть)
git status
# Отредактировать файлы
git add <resolved-files>
git rebase --continue

# 5. Объединение коммитов
git reset --soft HEAD~N  # N - количество коммитов
git commit -m "feat(module): comprehensive description"

# 6. Отправка
git push -f origin feature/my-feature

# 7. Создать PR на GitHub
```

## ⚠️ Важные правила

### ✅ ДЕЛАТЬ:
- Коммитить после каждого изменения
- Использовать conventional commits
- Синхронизироваться с main перед PR
- Объединять коммиты перед PR
- Писать осмысленные сообщения

### ❌ НЕ ДЕЛАТЬ:
- Пушить напрямую в main
- Оставлять незакоммиченные изменения
- Использовать неинформативные сообщения
- Создавать PR без синхронизации
- Забывать про rebase

## 🆘 Помощь

```bash
git help <command>           # Справка по команде
git <command> --help        # Детальная справка
```

## 📚 Полезные ссылки

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow](https://guides.github.com/introduction/flow/)

---

💡 **Совет**: Сохраните этот файл в закладки для быстрого доступа к командам!
