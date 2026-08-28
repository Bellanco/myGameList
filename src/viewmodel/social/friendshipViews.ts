import { photoForViewer, type PhotoViewer } from '../../core/social/photoVisibility';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import type { FriendshipView, MyFriendships } from '../../model/types/social';

/**
 * Cómo se pinta una solicitud o un amigo en la bandeja y en la gestión.
 *
 * Vive aparte del hook de amistades a propósito. Enriquecer una fila necesita el DIRECTORIO ya hidratado, y el
 * directorio necesita saber quiénes son tus amigos: meter esto dentro del hook cerraría un círculo entre los dos.
 * Como función pura no hay tal círculo —el compositor le pasa las dos cosas ya resueltas— y además se puede probar
 * sin montar nada.
 */
export interface FriendshipRequestView {
  docId: string;
  otherUid: string;
  name: string;
  photo: string;
}

/** Lo que hace falta saber del resto del hub para pintar una fila. */
export interface FriendshipViewDeps {
  /** Directorio ya hidratado; de aquí sale la foto cuando el documento de amistad todavía no la trae. */
  directory: ReadonlyArray<{ uid: string; photoURL?: string }>;
  /** uids con amistad ACEPTADA. Decide si la cara se ve (ver `core/social/photoVisibility`). */
  friendUids: ReadonlySet<string>;
  viewer: PhotoViewer;
}

/**
 * Una fila. El nombre sale SOLO del nick denormalizado en el documento de amistad (`otherName`); NO se cae al
 * `displayName` del directorio, que puede ser el nombre real de la cuenta de Google.
 *
 * La foto pasa por la misma política que el directorio, con una consecuencia buscada: en la BANDEJA, la cara de
 * quien te manda una solicitud no se ve —todavía no hay amistad—, igual que no se veía en el directorio de
 * descubrimiento del que salió. El nick sigue ahí, que es lo que identifica la petición.
 */
export function toFriendshipRequestView(view: FriendshipView, deps: FriendshipViewDeps): FriendshipRequestView {
  const fromDirectory = deps.directory.find((entry) => entry.uid === view.otherUid);
  return {
    docId: view.docId,
    otherUid: view.otherUid,
    name: view.otherName || SOCIAL_UI.requests.unknownUser,
    photo: photoForViewer({
      photoURL: view.otherPhoto || fromDirectory?.photoURL || '',
      isOwn: false,
      isFriend: deps.friendUids.has(view.otherUid),
      viewer: deps.viewer,
    }),
  };
}

export interface FriendshipViews {
  incoming: FriendshipRequestView[];
  outgoing: FriendshipRequestView[];
  /**
   * Amigos aceptados, para la pantalla de gestión. Se derivan de los DOCUMENTOS de amistad y no del directorio,
   * así que siempre se puede ver y eliminar a un amigo aunque haya caído fuera del tope del directorio o haya
   * desactivado su espacio social.
   */
  friends: FriendshipRequestView[];
}

export function buildFriendshipViews(friendships: MyFriendships, deps: FriendshipViewDeps): FriendshipViews {
  const enrich = (view: FriendshipView) => toFriendshipRequestView(view, deps);
  return {
    incoming: friendships.incoming.map(enrich),
    outgoing: friendships.outgoing.map(enrich),
    friends: friendships.friends.map(enrich),
  };
}
