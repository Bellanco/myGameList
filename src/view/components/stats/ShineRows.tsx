import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { GRADE_MAX } from '../../../core/utils/scoreScale';
import { formatDecimal } from './format';
import type { ScoreScale } from '../../../core/utils/scoreScale';

/** Diferencia mínima contra tu media para que merezca la pena escribirla; por debajo es ruido. */
const NOISE = 1;

interface ShineRowsProps {
  rows: Array<{ tag: string; games: number; avgGrade: number }>;
  /** Media global, que se marca como referencia: sin ella, "84" no dice si es mucho o poco PARA TI. */
  average: number;
  scale: ScoreScale;
  limit?: number;
}

/**
 * Filas con la barra AL FONDO: el relleno vive detrás del texto en vez de ocupar una columna propia.
 *
 * Frente a las piruletas, esto gana lo que en una pantalla de móvil vale más que nada: el nombre del género
 * dispone de la fila entera en vez de pelearse con un carril, y aun así se sigue viendo la magnitud, porque el
 * fondo llega hasta donde llega la nota. La escala arranca en cero y llega a la nota máxima —no se recorta al
 * rango de los datos— porque truncarla convertiría cuatro medias parecidas en diferencias abismales.
 *
 * Encima del relleno van marcados los cinco tramos de estrella y, cruzando todas las filas, la guía de tu media
 * global: son las dos referencias que convierten un porcentaje en una lectura.
 */
export const ShineRows = memo(function ShineRows({ rows, average, scale, limit = 6 }: ShineRowsProps) {
  const L = useStatsLabels().top;
  if (rows.length === 0) return null;

  const shown = rows.slice(0, limit);
  const at = (grade: number) => (Math.min(grade, GRADE_MAX) / GRADE_MAX) * 100;
  const inScale = (grade: number) => (scale === 'grade' ? String(Math.round(grade)) : formatDecimal(grade / 20));

  return (
    <div className="shine">
      <ul className="shine-rows" style={{ '--n': shown.length } as CSSProperties}>
        {shown.map((row, index) => {
          const delta = row.avgGrade - average;
          return (
            <li key={row.tag} style={{ '--i': index } as CSSProperties}>
              <span className="shine-fill" style={{ width: `${at(row.avgGrade)}%` }} aria-hidden="true" />
              <span className="shine-tag" title={row.tag}>{row.tag}</span>
              <span className="shine-count">{L.genreCount(row.games)}</span>
              <span className="shine-value">
                <b>{inScale(row.avgGrade)}</b>
                {/* La diferencia contra tu media es la lectura que importa: "84" no dice nada; "+6" sí. */}
                {Math.abs(delta) >= NOISE ? (
                  <em className={delta >= 0 ? 'is-over' : 'is-under'}>
                    {delta >= 0 ? '+' : '−'}
                    {inScale(Math.abs(delta))}
                  </em>
                ) : null}
              </span>
            </li>
          );
        })}

        <span className="shine-avg" style={{ left: `${at(average)}%` }} aria-hidden="true" />
      </ul>

      <p className="shine-note" aria-hidden="true">
        <span style={{ left: `${at(average)}%` }}>{`${L.yourAverage} ${inScale(average)}`}</span>
      </p>
    </div>
  );
});
