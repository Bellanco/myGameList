import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYearSummarySignal } from './social/useYearSummarySignal';
import { writeCanPublishHint } from '../model/repository/socialShellHint';
import { reconcileReviewActivity } from '../model/repository/socialActivityReconcile';
import { PUBLIC_NAME_MAX_LENGTH, safeTrim } from '../core/security/sanitize';
import { useOnlineStatus } from '../view/hooks/useOnlineStatus';
import { resolveViewer, withVisiblePhotos } from '../core/social/photoVisibility';
import { useGenericPhoto } from '../view/hooks/useGenericPhoto';
import { useIsAdmin } from '../view/hooks/useIsAdmin';
import type { TabData } from '../model/types/game';
import { resolveStableProfileId, type FriendshipSelfInfo } from '../model/repository/firebaseRepository';
// Reexportados: las pantallas del hub y los tests los importan de aquí desde antes de que el ViewModel se
// partiera, y cambiarles el import no aportaría nada.
export { isOwnProfileIdentity } from './social/socialIdentity';
export type { SocialDirectoryEntry } from './social/socialFeed';
import { isOwnProfileIdentity } from './social/socialIdentity';
import type { SocialDirectoryEntry } from './social/socialFeed';
import { buildFriendshipViews } from './social/friendshipViews';
import { useSocialDirectory } from './social/useSocialDirectory';
import { useSocialDiscover } from './social/useSocialDiscover';
import { useSocialFriendships } from './social/useSocialFriendships';
import { useSocialNavigation } from './social/useSocialNavigation';
import { useSocialStartupTasks } from './social/useSocialStartupTasks';
import { loadLocalState } from '../model/repository/localRepository';
import { matchSocialRoute, OWN_PROFILE_ALIAS } from './social/socialRoutes';


/** Referencia estable: un `new Map()` inline rompería el memo del feed en cada render. */
import { useSocialCompose, type OwnPostChange } from './social/useSocialCompose';
import { useSocialLegalConsent } from './social/useSocialLegalConsent';
import { DEFAULT_SOCIAL_VISIBILITY, hasUnsavedProfileChanges, useSocialProfileForm } from './social/useSocialProfileForm';
import { useSocialReading } from './social/useSocialReading';
import { useOwnAchievements } from './social/useOwnAchievements';
import { useSocialGateway } from './social/useSocialGateway';
import { useSecretChannelMigration } from './social/useSecretChannelMigration';
import { useOwnProfileRank } from './social/useOwnProfileRank';
import { useOwnPhotoHeal } from './social/useOwnPhotoHeal';
import { useOwnProfileEditor } from './social/useOwnProfileEditor';
import { useSocialFeedback } from './social/useSocialFeedback';
import { useSocialSession } from './social/useSocialSession';
import { useSocialFeed } from './social/socialFeed';
export type { RelatedReview } from '../core/social/relatedReviews';
// Re-exportados: las pantallas del hub los importan desde este ViewModel desde antes de la extracción.
export type {
  SocialActivityFeedItem,
  SocialFeedDayGroup,
  SocialFeedItem,
  SocialMoveFeedItem,
  SocialPostFeedItem,
} from './social/socialFeed';
import type { SocialActivityFeedItem } from './social/socialFeed';

const isProfileEditorLocked = (mustCreateProfile: boolean, hasBlockingSocialIssue: boolean): boolean => {
  return mustCreateProfile || hasBlockingSocialIssue;
};


/**
 * Identidad del autor con la que se enriquece cada elemento del feed al hidratar el directorio.
 *
 * Estos tipos vivían DENTRO del hook, así que las pantallas que los consumen no podían nombrarlos y tipaban sus
 * props como `any[]` — precisamente en la vista más caliente y con más ramas del hub (actividad vs publicación).
 * Al exportarlos, el discriminante `kind` deja de ser una convención tácita y pasa a comprobarlo el compilador.
 */
// Tope de perfiles del directorio social, ORDENADOS POR USO RECIENTE (`profiles.updatedAt`). Solo los AMIGOS
// cuestan una lectura de gist; los demás son index-only (nombre/foto de Firestore), así que subir este número
// cuesta lecturas de documento de Firestore, no rate-limit de GitHub. Tunable.
// Antigüedad máxima del último uso de un AMIGO para que su actividad entre en el feed. Un amigo más inactivo
// sigue en Perfiles y en la lista de amigos, y su perfil/reseñas se abren igual (salen de su gist de JUEGOS);
// simplemente su actividad no ocupa el feed y no se gasta una lectura de su gist social. Si no se conoce su
// recencia (no está en el directorio) NO se corta: nunca se oculta contenido por falta de datos. Tunable.
// C3: el directorio se hidrata leyendo el gist social de cada perfil. En vez de disparar TODAS las lecturas a la
// vez (ráfaga que puede activar los "secondary rate limits" de GitHub al crecer el directorio), se limita la
// concurrencia. Las lecturas son baratas (caché de sesión + revalidación ETag/304), así que el coste en latencia
// de la carga fría es pequeño y se gana robustez frente a 403 por ráfaga.
// Cuánta actividad se conserva por perfil al hidratar el directorio. El feed solo pinta las más recientes, pero la
// pestaña Reseñas del perfil FECHA Y ORDENA cada reseña con su publicación: con un tope de 40, las reseñas por
// debajo del corte se quedaban sin fecha publicada y caían al `_ts` del juego (que una importación sella en
// bloque), así que el listado mostraba fechas distintas del feed. Se iguala al tope del propio gist (320).
// Las publicaciones sí se quedan en el tope del feed: ninguna vista las lista por separado.
// F4 — mensajes de lista por perfil. Más alto que las publicaciones porque son varios por juego y el filtro de
// quien mira puede dejar visible solo una lista: cortar corto dejaría esa lista casi vacía. Y más bajo que la
// actividad porque ninguna vista los lista aparte del feed.

/**
 * ViewModel del Hub social (M3). Extraído VERBATIM de SocialHub.tsx (god component) sin cambio de
 * comportamiento: mismo estado, mismos efectos, mismas dependencias y misma lógica. `SocialHub.tsx`
 * queda presentacional y consume este hook.
 */




export function useSocialViewModel(options?: {
  /**
   * Listados VIVOS de la app. La reconciliación de actividad decide con ellos qué reseñas publicar y qué
   * entradas huérfanas retirar, así que importa que no sean una foto tomada al montar: si no llegan, se cae a
   * `loadLocalState()` (que sí lo es) y la guarda de reloj de la reconciliación evita retiradas indebidas.
   */
  games?: TabData;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * ¿Hay conexión? El espacio social vive de la red (Firestore para el directorio y las amistades, gists para la
   * actividad), así que sin ella solo puede mostrar lo que quedó guardado en este dispositivo. Se expone a la
   * interfaz para poder DECIRLO —un aviso persistente con las palabras de la aplicación— en lugar de dejar que el
   * usuario deduzca lo que pasa a partir del error de red de la librería que lo lanzó.
   */
  const online = useOnlineStatus();

  const routeState = useMemo(() => matchSocialRoute(location.pathname), [location.pathname]);
  const { activePanel, profileDetailId, profileReviewsView, profilePostsView, profileAchievementsView, profileGlobalsView } = routeState;

  // Va ANTES de la sesión porque el arranque la usa: si el canal apuntado ya no existe, se sigue con la sesión pero
  // con el editor de perfil delante.
  const [mustCreateProfile, setMustCreateProfile] = useState(false);
  const lockProfileEditor = useCallback(() => {
    setMustCreateProfile(true);

    if (activePanel !== 'profile') {
      void navigate('/social/profile');
    }
  }, [activePanel, navigate]);

  /**
   * LA SESIÓN Y EL CANAL: quién eres en Google, tu gist social y la configuración de la sincronización principal,
   * resueltos al montar (`social/useSocialSession`). Lo lee casi todo el hub, por eso va arriba del todo.
   */
  const {
    authUser,
    setAuthUser,
    socialCfgGistId,
    setSocialCfgGistId,
    socialCfgEtag,
    setSocialCfgEtag,
    mainSyncConfig,
    loading,
    showSocialSpace,
    setShowSocialSpace,
  } = useSocialSession({ lockProfileEditor, navigate });


  /**
   * ¿La foto de la sesión es el avatar GENÉRICO de Google —el monograma con la inicial— y no una foto de verdad?
   * (ver `core/social/googlePhoto`). Google no deja a nadie sin `photoURL`, así que sin esto una cuenta sin foto
   * pasaba por tenerla: publicaba el monograma y, por la reciprocidad, veía las caras de sus amigos sin poner la suya.
   */
  const ownPhotoIsGeneric = useGenericPhoto(authUser?.photoURL);
  /**
   * ¿Quien mira es la administración? Lo decide el claim `admin` del token, como en las reglas y en el panel, y NO
   * el rango: mithril es una etiqueta que puede llevar el administrador, no lo que le da sus excepciones (fotos,
   * listas ocultas, panel completo de estadísticas de un amigo).
   */
  const isAdmin = useIsAdmin();
  // P1: profileId canónico del usuario (6.2a), para detectar propiedad por identidad (no por email). Hoy el id del
  // doc de directorio es el uid; tras el cutover index-only será el profileId → comprobamos ambos (ver isOwnProfileIdentity).
  const [ownProfileId, setOwnProfileId] = useState<string | null>(null);
  /**
   * ¿Se ha intentado ya resolver el `ownProfileId`? Igual que con el rango, "todavía no se sabe" y "no tiene" NO
   * son lo mismo: la hidratación del directorio decide con él cuál es la entrada PROPIA, y por tanto si lee el
   * gist social de uno mismo. Hidratar antes de saberlo deja la propia actividad fuera del feed.
   */
  const [ownProfileIdResolved, setOwnProfileIdResolved] = useState(false);
  /**
   * TU RANGO Y LO QUE YA ESTÁ PUBLICADO DE TI, de una sola lectura de tu perfil (`social/useOwnProfileRank`): el
   * rango decide la cadencia del feed, y lo publicado es el suelo de tus logros.
   */
  const { ownTier, ownProfileCreatedAt, ownProfilePublished, ownPublishedMirror, tierResolved } = useOwnProfileRank(authUser);
  /**
   * LOS AVISOS DEL ESPACIO SOCIAL: el mensaje de estado y su tono, el bloqueo por error, y los dos avisos
   * persistentes de sin red y servicio limitado (`social/useSocialFeedback`).
   */
  const {
    status,
    statusKind,
    hasBlockingSocialIssue,
    networkFailure,
    setNetworkFailure,
    serviceLimited,
    setFeedback,
    reportFailure,
    markSocialServiceHealthy,
  } = useSocialFeedback();
  const [hasCreatedProfile, setHasCreatedProfile] = useState(false);
  const [justSavedProfile, setJustSavedProfile] = useState(false);
  // Estado editable del perfil (nick + visibilidad), agrupado: los seis campos viajan siempre juntos.
  const profileForm = useSocialProfileForm();
  const {
    profileName, setProfileName, hiddenTabs, setHiddenTabs, showPhoto, setShowPhoto,
    hideReplayable, setHideReplayable, hideRetry, setHideRetry, hideGameTime, setHideGameTime,
    // `hydrate` sale del objeto para poder LLAMARLA suelta: invocada como método (`hydrateProfileForm(...)`),
    // la regla de dependencias exige el objeto entero, y `useSocialProfileForm` devuelve un literal nuevo en cada
    // render — depender de él recrearía los callbacks siempre y traería de vuelta las hidrataciones repetidas que
    // el resto del fichero evita. Desestructurada es una referencia estable (`useCallback([])`).
    hydrate: hydrateProfileForm,
    saved: savedProfile,
    visibility: profileVisibility,
  } = profileForm;
  /**
   * La foto propia que SE PUEDE PUBLICAR, ya filtrada por las dos condiciones: que el usuario quiera mostrarla
   * (`showPhoto`) y que sea una foto de verdad (no el monograma de Google). Se deriva una vez y la usan TODOS los
   * puntos que la sacan al mundo —el saneo de amistades, la migración de canal, el guardado del perfil, la entrada
   * propia del directorio— para que ninguno pueda quedarse con la regla a medias.
   */
  const ownPublishablePhoto = showPhoto && !ownPhotoIsGeneric ? authUser?.photoURL || '' : '';
  /**
   * ¿Hay una foto de sesión cuyo veredicto TODAVÍA no ha llegado? Lo miran los saneos que corren una sola vez por
   * sesión y se arman con una ref: publicar antes de saberlo dejaría la URL genérica sellada en los canales, y no
   * habría otra pasada hasta la próxima sesión. Esperar cuesta una respuesta de red ya cacheada.
   */
  const ownPhotoVerdictPending = Boolean(authUser?.photoURL) && ownPhotoIsGeneric === undefined;
  // Filtro por nombre de la pantalla "Perfiles" (directorio social). El feed de actividad ya no se filtra.
  const [profileSearch, setProfileSearch] = useState('');
  /**
   * ¿Ha terminado ya una pasada de hidratación del directorio (por caché o por red)?
   *
   * `loadingDirectory` solo cubre la hidratación EN VUELO, y hasta ella hay toda una ventana previa que no cubría
   * nadie: resolver las amistades (query a Firestore, porque el feed es solo-amigos) y leer la caché de IndexedDB.
   * Durante esa ventana el feed se pintaba con `socialDirectory` vacío y `loadingDirectory` en false, así que
   * enseñaba su estado VACÍO —"Descubre perfiles y añade amigos"— a alguien que sí tiene amigos y cuyo feed
   * todavía estaba cargando. De ahí la secuencia carga → vacío → carga → contenido.
   *
   * Esta marca distingue "el directorio está vacío" de "el directorio aún no se sabe", que es lo que la pantalla
   * necesita para elegir entre el vacío y el esqueleto.
   */
  // Directorio CRUDO, tal y como lo deja la hidratación (y como se cachea en IndexedDB). Lo que consume la pantalla
  // es `socialDirectory`, unas líneas más abajo: el mismo directorio con la política de fotos ya aplicada.
  // Los listados de OTRAS personas viven en `useForeignProfileGames` (se invoca más abajo, cuando ya están
  // resueltos el directorio y la relación de amistad que necesita para decidir si puede pedirlos).





  const hasMainSync = Boolean(mainSyncConfig?.token && mainSyncConfig?.gistId);
  const hasSocialGist = Boolean(socialCfgGistId);
  const hasSocialSession = Boolean(authUser);
  // L4 — el espacio social no se abre hasta que consta la aceptación de las condiciones/privacidad vigentes.
  const legalConsent = useSocialLegalConsent(authUser?.uid, setFeedback);
  const legalGateOpen = legalConsent.gateOpen;
  // El espacio social ABIERTO de verdad: el estado latente (`showSocialSpace`, que fijan la hidratación inicial y
  // el alta) filtrado por la puerta legal. Todo lo que carga o publica datos sociales cuelga de esto, así que un
  // usuario sin la aceptación vigente no llega a leer ni escribir nada del canal social.
  const socialSpaceOpen = showSocialSpace && legalGateOpen;

  /**
   * Identidad denormalizada que viaja al documento de amistad: nick público, foto publicable y los dos gists.
   *
   * El nombre va RECORTADO a `PUBLIC_NAME_MAX_LENGTH`, que es lo que aceptan las reglas de `friendships`
   * (`denormTextIsSane`: 35). El nick del gist admite hasta 500 (`SOCIAL_NAME_MAX`) y el editor de perfil corta
   * en ese mismo tope, pero entre medias está el nombre de la cuenta de Google, que entra por el respaldo sin pasar
   * por ninguna pantalla: con más del tope, cada saneado intentaba una escritura que las reglas denegaban
   * —en cada apertura del hub, para siempre— y su identidad no llegaba nunca a sus amistades. `profiles` ya
   * recorta con esta misma cota (ver `repairProfileDisplayName`), así que los dos canales escriben lo mismo.
   */
  const buildFriendshipSelfInfo = useCallback((): FriendshipSelfInfo => ({
    name: safeTrim(profileName, PUBLIC_NAME_MAX_LENGTH),
    photo: ownPublishablePhoto,
    socialGistId: socialCfgGistId,
    gamesGistId: mainSyncConfig?.gistId || '',
  }), [ownPublishablePhoto, mainSyncConfig?.gistId, profileName, socialCfgGistId]);

  // ¿Cambios del perfil sin guardar? Contra lo último guardado, con la foto EFECTIVA (ver la función).
  const profileHasUnsavedChanges = useMemo(
    () => hasUnsavedProfileChanges(
      { name: profileName, visibility: profileVisibility },
      savedProfile,
      Boolean(authUser?.photoURL) && !ownPhotoIsGeneric,
    ),
    [authUser?.photoURL, ownPhotoIsGeneric, profileName, profileVisibility, savedProfile],
  );

  // Amistades: estado, derivados y mutaciones (ver `social/useSocialFriendships`). Se monta AQUÍ y no más abajo
  // porque `friendUidSet` lo necesita la política de fotos del directorio, que se calcula a continuación.
  const {
    friendships,
    loadingFriendships,
    friendshipsResolved,
    friendshipBusyUid,
    friendUidSet,
    pendingIncomingCount,
    relationshipWith,
    handleAddOrAcceptFriend,
    handleCancelFriendRequest,
    handleRejectFriendRequest,
    handleRemoveFriend,
    friendActionTarget,
    confirmFriendAction,
    cancelFriendAction,
  } = useSocialFriendships({
    myUid: authUser?.uid,
    socialGistId: socialCfgGistId,
    socialSpaceOpen,
    requestsPanelOpen: activePanel === 'requests',
    buildSelfInfo: buildFriendshipSelfInfo,
    setFeedback,
    reportFailure,
  });
  const legalConsentPending = legalConsent.pending;
  const hasReadyAccess = hasSocialSession && hasSocialGist && legalGateOpen;
  const profileEditorLocked = isProfileEditorLocked(mustCreateProfile, hasBlockingSocialIssue);

  /** Visibilidad con la que se interpreta un perfil ajeno que no declara la suya. */
  const defaultSocialVisibility = DEFAULT_SOCIAL_VISIBILITY;

  /**
   * ¿Toca cargar directorio en la pantalla actual? Se extrae a un BOOLEANO en vez de mirar `activePanel` porque
   * el disparo automático depende de él: con el panel entero, navegar feed→perfiles→feed rehidrataba el directorio
   * en cada salto (lectura de IndexedDB + array nuevo + recálculo completo del feed) sin que hubiera cambiado
   * absolutamente nada de lo que el directorio contiene. Así solo cambia al entrar o salir del editor de perfil.
   */
  const directoryPanelAllows = socialSpaceOpen && activePanel !== 'profile' && !profileEditorLocked;
  /** Las tres resoluciones asíncronas que la hidratación necesita conocer antes de empezar (ver más abajo). */
  const directoryInputsReady = friendshipsResolved && tierResolved && ownProfileIdResolved;

  // Directorio y feed: el estado, la caché y las 350 líneas de hidratación viven en `social/useSocialDirectory`.
  const {
    rawSocialDirectory: feedDirectory,
    directoryLoading,
    setDirectorySettled,
    hydrateSocialDirectory,
    patchDirectoryEntries,
  } = useSocialDirectory({
    enabled: directoryPanelAllows,
    inputsReady: directoryInputsReady,
    authUser,
    ownProfileId,
    ownTier,
    ownPublishablePhoto,
    socialGistId: socialCfgGistId,
    friends: friendships.friends,
    defaultSocialVisibility,
    setFeedback,
    reportFailure,
    setNetworkFailure: markSocialServiceHealthy,
  });

  // «Perfiles» y el porcentaje de logros de la comunidad necesitan también a quien NO es tu amigo, y eso tiene su
  // propia consulta (los recientes, `useSocialDiscover`) que solo se lanza cuando se abre una de esas pantallas. El
  // feed no la paga: lo suyo son tus amigos, leídos por uid.
  const discoverOpen =
    directoryPanelAllows &&
    (activePanel === 'profiles' || (activePanel === 'profile-detail' && (profileAchievementsView || profileGlobalsView)));
  // La ficha de alguien que no está en ninguna de las dos listas (enlace directo): se lee ese perfil suelto. Solo con
  // el feed ya asentado, o se leería por separado a un amigo que está a punto de llegar con él.
  const missingProfileId =
    directoryPanelAllows &&
    activePanel === 'profile-detail' &&
    !directoryLoading &&
    profileDetailId &&
    profileDetailId !== OWN_PROFILE_ALIAS &&
    !feedDirectory.some((entry) => entry.id === profileDetailId)
      ? profileDetailId
      : '';
  const { discoverEntries, discoverLoading } = useSocialDiscover({
    enabled: discoverOpen,
    missingProfileId,
    authUid: authUser?.uid || '',
    ownTier,
    defaultSocialVisibility,
    reportFailure,
  });
  const rawSocialDirectory = useMemo(() => {
    if (discoverEntries.length === 0) return feedDirectory;
    const known = new Set(feedDirectory.map((entry) => entry.uid));
    const strangers = discoverEntries.filter(
      (entry) => !known.has(entry.uid) && !isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId),
    );
    return strangers.length > 0 ? [...feedDirectory, ...strangers] : feedDirectory;
  }, [feedDirectory, discoverEntries, authUser?.uid, ownProfileId]);


  /**
   * LA PASARELA AL ESPACIO SOCIAL: iniciar sesión con Google, adoptar el canal que ya exista o crear uno, y el botón
   * que lleva al siguiente paso (`social/useSocialGateway`). La sesión y el canal siguen viviendo aquí, porque los
   * lee todo el hub: la pasarela recibe con qué cambiarlos.
   */
  const { gatewaySteps, currentStep, handleSignOut, primaryGatewayCta } = useSocialGateway({
    mainSyncConfig,
    hasMainSync,
    authUser,
    hasSocialGist,
    legalGateOpen,
    setAuthUser,
    setSocialCfgGistId,
    setSocialCfgEtag,
    setShowSocialSpace,
    setFeedback,
    reportFailure,
    navigate,
  });

  useEffect(() => {
    if (!hasReadyAccess || showSocialSpace) {
      return;
    }

    setShowSocialSpace(true);
    void navigate('/social');
  }, [hasReadyAccess, showSocialSpace, navigate, setShowSocialSpace]);



  // Se relee al ABRIR el espacio social, no solo al montar. De aquí sale `hasCompletedGames`, y con la foto del
  // montaje bastaba con que la biblioteca aún no estuviera en localStorage en ese instante (dispositivo nuevo, otro
  // origen, o la sincronización terminando después) para que el perfil se considerase incompleto y el usuario
  // acabara en el editor teniéndolo bien configurado. Sin refresco, el rebote no se deshacía ni al sincronizar.
  // `socialSpaceOpen` es el DISPARADOR, no una entrada del cálculo: `loadLocalState()` no lo lee, y por eso
  // ESLint lo da por sobrante. Quitarlo devolvería el bug que este memo vino a arreglar (la relectura al abrir).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localState = useMemo(() => loadLocalState(), [socialSpaceOpen]);

  // P1: resuelve el profileId canónico del usuario actual (best-effort) para la detección de propiedad por identidad.
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) {
      setOwnProfileId(null);
      setOwnProfileIdResolved(false);
      return;
    }
    let cancelled = false;
    resolveStableProfileId(uid)
      .then((pid) => {
        if (!cancelled) setOwnProfileId(pid || null);
      })
      .catch(() => {
        /* Firestore caído → la propiedad cae a comparar por uid (entry.id === uid hoy). */
      })
      .finally(() => {
        // Resuelto SIEMPRE, también si falla: sin profileId la propiedad se decide por uid, que es el
        // comportamiento degradado de siempre. Lo que no puede pasar es quedarse esperando para siempre.
        if (!cancelled) setOwnProfileIdResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);

  // SANEADOS DE ARRANQUE. Eran cuatro efectos aquí —identidad en los docs de amistad, réplica del nick, retirada
  // de los ids públicos y latido de uso—, cada uno con su `useRef` de una vez. Ese `useRef` moría con el
  // desmontaje del hub, así que abrir el espacio social varias veces en una sesión los repetía todos. Ahora la
  // política vive escrita una vez, con sello persistente por dispositivo: ver `useSocialStartupTasks`.
  // Amistades aceptadas que pedí yo y aún no llevan mis ids de gist: la petición sale sin ellos y el arranque los
  // escribe en cuanto la ve aceptada (ver `useSocialStartupTasks`, tarea `friendshipIdsAfterAccept`).
  const acceptedWithoutMyIds = useMemo(
    () => friendships.friends.filter((view) => view.ownGistIdsMissing).map((view) => view.docId),
    [friendships.friends],
  );

  useSocialStartupTasks({
    socialSpaceOpen,
    uid: authUser?.uid,
    socialGistId: socialCfgGistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    profileName,
    ownPublishablePhoto,
    ownPhotoVerdictPending,
    acceptedWithoutMyIds,
  });

  // FASE 2 — MIGRACIÓN A CANAL SECRETO, una vez por sesión: `social/useSecretChannelMigration`.
  useSecretChannelMigration({
    socialSpaceOpen,
    authUser,
    socialCfgGistId,
    mainSyncConfig,
    profileName,
    ownPublishablePhoto,
    setSocialCfgGistId,
    setSocialCfgEtag,
    setFeedback,
  });

  // AUTO-HEAL DEL DIRECTORIO: RETIRADO. Su trabajo era mantener `profiles/{uid}.social.gistId` al día, y ese campo
  // ha dejado de publicarse (se purga en cada guardado): volver a escribirlo aquí lo resucitaría en cada apertura
  // del hub, justo lo contrario de lo que se busca.
  //
  // Lo que sigue haciendo falta lo cubre `healOwnFriendshipIdentity`, arriba: propaga el gist de la sesión a los
  // documentos de amistad, que es donde ahora lo leen las amistades.

  // EL LATIDO DE USO RECIENTE (`profiles.updatedAt`, por el que ordena el directorio y con el que el feed decide
  // si un amigo sigue activo) también se ha ido a `useSocialStartupTasks`. Su acotado —una escritura al día por
  // dispositivo— sigue viviendo en el repositorio, para que los dos latidos no puedan quedarse con intervalos
  // distintos.

  // Tras un cambio de amistad (aceptar/eliminar), el conjunto de amigos cambia y con él la actividad que debe salir
  // en el feed. Se invalida la caché del directorio (feed solo-amigos) y se refresca la amistad; el efecto que
  // depende de `friendships.friends` rehidrata el directorio releyendo los gists de los amigos actuales.
  // RECIPROCIDAD DE LA FOTO (ver core/social/photoVisibility): quien esconde la suya no ve la de nadie, y la de los
  // demás solo se ve con amistad aceptada. La administración (el claim) queda exenta.
  //
  // Se aplica AQUÍ, sobre el directorio ya hidratado, y no al hidratarlo: la hidratación cachea su resultado en
  // IndexedDB con el TTL del rango, así que sellar la política ahí dejaba el ajuste sin efecto hasta que la caché
  // caducara —el usuario esconde su foto, guarda, y sigue viendo las caras de los demás—. Derivándolo, el cambio se
  // ve en el mismo render y la caché conserva el dato crudo.
  // `resolveViewer` y no `showPhoto` a secas: quien lleva el interruptor activado pero no tiene foto en su cuenta de
  // Google no publica ninguna, así que tampoco ve las de los demás. Ver la nota del ajuste, que lo explica en su sitio.
  const photoViewer = useMemo(
    () => resolveViewer({ showPhoto, ownPhotoURL: authUser?.photoURL, ownPhotoIsGeneric, isAdmin }),
    [showPhoto, authUser?.photoURL, ownPhotoIsGeneric, isAdmin],
  );

  /**
   * EL AJUSTE SE APAGA SOLO cuando la cuenta no tiene foto —o cuando lo que tiene es el avatar genérico de Google,
   * que a estos efectos es lo mismo: una imagen que no es la cara de nadie.
   *
   * No basta con pintar el interruptor apagado: el perfil de los usuarios que ya existen guarda `showPhoto: true`, y
   * ese dato dejaría de describir la realidad —dice que muestra una foto que nadie ve—. Apagando el ESTADO, el
   * siguiente guardado del perfil lo deja coherente en el gist sin forzar ninguna escritura extra ahora.
   *
   * Y al revés: si más adelante añade una foto a su cuenta, esto no la vuelve a encender. El interruptor se
   * desbloquea apagado y activarlo es su decisión, que es lo que un ajuste debe ser.
   *
   * Solo actúa con sesión resuelta: sin `authUser` no se sabe si hay foto o no, y apagarlo por no saber sería
   * cambiarle el ajuste a ciegas.
   */
  useEffect(() => {
    if (!authUser?.uid) return;
    if (authUser.photoURL && !ownPhotoIsGeneric) return;
    if (showPhoto) setShowPhoto(false);
  }, [authUser?.uid, authUser?.photoURL, ownPhotoIsGeneric, showPhoto, setShowPhoto]);
  const socialDirectory = useMemo(
    () =>
      withVisiblePhotos(rawSocialDirectory, {
        viewer: photoViewer,
        friendUids: friendUidSet,
        isOwnEntry: (entry) => isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId),
      }) as SocialDirectoryEntry[],
    [rawSocialDirectory, photoViewer, friendUidSet, authUser?.uid, ownProfileId],
  );

  // El RESUMEN DEL AÑO: abrir el tuyo en temporada publica en tu perfil que ya lo has visto, y eso es lo que pinta
  // la tarjeta destacada en el feed de tus amistades. Lo ya publicado se lee de tu propia entrada del directorio.
  const ownYearSummarySeenYear = useMemo(() => {
    const own = socialDirectory.find((entry) => isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId));
    return own?.yearSummarySeen?.year ?? null;
  }, [socialDirectory, authUser?.uid, ownProfileId]);
  const markOwnYearSummaryOpened = useYearSummarySignal({
    uid: authUser?.uid || '',
    published: ownProfilePublished,
    alreadySeenYear: ownYearSummarySeenYear,
  });

  // Filas enriquecidas de la bandeja y la gestión. El cálculo vive en `social/friendshipViews` (puro): necesita el
  // directorio, que a su vez necesita saber quiénes son tus amigos, así que dentro del hook de amistades cerraría
  // un círculo entre los dos.
  const { incoming: incomingRequests, outgoing: outgoingRequests, friends: friendsList } = useMemo(
    () => buildFriendshipViews(friendships, { directory: socialDirectory, friendUids: friendUidSet, viewer: photoViewer }),
    [friendships, socialDirectory, friendUidSet, photoViewer],
  );


  const visibleSocialDirectory = useMemo(() => {
    // Directorio de descubrimiento: se muestran TODOS los perfiles publicados (el propio excluido). No se filtra por
    // contenido del gist: con el feed solo-amigos no leemos el gist de los no-amigos, así que exigir cualquier dato
    // suyo ocultaría a todo el mundo e impediría enviarles peticiones de amistad. Los perfiles del directorio ya
    // vienen acotados por Firestore (`social.enabled` + gist social presente).
    //
    // La entrada propia se descarta por IDENTIDAD, no comparando gists: el perfil ya no publica su id, así que un
    // no-amigo llega aquí con `socialGistId` vacío. Para quien todavía NO tiene canal social (`socialCfgGistId`
    // también vacío) la comparación antigua daba igualdad con TODOS ellos y le vaciaba el directorio entero: un
    // usuario nuevo abría el espacio social y no encontraba a nadie a quien pedir amistad.
    return socialDirectory.filter((entry) => !isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId));
  }, [authUser?.uid, ownProfileId, socialDirectory]);

  const socialDisplayName = useMemo(() => {
    const preferred = profileName.trim();
    if (preferred) {
      return preferred;
    }

    return authUser?.displayName || authUser?.email || '';
  }, [authUser, profileName]);

  const filteredSocialDirectory = useMemo(() => {
    const normalizedQuery = profileSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return visibleSocialDirectory;
    }

    return visibleSocialDirectory.filter((entry) =>
      entry.displayName.toLowerCase().includes(normalizedQuery),
    );
  }, [profileSearch, visibleSocialDirectory]);

  /**
   * LO QUE SE ESTÁ LEYENDO: la ficha de un perfil, una reseña dentro de ella o una actividad abierta desde el feed,
   * con sus esperas, el criterio de «esto es mío» y las reseñas relacionadas (`social/useSocialReading`).
   */
  const reading = useSocialReading({
    route: routeState,
    directory: socialDirectory,
    directoryLoading,
    patchDirectoryEntries,
    ownUid: authUser?.uid,
    ownProfileId,
    ownDisplayName: socialDisplayName,
    relationshipWith,
    localGames: localState,
    isAdmin,
    defaultVisibility: defaultSocialVisibility,
    fallbackToken: mainSyncConfig?.token || null,
    navigate,
  });

  /**
   * TUS LOGROS: evaluados una vez para el hub entero, unidos a lo ya publicado y publicados cuando adelantan algo
   * (`social/useOwnAchievements`). Lo que sale es tu vitrina, tu espejo y tu tarjeta del feed.
   */
  const { ownAchievements, ownAchievementMirror, ownAchievementsFeed } = useOwnAchievements({
    games: options?.games,
    rawDirectory: rawSocialDirectory,
    ownUid: authUser?.uid,
    ownPhotoURL: authUser?.photoURL,
    ownProfileId,
    ownDisplayName: socialDisplayName,
    friendUidSet,
    mainSyncGistId: mainSyncConfig?.gistId,
    ownProfileCreatedAt,
    ownPublishedMirror,
    ownProfilePublished,
    tierResolved,
  });

  const { feedItems, groupedFeedItems, hasMoreFeed, showMoreFeed } = useSocialFeed(
    socialDirectory,
    ownAchievementsFeed,
    // Los logros ajenos solo se anuncian de tus AMISTADES: su espejo llega del directorio de Firestore, que
    // cualquier autenticado puede leer, así que aquí no vale la garantía implícita del resto del feed («solo se
    // leen los gists de los amigos»).
    friendUidSet,
    friendshipsResolved,
    isAdmin,
  );




  // NOTA (retirado a propósito): aquí vivía un efecto que, al abrir el detalle de una reseña PROPIA cuyo juego
  // no aparecía en los listados, la despublicaba del gist social por considerarla huérfana. Decidía con
  // `localState`, una foto de localStorage tomada al montar el hub: si esos listados estaban desfasados (reseña
  // escrita en otro dispositivo con el sync de juegos aún en camino), borraba actividad VÁLIDA del feed de todos
  // de forma permanente. La limpieza de huérfanas la hace ahora `reconcileReviewActivity`, que compara la lista
  // completa de una vez y nunca retira una entrada más nueva que el reloj de los listados locales.

  /**
   * A DÓNDE LLEVA CADA GESTO: `social/useSocialNavigation`, que construye las direcciones con `SOCIAL_ROUTES` en
   * vez de repetir aquí las plantillas que ese módulo ya declara para leerlas. Viaja ENTERO como la pieza `nav`, y
   * `SocialHub` lo desestructura: lo que llega a las pantallas memoizadas son sus funciones, que ese hook crea con
   * `useCallback` y conservan su identidad entre renders (el objeto que las envuelve no viaja a ninguna).
   */
  const nav = useSocialNavigation(navigate, location.pathname);
  // Las dos que usan los atajos de teclado de aquí abajo, sueltas: llamadas como `nav.x(...)` la regla de dependencias
  // pediría el objeto entero, que es nuevo en cada render, y los atajos dejarían de ser estables.
  const { openActivityDetail, openProfileDetail } = nav;


  /**
   * Abre una reseña relacionada. Las dos rutas que existen para leer una reseña, y cada una por su motivo:
   *
   *  · AJENA → el detalle de actividad, que se resuelve por el `actorProfileId` del gist. Es la única vía: de un
   *    perfil ajeno no tenemos listados salvo que se hayan bajado, pero su ENTRADA de actividad —de donde salió
   *    esta candidata— siempre está.
   *  · PROPIA → la reseña dentro del perfil propio, con el comodín `me` de la URL. Tiene que ser esta y no la de
   *    actividad porque una reseña propia puede no estar publicada, y entonces no hay entrada que abrir; el
   *    perfil propio, en cambio, repuebla sus listados desde los locales y las encuentra todas.
   */




  const handleActivityItemKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, entry: SocialActivityFeedItem) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      openActivityDetail(entry);
    },
    [openActivityDetail],
  );

  const handleProfileCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, profileId: string) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      openProfileDetail(profileId);
    },
    [openProfileDetail],
  );


  /**
   * TU PERFIL: hidratarlo al abrir el espacio social (con la redirección al editor si está incompleto), guardarlo, y
   * la regla de completados que deciden los dos (`social/useOwnProfileEditor`). Los estados de «tienes que crear tu
   * perfil» siguen aquí porque también los leen la puerta del directorio y el arranque.
   */
  const {
    completedGames,
    hydratingProfile,
    savingProfile,
    hydrateSocialProfile,
    handleSaveProfile,
  } = useOwnProfileEditor({
    games: options?.games ?? localState,
    socialSpaceOpen,
    authUser,
    socialCfgGistId,
    socialCfgEtag,
    setSocialCfgGistId,
    setSocialCfgEtag,
    mainSyncConfig,
    activePanel,
    navigate,
    profileForm,
    profileName,
    hideReplayable,
    hideRetry,
    hideGameTime,
    hydrateProfileForm,
    defaultSocialVisibility,
    ownPhotoIsGeneric,
    ownPublishablePhoto,
    mustCreateProfile,
    setMustCreateProfile,
    setHasCreatedProfile,
    justSavedProfile,
    setJustSavedProfile,
    lockProfileEditor,
    hydrateSocialDirectory,
    setFeedback,
    reportFailure,
  });

  // LA REPARACIÓN DE LA RÉPLICA DEL NICK vive ahora en `useSocialStartupTasks`, con los otros saneados de
  // arranque: el guardado del perfil escribe el gist y DESPUÉS replica el nombre en `profiles/{uid}`, y si eso
  // segundo falla nada lo reintentaba. Allí lleva sello (`profileNameRepairedFor`), así que deja de costar una
  // lectura de Firestore por apertura del hub para descubrir que el nombre ya estaba bien.


  // Cambiar de identidad (otra cuenta, otro canal social) invalida lo asentado: lo que venga es un directorio
  // distinto, así que la pantalla tiene que volver a decir "cargando" y no el vacío del anterior. Declarado ANTES
  // del efecto de hidratación para que, en un mismo commit, el reinicio corra primero.
  useEffect(() => {
    setDirectorySettled(false);
  }, [authUser?.uid, socialCfgGistId, setDirectorySettled]);

  // F3 — compositor de publicaciones. Se invoca AQUÍ, y no arriba con el resto del estado, porque necesita
  // `hydrateSocialDirectory` para refrescar el feed tras publicar; el orden de los hooks es estable entre renders,
  // que es lo único que React exige.
  const compose = useSocialCompose({
    ownTier,
    // Forzado para que el post salga ya, pero sin releer la consulta de perfiles: publicar no cambia el directorio.
    onPublished: useCallback(() => hydrateSocialDirectory(true, { keepDirectoryQuery: true }), [hydrateSocialDirectory]),
    // Editar o borrar se refleja en TU entrada del directorio, sin releer nada: es la que pintan tu perfil y el feed.
    onPostChanged: useCallback((change: OwnPostChange) => {
      patchDirectoryEntries(
        (entry) => isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId),
        (entry) => ({
          posts: change.kind === 'delete'
            ? (entry.posts || []).filter((post) => post.id !== change.id)
            : (entry.posts || []).map((post) => (
              post.id === change.id ? { ...post, text: change.text, editedAt: change.editedAt } : post
            )),
        }),
      );
    }, [authUser?.uid, ownProfileId, patchDirectoryEntries]),
    setFeedback,
  });

  /**
   * Se apunta si esta persona puede publicar, para el ESQUELETO de la próxima entrada.
   *
   * El compositor solo existe a partir de plata, y eso no se sabe hasta que el perfil resuelve el rango: justo
   * después de la espera que el esqueleto está cubriendo. Sin esta pista, el armazón de carga tenía que elegir
   * entre no reservar su hueco (y que el feed saltara hacia abajo a quien sí publica) o reservarlo siempre (y que
   * saltara hacia arriba a quien no). Es una pista de pintado, no un permiso: ver `socialShellHint`.
   *
   * Espera a `tierResolved` porque `ownTier` arranca en bronce por defecto, y «bronce porque aún no se ha leído el
   * perfil» no es lo mismo que «bronce porque ese es su rango»: apuntar el primero borraría el hueco a alguien que
   * sí lo necesita.
   */
  useEffect(() => {
    if (!tierResolved) return;
    writeCanPublishHint(compose.canPublishPosts);
  }, [tierResolved, compose.canPublishPosts]);

  // Disparo automático de la hidratación. Depende de DATOS, no de la identidad del callback.
  //
  // Antes era `[hydrateSocialDirectory]`, y ese callback se recreaba con cualquiera de sus doce dependencias: entre
  // ellas `activePanel` (cambia en cada navegación del hub), `showPhoto` (lo fija la hidratación del PERFIL, en
  // cada apertura) y `mainSyncConfig?.token` (que ni siquiera se usaba). Resultado: tres o cuatro hidrataciones por
  // apertura, cada una releyendo IndexedDB y reemplazando el directorio por un array nuevo que invalidaba los
  // `useMemo` del feed entero. Aquí se listan solo las cosas que de verdad cambian LO QUE EL DIRECTORIO CONTIENE.
  const hydrateSocialDirectoryRef = useRef(hydrateSocialDirectory);
  hydrateSocialDirectoryRef.current = hydrateSocialDirectory;
  useEffect(() => {
    void hydrateSocialDirectoryRef.current();
  }, [
    directoryPanelAllows,
    directoryInputsReady,
    authUser?.uid,
    socialCfgGistId,
    friendships.friends,
    ownTier,
    ownProfileId,
  ]);

  /**
   * VUELVE LA RED: se rehidrata sin que el usuario tenga que recargar.
   *
   * Hace falta un disparo propio porque mientras no había conexión el feed se sirvió de la caché IGNORANDO su TTL
   * (ver `getCachedSocialDirectory`), y ninguna de las dependencias de arriba cambia al reconectar: sin esto, el
   * espacio social se quedaría mostrando lo de antes hasta navegar a otra pantalla y volver.
   *
   * No se fuerza el refresco: una pasada normal ya reevalúa el TTL, que es lo que toca ahora que sí hay a dónde ir
   * a por algo más nuevo. Y se guarda si ANTES estábamos sin red, para no hidratar de más en el primer render.
   */
  const wasOfflineRef = useRef(!online);
  const hydrateSocialProfileRef = useRef(hydrateSocialProfile);
  hydrateSocialProfileRef.current = hydrateSocialProfile;
  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }
    if (!wasOfflineRef.current) {
      return;
    }
    wasOfflineRef.current = false;
    setNetworkFailure(false);
    void hydrateSocialProfileRef.current();
    void hydrateSocialDirectoryRef.current();
  }, [online, setNetworkFailure]);

  // Listados con los que reconciliar: los vivos de la app si el contenedor los pasa; si no, la foto del mount.
  const reconcileGames = options?.games ?? localState;

  // RECONCILIACIÓN DE ACTIVIDAD (una vez por sesión de hub). La publicación de una reseña es un efecto colateral
  // de guardarla y se perdía en silencio si el canal social no estaba armado en ese dispositivo, si el chunk del
  // publicador no bajaba o si GitHub devolvía 403/5xx: el perfil mostraba la reseña (gist de juegos) y el feed
  // no (gist social), para siempre. Esta pasada reconcilia ambos y retira huérfanas. Barata: si el recuento de
  // reseñas no ha cambiado y el sello está fresco, no toca la red. Se hace tras `hydrateSocialDirectory` (TDZ).
  const activityReconciledRef = useRef(false);
  useEffect(() => {
    if (activityReconciledRef.current) return;
    if (!socialSpaceOpen || profileEditorLocked || !authUser?.uid || !socialCfgGistId) return;
    activityReconciledRef.current = true;

    let cancelled = false;
    void reconcileReviewActivity({ games: reconcileGames })
      .then((outcome) => {
        // Listados aún sin cargar (el hub puede montarse antes): se libera el pestillo para reintentarlo cuando
        // `reconcileGames` cambie, en vez de dar la sesión por reconciliada sin haber comparado nada.
        if (outcome.reason === 'sin-listados') {
          activityReconciledRef.current = false;
          return;
        }
        if (outcome.reason && outcome.reason !== 'sello-fresco') {
          console.warn(`[social] reconciliación omitida: ${outcome.reason}`);
          return;
        }
        const changed = outcome.added + outcome.removed + outcome.relinked + outcome.repaired > 0;
        if (cancelled || outcome.skipped || !changed) return;
        // La reconciliación invalidó la caché del directorio: reléelo para que el cambio se vea ya, sin esperar
        // a la próxima visita. No es un refresco forzado (no gasta el cooldown del botón "Actualizar").
        void hydrateSocialDirectory();
      })
      .catch(() => {
        /* best-effort: sin red o sin IndexedDB se reintenta en la próxima sesión (el sello no se escribió). */
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, hydrateSocialDirectory, profileEditorLocked, reconcileGames, socialSpaceOpen, socialCfgGistId]);


  // LA FOTO PROPIA EN LOS CANALES PÚBLICOS, propagarla o retirarla (`social/useOwnPhotoHeal`).
  useOwnPhotoHeal({
    socialSpaceOpen,
    socialCfgGistId,
    authUser,
    ownPhotoIsGeneric,
    ownPhotoVerdictPending,
    showPhoto,
    patchDirectoryEntries,
  });




  // Datos que YO aporto al doc de amistad (denormalizados): mi nombre/foto (respetando showPhoto) + mis ids de gist.
  // PRIVACIDAD: el nombre es SIEMPRE el nick del perfil social (`profileName`), NUNCA el nombre real de Google
  // (`authUser.displayName`) ni el email. Si el nick aún no está cargado, se guarda vacío (el lector muestra un
  // placeholder) en lugar de filtrar el nombre real.


  /*
   * LO QUE EL HUB NECESITA, EN PIEZAS POR DOMINIO. El único consumidor (`SocialHub`) las desestructura en el acto,
   * así que son objetos LITERALES y no `useMemo`: su identidad no viaja a ninguna pantalla memoizada. Si alguna vez
   * se pasa una pieza ENTERA como prop, hay que memoizarla antes o la pantalla se repintará en cada render del hub
   * (lo vigila `tests/component/socialHubRepaints.test.tsx`).
   */
  return {
    session: {
      navigate,
      activePanel,
      socialCfgGistId,
      authUser,
      // Carga = hidratación inicial + comprobación del consentimiento en vuelo (ver `legalConsentPending`).
      loading: loading || legalConsentPending,
      showSocialSpace: socialSpaceOpen,
      hasMainSync,
      hasSocialGist,
      hasSocialSession,
      /**
       * Sin conexión: la pantalla lo dice con sus palabras en vez de dejar salir el error de red de turno.
       *
       * Dos señales, porque ninguna basta sola: lo que dice el navegador (`navigator.onLine`, que detecta el modo
       * avión o el cable fuera antes de intentar nada) y lo que ha pasado de verdad (`networkFailure`, que es lo
       * único que ve un wifi conectado sin salida a internet).
       */
      offline: !online || networkFailure,
      /**
       * Algún servicio no atiende ahora (cuota de Firestore, límite de GitHub): se ve lo guardado y se dice con un
       * aviso persistente propio, distinto del de sin conexión. El de sin conexión manda si se dan los dos.
       */
      serviceLimited: serviceLimited && online && !networkFailure,
      /**
       * ¿Hay algo guardado que mostrar mientras no hay red? Separa los dos mensajes del aviso: "esto es lo último
       * que se guardó" (hay caché) y "aquí todavía no hay nada" (nunca se abrió el espacio social en este
       * dispositivo). Decirle lo primero a quien no ve nada sería mentirle.
       */
      offlineHasCachedData: socialDirectory.length > 0,
      // L4 — puerta de aceptación (solo con sesión y consentimiento no vigente).
      legalConsentRequired: legalConsent.required,
      savingConsent: legalConsent.saving,
      acceptLegalConsent: legalConsent.accept,
    },
    feedback: {
      status,
      statusKind,
    },
    gateway: {
      gatewaySteps,
      currentStep,
      primaryGatewayCta,
      handleSignOut,
    },
    profileEditor: {
      hasCreatedProfile,
      hasUnsavedChanges: profileHasUnsavedChanges,
      profileName,
      setProfileName,
      hiddenTabs,
      setHiddenTabs,
      hideReplayable,
      setHideReplayable,
      hideRetry,
      setHideRetry,
      hideGameTime,
      setHideGameTime,
      showPhoto,
      setShowPhoto,
      // Para que la pantalla del perfil pueda decir POR QUÉ el interruptor está bloqueado: no es lo mismo no tener
      // foto que tener la que Google genera sola.
      ownPhotoIsGeneric,
      // La cara propia que SE VE, ya resuelta: es la misma que sale al mundo. Las pantallas que solo pintan el avatar
      // propio (la cabecera del hub, la ficha del editor) usan esta y no la de la sesión, para que el interruptor
      // valga igual mirándose uno que mirándole los demás. `ownPhotoURL` crudo sigue haciendo falta donde hay que
      // distinguir "no tienes foto" de "la has apagado": eso lo decide el propio editor.
      ownPublishablePhoto,
      hydratingProfile,
      savingProfile,
      completedGames,
      socialDisplayName,
      handleSaveProfile,
    },
    viewer: {
      // Rango propio y lo que implica al publicar: si puede, cuánto, y si hay contador que enseñar.
      ownTier,
      // ¿Es la administración? (el claim, no el rango): exenciones en la ficha de un amigo.
      isAdmin,
    },
    compose,
    directory: {
      profileSearch,
      setProfileSearch,
      // Se expone el valor DERIVADO (no el `loadingDirectory` crudo): es el único que cubre la ventana completa, y
      // así ninguna pantalla puede olvidarse de sumarle la parte que falta.
      // En «Perfiles» cuenta también la consulta de los recientes: sin ella, la sección «Otros» saldría vacía un instante.
      loadingDirectory: directoryLoading || (activePanel === 'profiles' && discoverLoading),
      filteredSocialDirectory,
      // EL DIRECTORIO SIN EL BUSCADOR. Sale porque hay dos preguntas distintas y solo estaba la primera: a quién
      // se le enseña la lista de personas —eso sí lo recorta el buscador— y sobre quién se mide (§6.6bis), que no
      // puede depender de lo que haya escrito en una caja de texto.
      visibleSocialDirectory,
    },
    feed: {
      feedItems,
      groupedFeedItems,
      hasMoreFeed,
      showMoreFeed,
      handleActivityItemKeyDown,
      handleProfileCardKeyDown,
      markOwnYearSummaryOpened,
    },
    reading: {
      profileDetailId,
      profileReviewsView,
      profilePostsView,
      profileAchievementsView,
      profileGlobalsView,
      // ¿Puede aparecer todavía el evento abierto? (ver arriba: decide esqueleto vs «no se ha encontrado»).
      // ¿Falta todavía el análisis completo de la reseña abierta? (ver arriba: decide esqueleto vs adelanto).
      ...reading,
    },
    achievements: {
      ownAchievements,
      ownAchievementMirror,
    },
    nav,
    friends: {
      // Amistad
      loadingFriendships,
      friendshipBusyUid,
      pendingIncomingCount,
      incomingRequests,
      outgoingRequests,
      friendsList,
      relationshipWith,
      handleAddOrAcceptFriend,
      handleCancelFriendRequest,
      handleRejectFriendRequest,
      handleRemoveFriend,
      friendActionTarget,
      confirmFriendAction,
      cancelFriendAction,
    },
  };
}
