import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { SocialMoveFeedGroup, SocialMoveGroupGame } from '../../../viewmodel/social/socialFeed';

interface FeedMoveCardProps {
  entry: SocialMoveFeedGroup;
  SOCIAL_UI: SocialUiLabels;
  ownershipClass: string;
  openProfileDetail: (id: string) => void;
  openMoveReview: (actorProfileId: string, gameId: number) => void;
}

/**
 * Cuántas FILAS ocupa como mucho un aviso agrupado al desplegarlo, contando la de la frase. Si los juegos caben,
 * salen todos; si hay más, el último hueco lo ocupa la fila «y 4 más» en vez de un juego: la frase, tres debajo y la
 * cuenta. Siempre los más recientes.
 */
export const MOVE_GROUP_VISIBLE = 5;

/**
 * F4 — MOVIMIENTO DE LISTA. Una línea y se acaba: quién, qué hizo y con qué juego. La tarjeta NO es
 * pulsable —no hay pantalla de «movimiento» que abrir— y de ella solo llevan a algún sitio el autor (su perfil) y,
 * cuando de verdad existe, el nombre del juego (el análisis de ese autor sobre él).
 *
 * AGRUPADA COMO LOS LOGROS: los movimientos de una persona a una lista en un día son un solo renglón. La frase
 * nombra el más reciente y dice cuántos más hay («Ada añadió Hades y 3 más…»); la cifra despliega el resto
 * DEBAJO DEL PRIMERO, alineados con él, como una columna de títulos. Así una tarde ordenando la biblioteca no
 * llena el día de todo el mundo, y no se pierde qué juegos fueron. Desplegado ocupa como mucho cinco filas
 * (`MOVE_GROUP_VISIBLE`, los más recientes); si hay más juegos, la quinta es «y N más» (07-10-2026).
 *
 * SIN HORA desde el 07-10-2026: el día ya lo dice la cabecera del grupo, y la hora era el dato que menos contaba
 * de un aviso que debe pesar poco.
 */
export function FeedMoveCard({ entry, SOCIAL_UI, ownershipClass, openProfileDetail, openMoveReview }: FeedMoveCardProps) {
  const [expanded, setExpanded] = useState(false);
  const restId = useId();
  const nombreAutor = entry.profileDisplayName || SOCIAL_UI.requests.unknownUser;
  const [first, ...rest] = entry.games;
  // Los que se listan al desplegar y los que solo se cuentan. Si caben todos en las cinco filas, todos; si no, la
  // quinta fila es la cuenta y los listados son tres.
  const restVisible = entry.games.length <= MOVE_GROUP_VISIBLE ? rest : rest.slice(0, MOVE_GROUP_VISIBLE - 2);
  const restHidden = rest.length - restVisible.length;
  const tail = SOCIAL_UI.feed.moveTail[entry.tab];
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSpanElement>(null);
  const [indent, setIndent] = useState(0);

  // LOS DESPLEGADOS, DEBAJO DEL PRIMER TÍTULO: la sangría es donde empieza el primero dentro del cuerpo. Se mide
  // al abrir y cada vez que el aviso cambia de ancho, porque la frase parte distinto (y el primero se mueve) según
  // el sitio que haya. Si el primero cae a una línea nueva, su `offsetLeft` es 0 y la columna empieza al canto.
  useLayoutEffect(() => {
    if (!expanded) return undefined;
    const body = bodyRef.current;
    const medir = () => {
      const nodo = firstRef.current;
      if (!body || !nodo) return;
      setIndent(nodo.getBoundingClientRect().left - body.getBoundingClientRect().left);
    };
    medir();
    if (!body || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(medir);
    observer.observe(body);
    return () => observer.disconnect();
  }, [expanded]);

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
      className={`hub-feed-card hub-feed-activity-item is-move ${ownershipClass}${rest.length ? ' is-grouped' : ''}`}
      /* El tipo de lista viaja al CSS para que el aviso lleve el color de lo que pasó: terminar es verde, abandonar
         rojo, empezar el acento y añadir el cuarto tono. Es un dato que ya está aquí; sacarlo evita que la hoja
         tenga que adivinarlo. */
      data-tab={entry.tab}
      role="listitem"
    >
      {/* NI ICONO NI FOTO. El aviso es una FRASE, y la frase ya lo dice todo: quién, qué hizo y con qué juego. El
          color del filete ya distingue terminar de abandonar. El nombre sigue siendo el enlace al perfil. */}
      <div className="hub-feed-move-body" ref={bodyRef}>
        <p className="hub-feed-move-line">
          <button className="hub-name-link hub-feed-move-who" type="button" onClick={() => openProfileDetail(entry.profileId)}>
            {nombreAutor}
          </button>
          {' '}
          <span className="hub-feed-move-verb">{SOCIAL_UI.feed.moveHeadline[entry.tab]}</span>
          {' '}
          <span ref={firstRef}>{gameName(first)}</span>
          {rest.length ? (
            <>
              <span className="hub-feed-move-verb">{SOCIAL_UI.feed.moveAnd}</span>
              <button
                className="hub-feed-move-game hub-feed-move-more"
                type="button"
                aria-expanded={expanded}
                aria-controls={restId}
                aria-label={SOCIAL_UI.feed.moveMoreAria(rest.length, expanded)}
                onClick={() => setExpanded((open) => !open)}
              >
                {SOCIAL_UI.feed.moveMore(rest.length)}
              </button>
            </>
          ) : null}
          {tail ? (
            <>
              {' '}
              <span className="hub-feed-move-verb">{tail}</span>
            </>
          ) : null}
        </p>
        {rest.length ? (
          // `hub-feed-move-line` también en la lista: los títulos de debajo tienen que medir lo mismo que el de la
          // frase, y varias paletas cambian el cuerpo del renglón desde esa clase.
          <ul
            className="hub-feed-move-line hub-feed-move-rest"
            id={restId}
            hidden={!expanded}
            style={{ '--move-rest-indent': `${indent}px` } as CSSProperties}
          >
            {restVisible.map((game) => (
              <li key={game.id}>{gameName(game)}</li>
            ))}
            {restHidden > 0 ? <li className="hub-feed-move-verb">{SOCIAL_UI.feed.moveMoreCount(restHidden)}</li> : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
