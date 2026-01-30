/**
 * Monitoring Page
 */

import React from 'react';
import { Activity } from 'lucide-react';

const MonitoringPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Activity className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            System Monitoring
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Real-time system metrics and monitoring
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Monitoring interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default MonitoringPage;
