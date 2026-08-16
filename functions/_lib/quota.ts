// Cuota de compartir resuelta en el SERVIDOR (ver docs/plan-compartir-resenas.md §4).
//
// Aquí está la diferencia de fondo con los límites de publicación del feed: aquellos los aplica el cliente sobre
// el gist del propio usuario, así que son una regla de producto saltable; estos gobiernan almacenamiento del
// SERVICIO, así que son una barrera de verdad y se comprueban aquí, con el token ya verificado.
//
// Orden de resolución, y no es intercambiable: veto → ajuste individual → rango → techos.
import {
  DEFAULT_PROFILE_TIER,
  SHARE_MAX_CREATIONS_PER_DAY,
  normalizeTier,
  resolveShareQuota,
  type ProfileTier,
  type ShareQuota,
  type ShareQuotaOverride,
} from '../../src/core/constants/tiers';
import { banKey, dailyQuotaKey, overrideKey, userSharePrefix, type Env, type KVNamespace, type ShareIndexMetadata } from './keys';
import type { AuthUser } from './firebaseAuth';

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
 * Rango y nick del usuario, leídos de su propio documento de perfil con SU ID token (y su token de App Check si
 * lo trae).
 *
 * ASÍ NO HACE FALTA CUENTA DE SERVICIO: la lectura va con los permisos del dueño, que las reglas ya permiten
 * (`isOwner`), y reenviar la atestación de App Check hace que funcione esté o no exigida en la consola. Si algo
 * falla —perfil aún sin crear, red, reglas— se degrada a bronce y nick vacío: nunca se promociona por un error.
 */
export async function readProfileFacts(user: AuthUser, projectId: string, appCheckToken: string | null): Promise<ProfileFacts> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/profiles/${user.uid}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${user.idToken}` };
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken;
  }
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { tier: DEFAULT_PROFILE_TIER, nick: '' };
    }
    const body = (await response.json()) as {
      fields?: { tier?: { stringValue?: string }; displayName?: { stringValue?: string } };
    };
    return {
      tier: normalizeTier(body.fields?.tier?.stringValue),
      nick: String(body.fields?.displayName?.stringValue || '').trim(),
    };
  } catch {
    return { tier: DEFAULT_PROFILE_TIER, nick: '' };
  }
}

/** Una fila del índice del usuario: el token y lo que hace falta para pintarla, sin leer el artículo. */
export interface ShareRow {
  token: string;
  meta: ShareIndexMetadata | null;
}

/** Enlaces vivos del usuario. Un solo `list()`: los datos de cada fila viajan en la metadata de la clave. */
export async function listActiveShares(kv: KVNamespace, uid: string): Promise<ShareRow[]> {
  const prefix = userSharePrefix(uid);
  const rows: ShareRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list<ShareIndexMetadata>({ prefix, cursor, limit: 1_000 });
    for (const key of page.keys) {
      rows.push({ token: key.name.slice(prefix.length), meta: key.metadata ?? null });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rows;
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
 * Contador diario de creaciones. KV no tiene incremento atómico, así que dos peticiones simultáneas pueden
 * contar una sola vez. Es ACEPTABLE a propósito: esto no es la cuota de producto (esa se calcula contando los
 * enlaces vivos, que sí es exacta), sino un freno anti-abuso donde fallar por uno no cambia nada.
 */
export async function bumpDailyCount(kv: KVNamespace, uid: string, now: number): Promise<number> {
  const key = dailyQuotaKey(uid, now);
  const current = Number((await kv.get(key)) || 0);
  const next = current + 1;
  // 48 h de vida: cubre el día en curso con margen para cualquier desfase de reloj.
  await kv.put(key, String(next), { expirationTtl: 48 * 3_600 });
  return next;
}

export async function readDailyCount(kv: KVNamespace, uid: string, now: number): Promise<number> {
  return Number((await kv.get(dailyQuotaKey(uid, now))) || 0);
}

export { SHARE_MAX_CREATIONS_PER_DAY };
