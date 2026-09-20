import { memo, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
// La hoja del hub se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS en
// el mismo chunk perezoso y el arranque no carga ni un byte de estilos de estas pantallas (igual que `stats.scss`).
import '../../styles/social.scss';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { LEGAL_CONSENT_UI, LEGAL_ROUTES } from '../../core/constants/legal';
import type { GameItem, TabData } from '../../model/types/game';
import { useSocialViewModel } from '../../viewmodel/useSocialViewModel';
import { useGithubConnection } from '../../viewmodel/sync/githubConnection';
import { matchSocialRoute } from '../../viewmodel/social/socialRoutes';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import { Icon } from './Icon';
import { SocialHubSkeleton } from './SocialHubSkeleton';

import { SocialProfileScreen } from './socialhub/SocialProfileScreen';
import { SocialDetailScreen } from './socialhub/SocialDetailScreen';
import { SocialProfileDetailScreen } from './socialhub/SocialProfileDetailScreen';
import { ProfileAchievementsScreen, ProfileGlobalAchievements } from './socialhub/ProfileAchievements';
import { ACHIEVEMENTS_UI } from '../../core/constants/achievementLabels';
import { ADMIN_ONLY_TIER } from '../../core/constants/tiers';
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
import { GithubSyncCard } from './sync/GithubSyncCard';
import { libraryStart } from '../../core/achievements/metrics';

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
    ownPublishablePhoto,
    profileSearch,
    setProfileSearch,
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
    completedGames,
    socialDisplayName,
    filteredSocialDirectory,
    visibleSocialDirectory,
    selectedProfileDetail,
    profileDetailId,
    profileReviewsView,
    profileAchievementsView,
    profileGlobalsView,
    ownAchievements,
    ownAchievementMirror,
    activeProfileReview,
    openProfileReviews,
    closeProfileReviews,
    openProfileAchievements,
    closeProfileAchievements,
    openProfileGlobals,
    openProfileReviewDetail,
    feedItems,
    activeDetailEvent,
    detailEventLoading,
    detailReviewLoading,
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
    friendActionTarget,
    confirmFriendAction,
    cancelFriendAction,
  } = useSocialViewModel({ games });

  // El día en que empieza tu biblioteca: el suelo con el que se fecha lo que conseguiste antes de que hubiera
  // con qué fecharlo. Solo tuyo — de otra persona no llega, y su lista saca el suyo de su propia vitrina.
  const libraryFloor = useMemo(() => (games ? libraryStart(games) : 0), [games]);

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

  /**
   * Rótulo del botón de volver cuando se ha llegado saltando desde otra pantalla del hub (el bloque de análisis
   * relacionados, o el enlace del panel de estadísticas). Nombra el sitio al que de verdad se vuelve.
   *
   * El destino se reconoce con `matchSocialRoute`, el mismo enrutado que decide qué pantalla se pinta, para que
   * el rótulo no pueda decir una cosa y el enlace llevar a otra. Una ruta de fuera del hub —estadísticas— no casa
   * con ninguna y se queda en el «Volver» genérico, que es honesto: desde aquí no se sabe qué hay allí.
   */
  const backToLabel = useMemo(() => {
    if (!backTo) {
      return '';
    }
    const target = matchSocialRoute(backTo);
    if (target.activePanel === 'detail' || target.activePanel === 'profile-review') {
      return SOCIAL_UI.feed.backToReview;
    }
    if (target.activePanel === 'profile-detail') {
      return target.profileReviewsView ? SOCIAL_UI.feed.reviewsBackToList : SOCIAL_UI.feed.backToProfile;
    }
    // `feed` es también lo que devuelve el enrutado para cualquier ruta ajena al hub, así que se distingue el
    // feed de verdad por su camino y no por el panel.
    return backTo.startsWith('/social') ? SOCIAL_UI.feed.backToFeed : SOCIAL_UI.feed.backGeneric;
  }, [backTo]);
  /**
   * EL PRIMER PASO SE DA AQUÍ, no en otra pantalla. La conexión con GitHub es la misma que ofrece Integración
   * —el componente y el viewmodel son los mismos, ver `GithubSyncCard`—, así que la pasarela ya no manda a
   * Ajustes a quien viene a montar su espacio social y luego no sabe volver.
   *
   * DOS CONDICIONES, y las dos por el mismo motivo: que el paso 1 se vea tan sencillo como el 2.
   *  - Sin proveedor (`null`): el hub se monta suelto en las pruebas de componente y no puede exigir el árbol
   *    entero de `App`.
   *  - Sin OAuth en el build: lo único que quedaría por ofrecer aquí es pegar un token a mano, que es
   *    exactamente lo que esta pantalla no debe pedir.
   * En ambos casos el paso 1 vuelve a ser el botón de siempre, que lleva a Integración: allí sí se explica.
   */
  const githubConnection = useGithubConnection();
  const showSyncCard = !hasMainSync && Boolean(githubConnection?.oauthEnabled);

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

  /**
   * Confirmación de las acciones que BORRAN el documento de amistad: dejar de ser amigos, rechazar una petición
   * recibida y retirar una enviada. Un solo diálogo para las tres —cambia el rótulo, no la consecuencia—, y va en
   * las tres pantallas desde las que se disparan: el detalle de un perfil, la bandeja y el directorio (donde el
   * botón "Pendiente" retira la petición).
   */
  const friendActionDialog = (
    <ConfirmModal
      open={Boolean(friendActionTarget)}
      title={
        friendActionTarget
          ? friendActionTarget.action === 'reject'
            ? SOCIAL_UI.friendship.rejectConfirmTitle(friendActionTarget.name)
            : friendActionTarget.action === 'cancel'
              ? SOCIAL_UI.friendship.cancelConfirmTitle(friendActionTarget.name)
              : SOCIAL_UI.friendship.removeConfirmTitle(friendActionTarget.name)
          : ''
      }
      confirmLabel={
        friendActionTarget?.action === 'reject'
          ? SOCIAL_UI.friendship.rejectConfirmAction
          : friendActionTarget?.action === 'cancel'
            ? SOCIAL_UI.friendship.cancelConfirmAction
            : SOCIAL_UI.friendship.removeConfirmAction
      }
      onCancel={cancelFriendAction}
      onConfirm={confirmFriendAction}
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
   * EL ESPEJO DE LOGROS de las personas del directorio, y la muestra del porcentaje comparado.
   *
   * Sale del propio directorio —que el hub YA se ha descargado— así que no cuesta ni una petición ni un byte más
   * de canal: es exactamente la propiedad que hace que esto se pueda entregar sin backend.
   *
   * Mientras nadie haya publicado el suyo el campo llega vacío, y entonces no hay muestra que medir: el
   * porcentaje comparado se calla (§6.6bis) en vez de inventarse una cifra.
   */
  const directoryMirrors = useMemo(() => {
    if (!ENABLE_ACHIEVEMENTS) return [] as string[];
    return [
      // TU VITRINA CUENTA, y hace falta decirlo porque el directorio te EXCLUYE por identidad —es lo que impide
      // que aparezcas en tu propia lista de gente—, así que la muestra se medía sobre «todos menos yo»: con dos
      // personas publicando, el porcentaje se calculaba sobre una. Eres una persona más, es lo que hace honesto
      // el «1 de 2», y es lo que ya cuenta el censo del panel de administración.
      //
      // Va el espejo del EVALUADOR y no el publicado: es el mismo que alimenta tu tarjeta del feed y va un paso
      // por delante de lo que haya en Firestore.
      ownAchievementMirror,
      // Y EL DIRECTORIO VISIBLE, NO EL DEL BUSCADOR. Salía del filtrado, así que buscar a alguien por su nombre
      // —el buscador no se limpia al entrar en una ficha— reducía la muestra a quienes casaban con ese texto:
      // se abrían los globales de esa persona y el porcentaje decía «100 % · 1 de 1». La cifra mide a la
      // comunidad; a quién se le enseña la lista de gente es otra pregunta.
      ...visibleSocialDirectory.map((entry) => entry.achievementsMirror),
    ].filter(Boolean);
  }, [visibleSocialDirectory, ownAchievementMirror]);

  const detailMirror = useMemo(() => {
    if (!ENABLE_ACHIEVEMENTS || !detailId) return '';
    // TU FICHA ES EL PRIMER CASO, no el último: el directorio filtrado te excluye por identidad —es lo que
    // impide que aparezcas en tu propia lista de gente— así que buscarte ahí devolvía siempre vacío, y tu ficha
    // de logros decía «todavía no hay nada que contar» con cien medallas detrás.
    if (isOwnProfileDetail) return ownAchievementMirror;
    // También sobre el visible: el perfil abierto lo resuelve `selectedProfileDetail` contra el directorio
    // entero, así que buscarlo aquí en el filtrado dejaba su espejo en blanco en cuanto el texto del buscador
    // dejaba de casar con su nombre —con la ficha ya abierta delante—.
    const entry = visibleSocialDirectory.find((candidate) => candidate.id === detailId);
    return entry?.achievementsMirror || '';
  }, [detailId, visibleSocialDirectory, isOwnProfileDetail, ownAchievementMirror]);

  /**
   * EL PALMARÉS del perfil abierto: las ediciones de la porra que ha ganado.
   *
   * Sale del MISMO sitio que el espejo de logros —el documento del directorio, ya descargado—, así que la
   * vitrina no cuesta ni una petición. Se enseña como un logro especial porque eso es lo que es para quien lo
   * mira; lo que no hace es entrar en el catálogo, que solo contiene lo que se deriva de la biblioteca.
   *
   * Y sale del PERFIL ABIERTO, no de una búsqueda en el directorio visible. Buscándolo ahí, TU PROPIA ficha se
   * quedaba siempre sin vitrina: ese directorio te excluye por identidad —es lo que impide que aparezcas en tu
   * lista de gente—, así que quien había ganado una edición no se la veía al entrar en su perfil aunque sí la
   * viera en el de otro. Es el mismo tropiezo que ya tuvo el espejo de logros. Por el camino se arregla otro:
   * el detalle se puede abrir por el alias `me`, que no es el id de ninguna entrada, y `selectedProfileDetail`
   * ya lo resuelve contra el directorio ENTERO.
   */
  const detailPalmares = useMemo(
    () => selectedProfileDetail?.palmares || [],
    [selectedProfileDetail],
  );

  /*
   * ABRIR UNA RESEÑA EMPIEZA POR SU PRINCIPIO, y eso ya no se hace aquí.
   *
   * Aquí vivía un `window.scrollTo({ top: 0 })` atado a qué reseña estaba abierta. Tenía su razón: al crecer el
   * detalle con el bloque de relacionadas, abrir una reseña desde el final de una lista larga te dejaba a media
   * altura, en mitad del texto. Pero los paneles de este hub SALEN DE LA RUTA (`activePanel` viene de
   * `routeState`), así que abrir una reseña es una navegación como cualquier otra y de eso se encarga ya
   * `useScrollOnNavigate`: sube al entrar y devuelve el sitio al volver, que es justo lo que este parche hacía a
   * mano para un caso y nadie hacía para los demás.
   *
   * Y quitarlo arregla algo más: era el único `scrollTo` instantáneo de la aplicación, y el hook tiene que
   * distinguir esos saltos del cero que dispara el navegador al navegar. Un caso límite menos del que preocuparse.
   */

  const toggleDetailReviews = useCallback(
    () => (profileReviewsView ? closeProfileReviews(detailId) : openProfileReviews(detailId)),
    [profileReviewsView, closeProfileReviews, openProfileReviews, detailId],
  );
  const openDetailAchievements = useCallback(
    () => openProfileAchievements(detailId),
    [openProfileAchievements, detailId],
  );
  // Ida y vuelta entre las dos vistas de la MISMA pantalla, no entre la pantalla y la ficha.
  const toggleDetailGlobals = useCallback(
    () => (profileGlobalsView ? openProfileAchievements(detailId) : openProfileGlobals(detailId)),
    [profileGlobalsView, openProfileAchievements, openProfileGlobals, detailId],
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
          tier={ownTier}
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
          ownVisiblePhotoURL={ownPublishablePhoto}
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
          eventLoading={detailEventLoading}
          reviewLoading={detailReviewLoading}
          backLabel={backToLabel || undefined}
          /* La misma regla que la reseña leída desde el perfil, unas líneas más abajo: son el mismo detalle por
             dos caminos, y la franja tiene que salir en los dos. */
          coversAllowed={ownTier === ADMIN_ONLY_TIER}
          related={(
            <RelatedReviews
              SOCIAL_UI={SOCIAL_UI}
              items={relatedReviews}
              onOpen={openRelatedReview}
              coversAllowed={ownTier === ADMIN_ONLY_TIER}
            />
          )}
        />
      );
    }
    // LOS LOGROS DE UN PERFIL SON UNA PANTALLA, la misma que `/logros`. Van antes que la ficha porque su ruta es
    // una sub-ruta de ella (`/social/profiles/:id/logros`) y, si no, la ficha se la comería por prefijo.
    if (ENABLE_ACHIEVEMENTS && activePanel === 'profile-detail' && (profileAchievementsView || profileGlobalsView)) {
      const nombre = (selectedProfileDetail as { displayName?: string } | null)?.displayName || '';
      const volver = () => closeProfileAchievements(detailId);
      const vuelta = isOwnProfileDetail
        ? ACHIEVEMENTS_UI.ownAchievements
        : ACHIEVEMENTS_UI.achievementsOf(nombre);
      return profileGlobalsView ? (
        <ProfileGlobalAchievements
          mirror={detailMirror}
          directoryMirrors={directoryMirrors}
          owner={nombre}
          self={isOwnProfileDetail}
          // En TU perfil el progreso sale del evaluador, no del espejo: es lo que permite pintar «4 de 10» en lo
          // que todavía no tienes. De una amistad no llega —ni debe llegar—.
          ownStates={isOwnProfileDetail ? ownAchievements?.byId : undefined}
          onBack={volver}
          onToggleGlobals={toggleDetailGlobals}
          globalsBackLabel={vuelta}
        />
      ) : (
        <ProfileAchievementsScreen
          mirror={detailMirror}
          directoryMirrors={directoryMirrors}
          owner={isOwnProfileDetail ? '' : nombre}
          // En TU ficha manda el evaluador, y es lo que la convierte en el catálogo: con él salen los logros que
          // aún no tienes y el «7 de 10» que dice cuánto falta. De una amistad no llega —ni debe llegar—, así que
          // su ficha se queda en su vitrina.
          ownStates={isOwnProfileDetail ? ownAchievements?.byId : undefined}
          // Y el suelo de las fechas, que también es solo tuyo: el primer juego que entró en tu biblioteca. La
          // vista global no lo necesita —ahí no hay columna de fechas—, así que solo va aquí.
          since={isOwnProfileDetail ? libraryFloor : 0}
          onBack={volver}
          onToggleGlobals={toggleDetailGlobals}
          globalsBackLabel={vuelta}
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
          achievementsMirror={detailMirror}
          palmares={detailPalmares}
          onOpenAchievements={openDetailAchievements}
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
        {friendActionDialog}
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
          // Aquí SÍ hay firma que dar: se está leyendo la reseña de otra persona. Sin `onOpen` a propósito —ya se
          // está dentro de su perfil, no hay a dónde llevar—, así que el nombre va como texto y sin avatar.
          author={{ name: (selectedProfileDetail as { displayName?: string })?.displayName || '' }}
          // Quien llega saltando desde un análisis relacionado vuelve A DONDE ESTABA. El destino por defecto —la
          // lista de reseñas de este perfil— solo vale para quien ha entrado por ella.
          onBack={backTo ? goToSocial : () => openProfileReviews(profileDetailId)}
          backLabel={backToLabel || undefined}
          status={status}
          statusKind={statusKind}
          actions={
            ownReviewGame && ownReviewText ? <ShareReviewButton game={ownReviewGame} reviewText={ownReviewText} /> : null
          }
          /* La franja de la carátula, con la misma regla que la tabla de juegos y la lista de reseñas de un
             perfil: la estantería de otra persona se resuelve contra IGDB una vez por título, así que va para
             mithril, y encima manda la preferencia de quien mira (ver `useReviewCover`). */
          coversAllowed={ownTier === ADMIN_ONLY_TIER}
          related={(
            <RelatedReviews
              SOCIAL_UI={SOCIAL_UI}
              items={relatedReviews}
              onOpen={openRelatedReview}
              coversAllowed={ownTier === ADMIN_ONLY_TIER}
            />
          )}
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
            onOpenProfile={openDirectoryProfile}
            onBack={goToSocial}
            status={status}
            statusKind={statusKind}
          />
          {friendActionDialog}
        </>
      );
    }
    if (activePanel === 'profiles') {
      return (
        <>
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
          {/* Aquí el botón "Pendiente" retira la petición enviada, y eso ahora se confirma. */}
          {friendActionDialog}
        </>
      );
    }
    return (
      <SocialFeedScreen
        SOCIAL_UI={SOCIAL_UI}
        socialDisplayName={socialDisplayName}
        ownVisiblePhotoURL={ownPublishablePhoto}
        currentSocialGistId={socialCfgGistId}
        loadingDirectory={loadingDirectory}
        openProfileDetail={openDirectoryProfile}
        openProfileAchievements={openProfileAchievements}
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

  /**
   * LO QUE DICE CADA PASO, en el orden de `gatewaySteps`.
   *
   * Lo normal es la explicación del propio paso; el segundo tiene DOS situaciones que piden otra cosa, y las dos
   * son estados reales en los que se ha quedado gente: entrar con Google y que el espacio social no llegue a
   * crearse, y volver a una instalación nueva cuando el espacio ya existía. Antes se decían en párrafos sueltos
   * al pie de la pantalla, lejos del paso al que se referían.
   */
  const stageNotes = gatewaySteps.map((step) => {
    if (step.id !== 'google') return step.subtitle;
    if (hasSocialSession && !hasSocialGist) return SOCIAL_UI.gateway.gistRequired;
    if (!hasSocialSession && hasSocialGist) return SOCIAL_UI.gateway.gistReadySignIn;
    return step.subtitle;
  });

  /**
   * LA ACCIÓN DE CADA PASO, dentro de su paso.
   *
   * Solo hay una a la vez —la del paso que toca—, y es la misma que antes vivía suelta en una fila aparte: el
   * primero conecta GitHub (la tarjeta compartida con Integración, o su botón de respaldo hacia Ajustes si este
   * build no trae OAuth) y el segundo entra con Google y, si hace falta, reintenta la creación del espacio.
   * `primaryGatewayCta` ya resuelve cuál toca; aquí solo se decide bajo qué paso cuelga.
   */
  const ctaStageIndex = hasMainSync ? 1 : 0;
  const stageActions = gatewaySteps.map((_step, index) => {
    if (index === 0 && showSyncCard && githubConnection) {
      return (
        <GithubSyncCard
          key="github"
          connection={githubConnection}
          variant="gateway"
          ctaClassName="btn btn-primary hub-gateway-btn hub-gateway-btn-primary"
        />
      );
    }
    if (index !== ctaStageIndex || !primaryGatewayCta) return null;
    return (
      <button
        key="cta"
        className="btn btn-primary hub-gateway-btn hub-gateway-btn-primary"
        type="button"
        onClick={primaryGatewayCta.action}
        disabled={primaryGatewayCta.disabled}
      >
        <Icon name={primaryGatewayCta.icon} />
        <span>{primaryGatewayCta.label}</span>
      </button>
    );
  });

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
        {/* Los dos pasos necesitan red (Google, Firestore, GitHub): sin conexión no se puede dar ninguno, así que
            se dice antes de que el usuario pulse y espere a un timeout. */}
        {offline ? <HubOfflineNotice hasCachedData={false} /> : null}

        {/* L4 — puerta de aceptación: con sesión iniciada y sin conformidad vigente, no se entra ni se crea el
            espacio social hasta marcarla. No afecta a las listas propias ni a la sincronización. */}
        {legalConsentRequired ? (
          <div className="hub-gateway-consent">
            <strong>{LEGAL_CONSENT_UI.title}</strong>
            <p>{LEGAL_CONSENT_UI.body}</p>
            <div className="hub-legal-links">
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

        {/* ═══ LOS DOS PASOS, Y LA ACCIÓN DENTRO DE SU PASO ═══════════════════════════════════════════════
            Antes esto eran cuatro piezas diciendo lo mismo: un rótulo («paso 1 de 3»), una barra de progreso,
            tres fichas con el nombre de cada paso y —lejos de todas ellas— un botón suelto que no decía a cuál
            pertenecía. Con dos pasos eso no se sostiene: la lista ES el progreso, y cada paso lleva su propio
            botón, así que no hay que emparejar nada con la vista.
            `<ol>` y no `<div>`: son pasos en orden, y así se leen también sin ver la pantalla. */}
        <ol className="hub-gateway-path" aria-label={SOCIAL_UI.gateway.stepsAria}>
          {gatewaySteps.map((step, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep && !step.done;
            return (
              <li
                key={step.id}
                className={`hub-gateway-stage ${step.done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`.trim()}
              >
                <span className="hub-gateway-stage-mark">
                  {step.done ? (
                    <>
                      <Icon name="check" />
                      <span className="sr-only">{SOCIAL_UI.gateway.stageDone}</span>
                    </>
                  ) : (
                    stepNumber
                  )}
                </span>
                <div className="hub-gateway-stage-body">
                  <h3 className="hub-gateway-stage-title">{step.title}</h3>
                  <p className="hub-gateway-stage-note">{stageNotes[index]}</p>
                  {stageActions[index]}
                </div>
              </li>
            );
          })}
        </ol>

        {hasSocialSession ? (
          <div className="hub-gateway-actions" aria-label={SOCIAL_UI.gateway.actionsAria}>
            <button className="btn btn-danger hub-gateway-btn" type="button" onClick={handleSignOut}>
              <Icon name="logout" />
              <span>{SOCIAL_UI.gateway.signOut}</span>
            </button>
          </div>
        ) : null}

        {/* EL ESTADO POR DENTRO. No es letra pequeña ni un apéndice: es lo que se mira cuando algo no cuadra —los
            TRES requisitos de verdad, uno de ellos el espacio social, que no es un paso pero sí una condición—,
            así que se queda con el peso que tenía y abierto. Lo que ha cambiado es que ahora dice la verdad: el
            flujo de abajo anunciaba cuatro etapas de un alta que son dos. */}
        <details className="hub-gateway-details" open>
          <summary>{SOCIAL_UI.gateway.detailsSummary}</summary>
          <div className="hub-status-grid" aria-label={SOCIAL_UI.gateway.stateAria}>
            <article className={`hub-status-card ${hasMainSync ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSync}</span>
              <strong>{hasMainSync ? SOCIAL_UI.gateway.stateConnected : SOCIAL_UI.gateway.stateNotConnected}</strong>
            </article>
            {/* EL ESPACIO SOCIAL, SOLO CUANDO PUEDE DECIR ALGO. No se crea hasta que hay sesión de Google —lo
                hace solo, ver el efecto de auto-creación—, así que antes de ese paso «No enlazado» no es un
                estado: es lo único que podía poner, y colado entre los otros dos parecía un tercer pendiente en
                una pantalla que promete dos pasos. Con sesión ya iniciada sí informa, y es además la ÚNICA señal
                de que el espacio no llegó a prepararse, que es el caso con el que se viene aquí a mirar. */}
            {hasSocialSession || hasSocialGist ? (
              <article className={`hub-status-card ${hasSocialGist ? 'is-ok' : 'is-pending'}`}>
                <span className="hub-status-label">{SOCIAL_UI.gateway.stateGist}</span>
                <strong>{hasSocialGist ? SOCIAL_UI.gateway.stateLinked : SOCIAL_UI.gateway.stateNotLinked}</strong>
              </article>
            ) : null}
            <article className={`hub-status-card ${hasSocialSession ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSession}</span>
              <strong>{hasSocialSession ? (authUser?.displayName || authUser?.email || SOCIAL_UI.gateway.stateActive) : SOCIAL_UI.gateway.stateNotStarted}</strong>
            </article>
          </div>
        </details>

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
