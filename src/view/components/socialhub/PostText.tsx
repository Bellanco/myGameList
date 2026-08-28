import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isValidHttpUrl } from '../../../core/security/sanitize';
import { resolvePostMedia, isSteamSharedFilePage, type PostMedia as PostMediaType } from '../../../core/social/postMedia';

// Puntuación de cierre que suele pegarse a una URL al final de una frase; se saca del enlace y se muestra como texto.
const TRAILING_PUNCT = /[.,;:!?)\]}>"']+$/;

/**
 * Criba BARATA previa a `isValidHttpUrl`, que es la frontera de seguridad y no se toca.
 *
 * `isValidHttpUrl` construye un `URL` y se apoya en que lance para descartar: con texto normal eso es una excepción
 * por palabra, y la longitud del texto la decide el RANGO de quien publica (plata 1.000, oro 10.000, mithril
 * 100.000 caracteres). Medido en Node, un post de mithril son ~25.000 palabras y ~58 ms solo en trocear y validar,
 * por render — y el feed repinta a menudo. Esta comprobación no cambia NINGÚN veredicto: sin base, `new URL` solo
 * devuelve protocolo http(s) si la cadena empieza por ese esquema, y los tokens salen de `split(/(\s+)/)`, así que
 * nunca traen los espacios iniciales que el parseador toleraría.
 */
const LIKELY_HTTP_URL = /^https?:/i;

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
        // Sin `referrerPolicy`: el atributo no existe para `<video>` (solo para img/iframe/script/link/a), así
        // que aquí manda la política del documento — `strict-origin-when-cross-origin` (ver `public/_headers`),
        // que ya manda el origen y no la URL completa.
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
function PostTextBase({ text, sharedFilePageHint }: { text: string; sharedFilePageHint?: string }) {
  const tokens = String(text ?? '').split(/(\s+)/);

  return (
    <>
      {tokens.map((token, index) => {
        if (!token) {
          return null;
        }

        // Sin enlace posible no hay nada que trocear ni que envolver: se devuelve el token tal cual y nos ahorramos
        // el `match` de puntuación y la construcción de `URL`. Es el 99 % de las palabras de un post.
        if (!LIKELY_HTTP_URL.test(token)) {
          return <Fragment key={index}>{token}</Fragment>;
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

/**
 * Memoizada: el texto de una publicación no cambia, pero el feed que la contiene se repinta con cualquier cambio de
 * estado del hub. Sin esto, cada repintado volvía a trocear y revalidar el post entero — y ese coste crece con el
 * cupo del rango del autor, así que lo pagaba justo quien más escribe.
 */
export const PostText = memo(PostTextBase);

/**
 * Cuerpo de una publicación en el feed: el texto RECORTADO a unas pocas líneas, con "Ver más" cuando de verdad
 * sobra contenido.
 *
 * El cupo de caracteres lo decide el rango del autor (plata 1.000, oro 10.000, mithril 100.000), así que sin
 * recorte una sola publicación de rango alto ocupaba el feed entero y empujaba fuera de la pantalla todo lo demás
 * —mientras que las reseñas sí se recortaban (`.hub-feed-review-text`, 4 líneas)—. Aquí no se pierde nada: el
 * texto completo se despliega en la propia tarjeta.
 *
 * POR QUÉ SE MIDE Y NO SE CUENTAN CARACTERES: el texto va con `white-space: pre-wrap`, así que un texto corto con
 * muchos saltos de línea ocupa más líneas que uno largo de un solo párrafo. Contar caracteres escondería el botón
 * justo en los casos recortados. Se mide el desbordamiento real del elemento ya recortado.
 */
function PostBodyBase({
  text,
  sharedFilePageHint,
  expandLabel,
  collapseLabel,
}: {
  text: string;
  sharedFilePageHint?: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Se mide SOLO estando recortado: desplegado, `scrollHeight` y `clientHeight` coinciden por definición y la
  // medida diría "ya no sobra nada", haciendo desaparecer el botón de plegar.
  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, []);

  useLayoutEffect(() => {
    if (expanded) return;
    measure();
  }, [text, expanded, measure]);

  // Al estrechar la ventana caben menos líneas: un texto que antes entraba pasa a estar recortado y necesita su
  // botón. Sin esto, esas líneas quedarían cortadas y sin forma de verlas.
  useEffect(() => {
    if (expanded) return;
    let frame: number | null = null;
    const onResize = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [expanded, measure]);

  return (
    <>
      <p ref={textRef} className={`hub-post-text ${expanded ? '' : 'is-clamped'}`.trim()}>
        <PostText text={text} sharedFilePageHint={sharedFilePageHint} />
      </p>
      {overflows ? (
        <button
          className="hub-post-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      ) : null}
    </>
  );
}

export const PostBody = memo(PostBodyBase);
