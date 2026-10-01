import { memo } from 'react';
import { STAR_PICKER_UI } from '../../core/constants/formLabels';
import { clampRating } from '../../core/utils/normalize';

/** Selector visual de puntuación (0-5 estrellas) para formularios, con navegación por teclado. */
export const StarPicker = memo(function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }): React.JSX.Element {
  const current = clampRating(value);

  const handleKeyDown = (star: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(star);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = Math.min(5, star + 1);
      onChange(next);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = Math.max(1, star - 1);
      onChange(prev);
    }
  };

  return (
    <div className="star-inp star-inp-field" role="radiogroup" aria-label={STAR_PICKER_UI.groupAria}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onKeyDown={(event) => handleKeyDown(star, event)}
          className={star <= current ? 'f' : ''}
          role="radio"
          aria-checked={star === current}
          aria-label={STAR_PICKER_UI.starAria(star)}
          tabIndex={star === 1 ? 0 : -1}
        >
          ★
        </button>
      ))}
    </div>
  );
});
