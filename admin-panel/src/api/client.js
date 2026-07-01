/**
 * API Client for Rolgi Admin Panel
 * 
 * Handles all HTTP requests to the backend API
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data;
        localStorage.setItem('accessToken', accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ============================================================================
// AUTH API
// ============================================================================

export const authApi = {
  login: (credentials) =>
    apiClient.post('/api/auth/login', credentials),

  register: (userData) =>
    apiClient.post('/api/auth/register', userData),

  logout: (refreshToken) =>
    apiClient.post('/api/auth/logout', { refreshToken }),

  refresh: (refreshToken) =>
    apiClient.post('/api/auth/refresh', { refreshToken }),

  me: () =>
    apiClient.get('/api/auth/me'),

  changePassword: (data) =>
    apiClient.put('/api/auth/password', data),
};

// ============================================================================
// USERS API
// ============================================================================

export const usersApi = {
  getAll: (params) =>
    apiClient.get('/api/auth/users', { params }),

  updateRole: (id, role) =>
    apiClient.put(`/api/auth/users/${id}/role`, { role }),

  activate: (id) =>
    apiClient.post(`/api/auth/users/${id}/activate`),

  deactivate: (id) =>
    apiClient.post(`/api/auth/users/${id}/deactivate`),
};

// ============================================================================
// ALERTS API
// ============================================================================

export const alertsApi = {
  send: (alert) =>
    apiClient.post('/api/alerts/send', alert),

  test: (channels) =>
    apiClient.post('/api/alerts/test', { channels }),

  getHistory: (params) =>
    apiClient.get('/api/alerts/history', { params }),

  getStats: () =>
    apiClient.get('/api/alerts/stats'),

  getConfig: () =>
    apiClient.get('/api/alerts/config'),

  clearHistory: () =>
    apiClient.delete('/api/alerts/history'),
};

// ============================================================================
// GAMES API
// ============================================================================

export const gamesApi = {
  getAll: (params) =>
    apiClient.get('/api/games', { params }),

  getById: (id) =>
    apiClient.get(`/api/games/${id}`),
};

// ============================================================================
// TEAMS API
// ============================================================================

export const teamsApi = {
  getAll: (params) =>
    apiClient.get('/api/teams', { params }),

  getById: (id) =>
    apiClient.get(`/api/teams/${id}`),
};

// ============================================================================
// PLAYERS API
// ============================================================================

export const playersApi = {
  getAll: (params) =>
    apiClient.get('/api/players', { params }),

  getById: (id) =>
    apiClient.get(`/api/players/${id}`),
};

// ============================================================================
// SYSTEM API
// ============================================================================

// Парсер Prometheus-метрик в JSON-структуру для Dashboard
function parsePrometheusMetrics(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  const result = {
    httpRequestsTotal: 0,
    httpRequestsByStatus: {},
    dbPoolConnections: 0,
    dbQueriesTotal: 0,
    dbErrorsTotal: 0,
    cacheHits: 0,
    cacheMisses: 0,
    rssBytes: 0,
    heapUsedBytes: 0,
    eventLoopLagP99: 0,
    openFds: 0,
    cpuSeconds: 0,
    uptimeSeconds: 0,
    nodeStartTime: 0,
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // формат: metric_name{labels} value
    const m = line.match(/^(\w+)(?:\{([^}]*)\})?\s+([\d.eE+\-]+)$/);
    if (!m) continue;
    const [, name, labelsStr, valueStr] = m;
    const value = parseFloat(valueStr);
    if (!isFinite(value)) continue;
    const labels = {};
    if (labelsStr) {
      labelsStr.split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) labels[k.trim()] = v.replace(/^"|"$/g, '').trim();
      });
    }
    switch (name) {
      case 'rolgi_http_requests_total':
        result.httpRequestsTotal += value;
        const code = labels.status_code || 'unknown';
        result.httpRequestsByStatus[code] = (result.httpRequestsByStatus[code] || 0) + value;
        break;
      case 'rolgi_db_pool_connections':
        // несколько меток (idle/active/waiting), суммируем все
        result.dbPoolConnections += value;
        if (labels.state) result['dbPool_' + labels.state] = value;
        break;
      case 'rolgi_db_queries_total':
        result.dbQueriesTotal += value;
        break;
      case 'rolgi_db_errors_total':
        result.dbErrorsTotal += value;
        break;
      case 'rolgi_cache_hits_total':
        result.cacheHits += value;
        break;
      case 'rolgi_cache_misses_total':
        result.cacheMisses += value;
        break;
      case 'rolgi_process_resident_memory_bytes':
        result.rssBytes = value;
        break;
      case 'rolgi_nodejs_heap_size_used_bytes':
        result.heapUsedBytes = value;
        break;
      case 'rolgi_nodejs_eventloop_lag_p99_seconds':
        result.eventLoopLagP99 = value;
        break;
      case 'rolgi_process_open_fds':
        result.openFds = value;
        break;
      case 'rolgi_process_cpu_seconds_total':
        result.cpuSeconds = value;
        break;
      case 'rolgi_process_start_time_seconds':
        result.nodeStartTime = value;
        result.uptimeSeconds = Math.max(0, Date.now() / 1000 - value);
        break;
      default:
        break;
    }
  }
  return result;
}

export const systemApi = {
  getHealth: () =>
    apiClient.get('/health'),

  // Возвращает сырой Prometheus text (для MonitoringPage с собственным парсером)
  getMetricsRaw: () =>
    apiClient.get('/metrics', {
      transformResponse: [(data) => data],
      responseType: 'text',
    }),

  // Возвращает распарсенный JSON (для Dashboard)
  getMetrics: async () => {
    const response = await apiClient.get('/metrics', {
      transformResponse: [(data) => data],
      responseType: 'text',
    });
    return { ...response, data: parsePrometheusMetrics(response.data) };
  },
};

// ============================================================================
// CACHE API (для CachePage)
// ============================================================================

export const cacheApi = {
  getStats: () =>
    apiClient.get('/api/cached/cache/stats'),

  clear: (pattern) =>
    apiClient.post('/api/cached/cache/clear', pattern ? { pattern } : {}),
};

// ============================================================================
// LOADER API
// ============================================================================

export const loaderApi = {
  load: (data) =>
    apiClient.post('/api/loader/load', data),

  getStatus: (sessionId) =>
    apiClient.get(`/api/loader/status/${sessionId}`),
};

export default apiClient;
