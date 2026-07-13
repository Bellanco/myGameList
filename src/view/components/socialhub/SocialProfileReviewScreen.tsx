import { Icon } from '../Icon';
import { ScoreDisplay } from '../ScoreDisplay';
import { NoScoreMedal } from '../NoScoreMedal';
import { resolveGrade } from '../../../core/utils/scoreScale';
import { MetaSection } from '../MetaSection';
import type { SocialUiLabels } from '../../../core/constants/labels';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';

/** Reseña de un juego abierta a pantalla completa desde la lista de reseñas de un perfil. */
export type ProfileReview = {
  id: number;
  name: string;
  review: string;
  score: number;
  grade: number | null;
  platforms: string[];
  genres: string[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
  hours: number | null;
  ts: number;
};

/**
 * Detalle de una reseña del perfil: nota, texto COMPLETO y metadatos (plataformas, géneros, puntos fuertes/débiles).
 * El botón de "volver" regresa a la lista de reseñas del perfil (no a la vista de favoritos).
 */
export function SocialProfileReviewScreen({
  SOCIAL_UI,
  review,
  profileName,
  onBack,
  status,
  statusKind,
}: {
  SOCIAL_UI: SocialUiLabels;
  review: ProfileReview | null;
  profileName: string;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  const header = (
    <>
      <header className="hub-screen-header">
        <div className="hub-hub-title-wrap">
          <Icon name="signature" className="hub-hub-icon" />
          <h2>{SOCIAL_UI.feed.reviewDetailTitle}</h2>
        </div>
        <p>{SOCIAL_UI.feed.reviewDetailSubtitle}</p>
      </header>
      <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
        <div className="hub-screen-actions-left">
          <HubBackButton onBack={onBack} label={SOCIAL_UI.feed.reviewsBackToList} />
        </div>
      </div>
    </>
  );

  if (!review) {
    return (
      <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          {header}
          <p>{SOCIAL_UI.feed.detailMissing}</p>
          <HubStatus status={status} statusKind={statusKind} />
        </div>
      </section>
    );
  }

  const hasScore = resolveGrade({ score: review.score, grade: review.grade }) > 0;
  const reviewDate = new Date(review.ts || 0);
  const hasValidDate = review.ts > 0 && !Number.isNaN(reviewDate.getTime());

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        {header}
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-feed-card-head-text">
            {review.name ? <h3 className="hub-review-detail-game">{review.name}</h3> : null}
            {profileName ? <span className="hub-feed-game-chip">{profileName}</span> : null}
          </div>
          {hasValidDate ? <p className="hub-feed-date">{SOCIAL_UI.feed.analyzedAt(reviewDate)}</p> : null}
          {hasScore ? <ScoreDisplay game={{ score: review.score, grade: review.grade }} /> : <NoScoreMedal />}
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
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
}
