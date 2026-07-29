import { LOCAL_SCHEMA_VERSION, STORAGE_KEY } from '../../core/constants/storageKeys';
import { LEGACY_STORAGE_KEYS, localStateNeedsUpgrade } from '../migration/legacyLocalStorage';
import { migrateData } from './migrateRepository';
import { loadIndexedDbState, saveIndexedDbState } from './indexedDbRepository';
import { TAB_IDS, type GameItem, type StoragePayload, type TabData, type TabId } from '../types/game';
import { clampRating } from '../../core/utils/normalize';
import { clampGrade } from '../../core/utils/scoreScale';

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

export function saveLocalState(payload: StoragePayload): void {
  // Estampa la versión del esquema: marca el estado como "nuevo" para que el auto-upgrade no se repita.
  const stamped: StoragePayload = { ...payload, schemaVersion: LOCAL_SCHEMA_VERSION };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
  } catch {
    // Ignore quota/storage errors and rely on IndexedDB fallback.
  }

  void saveIndexedDbState(stamped);
}

export function parseImportedData(rawText: string): TabData {
  const parsed = JSON.parse(rawText) as unknown;
  return normalizeData(migrateData(parsed));
}
