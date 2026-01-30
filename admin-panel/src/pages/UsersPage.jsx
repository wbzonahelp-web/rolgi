/**
 * Users Management Page
 */

import React from 'react';
import { Users as UsersIcon } from 'lucide-react';

const UsersPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <UsersIcon className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Users Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage system users and permissions
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          User management interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default UsersPage;
