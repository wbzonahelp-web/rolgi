# API Versioning Documentation

## Overview

The Rolgi SStats Analytics Platform implements a robust API versioning system to ensure backward compatibility while enabling continuous feature development. This document describes the versioning strategy, version detection mechanisms, and migration guide.

## Versioning Strategy

### Supported Versions

| Version | Status | Release Date | Deprecation Date | End-of-Life |
|---------|--------|--------------|------------------|-------------|
| v1      | Stable | 2024-01-01   | TBD              | TBD         |
| v2      | Current| 2024-06-01   | N/A              | N/A         |

### Version Lifecycle

1. **Current** - Latest stable version with full support and new features
2. **Stable** - Production-ready version with maintenance support
3. **Deprecated** - Still functional but not recommended for new projects
4. **End-of-Life** - No longer supported

## Version Detection

The API supports multiple methods for version detection:

### 1. URL Path (Recommended)

```bash
# V1 endpoint
GET /api/v1/games

# V2 endpoint
GET /api/v2/games
```

### 2. Accept Header

```bash
# Request V1
curl -H "Accept: application/vnd.rolgi.v1+json" \
  https://api.rolgi.com/api/games

# Request V2
curl -H "Accept: application/vnd.rolgi.v2+json" \
  https://api.rolgi.com/api/games
```

### 3. Query Parameter

```bash
# Request V1
GET /api/games?api-version=v1

# Request V2
GET /api/games?api-version=v2
```

### 4. Default Behavior

If no version is specified, the API defaults to **v2** (current version).

## Version Comparison

### V1 (Legacy)

**Characteristics:**
- Simple response structure
- Flat object format
- Abbreviated field names
- No metadata fields
- Basic error messages

**Example Response:**

```json
{
  "games": [
    {
      "id": 1,
      "date": "2024-01-15",
      "season": 2024,
      "week": 1,
      "homeTeam": "KC",
      "awayTeam": "BUF",
      "homeScore": 27,
      "awayScore": 24,
      "status": "Final",
      "venue": "Arrowhead Stadium"
    }
  ],
  "total": 1
}
```

**Field Mapping:**

| V1 Field         | Description           |
|------------------|-----------------------|
| `date`           | Game date             |
| `abbr`           | Team abbreviation     |
| `logo`           | Team logo URL         |

### V2 (Current)

**Characteristics:**
- Structured response format
- Nested objects for related data
- Full descriptive field names
- Metadata fields (timestamps, API version)
- Pagination support
- Enhanced error messages
- Additional filtering options

**Example Response:**

```json
{
  "data": [
    {
      "id": 1,
      "gameDate": "2024-01-15",
      "season": 2024,
      "week": 1,
      "homeTeam": {
        "id": "KC",
        "score": 27
      },
      "awayTeam": {
        "id": "BUF",
        "score": 24
      },
      "status": "Final",
      "venue": "Arrowhead Stadium",
      "metadata": {
        "createdAt": "2024-01-15T12:00:00Z",
        "updatedAt": "2024-01-15T15:30:00Z"
      }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "metadata": {
    "apiVersion": "v2",
    "timestamp": "2024-01-15T16:00:00Z"
  }
}
```

**Field Mapping:**

| V2 Field              | V1 Equivalent  | Description                    |
|-----------------------|----------------|--------------------------------|
| `gameDate`            | `date`         | Game date (renamed)            |
| `teamAbbreviation`    | `abbr`         | Team abbreviation (full name)  |
| `logoUrl`             | `logo`         | Team logo URL                  |
| `physicalAttributes`  | (flat fields)  | Nested player attributes       |
| `metadata`            | (none)         | Timestamps and API metadata    |

## API Endpoints

### Games

#### V1

```bash
# Get all games
GET /api/v1/games
Query params: ?season=2024&team=KC&status=Final&limit=50&offset=0

# Get single game
GET /api/v1/games/:id
```

#### V2

```bash
# Get all games
GET /api/v2/games
Query params: ?season=2024&team=KC&status=Final&startDate=2024-01-01&endDate=2024-12-31&limit=50&offset=0

# Get single game
GET /api/v2/games/:id
```

**V2 Enhancements:**
- Date range filtering (`startDate`, `endDate`)
- Pagination metadata
- Enhanced error responses

### Teams

#### V1

```bash
# Get all teams
GET /api/v1/teams
Query params: ?conference=AFC&division=West&limit=50&offset=0

# Get single team
GET /api/v1/teams/:id
```

#### V2

```bash
# Get all teams
GET /api/v2/teams
Query params: ?conference=AFC&division=West&search=Chiefs&limit=50&offset=0

# Get single team
GET /api/v2/teams/:id
```

**V2 Enhancements:**
- Search filtering
- Structured response

### Players

#### V1

```bash
# Get all players
GET /api/v1/players
Query params: ?team=KC&position=QB&active=true&limit=50&offset=0

# Get single player
GET /api/v1/players/:id
```

#### V2

```bash
# Get all players
GET /api/v2/players
Query params: ?team=KC&position=QB&active=true&search=Mahomes&limit=50&offset=0

# Get single player
GET /api/v2/players/:id
```

**V2 Enhancements:**
- Search filtering
- Nested physical attributes

## Response Headers

All API responses include version information in headers:

```
X-API-Version: v2
X-API-Version-Info: {"version":"2.0.0","status":"current","deprecated":false}
```

### Deprecated Version Headers

When using a deprecated API version, additional headers are included:

```
X-API-Deprecated: true
X-API-Deprecation-Info: API v1 is deprecated. Please migrate to the latest version.
```

## Error Responses

### V1 Error Format

```json
{
  "error": "Game not found"
}
```

### V2 Error Format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Game with ID 999 not found"
  }
}
```

### V2 Error Codes

| Code                | Status | Description                    |
|---------------------|--------|--------------------------------|
| `INVALID_VERSION`   | 400    | Unsupported API version        |
| `VALIDATION_ERROR`  | 400    | Invalid request parameters     |
| `NOT_FOUND`         | 404    | Resource not found             |
| `INTERNAL_ERROR`    | 500    | Internal server error          |

## Migration Guide

### Migrating from V1 to V2

#### 1. Update Request URLs

```bash
# Before (V1)
GET /api/v1/games

# After (V2)
GET /api/v2/games
```

#### 2. Update Response Handling

**V1 Response Structure:**
```javascript
const response = await fetch('/api/v1/games');
const { games, total } = await response.json();
```

**V2 Response Structure:**
```javascript
const response = await fetch('/api/v2/games');
const { data, pagination, metadata } = await response.json();
// games are in 'data', not 'games'
```

#### 3. Update Field Names

```javascript
// V1
const gameDate = game.date;
const teamAbbr = team.abbr;

// V2
const gameDate = game.gameDate;
const teamAbbr = team.teamAbbreviation;
```

#### 4. Handle Nested Objects

```javascript
// V1
const homeScore = game.homeScore;

// V2
const homeScore = game.homeTeam.score;
```

#### 5. Utilize New Features

```javascript
// V2 supports date range filtering
const response = await fetch('/api/v2/games?startDate=2024-01-01&endDate=2024-01-31');

// V2 includes metadata
const { metadata } = await response.json();
console.log('API Version:', metadata.apiVersion);
```

#### 6. Update Error Handling

```javascript
// V1
if (response.error) {
  console.error(response.error);
}

// V2
if (response.error) {
  console.error(response.error.code, response.error.message);
}
```

## Backward Compatibility

The versioning system ensures:

1. **Existing V1 clients continue to work** without modification
2. **Response transformation** automatically converts between formats when needed
3. **Field name consistency** within each version
4. **No breaking changes** to stable versions

## Implementation Details

### Version Detection Middleware

```javascript
// Automatically detects and validates API version
fastify.addHook('onRequest', async (request, reply) => {
  const version = extractApiVersion(request);
  request.apiVersion = version;
  
  if (!validateVersion(version)) {
    reply.code(400).send({
      error: 'Invalid API version',
      availableVersions: ['v1', 'v2']
    });
  }
});
```

### Response Transformation

```javascript
// Automatically transform between versions
function transformV2toV1(data) {
  return {
    ...data,
    date: data.gameDate, // Rename field
    abbr: data.teamAbbreviation
    // Remove metadata
  };
}
```

## Best Practices

### For API Consumers

1. **Always specify version explicitly** in production
2. **Use URL path versioning** for clarity
3. **Monitor deprecation headers** for warnings
4. **Plan migrations** before versions reach end-of-life
5. **Test against new versions** before migrating

### For API Developers

1. **Never break V1 compatibility** once released
2. **Add new features to latest version** only
3. **Document all breaking changes** between versions
4. **Provide migration guides** for version upgrades
5. **Give advance notice** (6 months) before deprecation

## Testing

### Test Version Detection

```bash
# Test URL path detection
curl http://localhost:3000/api/v1/games

# Test header detection
curl -H "Accept: application/vnd.rolgi.v1+json" \
  http://localhost:3000/api/games

# Test query parameter
curl http://localhost:3000/api/games?api-version=v1
```

### Test Response Format

```bash
# Compare V1 and V2 responses
diff <(curl -s http://localhost:3000/api/v1/games/1 | jq .) \
     <(curl -s http://localhost:3000/api/v2/games/1 | jq .)
```

## Monitoring

### Version Usage Metrics

Track API version usage via Prometheus:

```promql
# Requests by version
api_requests_total{version="v1"}
api_requests_total{version="v2"}

# Response times by version
api_response_time_seconds{version="v1"}
api_response_time_seconds{version="v2"}
```

### Deprecation Warnings

Monitor logs for deprecated version usage:

```javascript
{
  level: 'warn',
  msg: 'Deprecated API version used',
  version: 'v1',
  path: '/api/v1/games',
  ip: '192.168.1.100'
}
```

## Future Versions

### V3 Planning

Potential features for V3:

- GraphQL integration
- Real-time subscriptions
- Enhanced filtering with operators
- Batch operations
- Hypermedia controls (HATEOAS)

## Support

### Questions and Issues

- Documentation: https://docs.rolgi.com/api-versioning
- GitHub Issues: https://github.com/wbzonahelp-web/rolgi/issues
- Email: [email protected]

### Version Support

- **V2**: Full support with new features
- **V1**: Maintenance support only

## Changelog

### V2.0.0 (2024-06-01)

**Added:**
- Pagination metadata
- Date range filtering
- Search functionality
- Nested object structures
- Enhanced error responses
- Metadata fields

**Changed:**
- Response structure (`data`, `pagination`, `metadata`)
- Field names (`date` → `gameDate`, `abbr` → `teamAbbreviation`)

**Deprecated:**
- None

### V1.0.0 (2024-01-01)

- Initial release
- Basic CRUD operations
- Simple response format

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Current
