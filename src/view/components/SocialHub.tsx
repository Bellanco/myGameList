import { memo } from 'react';
import { SOCIAL_UI } from '../../core/constants/labels';
import { useSocialViewModel } from '../../viewmodel/useSocialViewModel';
import { Icon } from './Icon';

import { SocialProfileScreen } from './socialhub/SocialProfileScreen';
import { SocialDetailScreen } from './socialhub/SocialDetailScreen';
import { SocialProfileDetailScreen } from './socialhub/SocialProfileDetailScreen';
import { SocialFeedScreen } from './socialhub/SocialFeedScreen';

/**
 * Hub social - Fase 1.
 *
 * Requisitos cubiertos:
 * - Gist social separado (nuevo gist)
 * - Login Google habilitado solo cuando existe gist social
 * - Pantalla social vacia tras autenticacion
 *
 * Componente PRESENTACIONAL: toda la lógica vive en `useSocialViewModel` (M3).
 */
export const SocialHub = memo(function SocialHub() {
  const {
    navigate,
    activePanel,
    socialCfgGistId,
    authUser,
    loading,
    status,
    statusKind,
    showSocialSpace,
    hasCreatedProfile,
    profileName,
    setProfileName,
    favoriteGameIds,
    setFavoriteGameIds,
    hiddenTabs,
    setHiddenTabs,
    hideReplayable,
    setHideReplayable,
    hideRetry,
    setHideRetry,
    hideGameTime,
    setHideGameTime,
    favoriteSearch,
    setFavoriteSearch,
    feedSearch,
    setFeedSearch,
    composePostText,
    setComposePostText,
    publishingPost,
    handlePublishPost,
    hydratingProfile,
    savingProfile,
    loadingDirectory,
    isFeedDragging,
    feedRowRef,
    hasMainSync,
    hasSocialGist,
    hasSocialSession,
    gatewaySteps,
    currentStep,
    gatewayProgress,
    completedGames,
    socialDisplayName,
    filteredSocialDirectory,
    selectedProfileDetail,
    feedItems,
    activeDetailEvent,
    getGameItemById,
    groupedFeedItems,
    handleFeedRowMouseDown,
    handleFeedRowKeyDown,
    openActivityDetail,
    openProfileDetail,
    handleActivityItemKeyDown,
    handleProfileCardKeyDown,
    hydrateSocialDirectory,
    toggleGameInSet,
    handleSaveProfile,
    handleSignOut,
    primaryGatewayCta,
  } = useSocialViewModel();

  if (loading) {
    return (
      <section className="hub-hub hub-hub-gateway" aria-label={SOCIAL_UI.screenAria}>
        <div className="hub-hub-card hub-hub-gateway-card">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.hubTitle}</h2>
          </div>
          <p>{SOCIAL_UI.loading}</p>
        </div>
      </section>
    );
  }

  if (showSocialSpace && authUser) {
    if (activePanel === 'profile') {
      return (
        <SocialProfileScreen
          SOCIAL_UI={SOCIAL_UI}
          profileName={profileName}
          setProfileName={setProfileName}
          favoriteSearch={favoriteSearch}
          setFavoriteSearch={setFavoriteSearch}
          favoriteGameIds={favoriteGameIds}
          setFavoriteGameIds={setFavoriteGameIds}
          completedGames={completedGames}
          hydratingProfile={hydratingProfile}
          savingProfile={savingProfile}
          hasCreatedProfile={hasCreatedProfile}
          onSaveProfile={handleSaveProfile}
          onSignOut={handleSignOut}
          onBack={() => navigate('/social')}
          status={status}
          statusKind={statusKind}
          toggleGameInSet={toggleGameInSet}
          hiddenTabs={hiddenTabs}
          onHiddenTabsChange={setHiddenTabs}
          hideReplayable={hideReplayable}
          setHideReplayable={setHideReplayable}
          hideRetry={hideRetry}
          setHideRetry={setHideRetry}
            hideGameTime={hideGameTime}
            setHideGameTime={setHideGameTime}
        />
      );
    }
    if (activePanel === 'detail') {
      return (
        <SocialDetailScreen
          SOCIAL_UI={SOCIAL_UI}
          activeDetailEvent={activeDetailEvent}
          getGameItemById={getGameItemById}
          onOpenProfileDetail={openProfileDetail}
          onBack={() => navigate('/social')}
          status={status}
          statusKind={statusKind}
        />
      );
    }
    if (activePanel === 'profile-detail') {
      return (
        <SocialProfileDetailScreen
          SOCIAL_UI={SOCIAL_UI}
          activeProfileDetail={selectedProfileDetail}
          onBack={() => navigate('/social')}
          status={status}
          statusKind={statusKind}
        />
      );
    }
    return (
      <SocialFeedScreen
        SOCIAL_UI={SOCIAL_UI}
        socialDisplayName={socialDisplayName}
        currentSocialGistId={socialCfgGistId}
        feedSearch={feedSearch}
        setFeedSearch={setFeedSearch}
        filteredSocialDirectory={filteredSocialDirectory}
        loadingDirectory={loadingDirectory}
        hydrateSocialDirectory={(force) => void hydrateSocialDirectory(force)}
        openProfileDetail={(id) => {
          if (id === 'profile') {
            navigate('/social/profile');
          } else {
            openProfileDetail(id);
          }
        }}
        handleProfileCardKeyDown={handleProfileCardKeyDown}
        groupedFeedItems={groupedFeedItems}
        feedItems={feedItems}
        openActivityDetail={openActivityDetail}
        handleActivityItemKeyDown={handleActivityItemKeyDown}
        composePostText={composePostText}
        setComposePostText={setComposePostText}
        publishingPost={publishingPost}
        handlePublishPost={handlePublishPost}
        isFeedDragging={isFeedDragging}
        feedRowRef={feedRowRef as React.RefObject<HTMLDivElement | null>}
        handleFeedRowMouseDown={handleFeedRowMouseDown}
        handleFeedRowKeyDown={handleFeedRowKeyDown}
        status={status}
        statusKind={statusKind}
        handleSignOut={handleSignOut}
      />
    );
  }

  return (
    <section className="hub-hub hub-hub-gateway" aria-label={SOCIAL_UI.screenAria}>
      <div className="hub-hub-card hub-hub-gateway-card">
        <div className="hub-hub-title-wrap">
          <Icon name="bottom-hub" className="hub-hub-icon" />
          <h2>{SOCIAL_UI.hubTitle}</h2>
        </div>
        <p className="hub-gateway-lead">
          {SOCIAL_UI.gateway.lead}
        </p>

        <p className="hub-gateway-step-caption">{SOCIAL_UI.gateway.stepCaption(currentStep, gatewaySteps.length)}</p>

        <div className="hub-gateway-actions" aria-label={SOCIAL_UI.gateway.actionsAria}>
          {primaryGatewayCta ? (
            <button
              className="btn btn-primary hub-gateway-btn hub-gateway-btn-primary"
              type="button"
              onClick={primaryGatewayCta.action}
              disabled={primaryGatewayCta.disabled}
            >
              <Icon name={primaryGatewayCta.icon} />
              <span>{primaryGatewayCta.label}</span>
            </button>
          ) : null}

          {hasSocialSession ? (
            <button className="btn btn-danger hub-gateway-btn" type="button" onClick={handleSignOut}>
              <Icon name="logout" />
              <span>{SOCIAL_UI.gateway.signOut}</span>
            </button>
          ) : null}
        </div>

        <div className="hub-gateway-progress" aria-label={SOCIAL_UI.gateway.progressAria}>
          <div className="hub-gateway-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={gatewayProgress}>
            <span className="hub-gateway-progress-fill" style={{ width: `${gatewayProgress}%` }} />
          </div>
          <small>{SOCIAL_UI.gateway.progress(gatewayProgress)}</small>
        </div>

        <div className="hub-gateway-steps" aria-label={SOCIAL_UI.gateway.stepsAria}>
          {gatewaySteps.map((step, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep && !step.done;
            return (
              <article
                key={step.id}
                className={`hub-gateway-step ${step.done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`.trim()}
              >
                <span className="hub-gateway-step-badge" aria-hidden="true">{step.done ? 'OK' : stepNumber}</span>
                <div className="hub-gateway-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.subtitle}</small>
                </div>
              </article>
            );
          })}
        </div>

        {!hasMainSync ? (
          <p>{SOCIAL_UI.gateway.syncRequired}</p>
        ) : null}
        {hasMainSync && !hasSocialSession ? (
          <p>{SOCIAL_UI.gateway.signInRequired}</p>
        ) : null}
        {hasMainSync && hasSocialSession && !hasSocialGist ? (
          <p>{SOCIAL_UI.gateway.gistRequired}</p>
        ) : null}
        {hasSocialGist && !hasSocialSession ? (
          <p>{SOCIAL_UI.gateway.gistReadySignIn}</p>
        ) : null}

        <details className="hub-gateway-details" open>
          <summary>{SOCIAL_UI.gateway.detailsSummary}</summary>
          <div className="hub-status-grid" aria-label={SOCIAL_UI.gateway.stateAria}>
            <article className={`hub-status-card ${hasMainSync ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSync}</span>
              <strong>{hasMainSync ? SOCIAL_UI.gateway.stateConnected : SOCIAL_UI.gateway.stateNotConnected}</strong>
            </article>
            <article className={`hub-status-card ${hasSocialGist ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateGist}</span>
              <strong>{hasSocialGist ? SOCIAL_UI.gateway.stateLinked : SOCIAL_UI.gateway.stateNotLinked}</strong>
            </article>
            <article className={`hub-status-card ${hasSocialSession ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSession}</span>
              <strong>{hasSocialSession ? (authUser?.displayName || authUser?.email || SOCIAL_UI.gateway.stateActive) : SOCIAL_UI.gateway.stateNotStarted}</strong>
            </article>
          </div>

          <div className="hub-hub-tags" aria-label={SOCIAL_UI.gateway.flowAria}>
            {SOCIAL_UI.gateway.flow.map((flowStep) => (
              <span key={flowStep} className="hub-chip">{flowStep}</span>
            ))}
          </div>
        </details>

        {!hasSocialGist ? <p>{SOCIAL_UI.gateway.gistMissing}</p> : null}
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
});
