// @ts-nocheck
/**
 * CONSTANTS.TS — Literales y configuraciones globales
 * Centraliza todos los textos, labels y mensajes de la aplicación
 */

/* ═══════════════════════════════════════════════════════════════════
   TAB: COMPLETADOS (c)
═══════════════════════════════════════════════════════════════════ */
export const TAB_C_LABELS = {
    filterBoolLabel: '¿Volver a jugar?',
    filterBoolField: 'replayable',
    columns: {
        name: { label: 'Juego' },
        years: { label: 'Año' },
        platforms: { label: 'Plataformas' },
        genres: { label: 'Géneros' },
        strengths: { label: 'Puntos fuertes' },
        weaknesses: { label: 'Puntos débiles' },
        score: { label: 'Punt.' },
        replayable: { label: 'Rejug.' },
    },
    details: {
        years: 'Años en los que se completó',
        hours: 'Tiempo jugado',
        strengths: 'Puntos fuertes',
        weaknesses: 'Puntos débiles',
        score: 'Puntuación',
        replayable: 'Rejugabilidad',
    },
    form: {
        boolLabel: '¿Volver a jugar?',
        boolField: 'rejugabilidad',
    },
    boolTooltips: {
        active: 'Rejugable',
        inactive: 'No rejugable',
    },
    modal: {
        new: 'Nuevo juego completado',
        prefill: 'Pasar a completados',
        edit: 'Editar juego',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   TAB: VISITADOS (v)
═══════════════════════════════════════════════════════════════════ */
export const TAB_V_LABELS = {
    filterBoolLabel: '¿Dar otra oportunidad?',
    filterBoolField: 'retry',
    columns: {
        name: { label: 'Juego' },
        platforms: { label: 'Plataformas' },
        genres: { label: 'Géneros' },
        strengths: { label: 'Puntos fuertes' },
        reasons: { label: 'Puntos débiles' },
        retry: { label: 'Dar otra oportunidad' },
    },
    details: {
        strengths: 'Puntos fuertes',
        reasons: 'Puntos débiles',
        retry: 'Dar otra oportunidad',
    },
    boolTooltips: {
        active: 'Dar una oportunidad',
        inactive: 'No merece una nueva oportunidad',
    },
    actions: [
        { label: 'Pasar a completados', btnCls: 'btn-complete', target: 'c' },
        { label: 'Pasar a en curso', btnCls: 'btn-playing', target: 'e' },
    ],
    modal: {
        new: 'Nuevo juego visitado',
        prefill: 'Pasar a visitados',
        edit: 'Editar juego',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   TAB: EN CURSO (e)
═══════════════════════════════════════════════════════════════════ */
export const TAB_E_LABELS = {
    filterBool: null,
    columns: {
        name: { label: 'Juego' },
        platforms: { label: 'Plataformas' },
        genres: { label: 'Géneros' },
        strengths: { label: 'Puntos fuertes' },
        weaknesses: { label: 'Puntos débiles' },
    },
    details: {
        strengths: 'Puntos fuertes',
        weaknesses: 'Puntos débiles',
    },
    actions: [
        { label: 'Pasar a completados', btnCls: 'btn-complete', target: 'c' },
        { label: 'Pasar a abandonados', btnCls: 'btn-abandoned', target: 'v' },
    ],
    modal: {
        new: 'Nuevo juego en curso',
        prefill: 'Pasar a en curso',
        edit: 'Editar juego',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   TAB: PRÓXIMOS (p)
═══════════════════════════════════════════════════════════════════ */
export const TAB_P_LABELS = {
    filterBool: null,
    columns: {
        name: { label: 'Juego' },
        platforms: { label: 'Plataformas' },
        genres: { label: 'Géneros' },
        score: { label: 'Interés' },
    },
    details: {
        score: { label: 'Interés', empty: 'Sin valorar' },
    },
    actions: [
        { label: 'Pasar a en curso', btnCls: 'btn-playing', target: 'e' },
    ],
    modal: {
        new: 'Nuevo juego próximo',
        prefill: 'Pasar a próximos',
        edit: 'Editar juego',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   MENSAJES Y ALERTAS
═══════════════════════════════════════════════════════════════════ */
export const MESSAGES = {
    validation: {
        yearInvalid: 'Por favor, ingresa un año válido (4 dígitos)',
        yearFuture: 'El año no puede ser en el futuro',
        required: 'Este campo es obligatorio',
    },
    success: {
        saved: 'Datos guardados correctamente',
        deleted: 'Elemento eliminado',
        synced: 'Sincronización completada',
    },
    error: {
        loadingData: 'Error al cargar datos',
        savingData: 'Error al guardar datos',
        syncFailed: 'Error en la sincronización',
        networkError: 'Error de conexión',
    },
    status: {
        loading: 'Cargando...',
        syncing: 'Sincronizando...',
        offline: 'Modo sin conexión',
        online: 'En línea',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   TEXTOS DE ADMIN
═══════════════════════════════════════════════════════════════════ */
export const ADMIN_LABELS = {
    tabs: {
        genres: 'Géneros',
        platforms: 'Plataformas',
        years: 'Años',
        strengths: 'Puntos fuertes',
        weaknesses: 'Puntos débiles',
        reasons: 'Razones',
    },
    actions: {
        addTag: 'Agregar',
        deleteTag: 'Eliminar',
        edit: 'Editar',
        save: 'Guardar',
        cancel: 'Cancelar',
    },
    dialogs: {
        title: 'Administrar etiquetas',
        confirmDelete: '¿Estás seguro de que quieres eliminar esto?',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   CLASES CSS COMUNES
═══════════════════════════════════════════════════════════════════ */
export const CSS_CLASSES = {
    chip: {
        platform: 'chip-plat',
        genre: 'chip-genre',
        year: 'chip-generic',
        strength: 'chip-pf',
        weakness: 'chip-pd',
        reason: 'chip-pd',
    },
    column: {
        strong: 'col-strong',
        weak: 'col-weak',
        platform: 'col-plat',
    },
    detail: {
        strong: 'detail-strong',
        weak: 'detail-weak',
    },
    button: {
        complete: 'btn-complete',
        playing: 'btn-playing',
        abandoned: 'btn-abandoned',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE UI
═══════════════════════════════════════════════════════════════════ */
export const UI_CONFIG = {
    breakpoints: {
        tableCompact: 1100,
        filtersCompact: 1400,
    },
    debounceMs: {
        gist: 1800,
        search: 220,
    },
    hoursRanges: [
        { key: '0-5', label: 'Menos de 5 horas', shortLabel: 'Menos de 5h', check: h => h > 0 && h <= 5 },
        { key: '5-10', label: 'De 5 a 10 horas', shortLabel: '5 - 10h', check: h => h > 5 && h <= 10 },
        { key: '10-20', label: 'De 10 a 20 horas', shortLabel: '10 - 20h', check: h => h > 10 && h <= 20 },
        { key: '20-40', label: 'De 20 a 40 horas', shortLabel: '20 - 40h', check: h => h > 20 && h <= 40 },
        { key: '40-80', label: 'De 40 a 80 horas', shortLabel: '40 - 80h', check: h => h > 40 && h <= 80 },
        { key: '80-150', label: 'De 80 a 150 horas', shortLabel: '80 - 150h', check: h => h > 80 && h <= 150 },
        { key: '150+', label: 'Más de 150 horas', shortLabel: 'Más de 150h', check: h => h > 150 },
    ],
};

/* ═══════════════════════════════════════════════════════════════════
   CLAVES DE ALMACENAMIENTO
═══════════════════════════════════════════════════════════════════ */
export const DATA_KEYS = {
    storage: {
        key: 'mis-listas-v12-unified',
        legacyKeys: [
            'mis-listas-v11-unified',
            'mis-listas-v10-unified',
            'mis-listas-v10-separated',
            'mis-listas-v9-unified',
            'mis-listas-v9-separated',
            'mis-listas-v8-unified',
            'mis-listas-v8-separated',
        ],
    },
};
