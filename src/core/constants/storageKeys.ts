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

// F1 — visibilidad del botón "Steam Deck" de la barra de filtros. Valores: 'on' (visible) | 'off' (oculto).
// Es opt-in: la ausencia de la clave = oculto (por defecto), así que solo se ve tras activarlo en la cuenta;
// quien ya eligió conserva su valor. Se sincroniza por cuenta (publicConfig.showSteamButton). No lo lee `theme-init.js`
// (no necesita anti-flash: solo condiciona un botón de la toolbar, no la pintura inicial del tema).
export const STEAM_BUTTON_KEY = 'mis-listas-steam-button';

// F1 — efectos visuales ANIMADOS de los temas (barridos, glitch, parpadeo CRT, deriva de texturas, estrellas
// fugaces…). Valores: 'on' (activados, por defecto) | 'off' (desactivados). Se aplica vía `data-effects="on"`
// en <html> (los efectos CSS cuelgan de ese atributo) y se sincroniza por cuenta (publicConfig.effects). No lo
// lee `theme-init.js`: los efectos son decorativos y, al colgar de `data-effects="on"`, en ausencia del atributo
// (antes de montar) no se pintan → quien los desactiva nunca ve un "flash" de efectos al cargar.
export const EFFECTS_KEY = 'mis-listas-effects';

// F4 — de qué listas quiero VER los mensajes de actividad («empezó», «terminó», «dejó», «apuntó») en mi feed.
// Valor: las letras de las listas visibles en orden canónico, p. ej. 'cevp' (todas, por defecto) o '' (ninguna).
//
// Es una cadena y no una lista a propósito: `PreferenceStore.get()` alimenta un `useSyncExternalStore`, que
// compara por `Object.is`, y devolver un array nuevo en cada lectura provocaría un bucle de renders.
//
// Y es un ajuste de LECTURA, no de privacidad: no decide qué se publica —eso lo deciden las listas ocultas del
// perfil—, solo qué ve su dueño. Por eso se sincroniza por cuenta (publicConfig.feedMoveTabs), para que le siga
// entre dispositivos, y no viaja en el gist social, que es un canal público donde no tiene nada que hacer.
export const FEED_MOVE_TABS_KEY = 'mis-listas-feed-move-tabs';

// L2 — consentimiento de la analítica (GA4). Valores: 'granted' | 'denied'; ausente = aún no decidido (se
// muestra el banner). Es una preferencia POR DISPOSITIVO/NAVEGADOR, no por cuenta: el consentimiento para
// almacenar identificadores lo da quien usa este navegador, así que no se sincroniza a Firestore.
export const ANALYTICS_CONSENT_KEY = 'mis-listas-analytics-consent';

// Import — preferencia "qué datos traer" (plataformas/géneros/horas/nota) por grupo: juegos nuevos y juegos que
// ya están en tus listas. JSON con la forma de `ImportFieldPrefs`. Local, no se sincroniza (como la bandeja).
export const IMPORT_FIELDS_KEY = 'mis-listas-import-fields';

// Compartir reseñas — marca de que YA se leyó y aceptó el aviso de publicación (valor: la versión legal
// aceptada). Publicar una reseña la saca de tus Gists y la pone en internet, así que el aviso se enseña ENTERO
// la primera vez; luego basta con el resumen. Se guarda la versión y no un simple `true` a propósito: si cambia
// lo que se publica, `LEGAL_VERSION` cambia y el aviso vuelve a mostrarse completo.
export const SHARE_CONSENT_KEY = 'mis-listas-share-consent';
