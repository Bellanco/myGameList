/**
 * Selector visual de puntuación (1-5 estrellas) para formularios.
 * Permite hacer click en cada estrella para seleccionar una puntuación.
 *
 * @param value - Valor actual (0-5)
 * @param onChange - Callback cuando cambia el valor
 */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }): JSX.Element {
  const current = Math.max(0, Math.min(5, Number(value || 0)));

  return (
    <div className="star-inp star-inp-field" role="radiogroup" aria-label="Seleccionar puntuación">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => onChange(star)}
          className={star <= current ? 'f' : ''}
          role="radio"
          aria-checked={star === current}
        >
          ★
        </span>
      ))}
    </div>
  );
}
