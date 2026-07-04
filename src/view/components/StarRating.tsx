import { memo } from 'react';
import { clampRating } from '../../core/utils/normalize';

/** Muestra una puntuación (0-5) como estrellas llenas (★) y vacías (☆). */
export const StarRating = memo(function StarRating({ value }: { value: number }): React.JSX.Element {
  const n = clampRating(value);
  const fullStars = n;
  const emptyStars = 5 - n;

  return (
    <span className="stars">
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
