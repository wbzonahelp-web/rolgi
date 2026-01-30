/**
 * ENDPOINT LOCK SYSTEM
 * 
 * Система защиты от использования несуществующих API эндпоинтов.
 * Загружает манифест разрешённых эндпоинтов и валидирует запросы.
 * 
 * @version 6.0.0
 * @module api/endpoint-lock
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

if (require.main === module) {
const __dirname = path.dirname(__filename);

/**
 * Путь к манифесту эндпоинтов
 */
const MANIFEST_PATH = path.join(__dirname, 'sstats-endpoints.manifest.json');

/**
 * Кэш загруженного манифеста
 */
let manifestCache = null;

/**
 * Загрузить манифест эндпоинтов
 * 
 * @param {boolean} forceReload - Принудительная перезагрузка из файла
 * @returns {Promise<Object>} Манифест эндпоинтов
 */
async function loadManifest(forceReload = false) {
  if (manifestCache && !forceReload) {
    return manifestCache;
  }

  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf-8');
    manifestCache = JSON.parse(content);
    return manifestCache;
  } catch (error) {
    throw new Error(`Failed to load endpoint manifest: ${error.message}`);
  }
}

/**
 * Нормализовать путь эндпоинта (заменить параметры на {param})
 * 
 * @param {string} path - Путь эндпоинта
 * @returns {string} Нормализованный путь
 * 
 * @example
 * normalizePath('/Games/123')  // → '/Games/{id}'
 * normalizePath('/Teams/456')  // → '/Teams/{id}'
 */
function normalizePath(path) {
  // Заменить числовые ID на {id}
  return path.replace(/\/\d+/g, '/{id}');
}

/**
 * Проверить, разрешён ли эндпоинт
 * 
 * @param {string} path - Путь эндпоинта
 * @param {string} method - HTTP метод (GET, POST, PUT, DELETE)
 * @returns {Promise<boolean>} true если эндпоинт разрешён
 * 
 * @example
 * await isAllowedEndpoint('/Games/list', 'GET')  // true
 * await isAllowedEndpoint('/Invalid/path', 'GET') // false
 */
async function isAllowedEndpoint(path, method = 'GET') {
  const manifest = await loadManifest();
  const normalizedPath = normalizePath(path);
  
  return manifest.endpoints.some(
    endpoint => 
      endpoint.path === normalizedPath && 
      endpoint.method.toUpperCase() === method.toUpperCase()
  );
}

/**
 * Получить метаданные эндпоинта
 * 
 * @param {string} path - Путь эндпоинта
 * @param {string} method - HTTP метод
 * @returns {Promise<Object | null>} Метаданные эндпоинта или null
 * 
 * @example
 * const metadata = await getEndpointMetadata('/Games/list', 'GET');
 * console.log(metadata.description);
 * console.log(metadata.parameters);
 */
async function getEndpointMetadata(path, method = 'GET') {
  const manifest = await loadManifest();
  const normalizedPath = normalizePath(path);
  
  return manifest.endpoints.find(
    endpoint => 
      endpoint.path === normalizedPath && 
      endpoint.method.toUpperCase() === method.toUpperCase()
  ) || null;
}

/**
 * Валидировать параметры запроса
 * 
 * @param {string} path - Путь эндпоинта
 * @param {string} method - HTTP метод
 * @param {Object} params - Параметры запроса
 * @returns {Promise<{valid: boolean, errors: Array}>}
 * 
 * @example
 * const validation = await validateParameters('/Games/list', 'GET', { 
 *   leagueId: 123,
 *   season: 2024 
 * });
 * if (!validation.valid) {
 *   console.error(validation.errors);
 * }
 */
async function validateParameters(path, method, params) {
  const metadata = await getEndpointMetadata(path, method);
  
  if (!metadata) {
    return {
      valid: false,
      errors: [`Endpoint not found: ${method} ${path}`]
    };
  }

  const errors = [];
  const providedParams = new Set(Object.keys(params));

  // Проверить обязательные параметры
  for (const param of metadata.parameters) {
    if (param.required && !providedParams.has(param.name)) {
      errors.push(`Missing required parameter: ${param.name}`);
    }

    // Проверить тип параметра
    if (providedParams.has(param.name)) {
      const value = params[param.name];
      const actualType = typeof value;
      
      if (param.type === 'integer' && actualType !== 'number') {
        errors.push(`Invalid type for ${param.name}: expected integer, got ${actualType}`);
      } else if (param.type === 'string' && actualType !== 'string') {
        errors.push(`Invalid type for ${param.name}: expected string, got ${actualType}`);
      } else if (param.type === 'boolean' && actualType !== 'boolean') {
        errors.push(`Invalid type for ${param.name}: expected boolean, got ${actualType}`);
      } else if (param.type === 'array' && !Array.isArray(value)) {
        errors.push(`Invalid type for ${param.name}: expected array, got ${actualType}`);
      }

      // Проверить enum значения
      if (param.enum && !param.enum.includes(value)) {
        errors.push(`Invalid value for ${param.name}: must be one of [${param.enum.join(', ')}]`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Выбросить ошибку если эндпоинт не разрешён
 * 
 * @param {string} path - Путь эндпоинта
 * @param {string} method - HTTP метод
 * @throws {Error} Если эндпоинт не разрешён
 * 
 * @example
 * await assertAllowedEndpoint('/Games/list', 'GET'); // OK
 * await assertAllowedEndpoint('/Invalid', 'GET');     // throws Error
 */
async function assertAllowedEndpoint(path, method = 'GET') {
  const allowed = await isAllowedEndpoint(path, method);
  
  if (!allowed) {
    const manifest = await loadManifest();
    throw new Error(
      `Endpoint not allowed: ${method} ${path}\n` +
      `This endpoint is not in the manifest (${manifest.totalEndpoints} endpoints defined).\n` +
      `Available categories: ${manifest.categories.join(', ')}\n` +
      `Check manifest at: ${MANIFEST_PATH}`
    );
  }
}

/**
 * Получить список всех эндпоинтов
 * 
 * @param {string} category - Фильтр по категории (опционально)
 * @returns {Promise<Array>} Список эндпоинтов
 * 
 * @example
 * const allEndpoints = await listEndpoints();
 * const gamesEndpoints = await listEndpoints('Games');
 */
async function listEndpoints(category = null) {
  const manifest = await loadManifest();
  
  if (!category) {
    return manifest.endpoints;
  }
  
  return manifest.endpoints.filter(
    endpoint => endpoint.category === category
  );
}

/**
 * Получить список категорий
 * 
 * @returns {Promise<Array>} Список категорий
 */
async function getCategories() {
  const manifest = await loadManifest();
  return manifest.categories;
}

/**
 * Получить статистику по манифесту
 * 
 * @returns {Promise<Object>} Статистика
 * 
 * @example
 * const stats = await getManifestStats();
 * console.log(stats.totalEndpoints);
 * console.log(stats.byCategory);
 * console.log(stats.byMethod);
 */
async function getManifestStats() {
  const manifest = await loadManifest();
  
  const stats = {
    version: manifest.version,
    totalEndpoints: manifest.totalEndpoints,
    byCategory: {},
    byMethod: {},
    requiredAuth: 0,
    paginated: 0
  };

  // Подсчёт по категориям
  for (const endpoint of manifest.endpoints) {
    // По категории
    stats.byCategory[endpoint.category] = 
      (stats.byCategory[endpoint.category] || 0) + 1;
    
    // По методу
    stats.byMethod[endpoint.method] = 
      (stats.byMethod[endpoint.method] || 0) + 1;
    
    // Требуется авторизация
    if (endpoint.requiredAuth) {
      stats.requiredAuth++;
    }
    
    // Пагинация
    if (endpoint.paginated) {
      stats.paginated++;
    }
  }

  return stats;
}

/**
 * Поиск эндпоинтов по описанию
 * 
 * @param {string} query - Поисковый запрос
 * @returns {Promise<Array>} Найденные эндпоинты
 * 
 * @example
 * const results = await searchEndpoints('game');
 * results.forEach(ep => console.log(ep.path, ep.description));
 */
async function searchEndpoints(query) {
  const manifest = await loadManifest();
  const lowerQuery = query.toLowerCase();
  
  return manifest.endpoints.filter(endpoint => 
    endpoint.path.toLowerCase().includes(lowerQuery) ||
    endpoint.description.toLowerCase().includes(lowerQuery) ||
    endpoint.category.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Валидировать манифест
 * 
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateManifest() {
  try {
    const manifest = await loadManifest(true);
    const errors = [];

    // Проверка обязательных полей
    if (!manifest.version) errors.push('Missing version');
    if (!manifest.apiName) errors.push('Missing apiName');
    if (!manifest.baseUrl) errors.push('Missing baseUrl');
    if (!manifest.endpoints || !Array.isArray(manifest.endpoints)) {
      errors.push('Missing or invalid endpoints array');
    }

    // Проверка эндпоинтов
    const paths = new Set();
    for (const endpoint of manifest.endpoints || []) {
      // Обязательные поля
      if (!endpoint.path) errors.push(`Endpoint missing path`);
      if (!endpoint.method) errors.push(`Endpoint ${endpoint.path} missing method`);
      if (!endpoint.category) errors.push(`Endpoint ${endpoint.path} missing category`);
      if (!endpoint.description) errors.push(`Endpoint ${endpoint.path} missing description`);

      // Дубликаты
      const key = `${endpoint.method}:${endpoint.path}`;
      if (paths.has(key)) {
        errors.push(`Duplicate endpoint: ${key}`);
      }
      paths.add(key);

      // Параметры
      if (endpoint.parameters && !Array.isArray(endpoint.parameters)) {
        errors.push(`Endpoint ${endpoint.path} has invalid parameters (not array)`);
      }
    }

    // Проверка totalEndpoints
    if (manifest.totalEndpoints !== manifest.endpoints.length) {
      errors.push(
        `totalEndpoints mismatch: declared ${manifest.totalEndpoints}, ` +
        `actual ${manifest.endpoints.length}`
      );
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Экспортировать манифест в различных форматах
 * 
 * @param {string} format - Формат экспорта (json, markdown, openapi)
 * @returns {Promise<string>} Экспортированный манифест
 */
async function exportManifest(format = 'json') {
  const manifest = await loadManifest();

  switch (format) {
    case 'json':
      return JSON.stringify(manifest, null, 2);

    case 'markdown':
      let md = `# ${manifest.apiName} v${manifest.version}\n\n`;
      md += `**Base URL:** ${manifest.baseUrl}\n\n`;
      md += `**Authentication:** ${manifest.authentication}\n\n`;
      md += `**Rate Limit:** ${manifest.rateLimit.withKey}\n\n`;
      md += `**Total Endpoints:** ${manifest.totalEndpoints}\n\n`;
      
      for (const category of manifest.categories) {
        md += `## ${category}\n\n`;
        
        const categoryEndpoints = manifest.endpoints.filter(
          ep => ep.category === category
        );
        
        for (const endpoint of categoryEndpoints) {
          md += `### ${endpoint.method} ${endpoint.path}\n\n`;
          md += `${endpoint.description}\n\n`;
          
          if (endpoint.parameters.length > 0) {
            md += `**Parameters:**\n\n`;
            for (const param of endpoint.parameters) {
              md += `- \`${param.name}\` (${param.type})`;
              if (param.required) md += ` **required**`;
              if (param.default !== undefined) md += ` (default: ${param.default})`;
              md += `\n`;
            }
            md += `\n`;
          }
          
          md += `**Response Type:** ${endpoint.responseType}\n\n`;
          md += `---\n\n`;
        }
      }
      
      return md;

    case 'openapi':
      // Базовая конвертация в OpenAPI 3.0
      const openapi = {
        openapi: '3.0.0',
        info: {
          title: manifest.apiName,
          version: manifest.version,
          description: `${manifest.apiName} - ${manifest.totalEndpoints} endpoints`
        },
        servers: [
          { url: manifest.baseUrl }
        ],
        paths: {}
      };

      for (const endpoint of manifest.endpoints) {
        if (!openapi.paths[endpoint.path]) {
          openapi.paths[endpoint.path] = {};
        }

        const operation = {
          summary: endpoint.description,
          tags: [endpoint.category],
          parameters: endpoint.parameters
            .filter(p => p.in !== 'body')
            .map(p => ({
              name: p.name,
              in: p.in || 'query',
              required: p.required || false,
              schema: { type: p.type }
            })),
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        };

        if (endpoint.requiredAuth) {
          operation.security = [{ bearerAuth: [] }];
        }

        openapi.paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
      }

      openapi.components = {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      };

      return JSON.stringify(openapi, null, 2);

    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

// Экспорт
module.exports = {
  loadManifest,
  isAllowedEndpoint,
  assertAllowedEndpoint,
  getEndpointMetadata,
  validateParameters,
  listEndpoints,
  getCategories,
  getManifestStats,
  searchEndpoints,
  validateManifest,
  exportManifest
};

// CLI интерфейс
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  (async () => {
    try {
      switch (command) {
        case 'validate':
          console.log('🔍 Validating endpoint manifest...\n');
          const validation = await validateManifest();
          
          if (validation.valid) {
            console.log('✅ Manifest is valid!\n');
            const stats = await getManifestStats();
            console.log(`Version: ${stats.version}`);
            console.log(`Total endpoints: ${stats.totalEndpoints}`);
            console.log(`Categories: ${Object.keys(stats.byCategory).length}`);
            console.log(`\nBy category:`);
            for (const [category, count] of Object.entries(stats.byCategory)) {
              console.log(`  ${category}: ${count}`);
            }
            console.log(`\nBy method:`);
            for (const [method, count] of Object.entries(stats.byMethod)) {
              console.log(`  ${method}: ${count}`);
            }
            console.log(`\nRequired auth: ${stats.requiredAuth}`);
            console.log(`Paginated: ${stats.paginated}\n`);
          } else {
            console.error('❌ Manifest validation failed:\n');
            validation.errors.forEach(err => console.error(`  - ${err}`));
            console.error('');
            process.exit(1);
          }
          break;

        case 'list':
          const category = arg;
          const endpoints = await listEndpoints(category);
          
          console.log(`\n📋 Endpoints${category ? ` in category "${category}"` : ''}\n`);
          
          for (const endpoint of endpoints) {
            console.log(`${endpoint.method.padEnd(6)} ${endpoint.path}`);
            console.log(`       ${endpoint.description}`);
            console.log('');
          }
          
          console.log(`Total: ${endpoints.length}\n`);
          break;

        case 'search':
          if (!arg) {
            console.error('Usage: node endpoint-lock.js search <query>\n');
            process.exit(1);
          }
          
          const results = await searchEndpoints(arg);
          
          console.log(`\n🔎 Search results for "${arg}"\n`);
          
          if (results.length === 0) {
            console.log('No results found.\n');
          } else {
            for (const endpoint of results) {
              console.log(`${endpoint.method.padEnd(6)} ${endpoint.path}`);
              console.log(`       [${endpoint.category}] ${endpoint.description}`);
              console.log('');
            }
            console.log(`Found: ${results.length}\n`);
          }
          break;

        case 'stats':
          const stats = await getManifestStats();
          
          console.log('\n📊 Manifest Statistics\n');
          console.log(`Version: ${stats.version}`);
          console.log(`Total endpoints: ${stats.totalEndpoints}`);
          console.log(`\nBy category:`);
          for (const [category, count] of Object.entries(stats.byCategory)) {
            console.log(`  ${category.padEnd(15)} ${count}`);
          }
          console.log(`\nBy method:`);
          for (const [method, count] of Object.entries(stats.byMethod)) {
            console.log(`  ${method.padEnd(15)} ${count}`);
          }
          console.log(`\nRequired auth:     ${stats.requiredAuth}`);
          console.log(`Paginated:         ${stats.paginated}\n`);
          break;

        case 'export':
          const format = arg || 'json';
          const exported = await exportManifest(format);
          console.log(exported);
          break;

        case 'check':
          if (!arg) {
            console.error('Usage: node endpoint-lock.js check <path>\n');
            process.exit(1);
          }
          
          const method = process.argv[4] || 'GET';
          const allowed = await isAllowedEndpoint(arg, method);
          
          if (allowed) {
            console.log(`✅ Endpoint allowed: ${method} ${arg}\n`);
            const metadata = await getEndpointMetadata(arg, method);
            console.log(`Category: ${metadata.category}`);
            console.log(`Description: ${metadata.description}`);
            console.log(`Parameters: ${metadata.parameters.length}`);
            console.log(`Required auth: ${metadata.requiredAuth}`);
            console.log('');
          } else {
            console.log(`❌ Endpoint NOT allowed: ${method} ${arg}\n`);
            process.exit(1);
          }
          break;

        default:
          console.log('Endpoint Lock System v6.0.0\n');
          console.log('Usage:');
          console.log('  node endpoint-lock.js validate                    - Validate manifest');
          console.log('  node endpoint-lock.js list [category]             - List endpoints');
          console.log('  node endpoint-lock.js search <query>              - Search endpoints');
          console.log('  node endpoint-lock.js stats                       - Show statistics');
          console.log('  node endpoint-lock.js export [json|markdown|openapi] - Export manifest');
          console.log('  node endpoint-lock.js check <path> [method]       - Check if endpoint allowed\n');
          console.log('Examples:');
          console.log('  node endpoint-lock.js validate');
          console.log('  node endpoint-lock.js list Games');
          console.log('  node endpoint-lock.js search "game"');
          console.log('  node endpoint-lock.js check /Games/list GET');
          console.log('  node endpoint-lock.js export markdown\n');
          process.exit(command ? 1 : 0);
      }
    } catch (error) {
      console.error('\n💥 Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
