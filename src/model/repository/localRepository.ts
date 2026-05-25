import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from '../../core/constants/storageKeys';
import { migrateData } from './migrateRepository';
import { loadIndexedDbState, saveIndexedDbState } from './indexedDbRepository';
import type { GameItem, StoragePayload, TabData } from '../types/game';

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
    score: Number.isFinite(Number(game.score)) ? Math.max(0, Math.min(5, Number(game.score))) : 0,
    hours: (() => {
      const raw = (game as Record<string, unknown>).hours;
      if (raw === null || raw === undefined || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
  };
}

export function normalizeData(data: TabData, options?: { forceTimestamp?: boolean }): TabData {
  const ts = Date.now();
  const forceTimestamp = Boolean(options?.forceTimestamp);
  const normalized: TabData = {
    c: (data.c || []).map((game) => normalizeGame(game as unknown as Record<string, unknown>, ts, forceTimestamp)),
    v: (data.v || []).map((game) => normalizeGame(game as unknown as Record<string, unknown>, ts, forceTimestamp)),
    e: (data.e || []).map((game) => normalizeGame(game as unknown as Record<string, unknown>, ts, forceTimestamp)),
    p: (data.p || []).map((game) => normalizeGame(game as unknown as Record<string, unknown>, ts, forceTimestamp)),
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

export async function loadLocalStateAsync(): Promise<StoragePayload> {
  const localPayload = loadLocalState();
  const indexedPayload = await loadIndexedDbState();

  if (!indexedPayload) {
    return localPayload;
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
    return indexedState;
  }

  if (localHasData && !indexedHasData) {
    return localPayload;
  }

  return indexedState.updatedAt > localPayload.updatedAt ? indexedState : localPayload;
}

export function saveLocalState(payload: StoragePayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/storage errors and rely on IndexedDB fallback.
  }

  void saveIndexedDbState(payload);
}

export function createExportBlob(data: TabData): Blob {
  return new Blob([
    JSON.stringify(
      {
        c: data.c,
        v: data.v,
        e: data.e,
        p: data.p,
      },
      null,
      2,
    ),
  ], { type: 'application/json' });
}

export function parseImportedData(rawText: string): TabData {
  const parsed = JSON.parse(rawText) as unknown;
  return normalizeData(migrateData(parsed));
}
