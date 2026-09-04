import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { invalidateCachedSocialDirectory } from '../../model/repository/indexedDbRepository';
import {
  acceptFriendRequest,
  deleteFriendship,
  getMyFriendships,
  readFriendship,
  sendFriendRequest,
  type FriendshipSelfInfo,
} from '../../model/repository/firebaseRepository';
import type { MyFriendships, RelationshipState } from '../../model/types/social';

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
  refreshFriendships: (forceRefresh?: boolean) => Promise<void>;
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
  /** Identidad denormalizada que viaja al documento de amistad (nick, foto y gists). */
  buildSelfInfo: () => FriendshipSelfInfo;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
}

const EMPTY: MyFriendships = { friends: [], incoming: [], outgoing: [], byOtherUid: {} };

export function useSocialFriendships(options: SocialFriendshipsOptions): SocialFriendships {
  const { myUid, socialGistId, socialSpaceOpen, buildSelfInfo, setFeedback, reportFailure } = options;

  const [friendships, setFriendships] = useState<MyFriendships>(EMPTY);
  const [loadingFriendships, setLoadingFriendships] = useState(false);
  const [friendshipsResolved, setFriendshipsResolved] = useState(false);
  const [friendshipBusyUid, setFriendshipBusyUid] = useState<string>('');
  const [friendActionTarget, setFriendActionTarget] = useState<FriendActionTarget | null>(null);

  const refreshFriendships = useCallback(async (forceRefresh = false) => {
    if (!myUid) {
      setFriendships(EMPTY);
      setFriendshipsResolved(true);
      return;
    }
    try {
      setLoadingFriendships(true);
      setFriendships(await getMyFriendships(myUid, { forceRefresh }));
    } catch {
      /* best-effort: sin amistad el resto del social sigue usable. */
    } finally {
      setLoadingFriendships(false);
      // Resuelto SIEMPRE, incluso si Firestore falló: degrada a feed sin amigos en vez de bloquearlo para siempre.
      setFriendshipsResolved(true);
    }
  }, [myUid]);

  useEffect(() => {
    if (!socialSpaceOpen || !myUid) {
      return;
    }
    void refreshFriendships();
  }, [socialSpaceOpen, myUid, refreshFriendships]);

  const refreshAfterFriendshipChange = useCallback(async () => {
    if (socialGistId) {
      await invalidateCachedSocialDirectory(socialGistId);
    }
    await refreshFriendships(true);
  }, [refreshFriendships, socialGistId]);

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
