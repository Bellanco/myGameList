import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TagBucket } from '../../../core/stats/types';
import { formatCount, formatHours } from './format';

const L = UI_MESSAGES.stats.genres;

interface TagBarsProps {
  tags: TagBucket[];
  /** Cuántas filas se pintan; el resto no se muestra (el ranking largo no aporta y alarga la pantalla). */
  limit?: number;
}

/** Ranking horizontal de etiquetas (géneros): barra por nº de juegos, con las horas como dato secundario. */
export const TagBars = memo(function TagBars({ tags, limit = 8 }: TagBarsProps) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const top = tags.slice(0, limit);
  const max = top[0]?.games || 0;

  return (
    <ul className="stats-bars" aria-label={L.chartAria}>
      {top.map((bucket) => (
        <li className="stats-bar-row" key={bucket.tag}>
          <span className="stats-bar-label" title={bucket.tag}>{bucket.tag}</span>
          <span className="stats-bar-track">
            <span
              className="stats-bar-fill is-accent"
              style={{ '--bar-width': `${max > 0 ? (bucket.games / max) * 100 : 0}%` } as CSSProperties}
            />
          </span>
          <span className="stats-bar-value" aria-hidden="true">
            {formatCount(bucket.games)}
            {bucket.hours > 0 ? <small>{L.hours(formatHours(bucket.hours))}</small> : null}
          </span>
          <span className="sr-only">
            {L.games(bucket.games)}
            {bucket.hours > 0 ? `, ${L.hours(formatHours(bucket.hours))}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
});
