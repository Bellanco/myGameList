import React from 'react';
import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import { PostText } from './PostText';
import { avatarInitial, avatarTone } from './avatar';
import { POST_MAX_LENGTH } from '../../../core/security/sanitize';

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
  groupedFeedItems,
  feedItems,
  hasMoreFeed,
  showMoreFeed,
  openActivityDetail,
  handleActivityItemKeyDown,
  composePostText,
  setComposePostText,
  publishingPost,
  handlePublishPost,
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
  groupedFeedItems: any[];
  feedItems: any[];
  hasMoreFeed: boolean;
  showMoreFeed: () => void;
  openActivityDetail: (entry: any) => void;
  handleActivityItemKeyDown: (event: React.KeyboardEvent<HTMLElement>, entry: any) => void;
  composePostText: string;
  setComposePostText: (v: string) => void;
  publishingPost: boolean;
  handlePublishPost: () => void;
  isFeedDragging: boolean;
  feedRowRef: React.RefObject<HTMLDivElement | null>;
  handleFeedRowMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleFeedRowKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  status: string;
  statusKind: string;
  handleSignOut: () => void;
}) {


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
          <span className="flabel">{SOCIAL_UI.feed.postsTitle}</span>
          <div className="hub-post-composer">
            <label className="sr-only" htmlFor="hub-post-text">{SOCIAL_UI.feed.postComposerLabel}</label>
            <input
              id="hub-post-text"
              type="text"
              className="finput hub-post-input"
              value={composePostText}
              placeholder={SOCIAL_UI.feed.postPlaceholder}
              maxLength={POST_MAX_LENGTH}
              onChange={(event) => setComposePostText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (!publishingPost && composePostText.trim()) handlePublishPost();
                }
              }}
            />
            <button
              className="btn btn-steam hub-post-publish"
              type="button"
              disabled={publishingPost || !composePostText.trim()}
              onClick={handlePublishPost}
              aria-label={publishingPost ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
              title={publishingPost ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
            >
              <Icon name="edit" />
            </button>
          </div>
        </div>
        <div className="fg">
          <span className="flabel">{SOCIAL_UI.feed.activityTitle}</span>
          {loadingDirectory ? (
            <div className="hub-feed-activity-list" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <article key={i} className="hub-feed-card hub-feed-activity-item hub-skeleton-card">
                  <header className="hub-feed-card-head">
                    <span className="hub-avatar hub-skeleton" />
                    <div className="hub-feed-card-head-text">
                      <span className="hub-skeleton hub-skeleton-line" style={{ width: '45%' }} />
                    </div>
                  </header>
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '30%' }} />
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '92%' }} />
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '70%' }} />
                </article>
              ))}
            </div>
          ) : null}
          {!loadingDirectory && feedItems.length === 0 ? <p>{SOCIAL_UI.feed.activityEmpty}</p> : null}
          {!loadingDirectory && feedItems.length > 0 ? (
            <div className="hub-feed-activity-list" role="list" aria-label={SOCIAL_UI.feed.activityListAria}>
              {groupedFeedItems.map((group, groupIndex) => (
                <div key={`${group.dayHeader}-${groupIndex}`} className="hub-feed-day-group">
                  <div className="hub-feed-day-header">
                    <h4>{group.dayHeader}</h4>
                  </div>
                  {group.items.map((entry: any) => {
                    const itemDate = new Date(entry.updatedAt || '');
                    const hasValidDate = !Number.isNaN(itemDate.getTime());
                    const ownershipClass = entry.socialGistId === currentSocialGistId ? 'is-own-activity' : 'is-external-activity';

                    if (entry.kind === 'post') {
                      return (
                        <article
                          key={entry.id}
                          className={`hub-feed-card hub-feed-activity-item is-post ${ownershipClass}`}
                          role="listitem"
                        >
                          <header className="hub-feed-card-head">
                            <button
                              className="hub-avatar-link"
                              type="button"
                              aria-label={SOCIAL_UI.feed.openProfileAria(entry.profileDisplayName || entry.authorName)}
                              onClick={() => openProfileDetail(entry.profileId)}
                            >
                              {entry.photoURL ? (
                                <img className="hub-avatar hub-avatar-img" src={entry.photoURL} alt="" referrerPolicy="no-referrer" />
                              ) : (
                                <span className={`hub-avatar hub-avatar--${avatarTone(entry.profileDisplayName || entry.authorName)}`} aria-hidden="true">
                                  {avatarInitial(entry.profileDisplayName || entry.authorName)}
                                </span>
                              )}
                            </button>
                            <div className="hub-feed-card-head-text">
                              <h3>
                                <button className="hub-name-link" type="button" onClick={() => openProfileDetail(entry.profileId)}>
                                  {entry.profileDisplayName || entry.authorName || 'Usuario'}
                                </button>
                              </h3>
                            </div>
                          </header>
                          <p>{hasValidDate ? SOCIAL_UI.feed.postedAt(itemDate) : SOCIAL_UI.feed.analyzedRecently}</p>
                          <p className="hub-post-text"><PostText text={entry.text} /></p>
                        </article>
                      );
                    }

                    const reviewText = String(entry.snippet || '').trim();
                    const analyzedAtLabel = hasValidDate
                      ? SOCIAL_UI.feed.analyzedAt(itemDate)
                      : SOCIAL_UI.feed.analyzedRecently;
                    const cardTypeClass = entry.type === 'review' ? 'is-review' : 'is-recommendation';
                    return (
                      <article
                        key={entry.id}
                        className={`hub-feed-card hub-feed-activity-item ${cardTypeClass} ${ownershipClass}`}
                        role="listitem"
                        tabIndex={0}
                        aria-label={SOCIAL_UI.feed.openActivityAria(entry.profileDisplayName, entry.gameName)}
                        onClick={() => openActivityDetail(entry)}
                        onKeyDown={(event) => handleActivityItemKeyDown(event, entry)}
                      >
                        <header className="hub-feed-card-head">
                          <button
                            className="hub-avatar-link"
                            type="button"
                            aria-label={SOCIAL_UI.feed.openProfileAria(entry.profileDisplayName)}
                            onClick={(event) => { event.stopPropagation(); openProfileDetail(entry.profileId); }}
                          >
                            {entry.photoURL ? (
                              <img className="hub-avatar hub-avatar-img" src={entry.photoURL} alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <span className={`hub-avatar hub-avatar--${avatarTone(entry.profileDisplayName)}`} aria-hidden="true">
                                {avatarInitial(entry.profileDisplayName)}
                              </span>
                            )}
                          </button>
                          <div className="hub-feed-card-head-text">
                            <h3>
                              <button
                                className="hub-name-link"
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openProfileDetail(entry.profileId); }}
                              >
                                {entry.profileDisplayName}
                              </button>
                            </h3>
                            {entry.gameName ? <span className="hub-feed-game-chip">{entry.gameName}</span> : null}
                          </div>
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
          {!loadingDirectory && hasMoreFeed ? (
            <button className="btn btn-secondary hub-feed-load-more" type="button" onClick={showMoreFeed}>
              {SOCIAL_UI.feed.feedLoadMore}
            </button>
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
                  aria-label={SOCIAL_UI.feed.openProfileAria(entry.displayName)}
                  onClick={() => openProfileDetail(entry.id)}
                  onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
                >
                  <header className="hub-feed-card-head">
                    {entry.photoURL ? (
                      <img className="hub-avatar hub-avatar-img" src={entry.photoURL} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className={`hub-avatar hub-avatar--${avatarTone(entry.displayName)}`} aria-hidden="true">
                        {avatarInitial(entry.displayName)}
                      </span>
                    )}
                    <div className="hub-feed-card-head-text">
                      <h3>{entry.displayName}</h3>
                    </div>
                  </header>
                  {entry.favorites.length ? (
                    <div className="hub-profile-fav-chips">
                      {entry.favorites.map((name: string, i: number) => (
                        <span key={`${name}-${i}`} className="hub-feed-game-chip">{name}</span>
                      ))}
                    </div>
                  ) : (
                    <p>{SOCIAL_UI.feed.noFavorites}</p>
                  )}
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

