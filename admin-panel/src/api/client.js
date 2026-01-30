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
    apiClient.post('/api/auth/change-password', data),
};

// ============================================================================
// USERS API
// ============================================================================

export const usersApi = {
  getAll: (params) =>
    apiClient.get('/api/auth/users', { params }),

  getById: (id) =>
    apiClient.get(`/api/auth/users/${id}`),

  update: (id, data) =>
    apiClient.put(`/api/auth/users/${id}`, data),

  delete: (id) =>
    apiClient.delete(`/api/auth/users/${id}`),

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

export const systemApi = {
  getHealth: () =>
    apiClient.get('/health'),

  getMetrics: () =>
    apiClient.get('/metrics'),
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
