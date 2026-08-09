import { memo, type CSSProperties } from 'react';
import type { TagBucket } from '../../../core/stats/types';

interface TagChipsProps {
  tags: TagBucket[];
  limit?: number;
  /** Tono de la nube: `danger` para lo que se abandona, acento para el resto. */
  tone?: 'accent' | 'danger';
}

/**
 * Nube de etiquetas: el TAMAÑO de cada píldora dice cuántas veces se repite. Para listas de texto corto y
 * repetido —las razones de un abandono, los géneros que te apetecen— se lee de un golpe, y evita otra tanda de
 * barras horizontales en una pantalla que ya tiene varias.
 */
export const TagChips = memo(function TagChips({ tags, limit = 10, tone = 'accent' }: TagChipsProps) {
  const top = tags.slice(0, limit);
  const max = top[0]?.games || 1;

  return (
    <ul className={`tag-chips is-${tone}`}>
      {top.map((tag, index) => (
        <li
          key={tag.tag}
          className="tag-chip"
          // `--weight` (0–1) mueve tamaño de letra, relleno y opacidad de fondo a la vez: una sola variable
          // para que la píldora crezca de forma coherente en vez de escalar solo el texto.
          style={{ '--weight': (tag.games / max).toFixed(2), '--i': index } as CSSProperties}
        >
          <span className="tag-chip-text">{tag.tag}</span>
          <span className="tag-chip-num">{tag.games}</span>
        </li>
      ))}
    </ul>
  );
});
