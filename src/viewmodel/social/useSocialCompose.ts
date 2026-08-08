// F3 — compositor de publicaciones del hub: el texto en curso, el estado de envío y los límites que impone el
// rango del perfil.
//
// Tercera pieza que sale de `useSocialViewModel`, y otro dominio cerrado: su única atadura con el resto del hub
// es que, al publicar, hay que refrescar el feed — de ahí `onPublished`, en vez de que el hook conozca la
// hidratación del directorio.
import { useCallback, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/labels';
import { PROFILE_TIER_POST_MAX_LENGTH, canPublishPosts, hasPostLengthLimit, type ProfileTier } from '../../core/constants/tiers';
import { publishPost } from '../../model/repository/socialPublishRepository';

type Feedback = (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;

export interface SocialCompose {
  composePostText: string;
  setComposePostText: (text: string) => void;
  publishingPost: boolean;
  handlePublishPost: () => Promise<void>;
  /** ¿El rango permite publicar? Bronce no: la pantalla ni siquiera muestra el compositor. */
  canPublishPosts: boolean;
  postMaxLength: number;
  /** ¿Mostrar el contador de caracteres? Solo si el rango tiene un límite por debajo del tope duro. */
  showPostCounter: boolean;
}

export function useSocialCompose(options: {
  ownTier: ProfileTier;
  /** Refresco del feed tras publicar (el post nuevo tiene que aparecer). */
  onPublished: () => Promise<void>;
  setFeedback: Feedback;
}): SocialCompose {
  const { ownTier, onPublished, setFeedback } = options;
  const [composePostText, setComposePostText] = useState('');
  const [publishingPost, setPublishingPost] = useState(false);

  const handlePublishPost = useCallback(async () => {
    const text = composePostText.trim();
    if (!text || publishingPost) {
      return;
    }

    // Bronce no publica. La pantalla ni siquiera muestra el compositor; esta comprobación es la red por si se
    // llega aquí de otra forma (estado a medio actualizar, atajo de teclado). En SILENCIO y a propósito: quien no
    // tiene el rango no ve nada al respecto, tampoco un aviso que le recuerde lo que no puede hacer.
    if (!canPublishPosts(ownTier)) {
      return;
    }

    try {
      setPublishingPost(true);
      await publishPost({ text, maxLength: PROFILE_TIER_POST_MAX_LENGTH[ownTier] });
      setComposePostText('');
      await onPublished();
      setFeedback('ok', SOCIAL_UI.status.postPublished);
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.postPublishFailed);
    } finally {
      setPublishingPost(false);
    }
  }, [composePostText, ownTier, publishingPost, onPublished, setFeedback]);

  return {
    composePostText,
    setComposePostText,
    publishingPost,
    handlePublishPost,
    canPublishPosts: canPublishPosts(ownTier),
    postMaxLength: PROFILE_TIER_POST_MAX_LENGTH[ownTier],
    showPostCounter: hasPostLengthLimit(ownTier),
  };
}
