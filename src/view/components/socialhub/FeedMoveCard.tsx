import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { SocialMoveFeedGroup, SocialMoveGroupGame } from '../../../viewmodel/social/socialFeed';

interface FeedMoveCardProps {
  entry: SocialMoveFeedGroup;
  SOCIAL_UI: SocialUiLabels;
  ownershipClass: string;
  openProfileDetail: (id: string) => void;
  openMoveReview: (actorProfileId: string, gameId: number) => void;
}

/** Cuántos títulos enseña como mucho un renglón agrupado: los más recientes. El resto se cuenta, no se lista. */
export const MOVE_GROUP_VISIBLE = 10;

/**
 * F4 — MOVIMIENTO DE LISTA. Quién, qué hizo y con qué juegos. La tarjeta NO es pulsable —no hay pantalla de
 * «movimiento» que abrir— y de ella solo llevan a algún sitio el autor (su perfil) y, cuando de verdad existe, el
 * nombre del juego (el análisis de ese autor sobre él).
 *
 * AGRUPADA COMO LOS LOGROS: los movimientos de una persona a una lista en un día son una sola tarjeta. Con un juego
 * es una frase («Ada añadió Hades a su lista de deseos»); con varios, la frase sin juego y debajo los títulos en
 * columna, siempre a la vista, del más reciente al más antiguo y como mucho diez (`MOVE_GROUP_VISIBLE`): si hubo
 * más, se cierra con «y N más». Así una tarde ordenando la biblioteca no llena el día de todo el mundo, y se ve qué
 * juegos fueron sin tener que abrir nada (07-10-2026; antes nombraba uno y escondía el resto tras un botón).
 *
 * SIN HORA desde el 07-10-2026: el día ya lo dice la cabecera del grupo, y la hora era el dato que menos contaba
 * de un aviso que debe pesar poco.
 */
export function FeedMoveCard({ entry, SOCIAL_UI, ownershipClass, openProfileDetail, openMoveReview }: FeedMoveCardProps) {
  const nombreAutor = entry.profileDisplayName || SOCIAL_UI.requests.unknownUser;
  const visibles = entry.games.slice(0, MOVE_GROUP_VISIBLE);
  const ocultos = entry.games.length - visibles.length;
  const agrupado = entry.games.length > 1;
  const tail = SOCIAL_UI.feed.moveTail[entry.tab];

  const gameName = (game: SocialMoveGroupGame) =>
    game.reviewActorId ? (
      <button
        className="hub-feed-move-game"
        type="button"
        aria-label={SOCIAL_UI.feed.openMoveReviewAria(nombreAutor, game.gameName)}
        // El actor de la RESEÑA, no el id de la entrada del directorio: el detalle resuelve por `actorProfileId` y
        // con el otro id no encontraba nada.
        onClick={() => openMoveReview(game.reviewActorId as string, game.gameId)}
      >
        {game.gameName}
      </button>
    ) : (
      <span className="hub-feed-move-game is-plain">{game.gameName}</span>
    );

  return (
    <article
      className={`hub-feed-card hub-feed-activity-item is-move ${ownershipClass}${agrupado ? ' is-grouped' : ''}`}
      /* El tipo de lista viaja al CSS para que el aviso lleve el color de lo que pasó: terminar es verde, abandonar
         rojo, empezar el acento y añadir el cuarto tono. Es un dato que ya está aquí; sacarlo evita que la hoja
         tenga que adivinarlo. */
      data-tab={entry.tab}
      role="listitem"
    >
      {/* NI ICONO NI FOTO. El aviso es una FRASE, y la frase ya lo dice todo: quién, qué hizo y con qué juego. El
          color del filete ya distingue terminar de abandonar. El nombre sigue siendo el enlace al perfil. */}
      <div className="hub-feed-move-body">
        <p className="hub-feed-move-line">
          <button className="hub-name-link hub-feed-move-who" type="button" onClick={() => openProfileDetail(entry.profileId)}>
            {nombreAutor}
          </button>
          {' '}
          <span className="hub-feed-move-verb">{SOCIAL_UI.feed.moveHeadline[entry.tab]}</span>
          {agrupado ? null : (
            <>
              {' '}
              {gameName(entry.games[0])}
            </>
          )}
          {tail ? (
            <>
              {' '}
              <span className="hub-feed-move-verb">{tail}</span>
            </>
          ) : null}
        </p>
        {agrupado ? (
          // `hub-feed-move-line` también en la lista: los títulos de debajo tienen que medir lo mismo que la frase, y
          // varias paletas cambian el cuerpo del renglón desde esa clase.
          <ul className="hub-feed-move-line hub-feed-move-rest">
            {visibles.map((game) => (
              <li key={game.id}>{gameName(game)}</li>
            ))}
            {ocultos > 0 ? <li className="hub-feed-move-verb">{SOCIAL_UI.feed.moveMoreCount(ocultos)}</li> : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
