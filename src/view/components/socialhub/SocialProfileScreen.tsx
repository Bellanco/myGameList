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

  return (
    <section className="social-hub social-screen" aria-label="Social">
      <div className="social-hub-card social-screen-card social-profile-card">
        <header className="social-screen-header">
          <div className="social-hub-title-wrap">
            <Icon name="bottom-hub" className="social-hub-icon" />
            <h2>{SOCIAL_UI.profile.title}</h2>
          </div>
          <p>{SOCIAL_UI.profile.subtitle}</p>
        </header>
        <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del perfil social">
          <div className="social-screen-actions-left">
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
          <div className="social-screen-actions-right">
            <button className="btn btn-danger" type="button" onClick={onSignOut}>
              <Icon name="logout" />
              {SOCIAL_UI.profile.signOut}
            </button>
          </div>
        </div>
        <div className="social-profile-layout">
          <article className="social-profile-block">
            <h3>{SOCIAL_UI.profile.identityTitle}</h3>
            <p>{SOCIAL_UI.profile.identityDescription}</p>
            <label className="flabel" htmlFor="social-profile-name">{SOCIAL_UI.profile.nameLabel}</label>
            <input
              id="social-profile-name"
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
          <article className="social-profile-block">
            <h3>{SOCIAL_UI.profile.visibilityTitle}</h3>
            <p>{SOCIAL_UI.profile.visibilityDescription}</p>
            
            <div className="visibility-section">
              <span className="visibility-label">{SOCIAL_UI.profile.hideListSectionTitle}</span>
              <div className="visibility-group">
                <label className="visibility-check" htmlFor="social-hide-list-v">
                  <input
                    id="social-hide-list-v"
                    type="checkbox"
                    checked={hiddenTabs.includes('v')}
                    onChange={() => toggleHiddenTab('v')}
                  />
                  <span>{SOCIAL_UI.profile.hideVisitedList}</span>
                </label>
                <label className="visibility-check" htmlFor="social-hide-list-e">
                  <input
                    id="social-hide-list-e"
                    type="checkbox"
                    checked={hiddenTabs.includes('e')}
                    onChange={() => toggleHiddenTab('e')}
                  />
                  <span>{SOCIAL_UI.profile.hidePlayingList}</span>
                </label>
                <label className="visibility-check" htmlFor="social-hide-list-p">
                  <input
                    id="social-hide-list-p"
                    type="checkbox"
                    checked={hiddenTabs.includes('p')}
                    onChange={() => toggleHiddenTab('p')}
                  />
                  <span>{SOCIAL_UI.profile.hidePlannedList}</span>
                </label>
              </div>
            </div>

            <div className="visibility-section">
              <span className="visibility-label">{SOCIAL_UI.profile.hideFieldSectionTitle}</span>
              <div className="visibility-group">
                <label className="visibility-check" htmlFor="social-hide-field-replayable">
                  <input
                    id="social-hide-field-replayable"
                    type="checkbox"
                    checked={hideReplayable}
                    onChange={(event) => setHideReplayable(event.target.checked)}
                  />
                  <span>{SOCIAL_UI.profile.hideReplayableField}</span>
                </label>
                <label className="visibility-check" htmlFor="social-hide-field-retry">
                  <input
                    id="social-hide-field-retry"
                    type="checkbox"
                    checked={hideRetry}
                    onChange={(event) => setHideRetry(event.target.checked)}
                  />
                  <span>{SOCIAL_UI.profile.hideRetryField}</span>
                </label>
                {setHideGameTime ? (
                  <label className="visibility-check" htmlFor="social-hide-field-gametime">
                    <input
                      id="social-hide-field-gametime"
                      type="checkbox"
                      checked={hideGameTime || false}
                      onChange={(event) => setHideGameTime?.(event.target.checked)}
                    />
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
