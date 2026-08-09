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
 * Histograma de notas en COLUMNAS, que es la forma canónica de un histograma: el eje de la nota va de peor a
 * mejor de izquierda a derecha y la altura es la frecuencia, así que la silueta se lee como una distribución.
 * En barras horizontales había que reconstruir ese orden leyendo etiquetas.
 *
 * Cada columna lleva el tono rojo→verde del aro de puntuación (`hueFromGrade`), así que el color dice la nota
 * en todo el panel y no solo aquí.
 */
export const GradeHistogram = memo(function GradeHistogram({ grades, scale }: GradeHistogramProps) {
  const total = grades.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const max = grades.reduce((top, bucket) => Math.max(top, bucket.count), 0);

  return (
    <div className="grade-chart">
      {grades.map((bucket, index) => {
        const label = scale === 'grade' ? L.gradeLabel(bucket.floor, bucket.ceiling) : L.starsLabel(bucket.stars);
        // Tono del PUNTO MEDIO del tramo: el suelo del tramo de 5★ es 90 y pintarlo con ese tono dejaría el
        // mejor tramo más apagado que la nota que representa.
        const hue = hueFromGrade((bucket.floor + bucket.ceiling) / 2);
        return (
          <div
            className="grade-col"
            key={bucket.stars}
            style={{ '--i': index, '--bar-hue': String(hue) } as CSSProperties}
          >
            <span className="grade-col-value" aria-hidden="true">{formatCount(bucket.count)}</span>
            <div className="grade-col-track">
              <div className="grade-col-bar" style={{ '--bar-height': `${max > 0 ? (bucket.count / max) * 100 : 0}%` } as CSSProperties} />
            </div>
            <span className="grade-col-label" aria-hidden="true">
              {scale === 'grade' ? label : '★'.repeat(bucket.stars)}
            </span>
            <span className="sr-only">{`${label}: ${L.countLabel(bucket.count)}`}</span>
          </div>
        );
      })}
    </div>
  );
});
