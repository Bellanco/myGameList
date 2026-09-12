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

// F4 — de qué listas quiero VER los mensajes de actividad («comenzó», «finalizó», «abandonó», «añadió») en mi feed.
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

// Logros — marca de agua (§5.5 del plan) y lo que su dueño ya ha visto (§7.3), en el formato compacto
// `id.nivel,id.nivel`. Es estado de DISPOSITIVO, como `friendshipHealedForGist`, y por eso no sube a ningún
// canal. Vive en localStorage y no en `LocalMeta` MIENTRAS la publicación esté apagada
// (`ENABLE_ACHIEVEMENTS_PUBLISH`): en cuanto el espejo se escriba, la marca de agua tiene que viajar junto a la
// lógica de publicación y se muda allí, que es donde el plan la sitúa.
//
// La marca de agua es lo que impide que un logro se RETIRE: borras cinco duplicados, corriges unos años mal
// puestos, y una medalla que llevaba meses ahí se esfumaría. Lo conseguido no se devuelve.
//
// ⚑ EL SUFIJO `-2` MARCA EL CAMBIO DE CATÁLOGO. Al pasar a un logro por escalón, los `id` dejaron de ser
// `completados` para ser `completados-50`: la marca de agua anterior habla de logros que ya no existen y se
// quedaría dentro para siempre, engordando una cadena que nadie lee. Con clave nueva, la vieja se abandona y el
// catálogo se recalcula entero en el primer render — que es exactamente lo que hace la retroactividad (§7.3).
export const ACHIEVEMENTS_PEAK_KEY = 'mis-listas-achievements-peak-2';

// Logros — el ÚLTIMO ESPEJO PUBLICADO en este dispositivo, para no reescribir en Firestore una cadena idéntica.
//
// Es una caché de escritura, no un dato: si se pierde (navegador limpio, otro dispositivo) lo único que pasa es
// que se publica una vez de más, y publicar lo mismo dos veces no rompe nada. Por eso vive en localStorage y no
// viaja a ningún canal.
//
// Va con el uid dentro de la clave: en un navegador compartido, dos cuentas tienen espejos distintos y una clave
// única haría que la segunda creyera publicado el de la primera —y se quedaría sin publicar el suyo.
export const achievementsPublishedKey = (uid: string): string => `mis-listas-achievements-published-${uid}`;

// Logros — sello de la primera vez que se usó la ruleta. Es el ÚNICO dato de todo el evolutivo que hay que
// registrar en vez de derivar: `core/roulette/roulette.ts` es una función pura —tira, devuelve un juego y no
// persiste ni un byte—, así que sin esto no hay forma de saber que alguien la probó. No sube y no se publica
// (los «primeros pasos» nunca lo hacen).
export const ROULETTE_USED_KEY = 'mis-listas-roulette-used';

// Logros — LOS CONTADORES QUE NO SALEN DE LA BIBLIOTECA (amistades, semanas con publicación, alta del perfil y
// si hay sincronización), recordados del último paso por el hub.
//
// EXISTE PORQUE LA MISMA CIFRA SALÍA DISTINTA EN DOS PANTALLAS. Solo el hub conoce esos cuatro números, así que
// el panel evaluaba con ceros: sus logros no se conseguían —numerador— y, al no conseguirse, tampoco abrían sus
// escalones —denominador—. Con la misma biblioteca, `/logros` decía «36/88» y la ficha del hub «42/94»; y en
// cuanto se pasaba por el hub, la marca de agua guardaba lo conseguido y el panel ya no lo soltaba: la cifra
// «cambiaba sola» y se quedaba.
//
// Se guarda en el dispositivo, no se publica y no viaja: son datos propios que el hub ya tenía a la vista.
export const ACHIEVEMENTS_SOCIAL_KEY = 'mis-listas-achievements-social';

// Avisos del administrador — lo que ESTE dispositivo ya sabe del aviso en curso: a qué campaña se refiere,
// cuántas veces se ha pintado, cuándo fue la última y si se pulsó el enlace. JSON con la forma de
// `AnnouncementSeen` (ver `core/announcement/announcement.ts`).
//
// ES DE DISPOSITIVO, como la marca de agua de los logros, y por el mismo motivo: la alternativa era una
// escritura en Firestore por usuario y por aviso solo para recordar que ya se le dijo. Lo que se paga a cambio
// es que quien usa móvil y ordenador recibe el aviso en los dos; lo que se gana es que quien NO tiene cuenta
// también lo recibe (el documento se lee sin sesión).
//
// La cuenta cuelga del `id` de la campaña: publicar un aviso con `id` nuevo se lo vuelve a enseñar a todo el
// mundo, aunque el anterior ya estuviera pulsado. Es lo que hace el botón «Volver a publicar» del panel.
export const ANNOUNCEMENT_SEEN_KEY = 'mis-listas-announcement-seen';
