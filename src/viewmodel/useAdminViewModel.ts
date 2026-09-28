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
import { ADMIN_PANEL_UI } from '../core/constants/adminLabels';
import { readAdminClaim, subscribeSocialAuth } from '../model/repository/firebaseGateway';
import { ADMIN_ONLY_TIER, PROFILE_TIER_LABELS, type ProfileTier } from '../core/constants/tiers';
import {
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

export type AdminAccess = 'checking' | 'denied' | 'granted';

export type AdminStatus = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

/**
 * Señales que no son "estado raro" sino un problema con consecuencias hoy: un token en claro que cualquiera puede
 * leer, unas reseñas que no llegan al feed, o fechas imposibles. La ficha las destaca y la lista las pone primero,
 * para que no se pierdan entre las informativas (esquema antiguo, inactividad).
 */
export const SEVERE_ANOMALIES: ReadonlySet<AdminAnomaly> = new Set<AdminAnomaly>([
  'legacy-token',
  'gist-drift',
  'future-activity',
  'created-after-activity',
]);

/** Qué fichas se enseñan: todas, las que tienen alguna señal, o las que tienen UNA señal concreta. */
export type AdminSignalFilter = 'all' | 'flagged' | AdminAnomaly;

function matchesSignal(user: AdminUserRow, filter: AdminSignalFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'flagged') return user.anomalies.length > 0;
  return user.anomalies.includes(filter);
}

function isSevere(user: AdminUserRow): boolean {
  return user.anomalies.some((code) => SEVERE_ANOMALIES.has(code));
}

function matchesSearch(user: AdminUserRow, term: string): boolean {
  if (!term) {
    return true;
  }
  const needle = term.trim().toLowerCase();
  // Se busca por TODO lo que identifica una fila en la pantalla, no solo por el nick del perfil: a quien lo tiene
  // vacío la ficha lo identifica con el nombre que le dan sus amigos, y sin eso aquí era imposible encontrarlo
  // escribiendo el nombre que se está leyendo. El pseudónimo entra por lo mismo: es lo que aparece en el gist y en
  // las entradas del feed, así que es el término con el que se llega desde un dato publicado.
  return (
    user.displayName.toLowerCase().includes(needle) ||
    user.knownAs.toLowerCase().includes(needle) ||
    user.friendKnownNames.some((known) => known.toLowerCase().includes(needle)) ||
    user.profileId.toLowerCase().includes(needle) ||
    user.uid.toLowerCase().includes(needle) ||
    user.id.toLowerCase().includes(needle)
  );
}

export function useAdminViewModel() {
  const [access, setAccess] = useState<AdminAccess>('checking');
  // uid de la sesión: es lo que permite saber cuál de las filas es la del propio admin (la única a la que el
  // panel ofrece Mithril). Los documentos ya no publican el email, así que no hay otra forma de identificarla.
  const [ownUid, setOwnUid] = useState('');
  const [census, setCensus] = useState<AdminCensus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AdminStatus>(null);
  const [search, setSearch] = useState('');
  // Filtro de atención. El censo crece y la búsqueda por texto no sirve para la pregunta que se hace al abrir el
  // panel, que no es "¿dónde está fulano?" sino "¿hay algo que mirar hoy?" — y, en cuanto hay algo, "¿quién más
  // tiene ESTO?", que es lo que responde filtrar por una señal concreta.
  const [signalFilter, setSignalFilter] = useState<AdminSignalFilter>('all');
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
  const runAction = useCallback(
    async (row: AdminUserRow, action: () => Promise<AdminStatus>, scope: 'row' | 'census' = 'row') => {
      setBusyId(row.id);
      setStatus(null);
      try {
        const result = await action();
        if (!mountedRef.current) return;
        setStatus(result);
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
    [refresh, refreshRow],
  );

  const toggleSocial = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const next = !row.socialEnabled;
        await setUserSocialEnabled(row.id, next);
        return { kind: 'ok', text: next ? ADMIN_PANEL_UI.okEnabled : ADMIN_PANEL_UI.okDisabled };
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
        return { kind: 'ok', text: ADMIN_PANEL_UI.okTier(PROFILE_TIER_LABELS[tier]) };
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
        return { kind: 'ok', text: ADMIN_PANEL_UI.okPurged };
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
          return { kind: 'warn', text: ADMIN_PANEL_UI.healIdentity.partial };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.healIdentity.ok(result.touched) };
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
          return { kind: 'warn', text: ADMIN_PANEL_UI.chooseName.partial };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.chooseName.ok(clean, result.touched) };
      }),
    [runAction],
  );

  /** Borra sus solicitudes enviadas que llevan más de 180 días pendientes. */
  const purgeFossilRequests = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await purgeFossilFriendshipRequests(row.uid);
        if (!result.ok) {
          console.warn('[admin] purga incompleta:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.fossil.partial };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.fossil.ok(result.touched) };
      }, 'census'),
    [runAction],
  );

  const deleteUser = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await deleteUserProfile(row.id, row.uid);
        if (!result.ok) {
          console.warn('[admin] borrado incompleto:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.partialDeleted };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.okDeleted };
      }, 'census'),
    [runAction],
  );

  // LO GRAVE PRIMERO. Dentro de cada grupo se respeta el orden del censo (actividad más reciente arriba): `sort` es
  // estable, así que basta con comparar la gravedad.
  const users = useMemo(
    () =>
      (census?.users || [])
        .filter((user) => matchesSearch(user, search) && matchesSignal(user, signalFilter))
        .sort((a, b) => Number(isSevere(b)) - Number(isSevere(a))),
    [census, search, signalFilter],
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
    users,
    loading,
    error,
    status,
    search,
    setSearch,
    signalFilter,
    setSignalFilter,
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
    deleteUser,
  };
}
