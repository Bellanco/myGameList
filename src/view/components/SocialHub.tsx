import { memo, useCallback, useMemo } from 'react';
import { generatePath, useLocation } from 'react-router-dom';
// La hoja del hub se importa AQUÍ y no desde `index.scss`: como el hub entra por `lazy()`, Vite emite su CSS en
// el mismo chunk perezoso y el arranque no carga ni un byte de estilos de estas pantallas (igual que `stats.scss`).
import '../../styles/social.scss';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import type { GameItem, TabData, TabId } from '../../model/types/game';
import { useSocialViewModel } from '../../viewmodel/useSocialViewModel';
import { useGithubConnection } from '../../viewmodel/sync/githubConnection';
import { useGatewayRecovery } from '../../viewmodel/social/useGatewayRecovery';
import { OWN_PROFILE_ALIAS, SOCIAL_ROUTES, matchSocialRoute, wantsYearSummary } from '../../viewmodel/social/socialRoutes';
import type { LikeNotification } from '../../core/social/likeNotifications';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import { SocialHubSkeleton } from './SocialHubSkeleton';

import { SocialProfileScreen } from './socialhub/SocialProfileScreen';
import { SocialDetailScreen } from './socialhub/SocialDetailScreen';
import { SocialProfileDetailScreen } from './socialhub/SocialProfileDetailScreen';
import { ProfileAchievementsScreen, ProfileGlobalAchievements } from './socialhub/ProfileAchievements';
import { ACHIEVEMENTS_UI } from '../../core/constants/achievementLabels';
import { SocialProfileReviewScreen } from './socialhub/SocialProfileReviewScreen';
import { RelatedReviews } from './socialhub/RelatedReviews';
import { SocialProfilesScreen } from './socialhub/SocialProfilesScreen';
import { SocialFeedScreen } from './socialhub/SocialFeedScreen';
import { FeedLikeBar } from './socialhub/FeedLikeBar';
import { SocialRequestsScreen } from './socialhub/SocialRequestsScreen';
import { ShareReviewButton } from './stats/ShareReviewButton';
import { ConfirmModal } from '../modals/ConfirmModal';
import { SocialErrorBoundary } from './socialhub/SocialErrorBoundary';
import { SocialGateway } from './socialhub/SocialGateway';
import { libraryStart } from '../../core/achievements/metrics';
import { useHubFocusOnNavigate } from '../hooks/useHubFocusOnNavigate';
import { useUnavailableReviewRedirect } from '../hooks/useUnavailableReviewRedirect';
import { useGameSheetParam } from '../../viewmodel/gameSheet/useGameSheetParam';

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
  /** Ruleta (perfil social) — añadir un juego ajeno a una de mis listas (la de `addTarget`). */
  onAddGame?: (game: Partial<GameItem>) => 'added' | 'duplicate' | 'invalid' | 'full';
  /** A qué lista va lo que se añade desde la ruleta: deseados, o próximos si esa lista está oculta. */
  addTarget?: 'p' | 'd';
  /** Ruleta (perfil social) — ¿en cuál de mis listas está ya este juego (por nombre)? */
  gameListOf?: (name: string) => TabId | null;
  /** Ruleta (perfil social) — si ya es mío, llevarlo a "En curso". */
  moveGameToCurrentByName?: (name: string) => void;
  /** Listados VIVOS de la app: con ellos se reconcilia la actividad social publicada (reseñas). */
  games?: TabData;
  /**
   * Sin lo social y sin espacio en este dispositivo (lo decide `App`). Con esto, una reseña abierta desde una
   * dirección copiada lleva a la página principal en vez de a la pasarela.
   */
  withoutSocial?: boolean;
}

const SocialHubInner = memo(function SocialHubInner({
  onAddGame,
  addTarget,
  gameListOf,
  moveGameToCurrentByName,
  games,
  withoutSocial = false,
}: SocialHubProps = {}) {
  // El view-model llega en PIEZAS por dominio (ver su `return`), y se desestructuran aquí mismo: lo que viaja a las
  // pantallas memoizadas son los mismos valores de siempre, no las piezas.
  const vm = useSocialViewModel({ games });
  // Al cambiar de pantalla, el foco no se queda en el `body` (ver el hook).
  useHubFocusOnNavigate();
  /* LA FICHA DE UN JUEGO, abierta encima del hub (F5 del plan de la ficha): desde un aviso del feed, el chip de una
     reseña o las listas de un perfil. Se pasa a las pantallas por props, que así siguen sin depender del router. */
  const { openSheet: openGameSheet } = useGameSheetParam();
  const {
    navigate, activePanel, socialCfgGistId, authUser, loading, showSocialSpace, hasMainSync, hasSocialGist,
    hasSocialSession, offline, serviceLimited, offlineHasCachedData, legalConsentRequired, savingConsent,
    acceptLegalConsent,
  } = vm.session;
  const { status, statusKind } = vm.feedback;
  const { gatewaySteps, currentStep, primaryGatewayCta, handleSignOut } = vm.gateway;
  const {
    hasCreatedProfile, profileName, setProfileName, hiddenTabs, setHiddenTabs, hideReplayable, setHideReplayable,
    hideRetry, setHideRetry, hideGameTime, setHideGameTime, showPhoto, setShowPhoto, ownPhotoIsGeneric,
    ownPublishablePhoto, hydratingProfile, savingProfile, completedGames, socialDisplayName, handleSaveProfile,
    hasUnsavedChanges,
  } = vm.profileEditor;
  // Rango propio: decide cuánto se ve del panel de estadísticas de un amigo.
  // Administración (el claim): ve la ficha de un amigo sin las restricciones de visibilidad.
  const { ownTier, isAdmin } = vm.viewer;
  const {
    canPublishPosts, postMaxLength, showPostCounter, publishingPost, handlePublishPost, changingPostId,
    handleEditPost, handleDeletePost,
  } = vm.compose;
  const {
    profileSearch, setProfileSearch, loadingDirectory, filteredSocialDirectory, visibleSocialDirectory,
  } = vm.directory;
  const {
    feedItems, groupedFeedItems, hasMoreFeed, showMoreFeed, handleActivityItemKeyDown, handleProfileCardKeyDown,
    yearSummarySignal, feedReadFailed, githubReconnectNeeded, likesFor, toggleLike,
  } = vm.feed;
  const {
    profileDetailId, profileReviewsView, profilePostsView, profileAchievementsView, profileGlobalsView,
    selectedProfileDetail, activeProfileReview, activeProfileReviewEvent, activeDetailEvent, detailEventLoading,
    profileDetailLoading, detailReviewLoading, profileReviewLoading, getGameItemById, relatedReviews,
    openOwnProfileDetail, isOwnProfileDetail, isOwnDetailEvent, lastCompletedByProfile,
  } = vm.reading;
  const { ownAchievements, ownAchievementMirror } = vm.achievements;
  /**
   * UNA RESEÑA QUE ESTA PERSONA NO PUEDE VER, abierta desde una dirección copiada (ver
   * `useUnavailableReviewRedirect`). Solo cuenta lo DEFINITIVO: con el espacio abierto y todo cargado. Sin red, con
   * el servicio limitado o con las condiciones nuevas por aceptar, no encontrarla es culpa de lo que falta, no de que
   * no pueda verla, y se le deja donde está.
   */
  const reviewUnavailable = !loading && showSocialSpace && Boolean(authUser) && !offline && !serviceLimited
    && !legalConsentRequired
    && (
      (activePanel === 'detail' && !activeDetailEvent && !detailEventLoading)
      || (activePanel === 'profile-review' && !activeProfileReview && !profileDetailLoading && !profileReviewLoading)
    );
  // Sin lo social, cualquier reseña: no hay forma de verla, y la pasarela no es lo que se vino a buscar.
  const reviewWithoutSocial = withoutSocial && (activePanel === 'detail' || activePanel === 'profile-review');
  useUnavailableReviewRedirect(reviewUnavailable || reviewWithoutSocial);
  const {
    openProfileReviews, closeProfileReviews, openProfilePosts, closeProfilePosts, openProfileAchievements,
    openProfileSummary, closeProfileAchievements, openProfileGlobals, openProfileReviewDetail, openRelatedReview,
    openActivityDetail, openMoveReview, openProfileDetail,
  } = vm.nav;
  const {
    loadingFriendships, friendshipBusyUid, pendingIncomingCount, incomingRequests, friendsList,
    likeNotifications, newLikeNotifications,
    relationshipWith, handleAddOrAcceptFriend, handleCancelFriendRequest, handleRejectFriendRequest,
    handleRemoveFriend, friendActionTarget, confirmFriendAction, cancelFriendAction,
  } = vm.friends;

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
  // La conexión con GitHub de la aplicación: la pasarela la ofrece en su primer paso (ver `SocialGateway`) y el feed
  // la usa para volver a conectar. `null` cuando el hub se monta suelto (pruebas de componente).
  const githubConnection = useGithubConnection();
  // El atajo de Google del primer paso: recuperar GitHub y el espacio desde la cuenta (ver el hook).
  const gatewayRecovery = useGatewayRecovery(githubConnection, hasMainSync, authUser?.uid);
  const handleAcceptLegalConsent = useCallback(() => { void acceptLegalConsent(); }, [acceptLegalConsent]);
  const handleGatewaySignOut = useCallback(() => { void handleSignOut(); }, [handleSignOut]);

  /**
   * EL BOTÓN DE VOLVER A CONECTAR GITHUB del feed: el MISMO de Ajustes (`onOAuthLogin`), que al terminar devuelve a
   * la pantalla de la que se salió. Sin OAuth en el build (o sin proveedor), lleva a Ajustes, que es donde se pega
   * un token a mano. Memoizado: el feed es un `memo` y un objeto nuevo por render lo repintaría entero.
   */
  const oauthLogin = githubConnection?.oauthEnabled ? githubConnection.onOAuthLogin : null;
  const oauthBusy = Boolean(githubConnection?.oauthLoggingIn);
  const githubReconnect = useMemo(
    () => (githubReconnectNeeded
      ? { onReconnect: oauthLogin || (() => { void navigate('/ajustes'); }), busy: oauthBusy }
      : null),
    [githubReconnectNeeded, oauthLogin, oauthBusy, navigate],
  );

  const goToProfileEdit = useCallback(() => navigate('/social/profile'), [navigate]);
  const goToProfiles = useCallback(() => navigate('/social/profiles'), [navigate]);
  const goToRequests = useCallback(() => navigate('/social/requests'), [navigate]);
  // Una fila de «me gusta» de la campana abre lo tuyo que ha gustado: la reseña, con el mismo detalle que su tarjeta
  // del feed, o tus publicaciones.
  const openLikeNotification = useCallback(
    (row: LikeNotification) => {
      if (row.own.on === 'post') openProfilePosts(OWN_PROFILE_ALIAS);
      else if (row.own.gameId) openActivityDetail({ actorProfileId: row.own.to, gameId: row.own.gameId, type: 'review' });
    },
    [openProfilePosts, openActivityDetail],
  );
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
    // Los logros de alguien, solo si es tu amigo: de quien no lo es se enseña el nombre y nada más, y la ruta de sus
    // logros se puede abrir a mano. Su espejo sigue contando, sin identidad, en el porcentaje de la comunidad.
    if (!entry || relationshipWith(entry.uid) !== 'friends') return '';
    return entry.achievementsMirror || '';
  }, [detailId, visibleSocialDirectory, isOwnProfileDetail, ownAchievementMirror, relationshipWith]);

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
  const toggleDetailPosts = useCallback(
    () => (profilePostsView ? closeProfilePosts(detailId) : openProfilePosts(detailId)),
    [profilePostsView, closeProfilePosts, openProfilePosts, detailId],
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
  // El «Ver análisis» del listado del perfil: la misma pantalla que abre su pestaña de reseñas, pero volviendo a
  // la FICHA (`backTo`), que es de donde se sale, y no a esa lista, por la que no se ha pasado.
  const detailReviewLink = useCallback(
    (gameId: number) => ({
      to: generatePath(SOCIAL_ROUTES.profileReview, { profileId: detailId, gameId: String(gameId) }),
      state: { backTo: location.pathname },
    }),
    [detailId, location.pathname],
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
          // El sello de rango solo lo ve la administración: al resto no se le nombran los rangos.
          tier={isAdmin ? ownTier : undefined}
          profileName={profileName}
          setProfileName={setProfileName}
          completedGames={completedGames}
          hydratingProfile={hydratingProfile}
          savingProfile={savingProfile}
          hasCreatedProfile={hasCreatedProfile}
          hasUnsavedChanges={hasUnsavedChanges}
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
          openGameSheet={openGameSheet}
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
          coversAllowed="solo-cache"
          likeBar={activeDetailEvent && activeDetailEvent.type === 'review' ? (
            <FeedLikeBar
              SOCIAL_UI={SOCIAL_UI}
              likes={likesFor(activeDetailEvent)}
              own={isOwnDetailEvent}
              author={activeDetailEvent.profileDisplayName}
              onToggle={() => toggleLike(activeDetailEvent)}
              everyone
            />
          ) : null}
          related={(
            <RelatedReviews
              SOCIAL_UI={SOCIAL_UI}
              items={relatedReviews}
              onOpen={openRelatedReview}
              coversAllowed="solo-cache"
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
          openGameSheet={openGameSheet}
          SOCIAL_UI={SOCIAL_UI}
          activeProfileDetail={selectedProfileDetail}
          profileLoading={profileDetailLoading}
          isOwnProfile={isOwnProfileDetail}
          onEditProfile={goToProfileEdit}
          onBack={goToSocial}
          showReviews={profileReviewsView}
          achievementsMirror={detailMirror}
          palmares={detailPalmares}
          onOpenAchievements={openDetailAchievements}
          onToggleReviews={toggleDetailReviews}
          showPosts={profilePostsView}
          onTogglePosts={toggleDetailPosts}
          // Editar exige un rango que publique; borrar, no (ver `useSocialCompose`).
          canEditPosts={canPublishPosts}
          postMaxLength={postMaxLength}
          showPostCounter={showPostCounter}
          changingPostId={changingPostId}
          onEditPost={isOwnProfileDetail ? handleEditPost : undefined}
          onDeletePost={isOwnProfileDetail ? handleDeletePost : undefined}
          onOpenReview={openDetailReview}
          reviewLink={detailReviewLink}
          profileId={detailId}
          status={status}
          statusKind={statusKind}
          onAddGame={onAddGame}
          addTarget={addTarget}
          gameListOf={gameListOf}
          moveGameToCurrentByName={moveGameToCurrentByName}
          friendshipState={selectedProfileDetail ? relationshipWith((selectedProfileDetail as { uid?: string }).uid || '') : 'none'}
          friendshipBusy={Boolean(selectedProfileDetail) && friendshipBusyUid === (selectedProfileDetail as { uid?: string }).uid}
          onAddOrAcceptFriend={addOrAcceptDetailFriend}
          onCancelFriendRequest={cancelDetailFriendRequest}
          onRemoveFriend={removeDetailFriend}
          viewerTier={ownTier}
          viewerIsAdmin={isAdmin}
          viewerHiddenTabs={hiddenTabs}
          viewerCompleted={games?.c}
          viewerPending={games?.p}
          // `addTarget` es `d` justo cuando la lista de deseos está a la vista (Ajustes → Diseño): oculta, tampoco
          // se proponen sus juegos en el resumen.
          viewerWished={addTarget === 'd' ? games?.d : undefined}
          // La tarjeta del feed y el aviso del 15 llegan con el resumen ya desplegado (estado de la navegación).
          openSummaryOnMount={wantsYearSummary(location.state)}
          yearSummarySignal={yearSummarySignal}
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
          openGameSheet={openGameSheet}
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
             perfil: de la estantería de otra persona, lo ya resuelto y lo que quepa en el cupo de lo ajeno, y
             encima manda la preferencia de quien mira (ver `useReviewCover`). */
          coversAllowed="solo-cache"
          // El mismo «Me gusta» que en el feed, porque es la misma reseña: va a su entrada en el gist social. Si no
          // está publicada en lo social no hay entrada, y no hay botón.
          likeBar={activeProfileReviewEvent ? (
            <FeedLikeBar
              SOCIAL_UI={SOCIAL_UI}
              likes={likesFor(activeProfileReviewEvent)}
              own={isOwnProfileDetail}
              author={(selectedProfileDetail as { displayName?: string })?.displayName || activeProfileReviewEvent.profileDisplayName}
              onToggle={() => toggleLike(activeProfileReviewEvent)}
              everyone
            />
          ) : null}
          related={(
            <RelatedReviews
              SOCIAL_UI={SOCIAL_UI}
              items={relatedReviews}
              onOpen={openRelatedReview}
              coversAllowed="solo-cache"
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
            likeNotifications={likeNotifications}
            onOpenLike={openLikeNotification}
            loading={loadingFriendships}
            busyUid={friendshipBusyUid}
            onAccept={handleAddOrAcceptFriend}
            onReject={handleRejectFriendRequest}
            onBack={goToSocial}
            status={status}
            statusKind={statusKind}
            showTiers={isAdmin}
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
            showLastSeen={isAdmin}
            lastCompletedByProfile={lastCompletedByProfile}
          />
          {/* Aquí el botón "Pendiente" retira la petición enviada, y eso ahora se confirma. */}
          {friendActionDialog}
        </>
      );
    }
    return (
      <SocialFeedScreen
        openGameSheet={openGameSheet}
        SOCIAL_UI={SOCIAL_UI}
        hasFriends={friendsList.length > 0}
        feedReadFailed={feedReadFailed}
        githubReconnect={githubReconnect}
        socialDisplayName={socialDisplayName}
        ownVisiblePhotoURL={ownPublishablePhoto}
        currentSocialGistId={socialCfgGistId}
        loadingDirectory={loadingDirectory}
        openProfileDetail={openDirectoryProfile}
        openProfileAchievements={openProfileAchievements}
        openProfileSummary={openProfileSummary}
        onOpenProfiles={goToProfiles}
        onOpenOwnProfile={openOwnProfileDetail}
        onOpenRequests={goToRequests}
        bellVisible={pendingIncomingCount > 0 || likeNotifications.length > 0}
        bellCount={pendingIncomingCount + newLikeNotifications}
        groupedFeedItems={groupedFeedItems}
        feedItems={feedItems}
        hasMoreFeed={hasMoreFeed}
        showMoreFeed={showMoreFeed}
        openActivityDetail={openActivityDetail}
        openMoveReview={openMoveReview}
        likesFor={likesFor}
        toggleLike={toggleLike}
        handleActivityItemKeyDown={handleActivityItemKeyDown}
        publishingPost={publishingPost}
        handlePublishPost={handlePublishPost}
        canPublishPosts={canPublishPosts}
        postMaxLength={postMaxLength}
        showPostCounter={showPostCounter}
        status={status}
        statusKind={statusKind}
        offline={offline}
        offlineHasCachedData={offlineHasCachedData}
        serviceLimited={serviceLimited}
      />
    );
  }

  return (
    <SocialGateway
      steps={gatewaySteps}
      currentStep={currentStep}
      hasMainSync={hasMainSync}
      hasSocialSession={hasSocialSession}
      hasSocialGist={hasSocialGist}
      sessionName={authUser?.displayName || authUser?.email || ''}
      primaryCta={primaryGatewayCta}
      githubConnection={githubConnection}
      recovery={gatewayRecovery}
      offline={offline}
      serviceLimited={serviceLimited}
      legalConsentRequired={legalConsentRequired}
      savingConsent={savingConsent}
      onAcceptLegalConsent={handleAcceptLegalConsent}
      onSignOut={handleGatewaySignOut}
      status={status}
      statusKind={statusKind}
    />
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
