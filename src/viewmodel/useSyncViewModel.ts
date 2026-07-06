import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_MESSAGES } from '../core/constants/labels';
import { findSocialProfileByEmail, getCurrentSocialAuthUser, recoverGithubToken, resolveStableProfileId, setAnalyticsUser, signInWithGoogle, trackAnalyticsEvent } from '../model/repository/firebaseRepository';
import { mergeCrdt } from '../model/repository/syncRepository';
import { clearSyncConfig, createGist, ensureSyncConfigLoaded, findGamesGistId, getRetryAfterMs, getSyncConfig, isDeferredNetworkError, readGist, saveSyncConfig, whoAmI, writeGist } from '../model/repository/gistRepository';
import { beginGithubOAuth, completeGithubOAuth, hasGithubOAuthRedirect, isGithubOAuthConfigured } from '../model/repository/githubOAuthRepository';
import { normalizeData } from '../model/repository/localRepository';
import { clearDirty, clearDirtyIfUnchanged, loadSyncDirtyState } from '../model/repository/syncStateRepository';
import { acquireSyncLock, canRead, getBackoffMs, getNextReadDelayMs, getSyncState, subscribeSyncState, transitionTo, canReadNow } from '../model/repository/syncMachineRepository';
import { countRemoteChangesApplied, isWriteConflict, logSyncError, type SyncOperation } from '../model/repository/syncLogicRepository';
import { readLegacyPlaintextToken } from '../model/migration/legacyTokenRecovery';
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

const SYNC_CHANNEL = 'mygamelist-sync';

/** Avisa a otras pestañas de una escritura remota (best-effort; ignora entornos sin BroadcastChannel). */
function broadcastRemoteWrite(etag: string | null): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SYNC_CHANNEL);
      ch.postMessage({ type: 'remote-write', updatedAt: Date.now(), etag: etag || null });
      ch.close();
    }
  } catch {}
}

export function useSyncViewModel({ getData, setData, getMeta, setMeta, onNotice, persist }: SyncDeps) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [connectedGistId, setConnectedGistId] = useState('');
  const [lastRemoteChangesApplied, setLastRemoteChangesApplied] = useState<number | null>(null);
  const [recoveringGistId, setRecoveringGistId] = useState(false);
  const [githubLoggingIn, setGithubLoggingIn] = useState(false);
  const pendingRemoteSyncRef = useRef(false);
  const pendingRemoteSyncTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const POLL_INTERVAL_MS = 60_000; // 60s polling with ETag

  // Manejo común de errores de un ciclo de sync: backoff + estado 'error'. `notify:false` omite el toast
  // (arranques automáticos); `logName` registra en telemetría (ausente = no se registra).
  const handleSyncError = useCallback(
    (error: unknown, opts: { fallback: string; logName?: SyncOperation; notify?: boolean }) => {
      const deferred = isDeferredNetworkError(error); // S3: offline/red diferible → backoff sin toast duro
      transitionTo('error_backoff', {
        lastErrorAt: Date.now(),
        errorCount: getSyncState().errorCount + 1,
        pendingAction: 'read',
        retryAfterMs: getRetryAfterMs(error) || null,
      });
      setStatus('error');
      const message = deferred ? SYNC_MESSAGES.offline : error instanceof Error ? error.message : opts.fallback;
      setStatusMessage(message);
      if (opts.notify !== false && !deferred) onNotice('err', message);
      if (opts.logName) logSyncError(opts.logName, error);
    },
    [onNotice],
  );

  const writeWithConflictRecovery = useCallback(
    async (syncToken: string, syncGistId: string, localData: TabData, localUpdatedAt: number): Promise<WriteOutcome> => {
      // Sello dirty al INICIAR la escritura: si una edición del usuario lo avanza mientras escribimos en red,
      // no debemos limpiar dirty (esa edición aún no está en el remoto). Ver clearDirtyIfUnchanged.
      const dirtyAtBefore = loadSyncDirtyState().dirtyAt;
      try {
        transitionTo('writing');
        const writeResult = await writeGist(syncToken, syncGistId, localData);
        broadcastRemoteWrite(writeResult.etag || null);
        transitionTo('idle', { lastWriteAt: Date.now(), errorCount: 0 });
        clearDirtyIfUnchanged(dirtyAtBefore);
        return {
          data: localData,
          etag: writeResult.etag,
          remoteUpdatedAt: writeResult.updatedAt,
        };
      } catch (error) {
        transitionTo('error_backoff', { lastErrorAt: Date.now(), errorCount: (getSyncState().errorCount || 0) + 1, pendingAction: 'write', retryAfterMs: getRetryAfterMs(error) || null }); // S3: respeta rate-limit
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
        broadcastRemoteWrite(retry.etag || null);
        transitionTo('idle', { lastWriteAt: Date.now(), errorCount: 0 });
        clearDirtyIfUnchanged(dirtyAtBefore);
        return {
          data: merged.merged,
          etag: retry.etag,
          remoteUpdatedAt: remoteData.updatedAt,
        };
      }
    },
    [],
  );

  // Reintento best-effort de una escritura pendiente (al volver online / al vencer el backoff),
  // reusando el candado global para no solapar con otro ciclo en vuelo (S2).
  const retryPendingWrite = useCallback(() => {
    const config = getSyncConfig();
    const lock = config ? acquireSyncLock() : null;
    if (config && lock) {
      void writeWithConflictRecovery(config.token, config.gistId, getData(), Date.now())
        .catch(() => {})
        .finally(() => lock.release());
    }
  }, [getData, writeWithConflictRecovery]);

    /**
     * Antes de persistir el resultado de un ciclo de sync, reconcilia con el estado local ACTUAL: si el usuario
     * guardó una edición mientras el ciclo esperaba/escribía en red, su `_ts` es más reciente y gana en el merge,
     * así el persist del sync NUNCA pisa una edición concurrente. Esa edición sigue marcada dirty
     * (clearDirtyIfUnchanged) y se sube en el próximo ciclo. Cierra la ventana residual que las refs no cubren
     * (edición llegada entre la lectura de `getData()` y el persist final).
     */
    const reconcileWithLocal = useCallback(
      (synced: TabData, remoteUpdatedAt: number): TabData =>
        mergeCrdt(getData(), getMeta().updatedAt, synced, remoteUpdatedAt).merged,
      [getData, getMeta],
    );

    /**
     * C2 — Empuja cambios locales pendientes (dirty) re-mergeando SIEMPRE contra el remoto fresco antes de escribir.
     * Un 304 solo garantiza que NUESTRO etag no cambió, pero el etag guardado puede estar desactualizado respecto al
     * remoto real (escritura concurrente desde otro dispositivo). Como el PATCH de gists de GitHub no honra `If-Match`
     * de forma fiable, la red de seguridad es esta re-lectura sin etag + merge CRDT, no la cabecera. Tras escribir,
     * actualiza etag/meta/config para que el siguiente sondeo reciba 304 y no re-mergee de balde.
     */
    const pushDirtyWithMerge = useCallback(async (syncToken: string, syncGistId: string): Promise<WriteOutcome> => {
      const latest = await readGist(syncToken, syncGistId, null);
      const localData = getData();
      const localMeta = getMeta();
      let toWrite = localData;
      let baseRemoteUpdatedAt = 0;
      if (latest.data) {
        const remoteData = latest.data as TabData;
        baseRemoteUpdatedAt = remoteData.updatedAt;
        const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
        toWrite = merged.merged;
      }
      const outcome = await writeWithConflictRecovery(syncToken, syncGistId, toWrite, Date.now());
      const nextMeta = {
        updatedAt: Date.now(),
        etag: outcome.etag,
        lastRemoteUpdatedAt: Math.max(baseRemoteUpdatedAt, outcome.remoteUpdatedAt),
      };
      setMeta(nextMeta);
      const config = getSyncConfig();
      if (config) saveSyncConfig({ ...config, etag: nextMeta.etag, lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt });
      persist(reconcileWithLocal(outcome.data, nextMeta.lastRemoteUpdatedAt), nextMeta);
      return outcome;
    }, [getData, getMeta, persist, setMeta, writeWithConflictRecovery, reconcileWithLocal]);

    /**
     * 304: el remoto no cambió, pero si hay cambios locales pendientes (dirty) hay que empujarlos (C2),
     * re-mergeando contra el remoto fresco. Cierra el ciclo dejando la máquina en 'idle' y el estado 'ok'.
     */
    const handleNotModified = useCallback(async (config: { token: string; gistId: string }) => {
      const dirtyState = loadSyncDirtyState();
      if (dirtyState.isDirty) {
        await pushDirtyWithMerge(config.token, config.gistId);
      }
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
      setStatus('ok');
    }, [pushDirtyWithMerge]);

    /**
     * Lightweight refresh that checks remote with ETag and merges only when needed.
     * If `force` is true it bypasses the MIN_READ_INTERVAL_MS throttle but still
     * avoids reads when the sync state is busy/error.
     */
    const refreshRemote = useCallback(async (force = false) => {
      await ensureSyncConfigLoaded(); // C4: garantiza el token descifrado en caché antes de leer el gist
      const config = getSyncConfig();
      if (!config) return;

      if (!canReadNow(force)) return;

      // S2: coalesce ciclos solapados (poll/focus/online/backoff). Si ya hay uno en vuelo, saltar (dirty persiste).
      const lock = acquireSyncLock();
      if (!lock) return;
      try {
        transitionTo('checking');
        setStatus('syncing');
        setLastRemoteChangesApplied(null);

        const remote = await readGist(config.token, config.gistId, config.etag);
        if (remote.notModified) {
          await handleNotModified(config);
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

        // Upgrade proactivo: si el remoto estaba en formato viejo, reescribirlo en el actual aunque el merge
        // no requiera cambios (así el gist queda migrado al primer sync, sin esperar a una edición).
        let writeOutcome: WriteOutcome = { data: merged.merged, etag: remote.etag || null, remoteUpdatedAt: remoteData.updatedAt };
        if (merged.remoteNeedsUpdate || remote.wasLegacy) {
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
        persist(reconcileWithLocal(writeOutcome.data, nextMeta.lastRemoteUpdatedAt), nextMeta);
        transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
        setStatus('ok');
        if (remoteChanges > 0) {
          onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
        }
      } catch (error) {
        // refreshRemote registra en telemetría como 'syncNow' (histórico); se conserva para no alterar métricas.
        handleSyncError(error, { fallback: SYNC_MESSAGES.syncError, logName: 'syncNow' });
      } finally {
        lock.release();
      }
    }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery, pushDirtyWithMerge, reconcileWithLocal, handleSyncError, handleNotModified]);

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
      if (merged.remoteNeedsUpdate || remote.wasLegacy) {
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
    await ensureSyncConfigLoaded(); // C4: hidrata el token cifrado antes del primer uso
    const config = getSyncConfig();
    if (!config) {
      setStatus('idle');
      setConnectedGistId('');
      setLastRemoteChangesApplied(null);
      return;
    }

    setConnectedGistId(config.gistId);

    const lock = acquireSyncLock(); // S2: no solapar con otro ciclo en vuelo
    if (!lock) return;
    transitionTo('checking');
    setStatus('syncing');

    try {
      const remote = await readGist(config.token, config.gistId, config.etag);
      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        await handleNotModified(config);
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

      // Write remote only when needed (o si el remoto estaba en formato viejo → upgrade proactivo)
      let writeOutcome: WriteOutcome = { data: merged.merged, etag: nextMeta.etag, remoteUpdatedAt: nextMeta.lastRemoteUpdatedAt };
      if (merged.remoteNeedsUpdate || remote.wasLegacy) {
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
      persist(reconcileWithLocal(writeOutcome.data, finalMeta.lastRemoteUpdatedAt), finalMeta);
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });
      setStatus('ok');
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización inicial completada: ${remoteChanges} cambios remotos aplicados`);
      }
    } catch (error) {
      // Arranque automático: sin toast (notify:false), solo estado 'error' + telemetría.
      handleSyncError(error, { fallback: SYNC_MESSAGES.initError, logName: 'initializeSync', notify: false });
    } finally {
      lock.release();
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery, pushDirtyWithMerge, reconcileWithLocal, handleSyncError, handleNotModified]);

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
    const lock = acquireSyncLock(); // S2: no conectar/sincronizar en paralelo con un ciclo en vuelo
    if (!lock) {
      onNotice('ok', SYNC_MESSAGES.syncInProgress);
      return;
    }
    try {
      await connectSyncWithCredentials(token, gistId);
    } catch (error) {
      handleSyncError(error, { fallback: SYNC_MESSAGES.connectError, logName: 'connectSync' });
    } finally {
      lock.release();
    }
  }, [connectSyncWithCredentials, gistId, onNotice, token, handleSyncError]);

  // Paso 0 — "Conectar con GitHub" (OAuth). Redirige a GitHub; el usuario autoriza y vuelve a /ajustes con un `code`.
  const beginGithubLogin = useCallback(() => {
    try {
      setGithubLoggingIn(true);
      beginGithubOAuth(); // navega fuera de la app; no vuelve de esta función
    } catch (error) {
      setGithubLoggingIn(false);
      onNotice('err', error instanceof Error ? error.message : SYNC_MESSAGES.connectError);
    }
  }, [onNotice]);

  // Al volver del redirect de GitHub: canjea el `code` por un token, autodescubre el gist existente (para no
  // duplicarlo) y conecta reusando el mismo camino que el flujo manual. Se invoca desde App al detectar el retorno.
  const completeGithubLoginFromRedirect = useCallback(async () => {
    if (!hasGithubOAuthRedirect()) return;
    setGithubLoggingIn(true);
    setStatus('syncing');
    const lock = acquireSyncLock(); // S2: no solapar con un ciclo en vuelo
    if (!lock) {
      setGithubLoggingIn(false);
      onNotice('ok', SYNC_MESSAGES.syncInProgress);
      return;
    }
    try {
      const githubToken = await completeGithubOAuth();
      const existingGistId = await findGamesGistId(githubToken); // '' si es su primera conexión
      await connectSyncWithCredentials(githubToken, existingGistId);
    } catch (error) {
      handleSyncError(error, { fallback: SYNC_MESSAGES.connectError, logName: 'completeGithubLoginFromRedirect' });
    } finally {
      lock.release();
      setGithubLoggingIn(false);
    }
  }, [connectSyncWithCredentials, onNotice, handleSyncError]);

  const syncNow = useCallback(async () => {
    await ensureSyncConfigLoaded(); // C4
    const config = getSyncConfig();
    if (!config) {
      onNotice('warn', SYNC_MESSAGES.needsConfiguration);
      return;
    }

    // S2: si ya hay un ciclo en vuelo (poll/focus/etc.), no arrancar otro manual en paralelo.
    const lock = acquireSyncLock();
    if (!lock) {
      onNotice('ok', SYNC_MESSAGES.syncInProgress);
      return;
    }
    try {
      transitionTo('checking');
      setStatus('syncing');
      setLastRemoteChangesApplied(null);
      const remote = await readGist(config.token, config.gistId, config.etag);

      if (remote.notModified) {
        setLastRemoteChangesApplied(0);
        await handleNotModified(config);
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
      if (merged.remoteNeedsUpdate || remote.wasLegacy) {
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
      persist(reconcileWithLocal(writeOutcome.data, nextMeta.lastRemoteUpdatedAt), nextMeta);
      transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });

      setStatus('ok');
      onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
    } catch (error) {
      handleSyncError(error, { fallback: SYNC_MESSAGES.syncError, logName: 'syncNow' });
    } finally {
      lock.release();
    }
  }, [getData, getMeta, onNotice, persist, setData, setMeta, writeWithConflictRecovery, pushDirtyWithMerge, reconcileWithLocal, handleSyncError, handleNotModified]);

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

    // S3: al recuperar la red tras un fallo diferible (offline), no esperes al backoff: sal de
    // error_backoff y reintenta la acción pendiente de inmediato.
    function handleOnline(): void {
      const st = getSyncState();
      if (st.status !== 'error_backoff' || !st.pendingAction) return;
      const pending = st.pendingAction;
      transitionTo('idle', { errorCount: 0, pendingAction: null });
      if (pending === 'write') {
        retryPendingWrite();
        return;
      }
      void refreshRemote(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshRemote, startPolling, stopPolling, retryPendingWrite]);

  // BroadcastChannel: listen for remote writes from other tabs
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
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
      // S3: respeta el rate-limit del servidor (Retry-After / X-RateLimit-Reset) si es mayor que el backoff exponencial.
      const delay = Math.max(getBackoffMs(state.errorCount), state.retryAfterMs || 0);
      timer = window.setTimeout(() => {
        if (getSyncState().status !== 'error_backoff' || getSyncState().pendingAction !== state.pendingAction) return;
        if (state.pendingAction === 'read') {
          void initializeSync();
          return;
        }
        if (state.pendingAction === 'write') {
          retryPendingWrite(); // S2: no solapar el reintento de escritura
        }
      }, delay);
    });
    return () => {
      unsubscribe();
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [initializeSync, schedulePendingRemoteSync, retryPendingWrite]);

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

      // Telemetría: vincula los eventos/errores posteriores a este usuario (uid opaco) y registra el login.
      void setAnalyticsUser(user.uid);
      void trackAnalyticsEvent('login', { method: 'google' });

      // 6.2a: al iniciar sesión, recupera el profileId canónico de Firestore y siémbralo en `meta`
      // (best-effort) para que este dispositivo NO genere un pseudónimo divergente en el primer guardado.
      await resolveStableProfileId(user.uid).catch(() => {});

      const profile = await findSocialProfileByEmail(user.email);
      const recoveredGistId = String(profile?.gamesGistId || '').trim();
      // B1: preferir el token CIFRADO de privateConfig; fallback al campo legacy en claro (perfiles viejos).
      const recoveredToken = (await recoverGithubToken(user.uid)) || readLegacyPlaintextToken(profile);

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
      const lock = acquireSyncLock(); // S2: no solapar el sync de conexión con otro ciclo en vuelo
      if (lock) {
        try {
          await connectSyncWithCredentials(recoveredToken, recoveredGistId);
        } finally {
          lock.release();
        }
      }
    } catch (error) {
      // H3: connectSyncWithCredentials deja la máquina en 'checking'/'merging' si lanza a mitad; sin un
      // transitionTo aquí el sync quedaría bloqueado hasta recargar. Mismo patrón de recuperación que connectSync.
      handleSyncError(error, { fallback: SYNC_MESSAGES.recoverError });
    } finally {
      setRecoveringGistId(false);
    }
  }, [connectSyncWithCredentials, onNotice, handleSyncError]);

  const overwriteRemoteData = useCallback(async (data: TabData): Promise<boolean> => {
    await ensureSyncConfigLoaded(); // C4
    const config = getSyncConfig();
    if (!config?.token || !config?.gistId) {
      return false;
    }

    // S2: sobrescritura destructiva del remoto → no debe correr en paralelo con un ciclo de sync.
    const lock = acquireSyncLock();
    if (!lock) return false;
    try {
      const normalizedData = normalizeData(data, { forceTimestamp: true });
      normalizedData.updatedAt = Date.now();

      const writeResult = await writeGist(config.token, config.gistId, normalizedData);
      broadcastRemoteWrite(writeResult.etag || null);

      saveSyncConfig({
        ...config,
        etag: writeResult.etag,
        lastRemoteUpdatedAt: writeResult.updatedAt,
      });

      clearDirty();
      transitionTo('idle');

      return true;
    } finally {
      lock.release();
    }
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
    githubOAuthEnabled: isGithubOAuthConfigured(),
    githubLoggingIn,
    beginGithubLogin,
    completeGithubLoginFromRedirect,
    connectedGistId,
    lastRemoteChangesApplied,
    recoveringGistId,
    hasConfig: Boolean(getSyncConfig()),
    currentConfig: getSyncConfig(),
  };
}
