import { memo, type CSSProperties } from 'react';
import { GRADE_MAX, clampGrade, hueFromGrade } from '../../core/utils/scoreScale';
import { SCORE_UI } from '../../core/constants/scoreLabels';
import { FORM_UI } from '../../core/constants/formLabels';

/**
 * LA NOTA 0–100 EN UNA LÍNEA, para el formulario de juego: una barra deslizante con el mismo color que el aro
 * (`hueFromGrade`, de rojo a verde) y la cifra al lado, que también se puede escribir. Ocupa lo que las estrellas,
 * así que el formulario mide lo mismo con las dos escalas; el aro (`ScoreDial`) sigue donde se ENSEÑA la nota.
 *
 * Es un `input type="range"` nativo: teclado (flechas, Inicio/Fin, RePág/AvPág) y lector de pantalla de serie.
 */
export const GradeLine = memo(function GradeLine({ value, onChange }: { value: number; onChange: (grade: number) => void }) {
  const current = clampGrade(value);
  const style = { '--grade-pct': `${current}%`, '--score-hue': String(hueFromGrade(current)) } as CSSProperties;
  return (
    <div className="grade-line" style={style}>
      <input
        type="range"
        className="grade-line-range"
        min={0}
        max={GRADE_MAX}
        step={1}
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
        onChange={(event) => {
          // Solo cifras, y dentro de 0–100: lo demás no llega a escribirse.
          const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
          onChange(clampGrade(Number(digits) || 0));
        }}
      />
    </div>
  );
});
