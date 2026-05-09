import { useCallback, useState } from 'react';
import { mergeCrdt } from '../model/repository/syncRepository';
import { clearSyncConfig, createGist, getSyncConfig, readGist, saveSyncConfig, whoAmI, writeGist } from '../model/repository/gistRepository';
import type { TabData } from '../model/types/game';

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

function isWriteConflict(error: unknown): boolean {
  return error instanceof Error && /Write failed:\s*409\b/.test(error.message);
}

export function useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist }: SyncDeps) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [connectedGistId, setConnectedGistId] = useState('');

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
      return;
    }

    setConnectedGistId(config.gistId);

    setStatus('syncing');

    try {
      const remote = await readGist(config.token, config.gistId, config.etag);
      if (remote.notModified) {
        setStatus('ok');
        return;
      }

      const localMeta = getMeta();
      const localData = getData();
      const remoteData = remote.data as TabData;
      const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);

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
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Error de sincronización');
    }
  }, [getData, getMeta, persist, setData, setMeta, writeWithConflictRecovery]);

  const connectSync = useCallback(async () => {
    try {
      setStatus('syncing');
      const cleanToken = token.trim();
      const cleanGistId = gistId.trim();
      await whoAmI(cleanToken);

      if (!cleanGistId) {
        const created = await createGist(cleanToken);
        const config = { token: cleanToken, gistId: created.gistId, etag: created.etag, lastRemoteUpdatedAt: 0 };
        saveSyncConfig(config);
        await writeWithConflictRecovery(cleanToken, created.gistId, getData(), Date.now());
        setConnectedGistId(created.gistId);
      } else {
        const remote = await readGist(cleanToken, cleanGistId);
        const remoteData = remote.data as TabData;
        const localMeta = getMeta();
        const merged = mergeCrdt(getData(), localMeta.updatedAt, remoteData, remoteData.updatedAt);
        const writeOutcome = await writeWithConflictRecovery(cleanToken, cleanGistId, merged.merged, Date.now());
        setData(writeOutcome.data);
        saveSyncConfig({ token: cleanToken, gistId: cleanGistId, etag: writeOutcome.etag || remote.etag || null, lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt) });
        setConnectedGistId(cleanGistId);
      }

      onNotice('ok', 'Sincronización configurada');
      setStatus('ok');
      setToken('');
      setGistId(cleanGistId);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Error al conectar sincronización');
      onNotice('err', error instanceof Error ? error.message : 'Error al conectar sincronización');
    }
  }, [getData, getMeta, gistId, onNotice, setData, token, writeWithConflictRecovery]);

  const syncNow = useCallback(async () => {
    const config = getSyncConfig();
    if (!config) {
      onNotice('warn', 'Primero configura la sincronización.');
      return;
    }

    try {
      setStatus('syncing');
      const remote = await readGist(config.token, config.gistId, config.etag);

      if (remote.notModified) {
        await writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now());
        setStatus('ok');
        onNotice('ok', 'Datos sincronizados');
        return;
      }

      const remoteData = remote.data as TabData;
      const localMeta = getMeta();
      const merged = mergeCrdt(getData(), localMeta.updatedAt, remoteData, remoteData.updatedAt);
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
      onNotice('ok', 'Fusión sincronizada correctamente');
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : 'Error al sincronizar';
      setStatusMessage(message);
      onNotice('err', message);
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery]);

  const disconnectSync = useCallback(() => {
    clearSyncConfig();
    setStatus('idle');
    setConnectedGistId('');
    setToken('');
    setGistId('');
    onNotice('ok', 'Sincronización desconectada');
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
    connectedGistId,
    hasConfig: Boolean(getSyncConfig()),
    currentConfig: getSyncConfig(),
  };
}
