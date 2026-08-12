// RECIPROCIDAD DE LA FOTO: quién puede ver la cara de quién.
//
// Dos reglas, las dos sobre QUIEN MIRA (la del dueño —`visibility.showPhoto`, que decide si publica su foto— ya se
// aplica al hidratar y es independiente de esto):
//
//   1. Quien esconde su foto no ve la de nadie. Es la parte recíproca: mirar sin dejarse ver es el trato que la
//      regla deshace. No hace falta que el otro haya hecho nada.
//   2. Solo se ve la foto de tus AMISTADES. Un perfil del directorio de descubrimiento con el que no tienes
//      amistad se pinta con su inicial, igual que ya pasa con su actividad (el feed es solo-amigos) y con sus
//      listas compartidas (un no-amigo se queda sin ellas).
//
// EXENCIÓN: el rango `mithril` está fuera de las dos. Es el rango reservado a la cuenta de administración
// (`ADMIN_ONLY_TIER`), y quien moderá necesita poder identificar a la gente.
//
// ALCANCE, dicho sin adornos: esto es PRESENTACIÓN, no confidencialidad. `profiles` es legible por cualquier
// usuario autenticado (`firestore.rules`), y la foto de un amigo va además denormalizada en el doc de amistad, así
// que quien mire la red la encuentra. Lo que la regla garantiza es que la app no la PINTE; convertirla en un
// permiso de verdad exigiría que las reglas supieran quién es amigo de quién, y eso es otra migración.
import { ADMIN_ONLY_TIER, type ProfileTier } from '../constants/tiers';

/** Quién mira: su rango y si los demás le ven la cara. */
export interface PhotoViewer {
  /** ¿Los demás le ven la cara? Lo resuelve `resolveViewer`: querer mostrarla NO basta, hay que tenerla. */
  showsOwnPhoto: boolean;
  tier: ProfileTier;
}

/**
 * Traduce los ajustes de alguien a lo que de verdad aporta al canal.
 *
 * EL INTERRUPTOR NO BASTA. `showPhoto` dice qué quiere el usuario; `ownPhotoURL` dice qué tiene. Quien lo lleva
 * activado pero no tiene foto en su cuenta de Google no publica ninguna: sus amigos le ven la silueta genérica igual
 * que a quien la esconde a propósito. Tratar ese caso como "sí muestra" le daría las caras de los demás sin poner la
 * suya, que es exactamente el trato que la reciprocidad deshace. Da igual el motivo —cuenta sin foto, foto retirada
 * en Google—: lo que cuenta es lo que los demás ven.
 *
 * Lo que esta función NO puede saber: si la URL existe pero está caducada o rota. Eso solo se descubre al intentar
 * cargarla, y lo resuelve `HubAvatar` cayendo a la silueta.
 */
export function resolveViewer(input: {
  /** El interruptor "Mostrar mi foto de perfil". */
  showPhoto: boolean;
  /** La foto que de verdad tiene para publicar (la de su sesión de Google). */
  ownPhotoURL: string | null | undefined;
  tier: ProfileTier;
}): PhotoViewer {
  return {
    showsOwnPhoto: input.showPhoto && Boolean(String(input.ownPhotoURL || '').trim()),
    tier: input.tier,
  };
}

/**
 * ¿Este espectador ve fotos ajenas EN GENERAL? (regla 1, sin mirar la relación).
 *
 * Sirve para no recorrer el directorio entero cuando la respuesta es no: en ese caso ninguna foto se pinta.
 */
export function canSeeOtherPhotos(viewer: PhotoViewer): boolean {
  return viewer.tier === ADMIN_ONLY_TIER || viewer.showsOwnPhoto;
}

/** ¿El espectador está exento de las dos reglas? */
export function isPhotoRuleExempt(viewer: PhotoViewer): boolean {
  return viewer.tier === ADMIN_ONLY_TIER;
}

/**
 * Foto que se debe PINTAR de alguien, según quién mira y qué relación tienen.
 *
 * `''` significa "sin foto": el avatar cae a la inicial con color determinista, que es lo mismo que ya se pinta de
 * quien no tiene foto. No hay ningún estado nuevo en la interfaz.
 */
export function photoForViewer(input: {
  /** Foto publicada por su dueño (ya filtrada por SU propio `showPhoto`). */
  photoURL: string;
  /** ¿Es la ficha del propio espectador? La foto de uno es siempre suya. */
  isOwn: boolean;
  /** ¿Hay amistad ACEPTADA entre los dos? Una solicitud pendiente no es amistad. */
  isFriend: boolean;
  viewer: PhotoViewer;
}): string {
  const photo = input.photoURL || '';
  if (!photo || input.isOwn || isPhotoRuleExempt(input.viewer)) {
    return photo;
  }
  if (!input.viewer.showsOwnPhoto || !input.isFriend) {
    return '';
  }
  return photo;
}

/** Lo mínimo que necesita una entrada del directorio para aplicarle la política. */
interface PhotoBearing {
  photoURL: string;
}

interface DirectoryLike extends PhotoBearing {
  /** uid con el que se comprueba la amistad. */
  uid: string;
  activity?: PhotoBearing[];
  posts?: PhotoBearing[];
}

/**
 * Aplica la política a un directorio social entero, incluidas las fotos de autor que van pegadas a cada entrada de
 * actividad y a cada publicación (el feed las lee de ahí, no de la entrada).
 *
 * Devuelve el MISMO array cuando no hay nada que ocultar —el caso normal de un espectador con foto y solo amigos
 * en el directorio— para no invalidar los `useMemo` que cuelgan de él en cada render.
 */
export function withVisiblePhotos<T extends DirectoryLike>(
  entries: readonly T[],
  context: {
    viewer: PhotoViewer;
    /** uids con amistad aceptada. */
    friendUids: ReadonlySet<string>;
    /** Cómo se reconoce la entrada propia (identidad, no gist: el id del canal ya no se publica). */
    isOwnEntry: (entry: T) => boolean;
  },
): readonly T[] {
  if (isPhotoRuleExempt(context.viewer)) {
    return entries;
  }

  let changed = false;
  const next = entries.map((entry) => {
    const visible = photoForViewer({
      photoURL: entry.photoURL,
      isOwn: context.isOwnEntry(entry),
      isFriend: context.friendUids.has(entry.uid),
      viewer: context.viewer,
    });
    if (visible === entry.photoURL) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      photoURL: visible,
      // La foto del autor viaja duplicada en cada evento y publicación: si solo se limpiara la de la entrada, el
      // feed seguiría pintando la cara de la persona en cada una de sus tarjetas.
      ...(entry.activity ? { activity: entry.activity.map((item) => ({ ...item, photoURL: visible })) } : {}),
      ...(entry.posts ? { posts: entry.posts.map((item) => ({ ...item, photoURL: visible })) } : {}),
    };
  });

  return changed ? next : entries;
}
