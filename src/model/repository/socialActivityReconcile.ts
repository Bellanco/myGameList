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
import { reconcileMoveChannels } from '../../core/social/moveActivity';
import { feedRecentSince } from '../../core/constants/socialLimits';
import type { TabData } from '../types/game';
import { TAB_IDS } from '../types/game';
import { getCurrentSocialAuthUser, resolveStableProfileId } from './firebaseRepository';
import { readSocialGist, remapSocialActorIds, removeReviewActivity, saveSocialSyncConfig, syncMoveActivity, upsertReviewActivity, writeSocialGist, type SocialGistData } from './socialGistRepository';
import { getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta } from './indexedDbRepository';
import { resolveSocialChannel } from './socialChannel';
import { serializeSocialWrite } from './socialWriteQueue';
import { activityStampChanged, collectLocalReviews, countLocalMoves, RECONCILE_LOGIC_VERSION } from '../../core/social/activityStamp';

// La versión de la lógica vive con el resto del sello (`core/social/activityStamp`); se reexporta desde aquí, que es
// donde la buscaba todo el mundo.
export { RECONCILE_LOGIC_VERSION };

// Tope de reseñas que se publican en una pasada (las más recientes). Acota el tamaño del gist en bibliotecas
// grandes; no afecta a la retirada de huérfanas, que sí considera TODOS los listados.
const DEFAULT_MAX_PUBLISHED = 60;
// Ventana del sello: sin cambios en el recuento de reseñas y sin publicación pendiente, no se vuelve a mirar
// el gist dentro de este plazo (la comprobación del recuento es en memoria, sin coste de red).
const RECONCILE_TTL_MS = 12 * 60 * 60 * 1000;
// Margen para no re-sellar fechas por diferencias de milisegundos: al guardar una reseña, `_ts` del juego y la
// fecha de la publicación se estampan en la misma operación, con unos ms de diferencia.
const DATE_REPAIR_MIN_GAP_MS = 60 * 60 * 1000;

export type ReconcileOutcome = {
  added: number;
  removed: number;
  /** Entradas mías re-indexadas a mi `profileId` actual (venían de un uid legacy o de otro dispositivo). */
  relinked: number;
  /** Entradas cuya fecha publicada era POSTERIOR a la del juego y se ha devuelto a la real. */
  repaired: number;
  /** F4: mensajes de lista publicados tras la pasada (0 si el canal no cambió). */
  moves: number;
  /** true si no se llegó a comparar nada (sin canal, sin listados o sello fresco). */
  skipped: boolean;
  /** Por qué se saltó. `sin-listados` es reintentable: los juegos aún no estaban cargados. */
  reason?: 'sin-listados' | 'sello-fresco' | 'sin-sesion' | 'sin-canal';
};

function skip(reason: NonNullable<ReconcileOutcome['reason']>): ReconcileOutcome {
  return { added: 0, removed: 0, relinked: 0, repaired: 0, moves: 0, skipped: true, reason };
}

/**
 * ¿Ha cambiado algo que haya que escribir en el gist?
 *
 * `moves` NO entra en la cuenta: es el recuento de mensajes que quedan publicados, no de cambios (una pasada sin
 * novedades lo deja en el mismo número que ya había). Que los mensajes cambiaron se sabe por otra vía, la única
 * fiable: que `syncMoveActivity` devolviera un objeto distinto.
 */
function hasChanges(outcome: ReconcileOutcome, movesChanged = false): boolean {
  return movesChanged || outcome.added > 0 || outcome.removed > 0 || outcome.relinked > 0 || outcome.repaired > 0;
}

/**
 * El sello es contabilidad: que no se pueda escribir (sin IndexedDB) no invalida la pasada ya hecha.
 * `pending` se mantiene en true cuando la pasada NO convergió (tope `max` alcanzado): así la siguiente
 * apertura del hub continúa publicando el resto en vez de darse por satisfecha con el recuento.
 */
async function stamp(reviewCount: number, moveCount: number, pending = false): Promise<void> {
  try {
    await patchLocalMeta({
      activityReconciledAt: Date.now(),
      activityReviewCount: reviewCount,
      // F4: el recuento de MENSAJES va aparte del de reseñas, y no es contabilidad de adorno: mover un juego de
      // lista no cambia el número de reseñas, así que sin esto el sello fresco daba la pasada por hecha y la
      // actividad de lista no subía hasta doce horas después.
      activityMoveCount: moveCount,
      activityReconcileVersion: RECONCILE_LOGIC_VERSION,
      pendingSocialActivity: pending,
    });
  } catch {
    // best-effort.
  }
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
 * Sincroniza `activity[]` con las reseñas de `games` y `moves[]` con sus sellos de lista. Devuelve cuántas
 * entradas se añadieron/retiraron y cuántos mensajes de lista quedan publicados.
 *
 * `games` debe ser el estado VIVO de los listados (no una foto tomada al montar una pantalla): la retirada de
 * huérfanas se decide con él. Aun así se aplican dos guardas contra el borrado indebido: no se hace nada si
 * los listados están vacíos (arranque a medio hidratar) y nunca se retira una entrada MÁS NUEVA que el reloj
 * de los listados locales (`games.updatedAt`), que es el caso de una reseña escrita en otro dispositivo cuyo
 * sync de juegos todavía no ha llegado aquí.
 */
export function reconcileReviewActivity(input: Parameters<typeof reconcileReviewActivityNow>[0]): Promise<ReconcileOutcome> {
  // En fila con el resto de escrituras del canal social (ver `serializeSocialWrite`).
  return serializeSocialWrite(() => reconcileReviewActivityNow(input));
}

async function reconcileReviewActivityNow(input: {
  games: TabData;
  max?: number;
  /** Ignora el sello y el recuento (refresco manual / tras guardar el perfil). */
  force?: boolean;
}): Promise<ReconcileOutcome> {
  const { games, force = false } = input;
  const max = Math.max(1, input.max ?? DEFAULT_MAX_PUBLISHED);

  const localGameIds = collectLocalGameIds(games);
  if (localGameIds.size === 0) {
    // Listados sin hidratar (el hub puede montarse antes de que carguen): ni publicar ni, sobre todo, retirar
    // nada. Es reintentable — el llamador vuelve a intentarlo cuando los listados cambian.
    return skip('sin-listados');
  }

  const localReviews = collectLocalReviews(games);
  const meta = await getLocalMeta();
  const stampFresh = Boolean(meta?.activityReconciledAt && Date.now() - meta.activityReconciledAt < RECONCILE_TTL_MS);
  // Lo que decide si hay algo nuevo (recuentos, versión y pendiente) vive en `core/social/activityStamp`, porque lo
  // pregunta también la pasada de fondo de la app principal, que no puede cargar este módulo para saberlo.
  const localMoveCount = countLocalMoves(games);
  if (!force && stampFresh && !activityStampChanged(meta, { reviewCount: localReviews.length, moveCount: localMoveCount })) {
    return skip('sello-fresco');
  }

  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    return skip('sin-sesion'); // sin sesión de Google en este dispositivo no hay gist propio que reconciliar
  }

  const resolved = await resolveSocialChannel({ email: authUser.email });
  if (resolved.status !== 'ready') {
    return skip('sin-canal');
  }
  const { token, gistId, etag } = resolved.channel;

  const socialRead = await readSocialGist(token, gistId, etag || null);
  const profileId = await resolveStableProfileId(authUser.uid);
  const remapped = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });
  const tsByGameId = new Map(localReviews.map((review) => [review.id, review.ts] as const));
  const localUpdatedAt = Number(games.updatedAt || 0);

  let relinked = 0;
  let repaired = 0;

  // IDENTIDAD + FECHAS de mis entradas de reseña, antes de decidir qué falta por publicar.
  //
  // Identidad: en MI gist toda entrada de reseña es mía, publicada bajo el id que tocara entonces (uid legacy,
  // el UUID que generó otro dispositivo antes de que existiera `privateConfig`, o mi profileId actual).
  // `remapSocialActorIds` solo cubre el uid, así que aquí se reindexan TODAS a mi profileId CONSERVANDO fechas.
  // Sin esto, una reseña publicada bajo un id antiguo no se reconocía como publicada: se añadía un duplicado y
  // `dedupeActivityByGame` (que colapsa por `(gameId, type)` quedándose con el `updatedAt` mayor) borraba la
  // original con su fecha. Es decir: la reseña ya publicada DESAPARECÍA y reaparecía con otra fecha.
  //
  // Fechas: una entrada mía nunca debe ser POSTERIOR a la última modificación del juego, que es la fecha que
  // muestra el listado. Si lo es, viene de un sellado con "ahora" (el fallo del backfill) y se devuelve a la
  // real. El caso legítimo contrario —editar el juego DESPUÉS de publicar, que deja `_ts` por delante— no se
  // toca: así se respeta que sincronizar solo nota/nombre no recoloque la tarjeta en el feed.
  const alignedActivity = (remapped.activity || []).map((entry) => {
    if (entry.type !== 'review') {
      return entry;
    }
    let next = entry;

    if (entry.actorProfileId !== profileId) {
      const key = `${profileId}:${entry.gameId}:review`;
      next = { ...next, actorProfileId: profileId, key, id: key };
      relinked += 1;
    }

    // `localTs > 0`: sin fecha en el juego no se toca la publicada (nunca se borra una fecha real por falta de
    // datos locales). La corrección es idempotente y converge a "la tarjeta muestra la fecha del listado".
    const localTs = tsByGameId.get(entry.gameId) || 0;
    const gap = entry.updatedAt - localTs;
    if (localTs > 0 && gap > DATE_REPAIR_MIN_GAP_MS) {
      next = { ...next, updatedAt: localTs, createdAt: Math.min(next.createdAt, localTs) };
      repaired += 1;
    }

    return next;
  });

  const baseData: SocialGistData = { ...remapped, activity: alignedActivity };
  // PRIVACIDAD: el nombre público es el nick del gist, nunca el nombre real de Google.
  const actorName = String(baseData.profile.name || '').trim();

  // Ya publicada = existe entrada de reseña para ese juego, con INDEPENDENCIA del actor con el que se publicó
  // (tras el realineado son todas mías, pero se comprueba por juego para no volver a caer en el duplicado).
  const publishedGameIds = new Set(
    (baseData.activity || []).filter((entry) => entry.type === 'review').map((entry) => entry.gameId),
  );

  let nextData: SocialGistData = baseData;
  let added = 0;
  let removed = 0;
  // ¿Quedan reseñas por publicar por encima del tope de esta pasada? Si sí, la pasada no converge y hay que
  // dejar la marca de pendiente para continuar en la siguiente (si no, el sello la daría por terminada).
  const capped = localReviews.filter((review) => !publishedGameIds.has(review.id)).length > max;

  // Alta de las reseñas que faltan, de más reciente a más antigua y con su fecha REAL: así una biblioteca
  // antigua no aterriza de golpe en la cabecera del feed de los amigos.
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
      // Sin fecha en el juego (ni `_ts` ni `listedAt`), la del listado antes que "ahora".
      timestamp: review.ts || localUpdatedAt || Date.now(),
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
  const orphanCandidates = (baseData.activity || []).filter(
    (entry) =>
      entry.type === 'review' &&
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

  // F4 — MENSAJES DE LISTA. Proyección de los sellos `enteredAt` (ver `core/social/moveActivity`), no una cola de
  // eventos: se recalcula entera en cada pasada, así que el histórico de quien ya tenía los sellos entra solo y no
  // hay nada que se pueda quedar a medias. Las listas que el usuario esconde no publican en `moves`: van a
  // `hiddenMoves`, que solo enseña la administración.
  const target = reconcileMoveChannels({
    games,
    published: baseData,
    hiddenTabs: baseData.profile.visibility?.hiddenTabs || [],
    knownGameIds: localGameIds,
    // El reloj de los listados es lo que da (o quita) autoridad para retirar un mensaje huérfano, igual que en
    // las reseñas: con unos listados más viejos que el mensaje, no se retira nada.
    localUpdatedAt,
    since: feedRecentSince(Date.now()),
  });
  const now = Date.now();
  const withMoves = syncMoveActivity(syncMoveActivity(nextData, target.moves, now), target.hiddenMoves, now, 'hiddenMoves');
  const movesChanged = withMoves !== nextData;
  nextData = withMoves;

  const outcome: ReconcileOutcome = { added, removed, relinked, repaired, moves: nextData.moves?.length || 0, skipped: false };

  // Traza de la pasada (una por visita al hub, y solo cuando de verdad ha comparado): permite distinguir
  // "no cambió nada" de "no se ejecutó" sin instrumentar nada más.
  console.warn(
    `[social] reconciliación: ${localReviews.length} reseñas locales, ${publishedGameIds.size} publicadas` +
      ` → +${added} nuevas, -${removed} retiradas, ${relinked} reindexadas, ${repaired} fechas corregidas` +
      `; mensajes de lista: ${outcome.moves} publicados${movesChanged ? ' (actualizados)' : ''}`,
  );

  if (!hasChanges(outcome, movesChanged)) {
    await stamp(localReviews.length, localMoveCount, capped);
    return outcome;
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
  await stamp(localReviews.length, localMoveCount, capped);

  return outcome;
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
