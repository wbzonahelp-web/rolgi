/* Rolgi SStats — компоненты (v1.0)
 * Функции рендера, которые используют общий стиль из app.css.
 * Все функции возвращают HTML-строку (вставляется через innerHTML).
 * Использует window.Rolgi.fmt для форматирования.
 */
(function (global) {
    'use strict';
    const fmt = global.Rolgi ? global.Rolgi.fmt : null;

    /**
     * Шапка сайта. Передай active = 'index' | 'leagues' | 'teams' | 'players'.
     * Замонтировать на странице: document.body.insertAdjacentHTML('afterbegin', Rolgi.components.header('index'));
     */
    function header(active = '') {
        const links = [
            { id: 'index',   href: '/',              icon: 'fa-home',   label: 'Матчи' },
            { id: 'leagues', href: '/leagues.html',  icon: 'fa-trophy', label: 'Лиги' },
            { id: 'cappers', href: '/cappers.html',  icon: 'fa-user-secret', label: 'Капперы' },
            { id: 'teams',   href: '/teams.html',    icon: 'fa-users',  label: 'Команды' },
            { id: 'players', href: '/players.html',  icon: 'fa-user',   label: 'Игроки' },
        ];
        const nav = links.map(l =>
            `<a href="${l.href}"${l.id === active ? ' class="active"' : ''}><i class="fas ${l.icon}"></i> ${l.label}</a>`
        ).join('');
        return `
<header class="r-header">
  <div class="r-header-content">
    <a href="/" class="r-logo"><i class="fas fa-futbol"></i><span>Rolgi SStats</span></a>
    <button class="r-burger" aria-label="Меню" type="button"><i class="fas fa-bars"></i></button>
    <nav class="r-nav">${nav}</nav>
  </div>
</header>`.trim();
    }

    /** WS-индикатор (вешать в шапку или рядом со счётом) */
    function wsIndicator(initial = 'connecting') {
        const cls = initial === 'connected' ? 'connected' : (initial === 'disconnected' ? 'disconnected' : '');
        const txt = initial === 'connected' ? 'Live' : 'Off';
        return `<span class="r-ws-indicator ${cls}"><span class="r-ws-dot"></span><span class="r-ws-text">${txt}</span></span>`;
    }

    /** Загрузочный плейсхолдер */
    function loading(text = 'Загрузка…') {
        return `<div class="r-loading"><div class="r-spinner"></div><div>${fmt ? fmt.escapeHtml(text) : text}</div></div>`;
    }

    /** Сообщение об ошибке */
    function errorBox(text) {
        return `<div class="r-loading" style="color:var(--danger-color)"><i class="fas fa-exclamation-triangle" style="font-size:2em"></i><div>${fmt ? fmt.escapeHtml(text) : text}</div></div>`;
    }

    /** Бейдж статуса матча */
    function statusBadge(status) {
        if (!fmt) return '';
        const s = fmt.status(status);
        return `<span class="r-status ${s.cls}">${fmt.escapeHtml(s.label)}</span>`;
    }

    /** Карточка-плитка для дашбордов */
    function statCard({ icon, label, value, color }) {
        return `
<div class="r-card r-card-padded" style="border-left:4px solid ${color || 'var(--primary-color)'};">
  <div class="r-text-muted r-text-sm">${fmt ? fmt.escapeHtml(label) : label}</div>
  <div style="font-size:inherit;font-weight:700;margin-top:4px">${fmt ? fmt.escapeHtml(value) : value}</div>
  ${icon ? `<i class="fas ${icon}" style="position:absolute;right:14px;top:14px;color:${color || 'var(--primary-color)'};opacity:0.3;font-size:1.6em"></i>` : ''}
</div>`.trim();
    }

    global.Rolgi = global.Rolgi || {};
    global.Rolgi.components = { header, wsIndicator, loading, errorBox, statusBadge, statCard };
})(window);

(function(global){
    if (!global.Rolgi || !global.Rolgi.components) return;
    const { escapeHtml, statusName } = (global.Rolgi.fmt || {});
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    function countryFlag(code) {
        if (!code || code.length !== 2) return '🏳️';
        const cc = code.toUpperCase();
        return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    }

    function leagueItem(league) {
        const country = (league.country || {});
        const flag = countryFlag(country.code);
        const seasons = (league.seasons || []).length;
        return `<div class="r-list-item" data-league-id="${league.id}" data-league-name="${esc(league.name)}">
            <span class="r-list-item-flag">${flag}</span>
            <div class="r-list-item-main">
                <div class="r-list-item-title">${esc(league.name)}</div>
                <div class="r-list-item-sub">${esc(country.name || '')}</div>
            </div>
            <span class="r-list-item-meta">${seasons} сезон${seasons === 1 ? '' : seasons < 5 ? 'а' : 'ов'}</span>
        </div>`;
    }

    function seasonItem(season) {
        const dates = [season.dateStart, season.dateEnd].filter(Boolean)
            .map(d => String(d).slice(0,10)).join(' — ');
        return `<div class="r-list-item" data-season-uid="${esc(season.uid)}" data-season-year="${season.year}">
            <div class="r-list-item-main">
                <div class="r-list-item-title">Сезон ${esc(season.year)}</div>
                <div class="r-list-item-sub">${esc(dates)}</div>
            </div>
            <span class="r-list-item-meta">→</span>
        </div>`;
    }

    // status: 1=scheduled, 2-4=live, 8=finished, остальные тоже
    function matchRow(game) {
        const home = (game.homeTeam || {}).name || '?';
        const away = (game.awayTeam || {}).name || '?';
        const hs = game.homeResult, as = game.awayResult;
        const status = game.status;
        const isLive = status >= 2 && status <= 4;
        const isScheduled = status === 1;
        const isFinished = status === 8;
        const sstatsId = game.id;

        let scoreClass = '';
        let scoreText = '';
        if (isLive) {
            scoreClass = 'r-match-score-live';
            scoreText = `${hs ?? 0} : ${as ?? 0}`;
        } else if (isScheduled || hs == null) {
            scoreClass = 'r-match-score-scheduled';
            scoreText = '— : —';
        } else {
            scoreText = `${hs} : ${as}`;
        }

        const date = (game.date || '').slice(0,10);
        const time = (game.date || '').slice(11,16);
        const dateDisplay = isScheduled ? `${date} ${time}` : date;

        return `<a href="/game.html?id=${sstatsId}" class="r-match">
            <span class="r-match-date">${esc(dateDisplay)}</span>
            <span class="r-match-team r-match-team-home">${esc(home)}</span>
            <span class="r-match-score ${scoreClass}">${esc(scoreText)}</span>
            <span class="r-match-team r-match-team-away">${esc(away)}</span>
        </a>`;
    }

    function modal(id, titleHtml = '', bodyHtml = '') {
        return `<div class="r-modal-overlay" id="${id}">
            <div class="r-modal">
                <div class="r-modal-header">
                    <h3 class="r-modal-title" id="${id}-title">${titleHtml}</h3>
                    <button class="r-modal-close" data-modal-close="${id}" style="min-height:48px;min-width:48px">×</button>
                </div>
                <div class="r-modal-body" id="${id}-body">${bodyHtml}</div>
            </div>
        </div>`;
    }

    function statMini(value, label) {
        return `<div class="r-stat-mini">
            <div class="r-stat-mini-value">${esc(value)}</div>
            <div class="r-stat-mini-label">${esc(label)}</div>
        </div>`;
    }

    Object.assign(global.Rolgi.components, {
        countryFlag, leagueItem, seasonItem, matchRow, modal, statMini
    });
})(window);

// ════════════════════════════════════════════════════════════════
// v2: компоненты под /api/db/* формат (snake_case, is_live boolean)
// ════════════════════════════════════════════════════════════════
(function(global){
    if (!global.Rolgi || !global.Rolgi.components) return;
    const esc = global.Rolgi.fmt.escapeHtml;
    const gameStatus = global.Rolgi.fmt.gameStatus;
    const flagByName = global.Rolgi.fmt.countryFlagByName;

    // Лига из /api/db/leagues
    function leagueItemDb(league) {
        const flag    = flagByName(league.country_name);
        const seasons = (league.seasons || []).length;
        const word    = seasons === 1 ? 'сезон' : seasons < 5 ? 'сезона' : 'сезонов';
        const popRank = league.popular_rank ? `<span class="r-badge-pop" title="Топ-${league.popular_rank}">⭐</span>` : '';
        return `<div class="r-list-item" data-league-id="${league.id}" data-league-name="${esc(league.name)}">
            <span class="r-list-item-flag">${flag}</span>
            <div class="r-list-item-main">
                <div class="r-list-item-title">${popRank}${esc(league.name)}</div>
                <div class="r-list-item-sub">${esc(league.country_name || '')}</div>
            </div>
            <span class="r-list-item-meta">${seasons} ${word}</span>
        </div>`;
    }

    // Сезон из массива seasons лиги
    function seasonItemDb(season) {
        const dates = [season.startDate, season.endDate].filter(Boolean)
            .map(d => String(d).slice(0,10)).join(' — ');
        const current = season.isCurrent ? '<span style="color:var(--live-color);font-weight:600;margin-left:6px;">текущий</span>' : '';
        return `<div class="r-list-item" data-season-year="${season.year}">
            <div class="r-list-item-main">
                <div class="r-list-item-title">Сезон ${esc(season.year)}${current}</div>
                <div class="r-list-item-sub">${esc(dates)}</div>
            </div>
            <span class="r-list-item-meta">→</span>
        </div>`;
    }

    // Матч из /api/db/games/list (snake_case)
    function matchRowDb(g) {
        const home = g.home_name || '?';
        const away = g.away_name || '?';
        const st   = gameStatus(g.status, g.is_live, g.is_finished);
        const hs = g.home_score, as = g.away_score;

        let scoreClass = '', scoreText = '';
        if (st.kind === 'live') {
            scoreClass = 'r-match-score-live';
            scoreText  = `${hs ?? 0} : ${as ?? 0}`;
        } else if (st.kind === 'scheduled' || hs == null) {
            scoreClass = 'r-match-score-scheduled';
            scoreText  = '— : —';
        } else if (st.kind === 'cancelled' || st.kind === 'postponed') {
            scoreClass = 'r-match-score-scheduled';
            scoreText  = st.label;
        } else {
            scoreText  = `${hs} : ${as}`;
        }

        const date = (g.date || '').slice(0,10);
        const time = (g.date || '').slice(11,16);
        const dateDisplay = st.kind === 'scheduled' ? `${date} ${time}` : date;
        const sid = g.sstats_id || g.id;

        return `<a href="/game.html?id=${sid}" class="r-match">
            <span class="r-match-date">${esc(dateDisplay)}</span>
            <span class="r-match-team r-match-team-home">${esc(home)}</span>
            <span class="r-match-score ${scoreClass}">${esc(scoreText)}</span>
            <span class="r-match-team r-match-team-away">${esc(away)}</span>
        </a>`;
    }

    // Универсальный statMini — теперь принимает rawHtml как опцию
    function statMiniSafe(opts) {
        const { value, label, color, rawHtml = false } = opts;
        const v = rawHtml ? value : esc(value);
        const style = color ? ` style="color:${esc(color)}"` : '';
        return `<div class="r-stat-mini">
            <div class="r-stat-mini-value"${style}>${v}</div>
            <div class="r-stat-mini-label">${esc(label)}</div>
        </div>`;
    }

    Object.assign(global.Rolgi.components, {
        leagueItemDb, seasonItemDb, matchRowDb, statMiniSafe
    });
})(window);
