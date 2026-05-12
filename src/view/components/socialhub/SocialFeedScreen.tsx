import React from 'react';
import { Icon } from '../Icon';
import { StarRating } from '../StarRating';

/**
 * Pantalla principal del feed social.
 * Presentacional, sin lógica de negocio.
 */
export function SocialFeedScreen({
  SOCIAL_UI,
  socialDisplayName,
  currentSocialGistId,
  feedSearch,
  setFeedSearch,
  filteredSocialDirectory,
  loadingDirectory,
  hydrateSocialDirectory,
  openProfileDetail,
  handleProfileCardKeyDown,
  groupedActivityFeedItems,
  activityFeedItems,
  openActivityDetail,
  handleActivityItemKeyDown,
  isFeedDragging,
  feedRowRef,
  handleFeedRowMouseDown,
  handleFeedRowKeyDown,
  status,
  statusKind,
  handleSignOut
}: {
  SOCIAL_UI: any;
  socialDisplayName: string;
  currentSocialGistId: string;
  feedSearch: string;
  setFeedSearch: (v: string) => void;
  filteredSocialDirectory: any[];
  loadingDirectory: boolean;
  hydrateSocialDirectory: (forceRefresh?: boolean) => void;
  openProfileDetail: (id: string) => void;
  handleProfileCardKeyDown: (event: React.KeyboardEvent<HTMLElement>, id: string) => void;
  groupedActivityFeedItems: any[];
  activityFeedItems: any[];
  openActivityDetail: (entry: any) => void;
  handleActivityItemKeyDown: (event: React.KeyboardEvent<HTMLElement>, entry: any) => void;
  isFeedDragging: boolean;
  feedRowRef: React.RefObject<HTMLDivElement | null>;
  handleFeedRowMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleFeedRowKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  status: string;
  statusKind: string;
  handleSignOut: () => void;
}) {
  const formatAnalyzedAtLabel = (updatedAt: string) => {
    const updatedAtDate = new Date(updatedAt);
    if (Number.isNaN(updatedAtDate.getTime())) {
      return 'Analizado recientemente';
    }
    return `Analizado el ${updatedAtDate.toLocaleDateString('es-ES', { day: '2-digit' })} de ${updatedAtDate.toLocaleDateString('es-ES', { month: 'long' })} a las ${updatedAtDate.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}`;
  };

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.feed.title}</h2>
          </div>
          <p>{SOCIAL_UI.feed.subtitle}</p>
          <h3 className="hub-feed-owner">{socialDisplayName}</h3>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.actionsAria}>
          <div className="hub-screen-actions-left">
            <button className="btn btn-secondary" type="button" onClick={() => openProfileDetail('profile')}>
              <Icon name="edit" />
              {SOCIAL_UI.feed.profile}
            </button>
            <button className="btn btn-secondary" type="button" disabled={loadingDirectory} onClick={() => hydrateSocialDirectory(true)}>
              <Icon name="refresh" />
              {loadingDirectory ? SOCIAL_UI.feed.refreshing : SOCIAL_UI.feed.refresh}
            </button>
          </div>
          <div className="hub-screen-actions-right">
            <button className="btn btn-danger" type="button" onClick={handleSignOut}>
              <Icon name="logout" />
              {SOCIAL_UI.feed.signOut}
            </button>
          </div>
        </div>
        <div className="fg">
          <span className="flabel">{SOCIAL_UI.feed.activityTitle}</span>
          {!loadingDirectory && activityFeedItems.length === 0 ? <p>{SOCIAL_UI.feed.activityEmpty}</p> : null}
          {!loadingDirectory && activityFeedItems.length > 0 ? (
            <div className="hub-feed-activity-list" role="list" aria-label={SOCIAL_UI.feed.activityListAria}>
              {groupedActivityFeedItems.map((group, groupIndex) => (
                <div key={`${group.dayHeader}-${groupIndex}`} className="hub-feed-day-group">
                  <div className="hub-feed-day-header">
                    <h4>{group.dayHeader}</h4>
                  </div>
                  {group.items.map((entry: any) => {
                    const reviewText = entry.reviewText.trim();
                    const analyzedAtLabel = formatAnalyzedAtLabel(String(entry.updatedAt || ''));
                    const cardTypeClass = entry.type === 'review' ? 'is-review' : 'is-recommendation';
                    const ownershipClass = entry.socialGistId === currentSocialGistId ? 'is-own-activity' : 'is-external-activity';
                    return (
                      <article
                        key={entry.id}
                        className={`hub-feed-card hub-feed-activity-item ${cardTypeClass} ${ownershipClass}`}
                        role="listitem"
                        tabIndex={0}
                        aria-label={`Abrir detalle de actividad de ${entry.profileDisplayName} sobre ${entry.gameName}`}
                        onClick={() => openActivityDetail(entry)}
                        onKeyDown={(event) => handleActivityItemKeyDown(event, entry)}
                      >
                        <header>
                          <h3>{entry.profileDisplayName}</h3>
                          <small className="hub-feed-game-subtitle">{entry.gameName}</small>
                        </header>
                        <p>{analyzedAtLabel}</p>
                        <StarRating value={Number(entry.rating || 0)} />
                        {reviewText ? <p className="hub-feed-review-text" title={reviewText}>{reviewText}</p> : null}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="hub-feed-toolbar" aria-label={SOCIAL_UI.feed.toolbarAria}>
          <label className="hub-feed-search">
            <span>{SOCIAL_UI.feed.searchLabel}</span>
            <input
              type="text"
              className="finput"
              value={feedSearch}
              placeholder={SOCIAL_UI.feed.searchPlaceholder}
              onChange={(event) => setFeedSearch(event.target.value)}
            />
          </label>
          <p className="hub-feed-result-count">{SOCIAL_UI.feed.resultCount(filteredSocialDirectory.length)}</p>
        </div>
        <div className="fg">
          <span className="flabel">{SOCIAL_UI.feed.sectionTitle}</span>
          {loadingDirectory ? <p>{SOCIAL_UI.feed.loading}</p> : null}
          {!loadingDirectory && filteredSocialDirectory.length === 0 ? (
            <p>{SOCIAL_UI.feed.empty}</p>
          ) : null}
          {!loadingDirectory && filteredSocialDirectory.length > 0 ? (
            <div
              ref={feedRowRef}
              className={`hub-feed-row ${isFeedDragging ? 'is-dragging' : ''}`}
              aria-label={SOCIAL_UI.feed.feedRowAria}
              role="group"
              tabIndex={0}
              onMouseDown={handleFeedRowMouseDown}
              onKeyDown={handleFeedRowKeyDown}
            >
              {filteredSocialDirectory.map((entry) => (
                <article
                  key={entry.id}
                  className="hub-feed-card hub-feed-profile-item"
                  tabIndex={0}
                  aria-label={`Abrir perfil social de ${entry.displayName}`}
                  onClick={() => openProfileDetail(entry.id)}
                  onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
                >
                  <header>
                    <h3>{entry.displayName}</h3>
                  </header>
                  <p>
                    {entry.favorites.length
                      ? `${SOCIAL_UI.feed.favoritesPrefix}${entry.favorites.join(', ')}`
                      : SOCIAL_UI.feed.noFavorites}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

