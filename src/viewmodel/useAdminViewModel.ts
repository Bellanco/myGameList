// ViewModel del panel de administración (`/admin`). Resuelve la sesión, decide si esta cuenta es la del admin y
// orquesta el censo y las acciones de moderación.
//
// El gate de aquí es de interfaz: quien no sea el admin ve la puerta cerrada en vez de una tabla vacía y un
// reguero de errores. Quien se la salte tocando el bundle se choca igual con `isAdmin()` en las reglas, que es
// donde está la seguridad de verdad (ver src/core/security/admin.ts).
//
// El repositorio se importa de forma estática y no por la fachada perezosa (`firebaseGateway`): este módulo solo
// lo carga `AdminHub`, que ya es un chunk `lazy`, así que el SDK no entra en el grafo del arranque.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_PANEL_UI } from '../core/constants/labels';
import { isAdminEmail } from '../core/security/admin';
import { subscribeSocialAuth } from '../model/repository/firebaseGateway';
import { ADMIN_ONLY_TIER, PROFILE_TIER_LABELS, type ProfileTier } from '../core/constants/tiers';
import {
  deleteUserProfile,
  loadAdminCensus,
  purgeLegacyProfileFields,
  setUserSocialEnabled,
  setUserTier,
  unifySocialGist,
  type AdminCensus,
  type AdminUserRow,
  type LegacyProfileField,
} from '../model/repository/firebaseAdminRepository';

export type AdminAccess = 'checking' | 'denied' | 'granted';

export type AdminStatus = { kind: 'ok' | 'warn' | 'err'; text: string } | null;

function matchesSearch(user: AdminUserRow, term: string): boolean {
  if (!term) {
    return true;
  }
  const needle = term.trim().toLowerCase();
  return (
    user.displayName.toLowerCase().includes(needle) ||
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
  useEffect(() => {
    return subscribeSocialAuth((user) => {
      if (!mountedRef.current) return;
      setOwnUid(String(user?.uid || ''));
      setAccess(isAdminEmail(user?.email) ? 'granted' : 'denied');
    });
  }, []);

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
   * Envoltorio común de las acciones: marca la fila ocupada, traduce el fallo a un mensaje y recarga el censo
   * (las tres acciones cambian lo que la tabla muestra, así que releer es más honesto que parchear el estado).
   */
  const runAction = useCallback(
    async (row: AdminUserRow, action: () => Promise<AdminStatus>) => {
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
          await refresh();
        }
      }
    },
    [refresh],
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

  /**
   * Unifica el canal social de quien acabó con dos gists en circulación. Decide con evidencia (qué gist es
   * legible públicamente y cuál tiene el contenido), no a dedo, y escribe el ganador en su perfil y en todas sus
   * amistades. Ver `pickLiveSocialGist`.
   */
  const unifyGist = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await unifySocialGist(row);
        if (result.failures.length > 0) {
          console.warn('[admin] unificación incompleta:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.gist.unifyPartial };
        }
        // Bloqueado por contenido en el perdedor: unificar haría desaparecer del feed lo que solo esté ahí.
        if (result.blocked === 'contenido-en-el-perdedor') {
          return {
            kind: 'warn',
            text: ADMIN_PANEL_UI.gist.unifyBlocked(result.verdict.winner, result.verdict.losers[0] || ''),
          };
        }
        // Sin ganador no se ha escrito nada: hay que decir POR QUÉ, o parecerá que la acción no hizo nada.
        if (!result.verdict.winner) {
          return {
            kind: 'warn',
            text: result.verdict.reason === 'sin-evidencia'
              ? ADMIN_PANEL_UI.gist.unifyNoEvidence
              : ADMIN_PANEL_UI.gist.unifyNoPublic,
          };
        }
        if (!result.applied) {
          return { kind: 'ok', text: ADMIN_PANEL_UI.gist.unifyAlready };
        }
        return {
          kind: 'ok',
          text: ADMIN_PANEL_UI.gist.unifyDone(result.verdict.winner, result.friendshipsUpdated),
        };
      }),
    [runAction],
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

  const deleteUser = useCallback(
    (row: AdminUserRow) =>
      runAction(row, async () => {
        const result = await deleteUserProfile(row.id, row.uid);
        if (!result.ok) {
          console.warn('[admin] borrado incompleto:', result.failures);
          return { kind: 'warn', text: ADMIN_PANEL_UI.partialDeleted };
        }
        return { kind: 'ok', text: ADMIN_PANEL_UI.okDeleted };
      }),
    [runAction],
  );

  const users = useMemo(
    () => (census?.users || []).filter((user) => matchesSearch(user, search)),
    [census, search],
  );

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
    busyId,
    refresh,
    changeTier,
    unifyGist,
    toggleSocial,
    purgeLegacy,
    deleteUser,
  };
}
