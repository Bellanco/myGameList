import { memo, type CSSProperties, type KeyboardEvent } from 'react';
import { GRADE_MAX, clampGrade, hueFromGrade } from '../../core/utils/scoreScale';
import { SCORE_UI } from '../../core/constants/scoreLabels';
import { FORM_UI } from '../../core/constants/formLabels';

/** Lo que mueve la nota cada tecla, desde la cifra. */
const STEPS: Partial<Record<string, number>> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

/**
 * LA NOTA 0–100 EN UNA LÍNEA, para el formulario de juego: una barra deslizante con el mismo color que el aro
 * (`hueFromGrade`, de rojo a verde) y la cifra al lado, que también se puede escribir. Ocupa lo que las estrellas,
 * así que el formulario mide lo mismo con las dos escalas; el aro (`ScoreDial`) sigue donde se ENSEÑA la nota.
 *
 * Es un `input type="range"` nativo: lector de pantalla de serie. Pero FUERA DEL TABULADOR: Tab va de campo a campo
 * y aquí cae en la cifra, que es lo que se teclea. Desde ella, ↑ ↓ suben y bajan un punto, y RePág/AvPág, diez.
 */
export const GradeLine = memo(function GradeLine({ value, onChange }: { value: number; onChange: (grade: number) => void }) {
  const current = clampGrade(value);
  const onNumKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    onChange(clampGrade(current + step));
  };
  const style = { '--grade-pct': `${current}%`, '--score-hue': String(hueFromGrade(current)) } as CSSProperties;
  return (
    <div className="grade-line" style={style}>
      <input
        type="range"
        className="grade-line-range"
        min={0}
        max={GRADE_MAX}
        step={1}
        tabIndex={-1}
        value={current}
        aria-label={SCORE_UI.dialAria}
        onChange={(event) => onChange(clampGrade(Number(event.target.value)))}
      />
      <input
        className="grade-line-num"
        inputMode="numeric"
        autoComplete="off"
        aria-label={FORM_UI.gradeNumberAria}
        value={current}
        onKeyDown={onNumKeyDown}
        onChange={(event) => {
          // Solo cifras, y dentro de 0–100: lo demás no llega a escribirse.
          const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
          onChange(clampGrade(Number(digits) || 0));
        }}
      />
    </div>
  );
});
