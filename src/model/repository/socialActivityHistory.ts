// Auditoría de las fechas de publicación de MIS reseñas contra el historial del gist social.
//
// Contexto: la app solo guarda `_ts` (última modificación del juego) y `listedAt` (llegada a la lista). Cuando
// una operación en bloque reescribe `_ts` de toda la biblioteca, se pierde la única pista local de cuándo se
// escribió cada reseña — y una reconciliación que publique con `_ts` estampa esa fecha en bloque en el feed.
//
// El historial de revisiones del gist es el ÚNICO sitio donde sobreviven las fechas de publicación reales: las
// revisiones de un gist son inmutables y GitHub las conserva todas. Este módulo las localiza SIN ESCRIBIR NADA,
// para poder decidir con datos si merece la pena restaurarlas.
import { TAB_IDS } from '../types/game';
import { getCurrentSocialAuthUser } from './firebaseRepository';
import {
  listOwnSocialGists,
  readSocialGist,
  readSocialGistAtRevision,
  readSocialGistHistory,
  saveSocialSyncConfig,
  writeSocialGist,
} from './gistRepository';
import { invalidateCachedSocialDirectory } from './indexedDbRepository';
import { loadLocalState } from './localRepository';
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
  /**
   * Reparto por día de las fechas publicadas (gist) frente a la última modificación de los juegos (`_ts`
   * local, lo que muestra la pestaña Reseñas). Si ambas columnas coinciden, feed y listado están de acuerdo.
   */
  datesByDay: Array<{ day: string; enGist: number; enListado: number }>;
}

/** A partir de cuántas reseñas compartiendo el MISMO día de `_ts` se considera que ese día es un sello en bloque. */
const BULK_STAMP_MIN_REVIEWS = 10;
// Margen para considerar que una entrada se publicó "con el `_ts` del juego" (backfill) y no en su día.
const SAME_STAMP_TOLERANCE_MS = 60 * 60 * 1000;

export interface HistoryDateFixPlan {
  /** Entradas que se moverían a la fecha ancla (histórico sin fecha real). */
  toMove: Array<{ gameId: number; gameName: string; from: number; to: number }>;
  /** Entradas que CONSERVAN su fecha porque se publicaron en su día. */
  keeping: Array<{ gameId: number; gameName: string; date: number }>;
  /** Días de `_ts` local detectados como sello en bloque (importación / sobrescritura). */
  bulkDays: string[];
  anchor: number;
  applied: boolean;
}

/** Fecha ancla a mediodía UTC: así el día no baila con la zona horaria al renderizar. */
function anchorFromDay(day: string): number {
  const parsed = Date.parse(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Fecha ancla inválida: ${day} (formato AAAA-MM-DD)`);
  }
  return parsed;
}

/**
 * Reasigna a una fecha ancla las entradas de reseña que se publicaron con un `_ts` sellado en bloque — el
 * histórico que no tiene fecha real en ninguna parte — dejando INTACTAS las que se publicaron en su día.
 *
 * El discriminante no es una fecha a mano: se detectan los días en los que MUCHAS reseñas comparten el mismo
 * `_ts` local (huella de `normalizeData({ forceTimestamp: true })`, que es lo que hacen la importación de JSON y
 * la sobrescritura del remoto) y solo se mueven las entradas cuya fecha publicada coincide con ese sello. Una
 * entrada publicada en su día tiene fecha MUY distinta de ese `_ts`, así que queda fuera por construcción.
 *
 * Por defecto es un SIMULACRO: devuelve el plan sin escribir. Con `apply: true` escribe una vez.
 */
export async function repairUndatedHistoryDates(options: {
  /** Día ancla `AAAA-MM-DD` para el histórico sin fecha. */
  date: string;
  apply?: boolean;
}): Promise<HistoryDateFixPlan | null> {
  const anchor = anchorFromDay(options.date);
  const apply = Boolean(options.apply);

  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) return null;
  const resolved = await resolveSocialChannel({ email: authUser.email });
  if (resolved.status !== 'ready') return null;
  const { token, gistId, etag } = resolved.channel;

  const socialRead = await readSocialGist(token, gistId, null);
  const local = loadLocalState();

  // `_ts` local por juego + reparto por día, para detectar los sellos en bloque.
  const tsByGame = new Map<number, number>();
  TAB_IDS.forEach((tab) => {
    (local[tab] || []).forEach((game) => {
      const ts = Number(game._ts || 0) || Number(game.listedAt || 0);
      if (game.id > 0 && ts > 0 && String(game.review || '').trim()) {
        tsByGame.set(game.id, ts);
      }
    });
  });
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const perDay = new Map<string, number>();
  tsByGame.forEach((ts) => perDay.set(dayOf(ts), (perDay.get(dayOf(ts)) || 0) + 1));
  const bulkDays = [...perDay.entries()]
    .filter(([, count]) => count >= BULK_STAMP_MIN_REVIEWS)
    .map(([day]) => day)
    .sort();
  const isBulkDay = new Set(bulkDays);

  const toMove: HistoryDateFixPlan['toMove'] = [];
  const keeping: HistoryDateFixPlan['keeping'] = [];

  const nextActivity = (socialRead.data.activity || []).map((entry) => {
    if (entry.type !== 'review') return entry;
    const localTs = tsByGame.get(entry.gameId) || 0;
    const sellada = localTs > 0 && isBulkDay.has(dayOf(localTs)) && Math.abs(entry.updatedAt - localTs) <= SAME_STAMP_TOLERANCE_MS;
    if (!sellada) {
      keeping.push({ gameId: entry.gameId, gameName: entry.gameName, date: entry.updatedAt });
      return entry;
    }
    // Un segundo de separación por entrada: mismo día, orden estable (56 entradas no salen del día).
    const target = anchor - toMove.length * 1000;
    toMove.push({ gameId: entry.gameId, gameName: entry.gameName, from: entry.updatedAt, to: target });
    return { ...entry, createdAt: target, updatedAt: target };
  });

  if (apply && toMove.length > 0) {
    const writeResult = await writeSocialGist(token, gistId, {
      ...socialRead.data,
      activity: nextActivity,
      updatedAt: Date.now(),
    });
    saveSocialSyncConfig({
      token,
      gistId,
      etag: writeResult.etag || etag || null,
      lastRemoteUpdatedAt: Date.now(),
    });
    await invalidateCachedSocialDirectory(gistId);
  }

  return { toMove, keeping, bulkDays, anchor, applied: apply && toMove.length > 0 };
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

  // Reparto por día: fecha publicada (gist) vs `_ts` local del mismo juego. Deja ver de un vistazo si el feed y
  // la pestaña Reseñas están mostrando lo mismo y cuántos días distintos hay de verdad.
  const local = loadLocalState();
  const tsByGame = new Map<number, number>();
  TAB_IDS.forEach((tab) => {
    (local[tab] || []).forEach((game) => {
      const ts = Number(game._ts || 0) || Number(game.listedAt || 0);
      if (game.id > 0 && ts > 0) tsByGame.set(game.id, ts);
    });
  });
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const byDay = new Map<string, { enGist: number; enListado: number }>();
  const bump = (key: string, campo: 'enGist' | 'enListado') => {
    const current = byDay.get(key) || { enGist: 0, enListado: 0 };
    current[campo] += 1;
    byDay.set(key, current);
  };
  for (const [gameId, entry] of currentByGame) {
    bump(day(entry.updatedAt), 'enGist');
    const ts = tsByGame.get(gameId);
    if (ts) bump(day(ts), 'enListado');
  }
  const datesByDay = [...byDay.entries()]
    .map(([d, counts]) => ({ day: d, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    gistId,
    totalRevisions,
    scannedRevisions,
    publishedNow: currentByGame.size,
    recoverable,
    withoutOlderDate,
    inspected,
    datesByDay,
  };
}
