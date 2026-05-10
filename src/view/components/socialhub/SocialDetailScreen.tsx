import React from 'react';
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
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  activeDetailEvent: any;
  getGameItemById: (id: number) => any;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  if (!activeDetailEvent) {
    return (
      <section className="social-hub social-screen" aria-label="Social">
        <div className="social-hub-card social-screen-card social-feed-card-shell">
          <header className="social-screen-header">
            <div className="social-hub-title-wrap">
              <Icon name="bottom-hub" className="social-hub-icon" />
              <h2>{SOCIAL_UI.feed.detailTitle}</h2>
            </div>
            <p>{SOCIAL_UI.feed.detailSubtitle}</p>
          </header>
          <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del detalle social">
            <div className="social-screen-actions-left">
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
  return (
    <section className="social-hub social-screen" aria-label="Social">
      <div className="social-hub-card social-screen-card social-feed-card-shell">
        <header className="social-screen-header">
          <div className="social-hub-title-wrap">
            <Icon name="bottom-hub" className="social-hub-icon" />
            <h2>{SOCIAL_UI.feed.detailTitle}</h2>
          </div>
          <p>{SOCIAL_UI.feed.detailSubtitle}</p>
        </header>
        <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del detalle social">
          <div className="social-screen-actions-left">
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.feed.backToFeed}
            </button>
          </div>
        </div>
        <article className="social-feed-card social-feed-card-detail">
          <header>
            <h3>{activeDetailEvent.profileDisplayName}</h3>
            <small>{new Date(activeDetailEvent.updatedAt).toLocaleString('es-ES')}</small>
          </header>
          <p>{SOCIAL_UI.feed.reviewHeadline(activeDetailEvent.gameName)}</p>
          <StarRating value={Number(activeDetailEvent.rating || 0)} />
          {activeDetailEvent.type === 'review' ? (
            <p>{activeDetailEvent.reviewText}</p>
          ) : activeDetailEvent.reviewText ? (
            <p>{activeDetailEvent.reviewText}</p>
          ) : null}
          {gameItem ? (
            <div className="social-detail-metadata">
              {gameItem.platforms && gameItem.platforms.length > 0 ? (
                <div className="social-metadata-section">
                  <strong>Plataformas:</strong>
                  <div className="social-metadata-tags">
                    {gameItem.platforms.map((platform: string) => (
                      <span key={platform} className="social-metadata-tag">{platform}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.genres && gameItem.genres.length > 0 ? (
                <div className="social-metadata-section">
                  <strong>Géneros:</strong>
                  <div className="social-metadata-tags">
                    {gameItem.genres.map((genre: string) => (
                      <span key={genre} className="social-metadata-tag">{genre}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.strengths && gameItem.strengths.length > 0 ? (
                <div className="social-metadata-section">
                  <strong>Puntos fuertes:</strong>
                  <div className="chips">
                    {gameItem.strengths.map((strength: string) => (
                      <span key={strength} className="chip chip-pf">{strength}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {gameItem.weaknesses && gameItem.weaknesses.length > 0 ? (
                <div className="social-metadata-section">
                  <strong>Puntos débiles:</strong>
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
