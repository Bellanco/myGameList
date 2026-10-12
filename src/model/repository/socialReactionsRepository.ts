// LOS «ME GUSTA» PROPIOS: el fichero de reacciones del gist social y la cola de lo que aún no ha subido.
//
// El formato y sus reglas (fusión, lápidas, topes, versión) son puros y viven en `core/social/reactions`; la lectura y
// escritura del fichero en GitHub, en `socialReactionsGist`. Aquí está la cola y la subida, en un módulo aparte de
// `socialGistRepository` porque aquel ya pasa de mil seiscientas líneas.
//
// DAR «ME GUSTA» NO ESPERA A LA RED. Se apunta como INTENCIÓN (`pending`), se guarda en IndexedDB para que sobreviva a
// cerrar la pestaña o a quedarse sin conexión, y se sube agrupado unos segundos después (`FLUSH_DELAY_MS`): diez
// «me gusta» seguidos son UN `PATCH`, no diez, porque GitHub limita las escrituras seguidas. La interfaz pinta la
// intención al momento (`getPendingSocialLikes`); si la subida falla, la intención sigue ahí y se reintenta.
//
// CERO FIRESTORE en el caso normal. A diferencia de publicar una reseña, esto no llama a `syncPublicIdentity`: un «me
// gusta» no cambia quién eres. Lo único que puede leer Firestore es la puerta legal, como mucho una vez al día y
// solo si la versión aceptada que hay sellada en este dispositivo es vieja (`canPublishSocialInBackground`).
//
// SOLO SE ESCRIBE ESTE FICHERO. El `PATCH` nombra `SOCIAL_REACTIONS_FILENAME` y nada más (`socialReactionsGist`): el
// fichero principal del gist lo escribe `writeSocialGist`, y cada uno deja al otro como estaba.
import {
  REACTIONS_FILE_VERSION,
  canRewriteReactionsFile,
  mergeReactions,
  normalizeReactions,
  pruneReactions,
  reactionTargetKey,
  type SocialReactionEntry,
} from '../../core/social/reactions';
import { getCurrentSocialAuthUser } from './firebaseRepository';
import { getLocalMeta, patchLocalMeta } from './indexedDbRepository';
import { canPublishSocialInBackground } from './socialConsentGate';
import { resolveSocialChannel } from './socialChannel';
import { readSocialReactionsRaw, resetSocialReactionsGistCacheForTests, writeSocialReactions } from './socialReactionsGist';
import { serializeSocialWrite } from './socialWriteQueue';

/** Cuánto se espera tras el último «me gusta» antes de subir: lo justo para agrupar una ráfaga. */
export const FLUSH_DELAY_MS = 4000;

// ─── La cola de intenciones ──────────────────────────────────────────────────────────────────────────────────────

/** Lo que se ha pulsado y aún no ha subido. `null` hasta leerlo de IndexedDB. Una entrada por destino. */
let pending: SocialReactionEntry[] | null = null;
/** Perfiles cuyos «me gusta» hay que retirar (al dejar de ser amigos). */
let pendingPurges: string[] = [];
let loading: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let onlineListener = false;

async function ensurePendingLoaded(): Promise<SocialReactionEntry[]> {
  if (pending) return pending;
  loading ??= (async () => {
    const meta = await getLocalMeta().catch(() => null);
    // Lo guardado pasa por la misma lectura defensiva que el gist ajeno: IndexedDB también se puede corromper.
    pending = normalizeReactions({ items: meta?.pendingReactions }, Date.now());
    pendingPurges = (meta?.pendingReactionPurges ?? []).filter((id) => typeof id === 'string' && id.trim() !== '');
  })().finally(() => {
    loading = null;
  });
  await loading;
  return pending ?? [];
}

function persistPending(): Promise<void> {
  return patchLocalMeta({ pendingReactions: pending ?? [], pendingReactionPurges: pendingPurges }).catch(() => {});
}

/** Los «me gusta» pulsados que aún no han subido, para que la interfaz los pinte ya puestos (o ya quitados). */
export async function getPendingSocialLikes(): Promise<readonly SocialReactionEntry[]> {
  return [...(await ensurePendingLoaded())];
}

/** Programa la subida agrupada. Cada llamada reinicia la espera. */
export function scheduleSocialLikesFlush(delayMs: number = FLUSH_DELAY_MS): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSocialLikes().catch(() => {});
  }, delayMs);
  // Sin red, la subida falla y la intención se queda; al volver la conexión se reintenta sola.
  if (!onlineListener && typeof window !== 'undefined') {
    onlineListener = true;
    window.addEventListener('online', () => scheduleSocialLikesFlush(0));
  }
}

/**
 * Da o quita el «me gusta» de algo que ha escrito una amistad. Vuelve en cuanto la intención está apuntada; la subida
 * va después, agrupada.
 */
export async function setSocialLike(target: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>, liked: boolean): Promise<void> {
  const current = await ensurePendingLoaded();
  const key = reactionTargetKey(target);
  // Una INTENCIÓN se apunta siempre, aunque no cambie nada en la cola: quitar un «me gusta» que solo está en el gist
  // (no en la cola) tiene que llegar allí como lápida.
  const intent: SocialReactionEntry = liked
    ? { on: target.on, to: target.to, item: target.item, kind: 'like', at: Date.now() }
    : { on: target.on, to: target.to, item: target.item, kind: 'like', at: Date.now(), del: true };
  pending = pruneReactions([intent, ...current.filter((entry) => reactionTargetKey(entry) !== key)], intent.at);
  await persistPending();
  scheduleSocialLikesFlush();
}

/**
 * Retira, en la siguiente subida, todos los «me gusta» dados a un perfil. Para cuando se deja de ser amigos: lo que
 * se marcó en sus reseñas no tiene por qué seguir publicado.
 */
export async function retireSocialLikesTo(profileId: string): Promise<void> {
  const id = String(profileId || '').trim();
  if (!id) return;
  await ensurePendingLoaded();
  if (!pendingPurges.includes(id)) pendingPurges = [...pendingPurges, id];
  await persistPending();
  scheduleSocialLikesFlush();
}

export type SocialLikesFlushResult =
  | 'nothing'
  | 'written'
  | 'unchanged'
  | 'no-session'
  | 'no-consent'
  | 'no-channel'
  /** El fichero lo escribió una versión más nueva de la app: no se toca (y la cola espera a que esta se actualice). */
  | 'outdated';

function sameEntries(a: readonly SocialReactionEntry[], b: readonly SocialReactionEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Sube la cola: lee el fichero del gist, le funde las intenciones, retira lo de los perfiles purgados y escribe. En
 * fila con el resto de escrituras del canal (`serializeSocialWrite`).
 *
 * Solo se vacía de la cola lo que se ha subido de verdad. Lo pulsado MIENTRAS subía se queda para la siguiente.
 */
export function flushSocialLikes(): Promise<SocialLikesFlushResult> {
  return serializeSocialWrite(async () => {
    const intents = [...(await ensurePendingLoaded())];
    const purges = [...pendingPurges];
    if (!intents.length && !purges.length) return 'nothing';

    const authUser = await getCurrentSocialAuthUser();
    if (!authUser) return 'no-session';
    if (!(await canPublishSocialInBackground(authUser.uid))) return 'no-consent';
    const resolved = await resolveSocialChannel({ email: authUser.email });
    if (resolved.status !== 'ready') return 'no-channel';
    const { token, gistId } = resolved.channel;

    const raw = await readSocialReactionsRaw(token, gistId);
    if (!canRewriteReactionsFile(raw)) return 'outdated';

    const now = Date.now();
    const current = normalizeReactions(raw, now);
    let next = mergeReactions(current, intents, now);
    if (purges.length) {
      // La lápida nunca puede quedar por detrás del «me gusta» que retira (un reloj adelantado en otro aparato): a
      // igual instante gana quitar, así que basta con no bajar del suyo.
      next = pruneReactions(
        next.map((entry) => (!entry.del && purges.includes(entry.to) ? { ...entry, at: Math.max(now, entry.at), del: true as const } : entry)),
        now,
      );
    }

    let result: SocialLikesFlushResult = 'unchanged';
    if (!sameEntries(next, current)) {
      await writeSocialReactions(token, gistId, { v: REACTIONS_FILE_VERSION, updatedAt: now, items: next });
      result = 'written';
    }

    // Fuera de la cola lo subido, comparando por destino E instante: si se volvió a pulsar mientras subía, esa
    // intención es otra y se queda.
    const flushed = new Set(intents.map((entry) => `${reactionTargetKey(entry)}@${entry.at}`));
    pending = (pending ?? []).filter((entry) => !flushed.has(`${reactionTargetKey(entry)}@${entry.at}`));
    pendingPurges = pendingPurges.filter((id) => !purges.includes(id));
    await persistPending();
    return result;
  });
}

/** Estado en memoria a cero. Solo para las pruebas. */
export function resetSocialLikesForTests(): void {
  pending = null;
  pendingPurges = [];
  loading = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  resetSocialReactionsGistCacheForTests();
}
