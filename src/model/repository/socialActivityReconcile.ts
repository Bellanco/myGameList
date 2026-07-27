// Reconciliación de la actividad social: pone `activity[]` del gist social propio de acuerdo con las reseñas
// REALES de los listados.
//
// Por qué hace falta: la única vía de escritura de `activity` era el efecto colateral de guardar una reseña
// (`publishReviewActivity`), así que toda publicación perdida era permanente — y se perdía en silencio si el
// canal social no estaba armado en ESE dispositivo, si el chunk del publicador no llegaba a descargarse, o
// ante cualquier 403/5xx de GitHub. El resultado era el mismo en los tres casos: el perfil del usuario
// mostraba todas sus reseñas (salen del gist de JUEGOS) y el feed de sus amigos no mostraba ninguna (sale del
// gist SOCIAL). Esta pasada, idempotente y barata, repara ese desfase desde cualquier dispositivo con el canal
// armado, porque trabaja sobre los listados sincronizados, no sobre lo que se escribió aquí.
//
// También retira las entradas huérfanas (juego borrado o reseña vaciada), que antes intentaba adivinar un
// efecto del hub con una foto de localStorage tomada al montar: si esa foto estaba desfasada, despublicaba
// reseñas válidas.
import type { TabData } from '../types/game';
import { TAB_IDS } from '../types/game';
import { getCurrentSocialAuthUser, resolveStableProfileId } from './firebaseRepository';
import {
  readSocialGist,
  remapSocialActorIds,
  removeReviewActivity,
  saveSocialSyncConfig,
  upsertReviewActivity,
  writeSocialGist,
  type SocialGistData,
} from './gistRepository';
import { getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta } from './indexedDbRepository';
import { resolveSocialChannel } from './socialChannel';

// Solo estas pestañas publican reseña: 'p' (próximos) nunca lo hace (mismo criterio que `handleSaveDraft`).
const REVIEWABLE_TABS = TAB_IDS.filter((tab) => tab !== 'p');
// Tope de reseñas que se publican en una pasada (las más recientes). Acota el tamaño del gist en bibliotecas
// grandes; no afecta a la retirada de huérfanas, que sí considera TODOS los listados.
const DEFAULT_MAX_PUBLISHED = 60;
// Ventana del sello: sin cambios en el recuento de reseñas y sin publicación pendiente, no se vuelve a mirar
// el gist dentro de este plazo (la comprobación del recuento es en memoria, sin coste de red).
const RECONCILE_TTL_MS = 12 * 60 * 60 * 1000;

type LocalReview = {
  id: number;
  name: string;
  review: string;
  rating: number;
  grade: number | null;
  ts: number;
};

export type ReconcileOutcome = {
  added: number;
  removed: number;
  /** true si no se llegó a comparar nada (sin canal, sin listados o sello fresco). */
  skipped: boolean;
};

const NOOP_OUTCOME: ReconcileOutcome = { added: 0, removed: 0, skipped: true };

/**
 * El sello es contabilidad: que no se pueda escribir (sin IndexedDB) no invalida la pasada ya hecha.
 * `pending` se mantiene en true cuando la pasada NO convergió (tope `max` alcanzado): así la siguiente
 * apertura del hub continúa publicando el resto en vez de darse por satisfecha con el recuento.
 */
async function stamp(reviewCount: number, pending = false): Promise<void> {
  try {
    await patchLocalMeta({
      activityReconciledAt: Date.now(),
      activityReviewCount: reviewCount,
      pendingSocialActivity: pending,
    });
  } catch {
    // best-effort.
  }
}

/** Reseñas publicables de los listados, deduplicadas por id (gana la de `_ts` mayor) y ordenadas por fecha. */
function collectLocalReviews(games: TabData): LocalReview[] {
  const byId = new Map<number, LocalReview>();

  REVIEWABLE_TABS.forEach((tab) => {
    (games[tab] || []).forEach((game) => {
      const id = Number(game.id || 0);
      const name = String(game.name || '').trim();
      const review = String(game.review || '').trim();
      if (id <= 0 || !name || !review) {
        return;
      }
      const candidate: LocalReview = {
        id,
        name,
        review,
        rating: Number(game.score || 0),
        grade: typeof game.grade === 'number' ? game.grade : null,
        ts: Number(game._ts || 0),
      };
      const current = byId.get(id);
      if (!current || candidate.ts > current.ts) {
        byId.set(id, candidate);
      }
    });
  });

  return [...byId.values()].sort((a, b) => b.ts - a.ts);
}

/** Todos los ids de juego presentes en los listados (incluido 'p'): lo que NO está aquí es huérfano. */
function collectLocalGameIds(games: TabData): Set<number> {
  const ids = new Set<number>();
  TAB_IDS.forEach((tab) => {
    (games[tab] || []).forEach((game) => {
      const id = Number(game.id || 0);
      if (id > 0) {
        ids.add(id);
      }
    });
  });
  return ids;
}

/**
 * Sincroniza `activity[]` con las reseñas de `games`. Devuelve cuántas entradas se añadieron/retiraron.
 *
 * `games` debe ser el estado VIVO de los listados (no una foto tomada al montar una pantalla): la retirada de
 * huérfanas se decide con él. Aun así se aplican dos guardas contra el borrado indebido: no se hace nada si
 * los listados están vacíos (arranque a medio hidratar) y nunca se retira una entrada MÁS NUEVA que el reloj
 * de los listados locales (`games.updatedAt`), que es el caso de una reseña escrita en otro dispositivo cuyo
 * sync de juegos todavía no ha llegado aquí.
 */
export async function reconcileReviewActivity(input: {
  games: TabData;
  max?: number;
  /** Ignora el sello y el recuento (refresco manual / tras guardar el perfil). */
  force?: boolean;
}): Promise<ReconcileOutcome> {
  const { games, force = false } = input;
  const max = Math.max(1, input.max ?? DEFAULT_MAX_PUBLISHED);

  const localGameIds = collectLocalGameIds(games);
  if (localGameIds.size === 0) {
    return NOOP_OUTCOME; // listados sin hidratar: ni publicar ni (sobre todo) retirar nada
  }

  const localReviews = collectLocalReviews(games);
  const meta = await getLocalMeta();
  const pending = Boolean(meta?.pendingSocialActivity);
  const stampFresh = Boolean(meta?.activityReconciledAt && Date.now() - meta.activityReconciledAt < RECONCILE_TTL_MS);
  const countMatches = meta?.activityReviewCount === localReviews.length;
  if (!force && !pending && stampFresh && countMatches) {
    return NOOP_OUTCOME;
  }

  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    return NOOP_OUTCOME; // sin sesión de Google en este dispositivo no hay gist propio que reconciliar
  }

  const resolved = await resolveSocialChannel({ email: authUser.email });
  if (resolved.status !== 'ready') {
    return NOOP_OUTCOME;
  }
  const { token, gistId, etag } = resolved.channel;

  const socialRead = await readSocialGist(token, gistId, etag || null);
  const profileId = await resolveStableProfileId(authUser.uid);
  // Misma normalización de identidad que al publicar: sin esto, una entrada legacy indexada por uid no se
  // reconocería como publicada y se duplicaría.
  const baseData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });
  // PRIVACIDAD: el nombre público es el nick del gist, nunca el nombre real de Google.
  const actorName = String(baseData.profile.name || '').trim();

  const publishedGameIds = new Set(
    (baseData.activity || [])
      .filter((entry) => entry.type === 'review' && entry.actorProfileId === profileId)
      .map((entry) => entry.gameId),
  );

  let nextData: SocialGistData = baseData;
  let added = 0;
  let removed = 0;
  // ¿Quedan reseñas por publicar por encima del tope de esta pasada? Si sí, la pasada no converge y hay que
  // dejar la marca de pendiente para continuar en la siguiente (si no, el sello la daría por terminada).
  const capped = localReviews.filter((review) => !publishedGameIds.has(review.id)).length > max;

  // Alta de las reseñas que faltan, de más reciente a más antigua y con su fecha REAL (`_ts`): así una
  // biblioteca antigua no aterriza de golpe en la cabecera del feed de los amigos.
  for (const review of localReviews) {
    if (added >= max) {
      break;
    }
    if (publishedGameIds.has(review.id)) {
      continue;
    }
    const candidate = upsertReviewActivity(nextData, {
      actorProfileId: profileId,
      actorName,
      gameId: review.id,
      gameName: review.name,
      reviewText: review.review, // audit-allow: upsertReviewActivity lo convierte a snippet (no publica el review completo)
      rating: review.rating, // audit-allow: el canal social publica solo el rating redondeado
      grade: review.grade,
      timestamp: review.ts || Date.now(),
      bumpOrder: true,
    });
    if (candidate !== nextData) {
      nextData = candidate;
      added += 1;
    }
  }

  // Retirada de huérfanas: juego borrado o reseña vaciada. `localUpdatedAt` protege del borrado indebido
  // cuando estos listados son más viejos que la propia entrada (reseña recién escrita en otro dispositivo).
  const reviewedIds = new Set(localReviews.map((review) => review.id));
  const localUpdatedAt = Number(games.updatedAt || 0);
  const orphanCandidates = (baseData.activity || []).filter(
    (entry) =>
      entry.type === 'review' &&
      entry.actorProfileId === profileId &&
      !reviewedIds.has(entry.gameId) &&
      entry.updatedAt <= localUpdatedAt,
  );
  for (const entry of orphanCandidates) {
    const candidate = removeReviewActivity(nextData, { actorProfileId: profileId, gameId: entry.gameId });
    if (candidate !== nextData) {
      nextData = candidate;
      removed += 1;
    }
  }

  if (added === 0 && removed === 0) {
    await stamp(localReviews.length, capped);
    return { added: 0, removed: 0, skipped: false };
  }

  const writeResult = await writeSocialGist(token, gistId, { ...nextData, updatedAt: Date.now() });
  saveSocialSyncConfig({
    token,
    gistId,
    etag: writeResult.etag || etag || null,
    lastRemoteUpdatedAt: Date.now(),
  });
  // El feed sirve el directorio desde IndexedDB (TTL 30 min): sin invalidar, el propio autor no vería su
  // actividad recién reconciliada hasta que caducara.
  await invalidateCachedSocialDirectory(gistId);
  await stamp(localReviews.length, capped);

  return { added, removed, skipped: false };
}

/**
 * Marca que una publicación de actividad se ha perdido (canal sin armar, chunk que no baja, error de GitHub).
 * La próxima reconciliación lo detecta y fuerza la pasada aunque el sello esté fresco. Best-effort.
 */
export async function markPendingSocialActivity(): Promise<void> {
  try {
    // Solo se escribe si no estaba ya marcado: quien no usa lo social pasa por aquí en CADA guardado de reseña
    // y no tiene sentido reescribir `meta` cada vez.
    const meta = await getLocalMeta();
    if (meta?.pendingSocialActivity) {
      return;
    }
    await patchLocalMeta({ pendingSocialActivity: true });
  } catch {
    // best-effort: no puede romper el guardado del juego.
  }
}
