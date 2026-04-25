// @ts-nocheck
"use strict";

import { TAB_C_LABELS, TAB_V_LABELS, TAB_E_LABELS, TAB_P_LABELS, UI_CONFIG } from './constants.ts';
import { GistSync, DataSync } from './sync.ts';

/* ═══════════════════════════════════════════════════════════════════
   TYPE DEFINITIONS
═══════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} GameItem
 * @property {number} id
 * @property {number} _ts
 * @property {string} name
 * @property {string[]} platforms
 * @property {string[]} genres
 * @property {boolean} steamDeck
 * @property {string} review
 * @property {number} [score]
 * @property {number[]} [years]
 * @property {string[]} [strengths]
 * @property {string[]} [weaknesses]
 * @property {string[]} [reasons]
 * @property {boolean} [replayable]
 * @property {boolean} [retry]
 * @property {number} [hours]
 */

/**
 * @typedef {Object} TabColumn
 * @property {string} key
 * @property {string} label
 * @property {string} cls
 * @property {boolean} sortable
 * @property {boolean} center
 * @property {(g: GameItem) => string} render
 */

/**
 * @typedef {Object} DetailField
 * @property {string} label
 * @property {(g: GameItem) => string} render
 * @property {string} [cls]
 * @property {boolean} [hideIfEmpty]
 */

/**
 * @typedef {Object} TabAction
 * @property {string} label
 * @property {string} btnCls
 * @property {string} target
 */

/**
 * @typedef {Object} FormConfig
 * @property {boolean} hasScore
 * @property {boolean} scoreRequired
 * @property {boolean} hasYears
 * @property {boolean} hasHours
 * @property {boolean} hasStrengths
 * @property {boolean} hasWeaknesses
 * @property {boolean} hasReasons
 * @property {boolean} hasBool
 * @property {string} boolLabel
 * @property {string} boolField
 * @property {boolean} hasReview
 */

/**
 * @typedef {Object} TabFilterBool
 * @property {string} label
 * @property {string} field
 */

/**
 * @typedef {Object} TabConfig
 * @property {{col: string, asc: boolean}} sortDefault
 * @property {boolean} filterScore
 * @property {boolean} filterYear
 * @property {boolean} filterHours
 * @property {TabFilterBool | null} filterBool
 * @property {TabColumn[]} columns
 * @property {DetailField[]} detailExtra
 * @property {TabAction[]} actions
 * @property {{new: string, prefill: string, edit: string}} modalTitles
 * @property {FormConfig} form
 * @property {string[]} tagKeys
 */

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'mis-listas-v12-unified';
const LEGACY_KEYS = ['mis-listas-v11-unified', 'mis-listas-v10-unified', 'mis-listas-v10-separated', 'mis-listas-v9-unified', 'mis-listas-v9-separated', 'mis-listas-v8-unified', 'mis-listas-v8-separated'];
const TABS = ['c', 'v', 'e', 'p'];
const CURRENT_YEAR = new Date().getFullYear();
const UI_BREAKPOINTS = { tableCompact: 1100, filtersCompact: 1400 };
const GIST_DEBOUNCE_MS = 1800;
const SEARCH_DEBOUNCE_MS = 220;

const ALERT_TYPES = {
    DELETE: 'delete',
    WARNING: 'warning',
    CREATE: 'create',
    OVERWRITE: 'overwrite',
    DISCONNECT: 'disconnect',
};

const ALERT_CONFIG = {
    delete: { btnClass: 'btn-danger', btnText: 'Eliminar' },
    warning: { btnClass: 'btn-secondary', btnText: 'Continuar' },
    create: { btnClass: 'btn-secondary', btnText: 'Crear' },
    overwrite: { btnClass: 'btn-danger', btnText: 'Sobrescribir' },
    disconnect: { btnClass: 'btn-danger', btnText: 'Desconectar' },
}

/* ═══════════════════════════════════════════════════════════════════
   TAB_CONFIG
═══════════════════════════════════════════════════════════════════ */
const TAB_CONFIG = {
    c: {
        sortDefault: { col: 'years', asc: false },
        filterScore: true, filterYear: true, filterHours: true, filterBool: { label: TAB_C_LABELS.filterBoolLabel, field: TAB_C_LABELS.filterBoolField },
        columns: [
            { key: 'nombre', label: TAB_C_LABELS.columns.name.label, cls: 'w-name-c', sortable: true, center: false, render: g => `<strong>${UI.esc((g || {}).name)}</strong>` },
            { key: 'years', label: TAB_C_LABELS.columns.years.label, cls: 'w-year-c', sortable: true, center: false, render: g => UI.chipList((g || {}).years, 'chip-generic') },
            { key: '_plat', label: TAB_C_LABELS.columns.platforms.label, cls: 'w-plat-c col-plat', sortable: false, center: false, render: g => UI.chipList((g || {}).platforms, 'chip-plat') },
            { key: 'genres', label: TAB_C_LABELS.columns.genres.label, cls: 'w-genre-c', sortable: true, center: false, render: g => UI.chipList((g || {}).genres, 'chip-genre') },
            { key: '_pf', label: TAB_C_LABELS.columns.strengths.label, cls: 'w-strong-c col-strong', sortable: false, center: false, render: g => UI.chipList((g || {}).strengths, 'chip-pf') },
            { key: '_pd', label: TAB_C_LABELS.columns.weaknesses.label, cls: 'w-weak-c col-weak', sortable: false, center: false, render: g => UI.chipList((g || {}).weaknesses, 'chip-pd') },
            { key: 'score', label: TAB_C_LABELS.columns.score.label, cls: 'w-score-c', sortable: true, center: false, render: g => UI.stars((g || {}).score) },
            { key: 'rejugabilidad', label: TAB_C_LABELS.columns.replayable.label, cls: 'w-bool-c', sortable: true, center: true, render: g => UI.bool((g || {}).replayable, 'replayable', TAB_C_LABELS.boolTooltips) },
        ],
        detailExtra: [
            { label: TAB_C_LABELS.details.years, hideIfEmpty: true, render: g => UI.chipList((g || {}).years, 'chip-generic') },
            { label: TAB_C_LABELS.details.hours, hideIfEmpty: true, render: g => (g || {}).hours != null ? `${String((g || {}).hours).replace('.', ',')} horas` : '' },
            { label: TAB_C_LABELS.details.strengths, hideIfEmpty: true, render: g => UI.chipList((g || {}).strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: TAB_C_LABELS.details.weaknesses, hideIfEmpty: true, render: g => UI.chipList((g || {}).weaknesses, 'chip-pd'), cls: 'detail-weak' },
            { label: TAB_C_LABELS.details.score, hideIfEmpty: true, render: g => UI.stars((g || {}).score) },
            { label: TAB_C_LABELS.details.replayable, hideIfEmpty: true, render: g => UI.bool((g || {}).replayable, 'replayable', TAB_C_LABELS.boolTooltips) },
        ],
        actions: [],
        modalTitles: { new: TAB_C_LABELS.modal.new, prefill: TAB_C_LABELS.modal.prefill, edit: TAB_C_LABELS.modal.edit },
        form: { hasScore: true, scoreRequired: true, hasYears: true, hasHours: true, hasStrengths: true, hasWeaknesses: true, hasReasons: false, hasBool: true, boolLabel: TAB_C_LABELS.form.boolLabel, boolField: TAB_C_LABELS.form.boolField, hasReview: true },
        tagKeys: ['genres', 'platforms', 'years', 'strengths', 'weaknesses'],
    },
    v: {
        sortDefault: { col: 'name', asc: true },
        filterScore: false, filterYear: false, filterHours: false, filterBool: { label: TAB_V_LABELS.filterBoolLabel, field: TAB_V_LABELS.filterBoolField },
        columns: [
            { key: 'nombre', label: TAB_V_LABELS.columns.name.label, cls: 'w-name-v', sortable: true, center: false, render: g => `<strong>${UI.esc((g || {}).name)}</strong>` },
            { key: '_plat', label: TAB_V_LABELS.columns.platforms.label, cls: 'w-plat-v col-plat', sortable: false, center: false, render: g => UI.chipList((g || {}).platforms, 'chip-plat') },
            { key: 'genres', label: TAB_V_LABELS.columns.genres.label, cls: 'w-genre-v', sortable: true, center: false, render: g => UI.chipList((g || {}).genres, 'chip-genre') },
            { key: '_pf', label: TAB_V_LABELS.columns.strengths.label, cls: 'w-strong-v col-strong', sortable: false, center: false, render: g => UI.chipList((g || {}).strengths, 'chip-pf') },
            { key: '_razoes', label: TAB_V_LABELS.columns.reasons.label, cls: 'w-weak-v col-weak', sortable: false, center: false, render: g => UI.chipList((g || {}).reasons, 'chip-pd') },
            { key: 'volver', label: TAB_V_LABELS.columns.retry.label, cls: 'w-bool-v', sortable: true, center: true, render: g => UI.bool((g || {}).retry, 'opportunity', TAB_V_LABELS.boolTooltips) },
        ],
        detailExtra: [
            { label: TAB_V_LABELS.details.strengths, hideIfEmpty: true, render: g => UI.chipList((g || {}).strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: TAB_V_LABELS.details.reasons, hideIfEmpty: true, render: g => UI.chipList((g || {}).reasons, 'chip-pd'), cls: 'detail-weak' },
            { label: TAB_V_LABELS.details.retry, hideIfEmpty: true, render: g => UI.bool((g || {}).retry, 'opportunity', TAB_V_LABELS.boolTooltips) },
        ],
        actions: [
            { label: TAB_V_LABELS.actions[0].label, btnCls: TAB_V_LABELS.actions[0].btnCls, target: TAB_V_LABELS.actions[0].target },
            { label: TAB_V_LABELS.actions[1].label, btnCls: TAB_V_LABELS.actions[1].btnCls, target: TAB_V_LABELS.actions[1].target },
        ],
        modalTitles: { new: TAB_V_LABELS.modal.new, prefill: TAB_V_LABELS.modal.prefill, edit: TAB_V_LABELS.modal.edit },
        form: { hasScore: false, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: true, hasWeaknesses: false, hasReasons: true, hasBool: true, boolLabel: TAB_V_LABELS.filterBoolLabel, boolField: TAB_V_LABELS.filterBoolField, hasReview: true },
        tagKeys: ['genres', 'platforms', 'strengths', 'reasons'],
    },
    e: {
        sortDefault: { col: 'name', asc: true },
        filterScore: false, filterYear: false, filterHours: false, filterBool: null,
        columns: [
            { key: 'nombre', label: TAB_E_LABELS.columns.name.label, cls: 'w-name-e', sortable: true, center: false, render: g => `<strong>${UI.esc((g || {}).name)}</strong>` },
            { key: '_plat', label: TAB_E_LABELS.columns.platforms.label, cls: 'w-plat-e col-plat', sortable: false, center: false, render: g => UI.chipList((g || {}).platforms, 'chip-plat') },
            { key: 'genres', label: TAB_E_LABELS.columns.genres.label, cls: 'w-genre-e', sortable: true, center: false, render: g => UI.chipList((g || {}).genres, 'chip-genre') },
            { key: '_pf', label: TAB_E_LABELS.columns.strengths.label, cls: 'w-strong-e col-strong', sortable: false, center: false, render: g => UI.chipList((g || {}).strengths, 'chip-pf') },
            { key: '_pd', label: TAB_E_LABELS.columns.weaknesses.label, cls: 'w-weak-e col-weak', sortable: false, center: false, render: g => UI.chipList((g || {}).weaknesses, 'chip-pd') },
        ],
        detailExtra: [
            { label: TAB_E_LABELS.details.strengths, hideIfEmpty: true, render: g => UI.chipList((g || {}).strengths, 'chip-pf'), cls: 'detail-strong' },
            { label: TAB_E_LABELS.details.weaknesses, hideIfEmpty: true, render: g => UI.chipList((g || {}).weaknesses, 'chip-pd'), cls: 'detail-weak' },
        ],
        actions: [
            { label: TAB_E_LABELS.actions[0].label, btnCls: TAB_E_LABELS.actions[0].btnCls, target: TAB_E_LABELS.actions[0].target },
            { label: TAB_E_LABELS.actions[1].label, btnCls: TAB_E_LABELS.actions[1].btnCls, target: TAB_E_LABELS.actions[1].target },
        ],
        modalTitles: { new: TAB_E_LABELS.modal.new, prefill: TAB_E_LABELS.modal.prefill, edit: TAB_E_LABELS.modal.edit },
        form: { hasScore: false, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: true, hasWeaknesses: true, hasReasons: false, hasBool: false, boolLabel: '', boolField: '', hasReview: true },
        tagKeys: ['genres', 'platforms', 'strengths', 'weaknesses'],
    },
    p: {
        sortDefault: { col: 'score', asc: false },
        filterScore: true, filterYear: false, filterHours: false, filterBool: null,
        columns: [
            { key: 'nombre', label: TAB_P_LABELS.columns.name.label, cls: 'w-name-p', sortable: true, center: false, render: g => `<strong>${UI.esc((g || {}).name)}</strong>` },
            { key: '_plat', label: TAB_P_LABELS.columns.platforms.label, cls: 'w-plat-p col-plat', sortable: false, center: false, render: g => UI.chipList((g || {}).platforms, 'chip-plat') },
            { key: 'genres', label: TAB_P_LABELS.columns.genres.label, cls: 'w-genre-p', sortable: true, center: false, render: g => UI.chipList((g || {}).genres, 'chip-genre') },
            { key: 'score', label: TAB_P_LABELS.columns.score.label, cls: 'w-score', sortable: true, center: false, render: g => (g || {}).score ? UI.stars((g || {}).score) : '<span style="color:var(--text-muted)">—</span>' },
        ],
        detailExtra: [
            { label: TAB_P_LABELS.details.score.label, hideIfEmpty: true, render: g => (g || {}).score ? UI.stars((g || {}).score) : `<span style="color:var(--text-muted)">${TAB_P_LABELS.details.score.empty}</span>` },
        ],
        actions: [
            { label: TAB_P_LABELS.actions[0].label, btnCls: TAB_P_LABELS.actions[0].btnCls, target: TAB_P_LABELS.actions[0].target },
        ],
        modalTitles: { new: TAB_P_LABELS.modal.new, prefill: TAB_P_LABELS.modal.prefill, edit: TAB_P_LABELS.modal.edit },
        form: { hasScore: true, scoreRequired: false, hasYears: false, hasHours: false, hasStrengths: false, hasWeaknesses: false, hasReasons: false, hasBool: false, boolLabel: '', boolField: '', hasReview: false },
        tagKeys: ['genres', 'platforms'],
    },
};

/* ═══════════════════════════════════════════════════════════════════
   UTILIDADES DE UI
═══════════════════════════════════════════════════════════════════ */
const UI = {
    /**
     * Escapa caracteres especiales HTML
     * @param {any} val - Valor a escapar
     * @returns {string} Texto escapado
     */
    esc(val) {
        return String(val ?? '').replace(/[&<>"'`=\/]/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;'
        })[m] || m);
    },
    /**
     * Renderiza un icono SVG
     * @param {string} name - Nombre del icono
     * @returns {string} HTML del icono
     */
    icon(name) { return `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`; },
    /**
     * Renderiza estrellas
     * @param {any} val - Valor numérico (0-5)
     * @returns {string} HTML de estrellas
     */
    stars(val) {
        const n = Math.max(0, Math.min(5, Number(val || 0)));
        return `<span class="stars">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= n ? 'f' : ''}">★</span>`).join('')}</span>`;
    },
    /**
     * Renderiza un chip
     * @param {any} txt - Texto del chip
     * @param {string} cls - Clase CSS
     * @returns {string} HTML del chip
     */
    chip(txt, cls) { return txt ? `<span class="chip ${cls}">${this.esc(txt)}</span>` : ''; },
    /**
     * Renderiza lista de chips
     * @param {any} vals - Array de valores
     * @param {string} cls - Clase CSS
     * @returns {string} HTML de chips
     */
    chipList(vals, cls) {
        const list = Array.isArray(vals) ? vals.filter(Boolean) : [];
        return list.length ? `<div class="chips">${list.map(v => this.chip(v, cls)).join('')}</div>` : `<span style="color:var(--text-muted)">—</span>`;
    },
    /**
     * Renderiza icono de boolean con estilos contextuales
     * @param {any} v - Valor boolean
     * @param {string} fieldType - Tipo de campo: 'replayable' o 'opportunity'
     * @returns {string} HTML del icono
     */
    bool(v, fieldType = 'replayable', tooltips = null) {
        // Usar tooltips proporcionados o valores por defecto
        const activeLabel = tooltips?.active || 'Activo';
        const inactiveLabel = tooltips?.inactive || 'Inactivo';
        
        if (fieldType === 'opportunity') {
            // Nueva Oportunidad: Refresh (activo) o Lock (inactivo)
            if (v) {
                return `<span class="badge-opp-activo" title="${activeLabel}" aria-label="${activeLabel}">${this.icon('refresh')}</span>`;
            } else {
                return `<span class="badge-opp-inactivo" title="${inactiveLabel}" aria-label="${inactiveLabel}">${this.icon('lock')}</span>`;
            }
        } else {
            // Rejugar: Star (activo) o Stack (inactivo)
            if (v) {
                return `<span class="badge-rejugar-activo" title="${activeLabel}" aria-label="${activeLabel}">${this.icon('star')}</span>`;
            } else {
                return `<span class="badge-rejugar-inactivo" title="${inactiveLabel}" aria-label="${inactiveLabel}"><svg style="width:20px;height:20px;"><rect x="3" y="2" width="14" height="2" fill="currentColor" opacity="0.8"/><rect x="3" y="6" width="14" height="2" fill="currentColor" opacity="0.9"/><rect x="3" y="10" width="14" height="8" fill="currentColor"/></svg></span>`;
            }
        }
    },
    /**
     * Renderiza celda de nombre con opcional puntuación
     * @param {GameItem} game - Objeto del juego
     * @param {boolean} [compact=false] - Modo compacto
     * @returns {string} HTML de la celda
     */
    nameCell(game, compact = false) {
        const title = `<strong>${this.esc(game?.name ?? '')}</strong>`;
        if (!compact)
            return title;
        const score = Number(game?.score || 0);
        const stars = score > 0 ? `<span class="compact-score">${this.stars(score)}</span>` : '';
        return `<div class="compact-name-cell"><span class="compact-name-text">${title}</span>${stars}</div>`;
    },
    /**
     * Icono de orden
     * @param {boolean} asc - Ascendente
     * @returns {string} Símbolo de flecha
     */
    sortIcon(asc) { return asc ? '▲' : '▼'; },
};


/* ═══════════════════════════════════════════════════════════════════
   APP PRINCIPAL
═══════════════════════════════════════════════════════════════════ */
export class SteamListApp {
    /**
     * Ordena strings en español (locale-aware)
     * @param {any} a - Valor A
     * @param {any} b - Valor B
     * @returns {number} Resultado de comparación
     */
    static sortEs(a, b) {
        return String(a).localeCompare(String(b), 'es');
    }

    // Propiedades de datos
    /** @type {Record<string, any[]>} */
    data;
    /** @type {string} */
    currentTab;
    /** @type {number | null} */
    expandedId;
    /** @type {Object} */
    editCtx;
    /** @type {Record<string, string[]>} */
    tempTags;
    /** @type {string} */
    currentAdminTab;
    /** @type {any} */
    adminEditState;
    /** @type {any} */
    meta;
    /** @type {Record<string, any>} */
    lookups;
    /** @type {Record<string, any>} */
    sortConfig;
    
    // Propiedades de UI
    /** @type {boolean} */
    tableCompact;
    /** @type {boolean} */
    filtersCompact;
    /** @type {boolean} */
    _filtersOpen;
    
    // Propiedades de timers
    /** @type {number | null} */
    statusTimer;
    /** @type {number | null} */
    adminTimer;
    /** @type {number | null} */
    _resizeTimer;
    /** @type {number | null} */
    _renderTableTimer;
    /** @type {number | null} */
    _pushTimer;
    
    // Propiedades de control
    /** @type {boolean} */
    _eventsBound;
    /** @type {boolean} */
    _yearWarningShown;

    constructor() {
        this.data = { c: [], v: [], e: [], p: [], deleted: [] };
        this.currentTab = 'c';
        this.expandedId = null;
        this._confirmPending = null;
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
        this._initConfirmDialog();
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
                return { ...base(i), strengths: toList(i?.strengths), review: String(i?.review ?? '').trim(), reasons: toList(i?.reasons), retry: Boolean(i?.retry) };
            },
            e: i => ({ ...base(i), strengths: toList(i?.strengths), review: String(i?.review ?? '').trim(), weaknesses: toList(i?.weaknesses) }),
            p: i => ({ ...base(i), score: Math.min(5, Math.max(0, Number(i?.score ?? 0))) }),
        };
        for (const t of TABS) {
            this.data[t] = (Array.isArray(this.data[t]) ? this.data[t].map(i => normFns[t](i)) : []);
        }
        
        this.data.deleted = this.data.deleted || [];

        const allItems = ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || []);
        const initialIds = allItems
            .map(i => Number.isFinite(i?.id) ? Number(i.id) : 0)
            .filter(id => id > 0);
        let nextId = Math.max(0, ...initialIds) + 1;
        const usedIds = new Set();
        
        for (const list of ['c', 'v', 'e', 'p'].map(t => this.data[t])) {
            for (const item of list) {
                const rawId = Number.isFinite(item?.id) ? Number(item.id) : 0;
                if (rawId > 0 && !usedIds.has(rawId)) {
                    item.id = rawId;
                } else {
                    item.id = nextId++;
                }
                usedIds.add(item.id);
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
        const fill = (id, set, fn) => {
            const el = document.getElementById(id); 
            if (el) el.innerHTML = [...set].sort(fn).map(v => `<option value="${UI.esc(v)}">`).join('');
        };
        fill('dl-genres', this.lookups.genres, SteamListApp.sortEs);
        fill('dl-platforms', this.lookups.platforms, SteamListApp.sortEs);
        fill('dl-strengths', this.lookups.strengths, SteamListApp.sortEs);
        fill('dl-weaknesses', this.lookups.weaknesses, SteamListApp.sortEs);
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
            case 'sync-connect': return this.syncConnect();
            case 'sync-disconnect': return this.syncDisconnect();
            case 'sync-now': return this.syncNow();
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
                const icon = i.type === 'password' ? 'icon-eye' : 'icon-eye-off';
                el.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#${icon}"></use></svg>`; return;
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
        const FILTER_ID_MAP = { search: 't-search', genre: 't-gen', platform: 't-plat', score: 't-score', hours: 't-hours', only: 't-only', deck: 't-deck' };
        const el = document.getElementById(FILTER_ID_MAP[key] || '');
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
            const range = UI_CONFIG.hoursRanges.find(r => r.key === state.hours);
            const label = range?.shortLabel || state.hours;
            chips.push(chip('hours', 'Duración', label));
        }
        if (state.only) chips.push(chip('only', this.getToolbarBoolLabel(), 'Activado'));
        if (state.deck) chips.push(chip('deck', 'Steam Deck', 'Activado'));
        return chips.length
            ? `<div class="active-filters show">${chips.join('')}<button type="button" class="btn btn-ghost" data-action="clear-all-filters">Limpiar todo</button></div>`
            : `<div class="active-filters"></div>`;
    }

    generateHoursRanges() {
        const tabData = this.data[this.currentTab];
        const gamesWithHours = tabData.filter(g => g.hours !== undefined && g.hours !== null && g.hours !== '');
        if (gamesWithHours.length === 0) return '';
        return UI_CONFIG.hoursRanges
            .filter(r => gamesWithHours.some(g => r.check(Number(g.hours))))
            .map(r => `<option value="${r.key}">${r.label}</option>`)
            .join('');
    }

    renderToolbar() {
        const state = this.getToolbarState();
        const cfg = TAB_CONFIG[this.currentTab];
        const tabData = this.data[this.currentTab];
        const compact = this.isFiltersCompact();
        const setG = new Set(), setP = new Set();
        tabData.forEach(i => {
            (i.genres || []).forEach(v => setG.add(v));
            (i.platforms || []).forEach(v => setP.add(v));
        });
        const opts = (set, fn) => [...set].sort(fn).map(v => `<option value="${UI.esc(v)}">${UI.esc(v)}</option>`).join('');
        const genres = opts(setG, SteamListApp.sortEs);
        const plats = opts(setP, SteamListApp.sortEs);
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
                  title="Limpiar búsqueda" style="display:${state.search ? 'flex' : 'none'};">${UI.icon('close')}</button>
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
            <option value="">Cualquier duración</option>${this.generateHoursRanges()}
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
                const range = UI_CONFIG.hoursRanges.find(r => r.key === state.hours);
                if (range && !range.check(hNum)) return false;
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
        const tabCfg = TAB_CONFIG[tab];
        const hasScore = tabCfg.form.hasScore; // Solo mostrar estrellas si la tabla tiene score
        const cells = cols.map(col => {
            let value: string;
            // En vista compacta o < 1100px, mostrar nombre con estrellas para la columna 'nombre' (solo si la tabla tiene score)
            if (col.key === 'nombre' && (this.isTableCompact() || window.innerWidth < 1100) && hasScore) {
                const name = UI.esc((game || {}).name);
                const stars = UI.stars((game || {}).score);
                value = `<div class="name-with-stars"><strong>${name}</strong><div class="stars-right">${stars}</div></div>`;
            } else if (this.isTableCompact() && col.key === 'name') {
                value = UI.nameCell(game, true);
            } else {
                value = col.render(game);
            }
            return `<td${col.center ? ' style="text-align:center;"' : ''}>${value}</td>`;
        }).join('');
        const mainRow = `<tr class="main-row ${idx % 2 === 0 ? 'striped' : ''}" data-action="toggle-expand" data-id="${game.id}" data-dbl-action="edit-game" data-tab="${tab}">${cells}</tr>`;
        return mainRow + this.renderDetailRow(game, expanded, cols.length);
    }

    _isEmptyValue(val) {
        // Detecta si un valor renderizado está vacío
        return !val || val.includes('style="color:var(--text-muted)"');
    }

    renderDetailRow(game, expanded, colCount) {
        const tab = this.currentTab;
        const tabCfg = TAB_CONFIG[tab];
        const platChips = (game.platforms || []).map(p => UI.chip(p, 'chip-plat')).join('');
        const deckChip = game.steamDeck ? `<span class="chip chip-deck">${UI.icon('steamdeck')}<span>Steam Deck</span></span>` : '';
        const platHtml = (platChips || deckChip) ? `<div class="chips">${platChips}${deckChip}</div>` : `<span style="color:var(--text-muted)">—</span>`;
        const genresHtml = UI.chipList(game.genres, 'chip-genre');
        const fields = [
            ...(!this._isEmptyValue(platHtml) ? [this.dbox('Plataformas', platHtml, 'detail-plat')] : []),
            ...(!this._isEmptyValue(genresHtml) ? [this.dbox('Géneros', genresHtml)] : []),
            ...tabCfg.detailExtra.map(f => {
                const val = f.render(game);
                if (f.hideIfEmpty && this._isEmptyValue(val)) return '';
                return this.dbox(f.label, val, f.cls || '');
            })
        ].filter(Boolean).join('');
        const reviewHtml = game.review ? `<div class="detail-value">${UI.esc(game.review).replace(/\n/g, '<br>')}</div>` : '';
        const notesHtml = tabCfg.form.hasReview && game.review ? `
      <div class="detail-box" style="grid-column:1/-1;">
        <span class="detail-label">Análisis</span>
        ${reviewHtml}
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

    isValidYear(val) { return /^\d{4}$/.test(String(val).trim()); }

    commitTag(list, value) {
        const val = value.trim();
        if (!val) return;
        if (list === 'years') {
            if (!this.isValidYear(val)) return;
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
        
        if (list === 'years' && !this.isValidYear(val)) {
            if (!this._yearWarningShown) {
                this._yearWarningShown = true;
                this.setFieldState(input, 'warning');
                this.notify('El año debe tener exactamente 4 dígitos.', 'warn');
                return;
            }
            input.value = ''; this.setFieldState(input, null); this._yearWarningShown = false;
            return;
        }
        this._yearWarningShown = false;
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

    _getFormValue(id) { return document.getElementById(id)?.value?.trim() || ''; }
    _getBoolValue(id) { return document.getElementById(id)?.classList?.contains('active') ?? false; }

    saveGame() {
        this.clearErrors();
        const { type, id, migrateId, sourceTab } = this.editCtx;
        const f = TAB_CONFIG[type].form;
        
        // El timestamp CRDT que se añade al juego para resolver conflictos
        const payload = {
            _ts: Date.now(), 
            name: this._getFormValue('f-name'),
            genres: [...this.tempTags.genres],
            platforms: [...this.tempTags.platforms],
            steamDeck: this._getBoolValue('f-deck-btn'),
            review: f.hasReview ? this._getFormValue('f-review') : '',
        };
        
        if (f.hasStrengths) payload.strengths = [...this.tempTags.strengths];
        if (f.hasWeaknesses) payload.weaknesses = [...this.tempTags.weaknesses];
        if (f.hasReasons) payload.reasons = [...this.tempTags.reasons];
        if (f.hasYears) payload.years = [...this.tempTags.years];
        if (f.hasScore) payload.score = Number(document.getElementById('f-stars')?.dataset.v || 0);
        if (f.hasBool) payload[f.boolField] = this._getBoolValue('f-bool-btn');
        if (f.hasHours) {
            const hVal = this._getFormValue('f-horas').replace(',', '.');
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
            if (key === 'years' && !this.isValidYear(pendingVal)) {
                if (!this._yearWarningShown) {
                    this._yearWarningShown = true;
                    this.setFieldState(input, 'warning');
                    this.notify('El año debe tener exactamente 4 dígitos. Pulsa Guardar de nuevo para ignorarlo.', 'warn');
                    return;
                }
                if (input) input.value = ''; this._yearWarningShown = false;
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

    _initConfirmDialog() {
        const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
        const cancelBtn = document.getElementById('dialog-cancel') as HTMLButtonElement;
        const confirmBtn = document.getElementById('dialog-confirm') as HTMLButtonElement;
        
        if (!dialog || !cancelBtn || !confirmBtn) return;
        
        cancelBtn.addEventListener('click', () => {
            dialog.close();
            this._confirmPending = null;
        });
        
        confirmBtn.addEventListener('click', () => {
            if (!this._confirmPending) return;
            const { action } = this._confirmPending;
            dialog.close();
            this._confirmPending = null;
            action();
        });
        
        dialog.addEventListener('close', () => {
            this._confirmPending = null;
        });
    }

    showConfirmDialog(title, message, type = 'warning', action = () => {}) {
        const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
        const titleEl = document.getElementById('dialog-title') as HTMLElement;
        const confirmBtn = document.getElementById('dialog-confirm') as HTMLButtonElement;
        
        if (!dialog || !titleEl || !confirmBtn) return;
        
        const config = ALERT_CONFIG[type] || ALERT_CONFIG.warning;
        titleEl.textContent = title;
        confirmBtn.className = `btn ${config.btnClass}`;
        confirmBtn.textContent = config.btnText;
        dialog.setAttribute('data-type', type);
        
        this._confirmPending = { action };
        dialog.showModal();
    }

    deleteGame(type, id) {
        this.showConfirmDialog(
            '¿Eliminar juego?',
            null,
            ALERT_TYPES.DELETE,
            () => {
                this.data[type] = this.data[type].filter(g => g.id !== id);
                this.data.deleted = this.data.deleted || [];
                this.data.deleted.push({ id, _ts: Date.now() });
                if (this.expandedId === id) this.expandedId = null;
                this.persist();
                this.notify('Juego eliminado', 'ok');
            }
        );
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
      <input type="text" class="finput" id="ae-inp" placeholder="Escribe el nuevo valor" value="${UI.esc(value)}" style="flex:1">
      <div class="row-actions">
        <button class="btn btn-secondary" type="button" data-action="render-admin-list">Cancelar</button>
        <button class="btn btn-steam"     type="button" data-action="save-admin-tag" data-value="${enc}">Guardar</button>
      </div>`;
        document.getElementById('ae-inp').focus();
    }

    _updateGameTagField(tab, updater) {
        for (const game of ['c', 'v', 'e', 'p'].flatMap(t => this.data[t] || [])) {
            let changed = false;
            if (tab === 'genres' && game.genres) { const res = updater(game.genres); if (res !== null) { game.genres = res; changed = true; } }
            if (tab === 'platforms' && game.platforms) { const res = updater(game.platforms); if (res !== null) { game.platforms = res; changed = true; } }
            if (tab === 'strengths' && game.strengths) { const res = updater(game.strengths); if (res !== null) { game.strengths = res; changed = true; } }
            if (tab === 'weaknesses' && game.weaknesses) { const res = updater(game.weaknesses); if (res !== null) { game.weaknesses = res; changed = true; } }
            if (tab === 'weaknesses' && game.reasons) { const res = updater(game.reasons); if (res !== null) { game.reasons = res; changed = true; } }
            if (changed) game._ts = Date.now();
        }
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
        this._updateGameTagField(tab, (arr) => {
            if (!arr.includes(oldV)) return null;
            return arr.map(v => v === oldV ? newV : v);
        });
        this.persist(); this.renderAdminList();
        this.adminNotify(exists ? 'Fusionado correctamente' : 'Actualizado correctamente', 'ok');
    }

    deleteAdminTag(value) {
        this.showConfirmDialog(
            `¿Eliminar etiqueta "${value}"?`,
            null,
            ALERT_TYPES.DELETE,
            () => {
                const tab = this.currentAdminTab;
                this._updateGameTagField(tab, (arr) => {
                    return arr.includes(value) ? arr.filter(v => v !== value) : null;
                });
                this.persist(); this.renderAdminList();
                this.adminNotify('Etiqueta eliminada', 'ok');
            }
        );
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
                if (parsed && typeof parsed === 'object') {
                    this.showConfirmDialog(
                        '¿Sobrescribir los datos actuales?',
                        'Esta acción no se puede deshacer',
                        ALERT_TYPES.OVERWRITE,
                        () => {
                            const importMigrated = typeof window.migrateData === 'function' ? window.migrateData(parsed) : parsed;
                            this.data = { 
                                c: importMigrated.c || [], v: importMigrated.v || [], 
                                e: importMigrated.e || [], p: importMigrated.p || [], deleted: [] 
                            };
                            this.persist();
                            this.notify('Importado correctamente', 'ok');
                        }
                    );
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
          <div class="fg"><label class="flabel">Token *</label><div class="token-row"><input class="finput" id="sy-token" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxx"><button class="token-toggle" type="button" data-action="toggle-token-visibility" aria-label="Mostrar token"><svg class="ui-icon" aria-hidden="true"><use href="#icon-eye"></use></svg></button></div><span class="tag-hint">Token personal de GitHub (comienza con ghp_)</span></div>
          <div class="fg"><label class="flabel">Gist ID (Vacio la 1ª vez)</label><input class="finput" id="sy-gist" type="text" placeholder="Ej: a1b2c3d4e5f6..."><span class="tag-hint">ID alfanumérico del Gist, disponible en la URL</span></div>
          <div id="sy-msg" class="sync-status-msg"></div>
        </div>`;
            foot.innerHTML = `<button class="btn btn-secondary" type="button" data-action="close-modal" data-target="modal-sync">Cancelar</button><button class="btn btn-steam" type="button" data-action="sync-connect">Conectar</button>`;
        } else {
            body.innerHTML = `<div class="sync-section"><div class="sync-help">Gist ID: <code>${UI.esc(cfg.gistId)}</code></div><div id="sy-msg" class="sync-status-msg"></div></div>`;
            foot.innerHTML = `<button class="btn btn-danger" type="button" data-action="sync-disconnect">Desconectar</button><button class="btn btn-secondary" type="button" data-action="close-modal" data-target="modal-sync">Cerrar</button><button class="btn btn-steam" type="button" data-action="sync-now">Sincronizar</button>`;
        }
    }

    async syncConnect() {
        const token = document.getElementById('sy-token')?.value.trim();
        const gistInput = document.getElementById('sy-gist')?.value.trim();
        if (!token) { this.syncMsg('Falta el token', 'err'); return; }
        this.syncMsg('Conectando…', 'warn');
        try {
            await GistSync.whoami(token);
            if (!gistInput) {
                return this._showCreateGistDialog(token);
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

    async syncNow() {
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
            
            const { mergedData, hasChanges } = this._mergeData(remoteData.data, remoteTs);
            this.data = mergedData;
            
            this.meta = { ...(this.meta || {}), updatedAt: Date.now(), etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs || 0 };
            this._saveLocalState();
            this.normalize(); this.refreshLookups(); this.render();
            GistSync.saveCfg({ ...cfg, etag: remote?.etag || null, lastRemoteUpdatedAt: remoteTs || 0 });
            
            await this._pushToGist(true);
            this._setSyncStatus('ok');
            this.syncMsg('Fusión completa (Datos sincronizados)', 'ok');
            
        } catch (err) { this.syncMsg(err.message, 'err'); }
    }

    _showCreateGistDialog(token) {
        this.showConfirmDialog(
            '¿Crear nuevo Gist?',
            'Se creará un Gist privado en tu cuenta de GitHub',
            ALERT_TYPES.CREATE,
            async () => {
                try {
                    const { gistId } = await GistSync.create(token);
                    GistSync.saveCfg({ token, gistId, etag: null, lastRemoteUpdatedAt: 0 });
                    await this._pushToGist(true);
                    this.syncMsg('Conectado y subido', 'ok');
                } catch (err) { this.syncMsg(err.message, 'err'); }
            }
        );
    }

    syncDisconnect() {
        this.showConfirmDialog(
            '¿Desconectar?',
            'Se borrará la configuración de sincronización local',
            ALERT_TYPES.DISCONNECT,
            () => {
                GistSync.clearCfg(); this._setSyncStatus('idle'); this.closeModal('modal-sync');
            }
        );
    }

    syncMsg(text, kind = 'ok') {
        const el = document.getElementById('sy-msg');
        if (!el) return;
        el.className = `sync-status-msg ${kind}`; el.textContent = text;
    }
}
const App = new SteamListApp();
