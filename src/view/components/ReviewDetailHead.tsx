import { resolveGrade, type ScoredLike } from '../../core/utils/scoreScale';
import { HubAvatar } from './socialhub/HubAvatar';
import { NoScoreMedal } from './NoScoreMedal';
import { ScoreDisplay } from './ScoreDisplay';
// Las cuatro pantallas que montan esta cabecera no comparten chunk: dos van en el del hub social, una en el del
// panel de estadísticas y otra en el de la página pública. Ver `styles/reviews.scss`.
import '../../styles/reviews.scss';

/**
 * Quien firma la reseña. AUSENTE cuando no hay nadie a quien nombrar, que no es lo mismo que "el nombre está
 * vacío": en tus propias reseñas todas son tuyas, así que la firma no identifica nada y no se pinta.
 */
export interface ReviewAuthor {
  name: string;
  photoURL?: string;
  /**
   * Abrir su perfil. Es también lo que decide si hay AVATAR: la foto es la puerta a un perfil, así que se pinta
   * cuando se puede ir a él y no cuando no. Sin esto el nombre es texto plano — el caso de la página pública de
   * un enlace, donde el perfil del autor no es alcanzable, y el de la lista de reseñas de un perfil, donde ya se
   * está dentro de él.
   */
  onOpen?: () => void;
  /** Nombre accesible del enlace al perfil. Obligatorio en la práctica cuando hay `onOpen`. */
  openAria?: string;
}

export interface ReviewDetailHeadProps {
  gameName: string;
  author?: ReviewAuthor | null;
  /**
   * Fecha ya redactada. Se recibe hecha y no como `Date` porque cada pantalla decide qué decir cuando no la
   * sabe: el detalle del feed dice «analizado hace poco» y las demás no dicen nada. Vacío: no se pinta.
   */
  dateLabel?: string;
  /** Puntuación, en la escala que tenga elegida quien mira. Sin nota, medallón de interrogación. */
  score: ScoredLike;
}

/**
 * Cabecera del detalle de una reseña: quién la firma, de qué juego habla, cuándo y con qué nota.
 *
 * ESTABA ESCRITA CUATRO VECES —detalle del feed, reseña de un perfil, ficha de la ruleta y página pública de un
 * enlace compartido— y de esas cuatro copias habían salido DOS ÓRDENES distintos para lo mismo: el detalle del
 * feed y la ruleta ponían al autor de titular y el juego como chip; la reseña de un perfil y la página pública,
 * al revés. Es la clase de diferencia que nadie decide: aparece porque el marcado se copia.
 *
 * EL ORDEN, QUE AHORA ES UNO SOLO: manda quien firma cuando hay firma que dar, y el juego cuando no la hay.
 *
 *  · CON AUTOR el titular es la PERSONA y el juego va de chip debajo. Se llega a estas pantallas desde un feed
 *    de gente o desde el perfil de alguien, así que lo primero que hay que saber es de quién es la opinión que
 *    se va a leer; el juego ya se sabe, es de donde se venía. Era la regla que ya seguían el detalle del feed y
 *    la ruleta, y la que documentaba `roulette/ReviewDetail`.
 *  · SIN AUTOR el titular es el JUEGO y no hay chip. Es el caso de TUS reseñas: todas las firmas serían la
 *    misma, así que la firma no distingue nada y lo único que queda por decir es de qué juego se habla. Antes
 *    esa pantalla pintaba un chip con «Tus reseñas», que no es ni siquiera un nombre.
 *
 * NO INCLUYE el cuerpo (texto y metadatos): eso es `ReviewDetailBody`, y las dos se montan juntas.
 */
export function ReviewDetailHead({ gameName, author, dateLabel, score }: ReviewDetailHeadProps) {
  const hasScore = resolveGrade(score) > 0;
  // El avatar cuelga de poder visitar el perfil, no de tener foto: sin `onOpen` no se pinta ninguno, tampoco la
  // silueta. En la página pública eso importa dos veces, porque la silueta sale del sprite de iconos y allí no
  // hay sprite que valga (se monta sin la aplicación).
  const linked = Boolean(author && author.onOpen);

  return (
    <>
      <header className="hub-feed-card-head">
        {author && linked ? (
          <button
            className="hub-avatar-link"
            type="button"
            aria-label={author.openAria}
            title={author.openAria}
            onClick={author.onOpen}
          >
            <HubAvatar photoURL={author.photoURL} />
          </button>
        ) : null}
        <div className="hub-feed-card-head-text">
          {/* Cuando el titular es el JUEGO se dice con la MISMA etiqueta con la que el hub social nombra un
              juego (`hub-feed-game-chip`, que cada tema viste en su §6), y `hub-review-detail-game` solo le
              devuelve el tamaño de titular. Así el nombre de un juego se ve igual en todas partes en vez de
              caer en el azul de enlace, que es el mismo del encabezado de la pantalla y no destacaba nada.
              Con firma, el titular es una persona y ese azul sí es el que le corresponde. */}
          <h3 className={author ? undefined : 'hub-feed-game-chip hub-review-detail-game'}>
            {author
              ? (linked
                ? (
                  <button className="hub-detail-profile-link" type="button" aria-label={author.openAria} onClick={author.onOpen}>
                    {author.name}
                  </button>
                )
                : author.name)
              : gameName}
          </h3>
          {/* El chip solo existe para decir el juego cuando el titular lo ocupa la persona. */}
          {author && gameName ? <span className="hub-feed-game-chip">{gameName}</span> : null}
        </div>
      </header>
      {dateLabel ? <p className="hub-feed-date">{dateLabel}</p> : null}
      {hasScore ? <ScoreDisplay game={score} /> : <NoScoreMedal />}
    </>
  );
}
