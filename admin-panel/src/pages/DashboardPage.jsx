/**
 * Dashboard Page
 * 
 * Main dashboard with system overview and metrics
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { systemApi, alertsApi } from '../api/client';
import {
  Activity,
  Database,
  Users,
  Bell,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';

const DashboardPage = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch system health
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await systemApi.getHealth();
      return response.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await systemApi.getMetrics();
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch alert stats
  const { data: alertStats } = useQuery({
    queryKey: ['alertStats'],
    queryFn: async () => {
      const response = await alertsApi.getStats();
      return response.data;
    },
    refetchInterval: 30000,
  });

  const StatCard = ({ title, value, icon: Icon, trend, color = 'primary' }) => (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
              <TrendingUp className="inline w-4 h-4 mr-1" />
              {trend.value}
            </p>
          )}
        </div>
        <div className={`p-4 rounded-lg bg-${color}-100 dark:bg-${color}-900/20`}>
          <Icon className={`w-8 h-8 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Welcome to Rolgi Admin Panel
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <Clock className="w-5 h-5" />
            <span className="text-lg font-mono">
              {currentTime.toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            {currentTime.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {health?.status === 'healthy' ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                System Status
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {health?.status === 'healthy' ? 'All systems operational' : 'System issues detected'}
              </p>
            </div>
          </div>
          {health && (
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Database Status"
          value={health?.database === true || health?.database?.healthy ? 'Healthy' : 'Error'}
          icon={Database}
          color={health?.database === true || health?.database?.healthy ? 'green' : 'red'}
        />
        
        <StatCard
          title="API Requests"
          value={metrics?.httpRequestsTotal != null ? Math.round(metrics.httpRequestsTotal).toLocaleString() : '—'}
          icon={Activity}
          color="blue"
        />
        
        <StatCard
          title="DB Pool"
          value={metrics?.dbPoolConnections != null ? Math.round(metrics.dbPoolConnections) : '—'}
          icon={Users}
          color="purple"
        />
        
        <StatCard
          title="Alerts Sent"
          value={
            alertStats
              ? ((alertStats.sent?.email || 0) || 0) + 
                ((alertStats.sent?.slack || 0) || 0) + 
                ((alertStats.sent?.webhook || 0) || 0)
              : '—'
          }
          icon={Bell}
          color="orange"
        />
      </div>

      {/* Database Info */}
      {health?.database?.pool && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Database Connection Pool
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {health.database.pool?.total || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Idle</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {health.database.pool?.idle || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Waiting</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {health.database.pool?.waiting || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Max</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {health.database.pool?.max || 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Alert Statistics */}
      {alertStats && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Alert Statistics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Email</p>
              <div className="flex items-baseline space-x-4">
                <span className="text-2xl font-bold text-green-600">
                  {(alertStats.sent?.email || 0) || 0}
                </span>
                <span className="text-sm text-gray-500">sent</span>
              </div>
              {(alertStats.failed?.email || 0) > 0 && (
                <span className="text-sm text-red-600">
                  {(alertStats.failed?.email || 0)} failed
                </span>
              )}
            </div>
            
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Slack</p>
              <div className="flex items-baseline space-x-4">
                <span className="text-2xl font-bold text-green-600">
                  {(alertStats.sent?.slack || 0) || 0}
                </span>
                <span className="text-sm text-gray-500">sent</span>
              </div>
              {(alertStats.failed?.slack || 0) > 0 && (
                <span className="text-sm text-red-600">
                  {(alertStats.failed?.slack || 0)} failed
                </span>
              )}
            </div>
            
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Webhook</p>
              <div className="flex items-baseline space-x-4">
                <span className="text-2xl font-bold text-green-600">
                  {(alertStats.sent?.webhook || 0) || 0}
                </span>
                <span className="text-sm text-gray-500">sent</span>
              </div>
              {(alertStats.failed?.webhook || 0) > 0 && (
                <span className="text-sm text-red-600">
                  {(alertStats.failed?.webhook || 0)} failed
                </span>
              )}
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                History Size: {alertStats.historySize || 0}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                Cooldowns Active: {alertStats.cooldownActive || 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
