// Auditoría de las fechas de publicación de MIS reseñas contra el historial del gist social.
//
// Contexto: la app solo guarda `_ts` (última modificación del juego) y `listedAt` (llegada a la lista). Cuando
// una operación en bloque reescribe `_ts` de toda la biblioteca, se pierde la única pista local de cuándo se
// escribió cada reseña — y una reconciliación que publique con `_ts` estampa esa fecha en bloque en el feed.
//
// El historial de revisiones del gist es el ÚNICO sitio donde sobreviven las fechas de publicación reales: las
// revisiones de un gist son inmutables y GitHub las conserva todas. Este módulo las localiza SIN ESCRIBIR NADA,
// para poder decidir con datos si merece la pena restaurarlas.
import { getCurrentSocialAuthUser } from './firebaseRepository';
import { listOwnSocialGists, readSocialGistAtRevision, readSocialGistHistory, readSocialGist } from './gistRepository';
import { resolveSocialChannel } from './socialChannel';

/** Cuántas revisiones se recorren como máximo POR GIST (1 llamada autenticada por revisión). */
const DEFAULT_MAX_REVISIONS = 60;

export interface DateCandidate {
  gameId: number;
  gameName: string;
  /** Fecha que la entrada tiene AHORA publicada. */
  currentUpdatedAt: number;
  /** Fecha más antigua encontrada en el historial (la de publicación original). */
  originalUpdatedAt: number;
  originalCreatedAt: number;
  /** Revisión de la que sale la fecha original. */
  fromRevision: string;
  revisionCommittedAt: number;
  /** Gist del que sale (el actual, o uno abandonado por un clonado anterior). */
  fromGistId: string;
}

/** Gist social de la cuenta que se ha inspeccionado, con lo que aporta. */
export interface InspectedGist {
  gistId: string;
  isCurrent: boolean;
  revisions: number;
  scannedRevisions: number;
  /** Entradas de reseña distintas vistas en todo su historial. */
  reviewEntries: number;
  /** Fecha de publicación más antigua encontrada en él (0 si ninguna). */
  oldestDate: number;
}

export interface DateAuditReport {
  gistId: string;
  /** Revisiones que tiene el gist ACTUAL en total y cuántas se han recorrido. */
  totalRevisions: number;
  scannedRevisions: number;
  /** Entradas de reseña publicadas ahora mismo. */
  publishedNow: number;
  /** Entradas cuya fecha original se puede restaurar (difiere de la actual en más de una hora). */
  recoverable: DateCandidate[];
  /** Entradas publicadas para las que el historial recorrido no ofrece una fecha anterior. */
  withoutOlderDate: number;
  /** Todos los gists sociales de la cuenta que se han inspeccionado (incluidos los abandonados). */
  inspected: InspectedGist[];
}

/**
 * Recorre el historial del gist social propio y devuelve qué fechas de publicación se podrían restaurar.
 * SOLO LECTURA: no escribe en el gist, ni en Firestore, ni en `meta`.
 */
export async function auditPublishedReviewDates(options?: { maxRevisions?: number }): Promise<DateAuditReport | null> {
  const maxRevisions = Math.max(1, options?.maxRevisions ?? DEFAULT_MAX_REVISIONS);

  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    return null;
  }
  const resolved = await resolveSocialChannel({ email: authUser.email });
  if (resolved.status !== 'ready') {
    return null;
  }
  const { token, gistId } = resolved.channel;

  // Estado ACTUAL: qué reseñas están publicadas y con qué fecha. Se compara por `gameId` porque la identidad
  // del actor pudo cambiar entre revisiones (uid legacy → profileId → profileId de otro dispositivo).
  const current = await readSocialGist(token, gistId, null);
  const currentByGame = new Map(
    (current.data.activity || [])
      .filter((entry) => entry.type === 'review')
      .map((entry) => [entry.gameId, entry] as const),
  );

  // Gists sociales a inspeccionar: el actual y los ABANDONADOS de la cuenta. `updateGistPrivacy` clonaba el
  // gist a un id nuevo ante cualquier fallo de la comprobación de visibilidad, y el original —con el historial
  // de fechas reales— quedaba huérfano. Un historial corto en el gist actual es la señal de que hubo clonado.
  let candidateGists = [gistId];
  try {
    const own = await listOwnSocialGists(token);
    candidateGists = [gistId, ...own.map((entry) => entry.gistId).filter((id) => id !== gistId)];
  } catch {
    // Sin permiso de listado o red caída: se sigue con el gist actual.
  }

  // Fecha más ANTIGUA vista para cada juego en TODO lo inspeccionado: la de su publicación original.
  const oldestByGame = new Map<
    number,
    { createdAt: number; updatedAt: number; version: string; committedAt: number; gistId: string }
  >();
  const inspected: InspectedGist[] = [];
  let totalRevisions = 0;
  let scannedRevisions = 0;

  for (const candidate of candidateGists) {
    let history: Awaited<ReturnType<typeof readSocialGistHistory>> = [];
    try {
      history = await readSocialGistHistory(token, candidate);
    } catch {
      continue; // gist borrado o sin acceso
    }
    const scanned = history.slice(0, maxRevisions);
    const seenGames = new Set<number>();
    let oldestHere = 0;

    for (const revision of scanned) {
      let data;
      try {
        data = await readSocialGistAtRevision(token, candidate, revision.version);
      } catch {
        continue; // una revisión ilegible no invalida el resto del recorrido
      }
      for (const entry of data.activity || []) {
        if (entry.type !== 'review') {
          continue;
        }
        seenGames.add(entry.gameId);
        if (!oldestHere || entry.updatedAt < oldestHere) {
          oldestHere = entry.updatedAt;
        }
        // Solo interesan los juegos que HOY están publicados: son los que se podrían corregir.
        if (!currentByGame.has(entry.gameId)) {
          continue;
        }
        const best = oldestByGame.get(entry.gameId);
        if (!best || entry.updatedAt < best.updatedAt) {
          oldestByGame.set(entry.gameId, {
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            version: revision.version,
            committedAt: revision.committedAt,
            gistId: candidate,
          });
        }
      }
    }

    inspected.push({
      gistId: candidate,
      isCurrent: candidate === gistId,
      revisions: history.length,
      scannedRevisions: scanned.length,
      reviewEntries: seenGames.size,
      oldestDate: oldestHere,
    });
    if (candidate === gistId) {
      totalRevisions = history.length;
      scannedRevisions = scanned.length;
    }
  }

  const HORA = 60 * 60 * 1000;
  const recoverable: DateCandidate[] = [];
  let withoutOlderDate = 0;

  for (const [gameId, entry] of currentByGame) {
    const best = oldestByGame.get(gameId);
    if (!best || entry.updatedAt - best.updatedAt <= HORA) {
      withoutOlderDate += 1;
      continue;
    }
    recoverable.push({
      gameId,
      gameName: entry.gameName,
      currentUpdatedAt: entry.updatedAt,
      originalUpdatedAt: best.updatedAt,
      originalCreatedAt: Math.min(best.createdAt || best.updatedAt, best.updatedAt),
      fromRevision: best.version,
      revisionCommittedAt: best.committedAt,
      fromGistId: best.gistId,
    });
  }

  recoverable.sort((a, b) => a.originalUpdatedAt - b.originalUpdatedAt);

  return {
    gistId,
    totalRevisions,
    scannedRevisions,
    publishedNow: currentByGame.size,
    recoverable,
    withoutOlderDate,
    inspected,
  };
}
