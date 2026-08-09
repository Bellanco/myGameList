import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TopSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.top;

/** Cuántos géneros distintos llevan color propio. El resto cae en "otros", con el tono neutro. */
const MAX_KEYS = 6;

/**
 * Gofre: UNA CELDA POR JUEGO, coloreada por su género.
 *
 * Con diez juegos, contar celdas es contar juegos —"cinco de mis diez mejores son de acción" se lee con el
 * dedo—, y eso una barra o un porcentaje no lo dan. Es la forma correcta justo porque el total es pequeño y
 * redondo; con doscientos juegos sería un mosaico ilegible.
 */
export const Waffle = memo(function Waffle({ top }: { top: TopSummary }) {
  const keys = top.genres.slice(0, MAX_KEYS).map((bucket) => bucket.tag);
  const rank = new Map(keys.map((tag, index) => [tag, index]));
  const cells = top.waffle;
  if (cells.length === 0) return null;

  // Solo se listan en la leyenda los géneros que de verdad pintan alguna celda.
  const used = keys
    .map((tag) => ({ tag, count: cells.filter((cell) => cell.tag === tag).length }))
    .filter((entry) => entry.count > 0);
  const others = cells.filter((cell) => !rank.has(cell.tag)).length;

  return (
    <div className="waffle">
      <ul className="waffle-grid" aria-hidden="true">
        {cells.map((cell, index) => (
          <li
            key={cell.id}
            className={`waffle-cell${rank.has(cell.tag) ? '' : ' is-other'}`}
            title={`${cell.name}${cell.tag ? ` · ${cell.tag}` : ''}`}
            style={{ '--i': rank.get(cell.tag) ?? 0, '--n': index } as CSSProperties}
          />
        ))}
      </ul>

      <ul className="waffle-legend">
        {used.map((entry) => (
          <li key={entry.tag}>
            <span className="waffle-key" style={{ '--i': rank.get(entry.tag) ?? 0 } as CSSProperties} aria-hidden="true" />
            {entry.tag}
            <b>{entry.count}</b>
          </li>
        ))}
        {others > 0 ? (
          <li>
            <span className="waffle-key is-other" aria-hidden="true" />
            {L.others}
            <b>{others}</b>
          </li>
        ) : null}
      </ul>
    </div>
  );
});
