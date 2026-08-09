import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TagBucket } from '../../../core/stats/types';
import { formatCount } from './format';

const L = UI_MESSAGES.stats.genres;

interface TagBarsProps {
  tags: TagBucket[];
  /** Cuántas filas se pintan; el resto no se muestra (el ranking largo no aporta y alarga la pantalla). */
  limit?: number;
}

/**
 * Ranking horizontal de etiquetas: una barra por el NÚMERO de juegos y nada más.
 *
 * Las horas estaban aquí y se han quitado: la columna de la derecha crecía o menguaba según la etiqueta ("9" o
 * "9 · 677 h") y descolocaba el ancho de la barra fila a fila. Las horas siguen estando donde de verdad se
 * leen, que son las cifras destacadas y el gráfico anual.
 */
export const TagBars = memo(function TagBars({ tags, limit = 8 }: TagBarsProps) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const top = tags.slice(0, limit);
  const max = top[0]?.games || 0;

  return (
    <ul className="stats-bars" aria-label={L.chartAria}>
      {top.map((bucket, index) => (
        <li className="stats-bar-row" key={bucket.tag} style={{ '--i': index } as CSSProperties}>
          <span className="stats-bar-label" title={bucket.tag}>{bucket.tag}</span>
          <span className="stats-bar-track">
            <span
              className="stats-bar-fill is-accent"
              style={{ '--bar-width': `${max > 0 ? (bucket.games / max) * 100 : 0}%` } as CSSProperties}
            />
          </span>
          <span className="stats-bar-value" aria-hidden="true">{formatCount(bucket.games)}</span>
          <span className="sr-only">{L.games(bucket.games)}</span>
        </li>
      ))}
    </ul>
  );
});
