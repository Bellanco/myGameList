import React from 'react';
import { Icon } from '../Icon';
import { HubAvatar } from './HubAvatar';
import { FriendshipButton } from './FriendshipButton';
import type { RelationshipState } from '../../../model/types/social';

/**
 * Pantalla de perfiles sociales (directorio).
 * Antes vivía como sección dentro del feed; ahora es una pantalla propia con su
 * filtro por nombre. Presentacional, sin lógica de negocio.
 */
export function SocialProfilesScreen({
  SOCIAL_UI,
  profileSearch,
  setProfileSearch,
  filteredSocialDirectory,
  loadingDirectory,
  openProfileDetail,
  handleProfileCardKeyDown,
  isFeedDragging,
  feedRowRef,
  handleFeedRowMouseDown,
  handleFeedRowKeyDown,
  relationshipWith,
  friendshipBusyUid,
  onAddOrAcceptFriend,
  onCancelFriendRequest,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  profileSearch: string;
  setProfileSearch: (v: string) => void;
  filteredSocialDirectory: any[];
  loadingDirectory: boolean;
  openProfileDetail: (id: string) => void;
  handleProfileCardKeyDown: (event: React.KeyboardEvent<HTMLElement>, id: string) => void;
  isFeedDragging: boolean;
  feedRowRef: React.RefObject<HTMLDivElement | null>;
  handleFeedRowMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleFeedRowKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  relationshipWith: (uid: string) => RelationshipState;
  friendshipBusyUid: string;
  onAddOrAcceptFriend: (uid: string) => void;
  onCancelFriendRequest: (uid: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  // Dos listas: amigos y no-amigos. La relación sale de `relationshipWith` (los amigos ya tienen sus favoritos del gist).
  const friendProfiles = filteredSocialDirectory.filter((entry) => relationshipWith(entry.uid) === 'friends');
  const otherProfiles = filteredSocialDirectory.filter((entry) => relationshipWith(entry.uid) !== 'friends');

  const renderProfileCard = (entry: any) => (
    <article
      key={entry.id}
      className="hub-feed-card hub-feed-profile-item"
      tabIndex={0}
      aria-label={SOCIAL_UI.profiles.openProfileAria(entry.displayName)}
      onClick={() => openProfileDetail(entry.id)}
      onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
    >
      <header className="hub-feed-card-head">
        <HubAvatar name={entry.displayName} photoURL={entry.photoURL} />
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
        <p>{SOCIAL_UI.profiles.noFavorites}</p>
      )}
      {/* La acción de amistad no debe abrir el detalle: se detiene la propagación del click/teclado. */}
      <div
        className="hub-card-friend-action"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="presentation"
      >
        <FriendshipButton
          SOCIAL_UI={SOCIAL_UI}
          state={relationshipWith(entry.uid)}
          name={entry.displayName}
          busy={friendshipBusyUid === entry.uid}
          onAddOrAccept={() => onAddOrAcceptFriend(entry.uid)}
          onCancel={() => onCancelFriendRequest(entry.uid)}
        />
      </div>
    </article>
  );

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.profiles.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.profiles.title}</h2>
          </div>
          <p>{SOCIAL_UI.profiles.subtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.profiles.actionsAria}>
          <div className="hub-screen-actions-left">
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.profiles.back}
            </button>
          </div>
        </div>

        <div className="hub-feed-toolbar" aria-label={SOCIAL_UI.profiles.toolbarAria}>
          <label className="hub-feed-search">
            <span>{SOCIAL_UI.profiles.searchLabel}</span>
            <input
              type="text"
              className="finput"
              value={profileSearch}
              placeholder={SOCIAL_UI.profiles.searchPlaceholder}
              onChange={(event) => setProfileSearch(event.target.value)}
            />
          </label>
          <p className="hub-feed-result-count">{SOCIAL_UI.profiles.resultCount(filteredSocialDirectory.length)}</p>
        </div>

        {loadingDirectory ? (
          <div className="fg"><p>{SOCIAL_UI.profiles.loading}</p></div>
        ) : filteredSocialDirectory.length === 0 ? (
          <div className="fg"><p>{SOCIAL_UI.profiles.empty}</p></div>
        ) : (
          <>
            <div className="fg">
              <span className="flabel">{SOCIAL_UI.profiles.friendsTitle}</span>
              {friendProfiles.length === 0 ? (
                <p>{SOCIAL_UI.profiles.friendsEmpty}</p>
              ) : (
                <div className="hub-feed-row" aria-label={SOCIAL_UI.profiles.friendsTitle} role="group">
                  {friendProfiles.map(renderProfileCard)}
                </div>
              )}
            </div>

            <div className="fg">
              <span className="flabel">{SOCIAL_UI.profiles.othersTitle}</span>
              {otherProfiles.length === 0 ? (
                <p>{SOCIAL_UI.profiles.othersEmpty}</p>
              ) : (
                <div
                  ref={feedRowRef}
                  className={`hub-feed-row ${isFeedDragging ? 'is-dragging' : ''}`}
                  aria-label={SOCIAL_UI.profiles.othersTitle}
                  role="group"
                  tabIndex={0}
                  onMouseDown={handleFeedRowMouseDown}
                  onKeyDown={handleFeedRowKeyDown}
                >
                  {otherProfiles.map(renderProfileCard)}
                </div>
              )}
            </div>
          </>
        )}
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}
