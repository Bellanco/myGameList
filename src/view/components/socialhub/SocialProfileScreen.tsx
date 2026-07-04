import { Icon } from '../Icon';
import { SocialGameCardSelector } from '../SocialGameCardSelector';
import { HubAvatar } from './HubAvatar';
import type { SocialUiLabels } from '../../../core/constants/labels';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { MAX_SOCIAL_FAVORITES } from '../../../core/constants/uiConfig';
import type { TabId } from '../../../model/types/game';

/** Pantalla de edición de perfil social. */
export function SocialProfileScreen({
  SOCIAL_UI,
  profileName,
  setProfileName,
  favoriteSearch,
  setFavoriteSearch,
  favoriteGameIds,
  setFavoriteGameIds,
  completedGames,
  hydratingProfile,
  savingProfile,
  hasCreatedProfile,
  onSaveProfile,
  onSignOut,
  onBack,
  status,
  statusKind,
  toggleGameInSet,
  hiddenTabs,
  onHiddenTabsChange,
  hideReplayable,
  setHideReplayable,
  hideRetry,
  setHideRetry,
  hideGameTime,
  setHideGameTime,
  showPhoto,
  setShowPhoto,
  ownPhotoURL,
}: {
  SOCIAL_UI: SocialUiLabels;
  profileName: string;
  setProfileName: (v: string) => void;
  favoriteSearch: string;
  setFavoriteSearch: (v: string) => void;
  favoriteGameIds: number[];
  setFavoriteGameIds: (ids: number[]) => void;
  completedGames: Array<{ id: number; name: string }>;
  hydratingProfile: boolean;
  savingProfile: boolean;
  hasCreatedProfile: boolean;
  onSaveProfile: () => void;
  onSignOut: () => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  toggleGameInSet: (id: number, current: number[], setFn: (next: number[]) => void) => void;
  hiddenTabs: TabId[];
  onHiddenTabsChange: (next: TabId[]) => void;
  hideReplayable: boolean;
  setHideReplayable: (value: boolean) => void;
  hideRetry: boolean;
  setHideRetry: (value: boolean) => void;
  hideGameTime?: boolean;
  setHideGameTime?: (value: boolean) => void;
  showPhoto?: boolean;
  setShowPhoto?: (value: boolean) => void;
  ownPhotoURL?: string;
}) {
  const toggleHiddenTab = (tab: TabId) => {
    if (hiddenTabs.includes(tab)) {
      onHiddenTabsChange(hiddenTabs.filter((item) => item !== tab));
      return;
    }

    onHiddenTabsChange([...hiddenTabs, tab]);
  };

  // El botón "Atrás" solo se muestra cuando hasCreatedProfile es true: sin perfil creado, el usuario
  // debe crearlo antes de poder volver al feed.

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.profile.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-profile-card">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.profile.title}</h2>
            <span className={`hub-profile-sync-chip ${hasCreatedProfile ? 'is-synced' : ''}`}>
              <span className="dot" aria-hidden="true" />
              {hasCreatedProfile ? SOCIAL_UI.profile.statusSynced : SOCIAL_UI.profile.statusUnpublished}
            </span>
          </div>
          <p>{SOCIAL_UI.profile.subtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.profile.actionsAria}>
          <div className="hub-screen-actions-left">
            {hasCreatedProfile ? (
              <HubBackButton onBack={onBack} label={SOCIAL_UI.profile.toFeed} />
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={savingProfile || hydratingProfile || !profileName.trim() || favoriteGameIds.length === 0}
              onClick={onSaveProfile}
            >
              <Icon name="save" />
              {savingProfile ? SOCIAL_UI.profile.saving : SOCIAL_UI.profile.save}
            </button>
          </div>
          <div className="hub-screen-actions-right">
            <button className="btn btn-danger" type="button" onClick={onSignOut}>
              <Icon name="logout" />
              {SOCIAL_UI.profile.signOut}
            </button>
          </div>
        </div>
        <div className="hub-profile-layout">
          <article className="hub-profile-block hub-profile-identity">
            <div className="hub-block-head">
              <span className="hub-block-step">1</span>
              <h3>{SOCIAL_UI.profile.identityTitle}</h3>
            </div>
            <p>{SOCIAL_UI.profile.identityDescription}</p>
            <label className="flabel" htmlFor="hub-profile-name">{SOCIAL_UI.profile.nameLabel}</label>
            <div className="hub-identity-hero">
              <HubAvatar name={profileName || 'Usuario'} photoURL={showPhoto !== false ? ownPhotoURL : undefined} />
              <input
                id="hub-profile-name"
                className="finput"
                type="text"
                maxLength={60}
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder={SOCIAL_UI.profile.namePlaceholder}
              />
            </div>
          </article>
          <SocialGameCardSelector
            step={2}
            title={SOCIAL_UI.profile.favoritesTitle}
            description={SOCIAL_UI.profile.favoritesDescription}
            searchPlaceholder={SOCIAL_UI.profile.favoritesSearchPlaceholder}
            searchValue={favoriteSearch}
            selectedIds={favoriteGameIds}
            options={completedGames}
            emptyMessage={SOCIAL_UI.profile.searchEmpty}
            maxSelected={MAX_SOCIAL_FAVORITES}
            onSearchChange={setFavoriteSearch}
            onToggle={(id) => toggleGameInSet(id, favoriteGameIds, setFavoriteGameIds)}
          />
          <article className="hub-profile-block">
            <div className="hub-block-head">
              <span className="hub-block-step">3</span>
              <h3>{SOCIAL_UI.profile.visibilityTitle}</h3>
            </div>
            <p>{SOCIAL_UI.profile.visibilityDescription}</p>
            
            <div className="visibility-section">
              <span className="visibility-label">{SOCIAL_UI.profile.hideListSectionTitle}</span>
              <div className="visibility-group">
                <label className="visibility-check" htmlFor="hub-hide-list-v">
                  <input
                    id="hub-hide-list-v"
                    type="checkbox"
                    checked={hiddenTabs.includes('v')}
                    onChange={() => toggleHiddenTab('v')}
                  />
                  <span className="visibility-toggle-track" aria-hidden="true">
                    <span className="visibility-toggle-thumb" />
                  </span>
                  <span>{SOCIAL_UI.profile.hideVisitedList}</span>
                </label>
                <label className="visibility-check" htmlFor="hub-hide-list-e">
                  <input
                    id="hub-hide-list-e"
                    type="checkbox"
                    checked={hiddenTabs.includes('e')}
                    onChange={() => toggleHiddenTab('e')}
                  />
                  <span className="visibility-toggle-track" aria-hidden="true">
                    <span className="visibility-toggle-thumb" />
                  </span>
                  <span>{SOCIAL_UI.profile.hidePlayingList}</span>
                </label>
                <label className="visibility-check" htmlFor="hub-hide-list-p">
                  <input
                    id="hub-hide-list-p"
                    type="checkbox"
                    checked={hiddenTabs.includes('p')}
                    onChange={() => toggleHiddenTab('p')}
                  />
                  <span className="visibility-toggle-track" aria-hidden="true">
                    <span className="visibility-toggle-thumb" />
                  </span>
                  <span>{SOCIAL_UI.profile.hidePlannedList}</span>
                </label>
              </div>
            </div>

            <div className="visibility-section">
              <span className="visibility-label">{SOCIAL_UI.profile.hideFieldSectionTitle}</span>
              <div className="visibility-group">
                <label className="visibility-check" htmlFor="hub-hide-field-replayable">
                  <input
                    id="hub-hide-field-replayable"
                    type="checkbox"
                    checked={hideReplayable}
                    onChange={(event) => setHideReplayable(event.target.checked)}
                  />
                  <span className="visibility-toggle-track" aria-hidden="true">
                    <span className="visibility-toggle-thumb" />
                  </span>
                  <span>{SOCIAL_UI.profile.hideReplayableField}</span>
                </label>
                <label className="visibility-check" htmlFor="hub-hide-field-retry">
                  <input
                    id="hub-hide-field-retry"
                    type="checkbox"
                    checked={hideRetry}
                    onChange={(event) => setHideRetry(event.target.checked)}
                  />
                  <span className="visibility-toggle-track" aria-hidden="true">
                    <span className="visibility-toggle-thumb" />
                  </span>
                  <span>{SOCIAL_UI.profile.hideRetryField}</span>
                </label>
                {setHideGameTime ? (
                  <label className="visibility-check" htmlFor="hub-hide-field-gametime">
                    <input
                      id="hub-hide-field-gametime"
                      type="checkbox"
                      checked={hideGameTime || false}
                      onChange={(event) => setHideGameTime?.(event.target.checked)}
                    />
                    <span className="visibility-toggle-track" aria-hidden="true">
                      <span className="visibility-toggle-thumb" />
                    </span>
                    <span>{SOCIAL_UI.profile.hideGameTimeField}</span>
                  </label>
                ) : null}
              </div>
            </div>

            {setShowPhoto ? (
              <div className="visibility-section">
                <span className="visibility-label">{SOCIAL_UI.profile.photoSectionTitle}</span>
                <div className="visibility-group">
                  <label className="visibility-check" htmlFor="hub-show-photo">
                    <input
                      id="hub-show-photo"
                      type="checkbox"
                      checked={showPhoto !== false}
                      onChange={(event) => setShowPhoto?.(event.target.checked)}
                    />
                    <span className="visibility-toggle-track" aria-hidden="true">
                      <span className="visibility-toggle-thumb" />
                    </span>
                    <span>{SOCIAL_UI.profile.showPhotoField}</span>
                  </label>
                </div>
              </div>
            ) : null}
          </article>
          {hydratingProfile ? <p>{SOCIAL_UI.profile.hydrating}</p> : null}
        </div>
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
}

