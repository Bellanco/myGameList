import { TAB_IDS, type GameItem, type TabData, type TabId } from '../types/game';

// Helpers puros de la lógica de sync (diff de cambios remotos aplicados, detección de conflicto, log de errores).
// Extraídos de useSyncViewModel para mantener el hook centrado en orquestación.

type SyncOperation = 'initializeSync' | 'connectSync' | 'syncNow' | 'writeWithConflictRecovery' | 'completeGithubLoginFromRedirect';

interface SyncErrorLogEntry {
  timestamp: number;
  operation: SyncOperation;
  message: string;
}

const SYNC_ERROR_LOG_KEY = 'myGameList.syncErrorLog';
const SYNC_ERROR_LOG_LIMIT = 30;

export function isWriteConflict(error: unknown): boolean {
  return error instanceof Error && /Write failed:\s*409\b/.test(error.message);
}

function getLatestItems(data: TabData): Map<number, { item: GameItem; tab: TabId; ts: number }> {
  const map = new Map<number, { item: GameItem; tab: TabId; ts: number }>();

  for (const tab of TAB_IDS) {
    for (const game of data[tab]) {
      const ts = game._ts || data.updatedAt;
      const current = map.get(game.id);
      if (!current || ts >= current.ts) {
        map.set(game.id, { item: game, tab, ts });
      }
    }
  }

  return map;
}

function getLatestDeleted(data: TabData): Map<number, number> {
  return new Map((data.deleted || []).map((entry) => [entry.id, entry._ts || data.updatedAt]));
}

function getEntitySnapshot(
  items: Map<number, { item: GameItem; tab: TabId; ts: number }>,
  deleted: Map<number, number>,
  id: number,
): { kind: 'missing' | 'alive' | 'deleted'; tab?: TabId; ts: number } {
  const item = items.get(id);
  const deletedTs = deleted.get(id) || 0;

  if (!item && !deletedTs) {
    return { kind: 'missing', ts: 0 };
  }

  if (deletedTs > (item?.ts || 0)) {
    return { kind: 'deleted', ts: deletedTs };
  }

  if (item) {
    return { kind: 'alive', tab: item.tab, ts: item.ts };
  }

  return { kind: 'missing', ts: 0 };
}

function isSameSnapshot(
  a: { kind: 'missing' | 'alive' | 'deleted'; tab?: TabId; ts: number },
  b: { kind: 'missing' | 'alive' | 'deleted'; tab?: TabId; ts: number },
): boolean {
  return a.kind === b.kind && a.tab === b.tab && a.ts === b.ts;
}

export function countRemoteChangesApplied(localData: TabData, remoteData: TabData, mergedData: TabData): number {
  const localItems = getLatestItems(localData);
  const localDeleted = getLatestDeleted(localData);
  const remoteItems = getLatestItems(remoteData);
  const remoteDeleted = getLatestDeleted(remoteData);
  const mergedItems = getLatestItems(mergedData);
  const mergedDeleted = getLatestDeleted(mergedData);

  const remoteIds = new Set<number>();

  for (const tab of TAB_IDS) {
    for (const game of remoteData[tab]) {
      remoteIds.add(game.id);
    }
  }

  for (const entry of remoteData.deleted || []) {
    remoteIds.add(entry.id);
  }

  let count = 0;

  for (const id of remoteIds) {
    const localSnapshot = getEntitySnapshot(localItems, localDeleted, id);
    const remoteSnapshot = getEntitySnapshot(remoteItems, remoteDeleted, id);
    const mergedSnapshot = getEntitySnapshot(mergedItems, mergedDeleted, id);

    if (!isSameSnapshot(mergedSnapshot, localSnapshot) && isSameSnapshot(mergedSnapshot, remoteSnapshot)) {
      count += 1;
    }
  }

  return count;
}

export function logSyncError(operation: SyncOperation, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const entry: SyncErrorLogEntry = {
    timestamp: Date.now(),
    operation,
    message,
  };

  try {
    const raw = localStorage.getItem(SYNC_ERROR_LOG_KEY);
    const parsed = raw ? (JSON.parse(raw) as SyncErrorLogEntry[]) : [];
    const next = [...parsed, entry].slice(-SYNC_ERROR_LOG_LIMIT);
    localStorage.setItem(SYNC_ERROR_LOG_KEY, JSON.stringify(next)); // audit-allow: log de errores de sync (no son datos privados de juego)
  } catch {
    // Silent fallback: app flow should not break if logging fails.
  }
}
