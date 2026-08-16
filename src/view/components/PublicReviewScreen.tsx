import { memo, useEffect, useState } from 'react';
import { SHARE_UI, SOCIAL_UI } from '../../core/constants/labels';
import { MetaSection } from './MetaSection';
import { NoScoreMedal } from './NoScoreMedal';
import { ScoreDisplay } from './ScoreDisplay';
import { readSharedReview } from '../../model/repository/publicShareRepository';
import type { SharedReview } from '../../model/types/share';

/**
 * Página que ve quien abre un enlace compartido (`/r/:token`).
 *
 * NAVEGACIÓN CERRADA cuando no hay cuenta (`standalone`): sin cromo, sin botón de volver, y el nick del autor es
 * TEXTO PLANO, nunca un enlace — su perfil social no es público y no puede alcanzarse desde aquí. La única
 * salida es un enlace explícito a la app, que el visitante pulsa si quiere. Tampoco hay foto de perfil: no viaja
 * en el artículo (ver `model/types/share.ts`), así que no hay nada que ocultar aquí.
 *
 * Los tres finales malos —no existe, caducado, retirado— comparten pantalla y texto: ante un desconocido no hay
 * motivo para distinguirlos, y saber "esto existió" ya es información.
 */
export const PublicReviewScreen = memo(function PublicReviewScreen({ token, standalone = false }: { token: string; standalone?: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [review, setReview] = useState<SharedReview | null>(null);

  useEffect(() => {
    let alive = true;
    void readSharedReview(token).then((article) => {
      if (!alive) {
        return;
      }
      setReview(article);
      setState(article ? 'ready' : 'gone');
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const cta = (
    <p className="share-public-cta">
      <a href="/">{SHARE_UI.publicCta}</a>
    </p>
  );

  if (state === 'loading') {
    return (
      <section className={`hub-hub hub-screen${standalone ? ' share-public' : ''}`} aria-label={SHARE_UI.publicAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <p>{SHARE_UI.publicLoading}</p>
        </div>
      </section>
    );
  }

  if (state === 'gone' || !review) {
    return (
      <section className={`hub-hub hub-screen${standalone ? ' share-public' : ''}`} aria-label={SHARE_UI.publicAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <h2>{SHARE_UI.publicGoneTitle}</h2>
          <p>{SHARE_UI.publicGoneBody}</p>
          {cta}
        </div>
      </section>
    );
  }

  const hasScore = typeof review.grade === 'number' || typeof review.rating === 'number';
  const reviewedAt = new Date(review.reviewedAt || 0);
  const hasValidDate = (review.reviewedAt || 0) > 0 && !Number.isNaN(reviewedAt.getTime());

  return (
    <section className={`hub-hub hub-screen${standalone ? ' share-public' : ''}`} aria-label={SHARE_UI.publicAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-feed-card-head-text">
            <h3 className="hub-review-detail-game">{review.gameName}</h3>
            {/* Texto plano, NUNCA un enlace: el perfil del autor no es público. */}
            {review.authorNick ? <span className="hub-feed-game-chip">{review.authorNick}</span> : null}
          </div>
          {hasValidDate ? <p className="hub-feed-date">{SOCIAL_UI.feed.analyzedAt(reviewedAt)}</p> : null}
          {hasScore ? <ScoreDisplay game={{ score: review.rating ?? 0, grade: review.grade }} /> : <NoScoreMedal />}
          <div className="hub-detail-body">
            {review.review ? <p className="hub-feed-review-text">{review.review}</p> : null}
            <div className="hub-detail-metadata">
              <MetaSection label={SOCIAL_UI.feed.metadataPlatforms} items={review.platforms} cls="chip-plat" />
              <MetaSection label={SOCIAL_UI.feed.metadataGenres} items={review.genres} cls="chip-genre" />
              <MetaSection label={SOCIAL_UI.feed.metadataStrengths} items={review.strengths} cls="chip-pf" />
              <MetaSection label={SOCIAL_UI.feed.metadataWeaknesses} items={review.weaknesses} cls="chip-pd" />
            </div>
          </div>
        </article>
        <p className="share-public-notice">{SHARE_UI.publicNotice}</p>
        {standalone ? cta : null}
      </div>
    </section>
  );
});
