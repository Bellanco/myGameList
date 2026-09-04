import { memo, type CSSProperties } from 'react';
import { resolveGrade, reviewAccent } from '../../../core/utils/scoreScale';
import { useScoreScale } from '../../hooks/useScoreScale';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { RelatedReview } from '../../../core/social/relatedReviews';

/**
 * Reseñas relacionadas al final de una reseña abierta: por dónde seguir leyendo.
 *
 * UNA LISTA MEZCLADA, NO UNA SECCIÓN POR MOTIVO. Cada tarjeta lleva un chip que dice por qué está ahí —«Mismo
 * juego», «Más de Ana», «Acción»— y eso hace el trabajo que harían tres encabezados, sin dejar huecos: con
 * secciones fijas, un motivo sin resultados (el género, que es el de cobertura irregular) obliga a elegir entre
 * un título vacío o un bloque que cambia de forma según la reseña.
 *
 * NO PINTA NADA SI NO HAY NADA. Un «no hay reseñas relacionadas» al final de cada reseña sería ruido en la
 * mayoría de las bibliotecas pequeñas, que es justo donde este bloque tiene menos que ofrecer.
 *
 * Reutiliza la anatomía de tarjeta de `ProfileReviewsList` (medallón con la nota, barra lateral del color de la
 * nota, texto recortado) porque es la misma cosa: una reseña en una lista. Lo único propio es el chip del motivo
 * y que aquí se firma con el autor, que en la lista de un perfil se sobreentiende y aquí no.
 */
export const RelatedReviews = memo(function RelatedReviews({
  SOCIAL_UI,
  items,
  onOpen,
}: {
  SOCIAL_UI: SocialUiLabels;
  items: RelatedReview[];
  onOpen: (entry: RelatedReview) => void;
}) {
  const scoreScale = useScoreScale();

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="hub-related" aria-label={SOCIAL_UI.feed.relatedTitle}>
      <h4 className="hub-related-title">{SOCIAL_UI.feed.relatedTitle}</h4>
      <div className="hub-feed-activity-list hub-related-list" role="list">
        {items.map((entry) => {
          const rating = Number(entry.rating || 0);
          // Igual que en la lista de reseñas: sin nota, medallón con interrogación y sin color de acento.
          const hasRating = rating > 0;
          const accent = reviewAccent(rating);
          // Firma en primera persona para lo propio: en un bloque donde el resto son terceros, es lo que
          // distingue de un vistazo lo que ya has escrito tú.
          const author = entry.isOwn ? SOCIAL_UI.feed.relatedOwn : entry.authorName;
          const reason = entry.reason === 'same-game'
            ? SOCIAL_UI.feed.relatedSameGame
            : entry.reason === 'same-author'
              ? (entry.isOwn ? SOCIAL_UI.feed.relatedSameAuthorOwn : SOCIAL_UI.feed.relatedSameAuthor(author))
              : entry.genre || '';

          return (
            <article
              key={entry.key}
              className={`hub-feed-card hub-feed-activity-item is-review hub-review-entry hub-related-entry ${hasRating ? '' : 'is-noscore'}`.trim()}
              role="listitem"
              style={hasRating ? ({ '--rev-hue': String(accent.hue), '--rev-ladj': `${accent.lightnessAdjust}%` } as CSSProperties) : undefined}
            >
              {/* Toda la tarjeta es pulsable; el botón cubre la superficie y se queda con el foco y el rótulo. */}
              <button
                type="button"
                className="hub-review-open"
                aria-label={SOCIAL_UI.feed.relatedOpenAria(entry.gameName, author)}
                onClick={() => onOpen(entry)}
              />
              <span className="hub-review-medal" aria-hidden="true">
                {hasRating
                  ? (scoreScale === 'grade'
                    ? Math.round(resolveGrade({ grade: entry.grade, score: rating }))
                    : Math.round(rating))
                  : '¿?'}
              </span>
              <header className="hub-review-entry-head">
                {entry.gameName ? <h5 className="hub-review-game">{entry.gameName}</h5> : null}
                <div className="hub-review-meta">
                  {author ? <span className="hub-feed-game-chip">{author}</span> : null}
                  {reason ? <span className="hub-related-reason">{reason}</span> : null}
                </div>
              </header>
              {entry.snippet ? (
                <div className="hub-review-body">
                  <p className="hub-feed-review-text hub-review-text">{entry.snippet}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
});
