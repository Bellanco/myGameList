import { Icon } from '../Icon';
import { StarRating } from '../StarRating';

/**
 * Pantalla de detalle de actividad social.
 * Presentacional, sin lógica de negocio.
 */
export function SocialDetailScreen({
  SOCIAL_UI,
  activeDetailEvent,
  getGameItemById,
  onOpenProfileDetail,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  activeDetailEvent: any;
  getGameItemById: (id: number) => any;
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
              <button className="btn btn-secondary" type="button" onClick={onBack}>
                <Icon name="arrow-back" />
                {SOCIAL_UI.feed.backToFeed}
              </button>
            </div>
          </div>
          <p>{SOCIAL_UI.feed.detailMissing}</p>
          {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
        </div>
      </section>
    );
  }
  const gameItem = getGameItemById(activeDetailEvent.gameId);
  const reviewText = String(activeDetailEvent.reviewText || '').trim();
  const updatedAtDate = new Date(activeDetailEvent.updatedAt);
  const hasValidUpdatedAt = !Number.isNaN(updatedAtDate.getTime());
  const analyzedAtLabel = hasValidUpdatedAt
    ? `Analizado el ${updatedAtDate.toLocaleDateString('es-ES', { day: '2-digit' })} de ${updatedAtDate.toLocaleDateString('es-ES', { month: 'long' })} a las ${updatedAtDate.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}`
    : 'Analizado recientemente';
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
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.feed.backToFeed}
            </button>
          </div>
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <header>
            <h3>
              <button
                className="hub-detail-profile-link"
                type="button"
                aria-label={`Abrir perfil social de ${activeDetailEvent.profileDisplayName}`}
                onClick={() => onOpenProfileDetail(activeDetailEvent.profileId)}
              >
                {activeDetailEvent.profileDisplayName}
              </button>
            </h3>
            <small className="hub-feed-game-subtitle">{activeDetailEvent.gameName}</small>
          </header>
          <p>{analyzedAtLabel}</p>
          <StarRating value={Number(activeDetailEvent.rating || 0)} />
          {reviewText ? <p className="hub-feed-review-text">{reviewText}</p> : null}
          {gameItem ? (
            <div className="hub-detail-metadata">
              {gameItem.platforms && gameItem.platforms.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataPlatforms}</strong>
                  <div className="hub-metadata-tags">
                    {gameItem.platforms.map((platform: string) => (
                      <span key={platform} className="hub-metadata-tag">{platform}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.genres && gameItem.genres.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataGenres}</strong>
                  <div className="hub-metadata-tags">
                    {gameItem.genres.map((genre: string) => (
                      <span key={genre} className="hub-metadata-tag">{genre}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.strengths && gameItem.strengths.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataStrengths}</strong>
                  <div className="chips">
                    {gameItem.strengths.map((strength: string) => (
                      <span key={strength} className="chip chip-pf">{strength}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.weaknesses && gameItem.weaknesses.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataWeaknesses}</strong>
                  <div className="chips">
                    {gameItem.weaknesses.map((weakness: string) => (
                      <span key={weakness} className="chip chip-pd">{weakness}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

