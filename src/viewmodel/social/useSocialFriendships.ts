import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { invalidateCachedSocialDirectory } from '../../model/repository/indexedDbRepository';
import {
  acceptFriendRequest,
  deleteFriendship,
  getMyFriendships,
  haveFriendshipEdgesChanged,
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS,
  readFriendship,
  sendFriendRequest,
  type FriendshipSelfInfo,
} from '../../model/repository/firebaseRepository';
import type { FriendshipView, MyFriendships, RelationshipState } from '../../model/types/social';

/**
 * Amistades: el estado, sus derivados y las cuatro mutaciones (pedir, aceptar, cancelar/rechazar, eliminar).
 *
 * Extraído de `useSocialViewModel`, que concentraba esto junto al directorio, el feed, el editor de perfil y la
 * pasarela. Es la pieza más independiente de las cinco: todo su estado sale de UNA consulta `array-contains`
 * (cacheada en el repositorio) y no lo lee nadie más.
 *
 * LO QUE NO SE LLEVA, y por qué: las filas ENRIQUECIDAS de la bandeja (nombre y foto) necesitan el directorio ya
 * hidratado, y el directorio necesita saber quiénes son tus amigos. Traerlas aquí cerraría un círculo entre los
 * dos. Se quedan en `friendshipViews.ts`, como función pura que el compositor alimenta con las dos cosas.
 *
 */
export interface SocialFriendships {
  /** Estado crudo, tal y como lo devuelve el repositorio. */
  friendships: MyFriendships;
  loadingFriendships: boolean;
  /**
   * ¿Se ha resuelto el estado de amistad al menos una vez? El feed es solo-amigos y lee gists SOLO de
   * `friendships.friends`; si el directorio se hidratara ANTES de conocerlos, los cachearía como index-only (sin
   * actividad) y el feed quedaría en blanco hasta invalidar la caché. Quien hidrata espera a esta marca.
   */
  friendshipsResolved: boolean;
  /** uid del "otro" con una mutación en curso: deshabilita SU botón sin bloquear el resto de la pantalla. */
  friendshipBusyUid: string;
  /** uids con amistad aceptada. Lo consumen la política de fotos y el feed. */
  friendUidSet: ReadonlySet<string>;
  pendingIncomingCount: number;
  relationshipWith: (otherUid: string) => RelationshipState;
  refreshFriendships: (forceRefresh?: boolean, maxAgeMs?: number) => Promise<void>;
  /** Tras una mutación: tira la caché del directorio y relee las amistades. */
  refreshAfterFriendshipChange: () => Promise<void>;
  handleAddOrAcceptFriend: (otherUid: string) => Promise<void>;
  /** Retirar una petición enviada. NO borra: abre confirmación (ver `friendActionTarget`). */
  handleCancelFriendRequest: (otherUid: string) => void;
  /** Rechazar una petición recibida. NO borra: abre confirmación. */
  handleRejectFriendRequest: (otherUid: string) => void;
  /** Deshacer una amistad. NO borra: abre confirmación. */
  handleRemoveFriend: (otherUid: string) => void;
  /** Acción destructiva pendiente de confirmar, si la hay. Quien la pinta decide el rótulo por `action`. */
  friendActionTarget: FriendActionTarget | null;
  confirmFriendAction: () => Promise<void>;
  cancelFriendAction: () => void;
}

/**
 * Las tres acciones que BORRAN el documento de amistad. Comparten diálogo porque comparten consecuencia: ninguna
 * se deshace, y la única diferencia entre ellas es cómo se llama lo que se pierde.
 */
export type FriendAction = 'remove' | 'reject' | 'cancel';

export interface FriendActionTarget {
  uid: string;
  name: string;
  action: FriendAction;
}

export interface SocialFriendshipsOptions {
  /** uid de la sesión de Google. Sin él no hay amistades que leer. */
  myUid: string | undefined;
  /** Gist social propio; su caché de directorio se invalida tras cada cambio de amistad. */
  socialGistId: string;
  /** ¿Está abierto el espacio social? Fuera de él no se consulta nada. */
  socialSpaceOpen: boolean;
  /**
   * ¿Está en pantalla la de SOLICITUDES? Ahí se va a ver si ha llegado alguna, así que no le vale la copia de hasta
   * 15 min que sirve al resto del espacio social: pide la frescura de `MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS`.
   */
  requestsPanelOpen?: boolean;
  /** Identidad denormalizada que viaja al documento de amistad (nick, foto y gists). */
  buildSelfInfo: () => FriendshipSelfInfo;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
}

const EMPTY: MyFriendships = { friends: [], incoming: [], outgoing: [], byOtherUid: {} };

/**
 * ARISTAS PENDIENTES (docs/plan-historial-amigo-nuevo.md, Fase 2). La copia de amistades vale 15 min, y con el hub
 * abierto no se relee nunca: quien pidió una amistad tardaba eso (o más) en enterarse de que se la habían aceptado,
 * y con ello en ver el historial del otro. Las aristas en las que se espera algo de la otra parte se miran una a una
 * (1 lectura cada una) al abrir el hub y al volver a la pestaña; solo si alguna ha cambiado se relee la lista.
 *
 * Como mucho una vez por minuto, la misma frescura que la pantalla de solicitudes
 * (`MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS`, que se lee al comprobar y no al cargar el módulo). Y a nivel de módulo, no
 * de hook: el hub se desmonta al salir, y abrirlo y cerrarlo seguido no debe pagar la comprobación en cada vuelta.
 */
/**
 * Una arista que lleva una semana igual ya no se mira: una petición que nadie contesta, o una amistad de la 1.6.7
 * cuyo solicitante no vuelve, gastaría una lectura en cada visita indefinidamente. La relectura normal de 15 min
 * las sigue cubriendo.
 */
const EDGE_CHECK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let lastEdgeCheckAt = 0;

/** Las aristas que merece la pena mirar ahora (ver `EDGE_CHECK_MAX_AGE_MS`). */
export function edgesAwaitingOtherSide(friendships: MyFriendships, now: number): FriendshipView[] {
  const recent = (at: number) => at > 0 && now - at < EDGE_CHECK_MAX_AGE_MS;
  return [
    // Peticiones mías sin contestar: ¿me han aceptado (o rechazado)?
    ...friendships.outgoing.filter((view) => recent(view.createdAt)),
    // Amigos sin los ids del otro: ¿han llegado ya?
    ...friendships.friends.filter((view) => !view.otherSocialGistId && recent(view.updatedAt)),
  ];
}

/** Solo para tests: olvida la última comprobación. */
export function resetFriendshipEdgeCheckForTests(): void {
  lastEdgeCheckAt = 0;
}

export function useSocialFriendships(options: SocialFriendshipsOptions): SocialFriendships {
  const { myUid, socialGistId, socialSpaceOpen, requestsPanelOpen = false, buildSelfInfo, setFeedback, reportFailure } = options;

  const [friendships, setFriendships] = useState<MyFriendships>(EMPTY);
  const [loadingFriendships, setLoadingFriendships] = useState(false);
  const [friendshipsResolved, setFriendshipsResolved] = useState(false);
  const [friendshipBusyUid, setFriendshipBusyUid] = useState<string>('');
  const [friendActionTarget, setFriendActionTarget] = useState<FriendActionTarget | null>(null);

  const refreshFriendships = useCallback(async (forceRefresh = false, maxAgeMs?: number) => {
    if (!myUid) {
      setFriendships(EMPTY);
      setFriendshipsResolved(true);
      return;
    }
    try {
      setLoadingFriendships(true);
      setFriendships(await getMyFriendships(myUid, { forceRefresh, maxAgeMs }));
    } catch {
      /* best-effort: sin amistad el resto del social sigue usable. */
    } finally {
      setLoadingFriendships(false);
      // Resuelto SIEMPRE, incluso si Firestore falló: degrada a feed sin amigos en vez de bloquearlo para siempre.
      setFriendshipsResolved(true);
    }
  }, [myUid]);

  // Al abrir el espacio social y al ENTRAR en solicitudes. Ir y volver entre pantallas no cuesta lecturas: la copia
  // del repositorio (memoria e IndexedDB) responde mientras tenga la edad que pide cada una.
  useEffect(() => {
    if (!socialSpaceOpen || !myUid) {
      return;
    }
    void refreshFriendships(false, requestsPanelOpen ? MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS : undefined);
  }, [socialSpaceOpen, myUid, requestsPanelOpen, refreshFriendships]);

  const refreshAfterFriendshipChange = useCallback(async () => {
    if (socialGistId) {
      await invalidateCachedSocialDirectory(socialGistId);
    }
    await refreshFriendships(true);
  }, [refreshFriendships, socialGistId]);

  // Fase 2: mirar las aristas pendientes al abrir el hub y al volver a la pestaña. Por ref, para que el listener de
  // visibilidad no se reinstale con cada lectura de amistades.
  const friendshipsRef = useRef(friendships);
  friendshipsRef.current = friendships;
  const checkPendingEdges = useCallback(async () => {
    if (!myUid) return;
    const now = Date.now();
    if (now - lastEdgeCheckAt < MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS) return;
    const watched = edgesAwaitingOtherSide(friendshipsRef.current, now);
    if (watched.length === 0) return;
    lastEdgeCheckAt = now;
    let changed = false;
    try {
      changed = await haveFriendshipEdgesChanged(myUid, watched);
    } catch {
      /* best-effort: sin red se queda como estaba, y la relectura normal de 15 min lo cubre igual. */
    }
    // Con la lista nueva cambia `friends`, y la huella del directorio (Fase 1) hace que se relea al momento.
    if (changed) await refreshFriendships(true);
  }, [myUid, refreshFriendships]);

  useEffect(() => {
    if (!socialSpaceOpen || !myUid || !friendshipsResolved) return;
    void checkPendingEdges();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkPendingEdges();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [socialSpaceOpen, myUid, friendshipsResolved, checkPendingEdges]);

  const relationshipWith = useCallback((otherUid: string): RelationshipState => {
    if (!otherUid) return 'none';
    return friendships.byOtherUid[otherUid]?.state ?? 'none';
  }, [friendships]);

  const friendUidSet = useMemo(
    () => new Set(friendships.friends.map((friend) => friend.otherUid)),
    [friendships.friends],
  );

  /**
   * "Añadir amigo" o "Aceptar", según el estado actual: sin relación envía petición; si el otro ya pidió, acepta.
   * La carrera de petición SIMULTÁNEA (los dos pulsan a la vez y el documento canónico ya existe) se resuelve
   * releyendo y decidiendo con lo que hay, en vez de fallar con un error que el usuario no puede interpretar.
   */
  const handleAddOrAcceptFriend = useCallback(async (otherUid: string) => {
    if (!myUid || !otherUid || myUid === otherUid) {
      return;
    }
    const relation = relationshipWith(otherUid);
    if (relation === 'friends' || relation === 'outgoing') {
      return; // ya gestionado desde otra acción específica.
    }
    try {
      setFriendshipBusyUid(otherUid);
      if (relation === 'incoming') {
        const docId = friendships.byOtherUid[otherUid]?.docId;
        if (docId) {
          await acceptFriendRequest({ myUid, docId, self: buildSelfInfo() });
          await refreshAfterFriendshipChange();
          setFeedback('ok', SOCIAL_UI.status.friendRequestAccepted);
        }
        return;
      }
      try {
        await sendFriendRequest({ myUid, otherUid, self: buildSelfInfo() });
        await refreshAfterFriendshipChange();
        setFeedback('ok', SOCIAL_UI.status.friendRequestSent);
      } catch (error) {
        const existing = await readFriendship(myUid, otherUid);
        if (existing?.state === 'incoming') {
          await acceptFriendRequest({ myUid, docId: existing.docId, self: buildSelfInfo() });
          await refreshAfterFriendshipChange();
          setFeedback('ok', SOCIAL_UI.status.friendRequestAccepted);
          return;
        }
        if (existing) {
          await refreshAfterFriendshipChange(); // ya outgoing/friends: reflejar el estado real sin error ruidoso.
          return;
        }
        throw error;
      }
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.friendActionFailed);
    } finally {
      setFriendshipBusyUid('');
    }
  }, [myUid, buildSelfInfo, friendships, refreshAfterFriendshipChange, relationshipWith, reportFailure, setFeedback]);

  /** Borra el documento de amistad (cancelar enviada / rechazar recibida / eliminar), con su propio mensaje. */
  const deleteRelationship = useCallback(async (otherUid: string, successMsg: string) => {
    const docId = friendships.byOtherUid[otherUid]?.docId;
    if (!myUid || !docId) {
      return;
    }
    try {
      setFriendshipBusyUid(otherUid);
      await deleteFriendship({ myUid, docId });
      await refreshAfterFriendshipChange();
      setFeedback('ok', successMsg);
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.friendActionFailed);
    } finally {
      setFriendshipBusyUid('');
    }
  }, [myUid, friendships, refreshAfterFriendshipChange, reportFailure, setFeedback]);

  /**
   * Rechazar, retirar y dejar de ser amigos NO borran de inmediato: piden confirmación, porque ninguna de las tres
   * se deshace. Rechazar y retirar antes iban directas, y con los botones ya dentro de la tarjeta —juntos y
   * pequeños— un toque de más costaba una petición que había que volver a mandar (y esperar a que la acepten).
   *
   * El nombre sale del nick denormalizado en el propio documento de amistad, que es de donde lo saca también la
   * tarjeta de la pantalla. Por eso este hook no necesita el directorio ni siquiera aquí: de él solo venía la
   * FOTO, y un diálogo de confirmación no la enseña.
   */
  const askFriendAction = useCallback((otherUid: string, action: FriendAction) => {
    const name = friendships.byOtherUid[otherUid]?.otherName || SOCIAL_UI.requests.unknownUser;
    setFriendActionTarget({ uid: otherUid, name, action });
  }, [friendships]);

  const handleCancelFriendRequest = useCallback(
    (otherUid: string) => askFriendAction(otherUid, 'cancel'),
    [askFriendAction],
  );
  const handleRejectFriendRequest = useCallback(
    (otherUid: string) => askFriendAction(otherUid, 'reject'),
    [askFriendAction],
  );
  const handleRemoveFriend = useCallback(
    (otherUid: string) => askFriendAction(otherUid, 'remove'),
    [askFriendAction],
  );

  const cancelFriendAction = useCallback(() => setFriendActionTarget(null), []);

  const confirmFriendAction = useCallback(async () => {
    const target = friendActionTarget;
    if (!target) {
      return;
    }
    setFriendActionTarget(null);
    const message = target.action === 'reject'
      ? SOCIAL_UI.status.friendRequestRejected
      : target.action === 'cancel'
        ? SOCIAL_UI.status.friendRequestCanceled
        : SOCIAL_UI.status.friendRemoved;
    await deleteRelationship(target.uid, message);
  }, [friendActionTarget, deleteRelationship]);

  return {
    friendships,
    loadingFriendships,
    friendshipsResolved,
    friendshipBusyUid,
    friendUidSet,
    pendingIncomingCount: friendships.incoming.length,
    relationshipWith,
    refreshFriendships,
    refreshAfterFriendshipChange,
    handleAddOrAcceptFriend,
    handleCancelFriendRequest,
    handleRejectFriendRequest,
    handleRemoveFriend,
    friendActionTarget,
    confirmFriendAction,
    cancelFriendAction,
  };
}
