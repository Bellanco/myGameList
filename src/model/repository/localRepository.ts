import { LOCAL_SCHEMA_VERSION, STORAGE_KEY } from '../../core/constants/storageKeys';
import { LEGACY_STORAGE_KEYS, localStateNeedsUpgrade } from '../migration/legacyLocalStorage';
import { migrateData } from './migrateRepository';
import { loadIndexedDbState, saveIndexedDbState } from './indexedDbRepository';
import { TAB_IDS, type GameItem, type StoragePayload, type TabData, type TabId } from '../types/game';
import { clampRating } from '../../core/utils/normalize';
import { clampGrade } from '../../core/utils/scoreScale';
import { runWhenIdle } from '../../core/utils/idle';

const EMPTY_DATA: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };

function hasStoredData(payload: Pick<StoragePayload, 'c' | 'v' | 'e' | 'p' | 'deleted'>): boolean {
  return payload.c.length > 0 || payload.v.length > 0 || payload.e.length > 0 || payload.p.length > 0 || payload.deleted.length > 0;
}

function buildStoragePayload(parsed: Record<string, unknown>): StoragePayload {
  const source = parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : parsed;
  const migrated = migrateData(source);
  const normalized = normalizeData(migrated);

  return {
    ...normalized,
    updatedAt: Number(parsed.updatedAt ?? (parsed.meta as Record<string, unknown> | undefined)?.updatedAt ?? normalized.updatedAt),
    etag: String(parsed.etag ?? (parsed.meta as Record<string, unknown> | undefined)?.etag ?? '') || null,
    lastRemoteUpdatedAt: Number(parsed.lastRemoteUpdatedAt ?? (parsed.meta as Record<string, unknown> | undefined)?.lastRemoteUpdatedAt ?? 0),
  };
}

function getEmptyPayload(): StoragePayload {
  return {
    ...EMPTY_DATA,
    updatedAt: 0,
    etag: null,
    lastRemoteUpdatedAt: 0,
  };
}

function toList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((v) => String(v ?? '').split(/\n/))
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeGame(game: Record<string, unknown>, defaultTs: number, forceTimestamp: boolean): GameItem {
  return {
    id: Number(game.id || 0),
    _ts: forceTimestamp
      ? defaultTs
      : (() => {
          const ts = Number(game._ts);
          return Number.isFinite(ts) && ts > 0 ? ts : defaultTs;
        })(),
    name: String(game.name ?? '').trim(),
    genres: toList(game.genres),
    platforms: toList(game.platforms),
    strengths: toList(game.strengths),
    weaknesses: toList(game.weaknesses),
    reasons: toList(game.reasons),
    years: (Array.isArray(game.years) ? game.years : []).map(Number).filter(Number.isFinite),
    steamDeck: Boolean(game.steamDeck),
    replayable: Boolean(game.replayable),
    retry: Boolean(game.retry),
    review: String(game.review ?? '').trim(),
    score: clampRating(game.score),
    // F2: nota fina 0–100 (aditivo). Se preserva si viene; ausente → los lectores caen al `score` 0–5.
    grade: typeof game.grade === 'number' ? clampGrade(game.grade) : undefined,
    hours: (() => {
      const raw = (game as Record<string, unknown>).hours;
      if (raw === null || raw === undefined || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
    // Vergüenza: puntuación activada (opt-in). Se conserva solo si es true; ausente/false no se serializa.
    scored: game.scored ? true : undefined,
    listedAt: (() => {
      const n = Number(game.listedAt);
      if (Number.isFinite(n) && n > 0) return n;
      const ts = Number(game._ts);
      return Number.isFinite(ts) && ts > 0 ? ts : defaultTs; // legacy: aproxima con _ts
    })(),
    // Fecha de la reseña: se preserva tal cual y NUNCA la toca `forceTimestamp` — no es un reloj de merge, es un
    // dato del usuario. Ausente en juegos anteriores a este campo; los lectores caen a `_ts` mientras no exista.
    reviewedAt: (() => {
      const n = Number(game.reviewedAt);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })(),
  };
}

// Metadatos que NO son contenido: no deben hacer que un juego cuente como "cambiado".
const CONTENT_KEY_IGNORED = new Set(['_ts', '_v', 'listedAt', 'reviewedAt']);

/**
 * Contenido de un juego SIN sus metadatos, en forma canónica: para decidir si de verdad ha cambiado algo.
 * Las claves se ordenan a propósito — `JSON.stringify` respeta el orden de inserción, así que comparar objetos
 * construidos por caminos distintos (uno normalizado, otro recién parseado de un JSON) daría siempre distinto.
 */
function gameContentKey(game: GameItem): string {
  const entries = Object.entries(game as unknown as Record<string, unknown>)
    .filter(([key, value]) => !CONTENT_KEY_IGNORED.has(key) && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** Índice id → {juego, pestaña} de una referencia. La pestaña cuenta: moverse de lista ES un cambio. */
function indexGamesById(reference: TabData): Map<number, { game: GameItem; tab: TabId }> {
  const index = new Map<number, { game: GameItem; tab: TabId }>();
  TAB_IDS.forEach((tab) => {
    (reference[tab] || []).forEach((game) => {
      if (Number(game?.id) > 0) index.set(Number(game.id), { game, tab });
    });
  });
  return index;
}

export interface NormalizeDataOptions {
  /**
   * Sella `_ts = ahora` en TODOS los juegos y tumbas.
   *
   * CUIDADO: `_ts` es a la vez reloj del merge CRDT y fecha de modificación que ve el usuario, así que esto
   * borra de un plumazo la fecha de toda la biblioteca. Se conserva para casos en los que de verdad haga falta
   * un sello global; para importar/sobrescribir usa `bumpChangedAgainst`, que consigue el mismo efecto en el
   * merge sin reescribir lo que no ha cambiado.
   */
  forceTimestamp?: boolean;
  /**
   * Sella `_ts = ahora` SOLO en los juegos cuyo contenido difiera de esta referencia (o que no estén en ella).
   *
   * Es lo que necesita una importación: que lo importado gane el merge frente a otros dispositivos, sin tocar
   * la fecha de modificación de los juegos que llegan idénticos. Ignora `_ts`/`_v`/`listedAt` al comparar,
   * porque son metadatos, no contenido.
   */
  bumpChangedAgainst?: TabData;
}

export function normalizeData(data: TabData, options?: NormalizeDataOptions): TabData {
  const ts = Date.now();
  const forceTimestamp = Boolean(options?.forceTimestamp);
  const reference = options?.bumpChangedAgainst ? indexGamesById(options.bumpChangedAgainst) : null;

  const normalizeTab = (games: unknown[] | undefined, tab: TabId): GameItem[] =>
    (games || []).map((raw) => {
      const game = normalizeGame(raw as Record<string, unknown>, ts, forceTimestamp);
      if (!reference || forceTimestamp) {
        return game;
      }
      const previous = reference.get(game.id);
      // Nuevo, en otra lista o con contenido distinto → estrena `_ts` para ganar el merge. Idéntico y en la
      // misma lista → conserva su fecha de modificación.
      if (!previous || previous.tab !== tab || gameContentKey(previous.game) !== gameContentKey(game)) {
        return { ...game, _ts: ts };
      }
      return { ...game, _ts: previous.game._ts };
    });

  const normalized: TabData = {
    c: normalizeTab(data.c, 'c'),
    v: normalizeTab(data.v, 'v'),
    e: normalizeTab(data.e, 'e'),
    p: normalizeTab(data.p, 'p'),
    deleted: (data.deleted || [])
      .filter((item) => item && Number(item.id) > 0)
      .map((entry) => ({ id: Number(entry.id), _ts: forceTimestamp ? ts : Number(entry._ts) || ts })),
    updatedAt: Number(data.updatedAt || ts),
  };

  const usedIds = new Set<number>();
  let nextId = 1;

  for (const tab of [normalized.c, normalized.v, normalized.e, normalized.p]) {
    for (const game of tab) {
      const current = Number(game.id || 0);
      if (current > 0 && !usedIds.has(current)) {
        usedIds.add(current);
        nextId = Math.max(nextId, current + 1);
      } else {
        game.id = nextId;
        nextId += 1;
      }
    }
  }

  return normalized;
}

export function loadLocalState(): StoragePayload {
  // Lo pendiente de volcar es MÁS NUEVO que lo que hay en disco: servirlo desde memoria hace que la escritura
  // diferida sea invisible para el lector (ver la nota de `saveLocalState`).
  if (pendingState) {
    return pendingState;
  }

  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const payload = buildStoragePayload(parsed);

      // If we read from a legacy key, attempt to migrate to STORAGE_KEY and remove the old key
      if (key !== STORAGE_KEY) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // ignore quota errors on migration
        }
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore removal errors
        }
      }

      return payload;
    } catch {
      continue;
    }
  }

  return getEmptyPayload();
}

/** Lee y parsea el RAW de localStorage (clave actual) para el detector de auto-upgrade (sin normalizar). */
function readRawLocalStorage(): unknown {
  // Mismo motivo que en `loadLocalState`: si hay algo pendiente, ESE es el estado actual. Además ya viene
  // estampado con `schemaVersion`, así que el detector no lo confundirá con un formato viejo.
  if (pendingState) {
    return pendingState;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Carga el estado combinando localStorage + IndexedDB (`appState`) y devuelve además `wasLegacy`: si el
 * estado RAW de alguna de las dos fuentes está en forma vieja (campos legacy o sin `schemaVersion`). El
 * llamador usa `wasLegacy` para reescribir una sola vez el estado en formato nuevo (auto-upgrade).
 */
export async function loadLocalStateAsync(): Promise<{ payload: StoragePayload; wasLegacy: boolean }> {
  const localPayload = loadLocalState();
  const indexedPayload = await loadIndexedDbState();

  // Detección sobre el RAW (antes de normalizar, que borraría las marcas legacy).
  const wasLegacy = localStateNeedsUpgrade(readRawLocalStorage()) || localStateNeedsUpgrade(indexedPayload);

  if (!indexedPayload) {
    return { payload: localPayload, wasLegacy };
  }

  const normalizedIndexed = normalizeData(indexedPayload);
  const indexedState: StoragePayload = {
    ...normalizedIndexed,
    updatedAt: Number(indexedPayload.updatedAt || normalizedIndexed.updatedAt || Date.now()),
    etag: indexedPayload.etag || null,
    lastRemoteUpdatedAt: Number(indexedPayload.lastRemoteUpdatedAt || 0),
  };

  const localHasData = hasStoredData(localPayload);
  const indexedHasData = hasStoredData(indexedState);

  if (!localHasData && indexedHasData) {
    return { payload: indexedState, wasLegacy };
  }

  if (localHasData && !indexedHasData) {
    return { payload: localPayload, wasLegacy };
  }

  return { payload: indexedState.updatedAt > localPayload.updatedAt ? indexedState : localPayload, wasLegacy };
}

/* ── Escritura diferida a localStorage ───────────────────────────────────────────────────────────────────────
 *
 * EL PROBLEMA: `saveLocalState` corre en CADA edición y en cada persistencia del ciclo de sync, y hacía
 * `JSON.stringify` de la BIBLIOTECA ENTERA seguido de un `setItem` — las dos cosas síncronas y en el hilo
 * principal, con un coste proporcional al número de juegos. Es decir, el usuario pagaba la serialización
 * completa de su colección en el mismo fotograma en el que pulsaba "Guardar".
 *
 * LA SOLUCIÓN: IndexedDB se sigue escribiendo INMEDIATAMENTE (es asíncrono y no bloquea), y la copia de
 * localStorage se aplaza a un hueco ocioso. Varias ediciones seguidas se funden en una sola escritura.
 *
 * LAS DOS TRAMPAS, Y CÓMO SE CIERRAN:
 *
 *  1) Perder la última edición al cerrar la pestaña. Se vuelca de forma SÍNCRONA en `pagehide` y en
 *     `visibilitychange` a oculto (este último es el que sí dispara de forma fiable en móvil). `setItem` es
 *     síncrono, así que es seguro hacerlo ahí.
 *
 *  2) Que alguien lea localStorage y vea el estado viejo. Se evita sirviendo el pendiente desde memoria: los
 *     lectores (`loadLocalState`, el detector de formato legacy) consultan primero `pendingState`. Para todo
 *     el que lea a través de este módulo, el aplazamiento es INVISIBLE — que es justo lo que hace que este
 *     cambio no toque la semántica de arranque ni la precedencia entre localStorage e IndexedDB.
 */
let pendingState: StoragePayload | null = null;
let cancelScheduledFlush: (() => void) | null = null;
let flushListenersAttached = false;

let quotaWarningShown = false;

function writeToLocalStorageNow(payload: StoragePayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // Cuota u otro fallo de almacenamiento: IndexedDB ya tiene el dato y `loadLocalStateAsync` prefiere el más
    // reciente por `updatedAt`, así que el estado sobrevive igualmente y la app sigue funcionando.
    //
    // Pero AVISAR una vez importa: hasta ahora esto se tragaba en silencio, así que una biblioteca que hubiera
    // rebasado el tope de ~5 MB del origen habría dejado de escribir esta copia sin que nadie se enterara nunca.
    // Que degrade bien no quita que haya que poder diagnosticarlo.
    if (!quotaWarningShown) {
      quotaWarningShown = true;
      const motivo = error instanceof Error ? error.name || error.message : 'desconocido';
      console.warn(
        `[estado local] no se pudo escribir la copia de localStorage (${motivo}). ` +
          'IndexedDB conserva el estado y la app sigue funcionando; suele significar que la biblioteca ha superado el tope del navegador.',
      );
    }
  }
}

/** Vuelca YA lo que quede pendiente. Idempotente: sin nada pendiente no hace nada. */
export function flushLocalState(): void {
  cancelScheduledFlush?.();
  cancelScheduledFlush = null;
  if (pendingState) {
    const payload = pendingState;
    pendingState = null;
    writeToLocalStorageNow(payload);
  }
}

/** Se enganchan una sola vez y solo cuando de verdad hay algo que guardar (importar el módulo no debe tener efectos). */
function attachFlushListeners(): void {
  if (flushListenersAttached || typeof window === 'undefined') {
    return;
  }
  flushListenersAttached = true;
  window.addEventListener('pagehide', flushLocalState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushLocalState();
    }
  });
}

export function saveLocalState(payload: StoragePayload): void {
  // Estampa la versión del esquema: marca el estado como "nuevo" para que el auto-upgrade no se repita.
  const stamped: StoragePayload = { ...payload, schemaVersion: LOCAL_SCHEMA_VERSION };

  // IndexedDB, inmediato: es la copia que de verdad aguanta el crecimiento de la biblioteca (sin el tope de
  // ~5 MB del origen) y su escritura no bloquea el hilo principal.
  void saveIndexedDbState(stamped);

  pendingState = stamped;
  attachFlushListeners();
  cancelScheduledFlush?.();
  cancelScheduledFlush = runWhenIdle(flushLocalState);
}

export function parseImportedData(rawText: string): TabData {
  const parsed = JSON.parse(rawText) as unknown;
  return normalizeData(migrateData(parsed));
}
