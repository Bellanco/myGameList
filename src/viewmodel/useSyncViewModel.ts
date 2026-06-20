import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_MESSAGES } from '../core/constants/labels';
import { findSocialProfileByEmail, getCurrentSocialAuthUser, signInWithGoogle } from '../model/repository/firebaseRepository';
import { mergeCrdt } from '../model/repository/syncRepository';
import { clearSyncConfig, createGist, getSyncConfig, readGist, saveSyncConfig, whoAmI, writeGist } from '../model/repository/gistRepository';
import { normalizeData } from '../model/repository/localRepository';
import { clearDirty, loadSyncDirtyState } from '../model/repository/syncStateRepository';
import { canRead, getBackoffMs, getNextReadDelayMs, getSyncState, subscribeSyncState, transitionTo, canReadNow } from '../model/repository/syncMachineRepository';
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../model/types/game';

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

function countRemoteChangesApplied(localData: TabData, remoteData: TabData, mergedData: TabData): number {
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
  const pendingRemoteSyncRef = useRef(false);
  const pendingRemoteSyncTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const POLL_INTERVAL_MS = 60_000; // 60s polling with ETag

  const writeWithConflictRecovery = useCallback(
    async (syncToken: string, syncGistId: string, localData: TabData, localUpdatedAt: number): Promise<WriteOutcome> => {
      try {
        transitionTo('writing');
        const writeResult = await writeGist(syncToken, syncGistId, localData);
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const ch = new BroadcastChannel('mygamelist-sync');
            ch.postMessage({ type: 'remote-write', updatedAt: Date.now(), etag: writeResult.etag || null });
            ch.close();
          }
        } catch {}
        transitionTo('idle', { lastWriteAt: Date.now(), errorCount: 0 });
        clearDirty();
        return {
          data: localData,
          etag: writeResult.etag,
          remoteUpdatedAt: writeResult.updatedAt,
        };
      } catch (error) {
        transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: (getSyncState().errorCount || 0) + 1, pendingAction: 'write' });
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
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const ch = new BroadcastChannel('mygamelist-sync');
            ch.postMessage({ type: 'remote-write', updatedAt: Date.now(), etag: retry.etag || null });
            ch.close();
          }
        } catch {}
        transitionTo('idle', { lastWriteAt: Date.now(), errorCount: 0 });
        clearDirty();
        return {
          data: merged.merged,
          etag: retry.etag,
          remoteUpdatedAt: remoteData.updatedAt,
        };
      }
    },
    [],
  );

    /**
     * Lightweight refresh that checks remote with ETag and merges only when needed.
     * If `force` is true it bypasses the MIN_READ_INTERVAL_MS throttle but still
     * avoids reads when the sync state is busy/error.
     */
    const refreshRemote = useCallback(async (force = false) => {
      const config = getSyncConfig();
      if (!config) return;

      if (!canReadNow(force)) return;

      try {
        transitionTo('checking');
        setStatus('syncing');
        setLastRemoteChangesApplied(null);

        const remote = await readGist(config.token, config.gistId, config.etag);
        if (remote.notModified) {
          // Aunque el remoto no haya cambiado (304), si hay cambios locales pendientes hay que
          // empujarlos: de lo contrario una edición en este dispositivo nunca llegaría a los demás.
          const dirtyState = loadSyncDirtyState();
          if (dirtyState.isDirty) {
            await writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
          }
          transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
          setStatus('ok');
          return;
        }

        const remoteData = remote.data as TabData;
        const localMeta = getMeta();
        const localData = getData();
        transitionTo('merging');
        const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
        const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
        setLastRemoteChangesApplied(remoteChanges);

        if (merged.localNeedsUpdate) setData(merged.merged);

        let writeOutcome: WriteOutcome = { data: merged.merged, etag: remote.etag || null, remoteUpdatedAt: remoteData.updatedAt };
        if (merged.remoteNeedsUpdate) {
          writeOutcome = await writeWithConflictRecovery(config.token, config.gistId, merged.merged, Date.now());
        }

        setData(writeOutcome.data);
        const nextMeta = {
          updatedAt: Date.now(),
          etag: writeOutcome.etag,
          lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt),
        };
        setMeta(nextMeta);
        saveSyncConfig({ ...config, etag: nextMeta.etag, lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt });
        persist(writeOutcome.data, nextMeta);
        transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
        setStatus('ok');
        if (remoteChanges > 0) {
          onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
        }
      } catch (error) {
        transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: getSyncState().errorCount + 1, pendingAction: 'read' });
        setStatus('error');
        const message = error instanceof Error ? error.message : SYNC_MESSAGES.syncError;
        setStatusMessage(message);
        onNotice('err', message);
        logSyncError('syncNow', error);
      }
    }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

    const startPolling = useCallback(() => {
      if (pollTimerRef.current !== null) return;
      pollTimerRef.current = window.setInterval(() => {
        const config = getSyncConfig();
        if (!config) return;
        if (document.visibilityState !== 'visible') return;
        void refreshRemote(false);
      }, POLL_INTERVAL_MS);
    }, [refreshRemote]);

    const stopPolling = useCallback(() => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }, []);

  const connectSyncWithCredentials = useCallback(
    async (rawToken: string, rawGistId: string) => {
      transitionTo('checking');
      setStatus('syncing');
      setLastRemoteChangesApplied(null);

      const cleanToken = rawToken.trim();
      const cleanGistId = rawGistId.trim();

      await whoAmI(cleanToken);

      if (!cleanGistId) {
        const created = await createGist(cleanToken);
        const config = { token: cleanToken, gistId: created.gistId, etag: created.etag, lastRemoteUpdatedAt: 0 };
        saveSyncConfig(config);
        await writeWithConflictRecovery(cleanToken, created.gistId, getData(), Date.now());
        setLastRemoteChangesApplied(0);
        setConnectedGistId(created.gistId);
        onNotice('ok', SYNC_MESSAGES.connectSuccess);
        setStatus('ok');
        setToken('');
        setGistId(created.gistId);
        return;
      }

      const remote = await readGist(cleanToken, cleanGistId);
      const remoteData = remote.data as TabData;
      const localMeta = getMeta();
      const localData = getData();
      transitionTo('merging');
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
      const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
      setLastRemoteChangesApplied(remoteChanges);

      // apply local updates when needed
      if (merged.localNeedsUpdate) {
        setData(merged.merged);
      }

      let writeOutcome: WriteOutcome = { data: merged.merged, etag: remote.etag || null, remoteUpdatedAt: remoteData.updatedAt };
      if (merged.remoteNeedsUpdate) {
        writeOutcome = await writeWithConflictRecovery(cleanToken, cleanGistId, merged.merged, Date.now());
      }

      setData(writeOutcome.data);
      saveSyncConfig({ token: cleanToken, gistId: cleanGistId, etag: writeOutcome.etag || remote.etag || null, lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt) });
      setConnectedGistId(cleanGistId);
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización configurada: ${remoteChanges} cambios remotos aplicados`);
      }
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
      setStatus('ok');
      setToken('');
      setGistId(cleanGistId);
    },
    [getData, getMeta, onNotice, setData, writeWithConflictRecovery],
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

    transitionTo('checking');
    setStatus('syncing');

    try {
      const remote = await readGist(config.token, config.gistId, config.etag);
      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        // Empujar cambios locales pendientes aunque el remoto no haya cambiado (propagación cross-device).
        const dirtyState = loadSyncDirtyState();
        if (dirtyState.isDirty) {
          await writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
        }
        transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
        setStatus('ok');
        return;
      }

      const localMeta = getMeta();
      const localData = getData();
      const remoteData = remote.data as TabData;
      transitionTo('merging');
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
      const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
      setLastRemoteChangesApplied(remoteChanges);

      // apply local updates if needed
      if (merged.localNeedsUpdate) {
        setData(merged.merged);
      }

      const nextMeta = {
        updatedAt: Date.now(),
        etag: remote.etag || null,
        lastRemoteUpdatedAt: remoteData.updatedAt,
      };

      // Write remote only when needed
      let writeOutcome: WriteOutcome = { data: merged.merged, etag: nextMeta.etag, remoteUpdatedAt: nextMeta.lastRemoteUpdatedAt };
      if (merged.remoteNeedsUpdate) {
        writeOutcome = await writeWithConflictRecovery(config.token, config.gistId, merged.merged, nextMeta.updatedAt);
      }

      setData(writeOutcome.data);
      const finalMeta = {
        updatedAt: Date.now(),
        etag: writeOutcome.etag || nextMeta.etag,
        lastRemoteUpdatedAt: Math.max(nextMeta.lastRemoteUpdatedAt, writeOutcome.remoteUpdatedAt),
      };
      setMeta(finalMeta);
      saveSyncConfig({ ...config, etag: finalMeta.etag, lastRemoteUpdatedAt: finalMeta.lastRemoteUpdatedAt });
      persist(writeOutcome.data, finalMeta);
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
      setStatus('ok');
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización inicial completada: ${remoteChanges} cambios remotos aplicados`);
      }
    } catch (error) {
      transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: getSyncState().errorCount + 1, pendingAction: 'read' });
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : SYNC_MESSAGES.initError);
      logSyncError('initializeSync', error);
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

  const schedulePendingRemoteSync = useCallback(() => {
    if (!pendingRemoteSyncRef.current) return;

    if (canRead()) {
      pendingRemoteSyncRef.current = false;
      if (pendingRemoteSyncTimerRef.current) {
        window.clearTimeout(pendingRemoteSyncTimerRef.current);
        pendingRemoteSyncTimerRef.current = null;
      }
      void initializeSync();
      return;
    }

    if (pendingRemoteSyncTimerRef.current) return;
    const delay = Math.max(getNextReadDelayMs(), 1000);
    pendingRemoteSyncTimerRef.current = window.setTimeout(() => {
      pendingRemoteSyncTimerRef.current = null;
      schedulePendingRemoteSync();
    }, delay);
  }, [canRead, getNextReadDelayMs, initializeSync]);

  const connectSync = useCallback(async () => {
    try {
      await connectSyncWithCredentials(token, gistId);
    } catch (error) {
      transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: getSyncState().errorCount + 1, pendingAction: 'read' });
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : SYNC_MESSAGES.connectError);
      onNotice('err', error instanceof Error ? error.message : SYNC_MESSAGES.connectError);
      logSyncError('connectSync', error);
    }
  }, [connectSyncWithCredentials, gistId, onNotice, token]);

  const syncNow = useCallback(async () => {
    const config = getSyncConfig();
    if (!config) {
      onNotice('warn', SYNC_MESSAGES.needsConfiguration);
      return;
    }

    try {
      transitionTo('checking');
      setStatus('syncing');
      setLastRemoteChangesApplied(null);
      const remote = await readGist(config.token, config.gistId, config.etag);

      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        const dirtyState = loadSyncDirtyState();
        if (dirtyState.isDirty) {
          await writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
        }
        transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
        setStatus('ok');
        onNotice('ok', SYNC_MESSAGES.syncSuccess);
        return;
      }

      const remoteData = remote.data as TabData;
      const localMeta = getMeta();
      const localData = getData();
      transitionTo('merging');
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
      const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
      setLastRemoteChangesApplied(remoteChanges);

      if (merged.localNeedsUpdate) setData(merged.merged);

      let writeOutcome: WriteOutcome = { data: merged.merged, etag: remote.etag || null, remoteUpdatedAt: remoteData.updatedAt };
      if (merged.remoteNeedsUpdate) {
        writeOutcome = await writeWithConflictRecovery(config.token, config.gistId, merged.merged, Date.now());
      }

      setData(writeOutcome.data);
      const nextMeta = {
        updatedAt: Date.now(),
        etag: writeOutcome.etag,
        lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt),
      };
      setMeta(nextMeta);
      saveSyncConfig({ ...config, etag: writeOutcome.etag, lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt });
      persist(writeOutcome.data, nextMeta);
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });

      setStatus('ok');
      onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
    } catch (error) {
      transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: getSyncState().errorCount + 1, pendingAction: 'read' });
      setStatus('error');
      const message = error instanceof Error ? error.message : SYNC_MESSAGES.syncError;
      setStatusMessage(message);
      onNotice('err', message);
      logSyncError('syncNow', error);
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

  useEffect(() => {
    const dirtyState = loadSyncDirtyState();
    if (dirtyState.isDirty) {
      transitionTo('dirty');
    }

    const config = getSyncConfig();
    if (config && canRead()) {
      void initializeSync();
    }
  }, [initializeSync]);

  // start/stop polling when we have a connected gist id
  useEffect(() => {
    if (connectedGistId) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => {
      stopPolling();
    };
  }, [connectedGistId, startPolling, stopPolling]);

  // Visibility/focus handlers to trigger reads when allowed
  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        pendingRemoteSyncRef.current = false;
        void refreshRemote(true);
        startPolling();
        return;
      }

      // when hidden, stop polling to avoid wasted reads
      stopPolling();
    }

    function handleWindowFocus(): void {
      // on focus, attempt an immediate refresh
      void refreshRemote(true);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [refreshRemote, startPolling, stopPolling]);

  // BroadcastChannel: listen for remote writes from other tabs
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel('mygamelist-sync');
    const onMsg = (ev: MessageEvent) => {
      const msg = ev.data as { type: string } | null;
      if (!msg) return;
      if (msg.type === 'remote-write') {
        pendingRemoteSyncRef.current = true;
        schedulePendingRemoteSync();
      }
    };
    ch.addEventListener('message', onMsg as any);
    return () => {
      ch.removeEventListener('message', onMsg as any);
      ch.close();
    };
  }, [schedulePendingRemoteSync]);

  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = subscribeSyncState((state) => {
      if (pendingRemoteSyncRef.current) {
        schedulePendingRemoteSync();
      }

      if (state.status !== 'error_backoff' || !state.pendingAction) return;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      const delay = getBackoffMs(state.errorCount);
      timer = window.setTimeout(() => {
        if (getSyncState().status !== 'error_backoff' || getSyncState().pendingAction !== state.pendingAction) return;
        if (state.pendingAction === 'read') {
          void initializeSync();
          return;
        }
        if (state.pendingAction === 'write') {
          const config = getSyncConfig();
          if (config) {
            void writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
          }
        }
      }, delay);
    });
    return () => {
      unsubscribe();
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [getData, initializeSync, schedulePendingRemoteSync, writeWithConflictRecovery]);

  useEffect(() => {
    return () => {
      if (pendingRemoteSyncTimerRef.current) {
        window.clearTimeout(pendingRemoteSyncTimerRef.current);
        pendingRemoteSyncTimerRef.current = null;
      }
    };
  }, []);

  const recoverGistIdFromGoogle = useCallback(async () => {
    setRecoveringGistId(true);

    try {
      const user = (await getCurrentSocialAuthUser()) || (await signInWithGoogle());

      const profile = await findSocialProfileByEmail(user.email);
      const recoveredGistId = String(profile?.gamesGistId || '').trim();
      const recoveredToken = String(profile?.githubToken || '').trim();

      if (!recoveredGistId) {
        setStatus('error');
        setStatusMessage(SYNC_MESSAGES.recoverMissingInProfile);
        onNotice('err', SYNC_MESSAGES.recoverMissingInProfile);
        return;
      }

      if (!recoveredToken) {
        setGistId(recoveredGistId);
        setStatus('error');
        setStatusMessage(SYNC_MESSAGES.recoverMissingTokenInProfile);
        onNotice('err', SYNC_MESSAGES.recoverMissingTokenInProfile);
        return;
      }

      setToken(recoveredToken);
      setGistId(recoveredGistId);
      setStatusMessage('');
      onNotice('ok', SYNC_MESSAGES.recoverSuccess);
      await connectSyncWithCredentials(recoveredToken, recoveredGistId);
    } catch (error) {
      const message = error instanceof Error ? error.message : SYNC_MESSAGES.recoverError;
      setStatus('error');
      setStatusMessage(message);
      onNotice('err', message);
    } finally {
      setRecoveringGistId(false);
    }
  }, [connectSyncWithCredentials, onNotice]);

  const overwriteRemoteData = useCallback(async (data: TabData): Promise<boolean> => {
    const config = getSyncConfig();
    if (!config?.token || !config?.gistId) {
      return false;
    }

    const normalizedData = normalizeData(data, { forceTimestamp: true });
    normalizedData.updatedAt = Date.now();

    const writeResult = await writeGist(config.token, config.gistId, normalizedData);
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('mygamelist-sync');
        ch.postMessage({ type: 'remote-write', updatedAt: Date.now(), etag: writeResult.etag || null });
        ch.close();
      }
    } catch {}

    saveSyncConfig({
      ...config,
      etag: writeResult.etag,
      lastRemoteUpdatedAt: writeResult.updatedAt,
    });

    clearDirty();
    transitionTo('idle');

    return true;
  }, []);

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
    overwriteRemoteData,
    connectedGistId,
    lastRemoteChangesApplied,
    recoveringGistId,
    hasConfig: Boolean(getSyncConfig()),
    currentConfig: getSyncConfig(),
  };
}
