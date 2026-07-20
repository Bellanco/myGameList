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

// F1 — preferencia de CAJA del texto de interfaz (titulares, etiquetas, botones, nombres, chips…).
// Valores: 'on' (todo en mayúsculas) | 'off' (caja normal del tema, por defecto). Se aplica vía
// `data-uppercase="on"` en <html> y se sincroniza por cuenta. Lo lee también `public/theme-init.js`
// antes del primer render (anti-flash); mantener el literal de la clave en sincronía con ese fichero.
export const UPPERCASE_KEY = 'mis-listas-uppercase';

// F1 — visibilidad del botón "Steam Deck" de la barra de filtros. Valores: 'on' (visible, por defecto) |
// 'off' (oculto). Se sincroniza por cuenta (publicConfig.showSteamButton). No lo lee `theme-init.js`
// (no necesita anti-flash: solo condiciona un botón de la toolbar, no la pintura inicial del tema).
export const STEAM_BUTTON_KEY = 'mis-listas-steam-button';

// F1 — efectos visuales ANIMADOS de los temas (barridos, glitch, parpadeo CRT, deriva de texturas, estrellas
// fugaces…). Valores: 'on' (activados, por defecto) | 'off' (desactivados). Se aplica vía `data-effects="on"`
// en <html> (los efectos CSS cuelgan de ese atributo) y se sincroniza por cuenta (publicConfig.effects). No lo
// lee `theme-init.js`: los efectos son decorativos y, al colgar de `data-effects="on"`, en ausencia del atributo
// (antes de montar) no se pintan → quien los desactiva nunca ve un "flash" de efectos al cargar.
export const EFFECTS_KEY = 'mis-listas-effects';
