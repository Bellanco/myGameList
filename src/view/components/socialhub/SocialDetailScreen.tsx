import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import { HubAvatar } from './HubAvatar';

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
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.feed.backToFeed}
            </button>
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
              {/* FUTURO — campos adicionales del juego propio. Para mostrarlos, descomenta este bloque
                  (las labels ya existen en SOCIAL_UI.feed.metadataReasons/metadataYears/metadataHours/metadataFlags):
              {gameItem.reasons && gameItem.reasons.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataReasons}</strong>
                  <div className="chips">
                    {gameItem.reasons.map((reason: string) => (
                      <span key={reason} className="chip chip-pd">{reason}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.years && gameItem.years.length > 0 ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataYears}</strong>
                  <div className="hub-metadata-tags">
                    {gameItem.years.map((year: number) => (
                      <span key={year} className="hub-metadata-tag">{year}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {typeof gameItem.hours === 'number' ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataHours}</strong>
                  <div className="hub-metadata-tags">
                    <span className="hub-metadata-tag">{gameItem.hours}</span>
                  </div>
                </div>
              ) : null}
              {(gameItem.steamDeck || gameItem.replayable || gameItem.retry) ? (
                <div className="hub-metadata-section">
                  <strong>{SOCIAL_UI.feed.metadataFlags}</strong>
                  <div className="hub-metadata-tags">
                    {gameItem.steamDeck ? <span className="hub-metadata-tag">Steam Deck</span> : null}
                    {gameItem.replayable ? <span className="hub-metadata-tag">Rejugable</span> : null}
                    {gameItem.retry ? <span className="hub-metadata-tag">Reintentar</span> : null}
                  </div>
                </div>
              ) : null}
              */}
            </div>
          ) : null}
          </div>
        </article>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

