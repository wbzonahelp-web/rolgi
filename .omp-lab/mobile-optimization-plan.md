# Архитектурный план мобильной адаптации фронтенда Rolgi SStats

## Статус
- 8 HTML страниц подключают app.css (ну, за исключением scout/strategies/predictions-history)
- Все имеют viewport meta (width=device-width, initial-scale=1.0)
- Текущие breakpoint: 1024px, 768px, 480px
- Нет breakpoint 640px, портят layout на iPhone SE и Pixel 4a

## Требования
- Touch-friendly targets (min 48×48px)
- Font-size >= 16px для inputs (чтобы не зуммировал iOS)
- overflow-x: auto для таблиц
- Mobile-first подход
- Идеальная читаемость

## План правок по файлам

### 1. app.css (основной файл)
#### Текущие проблемы:
- Фиксированные px font-size в некоторых местах (14px, 12px)
- Touch targets не достигают 48×48px
- Нет breakpoint 640px
- Modal close-btn (28×28px) — слишком мелкая
- inputs не имеют font-size >= 16px (iOS zoom issue)
- `.r-btn` padding может быть маловат на мобильных
- `.r-search` input не масштабируется при zoom
- Модалка занимает 100% без отступов на мобильных

#### Действия:
1. Заменить фиксированный font-size в px на rem/em
2. Добавить media query 640px
3. Обеспечить touch-friendly кнопки (min-height: 48px, min-width: 48px)
4. Добавить min-height/min-width для модальных close-btn
5. Обеспечить font-size >= 16px для всех inputs
6. Добавить padding/scroll для таблиц на мобильных
7. Обеспечить модалки не ближе чем 8px к краям экрана

### 2. components.js
- Добавить responsive CSS классы в HTML templates
- Добавить aria-labels для accessibility

### 3. index.html
#### Текущие проблемы:
- Sidebar 280px — блокирует контент на мобильных
- Нет коллапса sidebar на маленьких экранах
- Таблицы матчей без overflow-x wrapper
- Фильтры расположены горизонтально (overflow)

#### Действия:
- Добавить media query < 768px: sidebar → overlay/drawer
- Добавить media query < 640px: sidebar → collapsible
- Таблицы матчей обернуть в overflow-x: auto
- Фильтры перестраивать в вертикальный column на мобильных

### 4. game.html
#### Текущие проблемы:
- Form/History table 5 колонок — нужен horizontal scroll
- H2H grid использует фиксированные px (90px 1fr 60px 1fr)
- Analyzer cards шрифт 11-13px
- Breadcrumb overflow без wrap
- profit-sparkline SVG 100×22px
- UI not touch-friendly (small buttons)

#### Действия:
- Form/history tables: overflow-x: auto + sticky first column
- H2H grid: responsive minmax() вместо фиксированных px
- Analyzer cards: font-size >= 16px (или использовать rem)
- Breadcrumb: allow wrapping, nowrap for individual items
- Sparkline SVG: use viewBox, scrub fixed px dimensions
- Add touch-friendly padding to all interactive elements

### 5. scout.html
#### Текущие проблемы:
- Upload results table 9 колонок
- All Events table 8 колонок
- Admin users table 8 колонок
- Container max-width: 1800px
- Source filter tags без wrap
- Stat grid cards 7 штук

#### Действия:
- Таблицы обернуть в scrollable containers
- Container max-width: 100% для мобильных (может быть 100% по умолчанию и ограничиваться на desktop)
- Source filter tags: flex-wrap: wrap
- Stat grid: 2-3 columns на мобильных
- Ensure کن conteúdo principal não seja cortado em telas pequenas

### 6. teams.html
#### Текущие проблемы:
- Поиск + табы в одну строку на мобильных
- Team items flex-row с переполнением
- Нет media queries

#### Действия:
- Добавить media queries < 768px и < 640px
- Поиск + табы: перестраивать в column
- Team items: flex-wrap: wrap
- Модалка: max-width на мобильных через media query

### 7. players.html
#### Текущие проблемы:
- Модалка с 3 вкладками — не оптимизирована на мобильных
- Player avatar + длинные имена overflow
- Нет media queries

#### Действия:
- Добавить media queries
- Модалка: full-width on mobile with scrolling
- Разрешить wrap длинных имен
- Avatar: минимальный размер изображения, не теряя пропорции

### 8. strategies.html
#### Текущие проблемы:
- Не подключает app.css (own styles isolated)
- Builder slots 4 dropdown в ряд
- Leaderboard/backtest таблицы слишком широкие
- Только один breakpoint 720px

#### Действия:
- Обеспечить mobile: 1 column layout (builder slots vertical stack)
- Таблицы: overflow-x: auto + sticky first column
- Добавить media queries: 640px, 480px
- Подключить app.css (или duplicate key styles if needed)

### 9. predictions-history.html
#### Текущие проблеми:
- Predictions table 10 колонок
- Filter panel 6 селектов в ряд
- By-outcome panel horizontal overflow

#### Действия:
- Filter panel: wrap на мобильных
- Table: overflow-x: auto
- By-outcome: vertical stack на мобильных

### 10. leagues.html
#### Текущие проблемы:
- Модалка лиги с nested pills overflow

#### Действия:
- Pills: flex-wrap: wrap
- Модалка: scroll if needed + max-width 100%
