/**
 * Rango ("tier") del perfil. Lo asigna EL ADMINISTRADOR desde `/admin`; el usuario no puede tocarlo (ver la
 * función `profileTierNotSelfAssigned` en firestore.rules, que solo le deja conservar el que tenga).
 *
 * `mithril` está reservado a la cuenta del administrador: el panel solo ofrece ese valor en la fila del propio
 * admin. Es una decisión de producto, no una barrera de seguridad — quien manda ya puede escribir cualquier tier
 * en cualquier perfil, y no tiene sentido protegerse de uno mismo.
 */
export const PROFILE_TIERS = ['bronze', 'silver', 'gold', 'mithril'] as const;

export type ProfileTier = (typeof PROFILE_TIERS)[number];

/** Rango de quien no tiene ninguno asignado: TODO perfil es bronce mientras el admin no diga otra cosa. */
export const DEFAULT_PROFILE_TIER: ProfileTier = 'bronze';

/** Rango reservado a la cuenta del administrador. */
export const ADMIN_ONLY_TIER: ProfileTier = 'mithril';

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
 * Ya NO coincide con el anti-spam del botón "Actualizar feed" (`FORCED_REFRESH_MIN_MS`, 12 s): son cosas
 * distintas —el refresco automático al abrir y el manual a petición— y atarlas obligaba a moverlas juntas.
 *
 * Nota: esto lo aplica el cliente, así que es un privilegio NO exigible — quien manipule su copia puede darse la
 * cadencia que quiera. No es un problema: gastaría su propio token.
 */
export const PROFILE_TIER_FEED_TTL_MS: Record<ProfileTier, number> = {
  bronze: 30 * 60 * 1000, // lo mismo que antes de existir los rangos
  silver: 15 * 60 * 1000,
  gold: 10 * 60 * 1000,
  mithril: 60_000,
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
  silver: 1_000,
  gold: 10_000,
  mithril: POST_HARD_CEILING,
};

/** ¿Este rango puede publicar en el feed? Bronce no. */
export function canPublishPosts(tier: ProfileTier): boolean {
  return PROFILE_TIER_POST_MAX_LENGTH[tier] > 0;
}

/** ¿Se le enseña contador de caracteres? Mithril no: no tiene límite que mostrar. */
export function hasPostLengthLimit(tier: ProfileTier): boolean {
  return canPublishPosts(tier) && PROFILE_TIER_POST_MAX_LENGTH[tier] < POST_HARD_CEILING;
}

export const PROFILE_TIER_LABELS: Record<ProfileTier, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  mithril: 'Mithril',
};

/**
 * Normaliza lo que venga del documento. Un valor desconocido (tier retirado, dato corrupto, escritura manual en
 * la consola de Firebase) cae a bronce en vez de romper la tabla: degradar es más seguro que promocionar.
 */
export function normalizeTier(value: unknown): ProfileTier {
  const candidate = String(value || '').trim().toLowerCase();
  return (PROFILE_TIERS as readonly string[]).includes(candidate) ? (candidate as ProfileTier) : DEFAULT_PROFILE_TIER;
}
