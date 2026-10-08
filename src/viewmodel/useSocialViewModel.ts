import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYearSummarySignal } from './social/useYearSummarySignal';
import { ensureSyncConfigLoaded, getSyncConfig } from '../model/repository/gistRepository';
import { writeCanPublishHint } from '../model/repository/socialShellHint';
import { createSocialGist, getSocialSyncConfig, readSocialGist, remapSocialActorIds, saveSocialSyncConfig, deleteGist, ensureSecretSocialGist, socialGistHasContent, writeSocialGist } from '../model/repository/socialGistRepository';
import { reconcileReviewActivity } from '../model/repository/socialActivityReconcile';
import { getCachedSocialProfile, getLocalMeta, patchLocalMeta, putCachedSocialProfile, type CachedSocialProfileData } from '../model/repository/indexedDbRepository';
import { PUBLIC_NAME_MAX_LENGTH, safeTrim } from '../core/security/sanitize';
import { isNetworkFailure, isOffline, isServiceUnavailable } from '../core/utils/network';
import { isPermissionDeniedError } from '../model/repository/firebaseClient';
import { useOnlineStatus } from '../view/hooks/useOnlineStatus';
import { resolveViewer, withVisiblePhotos } from '../core/social/photoVisibility';
import { useGenericPhoto } from '../view/hooks/useGenericPhoto';
import { useIsAdmin } from '../view/hooks/useIsAdmin';
import { SOCIAL_UI } from '../core/constants/socialLabels';
import type { IconName } from '../core/constants/icons';
import {
  DEFAULT_PROFILE_TIER,
  type ProfileTier,
} from '../core/constants/tiers';
import { TAB_IDS, type SyncConfig, type TabData } from '../model/types/game';
import {
  clearAnalyticsUser,
  ensureProfileByEmail,
  getCurrentSocialAuthUser,
  getPrivateConfig,
  setPrivateConfig,
  healOwnFriendshipIdentity,
  resolveOwnProfile,
  resolveStableProfileId,
  signInWithGoogle,
  signOutSocialUser,
  updateProfilePhoto,
  type FriendshipSelfInfo,
  type SocialAuthUser,
} from '../model/repository/firebaseRepository';
import { APP_LOCALE } from '../core/constants/locale';
// Reexportados: las pantallas del hub y los tests los importan de aquí desde antes de que el ViewModel se
// partiera, y cambiarles el import no aportaría nada.
export { isOwnProfileIdentity } from './social/socialIdentity';
export type { SocialDirectoryEntry } from './social/socialFeed';
import { isOwnProfileIdentity } from './social/socialIdentity';
import type { SocialDirectoryEntry } from './social/socialFeed';
import { buildFriendshipViews } from './social/friendshipViews';
import { useSocialDirectory } from './social/useSocialDirectory';
import { useSocialDiscover } from './social/useSocialDiscover';
import { resolveGateway } from './social/socialGateway';
import { useSocialFriendships } from './social/useSocialFriendships';
import { useSocialNavigation } from './social/useSocialNavigation';
import { useSocialStartupTasks } from './social/useSocialStartupTasks';
import { loadLocalState } from '../model/repository/localRepository';
import { matchSocialRoute, OWN_PROFILE_ALIAS } from './social/socialRoutes';

/** Sin espejo publicado todavía (o sin leer): cadena vacía y sin instante, que es «no hay cota». */
const NO_PUBLISHED_MIRROR = { list: '', at: 0 };

/** Referencia estable: un `new Map()` inline rompería el memo del feed en cada render. */
import { useSocialCompose, type OwnPostChange } from './social/useSocialCompose';
import { useSocialLegalConsent } from './social/useSocialLegalConsent';
import { DEFAULT_SOCIAL_VISIBILITY, normalizeVisibility, useSocialProfileForm } from './social/useSocialProfileForm';
import { useSocialReading } from './social/useSocialReading';
import { useOwnAchievements } from './social/useOwnAchievements';
import { useSocialFeed } from './social/socialFeed';
import { isSupersededSignIn } from '../core/utils/googleSignIn';
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

const shouldRequireProfileCreation = (profileExists: boolean, justSavedProfile: boolean): boolean => {
  return !profileExists && !justSavedProfile;
};

const shouldRedirectToProfileEditor = (isProfileEditorLocked: boolean, activePanel: string): boolean => {
  return isProfileEditorLocked && activePanel !== 'profile';
};

/** Respuesta de `attachExistingSocialGist`: vinculado, no tiene, o no se ha podido saber. */
type ExistingSocialGist = 'linked' | 'none' | 'unknown';

const isProfileEditorLocked = (mustCreateProfile: boolean, hasBlockingSocialIssue: boolean): boolean => {
  return mustCreateProfile || hasBlockingSocialIssue;
};

/**
 * ¿El gist no se pudo leer por la CREDENCIAL (401/403), y no porque no exista?
 *
 * Hoy apenas ocurre: el canal social es un gist público y las lecturas funcionan incluso sin cabecera. Cuando
 * pasen a ser secretos, esta será la diferencia entre "este amigo no ha publicado nada" y "tu token de GitHub ya
 * no vale". Degradar en silencio en el segundo caso deja al usuario con un feed vacío y sin pista de por qué.
 */

const isNotFoundGistError = (error: unknown): boolean => {
  return error instanceof Error && /\b404\b/.test(error.message);
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


  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
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
  // Rango del PROPIO usuario: decide cada cuánto se rehidrata el feed (ver PROFILE_TIER_FEED_TTL_MS). Manda el de
  // quien mira porque las lecturas de gists ajenos van con SU token y cuentan contra SU rate-limit.
  const [ownTier, setOwnTier] = useState<ProfileTier>(DEFAULT_PROFILE_TIER);
  /**
   * Tu fecha de alta (ms), del documento de perfil. La necesitan «De la vieja escuela» y «Otro año más», que son
   * los dos únicos logros del catálogo que miden algo que NO sale de tu biblioteca.
   *
   * Viaja con la misma lectura que el rango —una sola, ya cacheada 60 s por `getOwnProfileRef`— así que no cuesta
   * ni una petición. 0 mientras no se sepa, que es lo que deja los dos logros sin conceder en vez de regalarlos.
   */
  const [ownProfileCreatedAt, setOwnProfileCreatedAt] = useState(0);
  /**
   * ¿Tiene esta cuenta un perfil PUBLICADO? Es decir, existe `profiles/{uid}` y su social está activo.
   *
   * No vale `ownProfileId` para esto, aunque lo parezca: ese id se SIEMBRA en local (`seedProfileIdFromRemote`)
   * aunque no haya documento en Firestore, así que lo tiene también quien nunca abrió el social. Lo que sí lo
   * garantiza es haber leído el documento.
   */
  const [ownProfilePublished, setOwnProfilePublished] = useState(false);
  /** Tu espejo tal y como está PUBLICADO. Es el suelo de la próxima publicación: de ahí no se baja. */
  // El espejo publicado ENTERO —cadena e instante—, no solo la cadena: el `at` es la cota de las fechas que
  // llegan tarde (ver `mergeForPublish`).
  const [ownPublishedMirror, setOwnPublishedMirror] = useState<{ list: string; at: number }>(NO_PUBLISHED_MIRROR);
  /**
   * ¿Se sabe ya el rango propio? `ownTier` arranca en bronce porque es el valor por defecto real, pero "bronce
   * porque aún no se ha leído el perfil" y "bronce porque ese es su rango" NO son lo mismo para el directorio: el
   * primero elegiría el TTL de caché equivocado y obligaría a rehidratarlo entero al conocerse el rango.
   */
  const [tierResolved, setTierResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvingSocialGist, setResolvingSocialGist] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'err'>('ok');
  const [hasBlockingSocialIssue, setHasBlockingSocialIssue] = useState(false);
  /**
   * ¿Ha fallado la RED en la última operación del espacio social?
   *
   * No basta con `navigator.onLine`: dice que hay red en cuanto hay interfaz levantada, así que un wifi sin salida
   * o un portal cautivo pasan por conexión buena y el usuario se quedaba con un error de red sin explicación. Este
   * indicador lo enciende el propio fallo (`reportFailure`) y lo apaga la primera operación que vuelve a funcionar.
   */
  const [networkFailure, setNetworkFailure] = useState(false);
  /** Algún servicio (Firestore, GitHub) no atiende ahora: se está viendo lo guardado. Ver `reportFailure`. */
  const [serviceLimited, setServiceLimited] = useState(false);
  const [showSocialSpace, setShowSocialSpace] = useState(false);
  const [hasCreatedProfile, setHasCreatedProfile] = useState(false);
  const [mustCreateProfile, setMustCreateProfile] = useState(false);
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
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
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


  /**
   * Temporizador que borra el mensaje de estado. Uno SOLO, reutilizado.
   *
   * Antes cada aviso creaba el suyo y nadie los cancelaba, con dos consecuencias. La visible: dos avisos seguidos
   * se pisaban —el temporizador del PRIMERO seguía vivo y borraba el mensaje del SEGUNDO al cumplirse su plazo, así
   * que un aviso podía durar medio segundo en vez de tres—. Y la de fondo: al salir del hub quedaban temporizadores
   * pendientes que acababan tocando el estado de un componente ya desmontado.
   */
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFeedback = useCallback((kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => {
    setStatusKind(kind);
    setStatus(message);

    // El aviso anterior deja de contar en cuanto llega uno nuevo: si no, su plazo borraría este.
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    // Only hard errors should block feed access.
    if (kind === 'ok') {
      setHasBlockingSocialIssue(false);
    } else if (kind === 'err') {
      setHasBlockingSocialIssue(true);
    } else {
      setHasBlockingSocialIssue(false);
    }

    if (kind === 'err') {
      return;
    }

    const ms = duration === 'long' ? 6000 : 3000;
    statusTimerRef.current = setTimeout(() => {
      statusTimerRef.current = null;
      setStatus('');
    }, ms);
  }, []);

  /**
   * Traduce un fallo a un aviso para el usuario. Un fallo de RED no es un error del que haya que hacer nada, así
   * que se cuenta con el mensaje de "sin conexión" y en tono `warn`: en tono `err` encendería
   * `hasBlockingSocialIssue`, que frena la hidratación del feed y bloquea el editor de perfil —o sea, quedarse sin
   * red dejaba el espacio social cerrado además de sin datos nuevos—.
   *
   * Un fallo del SERVICIO (Firestore sin cuota o caído, GitHub limitando, 429/5xx) tampoco: no se arregla tocando
   * nada, solo esperando. Antes salía con su mensaje crudo («Quota exceeded.», en inglés) y en tono `err`, que
   * cerraba el feed y el editor durante horas por un cupo diario. Ahora enciende `serviceLimited` —el aviso
   * persistente de «servicio limitado»— y se sigue con lo guardado (docs/plan-degradacion-servicios.md, fase 2).
   *
   * Lo demás mantiene el comportamiento de siempre (el mensaje del error, que en un 401/403/404 sí dice algo útil,
   * con el texto de la aplicación como respaldo).
   */
  const reportFailure = useCallback((error: unknown, fallback: string, kind: 'err' | 'warn' = 'err') => {
    if (isNetworkFailure(error) || isOffline()) {
      setNetworkFailure(true);
      setFeedback('warn', SOCIAL_UI.status.offline, 'long');
      return;
    }
    setNetworkFailure(false);
    if (isServiceUnavailable(error)) {
      setServiceLimited(true);
      setFeedback('warn', SOCIAL_UI.status.serviceLimited, 'long');
      return;
    }
    setFeedback(kind, error instanceof Error ? error.message : fallback);
  }, [setFeedback]);

  /**
   * La red y el servicio han respondido: se retiran los dos avisos persistentes. Lo llama la hidratación del feed
   * cuando termina bien de verdad (no cuando sale de una copia guardada).
   */
  const markSocialServiceHealthy = useCallback((failed: boolean) => {
    setNetworkFailure(failed);
    if (!failed) setServiceLimited(false);
  }, []);

  const lockProfileEditor = useCallback(() => {
    setMustCreateProfile(true);

    if (activePanel !== 'profile') {
      void navigate('/social/profile');
    }
  }, [activePanel, navigate]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await ensureSyncConfigLoaded(); // C4: garantiza el token descifrado antes de leer la config de sync
      if (cancelled) {
        return;
      }
      const mainConfig = getSyncConfig();
      setMainSyncConfig(mainConfig);
      const socialConfig = getSocialSyncConfig();
      const currentUser = await getCurrentSocialAuthUser();
      let resolvedGistId = socialConfig?.gistId || '';

      if (!resolvedGistId && currentUser?.uid && mainConfig?.token) {
        try {
          // FUENTE DEL GIST SOCIAL PROPIO, por orden de fiabilidad:
          //   1. `privateConfig.socialGistId` — owner-only, con UN SOLO escritor (su dueño). Es el sitio donde de
          //      verdad pertenece este dato, y hasta ahora se escribía sin que nadie lo leyera.
          //   2. El perfil público, como respaldo LEGACY: es donde se leía antes, pero lo puede ver cualquier
          //      usuario autenticado y va a dejar de publicarse.
          // Se consulta `privateConfig` primero para poder retirar el campo del perfil público sin dejar a nadie
          // sin forma de recuperar su canal en un dispositivo nuevo.
          const privateConfig = await getPrivateConfig(currentUser.uid).catch(() => null);
          const privateGistId = String(privateConfig?.socialGistId || '').trim();

          const profile = privateGistId ? null : await resolveOwnProfile(currentUser);
          const gistId = privateGistId || (profile?.socialEnabled ? profile.socialGistId.trim() : '');

          if (gistId) {
            let gistExists = true;
            try {
              await readSocialGist(mainConfig.token, gistId, null);
            } catch (error) {
              if (!isNotFoundGistError(error)) {
                throw error;
              }
              gistExists = false;
            }
            if (cancelled) {
              return;
            }

            if (!gistExists) {
              // El canal apuntado ya no existe. Se sigue SIN gist pero CON la sesión: salir aquí antes de fijarla
              // dejaba el hub como si no hubiera Google, el auto-crear no arrancaba y la pasarela volvía a pedir un
              // inicio de sesión que ya estaba hecho.
              lockProfileEditor();
            } else {
              saveSocialSyncConfig({
                token: mainConfig.token,
                gistId,
                etag: null,
                lastRemoteUpdatedAt: 0,
              });
              // SIEMBRA: si el id vino del perfil público (perfil anterior a que `privateConfig` se poblara), se
              // copia a su sitio. Sin esto, retirar el campo del perfil público dejaría a esas cuentas sin ninguna
              // forma de recuperar su canal. Best-effort: no puede romper la apertura del hub.
              if (!privateGistId) {
                void setPrivateConfig(currentUser.uid, { socialGistId: gistId }).catch(() => {});
              }
              resolvedGistId = gistId;
            }
          }
        } catch {
          // Keep gateway usable even if Firestore is unavailable.
        }
      }

      if (cancelled) {
        return;
      }

      setSocialCfgGistId(resolvedGistId);
      setSocialCfgEtag(socialConfig?.etag || null);
      setAuthUser(currentUser);
      setShowSocialSpace(Boolean(resolvedGistId && currentUser));
      setLoading(false);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [lockProfileEditor, navigate]);

  // El token del gist de juegos se cifra y se descifra de forma asíncrona (ensureSyncConfigLoaded).
  // Mantener la config en estado y refrescarla tras la hidratación evita la carrera en la que
  // getSyncConfig() devolvía token='' al montar (hasMainSync=false → gateway → /ajustes y lecturas 401).
  const [mainSyncConfig, setMainSyncConfig] = useState<SyncConfig | null>(() => getSyncConfig());
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

  const canConnectSocialGist =
    hasMainSync && hasSocialSession && !hasSocialGist && !connecting && !resolvingSocialGist && legalGateOpen;
  const canSignInGoogle = hasMainSync && !hasSocialSession && !signingIn;

  useEffect(() => {
    if (!hasReadyAccess || showSocialSpace) {
      return;
    }

    setShowSocialSpace(true);
    void navigate('/social');
  }, [hasReadyAccess, showSocialSpace, navigate]);

  // Pasarela (pasos, paso actual y progreso): derivación pura en `social/socialGateway`.
  const { steps: gatewaySteps, currentStep } = useMemo(
    () => resolveGateway({ hasMainSync, hasSocialSession, hasSocialGist }),
    [hasMainSync, hasSocialSession, hasSocialGist],
  );

  /** El auto-crear del canal social se cierra en esta sesión si no se ha podido saber si ya existe uno. */
  const autoCreateSocialGistBlockedRef = useRef(false);

  /**
   * ¿Tiene ya esta cuenta un canal social? TRES respuestas, y la tercera es la que importa: `unknown`.
   *
   * Era un booleano, y cualquier fallo al preguntar (Firestore sin cuota o caído, GitHub limitado) salía como
   * `false`, que quien llama lee como «no tiene»: el mismo canal vacío del comentario de abajo, pero por un fallo
   * del servicio en vez de por la migración del campo (docs/plan-degradacion-servicios.md, fase 1). `none` solo
   * cuando las fuentes RESPONDEN que no hay nada; una regla que no deja leer (`permission-denied`) es una respuesta.
   */
  const attachExistingSocialGist = useCallback(async (user: SocialAuthUser): Promise<ExistingSocialGist> => {
    if (!mainSyncConfig?.token) {
      setFeedback('warn', SOCIAL_UI.status.needMainSync);
      return 'unknown';
    }

    try {
      setResolvingSocialGist(true);
      // FUENTE DEL CANAL, por orden: `privateConfig` (owner-only, un solo escritor) y solo después el campo LEGACY
      // del perfil público. Mirando solo el perfil, esta función devolvía SIEMPRE false en cuanto la cuenta migró
      // —ese campo se purga—, y el camino que la usa (`handleSignInGoogle`, en un navegador sin configuración local:
      // dispositivo nuevo, almacenamiento limpiado u otro origen) caía en el auto-crear: un canal nuevo y VACÍO
      // adoptado como propio, el historial real huérfano y el editor de perfil pidiendo el alta otra vez. Y como el
      // saneado de amistades corre al abrir el hub, habría repuntado a los amigos a ese gist vacío, dejándoles sin
      // la actividad de esta cuenta. Aquí NO vale el efecto de recuperación del montaje: ese ya corrió sin sesión.
      const savedConfig = await getPrivateConfig(user.uid).catch((error: unknown) => {
        if (isPermissionDeniedError(error)) return null;
        throw error;
      });
      const savedGistId = String(savedConfig?.socialGistId || '').trim();
      const existingProfile = savedGistId ? null : await resolveOwnProfile(user);
      const existingGistId = savedGistId || (existingProfile?.socialEnabled ? existingProfile.socialGistId.trim() : '');

      if (!existingGistId) {
        return 'none';
      }

      try {
        await readSocialGist(mainSyncConfig.token, existingGistId, null);
      } catch (error) {
        if (isNotFoundGistError(error)) {
          return 'none';
        }

        throw error;
      }

      saveSocialSyncConfig({
        token: mainSyncConfig.token,
        gistId: existingGistId,
        etag: null,
        lastRemoteUpdatedAt: 0,
      });
      setSocialCfgGistId(existingGistId);
      setSocialCfgEtag(null);
      // Si vino del campo legacy, se copia a su sitio: es lo único que evita que el siguiente dispositivo vuelva a
      // no encontrarlo cuando ese campo quede purgado.
      if (!savedGistId) {
        void setPrivateConfig(user.uid, { socialGistId: existingGistId }).catch(() => {});
      }
      setFeedback('ok', SOCIAL_UI.status.gistLinkedFromFirestore);
      return 'linked';
    } catch (error) {
      // No se sabe, y entonces no se crea nada. Sin red, el aviso de siempre; con el servicio caído o sin cuota, uno
      // que no asusta y dice lo que importa: no se ha tocado nada.
      if (isNetworkFailure(error) || isOffline()) {
        reportFailure(error, SOCIAL_UI.status.firestoreCheckFailed);
      } else {
        setFeedback('warn', SOCIAL_UI.status.channelCheckUnavailable, 'long');
      }
      return 'unknown';
    } finally {
      setResolvingSocialGist(false);
    }
  }, [mainSyncConfig, reportFailure, setFeedback]);

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
  useSocialStartupTasks({
    socialSpaceOpen,
    uid: authUser?.uid,
    socialGistId: socialCfgGistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    profileName,
    ownPublishablePhoto,
    ownPhotoVerdictPending,
  });

  // FASE 2 — MIGRACIÓN A CANAL SECRETO (una vez por sesión).
  //
  // Los canales creados antes de este cambio son gists PÚBLICOS: aparecen listados en el perfil de GitHub de su
  // dueño y en las búsquedas. GitHub no permite cambiar la visibilidad, así que la única vía es clonar a un id
  // nuevo, y solo puede hacerlo el propio usuario: su token es owner-only, así que esto NO se puede hacer desde
  // el panel de administración.
  //
  // Tras migrar hay que repuntar las TRES referencias que quedan: la config local, `privateConfig` (owner-only, la
  // fuente de verdad) y los documentos de amistad (por eso se rearma el saneado de amistades).
  const secretMigrationRef = useRef(false);
  useEffect(() => {
    if (secretMigrationRef.current) return;
    if (!socialSpaceOpen || !authUser?.uid || !socialCfgGistId) return;
    const token = getSocialSyncConfig()?.token || mainSyncConfig?.token || '';
    if (!token) return;
    // Se fija el usuario aquí: dentro de las funciones anidadas el estado ya no se puede estrechar a no-nulo.
    const owner = authUser;
    secretMigrationRef.current = true;
    let cancelled = false;

    // ¿Migró ya OTRO dispositivo? `privateConfig` es la fuente de verdad de la cuenta y solo la escribe su dueño.
    // Sin esta comprobación, dos dispositivos abriendo a la vez clonarían cada uno por su lado y recrearían la
    // deriva que esta migración viene a eliminar. Si ya hay un canal distinto ahí, se adopta en vez de clonar.
    void (async () => {
      // La retirada de los ids que el perfil PÚBLICO aún anuncie ESTABA AQUÍ, y se ha ido a
      // `useSocialStartupTasks`. Estaba dentro de esta cadena porque quien ya migró en otra sesión no vuelve a
      // entrar en ella y se quedaba publicando un gist borrado; con esta migración ya sellada
      // (`socialChannelPrivateFor`), quedarse aquí la habría dejado sin correr nunca más. Allí tiene su propio
      // sello y sigue cubriendo ese caso.
      //
      // SELLO DEL CANAL YA SECRETO. `ensureSecretSocialGist` no puede saber si hay algo que migrar sin LISTAR los
      // gists de la cuenta contra la API de GitHub, y eso pasaba en CADA apertura del hub para descubrir, casi
      // siempre, que no había nada que hacer. Una vez que consta que este canal es secreto, no puede volver a ser
      // público (GitHub no permite cambiar la visibilidad), así que el sello es definitivo para ese id.
      const meta = await getLocalMeta().catch(() => null);
      if (cancelled) return;
      if (meta?.socialChannelPrivateFor === socialCfgGistId) return;

      const shared = await getPrivateConfig(owner.uid).catch(() => null);
      const sharedGistId = String(shared?.socialGistId || '').trim();
      if (sharedGistId && sharedGistId !== socialCfgGistId) {
        const currentConfig = getSocialSyncConfig();
        if (currentConfig) {
          saveSocialSyncConfig({ ...currentConfig, gistId: sharedGistId, etag: null, lastRemoteUpdatedAt: 0 });
        }
        setSocialCfgGistId(sharedGistId);
        setSocialCfgEtag(null);
        return;
      }
      await runSecretMigration(token);
    })();

    async function runSecretMigration(activeToken: string) {
    return ensureSecretSocialGist(activeToken, socialCfgGistId)
      .then((result) => {
        // Demasiado grande para leerlo entero por la API: no se migra y se dice. Callarlo dejaría un canal
        // público para siempre sin que nadie sepa por qué.
        if (result.tooLarge) {
          // Sin sellar a propósito: sigue siendo público y hay que reintentarlo (puede adelgazar al rotar la
          // actividad). Sellarlo aquí lo dejaría público para siempre.
          setFeedback('warn', SOCIAL_UI.status.socialGistTooLarge);
          return;
        }
        if (!result.migrated) {
          // Nada que migrar: el canal ya era secreto (o no es de esta cuenta). Se sella para no volver a listar
          // los gists en la próxima apertura.
          void patchLocalMeta({ socialChannelPrivateFor: socialCfgGistId }).catch(() => {});
          return;
        }

        const currentConfig = getSocialSyncConfig();
        if (currentConfig) {
          // ETag y sello remoto son del gist ANTERIOR: se descartan.
          saveSocialSyncConfig({ ...currentConfig, gistId: result.gistId, etag: result.etag, lastRemoteUpdatedAt: 0 });
        }
        setSocialCfgGistId(result.gistId);
        setSocialCfgEtag(result.etag);
        // El canal nuevo ya es secreto: se sella su id para que la próxima apertura no vuelva a listar los gists.
        void patchLocalMeta({ socialChannelPrivateFor: result.gistId }).catch(() => {});
        // RETIRADA DEL GIST ANTIGUO. Es lo único que quita de circulación lo ya publicado: si se quedara, seguiría
        // siendo público e indexable para siempre. Se hace AL FINAL y con verificación previa, en este orden:
        // clonar → repuntar las tres referencias (arriba) → comprobar que el clon tiene el contenido → borrar.
        // Invertirlo dejaría al usuario apuntando a un gist inexistente si algo fallara a media faena.
        void (async () => {
          // Las referencias se repuntan AQUÍ y se ESPERAN, antes de borrar nada. Antes se dejaba que el efecto de
          // saneado de amistades corriera por su cuenta (rearmando su ref) mientras el borrado seguía adelante:
          // si el borrado ganaba la carrera, un amigo que hidratara en ese hueco leía un gist ya inexistente y se
          // quedaba sin su actividad —cacheada 30 minutos— hasta la siguiente rehidratación.
          //
          // Y si alguna NO se pudo repuntar, no se borra: el fallo cae en el `catch` de abajo, que conserva los dos
          // gists y avisa, igual que cuando el clon no convence. Tragárselo y seguir dejaba ese puntero —el de tus
          // otros dispositivos o el de tus amigos— en un gist que ya no existe; así apunta a uno que sigue vivo.
          await setPrivateConfig(owner.uid, { socialGistId: result.gistId });
          // `force`: aquí la garantía manda sobre el ahorro. Lo que viene después BORRA el gist antiguo, así que
          // un saneado que se saltara por huella dejaría a los amigos apuntando a un id que va a desaparecer.
          await healOwnFriendshipIdentity(owner.uid, {
            name: profileName.trim(),
            photo: ownPublishablePhoto,
            socialGistId: result.gistId,
            gamesGistId: mainSyncConfig?.gistId || '',
          }, { force: true });
          // Ya está repuntado. Antes había que decírselo al efecto de saneado poniéndole su `ref` a mano; ahora
          // no hace falta: el saneado con `force` deja escrita la huella nueva, así que la tarea de arranque la
          // encuentra al día y no repite nada.

          const copied = await socialGistHasContent(token, result.gistId, result.copiedEntries);
          if (!copied) {
            // El clon no tiene lo que debía: NO se borra el original. Mejor dos gists que ninguno.
            setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
            return;
          }
          // Se retiran TODOS los públicos superados, no solo el de la sesión: con deriva puede haber dos, y dejar
          // el que tiene las reseñas expuesto sería no haber arreglado nada.
          const results = await Promise.all(
            result.supersededGistIds.map((id) => deleteGist(token, id).catch(() => false)),
          );
          const allDeleted = results.every(Boolean);
          // Un público con contenido que NO se copió no se borra: se avisa para que decida su dueño.
          if (result.keptPublicGistIds.length > 0 || !allDeleted) {
            setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
            return;
          }
          setFeedback('ok', SOCIAL_UI.status.socialGistMigrated);
        })().catch(() => {
          // Esta cadena corre suelta (`void`), así que sin este catch cualquier fallo suyo —la verificación del
          // clon o el borrado, que van contra la red— se convertía en un rechazo NO CAPTURADO: en el navegador
          // acaba en la consola y en el manejador global de errores, y no en el aviso que le toca. Lo que ya está
          // hecho no se deshace (el canal nuevo está creado y repuntado), así que el estado seguro es el mismo que
          // cuando la verificación no convence: se conservan los dos gists y se avisa.
          setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
        });
      })
      .catch(() => {
        // Best-effort: si falla (red, rate-limit), se reintenta en la próxima sesión. Nada queda a medias: o se
        // creó el gist nuevo y se repuntó todo, o no se tocó nada.
        secretMigrationRef.current = false;
      });
    }

    // El desmontaje del hub cancela la cadena: sin esto, cerrar el espacio social mientras la lectura de
    // `LocalMeta` está en vuelo dejaba que la migración siguiera su curso contra un componente ya desmontado.
    return () => {
      cancelled = true;
    };
    // Se depende de `authUser?.uid` y NO del objeto `authUser` entero, que es lo que pide ESLint: Firebase
    // entrega una instancia nueva en cada refresco de token, así que con el objeto esta migración se relanzaría
    // sola cada hora sin que haya cambiado de usuario. Lo que decide aquí es la identidad, y esa es el uid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialSpaceOpen, authUser?.uid, socialCfgGistId, mainSyncConfig?.token, setFeedback, profileName, ownPublishablePhoto, mainSyncConfig?.gistId]);

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

  // MISMA fuente que la reconciliación (`reconcileGames`, más abajo): los listados VIVOS de la app, y la foto de
  // `localStorage` solo como respaldo cuando no llegan.
  //
  // Aquí estaba la causa del rebote al editor de perfil. Esto se derivaba de `localState`, que es una foto tomada
  // al montar (lo dice el docblock del propio parámetro `games`), mientras que la app ya tenía la biblioteca en
  // memoria. Con la foto vacía o atrasada —arranque con la sincronización en curso, hidratación desde el gist,
  // navegación a social antes de que localStorage estuviera escrito— un perfil perfectamente dado de alta se veía
  // sin juegos completados, se tomaba por incompleto y se redirigía al editor nada más entrar. Y `App` calculaba lo
  // mismo con la lista VIVA (`vm.data.c`) para el botón de Cuenta, así que las dos mitades de la misma regla
  // discrepaban: exactamente el rebote contra el que advierte el comentario de `hasCompletedGames`.
  const liveLists = options?.games ?? localState;

  const completedGames = useMemo(() => {
    const map = new Map<number, string>();
    liveLists.c.forEach((game) => {
      if (game.id > 0 && game.name) {
        map.set(game.id, game.name);
      }
    });

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, APP_LOCALE));
  }, [liveLists]);

  // Requisito de alta: un perfil solo puede existir si el usuario tiene al menos un juego COMPLETADO. Es la única
  // regla de completitud (junto al nombre) y se aplica idéntica en la hidratación, el guardado y el gate del botón
  // de Cuenta (`useSocialProfileSession`); si divergieran, el usuario rebotaría entre el feed y el editor.
  const hasCompletedGames = completedGames.length > 0;

  // ¿Está la biblioteca en ESTE dispositivo? Que no haya NADA en ninguna lista significa "aquí no se ha
  // sincronizado todavía" (dispositivo nuevo, otro origen, sincronización en curso), y eso NO es lo mismo que "no
  // tienes juegos completados". Confundirlos mandaba al editor a un usuario ya dado de alta, que además leía
  // "Sincronizado" nada más llegar: el diagnóstico y el mensaje se contradecían.
  const libraryPresentLocally =
    TAB_IDS.some((tab) => (liveLists[tab] || []).length > 0);
  // El requisito de tener un juego completado solo se puede DAR POR INCUMPLIDO si la biblioteca está aquí para
  // comprobarlo. El guardado del perfil lo sigue exigiendo siempre (ahí el usuario está mirando sus propias listas).
  const completedGamesRequirementMet = hasCompletedGames || !libraryPresentLocally;

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
  const {
    activeDetailEvent,
    selectedProfileDetail,
    activeProfileReview,
    getGameItemById,
    detailEventLoading,
    profileDetailLoading,
    detailReviewLoading,
    openOwnProfileDetail,
    isOwnProfileDetail,
    isOwnDetailEvent,
    relatedReviews,
  } = useSocialReading({
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
   * vez de repetir aquí las plantillas que ese módulo ya declara para leerlas. Se desestructura —y no se usa
   * `nav.loquesea`— porque estas funciones viajan por props a pantallas memoizadas y así conservan su identidad.
   */
  const {
    openActivityDetail,
    openMoveReview,
    openProfileDetail,
    openProfileReviews,
    closeProfileReviews,
    openProfilePosts,
    closeProfilePosts,
    openProfileReviewDetail,
    openProfileAchievements,
    openProfileSummary,
    closeProfileAchievements,
    openProfileGlobals,
    openRelatedReview,
  } = useSocialNavigation(navigate, location.pathname);


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

  const handleCreateSocialGist = useCallback(async () => {
    if (!mainSyncConfig?.token) {
      setFeedback('warn', SOCIAL_UI.status.needMainSync);
      return;
    }

    if (!authUser) {
      setFeedback('warn', SOCIAL_UI.status.needGoogleBeforeCreate);
      return;
    }

    try {
      setConnecting(true);
      const existing = await attachExistingSocialGist(authUser);
      if (existing === 'linked') {
        return;
      }
      if (existing === 'unknown') {
        // Puede que ya tenga canal: crear otro aquí sería el canal vacío de `attachExistingSocialGist`. Y el
        // auto-crear no vuelve a intentarlo en esta sesión: su efecto se dispara cada vez que `connecting` vuelve a
        // `false`, así que sin este cierre preguntaría en bucle a un servicio que no responde.
        autoCreateSocialGistBlockedRef.current = true;
        return;
      }

      const created = await createSocialGist(mainSyncConfig.token);
      saveSocialSyncConfig({
        token: mainSyncConfig.token,
        gistId: created.gistId,
        etag: created.etag,
        lastRemoteUpdatedAt: 0,
      });
      setSocialCfgGistId(created.gistId);
      setSocialCfgEtag(created.etag);
      setFeedback('ok', SOCIAL_UI.status.gistNotFoundCreated);
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.createGistFailed);
    } finally {
      setConnecting(false);
    }
  }, [attachExistingSocialGist, authUser, mainSyncConfig, reportFailure, setFeedback]);

  const handleSignInGoogle = useCallback(async () => {
    let superseded = false;
    try {
      setSigningIn(true);
      // Si vuelve sin terminar (cerró la ventana, o «atrás» en el móvil), el botón se devuelve enseguida en vez de
      // quedarse en «Entrando...» hasta que Firebase se dé cuenta (ver `core/utils/googleSignIn`).
      const user = await signInWithGoogle({ onAbandoned: () => setSigningIn(false) });
      setAuthUser(user);
      const linkedExisting = (await attachExistingSocialGist(user)) === 'linked';
      if (linkedExisting) {
        setShowSocialSpace(true);
        setFeedback('ok', SOCIAL_UI.status.signInAndLinked);
      } else {
        // No hacer nada aquí; el useEffect automático manejará la creación del gist
      }
    } catch (error) {
      // Volvió a pulsar: este intento lo canceló el nuevo, que es quien lleva el botón ahora.
      if (isSupersededSignIn(error)) {
        superseded = true;
        return;
      }
      reportFailure(error, SOCIAL_UI.status.signInFailed);
    } finally {
      if (!superseded) setSigningIn(false);
    }
  }, [attachExistingSocialGist, reportFailure, setFeedback]);

  const hydrateSocialProfile = useCallback(async () => {
    if (!socialSpaceOpen || !authUser || !socialCfgGistId) {
      return;
    }

    // C4: el token del canal social también se descifra de forma asíncrona. Sin esperarlo, una hidratación que
    // llegue antes que la del arranque leería `token: ''` y abortaría con "falta el token" teniéndolo.
    await ensureSyncConfigLoaded();
    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token) {
      setFeedback('err', SOCIAL_UI.status.missingSocialToken);
      return;
    }

    /**
     * Aplica un perfil ya guardado en este dispositivo. Extraído porque se usa en DOS caminos: el normal (caché
     * dentro de su ventana) y el de rescate (la lectura del gist falla por red → mejor el perfil de hace un rato
     * que mandar al usuario al editor como si no tuviera perfil).
     */
    const applyCachedProfile = (cached: CachedSocialProfileData) => {
      // No confiamos en el `profileExists` cacheado (pudo escribirse con una regla antigua): lo recalculamos con el
      // criterio actual (nombre Y ≥1 juego completado) para que los perfiles incompletos ya guardados sean
      // redirigidos al editor sin esperar a que caduque la caché (~5 min).
      const cachedProfileExists = Boolean(cached.name.trim()) && hasCompletedGames;
      hydrateProfileForm({ name: cached.name, visibility: cached });
      setHasCreatedProfile(cachedProfileExists);

      const cachedProfileUsable = Boolean(cached.name.trim()) && completedGamesRequirementMet;
      const mustCreateCached = shouldRequireProfileCreation(cachedProfileUsable, justSavedProfile);
      if (mustCreateCached) {
        lockProfileEditor();
      } else {
        setMustCreateProfile(false);
      }
    };

    // Caché persistente del perfil propio: al volver a la pantalla social dentro de la ventana (<5 min) se sirve de
    // IndexedDB sin releer el gist propio ni consultar Firestore. El guardado del perfil invalida esta caché.
    const cachedProfile = await getCachedSocialProfile(socialCfgGistId);
    if (cachedProfile) {
      applyCachedProfile(cachedProfile);
      return;
    }

    try {
      setHydratingProfile(true);
      // Solo da un respaldo del nombre (abajo): si Firestore no atiende, se sigue con lo del gist en vez de perder la
      // hidratación entera por un dato de reserva.
      const existingProfile = await resolveOwnProfile(authUser).catch(() => null);

      const socialRead = await readSocialGist(socialConfig.token, socialCfgGistId, socialCfgEtag);
      if (!socialRead.notModified) {
        setSocialCfgEtag(socialRead.etag || null);
      }

      const hasLegacySharedLists = Object.keys(socialRead.data.profile.sharedLists || {}).length > 0;

      // Upgrade proactivo: reescribir si el remoto conserva texto de reseña legacy (review/reviewText), identidad por
      // uid, sharedLists, o arrays de recomendaciones legacy (ST3) → todo eso lo detecta socialGistNeedsRewrite
      // (socialRead.wasLegacy). Deja el gist en formato index-only actual (snippet-only, sin recommendations/sharedLists).
      if (hasLegacySharedLists || socialRead.wasLegacy) {
        // 6.2b: al reescribir el gist propio, remapea la identidad legacy (miUid → miProfileId) para sacar
        // el uid del canal público; el resto de la limpieza (snippet-only, sin sharedLists) sigue igual.
        const myProfileId = await resolveStableProfileId(authUser.uid);
        const remapped = remapSocialActorIds(socialRead.data, { [authUser.uid]: myProfileId });
        const cleanedPayload = {
          ...remapped,
          profile: {
            ...remapped.profile,
            sharedLists: {},
          },
          updatedAt: Date.now(),
        };

        const cleanedWrite = await writeSocialGist(socialConfig.token, socialCfgGistId, cleanedPayload);
        const nextEtag = cleanedWrite.etag || socialRead.etag || null;
        setSocialCfgEtag(nextEtag);
        saveSocialSyncConfig({
          token: socialConfig.token,
          gistId: socialCfgGistId,
          etag: nextEtag,
          lastRemoteUpdatedAt: Date.now(),
        });
      }

      const nextName = socialRead.data.profile.name || existingProfile?.displayName || authUser.displayName || authUser.email;
      const profileVisibility = socialRead.data.profile.visibility || defaultSocialVisibility;
      // Un perfil se considera COMPLETO (nombre Y al menos un juego completado en local) para el chip de estado y
      // para el guardado. Pero lo que decide MANDAR AL EDITOR es solo si el perfil EXISTE, o sea si tiene nombre.
      //
      // Lo que cambia respecto a antes es SOLO el caso ambiguo: sin biblioteca en este dispositivo no se puede
      // afirmar que no haya completados (ver `completedGamesRequirementMet`). Con la biblioteca presente y ningún
      // completado, se sigue mandando al editor con el motivo a la vista, que es la regla de alta de siempre.
      const profileHasIdentity = Boolean(socialRead.data.profile.name.trim());
      const profileExists = profileHasIdentity && hasCompletedGames;

      const normalizedVisibility = normalizeVisibility(profileVisibility);
      hydrateProfileForm({ name: nextName, visibility: normalizedVisibility });
      setHasCreatedProfile(profileExists);

      // Sembrar la caché para que la próxima navegación a social no relea el gist propio dentro de la ventana de TTL.
      void putCachedSocialProfile(socialCfgGistId, {
        name: nextName,
        ...normalizedVisibility,
        profileExists,
        activity: socialRead.data.activity,
      });

      const mustCreate = shouldRequireProfileCreation(profileHasIdentity && completedGamesRequirementMet, justSavedProfile);

      // Keep profile creation routing centralized to avoid navigation regressions.
      if (mustCreate) {
        lockProfileEditor();
      } else {
        setMustCreateProfile(false);
      }
    } catch (error) {
      if (isNotFoundGistError(error) && authUser && mainSyncConfig?.token) {
        saveSocialSyncConfig({
          token: mainSyncConfig.token,
          gistId: '',
          etag: null,
          lastRemoteUpdatedAt: 0,
        });
        setSocialCfgGistId('');
        setSocialCfgEtag(null);
        setHasCreatedProfile(false);
        lockProfileEditor();
        setFeedback('warn', SOCIAL_UI.gateway.gistMissing);
        return;
      }

      // Fallo de RED o del SERVICIO (GitHub limitando, por ejemplo): se rescata el perfil guardado aunque su ventana
      // haya expirado. Sin esto, la caché caducada equivalía a no tener perfil —y el editor se cerraba encima.
      if (isServiceUnavailable(error) || isOffline()) {
        const stale = await getCachedSocialProfile(socialCfgGistId, { allowExpired: true }).catch(() => null);
        if (stale) {
          applyCachedProfile(stale);
        }
      }
      reportFailure(error, SOCIAL_UI.status.loadProfileFailed);
    } finally {
      setHydratingProfile(false);
    }
  }, [
    authUser,
    // Las DOS reglas que aplica este callback, y no basta con la primera: `profileExists` mira
    // `hasCompletedGames` (estricta) y `mustCreate` mira `completedGamesRequirementMet` (indulgente cuando la
    // biblioteca no está en este dispositivo). Faltaba la segunda, que se deriva además de
    // `libraryPresentLocally`: abrir el espacio social antes de que llegara la biblioteca fijaba la vía
    // indulgente y ahí se quedaba, porque al llegar la biblioteca con juegos y ningún completado
    // `hasCompletedGames` seguía en `false` y el callback no se recreaba. El usuario sin completados dejaba de
    // ir al editor de perfil.
    hasCompletedGames,
    completedGamesRequirementMet,
    defaultSocialVisibility,
    hydrateProfileForm,
    lockProfileEditor,
    reportFailure,
    setFeedback,
    socialSpaceOpen,
    socialCfgEtag,
    socialCfgGistId,
    justSavedProfile,
    mainSyncConfig?.token,
  ]);

  useEffect(() => {
    // Al editor SOLO por perfil incompleto (`mustCreateProfile`), no por `profileEditorLocked`: ese incluye
    // `hasBlockingSocialIssue`, que lo enciende CUALQUIER error de nivel `err` de lo social. Un fallo de red al leer
    // un gist acababa mandando al usuario a "crea tu perfil", que es un diagnóstico falso: su perfil está bien y lo
    // que ha fallado es otra cosa. El bloqueo del feed no cambia —`profileEditorLocked` sigue frenando la
    // hidratación—, lo que se retira es el secuestro de la navegación.
    if (shouldRedirectToProfileEditor(mustCreateProfile, activePanel)) {
      void navigate('/social/profile');
    }
  }, [mustCreateProfile, activePanel, navigate]);

  useEffect(() => {
    void hydrateSocialProfile();
  }, [hydrateSocialProfile]);

  // LA REPARACIÓN DE LA RÉPLICA DEL NICK vive ahora en `useSocialStartupTasks`, con los otros saneados de
  // arranque: el guardado del perfil escribe el gist y DESPUÉS replica el nombre en `profiles/{uid}`, y si eso
  // segundo falla nada lo reintentaba. Allí lleva sello (`profileNameRepairedFor`), así que deja de costar una
  // lectura de Firestore por apertura del hub para descubrir que el nombre ya estaba bien.

  // Rango propio → cadencia del feed. Una sola lectura del perfil propio (ya cacheada 60 s en memoria por
  // `getOwnProfileRef`). Cualquier fallo deja bronce: degradar es lo seguro.
  //
  // `tierResolved` es lo que evita que el privilegio del rango llegue SIEMPRE un paso tarde. Antes se hidrataba con
  // el bronce por defecto y, al llegar el rango de verdad, la hidratación entera se repetía: medido, un bronce
  // hidrataba UNA vez y un plata/oro/mithril DOS —la segunda releyendo hasta ~50 gists de amigos—, y con la caché
  // caliente esa segunda pasada tapaba con el esqueleto un feed ya pintado. Es decir, cuanto más alto el rango,
  // peor la experiencia: justo lo contrario de lo que el rango promete. Ahora se espera a saberlo, igual que se
  // espera a `friendshipsResolved`, y la primera evaluación de la caché ya usa el TTL que toca.
  useEffect(() => {
    if (!authUser?.uid) {
      setOwnTier(DEFAULT_PROFILE_TIER);
      setOwnProfileCreatedAt(0);
      setOwnProfilePublished(false);
      setOwnPublishedMirror(NO_PUBLISHED_MIRROR);
      setTierResolved(false);
      return;
    }
    let cancelled = false;
    void resolveOwnProfile(authUser)
      .then((profile) => {
        if (cancelled) return;
        setOwnTier(profile?.tier || DEFAULT_PROFILE_TIER);
        // De paso, la fecha de alta y si el perfil está publicado: es el mismo documento y la misma lectura.
        setOwnProfileCreatedAt(profile?.createdAt || 0);
        setOwnProfilePublished(Boolean(profile?.socialEnabled));
        setOwnPublishedMirror({ list: profile?.achievementsMirror || '', at: profile?.achievementsMirrorAt || 0 });
      })
      .catch(() => {
        /* sin rango conocido → bronce */
      })
      .finally(() => {
        // Resuelto SIEMPRE, también si la lectura falla: sin esto, un Firestore caído dejaría el feed sin hidratar
        // (y con el esqueleto puesto) en vez de degradar a la cadencia de bronce, que es lo seguro.
        if (!cancelled) setTierResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // Cambiar de identidad (otra cuenta, otro canal social) invalida lo asentado: lo que venga es un directorio
  // distinto, así que la pantalla tiene que volver a decir "cargando" y no el vacío del anterior. Declarado ANTES
  // del efecto de hidratación para que, en un mismo commit, el reinicio corra primero.
  useEffect(() => {
    setDirectorySettled(false);
  }, [authUser?.uid, socialCfgGistId, setDirectorySettled]);




  // F3 — compositor de publicaciones. Se invoca AQUÍ, y no arriba con el resto del estado, porque necesita
  // `hydrateSocialDirectory` para refrescar el feed tras publicar; el orden de los hooks es estable entre renders,
  // que es lo único que React exige.
  const {
    publishingPost,
    handlePublishPost,
    canPublishPosts: canPublish,
    postMaxLength,
    showPostCounter,
    changingPostId,
    handleEditPost,
    handleDeletePost,
  } = useSocialCompose({
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
    writeCanPublishHint(canPublish);
  }, [tierResolved, canPublish]);

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
  }, [online]);

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

  // Limpia al desmontar el timer que borra el mensaje de estado (evita setState tras desmontar). El hub se
  // desmonta al salir de /social, así que esto ocurre a menudo. El del cooldown del botón "Actualizar" lo limpia
  // `useSocialDirectory`, que es quien lo arma.
  useEffect(() => () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  // Bloque 2 — pone al día la foto propia EN LOS CANALES PÚBLICOS, en los dos sentidos.
  //
  // PROPAGAR: la foto solo la ven otros si está en NUESTRO gist social público. Gists creados antes del soporte de
  // foto (o sin re-guardar el perfil) no la llevan, así que nadie veía la de nadie.
  //
  // RETIRAR: si lo que la cuenta tiene es el avatar GENÉRICO de Google, hay que quitarlo de donde ya se publicó. Es
  // la única vía de saneado: esas URLs se escribieron cuando "tener URL" contaba como tener foto, y ni el gist ni el
  // doc de directorio se reescriben solos. Filtrarlo al pintar (`HubAvatar`) quita el síntoma en NUESTRA pantalla;
  // esto lo quita del dato, que es lo que leen los demás.
  //
  // Una vez por sesión y best-effort: si falla, se reintenta en la próxima.
  const photoHealAttemptedRef = useRef(false);
  useEffect(() => {
    if (photoHealAttemptedRef.current) return;
    if (!socialSpaceOpen || !socialCfgGistId) return;
    const sessionPhoto = authUser?.photoURL || '';
    if (!sessionPhoto) return;
    // Sin veredicto no se toca nada: publicar ahora sellaría la genérica y armaría la ref, y no habría otra pasada.
    if (ownPhotoVerdictPending) return;
    // Lo que debe quedar publicado: la foto de la sesión, o nada si es el avatar genérico.
    const target = ownPhotoIsGeneric ? '' : sessionPhoto;
    // Con la foto apagada a propósito no hay nada que propagar. Pero una genérica ya publicada SÍ se retira: el
    // opt-out protege lo que el usuario decidió mostrar, no una imagen que nunca fue suya.
    if (!showPhoto && target) return;
    const cfg = getSocialSyncConfig();
    if (!cfg?.token) return;
    photoHealAttemptedRef.current = true;

    void (async () => {
      try {
        // 2b — idempotencia entre sesiones: si ya dejamos el canal en este estado, no releemos ni reescribimos el
        // gist. Vale para los dos sentidos: `''` marca "ya retirada".
        const meta = await getLocalMeta();
        if (meta?.photoHealedFor === target) return;

        const current = await readSocialGist(cfg.token, socialCfgGistId, null);
        const data = current.data;
        if (!data) return;
        // El gist es la fuente de verdad: si el usuario tiene la foto desactivada, NO la republicamos (evita revertir
        // su opt-out por una carrera con la hidratación del perfil, que arranca con showPhoto=true por defecto). La
        // retirada de una genérica no se frena aquí: quitarla nunca va contra lo que el usuario quiso.
        if (data.profile.visibility?.showPhoto === false && target) return;

        if ((data.profile.photoURL || '') !== target) {
          await writeSocialGist(cfg.token, socialCfgGistId, {
            // `photoURL: ''` no se publica: el saneado del gist descarta lo que no sea una URL válida, así que el
            // campo desaparece del canal en vez de quedarse vacío.
            profile: { ...data.profile, photoURL: target },
            activity: data.activity,
            posts: data.posts,
            updatedAt: Date.now(),
          });
          // 2a — sin re-hidratación completa (~30 lecturas). La foto propia ya se ve por el fallback de sesión; solo
          // parcheamos la entrada propia del directorio en memoria por si acaso, y la del directorio cacheado.
          patchDirectoryEntries((e) => e.socialGistId === socialCfgGistId, { photoURL: target });
        }
        // Propaga (o borra) también la foto en el doc público de Firestore (la lee el directorio), para que los demás
        // lo vean sin depender de que cada uno reabra la app y re-publique su gist. Best-effort.
        if (authUser?.uid) {
          await updateProfilePhoto(authUser.uid, target);
        }
        await patchLocalMeta({ photoHealedFor: target });
      } catch {
        // best-effort: no bloquea el feed; se reintenta la próxima sesión.
      }
    })();
  }, [authUser?.uid, authUser?.photoURL, ownPhotoIsGeneric, ownPhotoVerdictPending, showPhoto, socialSpaceOpen, socialCfgGistId, patchDirectoryEntries]);

  // Auto-crear gist social si tenemos token + Google pero no gist. Salvo que en esta sesión no se haya podido saber
  // si ya existe uno (`unknown`): entonces se espera a otra sesión o al botón; nunca se crea a ciegas.
  useEffect(() => {
    autoCreateSocialGistBlockedRef.current = false;
  }, [authUser?.uid]);
  useEffect(() => {
    if (
      hasMainSync && authUser && !hasSocialGist && !connecting && !resolvingSocialGist && !signingIn &&
      !autoCreateSocialGistBlockedRef.current
    ) {
      void handleCreateSocialGist();
    }
  }, [hasMainSync, authUser, hasSocialGist, connecting, resolvingSocialGist, signingIn, handleCreateSocialGist]);

  const handleSaveProfile = useCallback(async () => {
    await ensureSyncConfigLoaded(); // C4: igual que en `hydrateSocialProfile`, el token social se descifra async
    const socialConfig = getSocialSyncConfig();
    if (!authUser || !socialConfig?.token || !socialCfgGistId) {
      setFeedback('err', SOCIAL_UI.status.invalidSaveContext);
      return;
    }

    // Un perfil solo es válido con nombre Y al menos un juego completado: así nadie se da de alta en el canal
    // social sin nada que compartir. Misma regla que aplican la hidratación y el gate del botón de Cuenta.
    if (!profileName.trim() || !hasCompletedGames) {
      setFeedback('warn', SOCIAL_UI.status.profileIncomplete);
      return;
    }

    try {
      setSavingProfile(true);
      // SIN FOTO EN LA CUENTA, `showPhoto` SE GUARDA EN FALSE. No se confía en que el efecto que apaga el estado haya
      // corrido ya: la hidratación del perfil llega por red y devuelve el `showPhoto: true` del gist, así que entre
      // esa respuesta y el apagado hay una ventana en la que un guardado rápido habría vuelto a escribir el "sí".
      // Aquí la decisión es de una sola línea y no depende de ningún orden. "Sin foto" incluye el avatar genérico de
      // Google: tener URL no es tener cara.
      const visibility = {
        ...profileForm.visibility,
        showPhoto: profileForm.visibility.showPhoto && Boolean(authUser.photoURL) && !ownPhotoIsGeneric,
      };
      const normalizedHiddenTabs = visibility.hiddenTabs;

      const profile = {
        // PRIVACIDAD: el nick es LO QUE ESCRIBE EL USUARIO, y nada más. Aquí había un respaldo a
        // `authUser.displayName || authUser.email` que publicaba su nombre real de Google —o su correo— como nombre
        // público en el gist y en el directorio. Era inalcanzable (la guarda de arriba corta con el nick vacío) pero
        // bastaba con relajar esa guarda para que se filtrara. Sin nick no hay perfil: es la regla, no un defecto.
        name: profileName.trim(),
        private: false,
        visibility,
        sharedLists: {},
        // Solo se publica la foto si el usuario la muestra Y es una foto de verdad (normalize la valida/descarta si no).
        ...(ownPublishablePhoto ? { photoURL: ownPublishablePhoto } : {}),
      };

      const currentGistResult = await readSocialGist(socialConfig.token, socialCfgGistId, null);
      const currentGistData = currentGistResult.data;

      const writeResult = await writeSocialGist(socialConfig.token, socialCfgGistId, {
        profile,
        activity: currentGistData.activity,
        posts: currentGistData.posts, // preservar las publicaciones al guardar el perfil
        updatedAt: Date.now(),
      });

      // Ya NO se fuerza el gist a público. GitHub no permite cambiar la visibilidad, así que aquello CLONABA el
      // gist a un id nuevo y dejaba el original huérfano: es el origen de la deriva. Y era innecesario, porque un
      // gist secreto lo puede leer igualmente quien tenga su identificador («secret gists aren't private»).
      // El canal se queda con el id que ya tenía.
      const finalGistId = socialCfgGistId;
      const finalEtag = writeResult.etag || socialCfgEtag;

      await ensureProfileByEmail({
        user: authUser,
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
        githubToken: mainSyncConfig?.token || socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
        socialGistEtag: finalEtag,
        preferredName: profile.name,
        // Publica la foto en el doc público (la lee el directorio); '' la borra si el usuario desactiva la foto o si
        // lo que tiene es el avatar genérico de Google.
        photoURL: ownPublishablePhoto,
      });

      saveSocialSyncConfig({
        token: socialConfig.token,
        gistId: finalGistId,
        etag: finalEtag,
        lastRemoteUpdatedAt: Date.now(),
      });
      setSocialCfgGistId(finalGistId);
      setSocialCfgEtag(finalEtag);

      // PRIVACIDAD: propaga el nick recién guardado a mis docs de amistad ya existentes (que pudieron quedar con un
      // nombre antiguo/real). Best-effort: no bloquea el guardado del perfil.
      void healOwnFriendshipIdentity(authUser.uid, {
        name: profile.name,
        photo: ownPublishablePhoto,
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
      });

      // Y A LA PAPELETA DE LOS PREMIOS, si la hay: con perfil social, el nombre de la papeleta ES el del perfil (no
      // se elige al votar), así que la clasificación no debe publicar uno que ya no usa. No gasta ninguna
      // oportunidad (ver `renameOwnBallot`). El módulo es de la sección de premios, que es perezosa: se trae solo
      // al guardar. Best-effort, como lo anterior.
      void import('../model/repository/premios/premiosBallotRepository')
        .then(({ renameOwnBallot }) => renameOwnBallot(authUser.uid, profile.name))
        .catch(() => {
          /* sin papeleta, sin red o sin sesión: el perfil ya está guardado */
        });

      // Refrescar la caché del perfil con lo recién guardado: evita releer el gist al volver a social y mantiene
      // la caché coherente con la edición.
      void putCachedSocialProfile(finalGistId, {
        name: profile.name,
        hiddenTabs: normalizedHiddenTabs,
        hideReplayable,
        hideRetry,
        hideGameTime,
        // El MISMO valor que se acaba de escribir en el gist, no el del formulario: si la caché guardara el "sí"
        // que el gist ya no tiene, la siguiente apertura del hub hidrataría el ajuste con el dato viejo.
        showPhoto: visibility.showPhoto,
        profileExists: true,
        activity: currentGistData.activity,
      });

      setHasCreatedProfile(true);
      setMustCreateProfile(false);
      setJustSavedProfile(true);

      // Momento clave del usuario nuevo: acaba de completar su perfil, así que sus reseñas ANTERIORES al alta
      // (que nunca pasaron por `publishReviewActivity`) entran ahora al feed. Forzado: ignora sello y recuento.
      // Antes de `hydrateSocialDirectory` para que el feed ya se pinte con la actividad reconciliada.
      try {
        await reconcileReviewActivity({ games: reconcileGames, force: true });
      } catch {
        /* best-effort: no puede tumbar el guardado del perfil; se reintenta en la próxima apertura. */
      }

      void navigate('/social');
      void hydrateSocialDirectory();
      setFeedback('ok', SOCIAL_UI.status.profileSaved);

      setTimeout(() => setJustSavedProfile(false), 1000);
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.saveProfileFailed);
    } finally {
      setSavingProfile(false);
    }
  }, [
    authUser,
    hasCompletedGames,
    // Memoizada sobre los cinco interruptores (`useSocialProfileForm`), así que su identidad solo cambia cuando
    // cambia uno de ellos. Es LO QUE SE ESCRIBE en el gist, y cubre el que faltaba: `hiddenTabs`,
    // `hideReplayable`, `hideRetry` y `hideGameTime` estaban enumerados sueltos, `showPhoto` no. Los tres de
    // abajo siguen porque además se leen sueltos al sembrar la caché del perfil.
    profileForm.visibility,
    hideReplayable,
    hideRetry,
    hideGameTime,
    hydrateSocialDirectory,
    navigate,
    profileName,
    reconcileGames,
    reportFailure,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
    // El guardado decide con ellos si publica la foto y si deja `showPhoto` activado: leerlos de un render anterior
    // escribiría en el gist una decisión que ya no es la vigente.
    ownPhotoIsGeneric,
    ownPublishablePhoto,
    // La configuración principal se hidrata de forma ASÍNCRONA (el token viaja cifrado), así que un render
    // temprano la ve a `null`. Sin estas dos dependencias el guardado se quedaba con esa foto: publicaba el
    // perfil con `gamesGistId: ''` —que `healOwnFriendshipIdentity` propagaba a TODOS mis docs de amistad, o sea
    // que dejaba a mis amigos sin mi lista de juegos— y cifraba en `privateConfig` un token que ya no era el
    // vigente. El repositorio ya no escribe ids vacíos, pero la foto correcta se consigue aquí.
    mainSyncConfig?.gistId,
    mainSyncConfig?.token,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOutSocialUser();
    void clearAnalyticsUser(); // desvincula al usuario de los eventos/errores posteriores (simétrico con setAnalyticsUser en login)
    setAuthUser(null);
    setShowSocialSpace(false);
    setFeedback('ok', SOCIAL_UI.status.signOut, 'long');
  }, [setFeedback]);

  // Datos que YO aporto al doc de amistad (denormalizados): mi nombre/foto (respetando showPhoto) + mis ids de gist.
  // PRIVACIDAD: el nombre es SIEMPRE el nick del perfil social (`profileName`), NUNCA el nombre real de Google
  // (`authUser.displayName`) ni el email. Si el nick aún no está cargado, se guarda vacío (el lector muestra un
  // placeholder) en lugar de filtrar el nombre real.
  const primaryGatewayCta = useMemo(() => {
    type GatewayCta = {
      icon: IconName;
      label: string;
      action: () => void;
      disabled: boolean;
    };

    // Paso 1: Conectar sincronización principal (token)
    if (!hasMainSync) {
      return {
        icon: 'gear',
        label: SOCIAL_UI.gateway.connectSync,
        // El contrato del CTA es `() => void`; `navigate` devuelve promesa, así que la flecha la propagaba y el
        // consumidor creía tener un manejador síncrono. Llaves + `void`: la intención queda escrita y el tipo cuadra.
        action: () => { void navigate('/ajustes'); },
        disabled: false,
      } satisfies GatewayCta;
    }

    // Paso 2: Google (si tenemos token pero no sesión)
    if (resolvingSocialGist) {
      return {
        icon: 'cloud-sync',
        label: SOCIAL_UI.gateway.resolveProfile,
        action: () => undefined,
        disabled: true,
      } satisfies GatewayCta;
    }

    if (canSignInGoogle) {
      return {
        icon: 'bottom-hub',
        label: signingIn ? SOCIAL_UI.gateway.signingIn : SOCIAL_UI.gateway.signIn,
        action: () => void handleSignInGoogle(),
        disabled: signingIn,
      } satisfies GatewayCta;
    }

    // Paso 3: Gist social (si tenemos sesión pero no gist) - normalmente automático pero se puede forzar
    if (canConnectSocialGist) {
      return {
        icon: 'cloud-sync',
        label: connecting ? SOCIAL_UI.gateway.creatingGist : SOCIAL_UI.gateway.createGist,
        action: () => void handleCreateSocialGist(),
        disabled: connecting,
      } satisfies GatewayCta;
    }

    return null;
  }, [canConnectSocialGist, canSignInGoogle, connecting, handleCreateSocialGist, handleSignInGoogle, hasMainSync, navigate, resolvingSocialGist, signingIn]);


  return {
    navigate,
    activePanel,
    socialCfgGistId,
    authUser,
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
    // Carga = hidratación inicial + comprobación del consentimiento en vuelo (ver `legalConsentPending`).
    loading: loading || legalConsentPending,
    status,
    statusKind,
    showSocialSpace: socialSpaceOpen,
    hasCreatedProfile,
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
    profileSearch,
    setProfileSearch,
    // Rango propio y lo que implica al publicar: si puede, cuánto, y si hay contador que enseñar.
    ownTier,
    // ¿Es la administración? (el claim, no el rango): exenciones en la ficha de un amigo.
    isAdmin,
    canPublishPosts: canPublish,
    postMaxLength,
    showPostCounter,
    publishingPost,
    handlePublishPost,
    // Editar y borrar las tuyas, desde la lista de publicaciones de tu perfil.
    changingPostId,
    handleEditPost,
    handleDeletePost,
    feedItems,
    hydratingProfile,
    savingProfile,
    // Se expone el valor DERIVADO (no el `loadingDirectory` crudo): es el único que cubre la ventana completa, y
    // así ninguna pantalla puede olvidarse de sumarle la parte que falta.
    // En «Perfiles» cuenta también la consulta de los recientes: sin ella, la sección «Otros» saldría vacía un instante.
    loadingDirectory: directoryLoading || (activePanel === 'profiles' && discoverLoading),
    hasMainSync,
    hasSocialGist,
    hasSocialSession,
    gatewaySteps,
    currentStep,
    completedGames,
    socialDisplayName,
    filteredSocialDirectory,
    // EL DIRECTORIO SIN EL BUSCADOR. Sale porque hay dos preguntas distintas y solo estaba la primera: a quién
    // se le enseña la lista de personas —eso sí lo recorta el buscador— y sobre quién se mide (§6.6bis), que no
    // puede depender de lo que haya escrito en una caja de texto.
    visibleSocialDirectory,
    selectedProfileDetail,
    profileDetailId,
    profileReviewsView,
    profilePostsView,
    profileAchievementsView,
    profileGlobalsView,
    ownAchievements,
    ownAchievementMirror,
    activeProfileReview,
    openProfileReviews,
    closeProfileReviews,
    openProfilePosts,
    closeProfilePosts,
    openProfileAchievements,
    openProfileSummary,
    markOwnYearSummaryOpened,
    closeProfileAchievements,
    openProfileGlobals,
    openProfileReviewDetail,
    activeDetailEvent,
    // ¿Puede aparecer todavía el evento abierto? (ver arriba: decide esqueleto vs «no se ha encontrado»).
    detailEventLoading,
    profileDetailLoading,
    // ¿Falta todavía el análisis completo de la reseña abierta? (ver arriba: decide esqueleto vs adelanto).
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
  };
}
