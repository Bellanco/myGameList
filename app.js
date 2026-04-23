"use strict";
/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'mis-listas-v12-unified';
const LEGACY_KEYS = ['mis-listas-v11-unified', 'mis-listas-v10-unified', 'mis-listas-v10-separated', 'mis-listas-v9-unified', 'mis-listas-v9-separated', 'mis-listas-v8-unified', 'mis-listas-v8-separated'];
const CURRENT_YEAR = new Date().getFullYear();
const UI_BREAKPOINTS = { tableCompact: 1100, filtersCompact: 1400 };
const GIST_DEBOUNCE_MS = 1800;
const SEARCH_DEBOUNCE_MS = 220;

/* ═══════════════════════════════════════════════════════════════════
   TAB_CONFIG
═══════════════════════════════════════════════════════════════════ */
const TAB_CONFIG = {
    c: {
        sortDefault: { col: 'years', asc: false },
        filterScore: true, filterYear: true, filterHours: true, filterBool: { label: '¿Volver a jugar?', field: 'replayable' },
        columns: [
            { key: 'nombre', label: 'Juego', cls: 'w-name', sortable: true, center: false, render: (g) => `<strong>${UI.esc(g.name)}</strong>` },
            { key: 'years', label: 'Año', cls: 'w-year', sortable: true, center: false, render: (g) => UI.chipList(g.years, 'chip-generic') },
            { key: '_plat', label: 'Plataformas', cls: 'w-plat col-plat', sortable: false, center: false, render: (g) => UI.chipList(g.platforms, 'chip-plat') },
            { key: 'genres', label: 'Géneros', cls: 'w-genre', sortable: true, center: false, render: (g) => UI.chipList(g.genres, 'chip-genre') },
            { key: '_pf', label: 'Puntos fuertes', cls: 'w-strong col-strong', sortable: false, center: false, render: (g) => UI.chipList(g.strengths, 'chip-pf') },
            { key: '_pd', label: 'Puntos débiles', cls: 'w-weak col-weak', sortable: false, center: false, render: (g) => UI.chipList(g.weaknesses, 'chip-pd') },
            { key: 'score', label: 'Punt.', cls: '', sortable: true, center: false, render: (g) => UI.stars(g.score) },
            { key: 'rejugabilidad', label: 'Rejug.', cls: 'w-bool', sortable: true, center: true, render: (g) => UI.bool(g.replayable) },
        ],
        detailExtra: [
            { label: 'Años en los que se completó', render: (g) => UI.chipList(g.years, 'chip-generic') },
            { label: 'Tiempo jugado', hideIfEmpty: true, render: (g) => g.hours != null ? `${String(g.hours).replace('.', ',')} horas` : '' },
            { label: 'Puntos fuertes', render: (g) => UI.chipList(g.strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: 'Puntos débiles', render: (g) => UI.chipList(g.weaknesses, 'chip-pd'), cls: 'detail-weak' },
            { label: 'Puntuación', render: (g) => UI.stars(g.score) },
            { label: 'Rejugabilidad', render: (g) => UI.bool(g.replayable) },
        ],
        actions: [],
        modalTitles: { new: 'Nuevo juego completado', prefill: 'Pasar a completados', edit: 'Editar juego' },
        form: { hasScore: true, scoreRequired: true, hasYears: true, hasHours: true, hasStrengths: true, hasWeaknesses: true, hasReasons: false, hasBool: true, boolLabel: '¿Volver a jugar?', boolField: 'rejugabilidad', hasReview: true },
        tagKeys: ['genres', 'platforms', 'years', 'strengths', 'weaknesses'],
    },
    v: {
        sortDefault: { col: 'name', asc: true },
        filterScore: false, filterYear: false, filterHours: false, filterBool: { label: '¿Dar otra oportunidad?', field: 'retry' },
        columns: [
            { key: 'nombre', label: 'Juego', cls: 'w-name', sortable: true, center: false, render: (g) => `<strong>${UI.esc(g.name)}</strong>` },
            { key: '_plat', label: 'Plataformas', cls: 'w-plat col-plat', sortable: false, center: false, render: (g) => UI.chipList(g.platforms, 'chip-plat') },
            { key: 'genres', label: 'Géneros', cls: 'w-genre', sortable: true, center: false, render: (g) => UI.chipList(g.genres, 'chip-genre') },
            { key: '_pf', label: 'Puntos fuertes', cls: 'w-strong col-strong', sortable: false, center: false, render: (g) => UI.chipList(g.strengths, 'chip-pf') },
            { key: '_razones', label: 'Puntos débiles', cls: 'w-weak col-weak', sortable: false, center: false, render: (g) => UI.chipList(g.reasons, 'chip-pd') },
            { key: 'volver', label: 'Dar otra oportunidad', cls: 'w-bool', sortable: true, center: true, render: (g) => UI.bool(g.retry) },
        ],
        detailExtra: [
            { label: 'Puntos fuertes', render: (g) => UI.chipList(g.strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: 'Puntos débiles', render: (g) => UI.chipList(g.reasons, 'chip-pd'), cls: 'detail-weak' },
            { label: 'Dar otra oportunidad', render: (g) => UI.bool(g.retry) },
        ],
        actions: [
            { label: 'Pasar a completados', btnCls: 'btn-complete', target: 'c' },
            { label: 'Pasar a en curso', btnCls: 'btn-inprogress', target: 'e' },
        ],
        modalTitles: { new: 'Nuevo juego abandonado', prefill: 'Pasar a abandonados', edit: 'Editar juego' },
        form: { hasScore: false, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: true, hasWeaknesses: false, hasReasons: true, hasBool: true, boolLabel: '¿Dar otra oportunidad?', boolField: 'volver', hasReview: true },
        tagKeys: ['genres', 'platforms', 'strengths', 'reasons'],
    },
    e: {
        sortDefault: { col: 'name', asc: true },
        filterScore: false, filterYear: false, filterHours: false, filterBool: null,
        columns: [
            { key: 'nombre', label: 'Juego', cls: 'w-name', sortable: true, center: false, render: (g) => `<strong>${UI.esc(g.name)}</strong>` },
            { key: '_plat', label: 'Plataformas', cls: 'w-plat col-plat', sortable: false, center: false, render: (g) => UI.chipList(g.platforms, 'chip-plat') },
            { key: 'genres', label: 'Géneros', cls: 'w-genre', sortable: true, center: false, render: (g) => UI.chipList(g.genres, 'chip-genre') },
            { key: '_pf', label: 'Puntos fuertes', cls: 'w-strong col-strong', sortable: false, center: false, render: (g) => UI.chipList(g.strengths, 'chip-pf') },
            { key: '_pd', label: 'Puntos débiles', cls: 'w-weak col-weak', sortable: false, center: false, render: (g) => UI.chipList(g.weaknesses, 'chip-pd') },
        ],
        detailExtra: [
            { label: 'Puntos fuertes', render: (g) => UI.chipList(g.strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: 'Puntos débiles', render: (g) => UI.chipList(g.weaknesses, 'chip-pd'), cls: 'detail-weak' },
        ],
        actions: [
            { label: 'Pasar a completados', btnCls: 'btn-complete', target: 'c' },
            { label: 'Pasar a abandonados', btnCls: 'btn-abandoned', target: 'v' },
        ],
        modalTitles: { new: 'Nuevo juego en curso', prefill: 'Pasar a en curso', edit: 'Editar juego' },
        form: { hasScore: false, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: true, hasWeaknesses: true, hasReasons: false, hasBool: false, boolLabel: '', boolField: '', hasReview: true },
        tagKeys: ['genres', 'platforms', 'strengths', 'weaknesses'],
    },
    p: {
        sortDefault: { col: 'score', asc: false },
        filterScore: true, filterYear: false, filterHours: false, filterBool: null,
        columns: [
            { key: 'nombre', label: 'Juego', cls: 'w-name', sortable: true, center: false, render: (g) => `<strong>${UI.esc(g.name)}</strong>` },
            { key: '_plat', label: 'Plataformas', cls: 'w-plat col-plat', sortable: false, center: false, render: (g) => UI.chipList(g.platforms, 'chip-plat') },
            { key: 'genres', label: 'Géneros', cls: 'w-genre', sortable: true, center: false, render: (g) => UI.chipList(g.genres, 'chip-genre') },
            { key: 'score', label: 'Interés', cls: '', sortable: true, center: false, render: (g) => g.score ? UI.stars(g.score) : '<span style="color:var(--text-muted)">—</span>' },
        ],
        detailExtra: [
            { label: 'Interés', render: (g) => g.score ? UI.stars(g.score) : '<span style="color:var(--text-muted)">Sin valorar</span>' },
        ],
        actions: [
            { label: 'Pasar a en curso', btnCls: 'btn-inprogress', target: 'e' },
            { label: 'Pasar a completados', btnCls: 'btn-complete', target: 'c' },
            { label: 'Pasar a abandonados', btnCls: 'btn-abandoned', target: 'v' },
        ],
        modalTitles: { new: 'Nuevo juego próximo', prefill: 'Añadir a próximos', edit: 'Editar juego' },
        form: { hasScore: true, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: false, hasWeaknesses: false, hasReasons: false, hasBool: false, boolLabel: '', boolField: '', hasReview: false },
        tagKeys: ['genres', 'platforms'],
    },
};

/* ═══════════════════════════════════════════════════════════════════
   UTILIDADES DE UI
═══════════════════════════════════════════════════════════════════ */
const UI = {
    esc(val) {
        return String(val ?? '').replace(/[&<>"'`=\/]/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;'
        }[m] || m));
    },
    icon(name) { return `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`; },
    stars(val) {
        const n = Math.max(0, Math.min(5, Number(val || 0)));
        return `<span class="stars">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= n ? 'f' : ''}">★</span>`).join('')}</span>`;
    },
    chip(txt, cls) { return txt ? `<span class="chip ${cls}">${this.esc(txt)}</span>` : ''; },
    chipList(vals, cls) {
        const list = Array.isArray(vals) ? vals.filter(Boolean) : [];
        return list.length ? `<div class="chips">${list.map(v => this.chip(v, cls)).join('')}</div>` : `<span style="color:var(--text-muted)">—</span>`;
    },
    bool(v) {
        return v
            ? `<span class="icon-bool true">${this.icon('check')}</span>`
            : `<span class="icon-bool false">${this.icon('close')}</span>`;
    },
    nameCell(game, compact = false) {
        const title = `<strong>${this.esc(game?.name ?? '')}</strong>`;
        if (!compact)
            return title;
        const score = Number(game?.score || 0);
        const stars = score > 0 ? `<span class="compact-score">${this.stars(score)}</span>` : '';
        return `<div class="compact-name-cell"><span class="compact-name-text">${title}</span>${stars}</div>`;
    },
    sortIcon(asc) { return asc ? '▲' : '▼'; },
};


/* ═══════════════════════════════════════════════════════════════════
   APP PRINCIPAL
═══════════════════════════════════════════════════════════════════ */
class SteamListApp {
    constructor() {
        // Estructura actualizada con soporte para borrados (deleted)
        this.data = { c: [], v: [], e: [], p: [], deleted: [] };
        this.currentTab = 'c';
        this.expandedId = null;
        this.editCtx = { type: null, id: null, migrateId: null, sourceTab: null };
        this.tempTags = { genres: [], platforms: [], years: [], strengths: [], weaknesses: [], reasons: [] };
        this.currentAdminTab = 'genres';
        this.adminEditState = null;
        this.statusTimer = null;
        this.adminTimer = null;
        this._filtersOpen = false;
        this._resizeTimer = null;
        this._renderTableTimer = null;
        this._pushTimer = null;
        this._eventsBound = false;
        this._yearWarningShown = false;
        this.meta = null;
        this.lookups = {};
        this.sortConfig = Object.fromEntries(Object.entries(TAB_CONFIG).map(([k, v]) => [k, { ...v.sortDefault }]));
        this.tableCompact = window.innerWidth <= UI_BREAKPOINTS.tableCompact;
        this.filtersCompact = window.innerWidth <= UI_BREAKPOINTS.filtersCompact;
        this.init();
    }

    init() {
        this.load();
        this.normalize();
        this.refreshLookups();
        this.syncResponsiveMode();
        this.render();
        this._bindDelegatedEvents();
        window.addEventListener('resize', () => {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = window.setTimeout(() => {
                const changed = this.syncResponsiveMode();
                if (changed) this.renderToolbar();
            }, 80);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal('modal-form');
                this.closeModal('modal-admin');
                this.closeModal('modal-sync');
            }
        });
        this._initSync();
    }

    load() {
        this.meta = { updatedAt: 0, etag: null, lastRemoteUpdatedAt: 0 };
        for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const p = JSON.parse(raw);
                const src = p?.data && typeof p.data === 'object' ? p.data : p;
                const rawLoaded = { 
                    c: src.c || [], v: src.v || [], e: src.e || [], p: src.p || [], 
                    deleted: src.deleted || [] 
                };
                this.data = typeof window.migrateData === 'function' ? window.migrateData(rawLoaded) : rawLoaded;
                this.meta = {
                    updatedAt: Number(p?.updatedAt ?? p?.meta?.updatedAt ?? 0) || 0,
                    etag: p?.etag ?? p?.meta?.etag ?? null,
                    lastRemoteUpdatedAt: Number(p?.lastRemoteUpdatedAt ?? p?.meta?.lastRemoteUpdatedAt ?? 0) || 0,
                };
                return;
            } catch (_) {}
        }
    }

    normalize() {
        const splitLn = (str) => String(str ?? '').split(/\n/).map(s => s.trim()).filter(Boolean);
        const toList = (v) => Array.from(new Set((Array.isArray(v) ? v : []).flatMap(item => typeof item === 'number' ? [item] : splitLn(item)).filter(Boolean)));
        const base = (item) => ({
            id: Number.isFinite(item?.id) ? item.id : 0,
            _ts: item?._ts || 0, // Preservamos timestamp individual si existe
            name: String(item?.name ?? '').trim(),
            platforms: toList(item?.platforms ?? (item?.platform ? [item.platform] : [])),
            genres: toList(item?.genres ?? (item?.genre ? [item.genre] : [])),
            steamDeck: Boolean(item?.steamDeck),
        });
        const normFns = {
            c: i => ({ ...base(i), strengths: toList(i?.strengths), review: String(i?.review ?? '').trim(), years: toList(i?.years).map(Number).filter(Number.isFinite), weaknesses: toList(i?.weaknesses), score: Math.min(5, Math.max(0, Number(i?.score ?? 0))), replayable: Boolean(i?.replayable), hours: i?.hours ? Number(i.hours) : null }),
            v: i => {
                let reasons = [];
                if (Array.isArray(i?.reasons)) reasons = i.reasons.flatMap(v => typeof v === 'string' ? splitLn(v) : []).filter(Boolean);
                else if (typeof i?.reason === 'string') reasons = splitLn(i.reason);
                else if (Array.isArray(i?.razones)) reasons = toList(i.razones);
                else if (Array.isArray(i?.weaknesses)) reasons = toList(i.weaknesses);
                return { ...base(i), strengths: toList(i?.strengths), review: String(i?.review ?? '').trim(), reasons, retry: Boolean(i?.retry) };
            },
            e: i => ({ ...base(i), strengths: toList(i?.strengths), review: String(i?.review ?? '').trim(), weaknesses: toList(i?.weaknesses) }),
            p: i => ({ ...base(i), score: Math.min(5, Math.max(0, Number(i?.score ?? 0))) }),
        };
        for (const t of ['c', 'v', 'e', 'p']) {
            this.data[t] = (Array.isArray(this.data[t]) ? this.data[t].map(i => normFns[t](i)) : []);
        }
        
        this.data.deleted = this.data.deleted || [];

        const allItems = ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || []);
        let nextId = Math.max(0, ...allItems.map(i => i.id)) + 1;
        
        for (const list of ['c', 'v', 'e', 'p'].map(t => this.data[t])) {
            for (const item of list) {
                if (!item.id) item.id = nextId++;
            }
        }
    }

    refreshLookups() {
        this.lookups = { genres: new Set(), platforms: new Set(), strengths: new Set(), weaknesses: new Set(), years: new Set() };
        for (const item of ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || [])) {
            (item.genres || []).forEach(v => this.lookups.genres.add(v));
            (item.platforms || []).forEach(v => this.lookups.platforms.add(v));
            (item.strengths || []).forEach(v => this.lookups.strengths.add(v));
            (item.weaknesses || []).forEach(v => this.lookups.weaknesses.add(v));
            (item.reasons || []).forEach(v => this.lookups.weaknesses.add(v));
            (item.years || []).forEach(v => this.lookups.years.add(v));
        }
        const sortEs = (a, b) => String(a).localeCompare(String(b), 'es');
        const fill = (id, set, fn) => {
            const el = document.getElementById(id); 
            if (el) el.innerHTML = [...set].sort(fn).map(v => `<option value="${UI.esc(v)}">`).join('');
        };
        fill('dl-genres', this.lookups.genres, sortEs);
        fill('dl-platforms', this.lookups.platforms, sortEs);
        fill('dl-strengths', this.lookups.strengths, sortEs);
        fill('dl-weaknesses', this.lookups.weaknesses, sortEs);
    }

    persist() {
        this.normalize();
        this.meta = this.meta || {};
        this.meta.updatedAt = Date.now();
        this._saveLocalState();
        this.refreshLookups();
        this.render();
        this._schedulePushToGist();
    }

    _saveLocalState() {
        const payload = {
            c: this.data.c || [],
            v: this.data.v || [],
            e: this.data.e || [],
            p: this.data.p || [],
            deleted: this.data.deleted || [],
            updatedAt: Number(this.meta?.updatedAt || 0),
            etag: this.meta?.etag || null,
            lastRemoteUpdatedAt: Number(this.meta?.lastRemoteUpdatedAt || 0),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    _buildSyncPayload() {
        return {
            c: (this.data.c || []).map(i => this._cleanGameData(i)),
            v: (this.data.v || []).map(i => this._cleanGameData(i)),
            e: (this.data.e || []).map(i => this._cleanGameData(i)),
            p: (this.data.p || []).map(i => this._cleanGameData(i)),
            deleted: this.data.deleted || [],
            updatedAt: Number(this.meta?.updatedAt || Date.now()),
        };
    }

    _extractSyncPayload(raw) {
        const src = raw?.data && typeof raw.data === 'object' ? raw.data : raw || {};
        return {
            data: { 
                c: src.c || [], v: src.v || [], e: src.e || [], p: src.p || [], 
                deleted: src.deleted || [] 
            },
            updatedAt: Number(src.updatedAt ?? src.meta?.updatedAt ?? 0) || 0,
            etag: src.etag ?? src.meta?.etag ?? null,
        };
    }

    // ==== LÓGICA CRDT: FUSIÓN DE DATOS INTELIGENTE ====
    _mergeData(remoteData, remoteTs) {
        const localTs = Number(this.meta?.updatedAt || 0);
        const { merged, hasChanges } = DataSync.mergeData(this.data, localTs, remoteData, remoteTs);
        return { mergedData: merged, hasChanges };
    }
    // ===================================================

    _schedulePushToGist() {
        if (this._pushTimer) clearTimeout(this._pushTimer);
        this._pushTimer = window.setTimeout(() => this._pushToGist(), GIST_DEBOUNCE_MS);
    }

    _scheduleRenderTable() {
        if (this._renderTableTimer) clearTimeout(this._renderTableTimer);
        this._renderTableTimer = window.setTimeout(() => {
            this.renderTable();
            this.syncActiveFilters();
            const clearBtn = document.getElementById('t-search-clear');
            const search = document.getElementById('t-search');
            if (clearBtn && search) clearBtn.style.display = search.value ? 'flex' : 'none';
        }, SEARCH_DEBOUNCE_MS);
    }

    syncActiveFilters() {
        const el = document.getElementById('active-filters');
        if (!el) return;
        el.innerHTML = this.renderActiveFilters(this.getToolbarState());
    }

    _bindDelegatedEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;
        const handler = (e) => this._handleDelegatedAction(e);
        document.addEventListener('click', handler);
        document.addEventListener('input', handler);
        document.addEventListener('change', handler);
        document.addEventListener('dblclick', handler);
    }

    _handleDelegatedAction(e) {
        const target = e.target;
        const selector = e.type === 'dblclick' ? '[data-dbl-action]' : '[data-action]';
        const el = target.closest(selector);
        if (!el) return;
        const action = e.type === 'dblclick' && el.dataset.dblAction ? el.dataset.dblAction : el.dataset.action;
        const expected = el.dataset.event || 'click';
        if (e.type !== expected && !(e.type === 'dblclick' && el.dataset.dblAction)) return;
        if (!action) return;
        
        const id = el.dataset.id;
        const tab = el.dataset.tab;
        const targetEl = el.dataset.target;
        const value = el.dataset.value;
        const filter = el.dataset.filter;
        const col = el.dataset.col;
        const admin = el.dataset.admin;

        switch (action) {
            case 'open-sync': return this.openSyncModal();
            case 'export-data': return this.exportData();
            case 'import-data': return this.importData(e);
            case 'open-admin': return this.openAdminModal();
            case 'open-add-modal': return this.openModal(this.currentTab);
            case 'save-game': return this.saveGame();
            case 'sync-connect': return this._syncConnect();
            case 'sync-disconnect': return this.syncDisconnect();
            case 'sync-now': return this._syncNow();
            case 'close-modal': return this.closeModal(targetEl);
            case 'switch-tab': return this.switchTab(tab);
            case 'switch-admin-tab': return this.switchAdminTab(admin, el);
            case 'clear-filter': return this.clearFilter(filter);
            case 'clear-all-filters': return this.clearAllFilters();
            case 'toggle-filters': return this.toggleFilters();
            case 'render-table': this.renderToolbar(); return this.renderTable();
            case 'search-input': return this._scheduleRenderTable();
            case 'clear-search': {
                const search = document.getElementById('t-search');
                if (search) search.value = '';
                this.renderToolbar(); return this.renderTable();
            }
            case 'toggle-only':
            case 'toggle-deck':
                el.classList.toggle('active');
                if (action === 'toggle-deck') el.classList.toggle('btn-toggle-deck');
                this.renderToolbar(); return this.renderTable();
            case 'toggle-form-deck':
                el.classList.toggle('active'); el.classList.toggle('btn-toggle-deck'); return;
            case 'toggle-form-bool':
                el.classList.toggle('active'); return;
            case 'toggle-token-visibility': {
                const i = document.getElementById('sy-token');
                if (!i) return;
                i.type = i.type === 'password' ? 'text' : 'password';
                el.textContent = i.type === 'password' ? '👁' : '🙈'; return;
            }
            case 'sort-by': return this.sortBy(col);
            case 'toggle-expand': return this.toggleExpand(Number(id));
            case 'edit-game': return this.openModal(tab, Number(id));
            case 'delete-game': return this.deleteGame(tab, Number(id));
            case 'migrate-game': return this.startMigration(Number(id), targetEl);
            case 'set-star': return this.setStar(Number(value));
            case 'delete-admin-tag': return this.deleteAdminTag(decodeURIComponent(value));
            case 'edit-admin-tag': return this.editAdminTag(decodeURIComponent(value));
            case 'save-admin-tag': return this.saveAdminTag(decodeURIComponent(value));
            case 'render-admin-list': return this.renderAdminList();
            default: return;
        }
    }

    render() { this.updateCounters(); this.syncResponsiveMode(); this.renderToolbar(); this.renderTable(); }
    
    updateCounters() {
        for (const t of ['c', 'v', 'e', 'p']) {
            const cnt = document.getElementById(`cnt-${t}`);
            if (cnt) cnt.textContent = String(this.data[t].length);
            const tabEl = document.getElementById(`tab-${t}`);
            if (tabEl) tabEl.classList.toggle('active', t === this.currentTab);
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.expandedId = null;
        this._filtersOpen = false;
        const search = document.getElementById('t-search');
        if (search) search.value = '';
        document.querySelectorAll('#toolbar select, #toolbar input[list], #toolbar input[type="search"]').forEach(el => {
            if (el.id !== 't-search') el.value = '';
        });
        document.getElementById('t-only')?.classList.remove('active');
        document.getElementById('t-deck')?.classList.remove('active', 'btn-toggle-deck');
        this.render();
    }

    /* ── Toolbar & Filtros ─────────────────────────────────────────── */
    getToolbarState() {
        return {
            search: document.getElementById('t-search')?.value ?? '',
            genre: document.getElementById('t-gen')?.value ?? '',
            platform: document.getElementById('t-plat')?.value ?? '',
            score: document.getElementById('t-score')?.value ?? '',
            hours: document.getElementById('t-hours')?.value ?? '',
            only: document.getElementById('t-only')?.classList.contains('active') ?? false,
            deck: document.getElementById('t-deck')?.classList.contains('active') ?? false,
        };
    }
    
    isTableCompact() { return window.innerWidth <= UI_BREAKPOINTS.tableCompact; }
    isFiltersCompact() { return window.innerWidth <= UI_BREAKPOINTS.filtersCompact; }
    
    syncResponsiveMode() {
        const tableCompact = this.isTableCompact();
        const filtersCompact = this.isFiltersCompact();
        const changed = tableCompact !== this.tableCompact || filtersCompact !== this.filtersCompact;
        this.tableCompact = tableCompact;
        this.filtersCompact = filtersCompact;
        document.body.classList.toggle('table-compact', tableCompact);
        document.body.classList.toggle('compact-filters', filtersCompact);
        if (!filtersCompact) this._filtersOpen = false;
        else if (this._filtersOpen === null || this._filtersOpen === undefined) this._filtersOpen = false;
        return changed;
    }

    getActiveFilterCount(state = this.getToolbarState()) {
        return [state.search, state.genre, state.platform, state.score, state.hours, state.only, state.deck].filter(Boolean).length;
    }

    clearFilter(key) {
        const el = document.getElementById(key === 'only' ? 't-only' : key === 'deck' ? 't-deck' : key === 'search' ? 't-search' :
            key === 'genre' ? 't-gen' : key === 'platform' ? 't-plat' : key === 'score' ? 't-score' : key === 'hours' ? 't-hours' : '');
        if (key === 'only') el?.classList.remove('active');
        else if (key === 'deck') el?.classList.remove('active', 'btn-toggle-deck');
        else if (el) el.value = '';
        this.renderTable(); this.renderToolbar();
    }

    clearAllFilters() {
        const ids = ['t-search', 't-gen', 't-plat', 't-score', 't-hours'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('t-only')?.classList.remove('active');
        document.getElementById('t-deck')?.classList.remove('active', 'btn-toggle-deck');
        this.renderToolbar(); this.renderTable();
    }

    getToolbarBoolLabel() {
        const cfg = TAB_CONFIG[this.currentTab];
        return cfg?.filterBool?.label || 'Filtro';
    }

    renderActiveFilters(state) {
        const chips = [];
        const chip = (key, label, value) => `<span class="active-filter-chip">${UI.esc(label)}: ${UI.esc(value)}<button type="button" class="chip-x" data-action="clear-filter" data-filter="${key}" aria-label="Quitar ${UI.esc(label)}">${UI.icon('close')}</button></span>`;
        if (state.search) chips.push(chip('search', 'Buscar', state.search));
        if (state.genre) chips.push(chip('genre', 'Género', state.genre));
        if (state.platform) chips.push(chip('platform', 'Plataforma', state.platform));
        if (state.score) chips.push(chip('score', 'Punt.', `≥ ${state.score}`));
        if (state.hours) {
            const hoursLabels = { '0-5': 'Menos de 5h', '5-10': '5 - 10h', '10-20': '10 - 20h', '20-40': '20 - 40h', '40-80': '40 - 80h', '80-150': '80 - 150h', '150+': 'Más de 150h' };
            chips.push(chip('hours', 'Duración', hoursLabels[state.hours] || state.hours));
        }
        if (state.only) chips.push(chip('only', this.getToolbarBoolLabel(), 'Activado'));
        if (state.deck) chips.push(chip('deck', 'Steam Deck', 'Activado'));
        return chips.length
            ? `<div class="active-filters show">${chips.join('')}<button type="button" class="btn btn-ghost" data-action="clear-all-filters">Limpiar todo</button></div>`
            : `<div class="active-filters"></div>`;
    }

    renderToolbar() {
        const state = this.getToolbarState();
        const cfg = TAB_CONFIG[this.currentTab];
        const tabData = this.data[this.currentTab];
        const sortEs = (a, b) => String(a).localeCompare(String(b), 'es');
        const compact = this.isFiltersCompact();
        const setG = new Set(), setP = new Set();
        tabData.forEach(i => {
            (i.genres || []).forEach(v => setG.add(v));
            (i.platforms || []).forEach(v => setP.add(v));
        });
        const opts = (set, fn) => [...set].sort(fn).map(v => `<option value="${UI.esc(v)}">${UI.esc(v)}</option>`).join('');
        const genres = opts(setG, sortEs);
        const plats = opts(setP, sortEs);
        const scores = [...new Set(tabData.map(g => Number(g.score || 0)))]
            .filter(s => s > 0).sort((a, b) => b - a)
            .map(s => `<option value="${s}">${'★'.repeat(s)}${'☆'.repeat(5 - s)} ${s} o más</option>`).join('');
        
        const activeCount = this.getActiveFilterCount(state);
        const toggleIcon = this._filtersOpen ? 'close' : (activeCount ? 'filter-active' : 'filter');
        const tb = document.getElementById('toolbar');
        
        tb.innerHTML = `
      <div class="toolbar-top">
        <div class="search-wrap">
          <input type="search" class="input-base search-input" id="t-search" placeholder="Buscar"
                 value="${UI.esc(state.search)}" data-action="search-input" data-event="input">
          <button type="button" id="t-search-clear" class="search-clear"
                  data-action="clear-search"
                  title="Limpiar" style="display:${state.search ? 'flex' : 'none'};">${UI.icon('close')}</button>
        </div>
        ${compact ? `<button class="btn-icon btn-filter-toggle ${this._filtersOpen ? 'active' : ''} ${activeCount ? 'has-active' : ''}" type="button"
                id="t-filter-toggle" data-action="toggle-filters"
                title="${this._filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}">${UI.icon(toggleIcon)}</button>` : ''}
      </div>
      <div class="filters-row ${compact && this._filtersOpen ? 'open' : ''}">
        <div class="filter-field">
          <label class="flabel">Género</label>
          <select class="input-base" id="t-gen" data-action="render-table" data-event="change">
            <option value="">Todos los géneros</option>${genres}
          </select>
        </div>
        <div class="filter-field">
          <label class="flabel">Plataforma</label>
          <select class="input-base" id="t-plat" data-action="render-table" data-event="change">
            <option value="">Todas las plataformas</option>${plats}
          </select>
        </div>
        ${cfg.filterScore ? `<div class="filter-field">
          <label class="flabel">Puntuación</label>
          <select class="input-base" id="t-score" data-action="render-table" data-event="change">
            <option value="">Cualquier puntuación</option>${scores}
          </select>
        </div>` : ''}
        ${cfg.filterHours ? `<div class="filter-field">
          <label class="flabel">Horas</label>
          <select class="input-base" id="t-hours" data-action="render-table" data-event="change">
            <option value="">Cualquier duración</option>
            <option value="0-5">Menos de 5 horas</option>
            <option value="5-10">De 5 a 10 horas</option>
            <option value="10-20">De 10 a 20 horas</option>
            <option value="20-40">De 20 a 40 horas</option>
            <option value="40-80">De 40 a 80 horas</option>
            <option value="80-150">De 80 a 150 horas</option>
            <option value="150+">Más de 150 horas</option>
          </select>
        </div>` : ''}
        ${cfg.filterBool ? `<div class="filter-field filter-field-toggle">
          <label class="flabel filter-field-hidden-label" aria-hidden="true">${UI.esc(cfg.filterBool.label)}</label>
          <button class="btn btn-toggle ${state.only ? 'active' : ''}" id="t-only" data-action="toggle-only" title="${cfg.filterBool.label}">
            ${UI.icon(cfg.filterBool.field === 'replayable' ? 'repeat' : 'undo')}<span>${UI.esc(cfg.filterBool.label)}</span>
          </button>
        </div>` : ''}
        <div class="filter-field filter-field-toggle">
          <label class="flabel filter-field-hidden-label" aria-hidden="true">Steam Deck</label>
          <button class="btn btn-toggle ${state.deck ? 'active btn-toggle-deck' : ''}" id="t-deck" data-action="toggle-deck">
            ${UI.icon('steamdeck')}<span>Steam Deck</span>
          </button>
        </div>
      </div>
      <div id="active-filters">${this.renderActiveFilters(state)}</div>
    `;
        const genEl = document.getElementById('t-gen');
        const platEl = document.getElementById('t-plat');
        const scoreEl = document.getElementById('t-score');
        const hoursEl = document.getElementById('t-hours');
        if (genEl) genEl.value = state.genre;
        if (platEl) platEl.value = state.platform;
        if (scoreEl) scoreEl.value = state.score;
        if (hoursEl) hoursEl.value = state.hours;
        this.syncActiveFilters();
    }

    toggleFilters() {
        if (!this.isFiltersCompact()) return;
        this._filtersOpen = !this._filtersOpen;
        this.renderToolbar();
    }

    getFilteredSortedList() {
        const state = this.getToolbarState();
        const tab = this.currentTab;
        const cfg = TAB_CONFIG[tab];
        const filtered = this.data[tab].filter(item => {
            if (state.search && !String(item.name || '').toLowerCase().includes(state.search.toLowerCase())) return false;
            if (state.genre && !(item.genres || []).some(v => String(v).toLowerCase().includes(String(state.genre).toLowerCase()))) return false;
            if (state.platform && !(item.platforms || []).some(v => String(v).toLowerCase().includes(String(state.platform).toLowerCase()))) return false;
            if (state.deck && !item.steamDeck) return false;
            if (state.score && Number(item.score || 0) < Number(state.score)) return false;
            if (state.only && cfg.filterBool && !item[cfg.filterBool.field]) return false;
            if (state.hours) {
                const hasH = item.hours !== undefined && item.hours !== null && item.hours !== '';
                if (!hasH) return false;
                const hNum = Number(item.hours);
                if (state.hours === '0-5' && hNum > 5) return false;
                if (state.hours === '5-10' && (hNum <= 5 || hNum > 10)) return false;
                if (state.hours === '10-20' && (hNum <= 10 || hNum > 20)) return false;
                if (state.hours === '20-40' && (hNum <= 20 || hNum > 40)) return false;
                if (state.hours === '40-80' && (hNum <= 40 || hNum > 80)) return false;
                if (state.hours === '80-150' && (hNum <= 80 || hNum > 150)) return false;
                if (state.hours === '150+' && hNum <= 150) return false;
            }
            return true;
        });
        const { col, asc } = this.sortConfig[tab];
        return filtered.sort((a, b) => {
            let va = a[col], vb = b[col];
            if (col === 'years') {
                va = a.years?.length ? Math.max(...a.years) : 0;
                vb = b.years?.length ? Math.max(...b.years) : 0;
            }
            if (col === 'genres') { va = (a.genres || [])[0] || ''; vb = (b.genres || [])[0] || ''; }
            if (typeof va === 'boolean') { va = Number(va); vb = Number(vb); }
            if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
            return asc ? String(va || '').localeCompare(String(vb || ''), 'es') : String(vb || '').localeCompare(String(va || ''), 'es');
        });
    }

    sortBy(col) {
        const cfg = this.sortConfig[this.currentTab];
        const numericCols = ['years', 'score', 'retry', 'replayable', 'steamDeck', 'hours'];
        if (cfg.col === col) cfg.asc = !cfg.asc;
        else { cfg.col = col; cfg.asc = !numericCols.includes(col); }
        this.renderTable();
    }

    renderTable() {
        const tab = this.currentTab;
        const tabCfg = TAB_CONFIG[tab];
        const sort = this.sortConfig[tab];
        const cols = tabCfg.columns;
        document.getElementById('thead').innerHTML = `<tr>${cols.map(col => {
            const sorted = sort.col === col.key;
            return col.sortable
                ? `<th class="sortable ${col.cls} ${sorted ? 'sorted' : ''}" data-action="sort-by" data-col="${col.key}">${col.label}${sorted ? ' ' + UI.sortIcon(sort.asc) : ''}</th>`
                : `<th class="${col.cls}">${col.label}</th>`;
        }).join('')}</tr>`;
        const list = this.getFilteredSortedList();
        const body = document.getElementById('tbody');
        if (!list.length) {
            body.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:2rem;color:var(--text-muted)">No hay juegos</td></tr>`;
            return;
        }
        body.innerHTML = list.map((game, idx) => this.renderRow(game, idx, cols)).join('');
    }

    renderRow(game, idx, cols) {
        const tab = this.currentTab;
        const expanded = this.expandedId === game.id;
        const cells = cols.map(col => {
            const value = (this.isTableCompact() && col.key === 'name') ? UI.nameCell(game, true) : col.render(game);
            return `<td${col.center ? ' style="text-align:center;"' : ''}>${value}</td>`;
        }).join('');
        const mainRow = `<tr class="main-row ${idx % 2 === 0 ? 'striped' : ''}" data-action="toggle-expand" data-id="${game.id}" data-dbl-action="edit-game" data-tab="${tab}" data-id="${game.id}">${cells}</tr>`;
        return mainRow + this.renderDetailRow(game, expanded, cols.length);
    }

    renderDetailRow(game, expanded, colCount) {
        const tab = this.currentTab;
        const tabCfg = TAB_CONFIG[tab];
        const platChips = (game.platforms || []).map(p => UI.chip(p, 'chip-plat')).join('');
        const deckChip = game.steamDeck ? `<span class="chip chip-deck">${UI.icon('steamdeck')}<span>Steam Deck</span></span>` : '';
        const platHtml = (platChips || deckChip) ? `<div class="chips">${platChips}${deckChip}</div>` : `<span style="color:var(--text-muted)">—</span>`;
        const fields = [
            this.dbox('Plataformas', platHtml, 'detail-plat'),
            this.dbox('Géneros', UI.chipList(game.genres, 'chip-genre')),
            ...tabCfg.detailExtra.map(f => {
                const val = f.render(game);
                if (f.hideIfEmpty && !val) return '';
                return this.dbox(f.label, val, f.cls || '');
            })
        ].filter(Boolean).join('');
        const notesHtml = tabCfg.form.hasReview ? `
      <div class="detail-box" style="grid-column:1/-1;">
        <span class="detail-label">Análisis</span>
        ${game.review ? `<div class="detail-value">${UI.esc(game.review).replace(/\n/g, '<br>')}</div>` : '<span style="color:var(--text-muted)">Sin análisis</span>'}
      </div>` : '';
        const migBtns = tabCfg.actions.map(a => `<button class="btn ${a.btnCls}" type="button" data-action="migrate-game" data-id="${game.id}" data-target="${a.target}">${UI.icon('arrow-right')}<span>${a.label}</span></button>`).join('');
        return `
      <tr class="detail-row ${expanded ? 'open' : ''}" data-dbl-action="toggle-expand" data-id="${game.id}">
        <td colspan="${colCount}" style="padding:0;">
          <div class="detail-content">
            ${fields}${notesHtml}
            <div class="detail-actions">
              ${migBtns}
              <button class="btn btn-secondary" type="button" data-action="edit-game" data-tab="${tab}" data-id="${game.id}">${UI.icon('edit')}<span>Editar</span></button>
              <button class="btn btn-danger"    type="button" data-action="delete-game" data-tab="${tab}" data-id="${game.id}">${UI.icon('trash')}<span>Eliminar</span></button>
            </div>
          </div>
        </td>
      </tr>`;
    }

    dbox(label, value, cls = '') {
        return `<div class="detail-box ${cls}"><span class="detail-label">${label}</span><div>${value}</div></div>`;
    }

    toggleExpand(id) { this.expandedId = this.expandedId === id ? null : id; this.renderTable(); }

    /* ── Modal formulario ──────────────────────────────────────────── */
    openModal(type, id = null, prefill = null) {
        this.clearErrors();
        this._yearWarningShown = false;
        this.editCtx = { type, id, migrateId: this.editCtx?.migrateId || null, sourceTab: this.editCtx?.sourceTab || null };
        if (!id && !prefill) { this.editCtx.migrateId = null; this.editCtx.sourceTab = null; }
        const tabCfg = TAB_CONFIG[type];
        const f = tabCfg.form;
        const draft = prefill || (id ? this.data[type].find(i => i.id === id) : {}) || {};
        this.tempTags = {
            genres: [...(draft.genres || [])],
            platforms: [...(draft.platforms || [])],
            years: f.hasYears ? [...(draft.years || [])] : [],
            strengths: f.hasStrengths ? [...(draft.strengths || [])] : [],
            weaknesses: f.hasWeaknesses ? [...(draft.weaknesses || [])] : [],
            reasons: f.hasReasons ? [...(draft.reasons || [])] : [],
        };
        let title = tabCfg.modalTitles.edit;
        if (!id) title = prefill ? tabCfg.modalTitles.prefill : tabCfg.modalTitles.new;
        document.getElementById('m-title').textContent = title;
        document.getElementById('m-body').innerHTML = this.buildFormHTML(draft, type);
        this.renderTags();
        this.bindTagInputs(tabCfg.tagKeys);
        this._bindYearInput();
        this._bindHorasInput();
        document.getElementById('modal-form').classList.add('active');
    }

    buildFormHTML(draft, type) {
        const f = TAB_CONFIG[type].form;
        const rating = Number(draft.score || 0);
        const boolOn = f.boolField ? Boolean(draft[f.boolField]) : false;
        return `
      <div class="frow">
        <div class="fg">
          <label class="flabel">Nombre *</label>
          <input class="finput" id="f-name" placeholder="Escribe el nombre del juego" value="${UI.esc(draft.name || '')}">
        </div>
        <div class="fg">
          <label class="flabel">Géneros *</label>
          <div class="tag-inp-wrap" id="genresWrap"><input type="text" id="inp-genres" list="dl-genres" placeholder="Añadir..."></div>
          <span class="tag-hint">Pulsa Enter para añadir</span>
        </div>
      </div>
      <div class="frow">
        <div class="fg">
          <label class="flabel">Plataformas *</label>
          <div class="tag-inp-wrap" id="platformsWrap"><input type="text" id="inp-platforms" list="dl-platforms" placeholder="Añadir..."></div>
          <span class="tag-hint">Pulsa Enter para añadir</span>
        </div>
        ${f.hasScore ? `
          <div class="fg">
            <label class="flabel">${type === 'p' ? 'Interés' : 'Puntuación'}${f.scoreRequired ? ' *' : ''}</label>
            <div class="star-inp" id="f-stars" data-v="${rating}" style="padding:.78rem 0;min-height:46px;align-items:center;">
              ${[1, 2, 3, 4, 5].map(v => `<span data-v="${v}" class="${v <= rating ? 'f' : ''}" data-action="set-star" data-value="${v}">★</span>`).join('')}
            </div>
          </div>` : ''}
      </div>
      ${f.hasYears || f.hasHours ? `
        <div class="frow">
          ${f.hasYears ? `
          <div class="fg">
            <label class="flabel">Años completado *</label>
            <div class="tag-inp-wrap" id="yearsWrap"><input type="text" inputmode="numeric" id="inp-years" placeholder="Ej: ${CURRENT_YEAR}" maxlength="4"></div>
            <span class="tag-hint">Pulsa Enter para añadir</span>
          </div>` : ''}
          ${f.hasHours ? `
          <div class="fg">
            <label class="flabel">Horas jugadas</label>
            <input type="text" inputmode="decimal" class="finput" id="f-horas" placeholder="Ej: 45 o 12,5" value="${draft.hours != null ? String(draft.hours).replace('.', ',') : ''}">
          </div>` : ''}
        </div>
      ` : ''}
      ${f.hasReasons ? `
        <div class="fg">
          <label class="flabel">Puntos débiles</label>
          <div class="tag-inp-wrap" id="reasonsWrap"><input type="text" id="inp-reasons" list="dl-weaknesses" placeholder="Añadir..."></div>
          <span class="tag-hint">Pulsa Enter para añadir</span>
        </div>` : ''}
      ${f.hasStrengths || f.hasWeaknesses ? `
        <div class="frow">
          ${f.hasStrengths ? `<div class="fg"><label class="flabel">Puntos fuertes</label><div class="tag-inp-wrap" id="strengthsWrap"><input type="text" id="inp-strengths" list="dl-strengths" placeholder="Añadir..."></div><span class="tag-hint">Pulsa Enter para añadir</span></div>` : ''}
          ${f.hasWeaknesses ? `<div class="fg"><label class="flabel">Puntos débiles</label><div class="tag-inp-wrap" id="weaknessesWrap"><input type="text" id="inp-weaknesses" list="dl-weaknesses" placeholder="Añadir..."></div><span class="tag-hint">Pulsa Enter para añadir</span></div>` : ''}
        </div>` : ''}
      <div class="frow">
        <div class="fg">
          <label class="flabel form-toggle-label" aria-hidden="true">Steam Deck</label>
          <button class="btn btn-toggle ${draft.steamDeck ? 'active btn-toggle-deck' : ''}" type="button" id="f-deck-btn"
                  data-action="toggle-form-deck" aria-label="Steam Deck" style="width:100%;justify-content:flex-start;">
            ${UI.icon('steamdeck')}<span>Steam Deck</span>
          </button>
        </div>
        ${f.hasBool ? `
          <div class="fg">
            <label class="flabel form-toggle-label" aria-hidden="true">${f.boolLabel}</label>
            <button class="btn btn-toggle ${boolOn ? 'active' : ''}" type="button" id="f-bool-btn"
                    data-action="toggle-form-bool" aria-label="${UI.esc(f.boolLabel)}" style="width:100%;justify-content:flex-start;">
              ${UI.icon(f.boolField === 'replayable' ? 'repeat' : 'undo')}<span>${f.boolLabel}</span>
            </button>
          </div>` : ''}
      </div>
      ${f.hasReview ? `
        <div class="fg">
          <label class="flabel">Análisis</label>
          <textarea class="ftextarea" id="f-review" placeholder="Escribe tu análisis del juego">${UI.esc(draft.review || '')}</textarea>
        </div>` : ''}
    `;
    }

    bindTagInputs(keys) {
        for (const key of keys) {
            const input = document.getElementById(`inp-${key}`);
            if (input) input.onkeydown = (ev) => this.addTag(ev, key);
        }
    }

    _bindYearInput() {
        const input = document.getElementById('inp-years');
        if (!input) return;
        input.addEventListener('input', () => {
            const clean = input.value.replace(/\D/g, '').slice(0, 4);
            if (input.value !== clean) input.value = clean;
            if (this._yearWarningShown) { this._yearWarningShown = false; this.setFieldState(input, null); }
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            input.value = text.replace(/\D/g, '').slice(0, 4);
            this._yearWarningShown = false; this.setFieldState(input, null);
        });
    }

    _bindHorasInput() {
        const input = document.getElementById('f-horas');
        if (!input) return;
        input.addEventListener('input', function () {
            let v = this.value.replace(/[^0-9.,]/g, '');
            const s = v.search(/[.,]/);
            if (s >= 0) v = v.slice(0, s + 1).replace(',', '.') + v.slice(s + 1).replace(/[.,]/g, '').slice(0, 1);
            this.value = v.slice(0, 5);
        });
        input.addEventListener('paste', function (e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            let v = text.replace(/[^0-9.,]/g, '');
            const s = v.search(/[.,]/);
            if (s >= 0) v = v.slice(0, s + 1).replace(',', '.') + v.slice(s + 1).replace(/[.,]/g, '').slice(0, 1);
            this.value = v.slice(0, 5);
        });
    }

    setStar(v) {
        const box = document.getElementById('f-stars');
        if (!box) return;
        box.dataset.v = String(v);
        box.querySelectorAll('span').forEach(s => s.classList.toggle('f', Number(s.dataset.v) <= v));
        this.clearErrors();
    }

    commitTag(list, value) {
        const val = value.trim();
        if (!val) return;
        if (list === 'years') {
            if (!/^\d{4}$/.test(val)) return;
            const year = Number(val);
            if (!this.tempTags.years.includes(year)) {
                this.tempTags.years.push(year);
                this.tempTags.years.sort((a, b) => a - b);
            }
        } else {
            const lowerVal = val.toLowerCase();
            let finalVal = val;
            const lookupKey = list === 'reasons' ? 'weaknesses' : list;
            if (this.lookups[lookupKey]) {
                for (const existing of this.lookups[lookupKey]) {
                    if (String(existing).toLowerCase() === lowerVal) { finalVal = existing; break; }
                }
            }
            if (!this.tempTags[list].some(t => String(t).toLowerCase() === lowerVal)) {
                this.tempTags[list].push(finalVal);
            }
        }
    }

    addTag(e, list) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const input = e.target;
        const val = input.value.trim();
        if (!val) return;
        
        if (list === 'years') {
            if (!/^\d{4}$/.test(val)) {
                if (!this._yearWarningShown) {
                    this._yearWarningShown = true;
                    this.setFieldState(input, 'warning');
                    this.notify('El año debe tener exactamente 4 dígitos.', 'warn');
                } else {
                    input.value = ''; this.setFieldState(input, null); this._yearWarningShown = false;
                }
                return;
            }
            this._yearWarningShown = false;
        }
        this.commitTag(list, val);
        input.value = '';
        this.setFieldState(input, null);
        this.renderTags();
    }

    removeTag(list, value) { this.tempTags[list] = this.tempTags[list].filter(v => v !== value); this.renderTags(); }

    renderTags() {
        const wrapMap = { genres: 'genresWrap', platforms: 'platformsWrap', years: 'yearsWrap', strengths: 'strengthsWrap', weaknesses: 'weaknessesWrap', reasons: 'reasonsWrap' };
        const classMap = { genres: 'chip-genre', platforms: 'chip-plat', strengths: 'chip-pf', weaknesses: 'chip-pd', reasons: 'chip-pd', years: 'chip-generic' };
        for (const [key, wrapId] of Object.entries(wrapMap)) {
            const wrap = document.getElementById(wrapId);
            if (!wrap) continue;
            wrap.querySelectorAll('.chip').forEach(ch => ch.remove());
            const input = wrap.querySelector('input');
            if (!input) continue;
            for (const value of this.tempTags[key] || []) {
                const chip = document.createElement('span');
                chip.className = `chip ${classMap[key] || 'chip-generic'}`;
                chip.innerHTML = `${UI.esc(value)} <button type="button" class="chip-rm">${UI.icon('close')}</button>`;
                chip.querySelector('button').onclick = () => this.removeTag(key, value);
                wrap.insertBefore(chip, input);
            }
        }
    }

    setFieldState(el, state) {
        if (!el) return;
        const t = el.classList.contains('tag-inp-wrap') ? el : (el.closest('.tag-inp-wrap') || el);
        t.classList.remove('field-error', 'field-warning', 'has-error', 'has-warning');
        if (state === 'error') t.classList.add('field-error');
        if (state === 'warning') t.classList.add('field-warning');
    }

    clearErrors() {
        document.querySelectorAll('.field-error,.field-warning,.has-error,.has-warning')
            .forEach(el => el.classList.remove('field-error', 'field-warning', 'has-error', 'has-warning'));
    }

    /* ── Guardar y Migrar ──────────────────────────────────────────── */
    startMigration(id, targetTab) {
        const game = this.data[this.currentTab].find(i => i.id === id);
        if (!game) return;
        let prefill = { ...game };
        if (targetTab === 'c') prefill = { ...prefill, years: [CURRENT_YEAR], score: game.score || 5, replayable: false, weaknesses: prefill.weaknesses || game.reasons || [] };
        if (targetTab === 'v') prefill = { ...prefill, reasons: prefill.reasons || game.weaknesses || [], retry: true };
        if (targetTab === 'e') prefill = { ...prefill, weaknesses: prefill.weaknesses || game.reasons || [] };
        this.editCtx.migrateId = id;
        this.editCtx.sourceTab = this.currentTab;
        this.openModal(targetTab, null, prefill);
    }

    saveGame() {
        this.clearErrors();
        const { type, id, migrateId, sourceTab } = this.editCtx;
        const f = TAB_CONFIG[type].form;
        
        // El timestamp CRDT que se añade al juego para resolver conflictos
        const payload = {
            _ts: Date.now(), 
            name: document.getElementById('f-name').value.trim(),
            genres: [...this.tempTags.genres],
            platforms: [...this.tempTags.platforms],
            steamDeck: document.getElementById('f-deck-btn').classList.contains('active'),
            review: f.hasReview ? (document.getElementById('f-review')?.value.trim() || '') : '',
        };
        
        if (f.hasStrengths) payload.strengths = [...this.tempTags.strengths];
        if (f.hasWeaknesses) payload.weaknesses = [...this.tempTags.weaknesses];
        if (f.hasReasons) payload.reasons = [...this.tempTags.reasons];
        if (f.hasYears) payload.years = [...this.tempTags.years];
        if (f.hasScore) payload.score = Number(document.getElementById('f-stars')?.dataset.v || 0);
        if (f.hasBool) payload[f.boolField] = document.getElementById('f-bool-btn').classList.contains('active');
        if (f.hasHours) {
            const hVal = document.getElementById('f-horas')?.value.trim().replace(',', '.');
            const hNum = hVal ? parseFloat(hVal) : NaN;
            payload.hours = (hVal && !isNaN(hNum) && hNum >= 0) ? hNum : null;
        }

        let hasError = false;
        const err = (elId) => { this.setFieldState(document.getElementById(elId), 'error'); hasError = true; };
        if (!payload.name) err('f-name');
        if (!payload.genres.length) err('genresWrap');
        if (!payload.platforms.length) err('platformsWrap');
        if (f.hasYears && !payload.years.length) err('yearsWrap');
        if (f.scoreRequired && payload.score <= 0) err('f-stars');

        let autoCommitted = false;
        for (const key of TAB_CONFIG[type].tagKeys) {
            const input = document.getElementById(`inp-${key}`);
            const pendingVal = input?.value.trim();
            if (!pendingVal) continue;
            if (key === 'years') {
                if (/^\d{4}$/.test(pendingVal)) { this.commitTag(key, pendingVal); if (input) input.value = ''; autoCommitted = true; } 
                else {
                    if (!this._yearWarningShown) {
                        this._yearWarningShown = true;
                        this.setFieldState(input, 'warning');
                        this.notify('El año debe tener exactamente 4 dígitos. Pulsa Guardar de nuevo para ignorarlo.', 'warn');
                        return;
                    }
                    if (input) input.value = ''; this._yearWarningShown = false;
                }
            } else {
                this.commitTag(key, pendingVal);
                if (input) input.value = ''; autoCommitted = true;
            }
        }
        if (autoCommitted) this.renderTags();
        if (hasError) { this.notify('Revisa los campos marcados antes de guardar.', 'warn'); return; }

        if (id) {
            const idx = this.data[type].findIndex(g => g.id === id);
            if (idx >= 0) this.data[type][idx] = { ...this.data[type][idx], ...payload };
        } else {
            const allItems = ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || []);
            payload.id = Math.max(0, ...allItems.map(g => g.id)) + 1;
            this.data[type].push(payload);
        }

        if (migrateId && sourceTab) {
            this.data[sourceTab] = this.data[sourceTab].filter(g => g.id !== migrateId);
            this.currentTab = type;
        }

        this.persist();
        this.closeModal('modal-form');
        this.notify('Juego guardado correctamente', 'ok');
    }

    closeModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
        if (modalId === 'modal-admin') this.clearAdminNotice();
        this.clearErrors();
    }

    deleteGame(type, id) {
        if (!confirm('¿Eliminar juego?')) return;
        this.data[type] = this.data[type].filter(g => g.id !== id);
        this.data.deleted = this.data.deleted || [];
        this.data.deleted.push({ id, _ts: Date.now() }); // Marca temporal para que Gist sepa que se borró
        if (this.expandedId === id) this.expandedId = null;
        this.persist();
        this.notify('Juego eliminado', 'ok');
    }

    /* ── Notificaciones ────────────────────────────────────────────── */
    showMessage(msg, kind = 'ok', target = 'global') {
        const isAdmin = target === 'admin';
        const el = document.getElementById(isAdmin ? 'admin-warning' : 'status-banner');
        if (!el) return;
        const label = kind === 'err' ? 'Error' : kind === 'warn' ? 'Aviso' : 'Correcto';
        if (isAdmin) {
            if (this.adminTimer) clearTimeout(this.adminTimer);
            el.className = `admin-warning show ${kind}`;
            el.innerHTML = `<strong>${label}</strong> ${UI.esc(msg)}`;
            this.adminTimer = window.setTimeout(() => { el.className = 'admin-warning'; el.innerHTML = ''; }, 4200);
        } else {
            if (this.statusTimer) clearTimeout(this.statusTimer);
            el.hidden = false;
            el.innerHTML = `<div class="${kind}"><div class="status-line"><strong>${label}</strong><span class="status-copy">${UI.esc(msg)}</span></div></div>`;
            this.statusTimer = window.setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 3200);
        }
    }
    notify(msg, kind = 'ok') { this.showMessage(msg, kind, 'global'); }
    adminNotify(msg, kind = 'warn') { this.showMessage(msg, kind, 'admin'); }
    clearAdminNotice() {
        const el = document.getElementById('admin-warning');
        if (!el) return;
        if (this.adminTimer) clearTimeout(this.adminTimer);
        el.className = 'admin-warning'; el.innerHTML = '';
    }

    /* ── Admin de etiquetas ────────────────────────────────────────── */
    openAdminModal() {
        document.getElementById('modal-admin').classList.add('active');
        this.clearAdminNotice();
        this.switchAdminTab('genres', document.querySelector('.admin-tab'));
    }

    switchAdminTab(tab, btn) {
        this.currentAdminTab = tab;
        this.adminEditState = null;
        this.clearAdminNotice();
        document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
        btn?.classList.add('active');
        this.renderAdminList();
    }

    renderAdminList() {
        const container = document.getElementById('admin-list-container');
        const values = [...(this.lookups[this.currentAdminTab] || [])].sort((a, b) => String(a).localeCompare(String(b), 'es'));
        if (!values.length) {
            container.innerHTML = '<span style="color:var(--text-muted)">No hay etiquetas</span>';
            return;
        }
        container.innerHTML = values.map(v => {
            const id = this.tagDomId(v);
            const enc = encodeURIComponent(v);
            return `<div class="admin-item${this.adminEditState?.original === v ? ' editing' : ''}" id="${id}">
        <span>${UI.esc(v)}</span>
        <div class="row-actions">
          <button class="btn btn-secondary" type="button" data-action="edit-admin-tag" data-value="${enc}">${UI.icon('edit')}<span>Editar</span></button>
          <button class="btn btn-danger"    type="button" data-action="delete-admin-tag" data-value="${enc}">${UI.icon('trash')}<span>Eliminar</span></button>
        </div></div>`;
        }).join('');
    }

    tagDomId(v) { return `ar-${btoa(unescape(encodeURIComponent(v))).replace(/=/g, '')}`; }

    editAdminTag(value) {
        this.adminEditState = { original: value, mergePending: false };
        const row = document.getElementById(this.tagDomId(value));
        if (!row) return;
        row.classList.add('editing');
        const enc = encodeURIComponent(value);
        row.innerHTML = `
      <input type="text" class="finput" id="ae-inp" value="${UI.esc(value)}" style="flex:1">
      <div class="row-actions">
        <button class="btn btn-secondary" type="button" data-action="render-admin-list">Cancelar</button>
        <button class="btn btn-steam"     type="button" data-action="save-admin-tag" data-value="${enc}">Guardar</button>
      </div>`;
        document.getElementById('ae-inp').focus();
    }

    saveAdminTag(oldV) {
        const input = document.getElementById('ae-inp');
        if (!input) return;
        const newV = input.value.trim();
        if (!newV || newV === oldV) { this.renderAdminList(); return; }
        const exists = this.lookups[this.currentAdminTab].has(newV);
        if (exists && !this.adminEditState?.mergePending) {
            this.adminEditState.mergePending = true;
            this.setFieldState(input, 'warning');
            this.adminNotify('Ya existe. Pulsa Guardar otra vez para fusionar.', 'warn');
            return;
        }
        const tab = this.currentAdminTab;
        const merge = (arr) => Array.from(new Set(arr.map(v => v === oldV ? newV : v)));
        
        for (const game of ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || [])) {
            let changed = false;
            if (tab === 'genres' && game.genres?.includes(oldV)) { game.genres = merge(game.genres); changed = true; }
            if (tab === 'platforms' && game.platforms?.includes(oldV)) { game.platforms = merge(game.platforms); changed = true; }
            if (tab === 'strengths' && game.strengths?.includes(oldV)) { game.strengths = merge(game.strengths); changed = true; }
            if (tab === 'weaknesses') {
                if (game.weaknesses?.includes(oldV)) { game.weaknesses = merge(game.weaknesses); changed = true; }
                if (game.reasons?.includes(oldV)) { game.reasons = merge(game.reasons); changed = true; }
            }
            if (changed) game._ts = Date.now(); // Actualizar fecha individual
        }
        this.persist(); this.renderAdminList();
        this.adminNotify(exists ? 'Fusionado correctamente' : 'Actualizado correctamente', 'ok');
    }

    deleteAdminTag(value) {
        if (!confirm(`¿Eliminar etiqueta "${value}"?`)) return;
        const tab = this.currentAdminTab;
        for (const game of ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || [])) {
            let changed = false;
            if (tab === 'genres' && game.genres?.includes(value)) { game.genres = game.genres.filter(v => v !== value); changed = true; }
            if (tab === 'platforms' && game.platforms?.includes(value)) { game.platforms = game.platforms.filter(v => v !== value); changed = true; }
            if (tab === 'strengths' && game.strengths?.includes(value)) { game.strengths = game.strengths.filter(v => v !== value); changed = true; }
            if (tab === 'weaknesses') {
                if (game.weaknesses?.includes(value)) { game.weaknesses = game.weaknesses.filter(v => v !== value); changed = true; }
                if (game.reasons?.includes(value)) { game.reasons = game.reasons.filter(v => v !== value); changed = true; }
            }
            if (changed) game._ts = Date.now();
        }
        this.persist(); this.renderAdminList();
        this.adminNotify('Etiqueta eliminada', 'ok');
    }

    /* ── Exportar / Importar ────────────────────────────────────────── */
    _cleanGameData(item) {
        const out = {};
        for (const k in item) {
            const v = item[k];
            if (v === null || v === undefined || v === '') continue;
            if (Array.isArray(v) && !v.length) continue;
            if (typeof v === 'boolean' && !v) continue;
            if (k === 'score' && v === 0) continue;
            out[k] = v;
        }
        if (!out.id) out.id = item.id;
        return out;
    }

    exportData() {
        const payload = Object.fromEntries(['c', 'v', 'e', 'p'].map(t => [t, this.data[t].map(i => this._cleanGameData(i))]));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        a.download = 'myGames.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    importData(e) {
        const input = e.target;
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (parsed && typeof parsed === 'object' && confirm('¿Sobrescribir los datos actuales?')) {
                    const importMigrated = typeof window.migrateData === 'function' ? window.migrateData(parsed) : parsed;
                    this.data = { 
                        c: importMigrated.c || [], v: importMigrated.v || [], 
                        e: importMigrated.e || [], p: importMigrated.p || [], deleted: [] 
                    };
                    this.persist();
                    this.notify('Importado correctamente', 'ok');
                }
            } catch (_) { this.notify('Archivo JSON no válido', 'err'); }
        };
        reader.readAsText(file); input.value = '';
    }

    /* ── Sync Inteligente ──────────────────────────────────────────── */
    async _initSync() {
        const cfg = GistSync.getCfg();
        if (!cfg?.token || !cfg?.gistId) { this._setSyncStatus('idle'); return; }
        this._setSyncStatus('syncing');
        try {
            const remote = await GistSync.read(cfg.token, cfg.gistId, cfg.etag || null);
            if (remote?.notModified) {
                const localTs = Number(this.meta?.updatedAt || 0);
                const remoteTs = Number(cfg.lastRemoteUpdatedAt || 0);
                if (localTs > remoteTs) await this._pushToGist(true);
                this._setSyncStatus('ok');
                return;
            }
            const remoteData = this._extractSyncPayload(remote?.data || remote);
            const remoteTs = Number(remoteData.updatedAt || 0);
            
            // CRDT Merge en el inicio
            const { mergedData } = this._mergeData(remoteData.data, remoteTs);
            this.data = mergedData;
            
            const newTs = Date.now();
            this.meta = { ...(this.meta || {}), updatedAt: newTs, etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs };
            this._saveLocalState();
            GistSync.saveCfg({ ...cfg, etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs });
            
            this.normalize(); this.refreshLookups(); this.render();
            
            // Subir la fusión para que el remoto también esté al día (sin silencios)
            await this._pushToGist(true); 
            this._setSyncStatus('ok');
        } catch (err) {
            this._setSyncStatus('error', err.message);
        }
    }

    async _pushToGist(silent = false, etagOverride = null) {
        const cfg = GistSync.getCfg();
        if (!cfg?.token || !cfg?.gistId) return;
        const payload = this._buildSyncPayload();
        if (!silent) this._setSyncStatus('syncing');
        try {
            const res = await GistSync.write(cfg.token, cfg.gistId, payload, etagOverride || cfg.etag || null);
            const nextCfg = { ...cfg, etag: res?.etag || null, lastRemoteUpdatedAt: payload.updatedAt };
            GistSync.saveCfg(nextCfg);
            this.meta = { ...(this.meta || {}), updatedAt: payload.updatedAt, lastRemoteUpdatedAt: payload.updatedAt, etag: res?.etag || null };
            this._saveLocalState();
            if (!silent) this._setSyncStatus('ok');
        } catch (err) {
            if (!silent) this._setSyncStatus('error', err.message);
        }
    }

    _setSyncStatus(status, msg = '') {
        const badge = document.getElementById('sync-badge');
        const lbl = document.getElementById('sync-label');
        if (!badge) return;
        badge.className = `sync-badge s-${status}`;
        const labels = { idle: 'No Sincronizado', ok: 'Sincronizado', syncing: 'Sincronizando…', error: 'Error Sync' };
        if (lbl) lbl.textContent = labels[status] || status;
        const tips = { idle: 'No sincronizado', ok: 'Sincronizado con Gist', syncing: 'Sincronizando…', error: `Error: ${msg}` };
        badge.title = tips[status] || '';
    }

    openSyncModal() {
        this._renderSyncModal();
        document.getElementById('modal-sync').classList.add('active');
    }

    _renderSyncModal() {
        const cfg = GistSync.getCfg();
        const body = document.getElementById('sync-body');
        const foot = document.getElementById('sync-footer');
        if (!cfg) {
            body.innerHTML = `<div class="sync-section"><div class="sync-help"><strong>Cómo configurar:</strong><br>Ve a GitHub > Settings > Tokens. Crea uno con permiso <code>gist</code> y pégalo aquí.</div></div>
        <div class="sync-section">
          <div class="fg"><label class="flabel">Token *</label><div class="token-row"><input class="finput" id="sy-token" type="password" placeholder="ghp_..."><button class="token-toggle" type="button" data-action="toggle-token-visibility">👁</button></div></div>
          <div class="fg"><label class="flabel">Gist ID (Vacio la 1ª vez)</label><input class="finput" id="sy-gist" type="text"></div>
          <div id="sy-msg" class="sync-status-msg"></div>
        </div>`;
            foot.innerHTML = `<button class="btn btn-secondary" type="button" data-action="close-modal" data-target="modal-sync">Cancelar</button><button class="btn btn-steam" type="button" data-action="sync-connect">Conectar</button>`;
        } else {
            body.innerHTML = `<div class="sync-section"><div class="sync-help">Gist ID: <code>${UI.esc(cfg.gistId)}</code></div><div id="sy-msg" class="sync-status-msg"></div></div>`;
            foot.innerHTML = `<button class="btn btn-danger" type="button" data-action="sync-disconnect">Desconectar</button><button class="btn btn-secondary" type="button" data-action="close-modal" data-target="modal-sync">Cerrar</button><button class="btn btn-steam" type="button" data-action="sync-now">Sincronizar</button>`;
        }
    }

    async _syncConnect() {
        const token = document.getElementById('sy-token')?.value.trim();
        const gistInput = document.getElementById('sy-gist')?.value.trim();
        if (!token) { this.syncMsg('Falta el token', 'err'); return; }
        this.syncMsg('Conectando…', 'warn');
        try {
            await GistSync.whoami(token);
            if (!gistInput) {
                if (!confirm('¿Crear nuevo Gist?')) return;
                const gistId = await GistSync.create(token);
                GistSync.saveCfg({ token, gistId, etag: null, lastRemoteUpdatedAt: 0 });
                await this._pushToGist(true);
                this.syncMsg('Conectado y subido', 'ok');
            } else {
                const remote = await GistSync.read(token, gistInput, null);
                const payload = this._extractSyncPayload(remote?.data || remote);
                GistSync.saveCfg({ token, gistId: gistInput, etag: remote?.etag || null, lastRemoteUpdatedAt: payload.updatedAt || 0 });
                
                // Hacemos un merge la primera vez que traemos datos por si teníamos algo local
                const { mergedData } = this._mergeData(payload.data, payload.updatedAt || Date.now());
                this.data = mergedData;
                
                this.meta = { ...(this.meta || {}), updatedAt: Date.now(), etag: remote?.etag || null, lastRemoteUpdatedAt: payload.updatedAt || Date.now() };
                this._saveLocalState();
                this.normalize(); this.refreshLookups(); this.render();
                
                await this._pushToGist(true); // Subimos el merge
                this._setSyncStatus('ok');
                this.syncMsg('Conectado, fusionado y sincronizado', 'ok');
            }
            setTimeout(() => { this.closeModal('modal-sync'); }, 1400);
        } catch (err) { this.syncMsg(err.message, 'err'); }
    }

    async _syncNow() {
        const cfg = GistSync.getCfg();
        if (!cfg) return;
        this.syncMsg('Sincronizando…', 'warn');
        try {
            const remote = await GistSync.read(cfg.token, cfg.gistId, cfg.etag || null);
            if (remote?.notModified) {
                const localTs = Number(this.meta?.updatedAt || 0);
                const remoteTs = Number(cfg.lastRemoteUpdatedAt || 0);
                if (localTs > remoteTs) {
                    await this._pushToGist(false);
                    this.syncMsg('Cambios locales subidos', 'ok');
                } else {
                    this.syncMsg('Al día', 'ok');
                    this._setSyncStatus('ok');
                }
                return;
            }
            
            const remoteData = this._extractSyncPayload(remote?.data || remote);
            const remoteTs = Number(remoteData.updatedAt || 0);
            
            // Fusionar en lugar de sobrescribir
            const { mergedData, hasChanges } = this._mergeData(remoteData.data, remoteTs);
            this.data = mergedData;
            
            this.meta = { ...(this.meta || {}), updatedAt: Date.now(), etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs || 0 };
            this._saveLocalState();
            this.normalize(); this.refreshLookups(); this.render();
            GistSync.saveCfg({ ...cfg, etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs || 0 });
            
            // Subir el resultado del Merge si hemos mezclado datos de ambos sitios
            await this._pushToGist(true);
            this._setSyncStatus('ok');
            this.syncMsg('Fusión completa (Datos sincronizados)', 'ok');
            
        } catch (err) { this.syncMsg(err.message, 'err'); }
    }

    syncDisconnect() {
        if (!confirm('¿Desconectar?')) return;
        GistSync.clearCfg(); this._setSyncStatus('idle'); this.closeModal('modal-sync');
    }

    syncMsg(text, kind = 'ok') {
        const el = document.getElementById('sy-msg');
        if (!el) return;
        el.className = `sync-status-msg ${kind}`; el.textContent = text;
    }
}
const App = new SteamListApp();