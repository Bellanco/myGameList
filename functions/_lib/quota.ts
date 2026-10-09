// Cuota de compartir resuelta en el SERVIDOR (ver docs/plan-compartir-resenas.md §4).
//
// Aquí está la diferencia de fondo con los límites de publicación del feed: aquellos los aplica el cliente sobre
// el gist del propio usuario, así que son una regla de producto saltable; estos gobiernan almacenamiento del
// SERVICIO, así que son una barrera de verdad y se comprueban aquí, con el token ya verificado.
//
// Orden de resolución, y no es intercambiable: veto → ajuste individual → rango → techos.
import {
  DEFAULT_PROFILE_TIER,
  shareDailyLimit,
  normalizeTier,
  resolveShareQuota,
  PROFILE_TIER_SHARE_MAX_ACTIVE,
  PROFILE_TIER_SHARE_TTL_DAYS,
  type ProfileTier,
  type ShareQuota,
  type ShareQuotaOverride,
} from '../../src/core/constants/tiers';
import { banKey, dailyQuotaKey, drainPages, overrideKey, userSharePrefix, type Env, type KVNamespace, type ShareIndexMetadata } from './keys';
import type { AuthUser } from './firebaseAuth';
import { ServiceUnavailableError } from './http';

export interface ShareBan {
  reason?: string;
  bannedAt: number;
  by: string;
}

/** Estado completo de un usuario frente a la funcionalidad: qué puede hacer y cuánto le queda. */
export interface ShareStatus {
  tier: ProfileTier;
  nick: string;
  quota: ShareQuota;
  ban: ShareBan | null;
  active: ShareRow[];
}

export async function readBan(kv: KVNamespace, uid: string): Promise<ShareBan | null> {
  const raw = (await kv.get(banKey(uid), 'json')) as ShareBan | null;
  return raw && typeof raw.bannedAt === 'number' ? raw : null;
}

export async function readOverride(kv: KVNamespace, uid: string): Promise<ShareQuotaOverride | null> {
  const raw = (await kv.get(overrideKey(uid), 'json')) as ShareQuotaOverride | null;
  return raw && typeof raw === 'object' ? raw : null;
}

export interface ProfileFacts {
  tier: ProfileTier;
  /** Nick público. Lo decide EL SERVIDOR, no el cliente: nadie puede publicar firmando con otro nombre. */
  nick: string;
}

/**
 * Rango y nick de un usuario, leídos de su documento de perfil con el ID token de QUIEN LLAMA (y su token de App
 * Check si lo trae).
 *
 * ASÍ NO HACE FALTA CUENTA DE SERVICIO: la lectura va con los permisos del llamante, que las reglas ya permiten
 * (`isOwner` sobre el suyo, `isAdmin()` sobre cualquiera), y reenviar la atestación de App Check hace que funcione
 * esté o no exigida en la consola. Si algo falla —perfil aún sin crear, red, reglas— se degrada a bronce y nick
 * vacío: nunca se promociona por un error.
 *
 * `targetUid` existe para el panel de administración, que necesita el rango de OTRO para acotar el ajuste de cuota
 * a lo que da su categoría. Por omisión se lee el del propio llamante, que es el caso de todos los demás usos.
 */
export async function readProfileFacts(
  user: AuthUser,
  projectId: string,
  appCheckToken: string | null,
  targetUid: string = user.uid,
): Promise<ProfileFacts> {
  return (await tryReadProfileFacts(user, projectId, appCheckToken, targetUid)) || { tier: DEFAULT_PROFILE_TIER, nick: '' };
}

/**
 * Lo mismo, pero DISTINGUIENDO "no se pudo leer" (null) de "es bronce".
 *
 * La diferencia solo importa donde el rango decide si una petición se acepta o se rechaza: el ajuste de cuota del
 * panel se acota al máximo de la categoría del usuario, y tomar un fallo de red por un bronce rechazaría el ajuste
 * legítimo de alguien que es oro. Donde el rango solo CONCEDE (publicar, pintar la pantalla del dueño), degradar a
 * bronce es lo correcto y para eso está `readProfileFacts`.
 */
export async function tryReadProfileFacts(
  user: AuthUser,
  projectId: string,
  appCheckToken: string | null,
  targetUid: string = user.uid,
): Promise<ProfileFacts | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/profiles/${targetUid}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${user.idToken}` };
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken;
  }
  // «No se pudo leer» tiene dos lecturas, y no se responden igual. Un 404/403 es una RESPUESTA (no hay perfil, o
  // no se deja leer): `null`, y quien llama degrada a bronce o pide crear el espacio social. Firestore sin cuota
  // (429), caído (5xx) o sin red NO dicen nada del usuario: se lanza `ServiceUnavailableError` y el cliente oye
  // «no disponible ahora». Antes salía «Necesitas tener tu espacio social creado» a quien lo tenía.
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new ServiceUnavailableError('Firestore no responde');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ServiceUnavailableError(`Firestore no atiende (${response.status})`);
  }
  if (!response.ok) {
    return null;
  }
  try {
    const body = (await response.json()) as {
      fields?: { tier?: { stringValue?: string }; displayName?: { stringValue?: string } };
    };
    return {
      tier: normalizeTier(body.fields?.tier?.stringValue),
      nick: String(body.fields?.displayName?.stringValue || '').trim(),
    };
  } catch {
    return null;
  }
}

/**
 * ¿El ajuste individual se pasa de lo que da la categoría del usuario? Devuelve el primer campo que se pasa y su
 * tope, o `null` si cabe entero.
 *
 * EL AJUSTE SOLO RECORTA. Existe para bajarle a alguien lo que comparte sin tocarle la frescura de su feed
 * (`PROFILE_TIER_FEED_TTL_MS`, que va atada al rango); para darle MÁS está el rango, que es exactamente lo que el
 * rango significa. Sin esto, el ajuste era una segunda vía para conceder privilegios por la puerta de atrás, y el
 * único freno era el techo absoluto de mithril: 50 enlaces de 90 días para un bronce.
 *
 * Los campos ausentes no se miran: el ajuste es parcial por diseño.
 */
export function overrideExceedsTier(
  tier: ProfileTier,
  override: ShareQuotaOverride,
): { field: 'maxActive' | 'ttlDays'; ceiling: number } | null {
  if (override.maxActive !== undefined && override.maxActive > PROFILE_TIER_SHARE_MAX_ACTIVE[tier]) {
    return { field: 'maxActive', ceiling: PROFILE_TIER_SHARE_MAX_ACTIVE[tier] };
  }
  if (override.ttlDays !== undefined && override.ttlDays > PROFILE_TIER_SHARE_TTL_DAYS[tier]) {
    return { field: 'ttlDays', ceiling: PROFILE_TIER_SHARE_TTL_DAYS[tier] };
  }
  return null;
}

/** Una fila del índice del usuario: el token y lo que hace falta para pintarla, sin leer el artículo. */
export interface ShareRow {
  token: string;
  meta: ShareIndexMetadata | null;
}

/** Enlaces vivos del usuario. Los datos de cada fila viajan en la metadata de la clave: no se lee un solo artículo. */
export async function listActiveShares(kv: KVNamespace, uid: string): Promise<ShareRow[]> {
  const prefix = userSharePrefix(uid);
  const keys = await drainPages<ShareIndexMetadata>((cursor) => kv.list<ShareIndexMetadata>({ prefix, cursor, limit: 1_000 }));
  return keys.map((key) => ({ token: key.name.slice(prefix.length), meta: key.metadata ?? null }));
}

/** Todo lo que hace falta saber de un usuario antes de dejarle publicar (o para pintarle su pantalla). */
export async function readShareStatus(
  env: Env,
  user: AuthUser,
  projectId: string,
  appCheckToken: string | null,
): Promise<ShareStatus> {
  const [ban, override, profile, active] = await Promise.all([
    readBan(env.SHARES, user.uid),
    readOverride(env.SHARES, user.uid),
    readProfileFacts(user, projectId, appCheckToken),
    listActiveShares(env.SHARES, user.uid),
  ]);
  return { tier: profile.tier, nick: profile.nick, quota: resolveShareQuota(profile.tier, override), ban, active };
}

/**
 * Contador diario de creaciones. KV no tiene incremento atómico: es leer, sumar y escribir. Por eso quien publica
 * no lo llama directamente, sino a través de `reserveDailySlot`, que pone en fila los de un mismo usuario.
 */
export async function bumpDailyCount(kv: KVNamespace, uid: string, now: number, delta = 1): Promise<number> {
  const key = dailyQuotaKey(uid, now);
  const current = Number((await kv.get(key)) || 0);
  const next = Math.max(0, current + delta);
  // 48 h de vida: cubre el día en curso con margen para cualquier desfase de reloj.
  await kv.put(key, String(next), { expirationTtl: 48 * 3_600 });
  return next;
}

/* EN FILA POR USUARIO, DENTRO DE ESTE AISLADO. Dos publicaciones simultáneas leían el mismo contador y el mismo
   listado de enlaces vivos, y las dos pasaban los topes (09-10-2026). Con la fila, sus lectura-suma-escritura no se
   solapan y cada una saca un número distinto. Solo alcanza a las peticiones que caen en el mismo aislado —las de
   un mismo cliente suelen caer juntas—; entre aislados o ubicaciones distintas sigue sin haber atomicidad, que en
   KV no existe: cerrarlo del todo pediría un Durable Object. */
const reservations = new Map<string, Promise<unknown>>();

function inUidQueue<T>(uid: string, task: () => Promise<T>): Promise<T> {
  const run = (reservations.get(uid) ?? Promise.resolve()).then(task);
  const tail = run.catch(() => undefined);
  reservations.set(uid, tail);
  void tail.then(() => {
    if (reservations.get(uid) === tail) reservations.delete(uid);
  });
  return run;
}

/**
 * Reserva un hueco del día ANTES de publicar y devuelve el número que le ha tocado, o `null` si el contador no se
 * pudo anotar (KV sin cupo de escrituras): es un freno anti-abuso y perder una cuenta no justifica no publicar.
 */
export function reserveDailySlot(kv: KVNamespace, uid: string, now: number): Promise<number | null> {
  return inUidQueue(uid, () => bumpDailyCount(kv, uid, now)).catch(() => null);
}

/** Devuelve el hueco de una publicación que no ha llegado a escribirse. Sin poder fallar: lo peor es un freno más estricto. */
export function releaseDailySlot(kv: KVNamespace, uid: string, now: number): Promise<void> {
  return inUidQueue(uid, () => bumpDailyCount(kv, uid, now, -1)).then(() => undefined, () => undefined);
}

export async function readDailyCount(kv: KVNamespace, uid: string, now: number): Promise<number> {
  return Number((await kv.get(dailyQuotaKey(uid, now))) || 0);
}

export { shareDailyLimit };
