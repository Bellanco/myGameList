import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import { MetaSection } from '../MetaSection';
import { HubAvatar } from './HubAvatar';
import type { SocialUiLabels } from '../../../core/constants/labels';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';

/** Pantalla de detalle de actividad social. */
export function SocialDetailScreen({
  SOCIAL_UI,
  activeDetailEvent,
  getGameItemById,
  onOpenProfileDetail,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: SocialUiLabels;
  activeDetailEvent: any;
  getGameItemById: (profileId: string, id: number) => any;
  onOpenProfileDetail: (id: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  if (!activeDetailEvent) {
    return (
      <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <header className="hub-screen-header">
            <div className="hub-hub-title-wrap">
              <Icon name="bottom-hub" className="hub-hub-icon" />
              <h2>{SOCIAL_UI.feed.detailTitle}</h2>
            </div>
            <p>{SOCIAL_UI.feed.detailSubtitle}</p>
          </header>
          <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
            <div className="hub-screen-actions-left">
              <HubBackButton onBack={onBack} label={SOCIAL_UI.feed.backToFeed} />
            </div>
          </div>
          <p>{SOCIAL_UI.feed.detailMissing}</p>
          <HubStatus status={status} statusKind={statusKind} />
        </div>
      </section>
    );
  }
  const gameItem = getGameItemById(activeDetailEvent.profileId, activeDetailEvent.gameId);
  // Reseña COMPLETA para juegos propios (gameItem.review); para eventos ajenos cae al snippet (≤160) del evento.
  const reviewText = String((gameItem?.review ?? activeDetailEvent.snippet) || '').trim();
  const updatedAtDate = new Date(activeDetailEvent.updatedAt);
  const hasValidUpdatedAt = !Number.isNaN(updatedAtDate.getTime());
  const analyzedAtLabel = hasValidUpdatedAt
    ? SOCIAL_UI.feed.analyzedAt(updatedAtDate)
    : SOCIAL_UI.feed.analyzedRecently;
  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.feed.detailTitle}</h2>
          </div>
          <p>{SOCIAL_UI.feed.detailSubtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={SOCIAL_UI.feed.backToFeed} />
          </div>
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <header className="hub-feed-card-head">
            <button
              className="hub-avatar-link"
              type="button"
              aria-label={SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName)}
              onClick={() => onOpenProfileDetail(activeDetailEvent.profileId)}
            >
              <HubAvatar name={activeDetailEvent.profileDisplayName} photoURL={activeDetailEvent.photoURL} />
            </button>
            <div className="hub-feed-card-head-text">
              <h3>
                <button
                  className="hub-detail-profile-link"
                  type="button"
                  aria-label={SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName)}
                  onClick={() => onOpenProfileDetail(activeDetailEvent.profileId)}
                >
                  {activeDetailEvent.profileDisplayName}
                </button>
              </h3>
              {activeDetailEvent.gameName ? <span className="hub-feed-game-chip">{activeDetailEvent.gameName}</span> : null}
            </div>
          </header>
          <p>{analyzedAtLabel}</p>
          <StarRating value={Number(activeDetailEvent.rating || 0)} />
          <div className="hub-detail-body">
          {reviewText ? <p className="hub-feed-review-text">{reviewText}</p> : null}
          {gameItem ? (
            <div className="hub-detail-metadata">
              <MetaSection label={SOCIAL_UI.feed.metadataPlatforms} items={gameItem.platforms} cls="chip-plat" />
              <MetaSection label={SOCIAL_UI.feed.metadataGenres} items={gameItem.genres} cls="chip-genre" />
              <MetaSection label={SOCIAL_UI.feed.metadataStrengths} items={gameItem.strengths} cls="chip-pf" />
              <MetaSection label={SOCIAL_UI.feed.metadataWeaknesses} items={gameItem.weaknesses} cls="chip-pd" />
            </div>
          ) : null}
          </div>
        </article>
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
}

