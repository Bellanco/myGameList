import { memo, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
// La hoja del hub se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS en
// el mismo chunk perezoso y el arranque no carga ni un byte de estilos de estas pantallas (igual que `stats.scss`).
import '../../styles/social.scss';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { LEGAL_CONSENT_UI, LEGAL_ROUTES } from '../../core/constants/legal';
import type { GameItem, TabData } from '../../model/types/game';
import { useSocialViewModel } from '../../viewmodel/useSocialViewModel';
import { Icon } from './Icon';
import { SocialHubSkeleton } from './SocialHubSkeleton';

import { SocialProfileScreen } from './socialhub/SocialProfileScreen';
import { SocialDetailScreen } from './socialhub/SocialDetailScreen';
import { SocialProfileDetailScreen } from './socialhub/SocialProfileDetailScreen';
import { SocialProfileReviewScreen } from './socialhub/SocialProfileReviewScreen';
import { RelatedReviews } from './socialhub/RelatedReviews';
import { SocialProfilesScreen } from './socialhub/SocialProfilesScreen';
import { SocialFeedScreen } from './socialhub/SocialFeedScreen';
import { SocialRequestsScreen } from './socialhub/SocialRequestsScreen';
import { ShareReviewButton } from './stats/ShareReviewButton';
import { HubStatus } from './socialhub/HubStatus';
import { ConfirmModal } from '../modals/ConfirmModal';
import { SocialErrorBoundary } from './socialhub/SocialErrorBoundary';
import { HubOfflineNotice } from './socialhub/HubOfflineNotice';

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
interface SocialHubProps {
  /** Ruleta (perfil social) — añadir un juego ajeno a mi lista de próximos. */
  onAddToProximos?: (game: Partial<GameItem>) => 'added' | 'duplicate' | 'invalid';
  /** Ruleta (perfil social) — ¿ya tengo este juego (por nombre) en alguna de mis listas? */
  hasGameInLists?: (name: string) => boolean;
  /** Ruleta (perfil social) — si ya es mío, llevarlo a "En curso". */
  moveGameToCurrentByName?: (name: string) => void;
  /** Listados VIVOS de la app: con ellos se reconcilia la actividad social publicada (reseñas). */
  games?: TabData;
}

const SocialHubInner = memo(function SocialHubInner({
  onAddToProximos,
  hasGameInLists,
  moveGameToCurrentByName,
  games,
}: SocialHubProps = {}) {
  const {
    navigate,
    activePanel,
    socialCfgGistId,
    authUser,
    loading,
    status,
    statusKind,
    offline,
    offlineHasCachedData,
    showSocialSpace,
    hasCreatedProfile,
    profileName,
    setProfileName,
    hiddenTabs,
    setHiddenTabs,
    // Rango propio: decide cuánto se ve del panel de estadísticas de un amigo.
    ownTier,
    hideReplayable,
    setHideReplayable,
    hideRetry,
    setHideRetry,
    hideGameTime,
    setHideGameTime,
    showPhoto,
    setShowPhoto,
    ownPhotoIsGeneric,
    profileSearch,
    setProfileSearch,
    composePostText,
    setComposePostText,
    publishingPost,
    handlePublishPost,
    canPublishPosts,
    postMaxLength,
    showPostCounter,
    hydratingProfile,
    savingProfile,
    loadingDirectory,
    hasMainSync,
    hasSocialGist,
    hasSocialSession,
    legalConsentRequired,
    savingConsent,
    acceptLegalConsent,
    gatewaySteps,
    currentStep,
    gatewayProgress,
    completedGames,
    socialDisplayName,
    filteredSocialDirectory,
    selectedProfileDetail,
    profileDetailId,
    profileReviewsView,
    activeProfileReview,
    openProfileReviews,
    closeProfileReviews,
    openProfileReviewDetail,
    feedItems,
    activeDetailEvent,
    getGameItemById,
    relatedReviews,
    openRelatedReview,
    groupedFeedItems,
    hasMoreFeed,
    showMoreFeed,
    openActivityDetail,
    openMoveReview,
    openProfileDetail,
    openOwnProfileDetail,
    isOwnProfileDetail,
    isOwnDetailEvent,
    handleActivityItemKeyDown,
    handleProfileCardKeyDown,
    handleSaveProfile,
    handleSignOut,
    primaryGatewayCta,
    pendingIncomingCount,
    incomingRequests,
    outgoingRequests,
    friendsList,
    loadingFriendships,
    friendshipBusyUid,
    relationshipWith,
    handleAddOrAcceptFriend,
    handleRejectFriendRequest,
    handleCancelFriendRequest,
    handleRemoveFriend,
    removeFriendTarget,
    confirmRemoveFriend,
    cancelRemoveFriend,
  } = useSocialViewModel({ games });

  // Handlers de navegación estables (misma identidad entre renders): permiten que las pantallas hoja
  // memoizadas no se re-rendericen cuando cambia un estado no relacionado del VM (status, cooldown, drag…).
  /**
   * "Volver" del hub. Normalmente lleva al feed, pero si se ha llegado desde otra pantalla —el panel de
   * estadísticas enlaza a tus reseñas, que viven aquí— se respeta ese origen: quien viene de las estadísticas
   * espera volver a las estadísticas, no aparecer en el feed social.
   */
  const location = useLocation();
  const backTo = (location.state as { backTo?: string } | null)?.backTo;
  const goToSocial = useCallback(() => navigate(backTo || '/social'), [navigate, backTo]);
  const goToProfileEdit = useCallback(() => navigate('/social/profile'), [navigate]);
  const goToProfiles = useCallback(() => navigate('/social/profiles'), [navigate]);
  const goToRequests = useCallback(() => navigate('/social/requests'), [navigate]);
  const openDirectoryProfile = useCallback(
    (id: string) => {
      if (id === 'profile') {
        navigate('/social/profile');
      } else {
        openProfileDetail(id);
      }
    },
    [navigate, openProfileDetail],
  );

  // Diálogo de confirmación de "Dejar de ser amigos" (se dispara desde el detalle y desde la bandeja).
  const removeFriendDialog = (
    <ConfirmModal
      open={Boolean(removeFriendTarget)}
      title={removeFriendTarget ? SOCIAL_UI.friendship.removeConfirmTitle(removeFriendTarget.name) : ''}
      confirmLabel={SOCIAL_UI.friendship.removeConfirmAction}
      onCancel={cancelRemoveFriend}
      onConfirm={confirmRemoveFriend}
    />
  );

  // Identidad del perfil abierto en el detalle, y los manejadores que dependen de ella.
  //
  // Van MEMOIZADOS y antes del primer `return` condicional. `SocialProfileDetailScreen` está envuelta en `memo`,
  // pero recibía cinco flechas creadas en el sitio: props nuevas en cada render, así que ese `memo` no llegaba a
  // ahorrar un solo repintado. Con la identidad estable, la pantalla solo se vuelve a pintar cuando cambia algo
  // que de verdad le incumbe.
  const detailId = (selectedProfileDetail as { id?: string })?.id || profileDetailId;
  const detailUid = (selectedProfileDetail as { uid?: string })?.uid || '';

  /**
   * Abrir una reseña empieza por su principio.
   *
   * El hub no rehacía el desplazamiento al cambiar de pantalla, y eso pasaba desapercibido mientras el detalle de
   * una reseña era corto. Al añadirle el bloque de relacionadas la pantalla creció, y abrir una reseña desde el
   * final de una lista larga —o desde ese mismo bloque, que está abajo del todo— te dejaba a media altura: en
   * mitad del texto, o directamente en las relacionadas de la reseña nueva. Leer empieza por arriba.
   *
   * Solo al ENTRAR en una reseña, y por eso la dependencia es cuál está abierta: volver a la lista no dispara
   * nada y conserva el sitio donde el lector la dejó, que es lo que se espera de un «atrás».
   */
  const openReviewKey = activePanel === 'detail' || activePanel === 'profile-review'
    ? `${activePanel}:${activeDetailEvent?.gameId ?? activeProfileReview?.id ?? 0}`
    : '';
  useEffect(() => {
    if (!openReviewKey) return;
    window.scrollTo({ top: 0 });
  }, [openReviewKey]);

  const toggleDetailReviews = useCallback(
    () => (profileReviewsView ? closeProfileReviews(detailId) : openProfileReviews(detailId)),
    [profileReviewsView, closeProfileReviews, openProfileReviews, detailId],
  );
  const openDetailReview = useCallback(
    (gameId: number) => openProfileReviewDetail(detailId, gameId),
    [openProfileReviewDetail, detailId],
  );
  const addOrAcceptDetailFriend = useCallback(
    () => handleAddOrAcceptFriend(detailUid),
    [handleAddOrAcceptFriend, detailUid],
  );
  const cancelDetailFriendRequest = useCallback(
    () => handleCancelFriendRequest(detailUid),
    [handleCancelFriendRequest, detailUid],
  );
  const removeDetailFriend = useCallback(() => handleRemoveFriend(detailUid), [handleRemoveFriend, detailUid]);

  // Mismo esqueleto que el `fallback` del `Suspense` que trae este chunk: encadenados, se ven como UNA sola
  // escena de carga en vez de un blanco seguido de una tarjeta distinta.
  if (loading) {
    return <SocialHubSkeleton />;
  }

  if (showSocialSpace && authUser) {
    if (activePanel === 'profile') {
      return (
        <SocialProfileScreen
          SOCIAL_UI={SOCIAL_UI}
          profileName={profileName}
          setProfileName={setProfileName}
          completedGames={completedGames}
          hydratingProfile={hydratingProfile}
          savingProfile={savingProfile}
          hasCreatedProfile={hasCreatedProfile}
          onSaveProfile={handleSaveProfile}
          onSignOut={handleSignOut}
          onBack={goToSocial}
          status={status}
          statusKind={statusKind}
          hiddenTabs={hiddenTabs}
          onHiddenTabsChange={setHiddenTabs}
          hideReplayable={hideReplayable}
          setHideReplayable={setHideReplayable}
          hideRetry={hideRetry}
          setHideRetry={setHideRetry}
            hideGameTime={hideGameTime}
            setHideGameTime={setHideGameTime}
          showPhoto={showPhoto}
          setShowPhoto={setShowPhoto}
          ownPhotoURL={authUser?.photoURL || ''}
          ownPhotoIsGeneric={ownPhotoIsGeneric}
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
          onBack={goToSocial}
          status={status}
          statusKind={statusKind}
          shareable={isOwnDetailEvent}
          related={<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={relatedReviews} onOpen={openRelatedReview} />}
        />
      );
    }
    if (activePanel === 'profile-detail') {
      return (
        <>
        <SocialProfileDetailScreen
          SOCIAL_UI={SOCIAL_UI}
          activeProfileDetail={selectedProfileDetail}
          isOwnProfile={isOwnProfileDetail}
          onEditProfile={goToProfileEdit}
          onBack={goToSocial}
          showReviews={profileReviewsView}
          onToggleReviews={toggleDetailReviews}
          onOpenReview={openDetailReview}
          status={status}
          statusKind={statusKind}
          onAddToProximos={onAddToProximos}
          hasGameInLists={hasGameInLists}
          moveGameToCurrentByName={moveGameToCurrentByName}
          friendshipState={selectedProfileDetail ? relationshipWith((selectedProfileDetail as { uid?: string }).uid || '') : 'none'}
          friendshipBusy={Boolean(selectedProfileDetail) && friendshipBusyUid === (selectedProfileDetail as { uid?: string }).uid}
          onAddOrAcceptFriend={addOrAcceptDetailFriend}
          onCancelFriendRequest={cancelDetailFriendRequest}
          onRemoveFriend={removeDetailFriend}
          viewerTier={ownTier}
          viewerHiddenTabs={hiddenTabs}
        />
        {removeFriendDialog}
        </>
      );
    }
    if (activePanel === 'profile-review') {
      // Compartir TU reseña también desde aquí. Este es el camino natural para quien quiere publicar la suya (Mi
      // perfil → Reseñas → abrirla), y el botón solo estaba en el detalle del feed y en el panel de estadísticas:
      // quien entraba por aquí no encontraba nada y no tenía forma de saber que existía en otro sitio. Sobre una
      // reseña AJENA no se ofrece —no hay nada propio que publicar—, igual que en el detalle del feed.
      const reviewProfileId = (selectedProfileDetail as { id?: string })?.id || profileDetailId;
      const ownReviewGame =
        isOwnProfileDetail && activeProfileReview ? getGameItemById(reviewProfileId, activeProfileReview.id) : null;
      // Texto completo del juego local; el de la reseña abierta es el respaldo (viene de esos mismos listados).
      const ownReviewText = String(ownReviewGame?.review || activeProfileReview?.review || '').trim();
      return (
        <SocialProfileReviewScreen
          SOCIAL_UI={SOCIAL_UI}
          review={activeProfileReview}
          profileName={(selectedProfileDetail as { displayName?: string })?.displayName || ''}
          onBack={() => openProfileReviews(profileDetailId)}
          status={status}
          statusKind={statusKind}
          actions={
            ownReviewGame && ownReviewText ? <ShareReviewButton game={ownReviewGame} reviewText={ownReviewText} /> : null
          }
          related={<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={relatedReviews} onOpen={openRelatedReview} />}
        />
      );
    }
    if (activePanel === 'requests') {
      return (
        <>
          <SocialRequestsScreen
            SOCIAL_UI={SOCIAL_UI}
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            friendsList={friendsList}
            loading={loadingFriendships}
            busyUid={friendshipBusyUid}
            onAccept={handleAddOrAcceptFriend}
            onReject={handleRejectFriendRequest}
            onCancel={handleCancelFriendRequest}
            onRemove={handleRemoveFriend}
            onBack={goToSocial}
            status={status}
            statusKind={statusKind}
          />
          {removeFriendDialog}
        </>
      );
    }
    if (activePanel === 'profiles') {
      return (
        <SocialProfilesScreen
          SOCIAL_UI={SOCIAL_UI}
          profileSearch={profileSearch}
          setProfileSearch={setProfileSearch}
          filteredSocialDirectory={filteredSocialDirectory}
          loadingDirectory={loadingDirectory}
          openProfileDetail={openDirectoryProfile}
          handleProfileCardKeyDown={handleProfileCardKeyDown}
          relationshipWith={relationshipWith}
          friendshipBusyUid={friendshipBusyUid}
          onAddOrAcceptFriend={handleAddOrAcceptFriend}
          onCancelFriendRequest={handleCancelFriendRequest}
          onBack={goToSocial}
          status={status}
          statusKind={statusKind}
        />
      );
    }
    return (
      <SocialFeedScreen
        SOCIAL_UI={SOCIAL_UI}
        socialDisplayName={socialDisplayName}
        ownPhotoURL={authUser?.photoURL || ''}
        currentSocialGistId={socialCfgGistId}
        loadingDirectory={loadingDirectory}
        openProfileDetail={openDirectoryProfile}
        onOpenProfiles={goToProfiles}
        onOpenOwnProfile={openOwnProfileDetail}
        onOpenRequests={goToRequests}
        pendingIncomingCount={pendingIncomingCount}
        groupedFeedItems={groupedFeedItems}
        feedItems={feedItems}
        hasMoreFeed={hasMoreFeed}
        showMoreFeed={showMoreFeed}
        openActivityDetail={openActivityDetail}
        openMoveReview={openMoveReview}
        handleActivityItemKeyDown={handleActivityItemKeyDown}
        composePostText={composePostText}
        setComposePostText={setComposePostText}
        publishingPost={publishingPost}
        handlePublishPost={handlePublishPost}
        canPublishPosts={canPublishPosts}
        postMaxLength={postMaxLength}
        showPostCounter={showPostCounter}
        status={status}
        statusKind={statusKind}
        handleSignOut={handleSignOut}
        offline={offline}
        offlineHasCachedData={offlineHasCachedData}
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
        {/* La pasarela son tres pasos que TODOS necesitan red (Google, Firestore, GitHub): sin conexión no se puede
            completar ninguno, así que se dice antes de que el usuario pulse y espere a un timeout. */}
        {offline ? <HubOfflineNotice hasCachedData={false} /> : null}

        <p className="hub-gateway-step-caption">{SOCIAL_UI.gateway.stepCaption(currentStep, gatewaySteps.length)}</p>

        {/* L4 — puerta de aceptación: con sesión iniciada y sin conformidad vigente, no se entra ni se crea el
            espacio social hasta marcarla. No afecta a las listas propias ni a la sincronización. */}
        {legalConsentRequired ? (
          <div className="hub-gateway-consent">
            <strong>{LEGAL_CONSENT_UI.title}</strong>
            <p>{LEGAL_CONSENT_UI.body}</p>
            <div className="settings-legal-links">
              <Link to={LEGAL_ROUTES.terms}>{LEGAL_CONSENT_UI.termsLink}</Link>
              <Link to={LEGAL_ROUTES.privacy}>{LEGAL_CONSENT_UI.privacyLink}</Link>
            </div>
            <label className="hub-gateway-consent-check">
              <input
                type="checkbox"
                checked={false}
                disabled={savingConsent}
                onChange={() => void acceptLegalConsent()}
              />
              <span>{savingConsent ? LEGAL_CONSENT_UI.pending : LEGAL_CONSENT_UI.checkbox}</span>
            </label>
          </div>
        ) : null}

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
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
});

/**
 * Hub social envuelto en su error boundary: si el render interno lanza (dato inesperado, etc.), se muestra un
 * fallback con reintento limitado a 1 cada 15 min en vez de dejar la app en blanco. El resto de la app no se ve afectado.
 */
export function SocialHub(props: SocialHubProps = {}) {
  return (
    <SocialErrorBoundary>
      <SocialHubInner {...props} />
    </SocialErrorBoundary>
  );
}
