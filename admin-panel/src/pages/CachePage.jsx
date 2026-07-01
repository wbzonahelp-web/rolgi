/**
 * Cache Statistics Page
 *
 * API:
 *  GET  /api/cached/cache/stats  → { success, stats: {...} }
 *  POST /api/cached/cache/clear  → { success, message }
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Plus,
  Minus,
  AlertTriangle,
  Key,
  HardDrive,
  Clock,
} from 'lucide-react';
import { cacheApi } from '../api/client';

function formatUptime(sec) {
  if (sec == null) return '—';
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function formatMemory(kb) {
  if (kb == null) return '—';
  if (kb >= 1024 * 1024) return (kb / 1024 / 1024).toFixed(2) + ' GB';
  if (kb >= 1024) return (kb / 1024).toFixed(2) + ' MB';
  return kb + ' KB';
}

function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU');
}

const CachePage = () => {
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: async () => {
      const res = await cacheApi.getStats();
      return res.data;
    },
    refetchInterval: 10000,
  });

  const clearMutation = useMutation({
    mutationFn: () => cacheApi.clear(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cache-stats'] }),
  });

  const stats = data?.stats || {};
  const hitRateNum = parseFloat(String(stats.hitRate || '0').replace('%', ''));

  const handleClear = () => {
    if (!window.confirm('Очистить весь кэш? Это удалит все ключи Redis.')) return;
    clearMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Database className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Cache Statistics
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Redis cache performance and statistics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button
            onClick={handleClear}
            disabled={clearMutation.isPending}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <Trash2 className={`w-4 h-4 mr-2 ${clearMutation.isPending ? 'animate-spin' : ''}`} />
            Clear all
          </button>
        </div>
      </div>

      {/* Banners */}
      {isError && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Ошибка загрузки: {error?.response?.data?.message || error?.message}
            </p>
          </div>
        </div>
      )}
      {clearMutation.isSuccess && (
        <div className="card border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              {clearMutation.data?.data?.message || 'Cache cleared'}
            </p>
          </div>
        </div>
      )}
      {clearMutation.isError && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">Не удалось очистить кэш</p>
          </div>
        </div>
      )}

      {/* Hit Rate */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Hit Rate</h2>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? '—' : (stats.hitRate || '0%')}
          </span>
        </div>
        <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              hitRateNum >= 70 ? 'bg-green-500' :
              hitRateNum >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, hitRateNum))}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {hitRateNum >= 70 ? 'Отличный показатель' :
           hitRateNum >= 40 ? 'Средний показатель' :
           hitRateNum > 0   ? 'Низкий показатель' :
                              'Кэш пока не используется'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Hits',     value: formatNumber(stats.hits),    Icon: TrendingUp,    color: 'text-green-600 dark:text-green-400' },
          { label: 'Misses',   value: formatNumber(stats.misses),  Icon: TrendingDown,  color: 'text-orange-600 dark:text-orange-400' },
          { label: 'Sets',     value: formatNumber(stats.sets),    Icon: Plus,          color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Deletes',  value: formatNumber(stats.deletes), Icon: Minus,         color: 'text-gray-600 dark:text-gray-400' },
          { label: 'Errors',   value: formatNumber(stats.errors),  Icon: AlertTriangle, color: stats.errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400' },
          { label: 'Keys',     value: formatNumber(stats.keys),    Icon: Key,           color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Memory',   value: formatMemory(stats.memoryKB),Icon: HardDrive,     color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Uptime',   value: formatUptime(stats.uptimeSeconds), Icon: Clock,   color: 'text-cyan-600 dark:text-cyan-400' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? (
                    <span className="inline-block w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  ) : value}
                </p>
              </div>
              <Icon className={`w-7 h-7 ${color}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CachePage;
