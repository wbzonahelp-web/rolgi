/**
 * Settings Page
 *  - Профиль текущего пользователя (GET /api/auth/me)
 *  - Смена пароля (PUT /api/auth/password)
 *  - Статус системы (GET /health)
 */

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Settings as SettingsIcon, User, Mail, Shield, Key,
  CheckCircle, XCircle, AlertCircle, Eye, EyeOff, Loader2,
  Clock, Calendar, Activity, Database,
} from 'lucide-react';
import { authApi, systemApi } from '../api/client';

const ROLE_BADGE = {
  admin:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  analyst: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  viewer:  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtUptime(sec) {
  if (!sec || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

const SettingsPage = () => {
  // ─── Профиль ─────────────────────────────────────────────
  const profileQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => authApi.me().then(r => r.data),
    staleTime: 30_000,
  });

  // ─── Системный статус ───────────────────────────────────
  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemApi.getHealth().then(r => r.data),
    refetchInterval: 30_000,
  });

  // ─── Форма смены пароля ─────────────────────────────────
  const [pwForm, setPwForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const pwMutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      setPwSuccess(true);
      setPwError(null);
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwSuccess(false), 5000);
    },
    onError: (err) => {
      setPwSuccess(false);
      const msg = err?.response?.data?.message
        || err?.response?.data?.error
        || err?.message
        || 'Не удалось изменить пароль';
      setPwError(msg);
    },
  });

  const handlePwSubmit = (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (!pwForm.oldPassword || !pwForm.newPassword) {
      setPwError('Заполните оба поля');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('Новый пароль должен быть минимум 8 символов');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('Пароли не совпадают');
      return;
    }
    if (pwForm.oldPassword === pwForm.newPassword) {
      setPwError('Новый пароль не должен совпадать со старым');
      return;
    }

    pwMutation.mutate({
      oldPassword: pwForm.oldPassword,
      newPassword: pwForm.newPassword,
    });
  };

  const user = profileQuery.data;
  const health = healthQuery.data;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center space-x-3">
        <SettingsIcon className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Профиль, безопасность и состояние системы
          </p>
        </div>
      </div>

      {/* ─── Profile Card ─── */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <User className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Профиль
          </h2>
        </div>

        {profileQuery.isLoading && (
          <div className="flex items-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Загрузка...
          </div>
        )}

        {profileQuery.isError && (
          <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 dark:text-red-300">
              {profileQuery.error?.message || 'Не удалось загрузить профиль'}
            </div>
          </div>
        )}

        {user && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <User className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Имя пользователя</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Shield className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Роль</div>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user.role] || ROLE_BADGE.viewer}`}>
                  {user.role}
                </span>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className={`w-4 h-4 mt-0.5 ${user.isActive ? 'text-green-500' : 'text-gray-400'}`} />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Статус</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {user.isActive ? 'Активен' : 'Деактивирован'}
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Создан</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(user.createdAt)}</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Последний вход</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(user.lastLoginAt)}</div>
              </div>
            </div>
          </div>
        )}

        {user?.permissions?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Permissions ({user.permissions.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {user.permissions.map(p => (
                <span key={p} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-mono">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Change Password Card ─── */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <Key className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Смена пароля
          </h2>
        </div>

        <form onSubmit={handlePwSubmit} className="space-y-4 max-w-md">
          {/* Старый пароль */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Текущий пароль
            </label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={pwForm.oldPassword}
                onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                tabIndex={-1}
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Новый пароль */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Новый пароль <span className="text-xs text-gray-500">(минимум 8 символов)</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Подтверждение */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Подтвердите новый пароль
            </label>
            <input
              type={showNew ? 'text' : 'password'}
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {/* Сообщения */}
          {pwError && (
            <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300">{pwError}</div>
            </div>
          )}

          {pwSuccess && (
            <div className="flex items-start space-x-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-700 dark:text-green-300">
                Пароль успешно изменён
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={pwMutation.isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {pwMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Key className="w-4 h-4" />
            )}
            <span>{pwMutation.isPending ? 'Сохранение...' : 'Изменить пароль'}</span>
          </button>
        </form>
      </div>

      {/* ─── System Status Card ─── */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <Activity className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Статус системы
          </h2>
        </div>

        {healthQuery.isLoading && (
          <div className="flex items-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Загрузка...
          </div>
        )}

        {health && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              {health.status === 'healthy' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">API</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {health.status || 'unknown'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Database className={`w-6 h-6 ${health.database ? 'text-green-500' : 'text-red-500'}`} />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">База данных</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {health.database ? 'Подключена' : 'Недоступна'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Clock className="w-6 h-6 text-blue-500" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Uptime</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {fmtUptime(health.uptime)}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-500" />
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Сервер</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {health.timestamp ? new Date(health.timestamp).toLocaleTimeString('ru-RU') : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
