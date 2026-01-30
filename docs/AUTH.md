# Authentication & Authorization

## Обзор

Rolgi использует JWT (JSON Web Tokens) для аутентификации и ролевой модели для авторизации.

**Endpoint**: `/api/auth/*`

---

## Роли пользователей

### 1. Admin
Полный доступ ко всем операциям.

**Permissions**:
- ✅ Управление пользователями (создание, редактирование, удаление)
- ✅ Управление данными (чтение + запись)
- ✅ Запуск и остановка Data Loader
- ✅ Доступ к мониторингу и конфигурации
- ✅ Все операции системы

### 2. Analyst
Чтение данных + запуск аналитики.

**Permissions**:
- ✅ Чтение всех данных (игры, команды, игроки, коэффициенты)
- ✅ Запуск Data Loader
- ✅ Доступ к мониторингу
- ❌ Создание/изменение данных
- ❌ Управление пользователями

### 3. Viewer
Только чтение данных.

**Permissions**:
- ✅ Чтение данных (игры, команды, игроки, коэффициенты, турнирные таблицы)
- ❌ Запись данных
- ❌ Запуск Data Loader
- ❌ Управление пользователями

---

## API Endpoints

### Регистрация

**POST** `/api/auth/register`

Регистрация нового пользователя.

**Request Body**:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secure_password_123",
  "role": "viewer"
}
```

**Response** (201 Created):
```json
{
  "user": {
    "userId": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "viewer",
    "isActive": true,
    "createdAt": "2026-01-30T12:00:00.000Z"
  }
}
```

**Errors**:
- `400 Bad Request` - невалидные данные или пользователь уже существует

---

### Вход (Login)

**POST** `/api/auth/login`

Вход в систему и получение токенов.

**Request Body**:
```json
{
  "username": "john_doe",
  "password": "secure_password_123"
}
```

**Response** (200 OK):
```json
{
  "user": {
    "userId": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "viewer"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

**Errors**:
- `401 Unauthorized` - неверные учётные данные
- `401 Unauthorized` - пользователь деактивирован

---

### Обновление токена

**POST** `/api/auth/refresh`

Обновление Access Token с помощью Refresh Token.

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

**Errors**:
- `401 Unauthorized` - невалидный или истекший Refresh Token

---

### Выход (Logout)

**POST** `/api/auth/logout`

Выход из системы (отзыв токена).

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Response** (200 OK):
```json
{
  "message": "Logged out successfully"
}
```

**Errors**:
- `401 Unauthorized` - отсутствует или невалидный токен

---

### Текущий пользователь

**GET** `/api/auth/me`

Получение информации о текущем пользователе.

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Response** (200 OK):
```json
{
  "userId": 5,
  "username": "john_doe",
  "email": "john@example.com",
  "role": "viewer",
  "isActive": true,
  "createdAt": "2026-01-30T12:00:00.000Z",
  "lastLoginAt": "2026-01-30T14:30:00.000Z",
  "permissions": [
    "games:read",
    "teams:read",
    "players:read",
    "odds:read",
    "standings:read"
  ]
}
```

**Errors**:
- `401 Unauthorized` - не аутентифицирован

---

### Смена пароля

**PUT** `/api/auth/password`

Изменение пароля текущего пользователя.

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Request Body**:
```json
{
  "oldPassword": "current_password",
  "newPassword": "new_secure_password_456"
}
```

**Response** (200 OK):
```json
{
  "message": "Password changed successfully"
}
```

**Errors**:
- `400 Bad Request` - неверный текущий пароль
- `401 Unauthorized` - не аутентифицирован

---

## Admin Endpoints

### Список пользователей

**GET** `/api/auth/users`

Получение списка всех пользователей (только admin).

**Headers**:
```
Authorization: Bearer <adminAccessToken>
```

**Query Parameters**:
- `limit` (integer, default: 50) - количество пользователей
- `offset` (integer, default: 0) - смещение
- `role` (string) - фильтр по роли (`admin`, `analyst`, `viewer`)
- `isActive` (boolean) - фильтр по активности

**Response** (200 OK):
```json
{
  "users": [
    {
      "userId": 1,
      "username": "admin",
      "email": "admin@rolgi.local",
      "role": "admin",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "lastLoginAt": "2026-01-30T08:00:00.000Z"
    },
    {
      "userId": 5,
      "username": "john_doe",
      "email": "john@example.com",
      "role": "viewer",
      "isActive": true,
      "createdAt": "2026-01-30T12:00:00.000Z",
      "lastLoginAt": "2026-01-30T14:30:00.000Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

**Errors**:
- `401 Unauthorized` - не аутентифицирован
- `403 Forbidden` - недостаточно прав (не admin)

---

### Изменение роли пользователя

**PUT** `/api/auth/users/:userId/role`

Изменение роли пользователя (только admin).

**Headers**:
```
Authorization: Bearer <adminAccessToken>
```

**Request Body**:
```json
{
  "role": "analyst"
}
```

**Response** (200 OK):
```json
{
  "message": "Role updated successfully"
}
```

**Errors**:
- `400 Bad Request` - невалидная роль
- `401 Unauthorized` - не аутентифицирован
- `403 Forbidden` - недостаточно прав

---

### Деактивация пользователя

**POST** `/api/auth/users/:userId/deactivate`

Деактивация пользователя (только admin).

**Headers**:
```
Authorization: Bearer <adminAccessToken>
```

**Response** (200 OK):
```json
{
  "message": "User deactivated successfully"
}
```

---

### Активация пользователя

**POST** `/api/auth/users/:userId/activate`

Активация пользователя (только admin).

**Headers**:
```
Authorization: Bearer <adminAccessToken>
```

**Response** (200 OK):
```json
{
  "message": "User activated successfully"
}
```

---

## Использование токенов

### Формат заголовка Authorization

Все защищённые endpoints требуют JWT токен в заголовке:

```
Authorization: Bearer <accessToken>
```

### Access Token
- **Lifetime**: 24 часа (по умолчанию)
- **Usage**: Для доступа к API endpoints
- **Storage**: Хранить в памяти (не в localStorage)

### Refresh Token
- **Lifetime**: 7 дней (по умолчанию)
- **Usage**: Для обновления Access Token
- **Storage**: Хранить в httpOnly cookie (безопасно)

---

## Примеры использования

### JavaScript (Browser)

```javascript
// Вход
async function login(username, password) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  
  // Сохраняем токены
  sessionStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  
  return data.user;
}

// Запрос с аутентификацией
async function fetchGames() {
  const accessToken = sessionStorage.getItem('accessToken');
  
  const response = await fetch('http://localhost:3000/api/games', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    // Токен истёк, обновляем
    await refreshToken();
    return fetchGames(); // Повторяем запрос
  }

  return response.json();
}

// Обновление токена
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  const data = await response.json();
  sessionStorage.setItem('accessToken', data.accessToken);
}

// Выход
async function logout() {
  const accessToken = sessionStorage.getItem('accessToken');
  
  await fetch('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  sessionStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}
```

### React Hook

```javascript
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    // Проверяем сохранённый токен при загрузке
    const token = sessionStorage.getItem('accessToken');
    if (token) {
      fetchCurrentUser(token);
    }
  }, []);

  async function login(username, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    
    setUser(data.user);
    setAccessToken(data.accessToken);
    sessionStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
  }

  async function logout() {
    if (accessToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
    }

    setUser(null);
    setAccessToken(null);
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async function fetchCurrentUser(token) {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const userData = await response.json();
      setUser(userData);
      setAccessToken(token);
    } else {
      sessionStorage.removeItem('accessToken');
    }
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Использование
function ProtectedComponent() {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <LoginForm onLogin={login} />;
  }

  return (
    <div>
      <h1>Welcome, {user.username}!</h1>
      <p>Role: {user.role}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## Безопасность

### Рекомендации

1. **HTTPS Only**: Используйте только HTTPS в production
2. **Secure Storage**: 
   - Access Token - в памяти или sessionStorage
   - Refresh Token - в httpOnly cookie (безопаснее)
3. **Strong Passwords**: Минимум 8 символов
4. **Token Rotation**: Обновляйте токены регулярно
5. **Rate Limiting**: Защита от brute-force атак

### JWT Secret

**⚠️ ВАЖНО**: Измените `JWT_SECRET` в `.env`:

```env
JWT_SECRET=your-very-secure-random-secret-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
```

Генерация случайного ключа:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Default Admin

При первом запуске создаётся admin пользователь:

```
Username: admin
Password: admin123
Email: admin@rolgi.local
Role: admin
```

**⚠️ КРИТИЧНО**: Измените пароль сразу после первого входа!

---

## Troubleshooting

### "Invalid or expired token"
- Токен истёк (lifetime 24h)
- Используйте Refresh Token для обновления

### "Insufficient permissions"
- У пользователя нет нужных прав
- Проверьте роль пользователя

### "User account is disabled"
- Аккаунт деактивирован admin'ом
- Свяжитесь с администратором

---

## См. также

- [Backend API Documentation](../README.md)
- [WebSocket Real-time Updates](./WEBSOCKET.md)
- [Monitoring Guide](./MONITORING.md)
