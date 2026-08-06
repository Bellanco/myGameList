import { memo, type CSSProperties } from 'react';
import { clampGrade, hueFromGrade } from '../../core/utils/scoreScale';

/**
 * Muestra una nota (0–100) como aro que se rellena según la puntuación, coloreado de rojo a verde. Solo display.
 *
 * A11y-4: `role="img"` para que el `aria-label` cuente. Ya lo llevaba, pero sobre un `<span>` sin rol la etiqueta
 * puede ignorarse, y entonces se anunciaba solo el número de dentro, sin el "de 100" que le da sentido.
 */
export const ScoreRing = memo(function ScoreRing({ grade }: { grade: number }): React.JSX.Element {
  const g = Math.round(clampGrade(grade));
  const style = { '--score-pct': String(g), '--score-hue': String(hueFromGrade(g)) } as CSSProperties;
  return (
    <span
      className={`score-ring${g <= 0 ? ' is-blank' : ''}`}
      style={style}
      role="img"
      aria-label={g > 0 ? `Nota ${g} de 100` : 'Sin puntuar'}
    >
      <span className="score-ring-num">{g > 0 ? g : '–'}</span>
    </span>
  );
});
