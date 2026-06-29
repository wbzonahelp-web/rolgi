'use strict';

/**
 * src/analytics/python-client.js
 *
 * HTTP-клиент к rolgi-analytics (Python FastAPI).
 *
 * Принципы:
 *   - Graceful degradation: на любую ошибку сети/сервиса возвращает null,
 *     не пробрасывает (вызывающий код должен принять отсутствие HMM как валидный кейс).
 *   - Retry: 1 повтор на transient errors (5xx, ECONNRESET, ETIMEDOUT) с jitter 100..300 ms.
 *   - Circuit-breaker: после 3 подряд неудач — открытый круг на 30 секунд
 *     (все запросы возвращают null без попытки до закрытия круга).
 *   - Таймаут запроса: 5 секунд (HMM ~600 мс, кэш ~50 мс — запас 8×).
 *
 * Конфигурация (env):
 *   ANALYTICS_BASE_URL    default 'http://analytics:8000'
 *   ANALYTICS_TIMEOUT_MS  default 5000
 *   ANALYTICS_CB_THRESHOLD default 3   (failures до открытия круга)
 *   ANALYTICS_CB_RESET_MS default 30000
 */

const logger = require('../monitoring/logger');

const BASE_URL = process.env.ANALYTICS_BASE_URL || 'http://analytics:8000';
const REQUEST_TIMEOUT_MS = parseInt(process.env.ANALYTICS_TIMEOUT_MS || '5000', 10);
const CB_THRESHOLD = parseInt(process.env.ANALYTICS_CB_THRESHOLD || '3', 10);
const CB_RESET_MS = parseInt(process.env.ANALYTICS_CB_RESET_MS || '30000', 10);

const TRANSIENT_HTTP_CODES = new Set([502, 503, 504]);
const TRANSIENT_ERR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);

// Circuit breaker state (module-level, общий для всех запросов в процессе API)
const cb = {
    failures: 0,
    openedAt: 0,
};

function cbIsOpen() {
    if (cb.failures < CB_THRESHOLD) return false;
    const elapsed = Date.now() - cb.openedAt;
    if (elapsed >= CB_RESET_MS) {
        // Half-open: сбрасываем счётчик, разрешаем одну попытку
        cb.failures = 0;
        cb.openedAt = 0;
        logger.info({ component: 'python-client' }, 'Circuit breaker reset (half-open)');
        return false;
    }
    return true;
}

function cbRecordFailure() {
    cb.failures += 1;
    if (cb.failures === CB_THRESHOLD) {
        cb.openedAt = Date.now();
        logger.warn({
            component: 'python-client',
            failures: cb.failures,
            reset_in_ms: CB_RESET_MS,
        }, 'Circuit breaker OPENED');
    }
}

function cbRecordSuccess() {
    if (cb.failures > 0) {
        cb.failures = 0;
        cb.openedAt = 0;
    }
}

function isTransient(err, status) {
    if (status && TRANSIENT_HTTP_CODES.has(status)) return true;
    if (err && err.code && TRANSIENT_ERR_CODES.has(err.code)) return true;
    if (err && err.name === 'AbortError') return true;
    return false;
}

function jitter(baseMs, spreadMs = 200) {
    return baseMs + Math.floor(Math.random() * spreadMs);
}

/**
 * Низкоуровневый запрос с таймаутом. Возвращает {ok, status, data, err}.
 */
async function rawFetch(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        let data = null;
        try { data = await r.json(); } catch (_) { /* not JSON */ }
        return { ok: r.ok, status: r.status, data, err: null };
    } catch (err) {
        return { ok: false, status: 0, data: null, err };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Универсальный GET с retry + circuit-breaker.
 * Возвращает data или null.
 */
async function safeGet(path) {
    if (cbIsOpen()) {
        logger.debug({ component: 'python-client', path }, 'Circuit breaker open, skipping request');
        return null;
    }
    const url = BASE_URL + path;

    for (let attempt = 1; attempt <= 2; attempt++) {
        const t0 = Date.now();
        const { ok, status, data, err } = await rawFetch(url);
        const dt = Date.now() - t0;

        if (ok && data) {
            cbRecordSuccess();
            return data;
        }

        // Non-transient HTTP error (4xx) — не ретраим, возвращаем null
        if (status >= 400 && status < 500) {
            // Не считаем как поломку сервиса (это business 404 / 400)
            logger.debug({
                component: 'python-client', path, status, took_ms: dt,
            }, 'Python service returned non-retriable status');
            cbRecordSuccess();
            return null;
        }

        // Transient: возможно retry
        const transient = isTransient(err, status);
        logger.warn({
            component: 'python-client', path, status, attempt,
            err: err ? err.message : null, took_ms: dt, transient,
        }, 'Python service request failed');

        if (!transient || attempt === 2) {
            cbRecordFailure();
            return null;
        }
        await new Promise(r => setTimeout(r, jitter(150)));
    }
    return null;
}

// ─────────── Публичный API ───────────

/**
 * Запрос анализатора для команды.
 *
 * @param {string} name      — имя анализатора (например, 'hmm')
 * @param {number} teamId    — sstats_id или internal id (Python резолвит сам)
 * @param {Object} opts
 * @param {number} [opts.nWindow=20]
 * @param {number} [opts.leagueId]
 * @param {string} [opts.venue='any']    'any'|'home'|'away'
 * @param {boolean} [opts.noCache=false]
 * @param {Object}  [opts.extra]         дополнительные параметры (n_states и пр.)
 * @returns {Promise<Object|null>}       данные анализатора или null при ошибке/таймауте
 */
async function getTeamAnalyzer(name, teamId, opts = {}) {
    const params = new URLSearchParams();
    params.set('n_window', String(opts.nWindow || 20));
    if (opts.leagueId) params.set('league_id', String(opts.leagueId));
    if (opts.venue && opts.venue !== 'any') params.set('venue', String(opts.venue));
    if (opts.noCache) params.set('no_cache', 'true');
    if (opts.extra && typeof opts.extra === 'object') {
        for (const [k, v] of Object.entries(opts.extra)) {
            if (v !== null && v !== undefined) params.set(k, String(v));
        }
    }
    const path = `/analyzers/${encodeURIComponent(name)}/team/${teamId}?${params.toString()}`;
    const result = await safeGet(path);
    return result ? result.data : null;
}

/**
 * Список зарегистрированных анализаторов на стороне Python.
 */
async function listAnalyzers() {
    const r = await safeGet('/analyzers');
    return r ? r.data : null;
}

/**
 * Health-check Python-сервиса (используется в /health Node API при желании).
 */
async function health() {
    const r = await safeGet('/health');
    return r;
}

/**
 * Состояние circuit-breaker'а (для observability).
 */
function getCircuitState() {
    return {
        failures: cb.failures,
        is_open: cbIsOpen(),
        opened_at: cb.openedAt || null,
        threshold: CB_THRESHOLD,
        reset_ms: CB_RESET_MS,
    };
}

module.exports = {
    getTeamAnalyzer,
    listAnalyzers,
    health,
    getCircuitState,
    // Для тестов
    _internals: { cb, isTransient, jitter },
};
