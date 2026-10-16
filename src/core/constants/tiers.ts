/**
 * Rango ("tier") del perfil. Lo asigna EL ADMINISTRADOR desde `/admin`; el usuario no puede tocarlo (ver la
 * función `profileTierNotSelfAssigned` en firestore.rules, que solo le deja conservar el que tenga).
 *
 * `mithril` está reservado a la cuenta del administrador: el panel solo ofrece ese valor en la fila del propio
 * admin. Es una decisión de producto, no una barrera de seguridad — quien manda ya puede escribir cualquier tier
 * en cualquier perfil, y no tiene sentido protegerse de uno mismo.
 *
 * EL RANGO NO HACE ADMINISTRADOR A NADIE. Las excepciones de la administración (ver fotos y listas ocultas, el panel
 * completo de un amigo, el cupo de carátulas) las decide el claim `admin` del token (`hasAdminClaim`), en el
 * cliente, en las Functions y en las reglas. Mithril solo aporta lo que dicen sus filas de las tablas de abajo.
 */
/**
 * LOS RANGOS, CON NOMBRE. Para referirse a uno concreto en el código se usa esto (`PROFILE_TIER.gold`) y no la
 * cadena escrita a mano: una errata en `'gold'` compila si el sitio acepta un `string`, y con la constante no.
 * El valor es el que se guarda en Firestore (`profiles/{uid}.tier`), así que NO se renombra: cambiarlo dejaría
 * sin rango a todos los perfiles que ya lo tienen.
 *
 * `firestore.rules` repite estos nombres a mano porque su lenguaje no puede importar nada: si se añade un rango,
 * hay que añadirlo también allí (ver `profileTierNotSelfAssigned` y los topes por rango).
 */
export const PROFILE_TIER = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  mithril: 'mithril',
} as const;

export type ProfileTier = (typeof PROFILE_TIER)[keyof typeof PROFILE_TIER];

/** Todos los rangos, de MENOR a MAYOR. El orden importa: lo recorren el panel y las comprobaciones de «más alto». */
export const PROFILE_TIERS = [PROFILE_TIER.bronze, PROFILE_TIER.silver, PROFILE_TIER.gold, PROFILE_TIER.mithril] as const;

/** Rango de quien no tiene ninguno asignado: TODO perfil es bronce mientras el admin no diga otra cosa. */
export const DEFAULT_PROFILE_TIER: ProfileTier = PROFILE_TIER.bronze;

/** Rango reservado a la cuenta del administrador. */
export const ADMIN_ONLY_TIER: ProfileTier = PROFILE_TIER.mithril;

/**
 * QUÉ HACE EL RANGO: cuánto vale la caché del directorio social hidratado, es decir cada cuánto se vuelven a leer
 * el directorio y el gist social de cada amigo (hasta ~50) para refrescar el feed y las reseñas.
 *
 * Manda el rango de QUIEN MIRA, no el del perfil mirado: las lecturas de gists ajenos van con el token del
 * espectador y cuentan contra SU rate-limit, así que es su privilegio y su coste.
 *
 * EL SUELO DE MITHRIL ESTÁ ATADO AL RATE-LIMIT DE GITHUB, no al gusto. Cada hidratación real cuesta 1 consulta a
 * Firestore MÁS hasta ~50 lecturas de gist (una por amigo), y el token tiene 5.000 peticiones/hora que además
 * comparte con la sincronización de la biblioteca. Estuvo en 12 s: como la caché de sesión del gist público dura
 * 45 s, el gasto real quedaba acotado a ~51 peticiones cada 45 s ≈ 4.080/hora de uso sostenido del hub, o sea al
 * borde del límite y sin margen para el sync. Con 60 s son ~3.060/hora y quedan ~1.900 de margen; sigue siendo
 * 10 veces más fresco que oro. Si hiciera falta más margen, este es el número que hay que subir.
 *
 * No hay refresco a petición que se lo salte: el botón «Actualizar feed» se retiró (05-10-2026), y lo único que
 * fuerza una relectura es la propia app tras publicar. La frescura del feed la pone SOLO esta tabla.
 *
 * Nota: esto lo aplica el cliente, así que es un privilegio NO exigible — quien manipule su copia puede darse la
 * cadencia que quiera. No es un problema: gastaría su propio token.
 */
export const PROFILE_TIER_FEED_TTL_MS: Record<ProfileTier, number> = {
  bronze: 30 * 60 * 1000, // lo mismo que antes de existir los rangos
  silver: 25 * 60 * 1000, // 15 min hasta el 12-10-2026 y 20 hasta el 13-10-2026, decisión del usuario
  gold: 10 * 60 * 1000,
  mithril: 60_000,
};

/**
 * CUÁNTO VALE LA COPIA DEL DIRECTORIO SOCIAL: la consulta de `profiles` en Firestore (hasta 50 documentos, UNA
 * LECTURA POR PERFIL), guardada en IndexedDB aparte del feed.
 *
 * Existe porque esa consulta se repetía cada vez que caducaba el feed (`PROFILE_TIER_FEED_TTL_MS`), y era el mayor
 * gasto de Firestore que quedaba contra el cupo gratuito de 50.000 lecturas al día (ver
 * `docs/plan-capacidad-gratuita.md`). Separarlas no quita frescura a lo que importa: la actividad de los amigos sale
 * de sus gists y se sigue releyendo al ritmo del feed. Lo que tarda esto en verse es lo que vive en el perfil: un
 * perfil nuevo en «descubrir», un nick, una foto, un rango o los logros de los demás. Lo tuyo se ve al momento,
 * porque cada escritura de tu perfil invalida la copia (`invalidateSocialDirectoryCache`).
 *
 * Decisión del usuario (30-09-2026). Como el feed, manda el rango de QUIEN MIRA.
 */
export const PROFILE_TIER_DIRECTORY_TTL_MS: Record<ProfileTier, number> = {
  bronze: 2 * 60 * 60 * 1000,
  silver: 90 * 60 * 1000,
  gold: 60 * 60 * 1000,
  mithril: 30 * 60 * 1000,
};

/**
 * CADA CUÁNTO SE VUELVE A PREGUNTAR POR LA BIBLIOTECA DE CADA AMISTAD para la ficha de un juego (F4 del plan de la
 * ficha, `docs/plan-ficha-de-juego-y-precios.md`): el índice de «quién lo tiene» que va más allá de reseñas y avisos.
 * `null` = sin índice: la ficha se queda con lo que cuenta el canal social (F3).
 *
 * Gasta del token de GitHub de quien mira, una lectura condicional por amistad (casi siempre un 304), así que se
 * aplica solo en el cliente: quien se lo salte solo gasta de lo suyo. Ninguna pantalla lo explica ni nombra el rango
 * (memoria `rangos-ocultos-al-usuario`): se nota como un refresco más o menos espaciado.
 *
 * Decisión del usuario (15-10-2026). Manda el rango de QUIEN MIRA.
 */
export const PROFILE_TIER_FRIEND_INDEX_TTL_MS: Record<ProfileTier, number | null> = {
  bronze: null,
  silver: 24 * 60 * 60 * 1000,
  gold: 12 * 60 * 60 * 1000,
  mithril: 30 * 60 * 1000,
};

/**
 * CUÁNTO VALE UN PRECIO DE ISTHEREANYDEAL (P0.7 del plan de la ficha y los precios): pasado este plazo se vuelve a
 * preguntar. Lo aplican el cliente (cuándo refresca Deseados) y el borde (`/api/precios` acepta lo que tiene en caché
 * si es más reciente que el plazo de quien pide), así que el precio de un juego se comparte entre todo el mundo y
 * cada rango solo decide cuánto le vale de viejo.
 *
 * Decisión del usuario (15-10-2026). Manda el rango de QUIEN MIRA, y nada lo explica en pantalla.
 */
export const PROFILE_TIER_PRICE_TTL_MS: Record<ProfileTier, number> = {
  bronze: 18 * 60 * 60 * 1000,
  silver: 12 * 60 * 60 * 1000,
  gold: 6 * 60 * 60 * 1000,
  mithril: 15 * 60 * 1000,
};

/**
 * Peticiones por usuario y hora a `/api/precios`: una RED DE SEGURIDAD en el borde por si un cliente se porta mal; lo
 * normal lo limita el plazo de arriba. Mithril, alto pero con tope, para que un bucle propio se corte: lo que protege
 * la clave de ITAD, que es una para toda la app, es el tope global por minuto de `/api/precios`.
 *
 * Decisión del usuario (16-10-2026).
 */
export const PROFILE_TIER_PRICE_REQUESTS_PER_HOUR: Record<ProfileTier, number> = {
  bronze: 30,
  silver: 60,
  gold: 120,
  mithril: 1200,
};

/**
 * Lo mismo para la CLASIFICACIÓN DE PREMIOS, que pide hasta 60 perfiles solo para enlazar cada fila con el suyo
 * (`usePremiosProfiles`). Antes lo hacía en CADA visita, porque la única caché era la de 30 s en memoria. Aquí
 * lo único que se retrasa es el enlace de alguien que acabe de crear su perfil, así que la copia dura más.
 *
 * Decisión del usuario (30-09-2026).
 */
export const PROFILE_TIER_PREMIOS_PROFILES_TTL_MS: Record<ProfileTier, number> = {
  bronze: 6 * 60 * 60 * 1000,
  silver: 4 * 60 * 60 * 1000,
  gold: 2 * 60 * 60 * 1000,
  mithril: 30 * 60 * 1000,
};

/**
 * Techo ABSOLUTO de una publicación. No es un límite de producto: es la cota del saneador, para que un payload
 * corrupto o manipulado no meta un texto desmedido en el gist ni en el render. Mithril no tiene límite de cara al
 * usuario (ni contador ni corte al escribir), pero sigue pasando por aquí.
 */
export const POST_HARD_CEILING = 100_000;

/**
 * Cuánto puede publicar cada rango en el feed (noticias, enlaces, texto libre). `0` = no puede publicar.
 *
 * Manda el rango de quien PUBLICA, y lo aplica su propio cliente: las publicaciones viven en el gist social del
 * usuario, que es suyo, así que esto NO es una barrera de seguridad — quien manipule su copia puede saltárselo.
 * Es una regla de producto, igual que la cadencia del feed.
 */
export const PROFILE_TIER_POST_MAX_LENGTH: Record<ProfileTier, number> = {
  bronze: 0,
  silver: 0, // 1.000 hasta el 13-10-2026: publicar pasa a ser de oro para arriba, decisión del usuario
  gold: 1_000, // 10.000 hasta el 13-10-2026
  mithril: POST_HARD_CEILING,
};

/** ¿Este rango puede publicar en el feed? Bronce y plata no. */
export function canPublishPosts(tier: ProfileTier): boolean {
  return PROFILE_TIER_POST_MAX_LENGTH[tier] > 0;
}

/** ¿Se le enseña contador de caracteres? Mithril no: no tiene límite que mostrar. */
export function hasPostLengthLimit(tier: ProfileTier): boolean {
  return canPublishPosts(tier) && PROFILE_TIER_POST_MAX_LENGTH[tier] < POST_HARD_CEILING;
}

/**
 * LA CARÁTULA EN LA RULETA DE UN PERFIL DEL SOCIAL (decisión del usuario, 13-10-2026): qué rangos la ven en el
 * resultado de «Elige tu próximo juego». Solo mithril. En tus listados la ve todo el mundo con la preferencia de
 * carátulas encendida; en el social cada tirada es un juego de otra biblioteca que resolver con el cupo de lo ajeno.
 */
export const PROFILE_TIER_ROULETTE_COVERS: Record<ProfileTier, boolean> = {
  bronze: false,
  silver: false,
  gold: false,
  mithril: true,
};

/** ¿Este rango ve la carátula del juego elegido en la ruleta de un perfil del social? */
export function canSeeSocialRouletteCovers(tier: ProfileTier): boolean {
  return PROFILE_TIER_ROULETTE_COVERS[tier];
}

/**
 * LAS ESCENAS DE EMPEZAR Y CERRAR UN JUEGO (decisión del usuario, 12-10-2026): qué rangos ven su casilla en Diseño.
 * Bronce no: a quien no la tiene no se le enseña ni la casilla, y nada en pantalla dice por qué (los rangos no se
 * nombran ante quien no administra).
 *
 * Como la cadencia del feed, lo aplica el cliente y no es exigible: quien manipule su copia puede encenderla, y lo
 * único que consigue es una animación en su propia pantalla.
 */
export const PROFILE_TIER_GAME_SCENES: Record<ProfileTier, boolean> = {
  bronze: false,
  silver: true,
  gold: true,
  mithril: true,
};

/** ¿Este rango puede encender las escenas de empezar y cerrar un juego? */
export function canUseGameScenes(tier: ProfileTier): boolean {
  return PROFILE_TIER_GAME_SCENES[tier];
}

/**
 * LA LISTA DE DESEOS SIN TOPE (P3 del plan de la ficha y los precios; decisión del usuario, 16-10-2026): solo mithril.
 * Los demás siguen con `WISHLIST_MAX_GAMES` (o `WISHLIST_MAX_GAMES_ADMIN` con el claim). Sin tope, el recuento no se
 * dice contra ningún número, y nada en pantalla nombra el rango.
 */
export const PROFILE_TIER_UNLIMITED_WISHLIST: Record<ProfileTier, boolean> = {
  bronze: false,
  silver: false,
  gold: false,
  mithril: true,
};

/** ¿Este rango tiene la lista de deseos sin tope? */
export function hasUnlimitedWishlist(tier: ProfileTier): boolean {
  return PROFILE_TIER_UNLIMITED_WISHLIST[tier];
}

export const PROFILE_TIER_LABELS: Record<ProfileTier, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  mithril: 'Mithril',
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// COMPARTIR RESEÑAS CON ENLACE PÚBLICO (ver docs/plan-compartir-resenas.md)
//
// OJO, ESTO NO ES COMO LOS LÍMITES DE ARRIBA. La cadencia del feed y la longitud de las publicaciones son reglas
// de PRODUCTO que aplica el propio cliente sobre un recurso del USUARIO (su gist, su token): quien manipule su
// copia puede saltárselas y solo se gasta lo suyo. Un enlace compartido, en cambio, vive en la infraestructura
// del SERVICIO, así que estas cuotas las aplica la Pages Function y son una barrera de verdad. El cliente las
// refleja para que el usuario no se lleve sorpresas, pero quien manda es el servidor.
//
// Este fichero lo lee también el Worker (`functions/_lib/quota.ts`), que Cloudflare compila aparte del bundle de
// Vite: mantenerlo SIN dependencias (ni React, ni DOM, ni otros módulos del proyecto) o su build se romperá.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Días que un enlace compartido permanece accesible, por rango. */
export const PROFILE_TIER_SHARE_TTL_DAYS: Record<ProfileTier, number> = {
  bronze: 7,
  silver: 10,
  gold: 14,
  mithril: 90,
};

/**
 * Enlaces ACTIVOS simultáneos por rango. No es un cupo que se gaste para siempre: los enlaces caducan y liberan
 * su hueco solos, y retirar uno a mano lo libera al instante.
 *
 * Bronce puede compartir aunque NO pueda publicar en el feed (`PROFILE_TIER_POST_MAX_LENGTH.bronze = 0`). La
 * asimetría es deliberada, no un descuido: publicar en el feed es ocupar el espacio de los demás; compartir la
 * reseña propia es sacarla fuera. No unificar los dos números.
 */
export const PROFILE_TIER_SHARE_MAX_ACTIVE: Record<ProfileTier, number> = {
  bronze: 5,
  silver: 10,
  gold: 15,
  mithril: 50,
};

/** Techos absolutos: ningún ajuste individual puede superar lo que da el rango más alto. */
export const SHARE_TTL_DAYS_CEILING = PROFILE_TIER_SHARE_TTL_DAYS.mithril;
export const SHARE_MAX_ACTIVE_CEILING = PROFILE_TIER_SHARE_MAX_ACTIVE.mithril;

/**
 * Ajuste individual de cuota que el administrador puede poner a un perfil concreto. Los dos campos son opcionales
 * e independientes: se puede recortar el número de enlaces sin tocar su duración, o al revés.
 *
 * Existe porque el rango es un instrumento romo: moverlo para tocar lo que alguien comparte le cambiaría también
 * la frescura de su feed (`PROFILE_TIER_FEED_TTL_MS`), que es otro asunto.
 */
export interface ShareQuotaOverride {
  maxActive?: number;
  ttlDays?: number;
}

/** Cuota efectiva de un usuario: lo que de verdad puede hacer, ya resuelto el rango y su ajuste individual. */
export interface ShareQuota {
  maxActive: number;
  ttlDays: number;
}

/**
 * Resuelve la cuota efectiva. El ajuste individual manda sobre el rango mientras exista (valor ABSOLUTO, no un
 * delta ni una suma), y todo queda recortado al techo. Un valor corrupto o absurdo —negativo, cero, NaN, una
 * cadena— se ignora y se cae al valor del rango: degradar es más seguro que promocionar, igual que en
 * `normalizeTier`.
 *
 * El veto (`ban:{uid}`) NO se resuelve aquí: se comprueba antes, y quien está vetado no llega a preguntar por su
 * cuota.
 */
export function resolveShareQuota(tier: ProfileTier, override?: ShareQuotaOverride | null): ShareQuota {
  const pick = (value: unknown, fallback: number, ceiling: number): number => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, ceiling) : fallback;
  };
  return {
    maxActive: pick(override?.maxActive, PROFILE_TIER_SHARE_MAX_ACTIVE[tier], SHARE_MAX_ACTIVE_CEILING),
    ttlDays: pick(override?.ttlDays, PROFILE_TIER_SHARE_TTL_DAYS[tier], SHARE_TTL_DAYS_CEILING),
  };
}

/** Instante de caducidad de un enlace creado ahora, según la cuota ya resuelta. */
export function shareExpiresAt(quota: ShareQuota, now: number): number {
  return now + quota.ttlDays * 24 * 60 * 60 * 1000;
}

/**
 * Normaliza lo que venga del documento. Un valor desconocido (tier retirado, dato corrupto, escritura manual en
 * la consola de Firebase) cae a bronce en vez de romper la tabla: degradar es más seguro que promocionar.
 */
export function normalizeTier(value: unknown): ProfileTier {
  const candidate = String(value || '').trim().toLowerCase();
  return (PROFILE_TIERS as readonly string[]).includes(candidate) ? (candidate as ProfileTier) : DEFAULT_PROFILE_TIER;
}

/**
 * Techo de CREACIONES al día: el mismo número que los enlaces activos que le tocan.
 *
 * La regla se dice en una frase —«al día puedes crear tantos como puedes tener a la vez»— y por eso no hay una
 * segunda tabla de cifras que mantener en sincronía con la de arriba. Frena el único abuso que importa, que no
 * es publicar mucho sino el ciclo crear-y-retirar: quien lo intente agota su día en tantos intentos como huecos
 * tiene, en vez de disponer de una cifra suelta mucho mayor.
 *
 * Va atado a la cuota RESUELTA, así que un ajuste individual lo arrastra: a quien se le recorta el número de
 * enlaces se le recorta también el ritmo, y no puede saltarse el recorte creando y retirando todo el día.
 */
export function shareDailyLimit(quota: ShareQuota): number {
  return quota.maxActive;
}
