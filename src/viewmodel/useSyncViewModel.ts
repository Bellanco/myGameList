import { useCallback, useState } from 'react';
import { SYNC_MESSAGES } from '../core/constants/labels';
import { findSocialProfileByEmail, getCurrentSocialAuthUser, signInWithGoogle } from '../model/repository/firebaseRepository';
import { mergeCrdt } from '../model/repository/syncRepository';
import { clearSyncConfig, createGist, getSyncConfig, readGist, saveSyncConfig, whoAmI, writeGist } from '../model/repository/gistRepository';
import type { GameItem, TabData, TabId } from '../model/types/game';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface SyncDeps {
  getData: () => TabData;
  setData: (next: TabData) => void;
  getMeta: () => { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number };
  setMeta: (meta: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number }) => void;
  onNotice: (kind: 'ok' | 'warn' | 'err', message: string) => void;
  persist: (nextData: TabData, nextMeta?: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number }) => void;
}

interface WriteOutcome {
  data: TabData;
  etag: string | null;
  remoteUpdatedAt: number;
}

type SyncOperation = 'initializeSync' | 'connectSync' | 'syncNow' | 'writeWithConflictRecovery';

interface SyncErrorLogEntry {
  timestamp: number;
  operation: SyncOperation;
  message: string;
}

const SYNC_ERROR_LOG_KEY = 'myGameList.syncErrorLog';
const SYNC_ERROR_LOG_LIMIT = 30;

function isWriteConflict(error: unknown): boolean {
  return error instanceof Error && /Write failed:\s*409\b/.test(error.message);
}

function getLatestItems(data: TabData): Map<number, { item: GameItem; tab: TabId; ts: number }> {
  const map = new Map<number, { item: GameItem; tab: TabId; ts: number }>();

  for (const tab of ['c', 'v', 'e', 'p'] as const) {
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

function countRemoteChangesApplied(localData: TabData, remoteData: TabData, mergedData: TabData): number {
  const localItems = getLatestItems(localData);
  const localDeleted = getLatestDeleted(localData);
  const remoteItems = getLatestItems(remoteData);
  const remoteDeleted = getLatestDeleted(remoteData);
  const mergedItems = getLatestItems(mergedData);
  const mergedDeleted = getLatestDeleted(mergedData);

  const remoteIds = new Set<number>();

  for (const tab of ['c', 'v', 'e', 'p'] as const) {
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

function logSyncError(operation: SyncOperation, error: unknown): void {
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
    localStorage.setItem(SYNC_ERROR_LOG_KEY, JSON.stringify(next));
  } catch {
    // Silent fallback: app flow should not break if logging fails.
  }
}

export function useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist }: SyncDeps) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [connectedGistId, setConnectedGistId] = useState('');
  const [lastRemoteChangesApplied, setLastRemoteChangesApplied] = useState<number | null>(null);
  const [recoveringGistId, setRecoveringGistId] = useState(false);

  const writeWithConflictRecovery = useCallback(
    async (syncToken: string, syncGistId: string, localData: TabData, localUpdatedAt: number): Promise<WriteOutcome> => {
      try {
        const writeResult = await writeGist(syncToken, syncGistId, localData);
        return {
          data: localData,
          etag: writeResult.etag,
          remoteUpdatedAt: localUpdatedAt,
        };
      } catch (error) {
        if (!isWriteConflict(error)) {
          logSyncError('writeWithConflictRecovery', error);
          throw error;
        }

        const latest = await readGist(syncToken, syncGistId, null);
        if (!latest.data) {
          throw error;
        }

        const remoteData = latest.data as TabData;
        const merged = mergeCrdt(localData, localUpdatedAt, remoteData, remoteData.updatedAt);
        const retry = await writeGist(syncToken, syncGistId, merged.merged);
        return {
          data: merged.merged,
          etag: retry.etag,
          remoteUpdatedAt: remoteData.updatedAt,
        };
      }
    },
    [],
  );

  const initializeSync = useCallback(async () => {
    const config = getSyncConfig();
    if (!config) {
      setStatus('idle');
      setConnectedGistId('');
      setLastRemoteChangesApplied(null);
      return;
    }

    setConnectedGistId(config.gistId);

    setStatus('syncing');

    try {
      const remote = await readGist(config.token, config.gistId, config.etag);
      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        setStatus('ok');
        return;
      }

      const localMeta = getMeta();
      const localData = getData();
      const remoteData = remote.data as TabData;
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
      const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
      setLastRemoteChangesApplied(remoteChanges);

      setData(merged.merged);

      const nextMeta = {
        updatedAt: Date.now(),
        etag: remote.etag || null,
        lastRemoteUpdatedAt: remoteData.updatedAt,
      };

      const writeOutcome = await writeWithConflictRecovery(config.token, config.gistId, merged.merged, nextMeta.updatedAt);
      setData(writeOutcome.data);
      const finalMeta = {
        updatedAt: Date.now(),
        etag: writeOutcome.etag || nextMeta.etag,
        lastRemoteUpdatedAt: Math.max(nextMeta.lastRemoteUpdatedAt, writeOutcome.remoteUpdatedAt),
      };
      setMeta(finalMeta);
      saveSyncConfig({ ...config, etag: finalMeta.etag, lastRemoteUpdatedAt: finalMeta.lastRemoteUpdatedAt });
      persist(writeOutcome.data, finalMeta);
      setStatus('ok');
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización inicial completada: ${remoteChanges} cambios remotos aplicados`);
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : SYNC_MESSAGES.initError);
      logSyncError('initializeSync', error);
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

  const connectSync = useCallback(async () => {
    try {
      setStatus('syncing');
      setLastRemoteChangesApplied(null);
      const cleanToken = token.trim();
      const cleanGistId = gistId.trim();
      await whoAmI(cleanToken);

      if (!cleanGistId) {
        const created = await createGist(cleanToken);
        const config = { token: cleanToken, gistId: created.gistId, etag: created.etag, lastRemoteUpdatedAt: 0 };
        saveSyncConfig(config);
        await writeWithConflictRecovery(cleanToken, created.gistId, getData(), Date.now());
        setLastRemoteChangesApplied(0);
        setConnectedGistId(created.gistId);
      } else {
        const remote = await readGist(cleanToken, cleanGistId);
        const remoteData = remote.data as TabData;
        const localMeta = getMeta();
        const localData = getData();
        const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
        const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
        setLastRemoteChangesApplied(remoteChanges);
        const writeOutcome = await writeWithConflictRecovery(cleanToken, cleanGistId, merged.merged, Date.now());
        setData(writeOutcome.data);
        saveSyncConfig({ token: cleanToken, gistId: cleanGistId, etag: writeOutcome.etag || remote.etag || null, lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt) });
        setConnectedGistId(cleanGistId);
        if (remoteChanges > 0) {
          onNotice('ok', `Sincronización configurada: ${remoteChanges} cambios remotos aplicados`);
        }
      }

      if (!cleanGistId) {
        onNotice('ok', SYNC_MESSAGES.connectSuccess);
      }
      setStatus('ok');
      setToken('');
      setGistId(cleanGistId);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : SYNC_MESSAGES.connectError);
      onNotice('err', error instanceof Error ? error.message : SYNC_MESSAGES.connectError);
      logSyncError('connectSync', error);
    }
  }, [getData, getMeta, gistId, onNotice, setData, token, writeWithConflictRecovery]);

  const syncNow = useCallback(async () => {
    const config = getSyncConfig();
    if (!config) {
      onNotice('warn', SYNC_MESSAGES.needsConfiguration);
      return;
    }

    try {
      setStatus('syncing');
      setLastRemoteChangesApplied(null);
      const remote = await readGist(config.token, config.gistId, config.etag);

      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        await writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
        setStatus('ok');
        onNotice('ok', SYNC_MESSAGES.syncSuccess);
        return;
      }

      const remoteData = remote.data as TabData;
      const localMeta = getMeta();
      const localData = getData();
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
      const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
      setLastRemoteChangesApplied(remoteChanges);
      const writeOutcome = await writeWithConflictRecovery(config.token, config.gistId, merged.merged, Date.now());
      setData(writeOutcome.data);
      const nextMeta = {
        updatedAt: Date.now(),
        etag: writeOutcome.etag,
        lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt),
      };
      setMeta(nextMeta);
      saveSyncConfig({ ...config, etag: writeOutcome.etag, lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt });
      persist(writeOutcome.data, nextMeta);

      setStatus('ok');
      onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : SYNC_MESSAGES.syncError;
      setStatusMessage(message);
      onNotice('err', message);
      logSyncError('syncNow', error);
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

  const recoverGistIdFromGoogle = useCallback(async () => {
    setRecoveringGistId(true);

    try {
      const user = (await getCurrentSocialAuthUser()) || (await signInWithGoogle());

      const profile = await findSocialProfileByEmail(user.email);
      const recoveredGistId = String(profile?.gamesGistId || '').trim();

      if (!recoveredGistId) {
        setStatus('error');
        setStatusMessage(SYNC_MESSAGES.recoverMissingInProfile);
        onNotice('err', SYNC_MESSAGES.recoverMissingInProfile);
        return;
      }

      setGistId(recoveredGistId);
      setStatusMessage('');
      onNotice('ok', SYNC_MESSAGES.recoverSuccess);
    } catch (error) {
      const message = error instanceof Error ? error.message : SYNC_MESSAGES.recoverError;
      setStatus('error');
      setStatusMessage(message);
      onNotice('err', message);
    } finally {
      setRecoveringGistId(false);
    }
  }, [onNotice]);

  const disconnectSync = useCallback(() => {
    clearSyncConfig();
    setStatus('idle');
    setConnectedGistId('');
    setToken('');
    setGistId('');
    setLastRemoteChangesApplied(null);
    onNotice('ok', SYNC_MESSAGES.disconnectSuccess);
  }, [onNotice]);

  return {
    status,
    statusMessage,
    token,
    setToken,
    gistId,
    setGistId,
    initializeSync,
    connectSync,
    syncNow,
    disconnectSync,
    recoverGistIdFromGoogle,
    connectedGistId,
    lastRemoteChangesApplied,
    recoveringGistId,
    hasConfig: Boolean(getSyncConfig()),
    currentConfig: getSyncConfig(),
  };
}
