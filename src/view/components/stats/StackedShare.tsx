import { memo, type CSSProperties } from 'react';
import { formatPercent } from './format';
import type { TagBucket } from '../../../core/stats/types';

/** Segmentos con color propio; el resto se agrupa para no partir la barra en migas. */
const MAX_KEYS = 5;
/** Por debajo de este porcentaje, el segmento no da para escribir nada dentro. */
const LABEL_MIN = 14;

/**
 * Una sola barra repartida al 100%: el reparto de un conjunto pequeño de categorías, sin ejes ni rejilla.
 *
 * Frente a un ranking de barras —que compara cada categoría con la mayor— esta compara cada una con EL TODO,
 * que es la pregunta cuando lo que se quiere saber es "de todo esto, cuánto es de cada". Los segmentos se
 * separan con un hueco del color del fondo, no con un borde: el hueco es el que hace el trabajo.
 */
export const StackedShare = memo(function StackedShare({ tags }: { tags: TagBucket[] }) {
  const total = tags.reduce((sum, tag) => sum + tag.games, 0);
  if (total === 0) return null;

  const top = tags.slice(0, MAX_KEYS);
  const rest = tags.slice(MAX_KEYS).reduce((sum, tag) => sum + tag.games, 0);
  const parts = rest > 0 ? [...top, { tag: '—', games: rest, hours: 0 }] : top;

  return (
    <div className="share">
      <div className="share-bar">
        {parts.map((part, index) => {
          const percent = (part.games / total) * 100;
          return (
            <span
              key={part.tag}
              className="share-seg"
              title={`${part.tag}: ${part.games} (${formatPercent(percent)}%)`}
              style={{ '--i': index, width: `${percent}%` } as CSSProperties}
            >
              {/* El rótulo solo entra si cabe: recortarlo dentro del segmento sería peor que no ponerlo. */}
              {percent >= LABEL_MIN ? <b>{formatPercent(percent)}%</b> : null}
            </span>
          );
        })}
      </div>

      <ul className="share-legend">
        {parts.map((part, index) => (
          <li key={part.tag}>
            <span className="share-key" style={{ '--i': index } as CSSProperties} aria-hidden="true" />
            {part.tag}
            <b>{part.games}</b>
          </li>
        ))}
      </ul>
    </div>
  );
});
