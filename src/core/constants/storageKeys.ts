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

// F1 — la paleta se queda en la de por defecto: 'on' (bloqueada) | ausente u 'off' (se pinta la elegida). Los
// temas son de quien tiene espacio social, y el estado social no se sabe hasta que contestan la sesión e
// IndexedDB; esta marca apunta la última respuesta para que el anti-flash acierte antes de saberlo. No borra la
// elección: si vuelve el social, vuelve su tema. Solo de este aparato. Lo lee también el anti-flash de
// `index.html`; mantener el literal en sincronía.
export const PALETTE_LOCK_KEY = 'mis-listas-palette-locked';

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

// F5 — FORMA del listado: 'list' (renglones) o 'grid' (mosaico de cajas). SOLO EN ESTE APARATO: se sincronizó
// por cuenta hasta el 20-09-2026, y era la única preferencia a la que seguirte le sentaba mal —en el móvil se
// pasea por la colección en mosaico y en el monitor se busca un título en renglones—, así que elegir en uno
// reordenaba el otro. No la lee `theme-init.js`: la forma la decide React al montar el listado, y antes de eso
// no hay ninguna fila que pintar.
export const LIST_SHAPE_KEY = 'mis-listas-list-shape';
/** Carátulas de los juegos. Ausente = APAGADA: nadie descarga nada sin haberlo pedido. */
export const COVERS_KEY = 'mis-listas-covers';
/** Pestaña de la lista de deseos. Ausente = VISIBLE: es una lista más, y se esconde solo si se pide. */
export const WISHLIST_KEY = 'mis-listas-wishlist';

// TAMAÑO de los cuadros del mosaico: 'sm' | 'md' (por defecto) | 'lg'. Cuánto ocupa cada cuadro es cuestión de
// gusto y de PANTALLA —ocho por fila en un monitor, dos en un teléfono—, así que vive en este aparato y no en
// la cuenta (20-09-2026, con la forma del listado: ver LIST_SHAPE_KEY).
export const GRID_SIZE_KEY = 'mis-listas-grid-size';

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

// Invitación a instalar la app en la pantalla de inicio. Valor: 'off' = ya se dijo «ahora no» (o ya se instaló)
// y no se vuelve a ofrecer en este navegador; ausente = se ofrecerá cuando el navegador dé la oportunidad.
// Es de dispositivo por naturaleza: instalar es algo que se hace en ESTE aparato, no en la cuenta.
export const INSTALL_HINT_KEY = 'mis-listas-install-hint';

// Import — preferencia "qué datos traer" (plataformas/géneros/horas/nota) por grupo: juegos nuevos y juegos que
// ya están en tus listas. JSON con la forma de `ImportFieldPrefs`. Local, no se sincroniza (como la bandeja).
export const IMPORT_FIELDS_KEY = 'mis-listas-import-fields';

// Compartir reseñas — marca de que YA se leyó y aceptó el aviso de publicación (valor: la versión legal
// aceptada). Publicar una reseña la saca de tus Gists y la pone en internet, así que el aviso se enseña ENTERO
// la primera vez; luego basta con el resumen. Se guarda la versión y no un simple `true` a propósito: si cambia
// lo que se publica, `LEGAL_VERSION` cambia y el aviso vuelve a mostrarse completo.
export const SHARE_CONSENT_KEY = 'mis-listas-share-consent';

// La cápsula del aviso legal (condiciones nuevas por aceptar) ya se enseñó para esta versión: valor, la
// `LEGAL_VERSION` de entonces. Una vez por versión y navegador, como el aviso del resumen del año.
export const LEGAL_NOTICE_TOLD_KEY = 'mis-listas-legal-notice-told';

// Ya se quitaron de `LocalMeta` las claves retiradas (`removeLegacyLocalMetaKeys`): valor '1'. Si un día se retira
// otra, se cambia el valor esperado para que los dispositivos ya limpios vuelvan a pasar una vez.
export const LEGACY_META_CLEANUP_KEY = 'mis-listas-legacy-meta-cleanup';

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

// Logros — LO QUE YA SE TE HA CONTADO. Mismo formato que la marca de agua y, a propósito, OTRA clave.
//
// Son dos preguntas distintas y compartir almacén las confundía: la marca de agua responde «¿lo tenías?» y la
// escriben los DOS evaluadores (`useAchievements` en el hub y en el panel, `useAchievementNotice` al arrancar),
// mientras que esta responde «¿ya te lo anuncié?» y la escribe solo el aviso. Con una sola clave, cualquiera de
// los dos podía dar por contado un logro que nadie había anunciado —o al revés, dejar sin memoria a un escalón
// que sí se anunció—, y de ahí salían las medallas viejas repitiéndose sesión tras sesión.
//
// SE SIEMBRA DESDE LA MARCA DE AGUA la primera vez que se lee: lo que ya estaba conseguido antes de que esta
// clave existiera se da por contado, que es justo lo que evita soltarle el historial entero de golpe a quien
// lleva meses usando la app.
export const ACHIEVEMENTS_TOLD_KEY = 'mis-listas-achievements-told';

// Logros — LA FECHA FIJADA de cada logro conseguido (ver `freezeDates`). OTRA clave y no la marca de agua, aunque
// las dos hablen de lo conseguido: la marca de agua se escribe como `id:1`, y una pestaña con la versión anterior
// que la reescribiera borraría las fechas sin enterarse. Con clave propia, el código viejo ni la ve.
export const ACHIEVEMENTS_DATES_KEY = 'mis-listas-achievements-dates';

// Logros — el ÚLTIMO ESPEJO PUBLICADO en este dispositivo, para no reescribir en Firestore una cadena idéntica.
//
// Es una caché de escritura, no un dato: si se pierde (navegador limpio, otro dispositivo) lo único que pasa es
// que se publica una vez de más, y publicar lo mismo dos veces no rompe nada. Por eso vive en localStorage y no
// viaja a ningún canal.
//
// Va con el uid dentro de la clave: en un navegador compartido, dos cuentas tienen espejos distintos y una clave
// única haría que la segunda creyera publicado el de la primera —y se quedaría sin publicar el suyo.
export const achievementsPublishedKey = (uid: string): string => `mis-listas-achievements-published-${uid}`;

// Resumen del año — el último año cuyo «ya lo he visto» se publicó en el perfil (`profiles/{uid}.yearSummary`).
// Caché de escritura como la de arriba, y por la misma razón con el uid dentro: perderla solo cuesta publicar otra
// vez el mismo año, que no cambia nada salvo la fecha de la tarjeta.
export const yearSummaryPublishedKey = (uid: string): string => `mis-listas-year-summary-published-${uid}`;

// Resumen del año — el último año del que ya se dio el aviso propio del 15 de diciembre. Uno por año y navegador:
// es un aviso, no un dato, y verlo dos veces en dos dispositivos no hace daño.
export const YEAR_SUMMARY_TOLD_KEY = 'mis-listas-year-summary-told';

// Logros — sello de la primera vez que se usó la ruleta. Es el ÚNICO dato de todo el evolutivo que hay que
// registrar en vez de derivar: `core/roulette/roulette.ts` es una función pura —tira, devuelve un juego y no
// persiste ni un byte—, así que sin esto no hay forma de saber que alguien la probó. No sube y no se publica
// (los «primeros pasos» nunca lo hacen).
export const ROULETTE_USED_KEY = 'mis-listas-roulette-used';

// Logros — sello de la primera vez que se aplicó un tema que no es el de casa. Hace falta por lo mismo que el de la
// ruleta: «Ajustes de vídeo» miraba solo el tema activo en el instante de evaluar, y quien probaba uno y volvía al
// de casa sin pasar por la pantalla de logros no lo conseguía nunca. No sube y no se publica.
export const THEME_CHANGED_KEY = 'mis-listas-theme-changed';

// Borrador de la papeleta de premios: lo votado hasta ahora, para no perderlo al recargar o al salir a mirar algo
// a las listas. Se borra al enviar.
//
// PREFIJADA COMO TODAS LAS DEMÁS. La aplicación de origen guardaba esto en `votingProgress`, a secas, igual que
// guardaba el tema en `appTheme` y el idioma en `appLanguage`: tres claves genéricas que aquí habrían convivido
// con las de la casa —y `appTheme` habría sido una SEGUNDA fuente de tema, compitiendo con la de `theme-init.js`.
export const PREMIOS_DRAFT_KEY = 'mis-listas-premios-borrador';

/**
 * ¿Se ofrece la sección de premios? Lo que se guarda aquí es la ÚLTIMA RESPUESTA conocida, para poder pintar la
 * entrada —el punto de Ajustes, el botón del hub— sin esperar a la red y, sobre todo, SIN CARGAR FIREBASE.
 *
 * Es la diferencia entre una entrada estacional y meter el SDK (172 kB) en el arranque de todo el mundo, incluido
 * quien no vota nunca. El dato se refresca en segundo plano cuando ya hay sesión, que es cuando el SDK se carga
 * de todas formas. Ver `usePremiosVisible`.
 */
export const PREMIOS_VISIBLE_KEY = 'mis-listas-premios-visible';

/**
 * La invitación al resto de la aplicación que sale al enviar la papeleta y en el histórico, a quien no tiene lo
 * social: la edición en la que se dijo «Ahora no» o se aceptó, en cualquiera de los dos sitios. Por navegador, como
 * una preferencia de vista: perderla solo hace que se vuelva a ofrecer una vez.
 */
export const PREMIOS_JOIN_INVITE_KEY = 'mis-listas-premios-invitacion';

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

// El ARMAZÓN de la actividad social — ¿podía publicar esta persona la última vez que entró?
//
// Es una PISTA de pintado, no un permiso: sirve para que el esqueleto de la actividad reserve (o no) el hueco del
// compositor de publicaciones, que solo existe a partir del rango plata. El rango no se sabe hasta que el hub
// resuelve el perfil, o sea, justo después de la espera que el esqueleto está cubriendo: sin esta pista había que
// elegir entre dos saltos, hacia abajo para quien sí publica o hacia arriba para quien no.
//
// Quien decide de verdad si se puede publicar sigue siendo el rango, en el hub y en el repositorio de publicación.
// Equivocarse aquí solo cuesta un rectángulo gris de más o de menos mientras carga, así que es de dispositivo y no
// se replica a la nube.
export const SOCIAL_CAN_POST_KEY = 'mis-listas-social-can-post';

// PRIMEROS PASOS — por dónde va la guía de bienvenida en ESTE dispositivo: si está ofrecida, en curso, plegada o
// terminada, en qué misión y paso, y qué misiones se dieron por hechas o se saltaron. JSON con la forma de
// `TourState` (ver `core/onboarding/tourState.ts`), con versión dentro para poder cambiar la forma sin arrastrar
// estados viejos.
//
// Es de dispositivo y no se replica a la nube a propósito: la guía se ofrece a quien llega SIN NADA a este
// navegador, y subirla obligaría a un campo nuevo en `publicConfig` —con sus reglas desplegadas— para recordar
// algo que cuesta un «Ahora no» repetir en otro aparato. Que NO haya clave es el caso normal de quien ya usaba la
// aplicación: para esa persona la guía no existe hasta que la pide desde Ajustes › Datos.
export const ONBOARDING_KEY = 'mis-listas-onboarding';

/**
 * COMPARTIR SIN SERVICIO (docs/plan-degradacion-servicios.md, fase 3). Hasta cuándo no se vuelve a preguntar a
 * `/api/share` tras una respuesta de «no disponible», y la última lista de enlaces de cada usuario, para que Ajustes
 * la enseñe en solo lectura mientras tanto. La segunda es dato personal: la borra el borrado de cuenta.
 */
export const SHARE_DOWN_UNTIL_KEY = 'mis-listas-share-down-until';
export const shareLastMineKey = (uid: string): string => `mis-listas-share-last-mine-${uid}`;
export const SHARE_LAST_MINE_PREFIX = 'mis-listas-share-last-mine-';

/** Hasta cuándo no se vuelve a lanzar el relleno de carátulas tras toparse con el servidor sin atender (fase 4). */
export const COVER_BACKFILL_PAUSE_KEY = 'mis-listas-cover-backfill-pause-until';

/** Copia local de la escala de nota (estrellas / 0–100) de cada usuario, por si Firestore no responde (fase 5). */
export const SCORE_SCALE_PREFIX = 'mis-listas-score-scale-';
export const scoreScaleKey = (uid: string): string => `${SCORE_SCALE_PREFIX}${uid}`;

/**
 * Copia mínima del perfil propio de cada usuario (rango, pseudónimo, nick, foto…), para cuando Firestore no atiende
 * (fase 5). Dato personal: la borra el borrado de cuenta.
 */
export const OWN_PROFILE_PREFIX = 'mis-listas-own-profile-';
export const ownProfileKey = (uid: string): string => `${OWN_PROFILE_PREFIX}${uid}`;

/** El último aviso del administrador leído bien, para enseñarlo si `/api/announcement` no responde (fase 5). */
export const ANNOUNCEMENT_LAST_KEY = 'mis-listas-announcement-last';

/**
 * La última edición de Premios leída bien (calendario y categorías, públicos) y la papeleta propia de cada cuenta
 * (dato personal: la borra el borrado de cuenta), para cuando Firestore no atiende (fase 5).
 */
export const PREMIOS_EDITION_COPY_KEY = 'mis-listas-premios-edition-copy';
export const PREMIOS_BALLOT_COPY_PREFIX = 'mis-listas-premios-ballot-copy-';
export const premiosBallotCopyKey = (uid: string): string => `${PREMIOS_BALLOT_COPY_PREFIX}${uid}`;


/**
 * Cuándo se pulsó «salir» de la sesión de Google por última vez, en cualquier pestaña. Solo sirve para no registrar
 * como pérdida de sesión la que se cerró a propósito (ver `trackSessionLoss` en `firebaseAuthRepository`).
 */
export const AUTH_SIGNED_OUT_AT_KEY = 'mis-listas-auth-signed-out-at';
