import { useState } from 'react';
import { Icon } from '../Icon';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { FeedLikes } from '../../../core/social/feedLikes';

/**
 * «ME GUSTA» al pie de una reseña o publicación (docs/plan-reacciones.md, Fase 4): el botón y, si alguien se lo ha
 * dado, la frase con sus nombres.
 *
 * - En lo de OTRA persona: el botón siempre, y la frase si la hay. Al pulsar, el botón y la frase cambian AL MOMENTO
 *   («A ti y a 5 más os gusta»), aunque la subida vaya después: lo que se ve es lo que has hecho, no lo enviado.
 * - En lo PROPIO: sin botón (no se da «me gusta» a uno mismo), y solo la frase. Sin nadie, no se pinta nada: enseñar
 *   la ausencia («a nadie le gusta») duele más que no enseñar nada.
 *
 * El botón no propaga el clic: la tarjeta de una reseña entera abre su detalle, y pulsar «Me gusta» no es abrirla.
 * Es un botón de alternar (`aria-pressed`): el lector de pantalla anuncia el cambio de estado al pulsarlo, así que no
 * hace falta una región viva aparte.
 */
export function FeedLikeBar({
  SOCIAL_UI,
  likes,
  own,
  author,
  onToggle,
}: {
  SOCIAL_UI: SocialUiLabels;
  likes: FeedLikes;
  /** ¿Es tuyo lo que se pinta? */
  own: boolean;
  /** Nombre de quien lo escribió, para el nombre accesible del botón. */
  author: string;
  onToggle: () => void;
}) {
  // Lo propio no se puede marcar: ahí `mine` no cuenta aunque viniera puesto.
  const mine = !own && likes.mine;
  const phrase = SOCIAL_UI.feed.likes.phrase(likes.names, mine);
  /** El salto del pulgar, solo al pulsar AQUÍ: un «me gusta» que ya venía puesto no salta al pintarse. */
  const [pop, setPop] = useState(false);
  if (own && !phrase) return null;
  return (
    <div className="hub-like-bar">
      {own ? null : (
        <button
          type="button"
          className="hub-like-button"
          aria-pressed={mine}
          data-pop={pop ? '' : undefined}
          onAnimationEnd={() => setPop(false)}
          aria-label={SOCIAL_UI.feed.likes.buttonAria(author)}
          onClick={(event) => {
            event.stopPropagation();
            setPop(!mine);
            onToggle();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Icon name="thumbs-up" className="ui-icon hub-like-icon" />
          <span>{SOCIAL_UI.feed.likes.button}</span>
        </button>
      )}
      {phrase ? (
        <p className="hub-like-who" title={SOCIAL_UI.feed.likes.fullList(likes.names, mine)}>{phrase}</p>
      ) : null}
    </div>
  );
}
