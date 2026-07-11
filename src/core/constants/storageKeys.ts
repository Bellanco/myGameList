export const STORAGE_KEY = 'mis-listas-v12-unified';

// Versión del esquema del estado local persistido (localStorage + IndexedDB `appState`). Se estampa al
// guardar; un estado sin esta marca (o con una menor) se considera "viejo" y se auto-actualiza al cargar.
export const LOCAL_SCHEMA_VERSION = 1;

export const GIST_CFG_KEY = 'mis-listas-gist-config';
export const SOCIAL_GIST_CFG_KEY = 'mis-listas-social-gist-config';

// F1 — preferencia de tema visual. Valores: 'dark' | 'light' | 'auto'. Solo presentación (no se sincroniza).
// Lo lee también `public/theme-init.js` ANTES del primer render para evitar el flash de tema; mantener el
// literal de la clave en sincronía con ese fichero.
export const THEME_KEY = 'mis-listas-theme';

// F1 — paleta de color activa (identidad visual). Valores: ver `PaletteId` en `core/constants/palettes.ts`.
// Solo presentación (no se sincroniza). Lo lee también `public/theme-init.js` antes del primer render;
// mantener el literal de la clave en sincronía con ese fichero.
export const PALETTE_KEY = 'mis-listas-palette';
