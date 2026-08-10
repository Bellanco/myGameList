import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import { useScoreScale } from '../../hooks/useScoreScale';
import { resolveGrade } from '../../../core/utils/scoreScale';
import type { SocialUiLabels } from '../../../core/constants/labels';

/** Lote inicial; se amplía por scroll infinito para no pintar cien reseñas de golpe. */
const REVIEW_PAGE_SIZE = 8;

/** Una reseña en la lista, venga del perfil de otro (snippet) o del tuyo (texto completo). */
export interface ReviewEntry {
  id: number;
  gameName: string;
  rating: number;
  grade: number | null;
  reviewText: string;
  ts: number;
}

interface ProfileReviewsListProps {
  SOCIAL_UI: SocialUiLabels;
  reviews: ReviewEntry[];
  onOpenReview: (gameId: number) => void;
  /** Texto cuando el perfil no tiene ninguna reseña. */
  emptyLabel?: string;
}

/**
 * Lista de reseñas con filtro por título y scroll infinito.
 *
 * Vive fuera de la pantalla del perfil social porque la usan DOS sitios: ese perfil y el panel de estadísticas,
 * que enlaza a tus propias reseñas. Son rutas distintas y datos distintos —ahí llegan por el canal social, aquí
 * salen de tus listas—, pero la lista es la misma y no tiene sentido mantener dos.
 */
export const ProfileReviewsList = memo(function ProfileReviewsList({
  SOCIAL_UI,
  reviews,
  onOpenReview,
  emptyLabel,
}: ProfileReviewsListProps) {
  const scoreScale = useScoreScale();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(REVIEW_PAGE_SIZE);
  const sentinelRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((review) => review.gameName.toLowerCase().includes(q));
  }, [reviews, query]);

  useEffect(() => {
    setVisibleCount(REVIEW_PAGE_SIZE);
  }, [query, reviews]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = filtered.length > visibleCount;

  // Scroll infinito: el botón "mostrar más" hace de centinela; al entrar en pantalla amplía el lote y sigue
  // siendo pulsable como alternativa accesible.
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((prev) => prev + REVIEW_PAGE_SIZE);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered]);

  if (reviews.length === 0) {
    return <p>{emptyLabel || SOCIAL_UI.feed.reviewsEmptyProfile}</p>;
  }

  return (
    <>
      <input
        type="text"
        className="input-base hub-game-filter"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={SOCIAL_UI.feed.gameFilterPlaceholder}
        aria-label={SOCIAL_UI.feed.gameFilterPlaceholder}
      />

      {filtered.length === 0 ? (
        <p className="hub-game-filter-empty">{SOCIAL_UI.feed.gameFilterEmpty}</p>
      ) : (
        <div className="hub-feed-activity-list hub-profile-reviews-list" role="list" aria-label={SOCIAL_UI.feed.reviewsTitle}>
          {visible.map((review) => {
            const rating = Number(review.rating || 0);
            // Reseña sin puntuación (p. ej. juegos de la lista de la vergüenza): medallón con un icono en vez
            // del número y sin estrellas.
            const hasRating = rating > 0;
            const itemDate = new Date(review.ts || 0);
            const hasValidDate = review.ts > 0 && !Number.isNaN(itemDate.getTime());
            // Color por nota: 1=rojo, 2=amarillo; 3/4/5 bien separados en tono y en luminosidad.
            const rScore = Math.max(1, Math.min(5, Math.round(rating)));
            const reviewHue = [0, 4, 50, 82, 120, 156][rScore];
            const reviewLAdj = [0, 0, 0, 10, 5, 0][rScore];
            return (
              <article
                key={review.id}
                className={`hub-feed-card hub-feed-activity-item is-review hub-review-entry ${hasRating ? '' : 'is-noscore'}`.trim()}
                role="listitem"
                style={hasRating ? ({ '--rev-hue': String(reviewHue), '--rev-ladj': `${reviewLAdj}%` } as CSSProperties) : undefined}
              >
                {/* Tarjeta pulsable: abre el detalle de la reseña (todo el análisis) con vuelta a esta lista. */}
                <button
                  type="button"
                  className="hub-review-open"
                  aria-label={SOCIAL_UI.feed.reviewOpenAria(review.gameName || '')}
                  onClick={() => onOpenReview(review.id)}
                />
                <span className="hub-review-medal" aria-hidden="true">
                  {hasRating ? (scoreScale === 'grade' ? Math.round(resolveGrade({ grade: review.grade, score: rating })) : Math.round(rating)) : '¿?'}
                </span>
                <header className="hub-review-entry-head">
                  {review.gameName ? <h4 className="hub-review-game">{review.gameName}</h4> : null}
                  <div className="hub-review-meta">
                    {hasRating && scoreScale !== 'grade' ? <StarRating value={rating} /> : null}
                    {hasValidDate ? (
                      <span className="hub-review-date">
                        {itemDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    ) : null}
                  </div>
                </header>
                {review.reviewText ? (
                  <div className="hub-review-body">
                    <p className="hub-feed-review-text hub-review-text">{review.reviewText}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button
          ref={sentinelRef}
          className="hub-more-soft hub-feed-load-more"
          type="button"
          aria-label={SOCIAL_UI.feed.feedLoadMore}
          title={SOCIAL_UI.feed.feedLoadMore}
          onClick={() => setVisibleCount((prev) => prev + REVIEW_PAGE_SIZE)}
        >
          <Icon name="chevron-down" />
        </button>
      ) : null}
    </>
  );
});
