import { ReviewDetailBody } from '../ReviewDetailBody';
import { ReviewDetailHead, type ReviewAuthor } from '../ReviewDetailHead';
import type { GameItem } from '../../../model/types/game';

export type { ReviewAuthor };

interface ReviewDetailProps {
  game: GameItem;
  author?: ReviewAuthor;
}

/**
 * Detalle de una reseña dentro de la ruleta — en listados (sin autor) y en el perfil social (con él).
 *
 * La cabecera y el cuerpo ya no se escriben aquí: los ponen `ReviewDetailHead` y `ReviewDetailBody`, los mismos
 * que montan el detalle del feed, la reseña de un perfil y la página pública de un enlace. Lo único propio de
 * esta ficha es el marco (`rl-review`), porque va dentro del modal de la ruleta.
 *
 * De la regla del titular —la persona cuando hay firma, el juego cuando no— se encarga la cabecera. Era la que
 * este fichero documentaba, y ahora la cumplen las cuatro pantallas en vez de dos.
 *
 * SIN FECHA a propósito: la ruleta enseña lo que te ha tocado JUGAR, y cuándo escribiste la reseña no ayuda a
 * decidir eso.
 */
export function ReviewDetail({ game, author }: ReviewDetailProps) {
  return (
    <div className="rl-review">
      <article className="hub-feed-card hub-feed-card-detail rl-review-card">
        <ReviewDetailHead gameName={game.name} author={author} score={game} />
        <ReviewDetailBody
          review={String(game.review || '').trim()}
          platforms={game.platforms}
          genres={game.genres}
          strengths={game.strengths}
          weaknesses={game.weaknesses}
        />
      </article>
    </div>
  );
}
