# Rolgi Admin Panel

React-based Admin Panel for Rolgi SStats Analytics Platform.

## Features

- 🔐 **JWT Authentication** - Secure login with role-based access
- 📊 **Real-time Dashboard** - System metrics and statistics
- 👥 **User Management** - CRUD operations for users (admin only)
- 🔔 **Alert Management** - View and manage system alerts
- 💾 **Cache Statistics** - Redis cache performance monitoring
- 📈 **System Monitoring** - Real-time system health and metrics
- ⚙️ **Settings** - System configuration (admin only)

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool
- **React Router** - Routing
- **TanStack Query** - Data fetching
- **Axios** - HTTP client
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Recharts** - Charts and visualizations

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on port 3000

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The admin panel will be available at `http://localhost:5173`.

### Build for Production

```bash
# Build static files
npm run build

# Preview production build
npm run preview
```

## Default Credentials

```
Username: admin
Password: admin123
```

## Environment Variables

Create a `.env` file:

```env
VITE_API_URL=http://localhost:3000
```

## Project Structure

```
admin-panel/
├── src/
│   ├── api/             # API client
│   │   └── client.js    # Axios instance & API methods
│   ├── components/      # Reusable components
│   │   └── ProtectedRoute.jsx
│   ├── contexts/        # React contexts
│   │   └── AuthContext.jsx
│   ├── layouts/         # Layout components
│   │   └── DashboardLayout.jsx
│   ├── pages/           # Page components
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── UsersPage.jsx
│   │   ├── AlertsPage.jsx
│   │   ├── CachePage.jsx
│   │   ├── MonitoringPage.jsx
│   │   └── SettingsPage.jsx
│   ├── App.jsx          # Main app component
│   ├── main.jsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── .env                 # Environment variables
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── package.json
```

## Available Routes

### Public
- `/login` - Login page

### Protected (Authenticated Users)
- `/dashboard` - Main dashboard with system overview
- `/cache` - Cache statistics
- `/monitoring` - System monitoring

### Admin Only
- `/users` - User management
- `/alerts` - Alert management
- `/settings` - System settings

## API Integration

The admin panel communicates with the backend API:

- **Auth**: `/api/auth/*`
- **Users**: `/api/auth/users/*`
- **Alerts**: `/api/alerts/*`
- **System**: `/health`, `/metrics`
- **Games**: `/api/games/*`
- **Teams**: `/api/teams/*`
- **Players**: `/api/players/*`

## Development

### Code Style

```bash
# Run ESLint
npm run lint
```

### Proxy Configuration

Vite dev server proxies API requests to backend:

```javascript
proxy: {
  '/api': 'http://localhost:3000',
  '/health': 'http://localhost:3000',
  '/metrics': 'http://localhost:3000',
}
```

## Role-Based Access Control

### Roles

1. **admin** - Full access to all features
2. **analyst** - Read access to data + some write permissions
3. **viewer** - Read-only access

### Route Protection

```jsx
// Admin only
<ProtectedRoute requireAdmin>
  <UsersPage />
</ProtectedRoute>

// Any authenticated user
<ProtectedRoute>
  <DashboardPage />
</ProtectedRoute>
```

## Deployment

### Static Hosting (Nginx, Apache)

```bash
npm run build
```

Deploy the `dist/` folder to your web server.

### Docker

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## License

MIT License - See LICENSE file

## Version

v6.1.0

## Author

Rolgi Development Team
