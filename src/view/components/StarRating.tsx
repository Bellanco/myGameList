import { memo } from 'react';
import { clampRating } from '../../core/utils/normalize';

/**
 * Muestra una puntuación (0-5) como estrellas llenas (★) y vacías (☆).
 *
 * A11y-4: `role="img"` + `aria-label`. Sin ellos, un lector de pantalla leía los caracteres uno por uno
 * ("estrella negra, estrella negra, estrella blanca…"), que no dice la puntuación. El `role` no es opcional: un
 * `aria-label` sobre un `<span>` sin rol puede ignorarse, así que es lo que hace fiable la etiqueta.
 */
export const StarRating = memo(function StarRating({ value }: { value: number }): React.JSX.Element {
  const n = clampRating(value);
  const fullStars = n;
  const emptyStars = 5 - n;

  return (
    <span className="stars" role="img" aria-label={n > 0 ? `${n} de 5 estrellas` : 'Sin puntuar'}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={`full-${i}`} className="f">
          ★
        </span>
      ))}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <span key={`empty-${i}`}>☆</span>
      ))}
    </span>
  );
});
