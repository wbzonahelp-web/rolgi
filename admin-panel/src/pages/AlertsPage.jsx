/**
 * Alerts Management Page
 *
 * API:
 *  POST   /api/alerts/send      { title, message, severity?, type?, channels? }
 *  POST   /api/alerts/test      { channels }
 *  GET    /api/alerts/history   ?limit&severity&type
 *  GET    /api/alerts/stats
 *  GET    /api/alerts/config
 *  DELETE /api/alerts/history
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Send,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  XCircle,
  Inbox,
  Activity,
  Clock,
} from 'lucide-react';
import { alertsApi } from '../api/client';

const SEVERITIES = ['critical', 'error', 'warning', 'info'];
const TYPES      = ['system', 'database', 'api', 'loader', 'rate_limit', 'cache', 'security'];
const CHANNELS   = ['email', 'slack', 'webhook'];

const SEV_BADGE = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  error:    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  warning:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const SEV_ICON = {
  critical: XCircle,
  error:    AlertCircle,
  warning:  AlertTriangle,
  info:     Info,
};

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function sumChannelCounts(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0);
}

const AlertsPage = () => {
  const qc = useQueryClient();

  // Форма
  const [form, setForm] = useState({
    title: '',
    message: '',
    severity: 'info',
    type: 'system',
    channels: ['webhook'],
  });

  // Фильтры истории
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType]         = useState('all');

  // Queries
  const statsQ = useQuery({
    queryKey: ['alerts-stats'],
    queryFn: async () => (await alertsApi.getStats()).data,
    refetchInterval: 15000,
  });

  const configQ = useQuery({
    queryKey: ['alerts-config'],
    queryFn: async () => (await alertsApi.getConfig()).data,
  });

  const historyParams = {
    limit: 50,
    ...(filterSeverity !== 'all' ? { severity: filterSeverity } : {}),
    ...(filterType !== 'all'     ? { type: filterType }         : {}),
  };
  const historyQ = useQuery({
    queryKey: ['alerts-history', historyParams],
    queryFn: async () => (await alertsApi.getHistory(historyParams)).data,
    refetchInterval: 15000,
    keepPreviousData: true,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['alerts-history'] });
    qc.invalidateQueries({ queryKey: ['alerts-stats'] });
  };

  // Mutations
  const sendMut = useMutation({
    mutationFn: (payload) => alertsApi.send(payload),
    onSuccess: () => {
      invalidate();
      setForm(f => ({ ...f, title: '', message: '' }));
    },
  });
  const testMut = useMutation({
    mutationFn: (channels) => alertsApi.test(channels),
    onSuccess: invalidate,
  });
  const clearMut = useMutation({
    mutationFn: () => alertsApi.clearHistory(),
    onSuccess: invalidate,
  });

  const toggleChannel = (ch) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter(c => c !== ch)
        : [...f.channels, ch],
    }));
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    sendMut.mutate({
      title: form.title.trim(),
      message: form.message.trim(),
      severity: form.severity,
      type: form.type,
      channels: form.channels.length ? form.channels : undefined,
    });
  };

  const handleTest = () => {
    if (!form.channels.length) {
      window.alert('Выберите хотя бы один канал для теста');
      return;
    }
    testMut.mutate(form.channels);
  };

  const handleClear = () => {
    if (!window.confirm('Очистить всю историю алертов?')) return;
    clearMut.mutate();
  };

  const stats = statsQ.data || {};
  const config = configQ.data || {};
  const alerts = historyQ.data?.alerts || [];

  const sentTotal   = sumChannelCounts(stats.sent);
  const failedTotal = sumChannelCounts(stats.failed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bell className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Alerts Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Отправка и история алертов. Каналы:&nbsp;
              {CHANNELS.map(c => {
                const enabled = config[c] && Object.keys(config[c]).length > 0;
                return (
                  <span key={c} className={`inline-flex items-center gap-1 mr-2 text-xs ${enabled ? 'text-green-700 dark:text-green-400' : 'text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    {c}
                  </span>
                );
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => historyQ.refetch()}
            disabled={historyQ.isFetching}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${historyQ.isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button
            onClick={handleClear}
            disabled={clearMut.isPending || (stats.historySize ?? 0) === 0}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear history
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Sent (total)',  value: sentTotal,             Icon: CheckCircle,   color: 'text-green-600 dark:text-green-400' },
          { label: 'Failed',        value: failedTotal,           Icon: XCircle,       color: failedTotal > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400' },
          { label: 'History size',  value: stats.historySize ?? 0, Icon: Inbox,        color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Cooldown',      value: stats.cooldownActive ?? 0, Icon: Clock,     color: 'text-purple-600 dark:text-purple-400' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
              <Icon className={`w-7 h-7 ${color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Send form */}
      <form onSubmit={handleSend} className="card space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Отправить алерт</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="High DB latency"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm(f => ({ ...f, severity: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Message *</label>
          <textarea
            required
            rows={3}
            value={form.message}
            onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-y"
            placeholder="Текст алерта..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Channels</label>
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map(ch => (
              <label key={ch} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.channels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                {ch}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={sendMut.isPending || !form.title.trim() || !form.message.trim()}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <Send className={`w-4 h-4 mr-2 ${sendMut.isPending ? 'animate-pulse' : ''}`} />
            Отправить
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testMut.isPending || !form.channels.length}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Activity className={`w-4 h-4 mr-2 ${testMut.isPending ? 'animate-pulse' : ''}`} />
            Test channels
          </button>
          {sendMut.isSuccess  && <span className="text-sm text-green-600 dark:text-green-400">✓ Отправлено</span>}
          {sendMut.isError    && <span className="text-sm text-red-600 dark:text-red-400">Ошибка отправки</span>}
          {testMut.isSuccess  && <span className="text-sm text-green-600 dark:text-green-400">✓ Тест отправлен</span>}
          {testMut.isError    && <span className="text-sm text-red-600 dark:text-red-400">Ошибка теста</span>}
        </div>
      </form>

      {/* History */}
      <div className="card p-0 overflow-hidden">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">История</span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-2 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Все severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Все types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            {historyQ.data?.total ?? 0} записей
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Severity','Title','Message','Type','Channels','Time'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {historyQ.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Алертов нет
                  </td>
                </tr>
              ) : (
                alerts.map((a, idx) => {
                  const SevIcon = SEV_ICON[a.severity] || Info;
                  return (
                    <tr key={`${a.timestamp}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${SEV_BADGE[a.severity] || SEV_BADGE.info}`}>
                          <SevIcon className="w-3 h-3" />
                          {a.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white max-w-xs truncate" title={a.title}>{a.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-md truncate" title={a.message}>{a.message}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{a.type || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {(a.channels || []).map(c => (
                            <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(a.timestamp)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error banners */}
      {historyQ.isError && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Не удалось загрузить историю: {historyQ.error?.response?.data?.message || historyQ.error?.message}
            </p>
          </div>
        </div>
      )}
      {clearMut.isSuccess && (
        <div className="card border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">История очищена</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
