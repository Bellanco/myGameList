import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { GRADE_MAX, hueFromGrade } from '../../../core/utils/scoreScale';
import { formatDecimal } from './format';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.top;

interface LollipopProps {
  rows: Array<{ tag: string; games: number; avgGrade: number }>;
  /** Media global, que se marca como referencia: sin ella, "84" no dice si es mucho o poco PARA TI. */
  average: number;
  scale: ScoreScale;
  limit?: number;
}

/**
 * Piruletas: un punto por categoría al final de un tallo fino, sobre una escala completa de nota.
 *
 * Frente a una barra, el tallo pesa una fracción de la tinta y el ojo va al punto, que es donde está el dato.
 * La escala arranca en cero y llega a la nota máxima —no se recorta al rango de los datos— porque truncarla
 * convertiría cuatro medias parecidas en diferencias abismales que no existen; lo que da la lectura fina es la
 * guía de tu media global.
 */
export const Lollipop = memo(function Lollipop({ rows, average, scale, limit = 6 }: LollipopProps) {
  if (rows.length === 0) return null;

  const shown = rows.slice(0, limit);
  const at = (grade: number) => (Math.min(grade, GRADE_MAX) / GRADE_MAX) * 100;
  // La marca de la media manda: si una del eje le cae encima, se quita esa. Con la media en 98 y el tope en
  // 100, los dos rótulos se montaban y salía "tu m100ia".
  const marks = (scale === 'grade' ? [0, 50, 100] : [0, 60, 100])
    .filter((mark) => Math.abs(at(mark) - at(average)) > 9);

  return (
    <div className="lolli">
      <ul className="lolli-rows">
        {shown.map((row, index) => (
          <li key={row.tag} style={{ '--i': index } as CSSProperties}>
            <span className="lolli-tag" title={row.tag}>{row.tag}</span>
            <span className="lolli-track">
              <span className="lolli-rail" />
              <span className="lolli-avg" style={{ left: `${at(average)}%` } as CSSProperties} />
              <span
                className="lolli-stem"
                style={{ width: `${at(row.avgGrade)}%`, '--dot-hue': String(hueFromGrade(row.avgGrade)) } as CSSProperties}
              >
                <i className="lolli-dot" />
              </span>
            </span>
            <span className="lolli-value">
              <b>{scale === 'grade' ? Math.round(row.avgGrade) : formatDecimal(row.avgGrade / 20)}</b>
              {/* La diferencia contra tu media es la lectura que importa: "84" no dice nada; "+6 sobre tu
                  media" sí. Se calla cuando la diferencia es despreciable, para no pintar ruido. */}
              {Math.abs(row.avgGrade - average) >= 1 ? (
                <em className={row.avgGrade >= average ? 'is-over' : 'is-under'}>
                  {row.avgGrade >= average ? '+' : '−'}
                  {scale === 'grade'
                    ? Math.round(Math.abs(row.avgGrade - average))
                    : formatDecimal(Math.abs(row.avgGrade - average) / 20)}
                </em>
              ) : null}
              <small>{L.genreCount(row.games)}</small>
            </span>
          </li>
        ))}
      </ul>

      {/* El eje es una fila más de la MISMA rejilla: con un margen a ojo se descolocaba en cuanto la columna
          de etiquetas cambiaba de ancho con el texto. */}
      <div className="lolli-axis" aria-hidden="true">
        <span />
        <span className="lolli-axis-line">
          {marks.map((mark) => (
            <span key={mark} style={{ left: `${at(mark)}%` } as CSSProperties}>
              {scale === 'grade' ? mark : formatDecimal(mark / 20)}
            </span>
          ))}
          <span className="lolli-axis-avg" style={{ left: `${at(average)}%` } as CSSProperties}>{L.yourAverage}</span>
        </span>
      </div>
    </div>
  );
});
