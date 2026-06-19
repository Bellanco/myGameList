import { Icon } from '../Icon';
import { SocialGameCardSelector } from '../SocialGameCardSelector';
import type { TabId } from '../../../model/types/game';

/**
 * Pantalla de edición de perfil social.
 * Presentacional, sin lógica de negocio.
 */
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
}: {
  SOCIAL_UI: any;
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
}) {
  const toggleHiddenTab = (tab: TabId) => {
    if (hiddenTabs.includes(tab)) {
      onHiddenTabsChange(hiddenTabs.filter((item) => item !== tab));
      return;
    }

    onHiddenTabsChange([...hiddenTabs, tab]);
  };

  // mustCreateProfile: when true, user must create/save profile before accessing feed.
  // onBack button will not be shown when mustCreateProfile is true (since hasCreatedProfile will be false)

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.profile.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-profile-card">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.profile.title}</h2>
          </div>
          <p>{SOCIAL_UI.profile.subtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.profile.actionsAria}>
          <div className="hub-screen-actions-left">
            {hasCreatedProfile ? (
              <button className="btn btn-secondary" type="button" onClick={onBack}>
                <Icon name="arrow-back" />
                {SOCIAL_UI.profile.toFeed}
              </button>
            ) : null}
            <button className="btn btn-primary" type="button" disabled={savingProfile || hydratingProfile} onClick={onSaveProfile}>
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
          <article className="hub-profile-block">
            <h3>{SOCIAL_UI.profile.identityTitle}</h3>
            <p>{SOCIAL_UI.profile.identityDescription}</p>
            <label className="flabel" htmlFor="hub-profile-name">{SOCIAL_UI.profile.nameLabel}</label>
            <input
              id="hub-profile-name"
              className="finput"
              type="text"
              maxLength={60}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder={SOCIAL_UI.profile.namePlaceholder}
            />
          </article>
          <SocialGameCardSelector
            title={SOCIAL_UI.profile.favoritesTitle}
            description={SOCIAL_UI.profile.favoritesDescription}
            searchPlaceholder={SOCIAL_UI.profile.favoritesSearchPlaceholder}
            searchValue={favoriteSearch}
            selectedIds={favoriteGameIds}
            options={completedGames}
            emptyMessage={SOCIAL_UI.profile.searchEmpty}
            onSearchChange={setFavoriteSearch}
            onToggle={(id) => toggleGameInSet(id, favoriteGameIds, setFavoriteGameIds)}
          />
          <article className="hub-profile-block">
            <h3>{SOCIAL_UI.profile.visibilityTitle}</h3>
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
          </article>
          {hydratingProfile ? <p>{SOCIAL_UI.profile.hydrating}</p> : null}
        </div>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

