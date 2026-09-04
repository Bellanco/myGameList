import { photoForViewer, type PhotoViewer } from '../../core/social/photoVisibility';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import type { ProfileTier } from '../../core/constants/tiers';
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
  /**
   * Rango del perfil, si esa persona está en el directorio. OPCIONAL a propósito: los amigos salen de los
   * DOCUMENTOS de amistad, así que se ve y se gestiona a quien haya caído fuera del tope del directorio o haya
   * cerrado su espacio social. De esa gente no se sabe el rango, y la tarjeta se pinta sin punto en vez de
   * inventarle un bronce que no le corresponde.
   */
  tier?: ProfileTier;
  /**
   * Id de su ficha en el directorio, para abrir su perfil desde la bandeja. Mismo motivo para que sea opcional:
   * sin ficha no hay perfil que abrir, y la tarjeta se queda como está, de solo lectura.
   */
  profileId?: string;
  /**
   * Último uso de la aplicación (`profiles.updatedAt`), 0 si no se sabe. No se pinta: ORDENA la lista de amigos
   * (ver `buildFriendshipViews`).
   */
  lastActiveAt: number;
}

/** Lo que hace falta saber del resto del hub para pintar una fila. */
export interface FriendshipViewDeps {
  /** Directorio ya hidratado; de aquí sale la foto cuando el documento de amistad todavía no la trae. */
  directory: ReadonlyArray<{ id?: string; uid: string; photoURL?: string; tier?: ProfileTier; lastActiveAt?: number }>;
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
    tier: fromDirectory?.tier,
    profileId: fromDirectory?.id,
    lastActiveAt: Number(fromDirectory?.lastActiveAt || 0),
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
    // Las peticiones se quedan como vienen: ordenadas por la fecha de la PETICIÓN (`getMyFriendships`). Ahí lo que
    // importa es cuál llegó antes, no quién ha entrado hoy en la aplicación.
    incoming: friendships.incoming.map(enrich),
    outgoing: friendships.outgoing.map(enrich),
    /**
     * Los AMIGOS, en cambio, se ordenan por su último uso de la aplicación: primero quien más recientemente ha
     * estado. Venían ordenados por el `updatedAt` del DOCUMENTO de amistad —cuándo se aceptó—, que es un orden
     * congelado el día que os hicisteis amigos y no dice nada de quién está activo. Es además el mismo criterio
     * con el que el directorio los lista en Perfiles, así que las dos pantallas coinciden.
     *
     * Quien no está en el directorio no tiene marca de recencia (0) y cae al final, conservando entre sí el orden
     * de origen: sin dato no se adelanta a nadie, pero tampoco desaparece.
     */
    friends: friendships.friends.map(enrich).sort((a, b) => b.lastActiveAt - a.lastActiveAt),
  };
}
