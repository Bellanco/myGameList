// @ts-nocheck
/**
 * SYNC.TS — Sincronización robusta con GitHub Gist
 * 
 * Responsabilidades:
 * - Comunicación con API de Gist (read, write, create, whoami)
 * - Merge inteligente de datos locales y remotos
 * - Manejo de timestamps para resolver conflictos
 * - Validación de datos antes de operaciones
 */

"use strict";

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc compatible)
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} GistConfig
 * @property {string} token
 * @property {string} gistId
 * @property {string | null} etag
 * @property {number} lastRemoteUpdatedAt
 */

/**
 * @typedef {Object} GistReadResponse
 * @property {boolean} [notModified]
 * @property {TabData} [data]
 * @property {string | null} [etag]
 */

/**
 * @typedef {Object} Game
 * @property {number} id
 * @property {number} _ts - Timestamp para CRDT
 * @property {string} name
 * @property {string[]} platforms
 * @property {string[]} genres
 * @property {boolean} steamDeck
 * @property {string} review
 */

/**
 * @typedef {Object} TabData
 * @property {Game[]} c - Completados
 * @property {Game[]} v - Visitados
 * @property {Game[]} e - En curso
 * @property {Game[]} p - Próximos
 * @property {Array<{id: number, _ts: number}>} deleted - Historial de borrados
 */

/**
 * @typedef {Object} MergeResult
 * @property {TabData} merged - Datos mergeados
 * @property {boolean} hasChanges - Si hubo cambios
 */

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GIST_FILENAME = 'myGames.json';
const GIST_API_BASE = 'https://api.github.com/gists';
const GIST_CFG_KEY = 'mis-listas-gist-config';

// ═══════════════════════════════════════════════════════════════════
// GistSync - Cliente de Gist
// ═══════════════════════════════════════════════════════════════════

/**
 * Cliente para interactuar con GitHub Gist API
 * Maneja autenticación, lectura, escritura y eliminación de Gists
 */
export const GistSync = {
    /**
     * Carga configuración de Gist del localStorage
     * @returns {GistConfig | null} Configuración almacenada o null
     */
    getCfg() {
        try {
            const raw = localStorage.getItem(GIST_CFG_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },
    
    /**
     * Guarda configuración de Gist en localStorage
     * @param {GistConfig} cfg - Configuración a guardar
     * @returns {void}
     */
    saveCfg(cfg) {
        localStorage.setItem(GIST_CFG_KEY, JSON.stringify(cfg));
    },
    
    /**
     * Limpia configuración de Gist del localStorage
     */
    clearCfg() {
        localStorage.removeItem(GIST_CFG_KEY);
    },
    
    /**
     * Obtiene datos del usuario autenticado en GitHub
     * @param {string} token - Token de autenticación GitHub
     * @returns {Promise<Object>} Datos del usuario
     * @throws {Error} Si la autenticación falla
     */
    async whoami(token) {
        const res = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.statusText}`);
        return res.json();
    },
    
    /**
     * Crea un nuevo Gist con datos iniciales
     * @param {string} token - Token de autenticación GitHub
     * @returns {Promise<{gistId: string, etag: (string|null)}>} ID y etag del Gist creado
     * @throws {Error} Si la creación falla
     */
    async create(token) {
        const res = await fetch(GIST_API_BASE, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                description: 'Mi Lista de Juegos - Sincronización',
                public: false,
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify({
                            c: [], v: [], e: [], p: [],
                            deleted: [],
                            updatedAt: Date.now()
                        })
                    }
                }
            })
        });
        if (!res.ok) throw new Error(`Create failed: ${res.statusText}`);
        const body = await res.json();
        return { gistId: body.id, etag: res.headers.get('etag') };
    },
    
    /**
     * Lee datos del Gist con soporte para ETag (caché)
     * @param {string} token - Token de autenticación GitHub
     * @param {string} gistId - ID del Gist
     * @param {(string|null)=} etag - ETag para caché condicional
     * @returns {Promise<GistReadResponse>} Datos del Gist o notModified
     * @throws {Error} Si la lectura falla o estructura es inválida
     */
    async read(token, gistId, etag = null) {
        const url = `${GIST_API_BASE}/${gistId}`;
        const headers = {
            'Authorization': `token ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (etag) headers['If-None-Match'] = etag;
        
        const res = await fetch(url, { headers });
        if (res.status === 304) return { notModified: true };
        if (!res.ok) throw new Error(`Read failed: ${res.statusText}`);
        
        const body = await res.json();
        const raw = body.files?.[GIST_FILENAME]?.content;
        if (!raw) throw new Error('Gist file not found');
        
        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            throw new Error(`Invalid JSON in Gist: ${err instanceof Error ? err.message : String(err)}`);
        }
        
        // Aplicar migración si es necesario
        if (typeof (window).migrateData === 'function') {
            data = (window).migrateData(data);
        }
        
        // Validar estructura
        if (!data.c || !data.v || !data.e || !data.p) {
            throw new Error('Invalid Gist structure: missing tabs');
        }
        
        return {
            data,
            etag: res.headers.get('etag'),
        };
    },
    
    /**
     * Escribe datos en Gist (PATCH)
     * @param {string} token - Token de autenticación GitHub
     * @param {string} gistId - ID del Gist
     * @param {TabData} data - Datos a escribir
     * @param {(string|null)=} _etag - ETag (no usado en PUT)
     * @returns {Promise<{etag: (string|null), updatedAt: number}>} ETag de la respuesta
     * @throws {Error} Si la escritura falla
     */
    async write(token, gistId, data, _etag = null) {
        const res = await fetch(`${GIST_API_BASE}/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(data)
                    }
                }
            })
        });
        if (!res.ok) throw new Error(`Write failed: ${res.statusText}`);
        const body = await res.json();
        return { etag: res.headers.get('etag'), updatedAt: body.updated_at || Date.now() };
    }
};

// ═══════════════════════════════════════════════════════════════════
// DataSync - Lógica de sincronización CRDT
// ═══════════════════════════════════════════════════════════════════

/**
 * Algoritmo de sincronización sin conflictos (CRDT)
 * Basado en timestamps para resolver conflictos
 */
export const DataSync = {
    /**
     * Realiza un merge inteligente entre datos locales y remotos.
     * 
     * Estrategia CRDT (Conflict-free Replicated Data Type):
     * 1. Nunca descartar datos: si existe en local o remoto, se incluye
     * 2. En caso de conflicto (existe en ambos), gana el timestamp más reciente
     * 3. Respetar deletion history (borrados marcados con _ts)
     * 4. Validar datos antes de usarlos
     * 
     * @param {TabData} localData - Datos locales
     * @param {number} localTs - Timestamp local (ms desde epoch)
     * @param {TabData} remoteData - Datos remotos
     * @param {number} remoteTs - Timestamp remoto (ms desde epoch)
     * @returns {MergeResult} Datos mergeados y si hubo cambios
     */
    mergeData(localData, localTs, remoteData, remoteTs) {
        if (!this.isValidData(localData)) {
            console.warn('DataSync: local data invalid, using remote');
            return {
                merged: this.isValidData(remoteData) ? remoteData : this.createEmptyData(),
                hasChanges: true
            };
        }
        if (!this.isValidData(remoteData)) {
            console.warn('DataSync: remote data invalid, using local');
            return { merged: localData, hasChanges: true };
        }
        
        // Mapas por ID para búsqueda rápida y deduplicación
        const lMap = new Map();
        const rMap = new Map();
        
        // 1. Mapear datos locales
        ['c', 'v', 'e', 'p'].forEach(tab => {
            (localData[tab] || []).forEach(g => {
                if (g && g.id) {
                    // Si el mismo ID existe múltiples veces localmente, quedarse con el más reciente
                    const existing = lMap.get(g.id);
                    const gTs = g._ts || localTs;
                    if (!existing || gTs > existing._ts) {
                        lMap.set(g.id, { ...g, _tab: tab, _ts: gTs });
                    }
                }
            });
        });
        
        // 2. Mapear datos remotos
        ['c', 'v', 'e', 'p'].forEach(tab => {
            (remoteData[tab] || []).forEach(g => {
                if (g && g.id) {
                    const existing = rMap.get(g.id);
                    const gTs = g._ts || remoteTs;
                    if (!existing || gTs > existing._ts) {
                        rMap.set(g.id, { ...g, _tab: tab, _ts: gTs });
                    }
                }
            });
        });
        
        // 3. Mapas de deletions
        const lDel = new Map((localData.deleted || []).map(d => [d.id, d._ts || localTs]));
        const rDel = new Map((remoteData.deleted || []).map(d => [d.id, d._ts || remoteTs]));
        
        // 4. Recolectar TODOS los IDs (locales, remotos, borrados)
        const allIds = new Set([...lMap.keys(), ...rMap.keys(), ...lDel.keys(), ...rDel.keys()]);
        
        const merged = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
        let hasChanges = false;
        
        // 5. Procesar cada ID
        allIds.forEach(id => {
            const lItem = lMap.get(id);
            const rItem = rMap.get(id);
            const lDelTs = lDel.get(id) || 0;
            const rDelTs = rDel.get(id) || 0;
            const maxDelTs = Math.max(lDelTs, rDelTs);
            
            const lItemTs = lItem ? lItem._ts : 0;
            const rItemTs = rItem ? rItem._ts : 0;
            const maxItemTs = Math.max(lItemTs, rItemTs);
            
            // Si fue borrado DESPUÉS de cualquier modificación, se queda borrado
            if (maxDelTs > 0 && maxDelTs > maxItemTs) {
                merged.deleted.push({ id, _ts: maxDelTs });
                if (lDelTs > 0 || rDelTs > 0) {
                    hasChanges = true;
                }
                return;
            }
            
            // Elegir el documento más reciente (NUNCA descartar)
            let winner = null;
            if (lItem && rItem) {
                // Existe en ambos: gana el timestamp más reciente
                winner = lItemTs >= rItemTs ? lItem : rItem;
                if (lItemTs !== rItemTs || JSON.stringify(lItem) !== JSON.stringify(rItem)) {
                    hasChanges = true;
                }
            } else if (lItem) {
                // Solo en local: SIEMPRE incluir (esto evita la pérdida de datos)
                winner = lItem;
                hasChanges = true;
            } else if (rItem) {
                // Solo en remoto: SIEMPRE incluir (esto evita la pérdida de datos)
                winner = rItem;
                hasChanges = true;
            }
            
            if (winner) {
                const tab = winner._tab;
                const item = { ...winner };
                delete item._tab;
                merged[tab].push(item);
            }
        });
        
        return { merged, hasChanges };
    },
    
    /**
     * Valida que los datos tengan la estructura esperada.
     * @param {Object} data - Datos a validar
     * @returns {boolean} True si la estructura es válida
     */
    isValidData(data) {
        return data &&
            typeof data === 'object' &&
            Array.isArray(data.c) &&
            Array.isArray(data.v) &&
            Array.isArray(data.e) &&
            Array.isArray(data.p) &&
            (!data.deleted || Array.isArray(data.deleted));
    },
    
    /**
     * Crea una estructura de datos vacía pero válida
     * @returns {TabData} Estructura vacía
     */
    createEmptyData() {
        return { c: [], v: [], e: [], p: [], deleted: [] };
    },
    
    /**
     * Normaliza datos: asegura que todos los juegos tienen campos requeridos,
     * SIN perder datos existentes.
     * @param {Object} data - Datos a normalizar
     * @returns {TabData} Datos normalizados
     */
    normalize(data) {
        if (!this.isValidData(data)) {
            return this.createEmptyData();
        }
        
        const normalized = {
            c: (data.c || []).map(g => {
                if (!g || typeof g !== 'object' || !g.id) return null;
                return { ...g, _ts: g._ts || Date.now() };
            }).filter(Boolean),
            v: (data.v || []).map(g => {
                if (!g || typeof g !== 'object' || !g.id) return null;
                return { ...g, _ts: g._ts || Date.now() };
            }).filter(Boolean),
            e: (data.e || []).map(g => {
                if (!g || typeof g !== 'object' || !g.id) return null;
                return { ...g, _ts: g._ts || Date.now() };
            }).filter(Boolean),
            p: (data.p || []).map(g => {
                if (!g || typeof g !== 'object' || !g.id) return null;
                return { ...g, _ts: g._ts || Date.now() };
            }).filter(Boolean),
            deleted: (data.deleted || []).filter(d => d && d.id),
            updatedAt: data.updatedAt || Date.now()
        };
        
        return normalized;
    },
    
    /**
     * Normaliza un juego individual, preservando todos los campos relevantes.
     * @param {Object} game - Juego a normalizar
     * @returns {(Object|null)} Juego normalizado o null si es inválido
     */
    normalizeGame(game) {
        if (!game || typeof game !== 'object') return null;
        if (!game.id) return null; // Descartar juegos sin ID
        
        const normalized = {
            id: game.id,
            name: game.name || '',
        };
        
        // Preservar todos los campos opcionales del juego
        if (game.platforms !== undefined) normalized.platforms = Array.isArray(game.platforms) ? game.platforms.filter(Boolean) : [];
        if (game.genres !== undefined) normalized.genres = Array.isArray(game.genres) ? game.genres.filter(Boolean) : [];
        if (game.strengths !== undefined) normalized.strengths = Array.isArray(game.strengths) ? game.strengths.filter(Boolean) : [];
        if (game.weaknesses !== undefined) normalized.weaknesses = Array.isArray(game.weaknesses) ? game.weaknesses.filter(Boolean) : [];
        if (game.reasons !== undefined) normalized.reasons = Array.isArray(game.reasons) ? game.reasons.filter(Boolean) : [];
        if (game.score !== undefined) normalized.score = game.score;
        if (game.hours !== undefined) normalized.hours = game.hours;
        if (game.years !== undefined) normalized.years = Array.isArray(game.years) ? game.years.filter(Boolean) : [];
        if (game.replayable !== undefined) normalized.replayable = Boolean(game.replayable);
        if (game.retry !== undefined) normalized.retry = Boolean(game.retry);
        if (game.review !== undefined) normalized.review = game.review || '';
        if (game.steamDeck !== undefined) normalized.steamDeck = Boolean(game.steamDeck);
        if (game._ts !== undefined) normalized._ts = game._ts;
        
        return normalized;
    },
    
    /**
     * Cuenta elementos en los datos.
     * @param {Object} data - Datos a contar
     * @returns {number} Total de juegos
     */
    countGames(data) {
        if (!this.isValidData(data)) return 0;
        return (data.c || []).length + (data.v || []).length + (data.e || []).length + (data.p || []).length;
    }
};

/* ═══════════════════════════════════════════════════════════════════
   API exportada
═══════════════════════════════════════════════════════════════════ */
// Módulos exportados como ES6 modules (ver main.ts)
