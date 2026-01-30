/**
 * API Versioning Middleware
 * 
 * @module api/versioning
 * @description
 * Middleware для управления версиями API с поддержкой:
 * - URL-based versioning (/v1/*, /v2/*)
 * - Header-based versioning (Accept-Version header)
 * - Deprecation warnings
 * - Backwards compatibility
 */

const logger = require('../monitoring/logger');

/**
 * Current API version
 */
const CURRENT_VERSION = 'v2';

/**
 * Supported API versions
 */
const SUPPORTED_VERSIONS = ['v1', 'v2'];

/**
 * Deprecated versions with sunset dates
 */
const DEPRECATED_VERSIONS = {
  v1: {
    deprecatedSince: '2026-01-30',
    sunsetDate: '2026-06-30',
    message: 'API v1 is deprecated. Please migrate to v2. See /docs/migration for details.',
  },
};

/**
 * Extract API version from request
 * Priority: URL path > Accept-Version header > default (current)
 * 
 * @param {FastifyRequest} request - Fastify request object
 * @returns {string} API version (v1, v2, etc.)
 */
function extractVersion(request) {
  // 1. Check URL path (/v1/games, /v2/games, etc.)
  const urlMatch = request.url.match(/^\/(v\d+)\//);
  if (urlMatch) {
    const version = urlMatch[1];
    if (SUPPORTED_VERSIONS.includes(version)) {
      return version;
    }
  }

  // 2. Check Accept-Version header
  const headerVersion = request.headers['accept-version'];
  if (headerVersion && SUPPORTED_VERSIONS.includes(headerVersion)) {
    return headerVersion;
  }

  // 3. Default to current version
  return CURRENT_VERSION;
}

/**
 * Get normalized route without version prefix
 * /v1/api/games -> /api/games
 * 
 * @param {string} url - Request URL
 * @returns {string} Normalized URL without version prefix
 */
function getNormalizedRoute(url) {
  return url.replace(/^\/v\d+/, '');
}

/**
 * Check if version is deprecated
 * 
 * @param {string} version - API version
 * @returns {Object|null} Deprecation info or null
 */
function getDeprecationInfo(version) {
  return DEPRECATED_VERSIONS[version] || null;
}

/**
 * API Versioning Plugin for Fastify
 * 
 * @param {FastifyInstance} app - Fastify instance
 * @param {Object} options - Plugin options
 */
function apiVersioningPlugin(app, options = {}) {
  // Hook: onRequest - Extract version and add to request context
  app.addHook('onRequest', async (request, reply) => {
    const version = extractVersion(request);
    request.apiVersion = version;

    // Normalize route
    request.normalizedRoute = getNormalizedRoute(request.url);

    // Log API version usage
    logger.debug('API request', {
      version,
      method: request.method,
      url: request.url,
      normalizedRoute: request.normalizedRoute,
    });
  });

  // Hook: onSend - Add version headers and deprecation warnings
  app.addHook('onSend', async (request, reply, payload) => {
    const version = request.apiVersion || CURRENT_VERSION;

    // Add version headers
    reply.header('X-API-Version', version);
    reply.header('X-API-Current-Version', CURRENT_VERSION);

    // Check for deprecation
    const deprecationInfo = getDeprecationInfo(version);
    if (deprecationInfo) {
      reply.header('Deprecation', `version="${version}"`);
      reply.header('Sunset', deprecationInfo.sunsetDate);
      reply.header('Link', '</docs/migration>; rel="deprecation"');
      reply.header('Warning', `299 - "${deprecationInfo.message}"`);

      logger.warn('Deprecated API version used', {
        version,
        url: request.url,
        ip: request.ip,
        deprecatedSince: deprecationInfo.deprecatedSince,
        sunsetDate: deprecationInfo.sunsetDate,
      });
    }

    return payload;
  });

  logger.info('API Versioning plugin initialized', {
    currentVersion: CURRENT_VERSION,
    supportedVersions: SUPPORTED_VERSIONS,
    deprecatedVersions: Object.keys(DEPRECATED_VERSIONS),
  });
}

/**
 * Version compatibility checker
 * Checks if requested feature is available in the current version
 * 
 * @param {string} feature - Feature name
 * @param {string} version - API version
 * @returns {boolean} True if feature is available
 */
function isFeatureAvailable(feature, version) {
  const featureMap = {
    // v1 features
    v1: [
      'games.list',
      'games.get',
      'teams.list',
      'teams.get',
      'players.list',
      'players.get',
      'standings.list',
    ],
    // v2 features (includes v1 + new features)
    v2: [
      'games.list',
      'games.get',
      'games.filter',
      'teams.list',
      'teams.get',
      'teams.filter',
      'players.list',
      'players.get',
      'players.filter',
      'standings.list',
      'standings.filter',
      'odds.live',
      'auth.jwt',
      'graphql',
      'subscriptions',
    ],
  };

  const versionFeatures = featureMap[version] || [];
  return versionFeatures.includes(feature);
}

/**
 * Version migration helpers
 * Transform data between v1 and v2 formats
 */
const versionTransformers = {
  /**
   * Transform v1 game response to v2 format
   */
  gameV1toV2(gameV1) {
    return {
      ...gameV1,
      // v2 adds additional fields
      odds: gameV1.odds || null,
      events: gameV1.events || [],
      statistics: gameV1.statistics || null,
    };
  },

  /**
   * Transform v2 game response to v1 format
   */
  gameV2toV1(gameV2) {
    // v1 doesn't include odds, events, statistics
    const { odds, events, statistics, ...gameV1 } = gameV2;
    return gameV1;
  },

  /**
   * Transform v1 team response to v2 format
   */
  teamV1toV2(teamV1) {
    return {
      ...teamV1,
      // v2 adds social media links
      socialMedia: teamV1.socialMedia || null,
    };
  },

  /**
   * Transform v2 team response to v1 format
   */
  teamV2toV1(teamV2) {
    const { socialMedia, ...teamV1 } = teamV2;
    return teamV1;
  },
};

module.exports = {
  apiVersioningPlugin,
  extractVersion,
  getNormalizedRoute,
  getDeprecationInfo,
  isFeatureAvailable,
  versionTransformers,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
};
