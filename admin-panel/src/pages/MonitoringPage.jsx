/**
 * Monitoring Page
 *
 * Парсит /metrics (Prometheus text) и отображает:
 *  - карточки текущих значений (RSS, heap, fds, event loop, http, ws, auth, db, cache, domain)
 *  - временные графики (history последних 30 точек, refresh 15s)
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, RefreshCw, AlertCircle, Cpu, HardDrive, Database,
  Globe, Zap, Users, FileText, Wifi, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { systemApi } from '../api/client';
import {
  parsePrometheus, getSingle, sumAll, groupByLabel,
  fmtBytes, fmtMs, fmtNumber, fmtUptime,
} from '../utils/promParser';

const MAX_POINTS = 30;
const REFRESH_MS = 15000;

function tsShort() {
  const d = new Date();
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pickStatusClass(code) {
  if (code.startsWith('2')) return 'text-green-700 dark:text-green-400';
  if (code.startsWith('3')) return 'text-blue-700 dark:text-blue-400';
  if (code.startsWith('4')) return 'text-yellow-700 dark:text-yellow-400';
  if (code.startsWith('5')) return 'text-red-700 dark:text-red-400';
  return 'text-gray-700 dark:text-gray-300';
}

const MonitoringPage = () => {
  // История временных рядов (хранится в ref, чтобы не пересоздавать массивы)
  const historyRef = useRef({
    memory: [],   // {t, rss, heap}
    http:   [],   // {t, total, rate}
    lag:    [],   // {t, p50, p99}
  });
  const lastHttpTotalRef = useRef(null);
  const lastTickAtRef    = useRef(null);
  const [, forceRender]  = useState(0);

  const { data: rawText, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['prom-metrics'],
    queryFn: async () => {
      const res = await systemApi.getMetricsRaw();
      // axios для text/plain отдаёт строку
      return typeof res.data === 'string' ? res.data : String(res.data || '');
    },
    refetchInterval: REFRESH_MS,
  });

  // Парсинг — отдельное состояние, чтобы ссылка была стабильной между рендерами
  const [metrics, setMetrics] = useState(() => new Map());
  useEffect(() => {
    setMetrics(rawText ? parsePrometheus(rawText) : new Map());
  }, [rawText]);

  // history tick — зависит от rawText, чтобы не было бесконечного цикла
  useEffect(() => {
    if (!rawText) return;
    const m = parsePrometheus(rawText);
    if (m.size === 0) return;
    const t = tsShort();
    const now = Date.now();

    const rss   = getSingle(m, 'rolgi_process_resident_memory_bytes');
    const heap  = getSingle(m, 'rolgi_nodejs_heap_size_used_bytes');
    const total = sumAll(m, 'rolgi_http_requests_total');
    const p50   = getSingle(m, 'rolgi_nodejs_eventloop_lag_p50_seconds');
    const p99   = getSingle(m, 'rolgi_nodejs_eventloop_lag_p99_seconds');

    // HTTP rate (req/s) по разнице с прошлым тиком
    let rate = 0;
    if (lastHttpTotalRef.current != null && lastTickAtRef.current != null) {
      const dt = (now - lastTickAtRef.current) / 1000;
      if (dt > 0) rate = Math.max(0, (total - lastHttpTotalRef.current) / dt);
    }
    lastHttpTotalRef.current = total;
    lastTickAtRef.current    = now;

    const h = historyRef.current;
    h.memory.push({ t, rss: rss || 0, heap: heap || 0 });
    if (h.memory.length > MAX_POINTS) h.memory = h.memory.slice(-MAX_POINTS);
    h.http  .push({ t, total: total || 0, rate: Number(rate.toFixed(2)) });
    if (h.http.length > MAX_POINTS) h.http = h.http.slice(-MAX_POINTS);
    h.lag   .push({ t, p50: (p50 || 0) * 1000, p99: (p99 || 0) * 1000 }); // ms
    if (h.lag.length > MAX_POINTS) h.lag = h.lag.slice(-MAX_POINTS);
    if (h.memory.length > MAX_POINTS) h.memory.shift();
    if (h.http  .length > MAX_POINTS) h.http.shift();
    if (h.lag   .length > MAX_POINTS) h.lag.shift();
    forceRender(x => x + 1);
  }, [rawText]);

  // ─── Текущие значения ───
  const rss      = getSingle(metrics, 'rolgi_process_resident_memory_bytes');
  const heapU    = getSingle(metrics, 'rolgi_nodejs_heap_size_used_bytes');
  const heapT    = getSingle(metrics, 'rolgi_nodejs_heap_size_total_bytes');
  const fdOpen   = getSingle(metrics, 'rolgi_process_open_fds');
  const fdMax    = getSingle(metrics, 'rolgi_process_max_fds');
  const cpuTotal = getSingle(metrics, 'rolgi_process_cpu_seconds_total');
  const start    = getSingle(metrics, 'rolgi_process_start_time_seconds');
  const lagMean  = getSingle(metrics, 'rolgi_nodejs_eventloop_lag_mean_seconds');
  const lagP99   = getSingle(metrics, 'rolgi_nodejs_eventloop_lag_p99_seconds');

  const httpByStatus = groupByLabel(metrics, 'rolgi_http_requests_total', 'status_code');
  const httpTotal    = Object.values(httpByStatus).reduce((a, b) => a + b, 0);

  const wsConns      = getSingle(metrics, 'rolgi_websocket_connections');
  const wsMessages   = sumAll(metrics, 'rolgi_websocket_messages_total');
  const wsErrors     = sumAll(metrics, 'rolgi_websocket_errors_total');

  const authSessions = getSingle(metrics, 'rolgi_auth_active_sessions');
  const loginsTotal  = sumAll(metrics, 'rolgi_auth_login_attempts_total');

  const cacheHits    = sumAll(metrics, 'rolgi_cache_hits_total');
  const cacheMiss    = sumAll(metrics, 'rolgi_cache_misses_total');
  const cacheKeys    = getSingle(metrics, 'rolgi_cache_keys_total');

  const dbQueries    = sumAll(metrics, 'rolgi_db_queries_total');
  const dbErrors     = sumAll(metrics, 'rolgi_db_errors_total');

  const gamesTotal   = getSingle(metrics, 'rolgi_games_total');
  const playersTotal = getSingle(metrics, 'rolgi_players_total');
  const teamsTotal   = getSingle(metrics, 'rolgi_teams_total');

  const h = historyRef.current;

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('ru-RU') : '—';

  const StatCard = ({ label, value, sub, Icon, color = 'text-gray-600 dark:text-gray-400' }) => (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 truncate">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            {isLoading ? <span className="inline-block w-20 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /> : value}
          </p>
          {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{sub}</p>}
        </div>
        <Icon className={`w-6 h-6 shrink-0 ${color}`} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Activity className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Monitoring</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Prometheus metrics &nbsp;·&nbsp; auto‑refresh каждые {REFRESH_MS / 1000}s &nbsp;·&nbsp; last: {lastUpdate}
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

      {/* Error */}
      {isError && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Не удалось загрузить /metrics: {error?.response?.data?.message || error?.message}
            </p>
          </div>
        </div>
      )}

      {/* ─── Resources ─── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Process resources</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="RSS memory"     value={fmtBytes(rss)}   sub="resident set size" Icon={HardDrive} color="text-indigo-600 dark:text-indigo-400" />
          <StatCard label="Heap used"      value={fmtBytes(heapU)} sub={`of ${fmtBytes(heapT)}`} Icon={HardDrive} color="text-purple-600 dark:text-purple-400" />
          <StatCard label="Open FDs"       value={fmtNumber(fdOpen)} sub={fdMax ? `max ${fmtNumber(fdMax)}` : null} Icon={FileText} color="text-cyan-600 dark:text-cyan-400" />
          <StatCard label="CPU total"      value={cpuTotal != null ? `${cpuTotal.toFixed(1)} s` : '—'} sub="user+system cumulative" Icon={Cpu} color="text-orange-600 dark:text-orange-400" />
          <StatCard label="Event loop p99" value={fmtMs(lagP99)} sub={`mean ${fmtMs(lagMean)}`} Icon={Zap} color={(lagP99 != null && lagP99 > 0.05) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'} />
          <StatCard label="Uptime"         value={fmtUptime(start)} sub="process" Icon={Clock} color="text-blue-600 dark:text-blue-400" />
        </div>
      </div>

      {/* ─── HTTP ─── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">HTTP</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card md:col-span-1">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total requests</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{fmtNumber(httpTotal)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              cumulative since start
            </p>
          </div>
          <div className="card md:col-span-2">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">By status code</p>
            {Object.keys(httpByStatus).length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">нет данных</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {Object.entries(httpByStatus)
                  .sort(([a],[b]) => a.localeCompare(b))
                  .map(([code, n]) => (
                  <div key={code} className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold px-2 py-1 rounded ${pickStatusClass(code)} bg-gray-100 dark:bg-gray-800`}>
                      {code}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{fmtNumber(n)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Cache + DB ─── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Cache &amp; database</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Cache hits"   value={fmtNumber(cacheHits)}  Icon={ArrowUpRight}   color="text-green-600 dark:text-green-400" />
          <StatCard label="Cache misses" value={fmtNumber(cacheMiss)}  Icon={ArrowDownRight} color="text-orange-600 dark:text-orange-400" />
          <StatCard label="Cache keys"   value={fmtNumber(cacheKeys)}  Icon={Database}       color="text-indigo-600 dark:text-indigo-400" />
          <StatCard label="DB queries"   value={fmtNumber(dbQueries)}  Icon={Database}       color="text-blue-600 dark:text-blue-400" />
          <StatCard label="DB errors"    value={fmtNumber(dbErrors)}   Icon={AlertCircle}    color={(dbErrors || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'} />
        </div>
      </div>

      {/* ─── WS + Auth + Domain ─── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">WebSocket, auth &amp; domain</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="WS connections" value={wsConns != null ? fmtNumber(wsConns) : '—'}     Icon={Wifi}     color="text-cyan-600 dark:text-cyan-400" />
          <StatCard label="WS messages"    value={fmtNumber(wsMessages)} sub={wsErrors > 0 ? `${wsErrors} errors` : null} Icon={Wifi} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Active sessions" value={authSessions != null ? fmtNumber(authSessions) : '—'} sub={loginsTotal ? `${fmtNumber(loginsTotal)} logins` : null} Icon={Users} color="text-purple-600 dark:text-purple-400" />
          <StatCard label="Games / Players / Teams" value={`${gamesTotal ?? '—'} / ${playersTotal ?? '—'} / ${teamsTotal ?? '—'}`} Icon={Globe} color="text-green-600 dark:text-green-400" />
        </div>
      </div>

      {/* ─── Charts ─── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Time series</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Memory */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Memory</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">{h.memory.length} / {MAX_POINTS} points</span>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
                <LineChart data={[...h.memory]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" className="dark:opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => fmtBytes(v)} width={70} />
                  <Tooltip
                    formatter={(v, n) => [fmtBytes(v), n]}
                    contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="rss"  name="RSS"  stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="heap" name="Heap" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* HTTP requests */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">HTTP requests / sec</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">{h.http.length} / {MAX_POINTS} points</span>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
                <LineChart data={[...h.http]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" className="dark:opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" width={50} />
                  <Tooltip
                    formatter={(v) => [`${v} req/s`, 'rate']}
                    contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="rate" name="req/s" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Рассчитывается из delta total между точками. Первая точка после открытия = 0.
            </p>
          </div>

          {/* Event loop lag */}
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Event loop lag (ms)</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">{h.lag.length} / {MAX_POINTS} points</span>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
                <LineChart data={[...h.lag]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" className="dark:opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => `${v.toFixed(1)}ms`} width={60} />
                  <Tooltip
                    formatter={(v, n) => [`${Number(v).toFixed(2)} ms`, n]}
                    contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="p50" name="p50" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="p99" name="p99" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-center text-gray-400 dark:text-gray-500 pt-2">
        Источник: <code className="font-mono">GET /metrics</code> · {metrics.size || 0} метрик распарсено
      </p>
    </div>
  );
};

export default MonitoringPage;
