import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { hueFromGrade } from '../../../core/utils/scoreScale';
import type { GradeBucket } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';
import { formatCount } from './format';

const L = UI_MESSAGES.stats.grades;

interface GradeHistogramProps {
  grades: GradeBucket[];
  /** Escala de la cuenta: etiqueta los tramos en estrellas (defecto) o en nota 0–100. */
  scale: ScoreScale;
}

/**
 * Histograma de notas, una fila por tramo. Cada barra se colorea con el MISMO tono rojo→verde que el aro de
 * puntuación (`hueFromGrade`), así que el gradiente del panel y el de la tabla dicen lo mismo.
 */
export const GradeHistogram = memo(function GradeHistogram({ grades, scale }: GradeHistogramProps) {
  const total = grades.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const max = grades.reduce((top, bucket) => Math.max(top, bucket.count), 0);

  return (
    <ul className="stats-bars" aria-label={L.chartAria}>
      {/* De más nota a menos: se lee como un ranking, con lo mejor arriba. */}
      {[...grades].reverse().map((bucket) => {
        const label = scale === 'grade' ? L.gradeLabel(bucket.floor, bucket.ceiling) : L.starsLabel(bucket.stars);
        // Tono del PUNTO MEDIO del tramo: el suelo del tramo de 5★ es 90 y pintarlo con ese tono dejaría el
        // mejor tramo más apagado que la nota que representa.
        const hue = hueFromGrade((bucket.floor + bucket.ceiling) / 2);
        return (
          <li className="stats-bar-row" key={bucket.stars}>
            <span className="stats-bar-label">{label}</span>
            <span className="stats-bar-track">
              <span
                className="stats-bar-fill"
                style={{ '--bar-width': `${max > 0 ? (bucket.count / max) * 100 : 0}%`, '--bar-hue': String(hue) } as CSSProperties}
              />
            </span>
            {/* El número se oculta al lector y se anuncia con su unidad ("12 juegos"), para no leer "12 12". */}
            <span className="stats-bar-value" aria-hidden="true">{formatCount(bucket.count)}</span>
            <span className="sr-only">{L.countLabel(bucket.count)}</span>
          </li>
        );
      })}
    </ul>
  );
});
