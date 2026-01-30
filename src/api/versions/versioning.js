/**
 * API Versioning System
 * Handles routing and backward compatibility between API versions
 * Supports: v1 (stable), v2 (current)
 * 
 * @module api/versions/versioning
 */

const apiVersions = {
  v1: { version: '1.0.0', status: 'stable', deprecated: false },
  v2: { version: '2.0.0', status: 'current', deprecated: false }
};

/**
 * Extract API version from request
 * Supports: URL path (/v1/..., /v2/...), Accept header, Query param
 * 
 * @param {object} request - Fastify request object
 * @returns {string} API version (v1, v2)
 */
function extractApiVersion(request) {
  // 1. From URL path: /api/v1/games or /v1/games
  const pathMatch = request.url.match(/\/(?:api\/)?v(\d+)\//);
  if (pathMatch) {
    return `v${pathMatch[1]}`;
  }

  // 2. From Accept header: application/vnd.rolgi.v1+json
  const acceptHeader = request.headers.accept || '';
  const headerMatch = acceptHeader.match(/vnd\.rolgi\.v(\d+)/);
  if (headerMatch) {
    return `v${headerMatch[1]}`;
  }

  // 3. From query parameter: ?api-version=v1
  const queryVersion = request.query['api-version'];
  if (queryVersion && /^v\d+$/.test(queryVersion)) {
    return queryVersion;
  }

  // 4. Default to latest stable version
  return 'v2';
}

/**
 * Validate API version
 * 
 * @param {string} version - API version (v1, v2)
 * @returns {boolean} true if valid
 */
function validateVersion(version) {
  return version in apiVersions;
}

/**
 * Get version info
 * 
 * @param {string} version - API version
 * @returns {object} Version metadata
 */
function getVersionInfo(version) {
  return apiVersions[version] || null;
}

/**
 * Check if version is deprecated
 * 
 * @param {string} version - API version
 * @returns {boolean} true if deprecated
 */
function isDeprecated(version) {
  const info = getVersionInfo(version);
  return info ? info.deprecated : false;
}

/**
 * Fastify plugin for API versioning
 * Adds version detection, validation, and deprecation warnings
 * 
 * @param {object} fastify - Fastify instance
 * @param {object} options - Plugin options
 */
async function versioningPlugin(fastify, options = {}) {
  const defaultVersion = options.defaultVersion || 'v2';
  const strictMode = options.strictMode !== false; // Default true

  // Add version detection hook
  fastify.addHook('onRequest', async (request, reply) => {
    // Extract version from request
    const version = extractApiVersion(request);
    
    // Store in request object
    request.apiVersion = version;

    // Validate version
    if (strictMode && !validateVersion(version)) {
      reply.code(400).send({
        error: 'Invalid API version',
        message: `API version '${version}' is not supported. Available versions: ${Object.keys(apiVersions).join(', ')}`,
        availableVersions: Object.keys(apiVersions)
      });
      return;
    }

    // Add deprecation warning header
    if (isDeprecated(version)) {
      reply.header('X-API-Deprecated', 'true');
      reply.header('X-API-Deprecation-Info', `API ${version} is deprecated. Please migrate to the latest version.`);
      
      // Log deprecation usage
      fastify.log.warn({
        msg: 'Deprecated API version used',
        version,
        path: request.url,
        ip: request.ip
      });
    }

    // Add version headers to response
    reply.header('X-API-Version', version);
    reply.header('X-API-Version-Info', JSON.stringify(getVersionInfo(version)));
  });

  // Decorate request with version info
  fastify.decorateRequest('apiVersion', null);
  fastify.decorateRequest('getVersionInfo', function() {
    return getVersionInfo(this.apiVersion);
  });
}

/**
 * Transform response data based on API version
 * Handles backward compatibility transformations
 * 
 * @param {object} data - Response data
 * @param {string} fromVersion - Source version
 * @param {string} toVersion - Target version
 * @returns {object} Transformed data
 */
function transformResponse(data, fromVersion, toVersion) {
  if (fromVersion === toVersion) {
    return data;
  }

  // V2 to V1 transformations (backward compatibility)
  if (fromVersion === 'v2' && toVersion === 'v1') {
    return transformV2toV1(data);
  }

  // V1 to V2 transformations (forward compatibility - rare)
  if (fromVersion === 'v1' && toVersion === 'v2') {
    return transformV1toV2(data);
  }

  return data;
}

/**
 * Transform V2 response to V1 format
 * 
 * @param {object} data - V2 data
 * @returns {object} V1 compatible data
 */
function transformV2toV1(data) {
  if (!data) return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => transformV2toV1(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const transformed = { ...data };

    // Remove V2-only fields
    delete transformed.createdAt;
    delete transformed.updatedAt;
    delete transformed.metadata;

    // Rename fields for V1 compatibility
    if ('gameDate' in transformed) {
      transformed.date = transformed.gameDate;
      delete transformed.gameDate;
    }

    if ('teamAbbreviation' in transformed) {
      transformed.abbr = transformed.teamAbbreviation;
      delete transformed.teamAbbreviation;
    }

    // Transform nested objects
    if (transformed.homeTeam) {
      transformed.homeTeam = transformV2toV1(transformed.homeTeam);
    }
    if (transformed.awayTeam) {
      transformed.awayTeam = transformV2toV1(transformed.awayTeam);
    }

    return transformed;
  }

  return data;
}

/**
 * Transform V1 request to V2 format
 * 
 * @param {object} data - V1 data
 * @returns {object} V2 compatible data
 */
function transformV1toV2(data) {
  if (!data) return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => transformV1toV2(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const transformed = { ...data };

    // Add V2 metadata
    transformed.metadata = {
      apiVersion: 'v2',
      transformedFrom: 'v1'
    };

    // Rename fields for V2
    if ('date' in transformed) {
      transformed.gameDate = transformed.date;
      delete transformed.date;
    }

    if ('abbr' in transformed) {
      transformed.teamAbbreviation = transformed.abbr;
      delete transformed.abbr;
    }

    return transformed;
  }

  return data;
}

/**
 * Create versioned route handler wrapper
 * Automatically handles version transformations
 * 
 * @param {object} handlers - Version-specific handlers { v1: handler, v2: handler }
 * @returns {function} Fastify route handler
 */
function versionedHandler(handlers) {
  return async (request, reply) => {
    const version = request.apiVersion || 'v2';
    
    // Get handler for requested version
    const handler = handlers[version];
    
    if (!handler) {
      // Fallback to latest version with transformation
      const latestHandler = handlers.v2 || handlers.v1;
      const result = await latestHandler(request, reply);
      
      // Transform response to requested version
      const transformed = transformResponse(result, 'v2', version);
      return transformed;
    }

    // Execute version-specific handler
    return await handler(request, reply);
  };
}

/**
 * Register versioned routes
 * 
 * @param {object} fastify - Fastify instance
 * @param {string} basePath - Base path (e.g., '/games')
 * @param {object} handlers - Version handlers
 * @param {object} options - Route options
 */
function registerVersionedRoute(fastify, basePath, handlers, options = {}) {
  const versions = Object.keys(handlers);

  versions.forEach(version => {
    const versionPath = `/api/${version}${basePath}`;
    const handler = handlers[version];

    fastify.route({
      method: options.method || 'GET',
      url: versionPath,
      handler,
      schema: options.schema || {},
      ...options
    });
  });

  // Register non-versioned path (uses latest)
  fastify.route({
    method: options.method || 'GET',
    url: `/api${basePath}`,
    handler: versionedHandler(handlers),
    schema: options.schema || {},
    ...options
  });
}

module.exports = {
  versioningPlugin,
  extractApiVersion,
  validateVersion,
  getVersionInfo,
  isDeprecated,
  transformResponse,
  transformV2toV1,
  transformV1toV2,
  versionedHandler,
  registerVersionedRoute,
  apiVersions
};
