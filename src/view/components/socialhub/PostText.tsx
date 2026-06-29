import { Fragment, useState } from 'react';
import { isValidHttpUrl } from '../../../core/security/sanitize';
import { resolvePostMedia, isSteamSharedFilePage, type PostMedia as PostMediaType } from '../../../core/social/postMedia';

// Puntuación de cierre que suele pegarse a una URL al final de una frase; se saca del enlace y se muestra como texto.
const TRAILING_PUNCT = /[.,;:!?)\]}>"']+$/;

/**
 * Incrusta una imagen/vídeo de un origen de confianza (resolvePostMedia). Si el recurso no carga (host caído, imagen
 * borrada, token de Xbox/PSN caducado…), degrada al enlace clicable. La imagen va envuelta en el enlace original.
 */
function PostMedia({ media, href }: { media: PostMediaType; href: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>;
  }

  if (media.kind === 'video') {
    return (
      <video
        className="hub-post-media"
        src={media.src}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <a className="hub-post-media-link" href={href} target="_blank" rel="noopener noreferrer">
      <img
        className="hub-post-media"
        src={media.src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

/**
 * Renderiza el texto de una publicación con los hipervínculos clicables, de forma SEGURA:
 * - NUNCA interpreta HTML (React escapa el texto). El único elemento que generamos es <a> para URLs validadas.
 * - Solo URLs http(s) absolutas (isValidHttpUrl) → descarta javascript:, data:, etc. (frontera anti-XSS).
 * - rel="noopener noreferrer" + target="_blank" en cada enlace.
 */
export function PostText({ text, sharedFilePageHint }: { text: string; sharedFilePageHint?: string }) {
  const tokens = String(text ?? '').split(/(\s+)/);

  return (
    <>
      {tokens.map((token, index) => {
        if (!token) {
          return null;
        }

        const trailing = token.match(TRAILING_PUNCT)?.[0] ?? '';
        const candidate = trailing ? token.slice(0, -trailing.length) : token;

        if (isValidHttpUrl(candidate)) {
          const media = resolvePostMedia(candidate);
          if (media) {
            return (
              <Fragment key={index}>
                <PostMedia media={media} href={candidate} />
                {trailing}
              </Fragment>
            );
          }
          // Enlace normal. Si es la PÁGINA de una captura de Steam, añade el aviso para pegar la URL directa.
          const showHint = sharedFilePageHint && isSteamSharedFilePage(candidate);
          return (
            <Fragment key={index}>
              <a href={candidate} target="_blank" rel="noopener noreferrer">{candidate}</a>
              {trailing}
              {showHint ? <span className="hub-post-hint"> {sharedFilePageHint}</span> : null}
            </Fragment>
          );
        }

        return <Fragment key={index}>{token}</Fragment>;
      })}
    </>
  );
}
