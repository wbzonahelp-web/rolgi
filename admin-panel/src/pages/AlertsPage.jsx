/**
 * Alerts Management Page
 */

import React from 'react';
import { Bell } from 'lucide-react';

const AlertsPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Bell className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Alerts Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage system alerts
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Alerts interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default AlertsPage;
