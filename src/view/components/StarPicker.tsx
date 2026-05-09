import { memo } from 'react';

/**
 * Selector visual de puntuación (1-5 estrellas) para formularios.
 * Permite hacer click en cada estrella para seleccionar una puntuación.
 * Soporta navegación con teclado (Arrow keys, Enter).
 *
 * @param value - Valor actual (0-5)
 * @param onChange - Callback cuando cambia el valor
 */
export const StarPicker = memo(function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }): JSX.Element {
  const current = Math.max(0, Math.min(5, Number(value || 0)));

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
    <div className="star-inp star-inp-field" role="radiogroup" aria-label="Seleccionar puntuación">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onKeyDown={(event) => handleKeyDown(star, event)}
          className={star <= current ? 'f' : ''}
          role="radio"
          aria-checked={star === current}
          aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
          tabIndex={star === 1 ? 0 : -1}
        >
          ★
        </button>
      ))}
    </div>
  );
});
