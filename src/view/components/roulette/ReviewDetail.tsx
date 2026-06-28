import { StarRating } from '../StarRating';
import { HubAvatar } from '../socialhub/HubAvatar';
import type { GameItem } from '../../../model/types/game';

/** Autor de la reseña (solo en social). En listados no se pasa → la cabecera muestra el nombre del juego. */
export interface ReviewAuthor {
  name: string;
  photoURL?: string;
}

interface ReviewDetailProps {
  game: GameItem;
  author?: ReviewAuthor;
}

function MetaSection({ label, items, cls }: { label: string; items?: string[]; cls: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="hub-metadata-section">
      <strong>{label}</strong>
      <div className="chips">
        {items.map((item) => (
          <span key={item} className={`chip ${cls}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Detalle de una reseña — parte COMÚN reutilizada por la ruleta en listados y en perfil social.
 * Con `author` (social) muestra avatar + nombre del autor y el juego como chip; sin él (listados),
 * el título es el propio juego. El botón "Atrás" lo decide quien lo monta.
 */
export function ReviewDetail({ game, author }: ReviewDetailProps) {
  const review = String(game.review || '').trim();
  return (
    <div className="rl-review">
      <article className="hub-feed-card hub-feed-card-detail rl-review-card">
        <header className="hub-feed-card-head">
          {author ? <HubAvatar name={author.name} photoURL={author.photoURL} /> : null}
          <div className="hub-feed-card-head-text">
            <h3>{author ? author.name : game.name}</h3>
            {author && game.name ? <span className="hub-feed-game-chip">{game.name}</span> : null}
          </div>
        </header>
        <StarRating value={Number(game.score || 0)} />
        <div className="hub-detail-body">
          {review ? <p className="hub-feed-review-text">{review}</p> : null}
          <div className="hub-detail-metadata">
            <MetaSection label="Plataformas" items={game.platforms} cls="chip-plat" />
            <MetaSection label="Géneros" items={game.genres} cls="chip-genre" />
            <MetaSection label="Puntos fuertes" items={game.strengths} cls="chip-pf" />
            <MetaSection label="Puntos débiles" items={game.weaknesses} cls="chip-pd" />
          </div>
        </div>
      </article>
    </div>
  );
}
