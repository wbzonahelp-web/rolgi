/**
 * Cache Statistics Page
 */

import React from 'react';
import { Database } from 'lucide-react';

const CachePage = () => {
  return (
    <div className="space-y-6">
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

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400">
          Cache statistics interface coming soon...
        </p>
      </div>
    </div>
  );
};

export default CachePage;
