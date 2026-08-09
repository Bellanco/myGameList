import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount } from './format';
import type { TagBucket } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.genres;

interface TagRankingProps {
  tags: TagBucket[];
  limit?: number;
}

/**
 * Ranking en texto: puesto, etiqueta y cifra. Sin barra.
 *
 * Para media docena de etiquetas cortas —las razones de un abandono, las plataformas— una barra no añade nada
 * que no diga ya el número, y sumaba otra tanda de barras horizontales a una pantalla que ya tiene bastantes
 * formas. Aquí la jerarquía la marcan el orden y el peso tipográfico.
 */
export const TagRanking = memo(function TagRanking({ tags, limit = 6 }: TagRankingProps) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  return (
    <ol className="tag-ranking">
      {tags.slice(0, limit).map((tag, index) => (
        <li key={tag.tag} style={{ '--i': index } as CSSProperties}>
          <span className="tag-ranking-pos" aria-hidden="true">{index + 1}</span>
          <span className="tag-ranking-name" title={tag.tag}>{tag.tag}</span>
          <span className="tag-ranking-num">{formatCount(tag.games)}</span>
        </li>
      ))}
    </ol>
  );
});
