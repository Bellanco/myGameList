import { Fragment } from 'react';
import { isValidHttpUrl } from '../../../core/security/sanitize';

// Puntuación de cierre que suele pegarse a una URL al final de una frase; se saca del enlace y se muestra como texto.
const TRAILING_PUNCT = /[.,;:!?)\]}>"']+$/;

/**
 * Renderiza el texto de una publicación con los hipervínculos clicables, de forma SEGURA:
 * - NUNCA interpreta HTML (React escapa el texto). El único elemento que generamos es <a> para URLs validadas.
 * - Solo URLs http(s) absolutas (isValidHttpUrl) → descarta javascript:, data:, etc. (frontera anti-XSS).
 * - rel="noopener noreferrer" + target="_blank" en cada enlace.
 */
export function PostText({ text }: { text: string }) {
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
          return (
            <Fragment key={index}>
              <a href={candidate} target="_blank" rel="noopener noreferrer">{candidate}</a>
              {trailing}
            </Fragment>
          );
        }

        return <Fragment key={index}>{token}</Fragment>;
      })}
    </>
  );
}
