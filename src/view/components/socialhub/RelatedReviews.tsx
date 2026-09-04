import { memo, type CSSProperties } from 'react';
import { resolveGrade, reviewAccent } from '../../../core/utils/scoreScale';
import { useScoreScale } from '../../hooks/useScoreScale';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { RelatedReview } from '../../../core/social/relatedReviews';

/**
 * Reseñas relacionadas al final de una reseña abierta: por dónde seguir leyendo.
 *
 * UNA LISTA MEZCLADA, SIN DECIR POR QUÉ ESTÁ CADA UNA. Llevaron un chip con el motivo —«Mismo juego», «Otra
 * tuya»— y sobraba: la tarjeta ya enseña el título y la firma, así que el motivo se lee solo, y escribirlo era
 * repetir con una etiqueta lo que estaba dos centímetros más arriba. El orden ya hace ese trabajo.
 *
 * DENSA A PROPÓSITO. Esto es el epílogo de la pantalla y su tarea es que quepan varias opciones de un vistazo,
 * no lucirse: una línea de texto, medallón pequeño y el mínimo aire entre tarjetas. Quien quiera leer una, la
 * abre.
 *
 * NO PINTA NADA SI NO HAY NADA. Un «no hay reseñas relacionadas» al final de cada reseña sería ruido en la
 * mayoría de las bibliotecas pequeñas, que es justo donde este bloque tiene menos que ofrecer.
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
              {/* Título y firma en un solo renglón: el autor va detrás del juego, separado por un punto, en vez
                  de en su propia línea. Es la mitad de alto por tarjeta y se lee igual de bien. */}
              <header className="hub-review-entry-head">
                <h5 className="hub-review-game">
                  {entry.gameName}
                  {author ? <span className="hub-related-author"> · {author}</span> : null}
                </h5>
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
