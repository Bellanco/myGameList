import { STORAGE_KEY } from '../../core/constants/storageKeys';

const SYNC_STATE_KEY = `${STORAGE_KEY}.syncState`;

export interface SyncDirtyState {
  isDirty: boolean;
  dirtyAt: number;
}

export function loadSyncDirtyState(): SyncDirtyState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return { isDirty: false, dirtyAt: 0 };
    const parsed = JSON.parse(raw) as Partial<SyncDirtyState> | null;
    if (!parsed) return { isDirty: false, dirtyAt: 0 };
    return {
      isDirty: Boolean(parsed.isDirty),
      dirtyAt: Number(parsed.dirtyAt || 0),
    };
  } catch {
    return { isDirty: false, dirtyAt: 0 };
  }
}

export function saveSyncDirtyState(state: SyncDirtyState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function markDirty(): void {
  const current = loadSyncDirtyState();
  if (current.isDirty) return;
  saveSyncDirtyState({ isDirty: true, dirtyAt: Date.now() });
}

export function clearDirty(): void {
  saveSyncDirtyState({ isDirty: false, dirtyAt: 0 });
}
