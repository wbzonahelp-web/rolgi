/**
 * Settings Page
 */

import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

const SettingsPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <SettingsIcon className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            System Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure system preferences and options
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Settings interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
