// ViewModel del panel de administración (`/admin`). Resuelve la sesión, decide si esta cuenta es la del admin y
// orquesta el censo y las acciones de moderación.
//
// El gate de aquí es de interfaz: quien no sea el admin ve la puerta cerrada en vez de una tabla vacía y un
// reguero de errores. Quien se la salte tocando el bundle se choca igual con `isAdmin()` en las reglas, que es
// donde está la seguridad de verdad: las dos comprueban el MISMO custom claim (ver src/core/security/admin.ts).
//
// El repositorio se importa de forma estática y no por la fachada perezosa (`firebaseGateway`): este módulo solo
// lo carga `AdminHub`, que ya es un chunk `lazy`, así que el SDK no entra en el grafo del arranque.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../core/constants/adminLabels';
import { readAdminClaim, subscribeSocialAuth } from '../model/repository/firebaseGateway';
import { ADMIN_ONLY_TIER, PROFILE_TIER_LABELS, type ProfileTier } from '../core/constants/tiers';
import {
  clearProfileAchievements,
  clearStrayProfilePhoto,
  deleteUserProfile,
  healUserFriendshipIdentity,
  loadAdminCensus,
  migrateForeignProfileDoc,
  purgeFossilFriendshipRequests,
  purgeLegacyProfileFields,
  readAdminCensusRow,
  replaceCensusRow,
  setUserDisplayName,
  setUserSocialEnabled,
  setUserTier,
  type AdminCensus,
  type AdminUserRow,
  type LegacyProfileField,
} from '../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../model/types/firestore';
import type { AdminLogEntry, AdminLogKind } from '../model/repository/admin/adminPanelStore';
import type { AdminLogDraft } from './useAdminLog';

export type AdminAccess = 'checking' | 'denied' | 'granted';

export type AdminStatus = {
  kind: 'ok' | 'warn' | 'err';
  text: string;
  /** Si la acción es reversible y quedó apuntada en el registro, esto la deshace (el aviso lleva «Deshacer»). */
  undo?: () => Promise<void>;
} | null;

/** Lo que devuelve cada acción: su resultado y, si salió bien, lo que se apunta en el registro. */
type ActionResult = NonNullable<AdminStatus> & { log?: AdminLogDraft };

/** Lo que el ViewModel necesita del registro (ver `useAdminLog`). Opcional: sin él, las acciones no se apuntan. */
export interface AdminLogPort {
  record: (draft: AdminLogDraft) => Promise<AdminLogEntry | null>;
  undo: (entry: AdminLogEntry) => Promise<void>;
}

// Las señales graves y el filtro de la tabla viven en el núcleo (`core/admin/userFilters`): los filtros van en la
// URL y la portada los necesita para enlazar con la tabla ya filtrada. Se reexportan aquí por compatibilidad.
export { SEVERE_ANOMALIES } from '../core/admin/userFilters';

const L = ADMIN_SHELL_UI.log.texts;

/** La entrada del registro de una acción sobre `row`, con el nombre que se le veía en ese momento. */
function logDraft(row: AdminUserRow, kind: AdminLogKind, text: string, undo: AdminLogEntry['undo'] = null): AdminLogDraft {
  return { kind, text, targetUid: row.uid, targetName: row.displayName.trim() || row.knownAs.trim(), undo };
}

export function useAdminViewModel(log?: AdminLogPort) {
  // En una ref: el registro no tiene que rehacer las acciones (ni sus `useCallback`) cada vez que cambia.
  const logRef = useRef(log);
  useEffect(() => {
    logRef.current = log;
  }, [log]);
  const [access, setAccess] = useState<AdminAccess>('checking');
  // uid de la sesión: es lo que permite saber cuál de las filas es la del propio admin (la única a la que el
  // panel ofrece Mithril). Los documentos ya no publican el email, así que no hay otra forma de identificarla.
  const [ownUid, setOwnUid] = useState('');
  const [census, setCensus] = useState<AdminCensus | null>(null);
  /** Cuándo se leyó el censo que se está enseñando (ms). 0 = aún nada. Lo pinta la línea de frescura. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AdminStatus>(null);
  const [busyId, setBusyId] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // La primera emisión llega cuando la sesión persistida ya se ha restaurado (o se ha confirmado que no hay):
  // hasta entonces `access` sigue en 'checking' y la pantalla no decide nada.
  //
  // LEER EL CLAIM ES ASÍNCRONO, y eso obliga a dos cuidados que con el correo no hacían falta:
  //
  //  1. VOLVER A 'checking' EN CADA CAMBIO DE SESIÓN, no solo al arrancar. Entre que llega el usuario y responde
  //     la lectura del token hay renders con sesión presente y acceso aún sin resolver; si esos renders dijeran
  //     'denied', quien inicia sesión estando ya en /admin vería la puerta cerrada y se iría a la portada aunque
  //     mande. Solo entraría quien recargase la página con la sesión ya hecha.
  //  2. DESCARTAR RESPUESTAS VIEJAS. Dos emisiones seguidas (cerrar y abrir sesión) lanzan dos lecturas, y la
  //     primera puede contestar después: la marca de generación deja pasar solo a la última.
  //
  // El REINTENTO FORZANDO el refresco del token es lo que evita el «me has hecho administrador y no entro»: el ID
  // token vive cacheado hasta una hora, así que un claim recién asignado no aparece hasta renovarlo. Se paga solo
  // cuando la primera lectura dice que no, es decir, casi siempre a quien no manda y husmea una ruta oculta.
  useEffect(() => {
    let generacion = 0;
    return subscribeSocialAuth((user) => {
      if (!mountedRef.current) return;
      const mia = ++generacion;
      setOwnUid(String(user?.uid || ''));
      if (!user) {
        setAccess('denied');
        return;
      }
      setAccess('checking');
      void (async () => {
        const manda = (await readAdminClaim()) || (await readAdminClaim(true));
        if (!mountedRef.current || mia !== generacion) return;
        setAccess(manda ? 'granted' : 'denied');
      })();
    });
  }, []);

  // El censo vigente, para las relecturas de una ficha: necesitan saber qué documentos hay sin depender del render.
  const censusRef = useRef<AdminCensus | null>(null);
  useEffect(() => {
    censusRef.current = census;
  }, [census]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await loadAdminCensus();
      if (!mountedRef.current) return;
      setCensus(next);
      setLoadedAt(Date.now());
    } catch (loadError) {
      if (!mountedRef.current) return;
      setCensus(null);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'granted') {
      void refresh();
    }
  }, [access, refresh]);

  /**
   * Relee SOLO la ficha de esa persona y la coloca sobre el censo que haya en ese momento. Si la relectura falla,
   * el censo entero: más caro, pero la pantalla no se queda enseñando lo de antes de la acción.
   */
  const refreshRow = useCallback(async (profileDocId: string) => {
    const current = censusRef.current;
    if (!current) {
      await refresh();
      return;
    }
    try {
      const reading = await readAdminCensusRow(current, profileDocId);
      if (!mountedRef.current) return;
      setCensus((latest) => (latest ? replaceCensusRow(latest, reading) : latest));
    } catch {
      await refresh();
    }
  }, [refresh]);

  /**
   * Envoltorio común de las acciones: marca la fila ocupada, traduce el fallo a un mensaje y relee lo que la acción
   * ha cambiado (releer es más honesto que parchear el estado). `scope`: su ficha, o el censo entero cuando la acción
   * cambia también filas ajenas (ver `readAdminCensusRow`).
   */
  /** Deshace una acción apuntada y relee la ficha afectada. Lo usan el aviso de la acción y la pantalla del registro. */
  const undoLogged = useCallback(
    async (entry: AdminLogEntry) => {
      const port = logRef.current;
      if (!port || !entry.undo) return;
      // SOLO SI SIGUE COMO LA DEJÓ ESA ACCIÓN. Deshacer escribe el valor de ANTES; si después hubo otro cambio (otra
      // acción, o el propio usuario), escribirlo pisaría ese cambio. Con el censo delante se comprueba y se niega.
      const current = censusRef.current?.users.find((user) => user.id === entry.undo?.profileDocId);
      const undo = entry.undo;
      const stillThere =
        !current ||
        (undo.action === 'tier' ? undo.to === undefined || current.tier === undo.to : undo.to === undefined || current.socialEnabled === undo.to);
      if (!stillThere) {
        setStatus({ kind: 'warn', text: ADMIN_SHELL_UI.log.undoStale });
        return;
      }
      try {
        await port.undo(entry);
        if (!mountedRef.current) return;
        setStatus({ kind: 'ok', text: ADMIN_SHELL_UI.log.undone(entry.text) });
      } catch (undoError) {
        console.warn('[admin] no se pudo deshacer:', undoError);
        if (mountedRef.current) setStatus({ kind: 'err', text: ADMIN_SHELL_UI.log.undoFailed });
      }
      if (mountedRef.current) await refreshRow(entry.undo.profileDocId);
    },
    [refreshRow],
  );

  const runAction = useCallback(
    async (row: AdminUserRow, action: () => Promise<ActionResult>, scope: 'row' | 'census' = 'row') => {
      setBusyId(row.id);
      setStatus(null);
      try {
        const { log: draft, ...result } = await action();
        // Se apunta lo que salió bien (también a medias: lo hecho, hecho está). El fallo del registro no para nada.
        const entry = draft && result.kind !== 'err' && logRef.current ? await logRef.current.record(draft) : null;
        if (!mountedRef.current) return;
        setStatus(entry?.undo ? { ...result, undo: () => undoLogged(entry) } : result);
      } catch (actionError) {
        console.warn('[admin] acción fallida:', actionError);
        if (!mountedRef.current) return;
        setStatus({
          kind: 'err',
          text: actionError instanceof Error ? actionError.message : ADMIN_PANEL_UI.errorGeneric,
        });
      } finally {
        // Si la pantalla ya no está montada no se recarga: sería una lectura de Firestore para nadie.
        if (mountedRef.current) {
          setBusyId('');
          await (scope === 'row' ? refreshRow(row.id) : refresh());
        }
      }
    },
    [refresh, refreshRow, undoLogged],
  );

  const toggleSocial = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const next = !row.socialEnabled;
        await setUserSocialEnabled(row.id, next);
        return {
          kind: 'ok',
          text: next ? ADMIN_PANEL_UI.okEnabled : ADMIN_PANEL_UI.okDisabled,
          log: logDraft(row, 'social', next ? L.socialOn : L.socialOff, { action: 'social', profileDocId: row.id, enabled: !next, to: next }),
        };
      }),
    [runAction],
  );

  /**
   * Cambia el rango. Mithril solo se acepta sobre la propia cuenta del admin: es el rango reservado, y la
   * comprobación se repite aquí (no solo en el `<select>`) para que no dependa de qué opciones pinte la tabla.
   */
  const changeTier = useCallback(
    (row: AdminUserRow, tier: ProfileTier) =>
      runAction(row, async () => {
        if (tier === ADMIN_ONLY_TIER && row.uid !== ownUid) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.tierReservedWarning };
        }
        await setUserTier(row.id, tier);
        return {
          kind: 'ok',
          text: ADMIN_PANEL_UI.okTier(PROFILE_TIER_LABELS[tier]),
          log: logDraft(row, 'tier', L.tier(PROFILE_TIER_LABELS[row.tier], PROFILE_TIER_LABELS[tier]), {
            action: 'tier',
            profileDocId: row.id,
            tier: row.tier,
            to: tier,
          }),
        };
      }),
    [ownUid, runAction],
  );

  const purgeLegacy = useCallback(
    (row: AdminUserRow, field: LegacyProfileField) =>
      runAction(row, async () => {
        // Guarda de seguridad, además de la del botón: en un perfil que no se identifica por el uid, el email es
        // la única forma de que su dueño lo recupere. Borrarlo ahí es irreversible y le duplica el perfil.
        if (field === 'email' && !row.idMatchesUid) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.legacyEmailLocked };
        }
        await purgeLegacyProfileFields(row.id, [field]);
        return { kind: 'ok', text: ADMIN_PANEL_UI.okPurged, log: logDraft(row, 'legacy', L.legacy(field)) };
      }),
    [runAction],
  );

  /**
   * Cutover de identidad: lleva un perfil legacy a `profiles/{uid}` y retira el huérfano.
   *
   * Solo se puede si se conoce el uid de destino, y para eso el documento tiene que traer el campo `uid`. Cuando no
   * lo trae, `AdminUserRow.uid` cae al id del propio documento (ver el censo) y no hay forma de saber de quién es:
   * ese caso lo desbloquea su dueño al entrar, cuyo navegador crea el documento canónico.
   */
  const migrateIdentity = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        if (row.idMatchesUid) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.cutover.alreadyCanonical };
        }
        if (!row.uid || row.uid === row.id) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.cutover.unknownUid };
        }
        const result = await migrateForeignProfileDoc(row.id, row.uid);
        return {
          log: logDraft(row, 'cutover', L.cutover),
          kind: 'ok',
          text: result.outcome === 'moved'
            ? ADMIN_PANEL_UI.cutover.okMoved
            : ADMIN_PANEL_UI.cutover.okMerged(result.carried),
        };
      }, 'census'),
    [runAction],
  );

  /**
   * Propaga el nick y la foto del perfil a sus documentos de amistad. El nombre que se propaga es el que la ficha
   * usa para identificarle: si el perfil no tiene nick, el respaldo es el que ya guardan sus amistades, y propagar un
   * vacío les borraría la única forma de reconocerle (el mismo cuidado que tiene el saneado del propio cliente).
   */
  const healIdentity = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const name = row.displayName.trim() || row.knownAs.trim();
        if (!name) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.healIdentity.noName };
        }
        const result = await healUserFriendshipIdentity(row.uid, { name, photoURL: row.photoURL });
        if (!result.ok) {
          console.warn('[admin] propagación incompleta:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.healIdentity.partial, log: logDraft(row, 'identity', L.identity) };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.healIdentity.ok(result.touched), log: logDraft(row, 'identity', L.identity) };
      }),
    [runAction],
  );

  /**
   * Fija cuál de los nombres en circulación es el bueno: lo escribe en el perfil y lo propaga a sus amistades.
   *
   * Es el desempate del administrador, que ve los dos valores. Su alcance tiene un límite que conviene recordar: el
   * nick vive en el gist del usuario, así que si el gist dice otra cosa, su cliente volverá a imponerlo al abrir el
   * espacio social. Sirve para dejar el directorio coherente y para quien ya no vuelve.
   */
  const chooseDisplayName = useCallback(
    (row: AdminUserRow, name: string) =>
      runAction(row, async () => {
        const clean = name.trim();
        if (!clean) {
          return { kind: 'warn', text: ADMIN_PANEL_UI.healIdentity.noName };
        }
        const result = await setUserDisplayName(row.id, row.uid, clean, row.photoURL);
        if (!result.ok) {
          console.warn('[admin] no se pudo fijar el nombre:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.chooseName.partial, log: logDraft(row, 'identity', L.name(clean)) };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.chooseName.ok(clean, result.touched), log: logDraft(row, 'identity', L.name(clean)) };
      }),
    [runAction],
  );

  /** Retira la foto que su perfil publica de más (señal `stray-photo`), del perfil y de sus amistades. */
  const clearStrayPhoto = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await clearStrayProfilePhoto(row.id, row.uid, row.photoURL);
        if (!result.ok) {
          console.warn('[admin] retirada de foto incompleta:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.strayPhoto.partial, log: logDraft(row, 'photo', L.photo) };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.strayPhoto.ok, log: logDraft(row, 'photo', L.photo) };
      }),
    [runAction],
  );

  /**
   * Retira TODAS las fotos publicadas de más del censo cargado. Una detrás de otra —no en paralelo— porque son
   * pocas y así un fallo de red a mitad deja un recuento honesto de cuántas salieron; el censo se relee entero al
   * acabar. Un perfil que no se deja escribir no para a los demás.
   */
  const [clearingStrayPhotos, setClearingStrayPhotos] = useState(false);
  const clearAllStrayPhotos = useCallback(async () => {
    const targets = (censusRef.current?.users || []).filter((user) => user.anomalies.includes('stray-photo'));
    if (targets.length === 0) return;
    setClearingStrayPhotos(true);
    setStatus(null);
    let done = 0;
    for (const target of targets) {
      try {
        const result = await clearStrayProfilePhoto(target.id, target.uid, target.photoURL);
        if (!result.ok) console.warn('[admin] retirada de foto incompleta:', target.id, result.failures);
        // El perfil es lo que se ve en el directorio: si ese se escribió, la foto ya no está a la vista.
        if (result.profileCleared) {
          done += 1;
          await logRef.current?.record(logDraft(target, 'photo', L.photo));
        }
      } catch (error) {
        console.warn('[admin] no se pudo retirar la foto:', target.id, error);
      }
    }
    if (!mountedRef.current) return;
    setClearingStrayPhotos(false);
    setStatus({
      kind: done === targets.length ? 'ok' : 'warn',
      text: ADMIN_PANEL_UI.strayPhoto.bulkOk(done, targets.length),
    });
    await refresh();
  }, [refresh]);

  /**
   * ACCIONES EN LOTE de la tabla: la misma escritura que la de una ficha, una detrás de otra —no en paralelo— para
   * que un fallo a mitad deje un recuento honesto de cuántas salieron. Un perfil que no se deja escribir no para a
   * los demás. Al acabar se relee el censo entero (son varias filas).
   */
  const [bulkBusy, setBulkBusy] = useState(false);
  const runBulk = useCallback(
    async (rows: readonly AdminUserRow[], action: (row: AdminUserRow) => Promise<AdminLogDraft | null>) => {
      if (rows.length === 0) return;
      setBulkBusy(true);
      setStatus(null);
      let done = 0;
      for (const row of rows) {
        try {
          const draft = await action(row);
          done += 1;
          if (draft && logRef.current) await logRef.current.record(draft);
        } catch (error) {
          console.warn('[admin] acción en lote fallida:', row.id, error);
        }
      }
      if (!mountedRef.current) return;
      setBulkBusy(false);
      setStatus({ kind: done === rows.length ? 'ok' : 'warn', text: ADMIN_SHELL_UI.users.bulk.done(done, rows.length) });
      await refresh();
    },
    [refresh],
  );

  /** Cambia el rango de varias personas. Mithril nunca entra en lote: es solo del administrador. */
  const bulkSetTier = useCallback(
    (rows: readonly AdminUserRow[], tier: ProfileTier) =>
      runBulk(
        // Ni se da Mithril en lote ni se quita: «seleccionar todo» y «Oro» rebajaba también la cuenta del administrador.
        rows.filter((row) => row.tier !== tier && row.tier !== ADMIN_ONLY_TIER && tier !== ADMIN_ONLY_TIER),
        async (row) => {
          await setUserTier(row.id, tier);
          return logDraft(row, 'tier', L.tier(PROFILE_TIER_LABELS[row.tier], PROFILE_TIER_LABELS[tier]), {
            action: 'tier',
            profileDocId: row.id,
            tier: row.tier,
            to: tier,
          });
        },
      ),
    [runBulk],
  );

  /** Suspende el social de varias personas (las que ya lo tienen suspendido se saltan). */
  const bulkDisableSocial = useCallback(
    (rows: readonly AdminUserRow[]) =>
      runBulk(rows.filter((row) => row.socialEnabled), async (row) => {
        await setUserSocialEnabled(row.id, false);
        return logDraft(row, 'social', L.socialOff, { action: 'social', profileDocId: row.id, enabled: true, to: false });
      }),
    [runBulk],
  );

  /** Borra sus solicitudes enviadas que llevan más de 180 días pendientes. */
  const purgeFossilRequests = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await purgeFossilFriendshipRequests(row.uid);
        if (!result.ok) {
          console.warn('[admin] purga incompleta:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.fossil.partial, log: logDraft(row, 'requests', L.requests(result.touched)) };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.fossil.ok(result.touched), log: logDraft(row, 'requests', L.requests(result.touched)) };
      }, 'census'),
    [runAction],
  );

  /**
   * Borra el espejo de logros publicado de UNA persona. No le quita ningún logro: los suyos se derivan de su
   * biblioteca en su propio aparato, y los volverá a publicar en cuanto abra la app (lo dice la confirmación).
   */
  const clearAchievements = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        await clearProfileAchievements(row.id);
        return { kind: 'ok', text: ADMIN_PANEL_UI.achievementsDone, log: logDraft(row, 'achievements', L.achievements) };
      }),
    [runAction],
  );

  const deleteUser = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await deleteUserProfile(row.id, row.uid);
        if (!result.ok) {
          console.warn('[admin] borrado incompleto:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.partialDeleted, log: logDraft(row, 'delete', L.deleted) };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.okDeleted, log: logDraft(row, 'delete', L.deleted) };
      }, 'census'),
    [runAction],
  );

  /** Cuántas fichas tiene cada señal, para el desplegable del filtro: solo se ofrecen las que hay. */
  const signalCounts = useMemo(() => {
    const counts = new Map<AdminAnomaly, number>();
    (census?.users || []).forEach((user) => {
      user.anomalies.forEach((code) => counts.set(code, (counts.get(code) || 0) + 1));
    });
    return counts;
  }, [census]);

  return {
    access,
    ownUid,
    census,
    loadedAt,
    loading,
    error,
    status,
    signalCounts,
    busyId,
    refresh,
    changeTier,
    toggleSocial,
    purgeLegacy,
    migrateIdentity,
    healIdentity,
    chooseDisplayName,
    purgeFossilRequests,
    clearStrayPhoto,
    clearAllStrayPhotos,
    clearingStrayPhotos,
    clearAchievements,
    deleteUser,
    undoLogged,
    bulkBusy,
    bulkSetTier,
    bulkDisableSocial,
  };
}
