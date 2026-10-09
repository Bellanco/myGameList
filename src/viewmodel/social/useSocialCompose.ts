// F3 — compositor de publicaciones del hub: el estado de envío y los límites que impone el rango del perfil.
//
// EL TEXTO EN CURSO YA NO VIVE AQUÍ. Vivía, y cada pulsación en el cuadro atravesaba el hook, el ViewModel y el
// hub hasta repintar la pantalla del feed completa —lista, tarjetas y un avatar por fila—. Ahora el borrador es
// estado local de `FeedComposer` y llega como argumento al publicar, que es el único momento en que hace falta.
//
// Tercera pieza que sale de `useSocialViewModel`, y otro dominio cerrado: su única atadura con el resto del hub
// es que, al publicar, hay que refrescar el feed — de ahí `onPublished`, en vez de que el hook conozca la
// hidratación del directorio.
import { useCallback, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { PROFILE_TIER_POST_MAX_LENGTH, canPublishPosts, hasPostLengthLimit, type ProfileTier } from '../../core/constants/tiers';
import { deleteOwnPost, editOwnPost, publishPost } from '../../model/repository/socialPublishRepository';
import { isNetworkFailure, isOffline, isServiceUnavailable } from '../../core/utils/network';
import { isPostGoneError } from '../../core/social/postErrors';

type Feedback = (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;

export interface SocialCompose {
  publishingPost: boolean;
  /**
   * Publica el texto y dice SI SALIÓ. El booleano existe porque quien vacía el cuadro es el compositor
   * (`FeedComposer`, que se queda el borrador para que escribir no repinte el feed), y hay un caso en el que NO
   * debe vaciarlo: sin red la publicación no sale y el texto tiene que seguir ahí, que es lo que promete el
   * aviso. `false` = no se publicó (sin red, veto de rango, error o cuadro vacío).
   */
  handlePublishPost: (text: string) => Promise<boolean>;
  /** ¿El rango permite publicar? Bronce no: la pantalla ni siquiera muestra el compositor. */
  canPublishPosts: boolean;
  postMaxLength: number;
  /** ¿Mostrar el contador de caracteres? Solo si el rango tiene un límite por debajo del tope duro. */
  showPostCounter: boolean;
  /** Id de la publicación propia que se está guardando o borrando ahora mismo; vacío si ninguna. */
  changingPostId: string;
  /**
   * Cambia el texto de una publicación propia y dice si salió, por lo mismo que `handlePublishPost`: `false`
   * deja el editor abierto con lo escrito. Exige un rango que publique —editar es publicar— y aplica el cupo del
   * rango ACTUAL, no el que se tenía al escribirla.
   */
  handleEditPost: (id: string, text: string) => Promise<boolean>;
  /** Retira una publicación propia. Cualquier rango, también bronce: lo que publicaste lo puedes quitar. */
  handleDeletePost: (id: string) => Promise<boolean>;
}

/**
 * Lo que ha cambiado en una publicación propia, para ponerlo en pantalla SIN rehidratar el directorio: un
 * refresco forzado relee hasta ~50 gists y tiene un anti-spam de 12 s, así que borrar dos mensajes seguidos
 * dejaba el segundo a la vista con un «espera unos segundos».
 */
export type OwnPostChange =
  | { kind: 'edit'; id: string; text: string; editedAt: number }
  | { kind: 'delete'; id: string };

export function useSocialCompose(options: {
  ownTier: ProfileTier;
  /** Refresco del feed tras publicar (el post nuevo tiene que aparecer). */
  onPublished: () => Promise<void>;
  /** Editar o borrar ya está escrito en el gist: toca reflejarlo en el directorio que pinta perfil y feed. */
  onPostChanged: (change: OwnPostChange) => void;
  setFeedback: Feedback;
}): SocialCompose {
  const { ownTier, onPublished, onPostChanged, setFeedback } = options;
  const [publishingPost, setPublishingPost] = useState(false);
  const [changingPostId, setChangingPostId] = useState('');

  const handlePublishPost = useCallback(async (raw: string): Promise<boolean> => {
    const text = raw.trim();
    if (!text || publishingPost) {
      return false;
    }

    // Bronce no publica. La pantalla ni siquiera muestra el compositor; esta comprobación es la red por si se
    // llega aquí de otra forma (estado a medio actualizar, atajo de teclado). En SILENCIO y a propósito: quien no
    // tiene el rango no ve nada al respecto, tampoco un aviso que le recuerde lo que no puede hacer.
    if (!canPublishPosts(ownTier)) {
      return false;
    }

    // Sin red no se intenta: publicar es una escritura en el gist social, así que lo único que se conseguiría es
    // esperar al timeout para acabar en el mismo aviso. El texto se queda intacto en el compositor.
    if (isOffline()) {
      setFeedback('warn', SOCIAL_UI.status.postPublishOffline, 'long');
      return false;
    }

    try {
      setPublishingPost(true);
      await publishPost({ text, maxLength: PROFILE_TIER_POST_MAX_LENGTH[ownTier] });
      await onPublished();
      setFeedback('ok', SOCIAL_UI.status.postPublished);
      return true;
    } catch (error) {
      if (isNetworkFailure(error)) {
        setFeedback('warn', SOCIAL_UI.status.postPublishOffline, 'long');
      } else if (isServiceUnavailable(error)) {
        // GitHub limitando o el servicio caído: no es un fallo del texto, y en `err` bloquearía el espacio social.
        setFeedback('warn', SOCIAL_UI.status.postPublishLimited, 'long');
      } else {
        setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.postPublishFailed);
      }
      return false;
    } finally {
      setPublishingPost(false);
    }
  }, [ownTier, publishingPost, onPublished, setFeedback]);

  /**
   * Editar y borrar comparten todo menos la escritura y los avisos: la red, el servicio caído y la puesta al día
   * de la pantalla (`write` devuelve el cambio que reflejar, o `null` si no había ninguno).
   */
  const changePost = useCallback(async (
    id: string,
    write: () => Promise<OwnPostChange | null>,
    labels: { done: string; failed: string; offline: string },
  ): Promise<boolean> => {
    if (!id || changingPostId) return false;
    if (isOffline()) {
      setFeedback('warn', labels.offline, 'long');
      return false;
    }
    try {
      setChangingPostId(id);
      const change = await write();
      if (change) onPostChanged(change);
      setFeedback('ok', labels.done);
      return true;
    } catch (error) {
      if (isPostGoneError(error)) {
        // Se borró desde otro dispositivo: se retira también de aquí, en vez de dejar a la vista lo que ya no está.
        onPostChanged({ kind: 'delete', id });
        setFeedback('warn', SOCIAL_UI.status.postEditGone, 'long');
      } else if (isNetworkFailure(error)) {
        setFeedback('warn', labels.offline, 'long');
      } else if (isServiceUnavailable(error)) {
        setFeedback('warn', SOCIAL_UI.status.postChangeLimited, 'long');
      } else {
        setFeedback('err', error instanceof Error ? error.message : labels.failed);
      }
      return false;
    } finally {
      setChangingPostId('');
    }
  }, [changingPostId, onPostChanged, setFeedback]);

  const handleEditPost = useCallback(async (id: string, raw: string): Promise<boolean> => {
    const text = raw.trim();
    // Mismo veto silencioso que al publicar: sin rango, la pantalla ni ofrece el botón.
    if (!text || !canPublishPosts(ownTier)) return false;
    return changePost(
      id,
      async () => {
        const saved = await editOwnPost({ id, text, maxLength: PROFILE_TIER_POST_MAX_LENGTH[ownTier] });
        return saved ? { kind: 'edit', id, text: saved.text, editedAt: saved.editedAt || Date.now() } : null;
      },
      { done: SOCIAL_UI.status.postEditDone, failed: SOCIAL_UI.status.postEditFailed, offline: SOCIAL_UI.status.postEditOffline },
    );
  }, [changePost, ownTier]);

  const handleDeletePost = useCallback(
    (id: string) => changePost(
      id,
      async () => {
        await deleteOwnPost({ id });
        return { kind: 'delete', id };
      },
      { done: SOCIAL_UI.status.postDeleteDone, failed: SOCIAL_UI.status.postDeleteFailed, offline: SOCIAL_UI.status.postDeleteOffline },
    ),
    [changePost],
  );

  return {
    publishingPost,
    handlePublishPost,
    changingPostId,
    handleEditPost,
    handleDeletePost,
    canPublishPosts: canPublishPosts(ownTier),
    postMaxLength: PROFILE_TIER_POST_MAX_LENGTH[ownTier],
    showPostCounter: hasPostLengthLimit(ownTier),
  };
}
