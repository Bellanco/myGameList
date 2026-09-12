import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_MESSAGES } from '../core/constants/labels';
import { getCurrentSocialAuthUser, getPrivateConfig, recoverGithubToken, resolveOwnProfile, resolveStableProfileId, setAnalyticsUser, setPrivateConfig, signInWithGoogle, trackAnalyticsEvent } from '../model/repository/firebaseGateway';
import { mergeCrdt } from '../model/repository/syncRepository';
import { clearSyncConfig, createGist, ensureSyncConfigLoaded, findGamesGistId, getRetryAfterMs, getSyncConfig, isDeferredNetworkError, readGist, saveSyncConfig, subscribeSyncConfig, whoAmI, writeGist, type GistReadResponse } from '../model/repository/gistRepository';
import { beginGithubOAuth, completeGithubOAuth, hasGithubOAuthRedirect, isGithubOAuthConfigured } from '../model/repository/githubOAuthRepository';
import { normalizeData } from '../model/repository/localRepository';
import { clearDirty, clearDirtyIfUnchanged, loadSyncDirtyState, subscribeSyncDirtyState, type SyncDirtyState } from '../model/repository/syncStateRepository';
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

/**
 * CUÁNTO SE ESPERA ANTES DE SUBIR UNA EDICIÓN.
 *
 * Guardar un juego marcaba lo pendiente y ahí se acababa: la subida esperaba a que algo disparase un ciclo —el
 * sondeo del minuto, o volver a la pestaña—, así que quien editaba y cerraba antes se quedaba el cambio en su
 * dispositivo hasta la próxima vez que abriera la app. En un segundo aparato, hasta entonces, no existía.
 *
 * Cinco segundos es el punto donde las dos cosas que importan siguen cumpliéndose: agrupa la ráfaga de quien
 * guarda tres juegos seguidos en UNA escritura (cada edición reinicia la espera), y es poco tiempo para que
 * cerrar la pestaña pille algo sin subir. Subirlo ahorra escrituras y arriesga más; bajarlo, al revés.
 */
const DIRTY_PUSH_DELAY_MS = 5_000;

/**
 * Y cuánto se espera cuando al vencer el plazo había un ciclo en vuelo. No se fuerza ni se encola: se vuelve a
 * mirar un poco después, cuando el candado ya se habrá soltado. No hace falta un tope de reintentos porque el
 * candado se libera SIEMPRE en un `finally`, y porque el propio reintento se para solo en cuanto no quede nada
 * pendiente (puede haberlo subido el ciclo que tenía el candado, que es el caso normal).
 */
const DIRTY_PUSH_RETRY_MS = 2_000;

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

  /**
   * ¿QUEDA ALGO POR SUBIR? Se pinta en el badge, así que no puede ser una lectura por render: se mantiene al día
   * con el aviso de `syncStateRepository`.
   *
   * Vale `false` sin sincronización configurada, y no es un descuido: sin gist al que subir, «cambios sin subir»
   * no significa nada para quien solo usa sus listas en este dispositivo. El badge ya dice «No sincronizado».
   */
  /**
   * La configuración de sincronización COMO ESTADO, no como lectura por render.
   *
   * `hasConfig` y `currentConfig` se resolvían llamando a `getSyncConfig()` en el cuerpo del hook, así que cada
   * render de la aplicación —uno por tecla en el buscador— hacía dos `localStorage.getItem` con sus dos
   * `JSON.parse` para acabar devolviendo lo mismo que la vez anterior. Ahora se mantiene al día con el aviso del
   * repositorio, que es quien sabe cuándo cambia de verdad.
   */
  const [syncConfig, setSyncConfig] = useState(getSyncConfig);

  const pendingUploadFrom = (dirty: SyncDirtyState): boolean => dirty.isDirty && Boolean(getSyncConfig());
  const [pendingUpload, setPendingUpload] = useState(() => pendingUploadFrom(loadSyncDirtyState()));
  const dirtyPushTimerRef = useRef<number | null>(null);

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

  /**
   * `knownRemoteFiles`: el cuerpo del gist que quien llama ACABA de leer, para que `writeGist` no vuelva a
   * pedirlo. Subir una edición costaba tres peticiones (la lectura del ciclo, la de la escritura y el PATCH) y
   * dos de ellas traían lo mismo. Se omite cuando no hay una lectura fresca detrás.
   */
  const writeWithConflictRecovery = useCallback(
    async (
      syncToken: string,
      syncGistId: string,
      localData: TabData,
      localUpdatedAt: number,
      knownRemoteFiles?: GistReadResponse['remoteFiles'],
    ): Promise<WriteOutcome> => {
      // Sello dirty al INICIAR la escritura: si una edición del usuario lo avanza mientras escribimos en red,
      // no debemos limpiar dirty (esa edición aún no está en el remoto). Ver clearDirtyIfUnchanged.
      const dirtyAtBefore = loadSyncDirtyState().dirtyAt;
      try {
        transitionTo('writing');
        const writeResult = await writeGist(syncToken, syncGistId, localData, { knownRemoteFiles });
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
        // Los ficheros de `latest`, no los que llegaron por parámetro: el conflicto significa justamente que el
        // gist cambió por debajo, así que lo de antes ya no lo describe.
        const retry = await writeGist(syncToken, syncGistId, merged.merged, { knownRemoteFiles: latest.remoteFiles });
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
      // La lectura de arriba ya trajo el gist entero: se lo damos a la escritura en vez de que lo vuelva a pedir.
      const outcome = await writeWithConflictRecovery(syncToken, syncGistId, toWrite, Date.now(), latest.remoteFiles);
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
     * EL EMPUJÓN AUTOMÁTICO. Sube lo pendiente sin que nadie lo pida y sin esperar al siguiente ciclo.
     *
     * Es deliberadamente CALLADO (`notify:false`): nadie ha pulsado nada, así que un fallo aquí no debe sacar un
     * aviso encima de lo que el usuario esté haciendo. Deja el estado en `error` y la máquina en backoff, que ya
     * se encarga de reintentar, y lo pendiente sigue marcado: no se pierde nada.
     */
    const pushPendingChanges = useCallback(async () => {
      await ensureSyncConfigLoaded(); // C4: el token puede seguir cifrado si aún no se ha usado
      const config = getSyncConfig();
      if (!config) return; // sin sincronización configurada no hay a dónde subir
      if (!loadSyncDirtyState().isDirty) return; // lo subió otro ciclo mientras esperábamos

      const lock = acquireSyncLock();
      if (!lock) {
        // Hay un ciclo en vuelo. Puede que lo esté subiendo él (un 304 con pendientes hace justo esto), así que
        // no se compite: se vuelve a mirar en un momento.
        scheduleDirtyPushRef.current(DIRTY_PUSH_RETRY_MS);
        return;
      }
      try {
        setStatus('syncing');
        await pushDirtyWithMerge(config.token, config.gistId);
        setStatus('ok');
      } catch (error) {
        handleSyncError(error, { fallback: SYNC_MESSAGES.syncError, logName: 'pushPendingChanges', notify: false });
      } finally {
        lock.release();
      }
    }, [handleSyncError, pushDirtyWithMerge]);

    const pushPendingChangesRef = useRef(pushPendingChanges);
    pushPendingChangesRef.current = pushPendingChanges;

    /** Programa (o reprograma) el empujón. Cada edición reinicia la cuenta: eso es lo que agrupa las ráfagas. */
    const scheduleDirtyPush = useCallback((delay: number = DIRTY_PUSH_DELAY_MS) => {
      if (dirtyPushTimerRef.current !== null) window.clearTimeout(dirtyPushTimerRef.current);
      dirtyPushTimerRef.current = window.setTimeout(() => {
        dirtyPushTimerRef.current = null;
        void pushPendingChangesRef.current();
      }, delay);
    }, []);

    const cancelDirtyPush = useCallback(() => {
      if (dirtyPushTimerRef.current !== null) {
        window.clearTimeout(dirtyPushTimerRef.current);
        dirtyPushTimerRef.current = null;
      }
    }, []);

    // Por ref para que `pushPendingChanges` pueda reprogramarse a sí misma sin que las dos se persigan en las
    // dependencias.
    const scheduleDirtyPushRef = useRef(scheduleDirtyPush);
    scheduleDirtyPushRef.current = scheduleDirtyPush;

    /**
     * D1 — Tronco común de las CUATRO rutas que fusionan un remoto ya leído: `refreshRemote`, `syncNow`,
     * `initializeSync` y `connectSyncWithCredentials`. Antes estaba copiado entero en cada una, unas cuarenta
     * líneas por copia, y las copias ya habían divergido: la de conectar se había quedado sin `setMeta` y sin
     * `persist(reconcileWithLocal(…))`, de modo que tras conectar el meta local no se sellaba y una edición
     * guardada mientras la escritura estaba en vuelo se revertía. Ver `tests/unit/syncConnectRace.test.ts`.
     *
     * La LECTURA se queda fuera a propósito: cada ruta lee con su propio etag y decide qué hacer con un 304
     * (ver `handleNotModified`). Aquí entra lo que va DESPUÉS, que es lo que tiene que ser idéntico.
     *
     * También queda fuera lo que cada ruta le cuenta al usuario: `syncNow` confirma siempre porque es una acción
     * explícita y las demás solo hablan si han traído algo. Esa diferencia es deliberada y está fijada en
     * `tests/unit/syncConnectRace.test.ts`.
     *
     * `cfg` llega por parámetro y no de `getSyncConfig()` porque al conectar todavía no hay config guardada: sus
     * credenciales son justo las que se están estrenando.
     */
    const applyRemoteCycle = useCallback(
      async (
        cfg: { token: string; gistId: string },
        remote: GistReadResponse,
      ): Promise<{ remoteChanges: number; nextMeta: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number } }> => {
        const remoteData = remote.data as TabData;
        const localMeta = getMeta();
        const localData = getData();

        transitionTo('merging');
        const merged = mergeCrdt(localData, localMeta.updatedAt, remoteData, remoteData.updatedAt);
        const remoteChanges = countRemoteChangesApplied(localData, remoteData, merged.merged);
        setLastRemoteChangesApplied(remoteChanges);

        if (merged.localNeedsUpdate) {
          setData(merged.merged);
        }

        // Upgrade proactivo: si el remoto estaba en formato viejo, se reescribe en el actual aunque el merge no
        // lo pidiera, para que el gist quede migrado al primer sync en vez de esperar a una edición.
        let writeOutcome: WriteOutcome = { data: merged.merged, etag: remote.etag || null, remoteUpdatedAt: remoteData.updatedAt };
        if (merged.remoteNeedsUpdate || remote.wasLegacy) {
          writeOutcome = await writeWithConflictRecovery(cfg.token, cfg.gistId, merged.merged, Date.now(), remote.remoteFiles);
        }

        // Aquí NO va un `setData(writeOutcome.data)`, y su ausencia es el arreglo, no un olvido. Las cuatro
        // rutas lo hacían justo antes del persist, y como `reconcileWithLocal` resuelve leyendo `getData()`,
        // ese setData le machacaba el estado local que venía a consultar: la reconciliación se comparaba
        // consigo misma y una edición llegada durante la escritura se perdía. `persist` recibe los mismos
        // datos —en `App.tsx` los dos son `persistFromSync`—, así que escribir una vez basta, y hacerlo DESPUÉS
        // de reconciliar es lo que hace que la protección exista de verdad. `pushDirtyWithMerge` ya lo hacía
        // así, que es por lo que la ruta del 304 sí estaba cubierta.
        const nextMeta = {
          updatedAt: Date.now(),
          etag: writeOutcome.etag,
          lastRemoteUpdatedAt: Math.max(remoteData.updatedAt, writeOutcome.remoteUpdatedAt),
        };
        setMeta(nextMeta);
        // `SyncConfig` son exactamente estos cuatro campos, así que reconstruirla desde `cfg` es equivalente a
        // extender la que hubiera guardada, y funciona igual en la conexión inicial, donde no hay ninguna.
        saveSyncConfig({ ...cfg, etag: nextMeta.etag, lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt });
        // `reconcileWithLocal` cierra la ventana de la escritura: si el usuario guardó algo mientras `writeGist`
        // estaba en vuelo, su `_ts` es más reciente y gana, así que el persist del ciclo no lo pisa.
        persist(reconcileWithLocal(writeOutcome.data, nextMeta.lastRemoteUpdatedAt), nextMeta);
        transitionTo('idle', { lastReadAt: Date.now(), errorCount: 0, pendingAction: null });

        return { remoteChanges, nextMeta };
      },
      [getData, getMeta, persist, setData, setMeta, writeWithConflictRecovery, reconcileWithLocal],
    );

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

        const { remoteChanges } = await applyRemoteCycle(config, remote);
        setStatus('ok');
        // Ciclo automático: solo se habla si de verdad ha llegado algo (ver el contrato de avisos en
        // `tests/unit/syncConnectRace.test.ts`).
        if (remoteChanges > 0) {
          onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
        }
      } catch (error) {
        // refreshRemote registra en telemetría como 'syncNow' (histórico); se conserva para no alterar métricas.
        handleSyncError(error, { fallback: SYNC_MESSAGES.syncError, logName: 'syncNow' });
      } finally {
        lock.release();
      }
    }, [applyRemoteCycle, onNotice, handleSyncError, handleNotModified]);

    /**
     * ⚑ LOS EFECTOS DE ESTE HOOK NO DEPENDEN DE LA IDENTIDAD DE SUS CALLBACKS, Y NO ES UN CAPRICHO.
     *
     * `refreshRemote` (y con él `initializeSync`, `startPolling`…) cuelga de `applyRemoteCycle`, que cuelga de
     * `getData`/`getMeta`/`persist`, que los pone quien monta el hook. Basta con que ALGUNO de esos llegue como
     * una función nueva en cada render —`App.tsx` pasaba tres— para que la cadena entera estrene identidad en
     * cada render y los cinco efectos de abajo se desmonten y se vuelvan a montar con ella. Lo que eso provocaba,
     * medido:
     *
     *   · el `setInterval` del sondeo se mataba y se recreaba en cada render, así que en una sesión con actividad
     *     (teclear en el buscador ya re-renderiza) NUNCA llegaba a cumplir sus 60 s: el sondeo periódico no
     *     existía. Quien sincronizaba de verdad era el efecto de montaje, que corría en cada render;
     *   · los listeners de ventana y el `BroadcastChannel` se cerraban y reabrían en cada render;
     *   · y lo más caro: el `setTimeout` del backoff vive en el efecto, así que su limpieza lo CANCELABA en cada
     *     render y el reintento tras un error no llegaba nunca (el sync se quedaba en `error_backoff` esperando
     *     a un focus).
     *
     * Se arregla en los dos extremos: quien monta pasa callbacks estables, y aquí los efectos leen la versión
     * vigente por ref y se disparan por DATOS (`connectedGistId`). Así una regresión en el llamador vuelve a
     * costar renders de más, no un ciclo de sincronización roto. Mismo patrón que `hydrateSocialDirectoryRef`
     * en `useSocialViewModel`.
     */
    const refreshRemoteRef = useRef(refreshRemote);
    refreshRemoteRef.current = refreshRemote;

    const startPolling = useCallback(() => {
      if (pollTimerRef.current !== null) return;
      pollTimerRef.current = window.setInterval(() => {
        const config = getSyncConfig();
        if (!config) return;
        if (document.visibilityState !== 'visible') return;
        void refreshRemoteRef.current(false);
      }, POLL_INTERVAL_MS);
    }, []);

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
      const { remoteChanges } = await applyRemoteCycle({ token: cleanToken, gistId: cleanGistId }, remote);

      setConnectedGistId(cleanGistId);
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización configurada: ${remoteChanges} cambios remotos aplicados`);
      }
      setStatus('ok');
      setToken('');
      setGistId(cleanGistId);
    },
    [applyRemoteCycle, getData, onNotice, writeWithConflictRecovery],
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

      const { remoteChanges } = await applyRemoteCycle(config, remote);
      setStatus('ok');
      // Arranque automático: solo se habla si ha llegado algo.
      if (remoteChanges > 0) {
        onNotice('ok', `Sincronización inicial completada: ${remoteChanges} cambios remotos aplicados`);
      }
    } catch (error) {
      // Arranque automático: sin toast (notify:false), solo estado 'error' + telemetría.
      handleSyncError(error, { fallback: SYNC_MESSAGES.initError, logName: 'initializeSync', notify: false });
    } finally {
      lock.release();
    }
  }, [applyRemoteCycle, onNotice, handleSyncError, handleNotModified]);

  // Ver la nota de `refreshRemoteRef`: los efectos leen la versión vigente por ref.
  const initializeSyncRef = useRef(initializeSync);
  initializeSyncRef.current = initializeSync;
  const retryPendingWriteRef = useRef(retryPendingWrite);
  retryPendingWriteRef.current = retryPendingWrite;

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
    // `canRead` y `getNextReadDelayMs` NO van aquí: son importaciones de `syncMachineRepository`, no valores del
    // render. Su identidad no cambia nunca, así que listarlas no cambiaba cuándo se recrea este callback — solo
    // sugería que sí, y era lo que ESLint señalaba.
  }, [initializeSync]);

  const schedulePendingRemoteSyncRef = useRef(schedulePendingRemoteSync);
  schedulePendingRemoteSyncRef.current = schedulePendingRemoteSync;

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

      const { remoteChanges } = await applyRemoteCycle(config, remote);

      setStatus('ok');
      // Acción explícita del usuario: confirma SIEMPRE, también con cero cambios. A diferencia de los ciclos
      // automáticos, aquí callar se leería como que el botón no ha hecho nada.
      onNotice('ok', `Fusión sincronizada correctamente: ${remoteChanges} cambios remotos aplicados`);
    } catch (error) {
      handleSyncError(error, { fallback: SYNC_MESSAGES.syncError, logName: 'syncNow' });
    } finally {
      lock.release();
    }
  }, [applyRemoteCycle, onNotice, handleSyncError, handleNotModified]);

  // Arranque: una sola vez POR MONTAJE. Con `[initializeSync]` corría en cada render —el callback estrenaba
  // identidad con él— y era, de hecho, lo que disparaba los ciclos periódicos: cualquier render pasado el
  // throttle de 45 s arrancaba una sincronización. Funcionaba por accidente y tapaba que el sondeo no iba.
  useEffect(() => {
    const dirtyState = loadSyncDirtyState();
    if (dirtyState.isDirty) {
      transitionTo('dirty');
    }

    const config = getSyncConfig();
    if (config && canRead()) {
      void initializeSyncRef.current();
    }
  }, []);

  /**
   * LA MARCA DE PENDIENTES MANDA SOBRE DOS COSAS: el aviso del badge y el empujón automático.
   *
   * Se escucha la marca y no las transiciones de la máquina de sync, y la diferencia importa: la escritura pasa
   * a `idle` ANTES de limpiar la marca (ver `writeWithConflictRecovery`), así que un ciclo que acaba de subirlo
   * todo dejaría el aviso encendido hasta la siguiente transición que pasara por ahí.
   */
  const pendingUploadFromRef = useRef(pendingUploadFrom);
  pendingUploadFromRef.current = pendingUploadFrom;

  useEffect(() => {
    const unsubscribe = subscribeSyncDirtyState((state) => {
      setPendingUpload(pendingUploadFromRef.current(state));
      if (!state.isDirty) {
        cancelDirtyPush(); // ya no hay nada que subir: lo empujó otro ciclo
        return;
      }
      if (!getSyncConfig()) return; // sin sincronización configurada no hay a dónde subir
      scheduleDirtyPush();
    });
    return () => {
      unsubscribe();
      cancelDirtyPush();
    };
  }, [cancelDirtyPush, scheduleDirtyPush]);

  useEffect(() => {
    return subscribeSyncConfig((next) => {
      // Solo lo que la pantalla mira. Cada ciclo de sincronización reescribe la configuración con el etag nuevo,
      // y eso no cambia nada de lo que se pinta: sin este filtro, cada 304 provocaría un render de la app entera.
      setSyncConfig((prev) => (prev?.gistId === next?.gistId && Boolean(prev) === Boolean(next) ? prev : next));
    });
  }, []);

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
    /**
     * VOLVER A LA APP PIDE UNA LECTURA, PERO NO SALTÁNDOSE EL THROTTLE.
     *
     * Los dos handlers forzaban (`refreshRemote(true)`), y `force` se salta el mínimo de 45 s entre lecturas
     * (`canReadNow`). Dos consecuencias: al volver a la pestaña se disparaban DOS ciclos —el navegador emite
     * `visibilitychange` y `focus`— y alternar entre ventanas gastaba una petición a GitHub por cada vuelta,
     * aunque se hubiera leído un segundo antes. Cuentan para el rate-limit igual que las demás, y ese mismo
     * rate-limit lo comparte el hub social.
     *
     * Sin `force`, volver tras un rato (el caso normal) lee igual, y volver a los diez segundos no. El gesto
     * EXPLÍCITO del usuario —el botón de sincronizar— no pasa por aquí ni por el throttle: `syncNow` solo
     * respeta el candado, así que pedirlo a mano sigue funcionando siempre. Mismo criterio que ya aplica
     * `useAnnouncement` al volver a la app.
     */
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        pendingRemoteSyncRef.current = false;
        void refreshRemoteRef.current(false);
        startPolling();
        return;
      }

      // when hidden, stop polling to avoid wasted reads
      stopPolling();
    }

    function handleWindowFocus(): void {
      // on focus, attempt an immediate refresh
      void refreshRemoteRef.current(false);
    }

    // S3: al recuperar la red tras un fallo diferible (offline), no esperes al backoff: sal de
    // error_backoff y reintenta la acción pendiente de inmediato.
    function handleOnline(): void {
      const st = getSyncState();
      if (st.status !== 'error_backoff' || !st.pendingAction) return;
      const pending = st.pendingAction;
      transitionTo('idle', { errorCount: 0, pendingAction: null });
      if (pending === 'write') {
        retryPendingWriteRef.current();
        return;
      }
      // Aquí SÍ se fuerza, y es la excepción deliberada: se sale de `error_backoff` porque acaba de volver la
      // red, es un evento raro y lo que se busca es justo no esperar. No es el caso de focus/visibility.
      void refreshRemoteRef.current(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
    };
    // Sin `refreshRemote`/`retryPendingWrite` en las dependencias: se leen por ref (ver la nota de
    // `refreshRemoteRef`). `startPolling`/`stopPolling` ya son estables y se listan porque se usan directamente.
  }, [startPolling, stopPolling]);

  // BroadcastChannel: listen for remote writes from other tabs
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    const onMsg = (ev: MessageEvent) => {
      const msg = ev.data as { type: string } | null;
      if (!msg) return;
      if (msg.type === 'remote-write') {
        pendingRemoteSyncRef.current = true;
        schedulePendingRemoteSyncRef.current();
      }
    };
    ch.addEventListener('message', onMsg as any);
    return () => {
      ch.removeEventListener('message', onMsg as any);
      ch.close();
    };
    // Un canal por MONTAJE. Con la dependencia del callback se cerraba y reabría en cada render.
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = subscribeSyncState((state) => {
      if (pendingRemoteSyncRef.current) {
        schedulePendingRemoteSyncRef.current();
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
          void initializeSyncRef.current();
          return;
        }
        if (state.pendingAction === 'write') {
          retryPendingWriteRef.current(); // S2: no solapar el reintento de escritura
        }
      }, delay);
    });
    return () => {
      unsubscribe();
      if (timer) {
        window.clearTimeout(timer);
      }
    };
    // DEPENDENCIAS VACÍAS, Y AQUÍ ES LO QUE MÁS IMPORTA: el `timer` del reintento vive en este efecto, así que
    // su limpieza lo cancela. Con las dependencias anteriores el efecto se rehacía en cada render y el reintento
    // programado tras un error moría con él —el listener nuevo solo reacciona a transiciones futuras, y el
    // estado ya estaba en `error_backoff`—, de modo que el sync se quedaba parado hasta el siguiente focus.
  }, []);

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

      // L1: el id del gist de juegos se recupera de `privateConfig` (owner-only). Antes salía del perfil PÚBLICO,
      // que lo exponía a cualquier usuario autenticado. Fallback al doc público mientras queden perfiles sin
      // purgar; cuando se usa, se re-siembra en privateConfig para no volver a depender de él.
      const privateConfig = await getPrivateConfig(user.uid).catch(() => null);
      let profile = null as Awaited<ReturnType<typeof resolveOwnProfile>>;
      let recoveredGistId = String(privateConfig?.gamesGistId || '').trim();
      if (!recoveredGistId) {
        profile = await resolveOwnProfile(user);
        recoveredGistId = String(profile?.gamesGistId || '').trim();
        if (recoveredGistId) {
          void setPrivateConfig(user.uid, { gamesGistId: recoveredGistId }).catch(() => {});
        }
      }
      // B1: preferir el token CIFRADO de privateConfig; fallback al campo legacy en claro (perfiles viejos).
      const recoveredToken = (await recoverGithubToken(user.uid)) || readLegacyPlaintextToken(profile ?? (await resolveOwnProfile(user)));

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
      // Sin `forceTimestamp`: `data` YA es el estado local (su llamador acaba de decidir qué `_ts` estrena cada
      // juego), así que volver a sellar aquí solo servía para borrar la fecha de modificación de la biblioteca
      // entera. Para que el remoto adopte esto basta con reescribirlo completo, que es lo que hace `writeGist`.
      const normalizedData = normalizeData(data);
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
    /** ¿Hay ediciones marcadas que aún no están en el gist? Lo pinta el badge (ver `resolveSyncBadge`). */
    pendingUpload,
    lastRemoteChangesApplied,
    recoveringGistId,
    hasConfig: Boolean(syncConfig),
    currentConfig: syncConfig,
  };
}
