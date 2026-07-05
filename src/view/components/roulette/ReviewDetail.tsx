import { StarRating } from '../StarRating';
import { ScoreDisplay } from '../ScoreDisplay';
import { MetaSection } from '../MetaSection';
import { HubAvatar } from '../socialhub/HubAvatar';
import { resolveStars } from '../../../core/utils/scoreScale';
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
        {/* Reseña de un amigo (canal social 0–5) → estrellas; propia → escala elegida por el usuario. */}
        {author ? <StarRating value={resolveStars(game)} /> : <ScoreDisplay game={game} />}
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
