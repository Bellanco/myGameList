import { memo, type CSSProperties } from 'react';
import { clampGrade, hueFromGrade } from '../../core/utils/scoreScale';

/** Muestra una nota (0–100) como aro que se rellena según la puntuación, coloreado de rojo a verde. Solo display. */
export const ScoreRing = memo(function ScoreRing({ grade }: { grade: number }): React.JSX.Element {
  const g = Math.round(clampGrade(grade));
  const style = { '--score-pct': String(g), '--score-hue': String(hueFromGrade(g)) } as CSSProperties;
  return (
    <span className={`score-ring${g <= 0 ? ' is-blank' : ''}`} style={style} aria-label={g > 0 ? `Nota ${g} de 100` : 'Sin puntuar'}>
      <span className="score-ring-num">{g > 0 ? g : '–'}</span>
    </span>
  );
});
