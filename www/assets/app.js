/* Rolgi SStats — общий runtime (v1.0)
 * Глобальный объект: window.Rolgi
 *   .api  — обёртка над fetch с in-memory кешем
 *   .ws   — класс WS-клиента с reconnect/heartbeat
 *   .fmt  — форматтеры (дата, время, счёт, статус)
 *   .ui   — UI-помощники (toast, flash, бургер)
 *   .on   — простой event-emitter (для live-обновлений)
 */
(function (global) {
    'use strict';

    const API_BASE = '/api/cached';

    // ──────────────────────────────────────────────────────────────
    // Event emitter
    // ──────────────────────────────────────────────────────────────
    const listeners = new Map();
    const on  = (e, fn) => { (listeners.get(e) || listeners.set(e, []).get(e)).push(fn); return () => off(e, fn); };
    const off = (e, fn) => { const ls = listeners.get(e); if (ls) listeners.set(e, ls.filter(f => f !== fn)); };
    const emit = (e, data) => { (listeners.get(e) || []).forEach(fn => { try { fn(data); } catch (_) {} }); };

    // ──────────────────────────────────────────────────────────────
    // API: fetch с кешем + retry
    // ──────────────────────────────────────────────────────────────
    const cache = new Map();
    const TTL = {
        leagues:        5 * 60_000,   // 5 min
        'leagues-pop':  5 * 60_000,
        teams:          5 * 60_000,
        team:           2 * 60_000,
        players:        5 * 60_000,
        player:         2 * 60_000,
        games:          30_000,
        'games-list':   30_000,
        'games-live':   10_000,
        game:           10_000,
        odds:           20_000,
        standings:      2 * 60_000,
        default:        60_000,
    };

    async function apiGet(endpoint, params = {}, opts = {}) {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
        ).toString();
        const url = (endpoint.startsWith('/api/') || endpoint.startsWith('http'))
            ? endpoint + (qs ? '?' + qs : '')
            : API_BASE + endpoint + (qs ? '?' + qs : '');
        const type = opts.cacheType || 'default';
        const ttl = TTL[type] ?? TTL.default;

        if (!opts.noCache) {
            const c = cache.get(url);
            if (c && Date.now() - c.t < ttl) return c.v;
        }

        let lastErr;
        for (let i = 0; i < 2; i++) {
            try {
                const r = await fetch(url, { credentials: 'same-origin' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const data = await r.json();
                cache.set(url, { v: data, t: Date.now() });
                return data;
            } catch (e) {
                lastErr = e;
                if (i === 0) await new Promise(r => setTimeout(r, 400));
            }
        }
        throw lastErr;
    }
    const api = { get: apiGet, clearCache: () => cache.clear() };

    // ──────────────────────────────────────────────────────────────
    // WebSocket клиент (reconnect + heartbeat + auto-resubscribe)
    // ──────────────────────────────────────────────────────────────
    class RolgiWS {
        constructor(opts = {}) {
            this.url = opts.url || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
            this.ws = null;
            this.subs = new Set();   // каналы, на которые подписаны (на случай reconnect)
            this.handlers = new Map();// channel -> handlerFn
            this.connected = false;
            this.shouldRun = false;
            this.reconnectDelay = 1500;
            this.maxDelay = 30_000;
            this.heartbeatTimer = null;
            this.onStatus = opts.onStatus || (() => {});
        }
        connect() {
            this.shouldRun = true;
            this._open();
        }
        _open() {
            try {
                this.ws = new WebSocket(this.url);
            } catch (e) {
                this._scheduleReconnect();
                return;
            }
            this.ws.addEventListener('open', () => {
                this.connected = true;
                this.reconnectDelay = 1500;
                this.onStatus('connected');
                this._startHeartbeat();
                // переподписываемся на все каналы
                for (const ch of this.subs) this._send({ type: 'subscribe', channel: ch });
            });
            this.ws.addEventListener('message', (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                if (msg.type === 'pong') return;
                const ch = msg.channel;
                if (ch && this.handlers.has(ch)) {
                    try { this.handlers.get(ch)(msg); } catch (_) {}
                }
                emit('ws:message', msg);
            });
            this.ws.addEventListener('close', () => {
                this.connected = false;
                this._stopHeartbeat();
                this.onStatus('disconnected');
                if (this.shouldRun) this._scheduleReconnect();
            });
            this.ws.addEventListener('error', () => { /* close will follow */ });
        }
        _scheduleReconnect() {
            const delay = Math.min(this.reconnectDelay, this.maxDelay);
            setTimeout(() => { if (this.shouldRun) this._open(); }, delay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxDelay);
        }
        _startHeartbeat() {
            this._stopHeartbeat();
            this.heartbeatTimer = setInterval(() => this._send({ type: 'ping' }), 25_000);
        }
        _stopHeartbeat() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }
        _send(obj) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try { this.ws.send(JSON.stringify(obj)); } catch (_) {}
            }
        }
        subscribe(channel, handler) {
            this.subs.add(channel);
            if (handler) this.handlers.set(channel, handler);
            this._send({ type: 'subscribe', channel });
        }
        unsubscribe(channel) {
            this.subs.delete(channel);
            this.handlers.delete(channel);
            this._send({ type: 'unsubscribe', channel });
        }
        close() {
            this.shouldRun = false;
            this._stopHeartbeat();
            if (this.ws) try { this.ws.close(); } catch (_) {}
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Форматтеры
    // ──────────────────────────────────────────────────────────────
    const fmt = {
        score(home, away) {
            if (home == null || away == null) return '-';
            return home + ' : ' + away;
        },
        time(date) {
            if (!date) return '';
            const d = typeof date === 'string' ? new Date(date) : date;
            return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        },
        date(date) {
            if (!date) return '';
            const d = typeof date === 'string' ? new Date(date) : date;
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        },
        dateFull(date) {
            if (!date) return '';
            const d = typeof date === 'string' ? new Date(date) : date;
            return d.toLocaleString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        },
        status(status) {
            const map = {
                live: { label: 'Live', cls: 'r-status-live' },
                in_progress: { label: 'Live', cls: 'r-status-live' },
                finished: { label: 'Завершён', cls: 'r-status-finished' },
                scheduled: { label: 'Запланирован', cls: 'r-status-scheduled' },
                postponed: { label: 'Перенесён', cls: 'r-status-postponed' },
                cancelled: { label: 'Отменён', cls: 'r-status-cancelled' },
                abandoned: { label: 'Прерван', cls: 'r-status-cancelled' },
                interrupted: { label: 'Прерван', cls: 'r-status-cancelled' },
            };
            return map[String(status || '').toLowerCase()] || { label: String(status || ''), cls: 'r-status-scheduled' };
        },
        escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        },
    };

    // ──────────────────────────────────────────────────────────────
    // UI помощники
    // ──────────────────────────────────────────────────────────────
    const ui = {
        toast(text, opts = {}) {
            let container = document.querySelector('.r-goal-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'r-goal-toast-container';
                document.body.appendChild(container);
            }
            const t = document.createElement('div');
            t.className = 'r-goal-toast';
            t.innerHTML = `<span class="r-goal-emoji">${opts.emoji || '⚽'}</span><span>${fmt.escapeHtml(text)}</span>`;
            container.appendChild(t);
            setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 400); }, opts.duration || 4000);
        },
        flash(el) {
            if (!el) return;
            el.classList.remove('r-score-flash');
            void el.offsetWidth;
            el.classList.add('r-score-flash');
        },
        setWSStatus(el, status) {
            if (!el) return;
            el.classList.remove('connected', 'disconnected');
            el.classList.add(status === 'connected' ? 'connected' : 'disconnected');
            const txt = el.querySelector('.r-ws-text');
            if (txt) txt.textContent = status === 'connected' ? 'Live' : 'Off';
        },
        initBurger() {
            // активирует бургер если есть .r-burger + .r-nav
            const burger = document.querySelector('.r-burger');
            const nav = document.querySelector('.r-nav');
            if (burger && nav) {
                burger.addEventListener('click', () => nav.classList.toggle('open'));
                document.addEventListener('click', (e) => {
                    if (!burger.contains(e.target) && !nav.contains(e.target)) nav.classList.remove('open');
                });
            }
        },
    };

    // Auto-init бургера
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ui.initBurger);
    } else {
        ui.initBurger();
    }

    // ──────────────────────────────────────────────────────────────
    // Auth: JWT management (localStorage)
    // ──────────────────────────────────────────────────────────────
    const AUTH_TOKEN_KEY = 'rolgi_access_token';
    const AUTH_REFRESH_KEY = 'rolgi_refresh_token';
    const AUTH_USER_KEY = 'rolgi_user';

    const auth = {
        getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); },
        getUser() { try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY)); } catch { return null; } },
        isLoggedIn() { return !!localStorage.getItem(AUTH_TOKEN_KEY); },

        setSession(data) {
            localStorage.setItem(AUTH_TOKEN_KEY, data.accessToken);
            localStorage.setItem(AUTH_REFRESH_KEY, data.refreshToken);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
            emit('auth:login', data.user);
        },

        clearSession() {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_REFRESH_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
            emit('auth:logout');
        },

        async login(username, password) {
            const r = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.message || 'Login failed');
            }
            const data = await r.json();
            auth.setSession(data);
            return data;
        },

        async register(username, email, password) {
            const r = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.message || 'Registration failed');
            }
            const data = await r.json();
            auth.setSession(data);
            return data;
        },

        async logout() {
            const token = auth.getToken();
            if (token) {
                try {
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token },
                    });
                } catch (_) {}
            }
            auth.clearSession();
        },

        async refresh() {
            const refreshToken = localStorage.getItem(AUTH_REFRESH_KEY);
            if (!refreshToken) { auth.clearSession(); return false; }
            try {
                const r = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                });
                if (!r.ok) { auth.clearSession(); return false; }
                const data = await r.json();
                auth.setSession(data);
                return true;
            } catch (_) {
                auth.clearSession();
                return false;
            }
        },
    };

    // Auth-aware fetch wrapper
    async function authFetch(url, opts = {}) {
        const token = auth.getToken();
        if (token) {
            opts.headers = opts.headers || {};
            opts.headers['Authorization'] = 'Bearer ' + token;
        }
        return fetch(url, opts);
    }

    // Override apiGet to use authFetch
    async function apiGetAuth(endpoint, params = {}, opts = {}) {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
        ).toString();
        const url = (endpoint.startsWith('/api/') || endpoint.startsWith('http'))
            ? endpoint + (qs ? '?' + qs : '')
            : API_BASE + endpoint + (qs ? '?' + qs : '');
        const type = opts.cacheType || 'default';
        const ttl = TTL[type] ?? TTL.default;

        if (!opts.noCache) {
            const c = cache.get(url);
            if (c && Date.now() - c.t < ttl) return c.v;
        }

        let lastErr;
        for (let i = 0; i < 2; i++) {
            try {
                const r = await authFetch(url, { credentials: 'same-origin' });
                if (r.status === 401 && i === 0) {
                    const refreshed = await auth.refresh();
                    if (refreshed) continue;
                }
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const data = await r.json();
                cache.set(url, { v: data, t: Date.now() });
                return data;
            } catch (e) {
                lastErr = e;
                if (i === 0) await new Promise(r => setTimeout(r, 400));
            }
        }
        throw lastErr;
    }
    const apiAuth = { get: apiGetAuth, post: async (url, body, opts = {}) => {
        const token = auth.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'same-origin', ...opts });
        return r.json();
    }, delete: async (url) => {
        const token = auth.getToken();
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(url, { method: 'DELETE', headers, credentials: 'same-origin' });
        return r.json();
    }, put: async (url, body) => {
        const token = auth.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body), credentials: 'same-origin' });
        return r.json();
    }, clearCache: () => cache.clear() };

    global.Rolgi = { api: apiAuth, ws: RolgiWS, fmt, ui, on, off, emit, API_BASE, auth };
})(window);

// ════════════════════════════════════════════════════════════════════
// Расширения Rolgi: gameStatus, countryFlag (по country_name)
// ════════════════════════════════════════════════════════════════════
(function(){
    if (!window.Rolgi) return;

    const STATUS_KIND = {
        scheduled:        { kind: 'scheduled', label: 'Запланирован', css: 'r-status-scheduled' },
        live:             { kind: 'live',      label: 'Live',          css: 'r-status-live'      },
        interrupted:      { kind: 'live',      label: 'Прерван',       css: 'r-status-live'      },
        finished:         { kind: 'finished',  label: 'Завершён',      css: 'r-status-finished'  },
        postponed:        { kind: 'postponed', label: 'Перенесён',     css: 'r-status-postponed' },
        cancelled:        { kind: 'cancelled', label: 'Отменён',       css: 'r-status-cancelled' },
        abandoned:        { kind: 'cancelled', label: 'Прерван',       css: 'r-status-cancelled' },
        'technical loss': { kind: 'cancelled', label: 'Тех. поражение',css: 'r-status-cancelled' },
        'walk over':      { kind: 'finished',  label: 'Без игры',      css: 'r-status-finished'  },
    };
    function gameStatus(status, isLive, isFinished) {
        // Boolean флаги имеют приоритет (наша БД точнее, чем status string)
        if (isLive === true)    return { kind: 'live',     label: 'Live',     css: 'r-status-live' };
        if (isFinished === true && (!status || STATUS_KIND[status]?.kind !== 'cancelled'))
                                 return { kind: 'finished', label: 'Завершён', css: 'r-status-finished' };
        return STATUS_KIND[status] || { kind: 'unknown', label: status || '?', css: '' };
    }

    // Маппинг country_name (из БД) → ISO 3166-1 alpha-2 (для emoji-флага)
    const COUNTRY_CODES = {
        Albania:'AL', Algeria:'DZ', Andorra:'AD', Angola:'AO', Argentina:'AR', Armenia:'AM',
        Australia:'AU', Austria:'AT', Azerbaijan:'AZ', Bahrain:'BH', Bangladesh:'BD',
        Barbados:'BB', Belarus:'BY', Belgium:'BE', Benin:'BJ', Bermuda:'BM', Bhutan:'BT',
        Bolivia:'BO', 'Bosnia & Herzegovina':'BA', 'Bosnia-and-Herzegovina':'BA', Botswana:'BW',
        Brazil:'BR', Brunei:'BN', Bulgaria:'BG', 'Burkina-Faso':'BF', Burundi:'BI',
        Cambodia:'KH', Cameroon:'CM', Canada:'CA', Chile:'CL', China:'CN', Colombia:'CO',
        Comoros:'KM', Congo:'CG', 'Congo DR':'CD', 'Costa-Rica':'CR', 'Costa Rica':'CR',
        Croatia:'HR', Cuba:'CU', Curacao:'CW', Cyprus:'CY', Czech:'CZ', 'Czech Republic':'CZ',
        Denmark:'DK', Djibouti:'DJ', Dominica:'DM', 'Dominican-Republic':'DO',
        'Dominican Republic':'DO', Ecuador:'EC', Egypt:'EG', 'El-Salvador':'SV',
        'El Salvador':'SV', England:'GB-ENG', Estonia:'EE', Eswatini:'SZ', Ethiopia:'ET',
        'Faroe-Islands':'FO', 'Faroe Islands':'FO', Fiji:'FJ', Finland:'FI', France:'FR',
        Gabon:'GA', Gambia:'GM', Georgia:'GE', Germany:'DE', Ghana:'GH', Gibraltar:'GI',
        Greece:'GR', Grenada:'GD', Guatemala:'GT', Guinea:'GN', 'Guinea-Bissau':'GW',
        Guyana:'GY', Haiti:'HT', Honduras:'HN', 'Hong Kong':'HK', Hungary:'HU',
        Iceland:'IS', India:'IN', Indonesia:'ID', Iran:'IR', Iraq:'IQ', Ireland:'IE',
        Israel:'IL', Italy:'IT', 'Ivory Coast':'CI', Jamaica:'JM', Japan:'JP', Jordan:'JO',
        Kazakhstan:'KZ', Kenya:'KE', Kosovo:'XK', Kuwait:'KW', Kyrgyzstan:'KG', Laos:'LA',
        Latvia:'LV', Lebanon:'LB', Lesotho:'LS', Liberia:'LR', Libya:'LY', Liechtenstein:'LI',
        Lithuania:'LT', Luxembourg:'LU', Macau:'MO', Madagascar:'MG', Malawi:'MW',
        Malaysia:'MY', Maldives:'MV', Mali:'ML', Malta:'MT', Mauritania:'MR', Mauritius:'MU',
        Mexico:'MX', Moldova:'MD', Monaco:'MC', Mongolia:'MN', Montenegro:'ME', Montserrat:'MS',
        Morocco:'MA', Mozambique:'MZ', Myanmar:'MM', Namibia:'NA', Nepal:'NP', Netherlands:'NL',
        'New Zealand':'NZ', Nicaragua:'NI', Niger:'NE', Nigeria:'NG', 'North Korea':'KP',
        'North Macedonia':'MK', 'Northern Ireland':'GB-NIR', Norway:'NO', Oman:'OM',
        Pakistan:'PK', Palestine:'PS', Panama:'PA', 'Papua New Guinea':'PG', Paraguay:'PY',
        Peru:'PE', Philippines:'PH', Poland:'PL', Portugal:'PT', 'Puerto Rico':'PR',
        Qatar:'QA', Romania:'RO', Russia:'RU', Rwanda:'RW', 'San Marino':'SM',
        'Saudi Arabia':'SA', Scotland:'GB-SCT', Senegal:'SN', Serbia:'RS', Sierra:'SL',
        'Sierra Leone':'SL', Singapore:'SG', Slovakia:'SK', Slovenia:'SI', Somalia:'SO',
        'South Africa':'ZA', 'South Korea':'KR', 'South Sudan':'SS', Spain:'ES', 'Sri Lanka':'LK',
        Sudan:'SD', Suriname:'SR', Sweden:'SE', Switzerland:'CH', Syria:'SY', Tajikistan:'TJ',
        Tanzania:'TZ', Thailand:'TH', 'Timor-Leste':'TL', Togo:'TG', 'Trinidad & Tobago':'TT',
        'Trinidad and Tobago':'TT', Tunisia:'TN', Turkey:'TR', Turkmenistan:'TM', Uganda:'UG',
        Ukraine:'UA', 'United Arab Emirates':'AE', 'United States':'US', USA:'US', Uruguay:'UY',
        Uzbekistan:'UZ', Venezuela:'VE', Vietnam:'VN', Wales:'GB-WLS', Yemen:'YE', Zambia:'ZM',
        Zimbabwe:'ZW', World:'🌍', International:'🌍',
    };
    function countryFlagByName(name) {
        if (!name) return '🏳️';
        const code = COUNTRY_CODES[name];
        if (!code) return '🏳️';
        // спецсимволы (World, регионы UK)
        if (code === '🌍') return '🌍';
        if (code === 'GB-ENG') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
        if (code === 'GB-SCT') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
        if (code === 'GB-WLS') return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
        if (code === 'GB-NIR') return '🇬🇧';
        if (code === 'XK')      return '🇽🇰';
        return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    }

    Rolgi.fmt = Rolgi.fmt || {};
    Rolgi.fmt.gameStatus = gameStatus;
    Rolgi.fmt.countryFlagByName = countryFlagByName;
    Rolgi.fmt.escapeHtml = Rolgi.fmt.escapeHtml || (s => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
})();
