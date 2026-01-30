# WebSocket Real-time Updates

## Обзор

Rolgi WebSocket Server обеспечивает двустороннюю связь в реальном времени для получения обновлений о футбольных матчах.

**Endpoint**: `ws://localhost:3000/ws`

## Поддерживаемые каналы

### 1. Конкретная игра
```
game:{gameId}
```
Обновления конкретного матча: счёт, статус, минута, события.

**Пример**: `game:123`

### 2. Лига
```
league:{leagueId}
```
Все live матчи определённой лиги.

**Пример**: `league:456`

### 3. Все live матчи
```
live
```
Все текущие live матчи из всех лиг.

### 4. Коэффициенты
```
odds:{gameId}
```
Обновления коэффициентов для конкретного матча.

**Пример**: `odds:123`

### 5. Турнирная таблица
```
standings:{leagueId}
```
Обновления турнирной таблицы лиги.

**Пример**: `standings:456`

---

## Протокол сообщений

### Client → Server

#### Подписка на канал
```json
{
  "type": "subscribe",
  "channel": "game:123"
}
```

#### Отписка от канала
```json
{
  "type": "unsubscribe",
  "channel": "game:123"
}
```

#### Ping (проверка соединения)
```json
{
  "type": "ping"
}
```

---

### Server → Client

#### Приветственное сообщение (при подключении)
```json
{
  "type": "connected",
  "clientId": "client_1643234567890_abc123",
  "timestamp": "2026-01-30T10:15:00.000Z",
  "message": "Welcome to Rolgi WebSocket Server"
}
```

#### Подтверждение подписки
```json
{
  "type": "subscribed",
  "channel": "game:123",
  "timestamp": "2026-01-30T10:15:05.000Z"
}
```

#### Подтверждение отписки
```json
{
  "type": "unsubscribed",
  "channel": "game:123",
  "timestamp": "2026-01-30T10:16:00.000Z"
}
```

#### Pong (ответ на ping)
```json
{
  "type": "pong",
  "timestamp": "2026-01-30T10:15:10.000Z"
}
```

#### Snapshot (текущее состояние канала)
Отправляется автоматически после подписки.

**Game snapshot**:
```json
{
  "type": "snapshot",
  "channel": "game:123",
  "data": {
    "game": {
      "gameId": 123,
      "leagueId": 456,
      "leagueName": "Premier League",
      "seasonId": 789,
      "startTime": "2026-01-30T15:00:00.000Z",
      "status": "live",
      "statusInfo": {
        "category": "live",
        "displayName": "Live",
        "color": "#00FF00"
      },
      "homeTeam": {
        "id": 10,
        "name": "Arsenal",
        "score": 2
      },
      "awayTeam": {
        "id": 11,
        "name": "Chelsea",
        "score": 1
      },
      "currentPeriod": "second_half",
      "minute": 67,
      "updatedAt": "2026-01-30T16:07:30.000Z"
    },
    "stats": {
      "possession": { "home": 58, "away": 42 },
      "shots": {
        "home": { "total": 12, "onTarget": 6 },
        "away": { "total": 8, "onTarget": 3 }
      },
      "corners": { "home": 5, "away": 3 },
      "fouls": { "home": 8, "away": 11 },
      "cards": {
        "home": { "yellow": 2, "red": 0 },
        "away": { "yellow": 3, "red": 0 }
      }
    },
    "events": [
      {
        "eventId": 1001,
        "gameId": 123,
        "eventTime": 65,
        "eventType": "goal",
        "teamId": 10,
        "playerId": 500,
        "description": "Goal by Player Name",
        "score": "2:1"
      }
    ]
  },
  "timestamp": "2026-01-30T16:08:00.000Z"
}
```

**Live games snapshot**:
```json
{
  "type": "snapshot",
  "channel": "live",
  "data": {
    "games": [
      {
        "gameId": 123,
        "homeTeam": { "id": 10, "name": "Arsenal", "score": 2 },
        "awayTeam": { "id": 11, "name": "Chelsea", "score": 1 },
        "status": "live",
        "minute": 67
      },
      {
        "gameId": 124,
        "homeTeam": { "id": 12, "name": "Liverpool", "score": 1 },
        "awayTeam": { "id": 13, "name": "Man United", "score": 1 },
        "status": "live",
        "minute": 45
      }
    ],
    "total": 2
  },
  "timestamp": "2026-01-30T16:08:00.000Z"
}
```

#### Обновление игры
```json
{
  "type": "game:update",
  "channel": "game:123",
  "data": {
    "eventType": "score_change",
    "game": {
      "gameId": 123,
      "homeTeam": { "id": 10, "name": "Arsenal", "score": 3 },
      "awayTeam": { "id": 11, "name": "Chelsea", "score": 1 },
      "status": "live",
      "minute": 75,
      "updatedAt": "2026-01-30T16:15:00.000Z"
    },
    "changes": [
      {
        "field": "home_score",
        "oldValue": 2,
        "newValue": 3
      },
      {
        "field": "minute",
        "oldValue": 67,
        "newValue": 75
      }
    ]
  },
  "timestamp": "2026-01-30T16:15:00.000Z"
}
```

**Типы событий (`eventType`)**:
- `update` - обычное обновление
- `score_change` - изменение счёта
- `status_change` - изменение статуса матча
- `game_finished` - матч завершён

#### Ошибка
```json
{
  "type": "error",
  "error": {
    "code": "INVALID_CHANNEL",
    "message": "Invalid channel: invalid-channel"
  },
  "timestamp": "2026-01-30T10:15:00.000Z"
}
```

**Коды ошибок**:
- `INVALID_MESSAGE` - невалидное JSON сообщение
- `UNKNOWN_MESSAGE_TYPE` - неизвестный тип сообщения
- `MISSING_CHANNEL` - отсутствует имя канала
- `INVALID_CHANNEL` - невалидное имя канала
- `RATE_LIMIT_EXCEEDED` - превышен лимит сообщений в минуту
- `GAME_NOT_FOUND` - игра не найдена

---

## Примеры использования

### JavaScript (Browser)

```javascript
// Подключение к WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected to Rolgi WebSocket');
  
  // Подписываемся на live матчи
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'live'
  }));
  
  // Подписываемся на конкретный матч
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'game:123'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connected':
      console.log('Client ID:', message.clientId);
      break;
      
    case 'subscribed':
      console.log('Subscribed to:', message.channel);
      break;
      
    case 'snapshot':
      console.log('Channel snapshot:', message.data);
      // Обновляем UI с текущим состоянием
      updateUI(message.data);
      break;
      
    case 'game:update':
      console.log('Game update:', message.data);
      // Обновляем конкретный матч в UI
      updateGame(message.data.game);
      break;
      
    case 'error':
      console.error('Error:', message.error);
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket');
  // Переподключение через 5 секунд
  setTimeout(() => {
    location.reload();
  }, 5000);
};

// Heartbeat (ping каждые 30 секунд)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

### Node.js Client

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('Connected');
  
  // Подписка на лигу
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'league:456'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  if (message.type === 'game:update') {
    console.log('Game update:', {
      gameId: message.data.game.gameId,
      score: `${message.data.game.homeTeam.score}:${message.data.game.awayTeam.score}`,
      minute: message.data.game.minute
    });
  }
});

ws.on('error', console.error);
ws.on('close', () => console.log('Disconnected'));
```

### React Hook

```javascript
import { useEffect, useState } from 'react';

function useGameUpdates(gameId) {
  const [game, setGame] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws');
    
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `game:${gameId}`
      }));
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'snapshot' && message.channel === `game:${gameId}`) {
        setGame(message.data.game);
      } else if (message.type === 'game:update') {
        setGame(message.data.game);
      }
    };
    
    ws.onclose = () => {
      setConnected(false);
    };
    
    return () => {
      ws.close();
    };
  }, [gameId]);

  return { game, connected };
}

// Использование
function GameLiveScore({ gameId }) {
  const { game, connected } = useGameUpdates(gameId);
  
  if (!connected) return <div>Connecting...</div>;
  if (!game) return <div>Loading...</div>;
  
  return (
    <div>
      <div className={`status ${game.status}`}>{game.statusInfo.displayName}</div>
      <div className="score">
        {game.homeTeam.name} {game.homeTeam.score} : {game.awayTeam.score} {game.awayTeam.name}
      </div>
      <div className="minute">⏱ {game.minute}'</div>
    </div>
  );
}
```

---

## Особенности

### 1. Автоматическое переподключение
Клиент должен сам обрабатывать переподключение при разрыве соединения.

### 2. Heartbeat
Сервер отправляет ping каждые 30 секунд для проверки активности соединения. Клиент должен отвечать pong или отправлять свои ping.

### 3. Rate Limiting
Ограничение: 60 сообщений в минуту на одно соединение.

### 4. Максимум подключений
По умолчанию: 10,000 одновременных подключений.

### 5. Snapshot при подписке
При подписке на канал сервер автоматически отправляет текущее состояние (snapshot).

---

## Производительность

### Latency
- **P50**: < 50ms
- **P95**: < 100ms
- **P99**: < 200ms

### Throughput
- До 10,000 одновременных подключений
- До 100,000 сообщений в секунду

### Обновления
- Live игры обновляются каждые 10 секунд
- При изменении счёта обновление мгновенное

---

## Мониторинг

### Статистика сервера
Получить через WebSocket API stats endpoint или через monitoring.

```javascript
// Пример статистики
{
  connectionsTotal: 15234,
  connectionsActive: 543,
  messagesReceived: 123456,
  messagesSent: 234567,
  errorsTotal: 12,
  bytesReceived: 5242880,
  bytesSent: 10485760,
  uptime: 3600000,
  channels: 150,
  avgMessagesPerClient: 227
}
```

### Активные каналы
```javascript
[
  { channel: 'live', subscribers: 250 },
  { channel: 'game:123', subscribers: 45 },
  { channel: 'league:456', subscribers: 78 }
]
```

---

## Troubleshooting

### Соединение не устанавливается
- Проверьте, что сервер запущен
- Убедитесь, что используете правильный endpoint (`ws://`, не `http://`)
- Проверьте firewall и proxy настройки

### Нет обновлений
- Проверьте, что подписались на канал
- Убедитесь, что игра имеет live статус
- Проверьте логи сервера

### Disconnects
- Проверьте heartbeat (ping/pong)
- Убедитесь, что не превышаете rate limit
- Проверьте стабильность сетевого соединения

---

## Безопасность

### Аутентификация (TODO)
В будущем будет добавлена JWT-аутентификация через query parameter:
```
ws://localhost:3000/ws?token=your_jwt_token
```

### Rate Limiting
60 сообщений в минуту для защиты от злоупотреблений.

### Validation
Все каналы валидируются перед подпиской.

---

## См. также

- [Backend API Documentation](../README.md)
- [Data Loader Pipeline](../docs/DATA_LOADER.md)
- [Monitoring Guide](../docs/MONITORING.md)
