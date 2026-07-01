/**
 * Users Management Page
 *
 * Список пользователей с фильтрами, пагинацией, действиями.
 * API: GET /api/auth/users, PUT /:id/role, POST /:id/activate|deactivate
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  UserX,
  UserCheck,
} from 'lucide-react';
import { usersApi } from '../api/client';

const PAGE_SIZE = 20;

const ROLE_BADGE = {
  admin:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  analyst: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  viewer:  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const UsersPage = () => {
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole]     = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage]     = useState(0);

  const queryParams = useMemo(() => {
    const p = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (role !== 'all')   p.role = role;
    if (status !== 'all') p.isActive = status === 'active';
    return p;
  }, [role, status, page]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: async () => {
      const res = await usersApi.getAll(queryParams);
      return res.data;
    },
    keepPreviousData: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => usersApi.updateRole(id, role),
    onSuccess: invalidate,
  });
  const activateMutation = useMutation({
    mutationFn: (id) => usersApi.activate(id),
    onSuccess: invalidate,
  });
  const deactivateMutation = useMutation({
    mutationFn: (id) => usersApi.deactivate(id),
    onSuccess: invalidate,
  });

  const visibleUsers = useMemo(() => {
    const users = data?.users || [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev    = page > 0;
  const canNext    = (page + 1) * PAGE_SIZE < total;

  const handleRoleChange = (user, newRole) => {
    if (newRole === user.role) return;
    if (!window.confirm(`Сменить роль ${user.username}: ${user.role} → ${newRole}?`)) return;
    roleMutation.mutate({ id: user.userId, role: newRole });
  };

  const handleToggleActive = (user) => {
    const action = user.isActive ? 'деактивировать' : 'активировать';
    if (!window.confirm(`Точно ${action} пользователя ${user.username}?`)) return;
    if (user.isActive) deactivateMutation.mutate(user.userId);
    else               activateMutation.mutate(user.userId);
  };

  const mutating =
    roleMutation.isPending || activateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UsersIcon className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Users Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Всего: {total}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по username / email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Все роли</option>
            <option value="admin">Admin</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Деактивированные</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">Ошибка загрузки</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                {error?.response?.data?.message || error?.message || 'Неизвестная ошибка'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['ID','Username','Email','Role','Status','Created','Last Login','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    <UsersIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                visibleUsers.map((u) => (
                  <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{u.userId}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{u.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{u.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={u.role}
                        disabled={mutating}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer disabled:opacity-50 ${ROLE_BADGE[u.role] || ROLE_BADGE.viewer}`}
                      >
                        <option value="admin">admin</option>
                        <option value="analyst">analyst</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${u.isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {u.isActive ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(u.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleToggleActive(u)}
                        disabled={mutating}
                        className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium border disabled:opacity-50 ${
                          u.isActive
                            ? 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20'
                            : 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20'
                        }`}
                        title={u.isActive ? 'Деактивировать' : 'Активировать'}
                      >
                        {u.isActive
                          ? (<><UserX className="w-3.5 h-3.5 mr-1" /> Deactivate</>)
                          : (<><UserCheck className="w-3.5 h-3.5 mr-1" /> Activate</>)}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={!canPrev || isFetching}
                className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Назад
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400 px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!canNext || isFetching}
                className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Вперёд <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mutation banner */}
      {(roleMutation.isError || activateMutation.isError || deactivateMutation.isError) && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Не удалось выполнить действие. Попробуйте ещё раз.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
