import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  createSocialGist,
  ensureSyncConfigLoaded,
  getSocialSyncConfig,
  getSyncConfig,
  mergeSocialGistData,
  readPublicSocialGistById,
  readSocialGist,
  remapSocialActorIds,
  saveSocialSyncConfig,
  type SocialActivityEntry,
  type SocialGistData,
  type SocialPostEntry,
  type SocialProfileVisibility,
  type SocialSharedGame,
  updateGistPrivacy,
  writeSocialGist,
} from '../model/repository/gistRepository';
import { publishPost } from '../model/repository/socialPublishRepository';
import { reconcileReviewActivity } from '../model/repository/socialActivityReconcile';
import { invalidateProfileGames, loadForeignProfileGames } from '../model/repository/foreignProfileRepository';
import { getCachedSocialDirectory, getCachedSocialProfile, getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta, putCachedSocialDirectory, putCachedSocialProfile } from '../model/repository/indexedDbRepository';
import { applyProfileVisibility } from '../core/utils/profileVisibility';
import { SOCIAL_UI } from '../core/constants/labels';
import { LEGAL_CONSENT_UI, LEGAL_VERSION } from '../core/constants/legal';
import type { IconName } from '../core/constants/icons';
import { DEFAULT_PROFILE_TIER, PROFILE_TIER_FEED_TTL_MS, type ProfileTier } from '../core/constants/tiers';
import { TAB_IDS, type GameItem, type SyncConfig, type TabData, type TabId } from '../model/types/game';
import {
  acceptFriendRequest,
  clearAnalyticsUser,
  deleteFriendship,
  ensureProfileByEmail,
  getCurrentSocialAuthUser,
  getMyFriendships,
  getPublicConfig,
  setPublicConfig,
  healOwnDirectoryGist,
  healOwnFriendshipIdentity,
  listSocialDirectory,
  readFriendship,
  resolveOwnProfile,
  resolveStableProfileId,
  sendFriendRequest,
  signInWithGoogle,
  signOutSocialUser,
  touchOwnProfileActivity,
  updateProfilePhoto,
  type FriendshipSelfInfo,
  type SocialAuthUser,
} from '../model/repository/firebaseRepository';
import type { FriendshipView, MyFriendships, RelationshipState } from '../model/types/social';
import { loadLocalState } from '../model/repository/localRepository';
import { normalizeTimestamp as toSafeTimestamp } from '../core/utils/normalize';
import { mapWithConcurrency } from '../core/utils/concurrency';

const shouldRequireProfileCreation = (profileExists: boolean, justSavedProfile: boolean): boolean => {
  return !profileExists && !justSavedProfile;
};

const shouldRedirectToProfileEditor = (isProfileEditorLocked: boolean, activePanel: string): boolean => {
  return isProfileEditorLocked && activePanel !== 'profile';
};

const isProfileEditorLocked = (mustCreateProfile: boolean, hasBlockingSocialIssue: boolean): boolean => {
  return mustCreateProfile || hasBlockingSocialIssue;
};

const isNotFoundGistError = (error: unknown): boolean => {
  return error instanceof Error && /\b404\b/.test(error.message);
};

type SocialPanel = 'profile' | 'profiles' | 'profile-detail' | 'profile-review' | 'detail' | 'requests' | 'feed';

type SocialRouteState = {
  activePanel: SocialPanel;
  profileDetailId: string;
  // Vista de "Reseñas" del detalle de perfil (sub-ruta /reviews). Se refleja en la URL para que, al abrir una
  // reseña y volver atrás, se regrese a la lista de reseñas y no a la vista general del perfil.
  profileReviewsView: boolean;
  // Id del juego cuya reseña se muestra a pantalla completa (sub-ruta /game/:gameId/review del perfil).
  profileReviewGameId: number;
  detailActorUid: string;
  detailGameId: number;
  detailEventType: string;
};

const FEED_PAGE_SIZE = 25;
// Rango válido de JS Date en ms (±100M días). Un `updatedAt` fuera de rango (p. ej. gist de otro usuario con el
// timestamp en micro/nanosegundos o corrupto) daría `new Date(x)` → Invalid Date, que el feed agrupado descarta.
// Si esos ítems ordenan arriba y copan el corte visible, el feed quedaría EN BLANCO. Se saca del feed en origen.
const MAX_VALID_DATE_MS = 8.64e15;
function hasRenderableTimestamp(value: unknown): boolean {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_VALID_DATE_MS;
}
// Cooldown mínimo entre refrescos forzados del directorio (botón "Actualizar feed").
const FORCED_REFRESH_MIN_MS = 12_000;
// Tope de perfiles del directorio social, ORDENADOS POR USO RECIENTE (`profiles.updatedAt`). Solo los AMIGOS
// cuestan una lectura de gist; los demás son index-only (nombre/foto de Firestore), así que subir este número
// cuesta lecturas de documento de Firestore, no rate-limit de GitHub. Tunable.
const SOCIAL_DIRECTORY_LIMIT = 50;
// Antigüedad máxima del último uso de un AMIGO para que su actividad entre en el feed. Un amigo más inactivo
// sigue en Perfiles y en la lista de amigos, y su perfil/reseñas se abren igual (salen de su gist de JUEGOS);
// simplemente su actividad no ocupa el feed y no se gasta una lectura de su gist social. Si no se conoce su
// recencia (no está en el directorio) NO se corta: nunca se oculta contenido por falta de datos. Tunable.
const FRIEND_ACTIVITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Acotado del latido de uso: una escritura por dispositivo cada 20 h (así un uso diario siempre lo refresca).
// Mantiene el grano de `profiles.updatedAt` en "días" en vez de convertirlo en un indicador de presencia.
const PROFILE_TOUCH_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
// C3: el directorio se hidrata leyendo el gist social de cada perfil. En vez de disparar TODAS las lecturas a la
// vez (ráfaga que puede activar los "secondary rate limits" de GitHub al crecer el directorio), se limita la
// concurrencia. Las lecturas son baratas (caché de sesión + revalidación ETag/304), así que el coste en latencia
// de la carga fría es pequeño y se gana robustez frente a 403 por ráfaga.
const SOCIAL_DIRECTORY_FETCH_CONCURRENCY = 6;
// Cuánta actividad se conserva por perfil al hidratar el directorio. El feed solo pinta las más recientes, pero la
// pestaña Reseñas del perfil FECHA Y ORDENA cada reseña con su publicación: con un tope de 40, las reseñas por
// debajo del corte se quedaban sin fecha publicada y caían al `_ts` del juego (que una importación sella en
// bloque), así que el listado mostraba fechas distintas del feed. Se iguala al tope del propio gist (320).
const SOCIAL_ACTIVITY_PER_PROFILE = 320;
// Las publicaciones sí se quedan en el tope del feed: ninguna vista las lista por separado.
const SOCIAL_POSTS_PER_PROFILE = 40;
const PROFILE_EDIT_PATH = /^\/social\/profile\/?$/;
const PROFILES_PATH = /^\/social\/profiles\/?$/;
const REQUESTS_PATH = /^\/social\/requests\/?$/;
const PROFILE_DETAIL_PATH = /^\/social\/profiles\/([^/]+)$/;
const PROFILE_REVIEWS_PATH = /^\/social\/profiles\/([^/]+)\/reviews$/;
const PROFILE_REVIEW_DETAIL_PATH = /^\/social\/profiles\/([^/]+)\/game\/(\d+)\/review$/;
const ACTIVITY_DETAIL_PATH = /^\/social\/user\/([^/]+)\/game\/(\d+)\/(review|recommendation)$/;

const getSocialRouteState = (pathname: string): SocialRouteState => {
  const profileEditMatch = pathname.match(PROFILE_EDIT_PATH);
  const profilesMatch = pathname.match(PROFILES_PATH);
  const requestsMatch = pathname.match(REQUESTS_PATH);
  const profileDetailMatch = pathname.match(PROFILE_DETAIL_PATH);
  const profileReviewsMatch = pathname.match(PROFILE_REVIEWS_PATH);
  const profileReviewDetailMatch = pathname.match(PROFILE_REVIEW_DETAIL_PATH);
  const detailMatch = pathname.match(ACTIVITY_DETAIL_PATH);

  // El id del perfil es común a las tres sub-rutas de detalle de perfil (/, /reviews, /game/:id/review).
  const profileDetailId = profileReviewDetailMatch
    ? decodeURIComponent(profileReviewDetailMatch[1])
    : profileReviewsMatch
      ? decodeURIComponent(profileReviewsMatch[1])
      : profileDetailMatch
        ? decodeURIComponent(profileDetailMatch[1])
        : '';

  return {
    activePanel: profileEditMatch
      ? 'profile'
      : profilesMatch
        ? 'profiles'
        : requestsMatch
          ? 'requests'
          : profileReviewDetailMatch
            ? 'profile-review'
            : profileReviewsMatch || profileDetailMatch
              ? 'profile-detail'
              : detailMatch
                ? 'detail'
                : 'feed',
    profileDetailId,
    profileReviewsView: Boolean(profileReviewsMatch),
    profileReviewGameId: profileReviewDetailMatch ? Number(profileReviewDetailMatch[2]) : 0,
    detailActorUid: detailMatch ? decodeURIComponent(detailMatch[1]) : '',
    detailGameId: detailMatch ? Number(detailMatch[2]) : 0,
    detailEventType: detailMatch ? detailMatch[3] : '',
  };
};

/**
 * ViewModel del Hub social (M3). Extraído VERBATIM de SocialHub.tsx (god component) sin cambio de
 * comportamiento: mismo estado, mismos efectos, mismas dependencias y misma lógica. `SocialHub.tsx`
 * queda presentacional y consume este hook.
 */

/**
 * P1 (privacidad index-only): ¿la entrada de perfil/directorio (`entryId`) es la del usuario actual?
 * Compara por IDENTIDAD (uid o profileId), no por `email` — que sale del documento público en el refactor
 * index-only (ST1). Tolera ambas eras sin tocar este código en el cutover: hoy el id del doc es el `uid`; tras
 * el corte index-only será el `profileId`. Ambos se comprueban.
 */
export function isOwnProfileIdentity(
  entryId: string | null | undefined,
  uid: string | null | undefined,
  ownProfileId: string | null | undefined,
): boolean {
  if (!entryId) return false;
  return (Boolean(uid) && entryId === uid) || (Boolean(ownProfileId) && entryId === ownProfileId);
}

const FEED_DAY_MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/**
 * Formatea la fecha como "DD de MMM". Pura y sin capturas → a nivel de módulo
 * para que no se recree en cada render (evita invalidar el useMemo del feed).
 */
function formatDayHeader(date: Date): string {
  return `${date.getDate()} de ${FEED_DAY_MONTH_NAMES[date.getMonth()]}`;
}

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

  const routeState = useMemo(() => getSocialRouteState(location.pathname), [location.pathname]);
  const { activePanel, profileDetailId, profileReviewsView, profileReviewGameId, detailActorUid, detailGameId, detailEventType } = routeState;

  type SocialActivityFeedItem = SocialActivityEntry & {
    profileId: string;
    profileDisplayName: string;
    socialGistId: string;
    photoURL: string;
  };

  // F3 — publicación enriquecida con la identidad de su autor (para el feed).
  type SocialPostFeedItem = SocialPostEntry & {
    profileId: string;
    profileDisplayName: string;
    socialGistId: string;
    photoURL: string;
  };

  type SocialDirectoryEntry = {
    id: string;
    uid: string; // uid de Firebase (para relaciones de amistad); hoy coincide con `id`, robusto ante el cutover uid→profileId
    displayName: string;
    socialGistId: string;
    gamesGistId: string;
    photoURL: string;
    /**
     * Rango del perfil, para el punto de color de su tarjeta en el directorio. OBLIGATORIO a propósito: este tipo
     * LOCAL sombrea al del repositorio, y la hidratación reconstruye cada entrada campo a campo. Al declararlo
     * requerido, olvidarse de copiarlo en cualquiera de esas reconstrucciones es un error de compilación y no un
     * directorio entero pintado de bronce.
     */
    tier: ProfileTier;
    activity: SocialActivityFeedItem[];
    posts: SocialPostFeedItem[];
    // Index-only (SocialSharedGame) para perfiles ajenos; para el perfil PROPIO se repuebla con GameItem completos.
    sharedLists: Partial<Record<TabId, Array<GameItem | SocialSharedGame>>>;
    visibility: SocialProfileVisibility;
    /**
     * Amigo cuyo gist social NO se leyó por inactividad (corte de FRIEND_ACTIVITY_MAX_AGE_MS): su actividad no
     * entra al feed, pero al abrir su perfil se hidrata bajo demanda para no mostrarlo a medias.
     */
    socialSkipped?: boolean;
  };

  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
  // P1: profileId canónico del usuario (6.2a), para detectar propiedad por identidad (no por email). Hoy el id del
  // doc de directorio es el uid; tras el cutover index-only será el profileId → comprobamos ambos (ver isOwnProfileIdentity).
  const [ownProfileId, setOwnProfileId] = useState<string | null>(null);
  // Rango del PROPIO usuario: decide cada cuánto se rehidrata el feed (ver PROFILE_TIER_FEED_TTL_MS). Manda el de
  // quien mira porque las lecturas de gists ajenos van con SU token y cuentan contra SU rate-limit.
  const [ownTier, setOwnTier] = useState<ProfileTier>(DEFAULT_PROFILE_TIER);
  const [loading, setLoading] = useState(true);
  const [resolvingSocialGist, setResolvingSocialGist] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'err'>('ok');
  const [hasBlockingSocialIssue, setHasBlockingSocialIssue] = useState(false);
  const [showSocialSpace, setShowSocialSpace] = useState(false);
  // L4 — resultado de la comprobación ANOTADO CON EL UID al que corresponde. Guardar el uid es lo que evita la
  // carrera: entre que aparece la sesión y responde la comprobación hay renders en los que aún no se sabe nada,
  // y sin esa marca se colaría un "adelante" que luego habría que revertir (el usuario entraría y se le sacaría).
  // 'unknown' = la comprobación falló (offline/reglas) → se deja pasar; 'required' = hay que pedir la aceptación.
  const [legalConsent, setLegalConsent] = useState<{ uid: string; status: 'accepted' | 'required' | 'unknown' } | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [hasCreatedProfile, setHasCreatedProfile] = useState(false);
  const [mustCreateProfile, setMustCreateProfile] = useState(false);
  const [justSavedProfile, setJustSavedProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [hiddenTabs, setHiddenTabs] = useState<TabId[]>([]);
  const [showPhoto, setShowPhoto] = useState(true);
  const [hideReplayable, setHideReplayable] = useState(false);
  const [hideRetry, setHideRetry] = useState(false);
  const [hideGameTime, setHideGameTime] = useState(false);
  // Filtro por nombre de la pantalla "Perfiles" (directorio social). El feed de actividad ya no se filtra.
  const [profileSearch, setProfileSearch] = useState('');
  // Paginación del feed: 25 inicial, +25 por "Mostrar más". Se reinicia al cambiar la búsqueda.
  const [feedVisibleCount, setFeedVisibleCount] = useState(FEED_PAGE_SIZE);
  const [composePostText, setComposePostText] = useState('');
  const [publishingPost, setPublishingPost] = useState(false);
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [socialDirectory, setSocialDirectory] = useState<SocialDirectoryEntry[]>([]);
  // Listas completas de OTROS perfiles, cargadas bajo demanda (al abrir reseña/perfil) y filtradas por su
  // visibilidad. Clave = id del perfil del directorio. Alimenta getGameItemById y selectedProfileDetail.
  const [foreignGamesByProfile, setForeignGamesByProfile] = useState<Record<string, Record<TabId, GameItem[]>>>({});
  const [loadingForeignProfile, setLoadingForeignProfile] = useState(false);
  const lastForcedHydrateRef = useRef(0);
  // Cooldown visible del botón "Actualizar": se deshabilita durante FORCED_REFRESH_MIN_MS tras un refresco forzado.
  const [refreshCoolingDown, setRefreshCoolingDown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedRowRef = useRef<HTMLDivElement | null>(null);
  const feedDraggingRef = useRef(false);
  const feedStartXRef = useRef(0);
  const feedStartScrollRef = useRef(0);
  const [isFeedDragging, setIsFeedDragging] = useState(false);

  // Amistad (aceptación mutua). Todo el estado sale de UNA query `array-contains` (cacheada en el repositorio).
  const [friendships, setFriendships] = useState<MyFriendships>({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
  const [loadingFriendships, setLoadingFriendships] = useState(false);
  // ¿Se ha resuelto ya el estado de amistad al menos una vez? El feed solo-amigos lee gists SOLO de `friendships.friends`;
  // si el directorio se hidratara (y cacheara) ANTES de conocer a los amigos, cachearía a los amigos como index-only
  // (sin actividad) y el feed quedaría en blanco hasta invalidar la caché. Se espera a esta resolución antes de hidratar.
  const [friendshipsResolved, setFriendshipsResolved] = useState(false);
  // uid del "otro" sobre el que hay una mutación en curso (para deshabilitar su botón sin bloquear el resto).
  const [friendshipBusyUid, setFriendshipBusyUid] = useState<string>('');
  // Confirmación de "dejar de ser amigos" (evita pulsaciones accidentales): guarda a quién se va a eliminar.
  const [removeFriendTarget, setRemoveFriendTarget] = useState<{ uid: string; name: string } | null>(null);

  const setFeedback = useCallback((kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => {
    setStatusKind(kind);
    setStatus(message);

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
    setTimeout(() => setStatus(''), ms);
  }, []);

  const lockProfileEditor = useCallback(() => {
    setMustCreateProfile(true);

    if (activePanel !== 'profile') {
      navigate('/social/profile');
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
          const profile = await resolveOwnProfile(currentUser);
          const gistId = profile?.socialEnabled ? profile.socialGistId.trim() : '';

          if (gistId) {
            try {
              await readSocialGist(mainConfig.token, gistId, null);
            } catch (error) {
              if (isNotFoundGistError(error)) {
                resolvedGistId = '';
                setSocialCfgGistId('');
                setSocialCfgEtag(null);
                lockProfileEditor();
                setLoading(false);
                return;
              }

              throw error;
            }

            saveSocialSyncConfig({
              token: mainConfig.token,
              gistId,
              etag: null,
              lastRemoteUpdatedAt: 0,
            });
            resolvedGistId = gistId;
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
  // L4 — el espacio social no se abre hasta que consta la aceptación de las condiciones/privacidad vigentes. Solo
  // afecta a lo SOCIAL: las listas propias, la sincronización y el borrado de cuenta nunca dependen de esto.
  // Sin sesión no hay nada que consentir (el gateway ya pide iniciarla). Con sesión, solo se abre cuando consta la
  // comprobación DE ESE uid y no exige aceptación.
  const legalGateOpen =
    !authUser?.uid || (legalConsent?.uid === authUser.uid && legalConsent.status !== 'required');
  // El espacio social ABIERTO de verdad: el estado latente (`showSocialSpace`, que fijan la hidratación inicial y
  // el alta) filtrado por la puerta legal. Todo lo que carga o publica datos sociales cuelga de esto, así que un
  // usuario sin la aceptación vigente no llega a leer ni escribir nada del canal social.
  const socialSpaceOpen = showSocialSpace && legalGateOpen;
  // La comprobación anterior es una LECTURA de Firestore: con sesión ya iniciada hay un intervalo en el que aún no
  // consta nada de ese uid y `legalGateOpen` es false. Sin marcarlo, el hub caía al gateway durante esas décimas de
  // segundo (paso de login/alta, con su botón de "Cerrar sesión" bajo el dedo) para volver acto seguido al espacio
  // social. Mientras la comprobación esté en vuelo, la pantalla sigue "cargando" en vez de enseñar la puerta.
  const legalConsentPending = Boolean(authUser?.uid) && legalConsent?.uid !== authUser?.uid;
  const hasReadyAccess = hasSocialSession && hasSocialGist && legalGateOpen;
  const profileEditorLocked = isProfileEditorLocked(mustCreateProfile, hasBlockingSocialIssue);
  const canConnectSocialGist =
    hasMainSync && hasSocialSession && !hasSocialGist && !connecting && !resolvingSocialGist && legalGateOpen;
  const canSignInGoogle = hasMainSync && !hasSocialSession && !signingIn;

  useEffect(() => {
    if (!hasReadyAccess || showSocialSpace) {
      return;
    }

    setShowSocialSpace(true);
    navigate('/social');
  }, [hasReadyAccess, showSocialSpace, navigate]);

  // L4 — comprueba la aceptación registrada en `publicConfig` (owner-only, sigue al usuario entre dispositivos).
  // Si la LECTURA falla (offline, reglas, Firebase ausente) se deja pasar: bloquear el espacio social por un fallo
  // de red convertiría un requisito legal en una avería. Solo se exige cuando consta que no hay aceptación vigente.
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) {
      setLegalConsent(null);
      return;
    }

    let cancelled = false;
    void getPublicConfig(uid)
      .then((cfg) => {
        if (cancelled) return;
        setLegalConsent({ uid, status: cfg?.consent?.version === LEGAL_VERSION ? 'accepted' : 'required' });
      })
      .catch(() => {
        if (!cancelled) setLegalConsent({ uid, status: 'unknown' });
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);

  const acceptLegalConsent = useCallback(async () => {
    const uid = authUser?.uid;
    if (!uid || savingConsent) {
      return;
    }
    setSavingConsent(true);
    try {
      await setPublicConfig(uid, { consent: { version: LEGAL_VERSION, agreedAt: Date.now() } });
      setLegalConsent({ uid, status: 'accepted' });
    } catch {
      setFeedback('err', LEGAL_CONSENT_UI.error);
    } finally {
      setSavingConsent(false);
    }
  }, [authUser?.uid, savingConsent, setFeedback]);

  const gatewaySteps = SOCIAL_UI.steps.map((step, index) => ({
    ...step,
    done: index === 0 ? hasMainSync : index === 1 ? hasSocialSession : hasSocialGist,
  }));

  const currentStep = !hasMainSync ? 1 : !hasSocialSession ? 2 : !hasSocialGist ? 3 : 3;
  const completedSteps = gatewaySteps.filter((step) => step.done).length;
  const gatewayProgress = Math.round((completedSteps / gatewaySteps.length) * 100);

  const attachExistingSocialGist = useCallback(async (user: SocialAuthUser): Promise<boolean> => {
    if (!mainSyncConfig?.token) {
      setFeedback('warn', SOCIAL_UI.status.needMainSync);
      return false;
    }

    try {
      setResolvingSocialGist(true);
      const existingProfile = await resolveOwnProfile(user);
      const existingGistId = existingProfile?.socialEnabled ? existingProfile.socialGistId.trim() : '';

      if (!existingGistId) {
        return false;
      }

      try {
        await readSocialGist(mainSyncConfig.token, existingGistId, null);
      } catch (error) {
        if (isNotFoundGistError(error)) {
          return false;
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
      setFeedback('ok', SOCIAL_UI.status.gistLinkedFromFirestore);
      return true;
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.firestoreCheckFailed);
      return false;
    } finally {
      setResolvingSocialGist(false);
    }
  }, [mainSyncConfig, setFeedback]);

  const localState = useMemo(() => loadLocalState(), []);

  // P1: resuelve el profileId canónico del usuario actual (best-effort) para la detección de propiedad por identidad.
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) {
      setOwnProfileId(null);
      return;
    }
    let cancelled = false;
    resolveStableProfileId(uid)
      .then((pid) => {
        if (!cancelled) setOwnProfileId(pid || null);
      })
      .catch(() => {
        /* Firestore caído → la propiedad cae a comparar por uid (entry.id === uid hoy). */
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);

  // Carga el estado de amistad (amigos + peticiones) con UNA query cacheada. Degrada a vacío si Firestore falla.
  const refreshFriendships = useCallback(async (forceRefresh = false) => {
    const uid = authUser?.uid;
    if (!uid) {
      setFriendships({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
      setFriendshipsResolved(true);
      return;
    }
    try {
      setLoadingFriendships(true);
      const next = await getMyFriendships(uid, { forceRefresh });
      setFriendships(next);
    } catch {
      /* best-effort: sin amistad el resto del social sigue usable. */
    } finally {
      setLoadingFriendships(false);
      // Marca resuelto SIEMPRE (incluso si Firestore falló): degrada a feed sin amigos en vez de bloquearlo para siempre.
      setFriendshipsResolved(true);
    }
  }, [authUser?.uid]);

  useEffect(() => {
    if (!socialSpaceOpen || !authUser?.uid) {
      return;
    }
    void refreshFriendships();
  }, [socialSpaceOpen, authUser?.uid, refreshFriendships]);

  // PRIVACIDAD (saneo al abrir social): una vez por sesión, cuando el nick ya está hidratado, propaga mi nick actual a
  // mis docs de amistad ya existentes (que pudieron guardar un nombre antiguo/real antes del arreglo). Se espera a que
  // el nick esté cargado (`profileName` no vacío) para NO sanear con vacío.
  const friendshipHealedRef = useRef(false);
  useEffect(() => {
    if (friendshipHealedRef.current) return;
    if (!socialSpaceOpen || !authUser?.uid || !socialCfgGistId) return;
    const nick = profileName.trim();
    if (!nick) return;
    friendshipHealedRef.current = true;
    void healOwnFriendshipIdentity(authUser.uid, {
      name: nick,
      photo: showPhoto && authUser.photoURL ? authUser.photoURL : '',
      socialGistId: socialCfgGistId,
      gamesGistId: mainSyncConfig?.gistId || '',
    });
  }, [socialSpaceOpen, authUser?.uid, authUser?.photoURL, socialCfgGistId, profileName, showPhoto, mainSyncConfig?.gistId]);

  // AUTO-HEAL del directorio (una vez por sesión): si mi `profiles/{uid}.social.gistId` quedó anclado a un gist viejo
  // (cambié de gist social sin re-publicar el perfil), lo sincroniza con el gist ACTUAL de mi sesión. Sin esto, el
  // feed de mis amigos leería mi gist obsoleto y no vería mi actividad. Complementa al heal de amistades: corrige el
  // problema en ORIGEN (Firestore) sin que el usuario tenga que hacer nada. Solo escribe si de verdad diverge.
  const directoryHealedRef = useRef(false);
  useEffect(() => {
    if (directoryHealedRef.current) return;
    if (!socialSpaceOpen || !authUser?.uid || !socialCfgGistId) return;
    directoryHealedRef.current = true;
    void healOwnDirectoryGist(authUser.uid, socialCfgGistId, socialCfgEtag);
  }, [socialSpaceOpen, authUser?.uid, socialCfgGistId, socialCfgEtag]);

  // LATIDO DE USO RECIENTE: refresca `profiles.updatedAt`, por el que ordena el directorio y con el que el feed
  // decide si un amigo sigue activo. Publicar ya lo refresca; esto cubre a quien entra solo a mirar. Acotado a
  // una vez cada 20 h por dispositivo (una escritura al día como mucho, y grano diario por privacidad).
  const profileTouchedRef = useRef(false);
  useEffect(() => {
    if (profileTouchedRef.current) return;
    if (!socialSpaceOpen || !authUser?.uid || !socialCfgGistId) return;
    profileTouchedRef.current = true;
    const uid = authUser.uid;

    void (async () => {
      try {
        const meta = await getLocalMeta();
        const last = Number(meta?.profileTouchedAt || 0);
        if (last && Date.now() - last < PROFILE_TOUCH_MIN_INTERVAL_MS) return;
        await touchOwnProfileActivity(uid);
        await patchLocalMeta({ profileTouchedAt: Date.now() });
      } catch {
        /* best-effort: la recencia es orden, no funcionalidad. */
      }
    })();
  }, [socialSpaceOpen, authUser?.uid, socialCfgGistId]);

  // Tras un cambio de amistad (aceptar/eliminar), el conjunto de amigos cambia y con él la actividad que debe salir
  // en el feed. Se invalida la caché del directorio (feed solo-amigos) y se refresca la amistad; el efecto que
  // depende de `friendships.friends` rehidrata el directorio releyendo los gists de los amigos actuales.
  const refreshAfterFriendshipChange = useCallback(async () => {
    if (socialCfgGistId) {
      await invalidateCachedSocialDirectory(socialCfgGistId);
    }
    await refreshFriendships(true);
  }, [refreshFriendships, socialCfgGistId]);

  // Estado de relación con OTRO usuario (para pintar el botón correcto en tarjetas/perfil).
  const relationshipWith = useCallback((otherUid: string): RelationshipState => {
    if (!otherUid) return 'none';
    return friendships.byOtherUid[otherUid]?.state ?? 'none';
  }, [friendships]);

  const pendingIncomingCount = friendships.incoming.length;

  // Vista de solicitud para la bandeja: enriquece nombre/foto desde el directorio cuando el doc no los trae aún
  // (p. ej. una petición ENVIADA no tiene los datos del destinatario hasta que acepta). Directorio ya cargado → gratis.
  const enrichFriendRequest = useCallback((view: FriendshipView) => {
    const dir = socialDirectory.find((entry) => entry.uid === view.otherUid);
    return {
      docId: view.docId,
      otherUid: view.otherUid,
      // PRIVACIDAD: el nombre sale SOLO del nick denormalizado en el doc de amistad (`otherName`). NO se cae al
      // `displayName` del directorio (Firestore), que puede ser el nombre real; si no hay nick, "Usuario".
      name: view.otherName || SOCIAL_UI.requests.unknownUser,
      photo: view.otherPhoto || dir?.photoURL || '',
    };
  }, [socialDirectory]);

  const incomingRequests = useMemo(
    () => friendships.incoming.map(enrichFriendRequest),
    [friendships.incoming, enrichFriendRequest],
  );
  const outgoingRequests = useMemo(
    () => friendships.outgoing.map(enrichFriendRequest),
    [friendships.outgoing, enrichFriendRequest],
  );
  // Lista de amigos (aceptados) para gestión: se deriva de los docs de amistad, NO del directorio, así SIEMPRE se
  // puede ver y eliminar a un amigo aunque no esté en el top-30 del directorio o haya desactivado su social.
  const friendsList = useMemo(
    () => friendships.friends.map(enrichFriendRequest),
    [friendships.friends, enrichFriendRequest],
  );

  const completedGames = useMemo(() => {
    const map = new Map<number, string>();
    localState.c.forEach((game) => {
      if (game.id > 0 && game.name) {
        map.set(game.id, game.name);
      }
    });

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [localState]);

  // Requisito de alta: un perfil solo puede existir si el usuario tiene al menos un juego COMPLETADO. Es la única
  // regla de completitud (junto al nombre) y se aplica idéntica en la hidratación, el guardado y el gate del botón
  // de Cuenta (`useSocialProfileSession`); si divergieran, el usuario rebotaría entre el feed y el editor.
  const hasCompletedGames = completedGames.length > 0;

  const defaultSocialVisibility: SocialProfileVisibility = useMemo(() => ({
    hiddenTabs: [],
    hideReplayable: false,
    hideRetry: false,
    hideGameTime: false,
    showPhoto: true,
  }), []);

  const getOrderedUniqueTabs = useCallback((tabs: TabId[]): TabId[] => {
    const seen = new Set<TabId>();
    const ordered: TabId[] = [];

    tabs.forEach((tab) => {
      if (seen.has(tab)) {
        return;
      }

      seen.add(tab);
      ordered.push(tab);
    });

    return ordered;
  }, []);

  const visibleSocialDirectory = useMemo(() => {
    // Directorio de descubrimiento: se muestran TODOS los perfiles publicados (el propio excluido). No se filtra por
    // contenido del gist: con el feed solo-amigos no leemos el gist de los no-amigos, así que exigir cualquier dato
    // suyo ocultaría a todo el mundo e impediría enviarles peticiones de amistad. Los perfiles del directorio ya
    // vienen acotados por Firestore (`social.enabled` + gist social presente).
    return socialDirectory.filter((entry) => entry.socialGistId !== socialCfgGistId);
  }, [socialCfgGistId, socialDirectory]);

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

  const selectedProfileDetail = useMemo(() => {
    // La vista de perfil, la de reseñas y el detalle de una reseña comparten el mismo perfil seleccionado.
    if ((activePanel !== 'profile-detail' && activePanel !== 'profile-review') || !profileDetailId) {
      return null;
    }

    const entry = socialDirectory.find((item) => item.id === profileDetailId) || null;
    // Se puede abrir el detalle de cualquier perfil del directorio (para no-amigos: hero + "Añadir amigo").
    if (!entry) return null;

    // E3 deja `sharedLists` vacío para TODOS los perfiles del directorio (no se exponen las listas ajenas). Para el
    // perfil PROPIO repoblamos las listas desde `localState` (juegos completos) para que el usuario SÍ vea sus
    // listados; la visibilidad (pestañas ocultas) la sigue aplicando el componente. Perfiles ajenos: index-only.
    // P1: propiedad por identidad (uid/profileId), no por email.
    const isOwn = isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId);
    if (!isOwn) {
      // Perfiles ajenos: si ya bajamos su lista completa (gist de listados, filtrada por su visibilidad) la
      // mostramos; mientras llega (o si no hay token/datos) se queda index-only y el componente muestra el vacío.
      const foreign = foreignGamesByProfile[entry.id];
      if (foreign) return { ...entry, sharedLists: foreign };
      return entry;
    }

    return {
      ...entry,
      sharedLists: {
        c: localState.c,
        v: localState.v,
        e: localState.e,
        p: localState.p,
      },
    };
  }, [activePanel, authUser, foreignGamesByProfile, localState, ownProfileId, profileDetailId, socialDirectory]);

  // Reseña abierta a pantalla completa desde la lista de reseñas del perfil (/social/profiles/:id/game/:gameId/review).
  // Se busca el juego por id en los listados del perfil seleccionado (datos completos para el propio/amigos; los
  // no-amigos no muestran reseñas). Reúne TODA la información del análisis para el detalle: nota, texto, metadatos.
  const activeProfileReview = useMemo(() => {
    if (activePanel !== 'profile-review' || !selectedProfileDetail || profileReviewGameId <= 0) {
      return null;
    }
    const lists = selectedProfileDetail.sharedLists || {};
    let raw: (GameItem | SocialSharedGame) | null = null;
    for (const tab of TAB_IDS) {
      const found = (lists[tab] || []).find((game) => Number((game as { id?: number }).id || 0) === profileReviewGameId);
      if (found) {
        raw = found;
        break;
      }
    }
    if (!raw) return null;
    const publishedDate = Number(
      (selectedProfileDetail.activity || []).find(
        (entry) => entry.type === 'review' && entry.gameId === profileReviewGameId,
      )?.updatedAt || 0,
    );
    const game = raw as unknown as Record<string, unknown>;
    return {
      id: profileReviewGameId,
      name: String(game.name || ''),
      // Canal público index-only: para perfiles ajenos solo hay snippet/rating; para propios/amigos, review/score completos.
      review: String(game.review || game.snippet || '').trim(), // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      score: Number(game.score || game.rating || 0), // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      grade: typeof game.grade === 'number' ? game.grade : null,
      platforms: Array.isArray(game.platforms) ? (game.platforms as string[]) : [],
      genres: Array.isArray(game.genres) ? (game.genres as string[]) : [],
      strengths: Array.isArray(game.strengths) ? (game.strengths as string[]) : [],
      weaknesses: Array.isArray(game.weaknesses) ? (game.weaknesses as string[]) : [],
      reasons: Array.isArray(game.reasons) ? (game.reasons as string[]) : [],
      hours: typeof game.hours === 'number' ? game.hours : null, // audit-allow: modelo de lectura para render del detalle (SocialHub), no es escritura a canal público
      // Fecha unificada con el feed, por orden de fiabilidad: la de PUBLICACIÓN, `reviewedAt` (propia de la
      // reseña) y, en último lugar, el `_ts` del juego (que mueve cualquier edición).
      ts: publishedDate || Number(game.reviewedAt || 0) || (typeof game._ts === 'number' ? game._ts : 0),
    };
  }, [activePanel, selectedProfileDetail, profileReviewGameId]);

  const activityFeedItems = useMemo(() => {
    // `|| []`: una entrada de caché antigua/malformada podría no traer `activity` → flatMap+sort reventaría con
    // "undefined.updatedAt" (pantalla en blanco). Se protege el acceso.
    return socialDirectory
      .flatMap((entry) => entry.activity || [])
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 300);
  }, [socialDirectory]);

  // F3 — feed COMBINADO: reseñas/recomendaciones (actividad) + publicaciones, mezcladas y ordenadas por fecha.
  // Los posts llevan `kind:'post'` para distinguirlos al renderizar; la actividad conserva su `type`.
  const feedItems = useMemo(() => {
    const activity = socialDirectory.flatMap((entry) => entry.activity || []);
    const posts = socialDirectory.flatMap((entry) => entry.posts || []).map((post) => ({ ...post, kind: 'post' as const }));

    return [...activity, ...posts]
      // Descarta ítems con timestamp inválido/fuera de rango ANTES de ordenar y cortar: si no, ordenarían arriba,
      // coparían el corte visible y el agrupado por día los eliminaría, dejando el feed en blanco (ver bug del 2º amigo).
      .filter((item) => hasRenderableTimestamp(item.updatedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 300);
  }, [socialDirectory]);

  const activeDetailEvent = useMemo(() => {
    if (activePanel !== 'detail' || !detailActorUid || detailGameId <= 0 || !detailEventType) {
      return null;
    }

    return activityFeedItems.find(
      (entry) =>
        entry.actorProfileId === detailActorUid &&
        entry.gameId === detailGameId &&
        entry.type === detailEventType,
    ) || null;
  }, [activePanel, activityFeedItems, detailActorUid, detailEventType, detailGameId]);

  /**
   * Obtiene un GameItem para un evento del feed. Para perfiles ajenos usa su lista bajada
   * (`foreignGamesByProfile`, filtrada por su visibilidad); para el propio, fallback local.
   */
  const getGameItemById = useCallback((profileId: string, gameId: number) => {
    // P1: propiedad por identidad (uid/profileId), no por email.
    const isOwn = isOwnProfileIdentity(profileId, authUser?.uid, ownProfileId);
    if (!isOwn) {
      // Eventos AJENOS: la reseña completa (review/strengths/weaknesses/categorías) sale de la lista bajada de SU
      // gist de listados, ya filtrada por su visibilidad (las pestañas ocultas quedan vacías → no se revela el
      // juego). Si aún no ha llegado, devolvemos null y el detalle muestra el snippet del evento.
      const foreign = foreignGamesByProfile[profileId];
      if (foreign) {
        const match = [...foreign.c, ...foreign.v, ...foreign.e, ...foreign.p].find((game) => game.id === gameId);
        if (match) return match;
      }
      return null;
    }

    const allGames = [
      ...localState.c,
      ...localState.v,
      ...localState.e,
      ...localState.p,
    ];
    return allGames.find((game) => game.id === gameId) || null;
  }, [authUser, foreignGamesByProfile, localState, ownProfileId]);

  // NOTA (retirado a propósito): aquí vivía un efecto que, al abrir el detalle de una reseña PROPIA cuyo juego
  // no aparecía en los listados, la despublicaba del gist social por considerarla huérfana. Decidía con
  // `localState`, una foto de localStorage tomada al montar el hub: si esos listados estaban desfasados (reseña
  // escrita en otro dispositivo con el sync de juegos aún en camino), borraba actividad VÁLIDA del feed de todos
  // de forma permanente. La limpieza de huérfanas la hace ahora `reconcileReviewActivity`, que compara la lista
  // completa de una vez y nunca retira una entrada más nueva que el reloj de los listados locales.

  const groupedFeedItems = useMemo(() => {
    type FeedItem = (typeof feedItems)[number];
    const groups: Array<{
      dayHeader: string;
      dayDate: Date;
      items: FeedItem[];
    }> = [];

    const itemsByDay = new Map<string, FeedItem[]>();

    // Solo los elementos visibles según la paginación (25, +25 con "Mostrar más").
    feedItems.slice(0, feedVisibleCount).forEach((item) => {
      const itemDate = new Date(toSafeTimestamp(item.updatedAt, Date.now()));
      if (Number.isNaN(itemDate.getTime())) {
        return;
      }
      const dayKey = itemDate.toISOString().split('T')[0];

      if (!itemsByDay.has(dayKey)) {
        itemsByDay.set(dayKey, []);
      }

      itemsByDay.get(dayKey)!.push(item);
    });

    const sortedDays = Array.from(itemsByDay.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    sortedDays.forEach(([dayKey, items]) => {
      const dayDate = new Date(dayKey);
      groups.push({
        dayHeader: formatDayHeader(dayDate),
        dayDate,
        items,
      });
    });

    return groups;
  }, [feedItems, feedVisibleCount]);

  // Paginación del feed: ¿hay más allá de lo visible? y handler para mostrar otros 25.
  const hasMoreFeed = feedItems.length > feedVisibleCount;
  const showMoreFeed = useCallback(() => {
    setFeedVisibleCount((count) => count + FEED_PAGE_SIZE);
  }, []);

  const handleFeedRowMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !feedRowRef.current) {
      return;
    }

    // No iniciar arrastre si el click es en una tarjeta de perfil
    const target = event.target as HTMLElement;
    if (target.closest('.hub-feed-profile-item')) {
      return;
    }

    feedDraggingRef.current = true;
    feedStartXRef.current = event.clientX;
    feedStartScrollRef.current = feedRowRef.current.scrollLeft;
    setIsFeedDragging(true);
  }, []);

  const handleFeedRowKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!feedRowRef.current) {
      return;
    }

    if (event.key === 'ArrowRight') {
      feedRowRef.current.scrollLeft += 140;
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft') {
      feedRowRef.current.scrollLeft -= 140;
      event.preventDefault();
    }
  }, []);

  const openActivityDetail = useCallback((entry: SocialActivityFeedItem) => {
    navigate(`/social/user/${encodeURIComponent(entry.actorProfileId)}/game/${entry.gameId}/${entry.type}`);
  }, [navigate]);

  const openProfileDetail = useCallback((profileId: string) => {
    // Cualquier perfil del directorio se puede abrir (para no-amigos: hero + "Añadir amigo").
    navigate(`/social/profiles/${encodeURIComponent(profileId)}`);
  }, [navigate]);

  // Reseñas del perfil: alternar entre la vista del perfil (/social/profiles/:id) y la de reseñas
  // (.../reviews), y abrir el detalle a pantalla completa de una reseña (.../game/:gameId/review).
  const openProfileReviews = useCallback((profileId: string) => {
    navigate(`/social/profiles/${encodeURIComponent(profileId)}/reviews`);
  }, [navigate]);
  const closeProfileReviews = useCallback((profileId: string) => {
    navigate(`/social/profiles/${encodeURIComponent(profileId)}`);
  }, [navigate]);
  const openProfileReviewDetail = useCallback((profileId: string, gameId: number) => {
    navigate(`/social/profiles/${encodeURIComponent(profileId)}/game/${gameId}/review`);
  }, [navigate]);

  // Abre el DETALLE del perfil propio (vista pública con sus listados), no el editor. Si aún no existe entrada
  // propia en el directorio, cae al editor para que el usuario complete su perfil.
  const openOwnProfileDetail = useCallback(() => {
    const ownEntry = socialDirectory.find((entry) => entry.socialGistId === socialCfgGistId);
    if (ownEntry) {
      navigate(`/social/profiles/${encodeURIComponent(ownEntry.id)}`);
    } else {
      navigate('/social/profile');
    }
  }, [navigate, socialCfgGistId, socialDirectory]);

  const isOwnProfileDetail = useMemo(
    () => Boolean(selectedProfileDetail) && isOwnProfileIdentity(selectedProfileDetail!.id, authUser?.uid, ownProfileId),
    [selectedProfileDetail, authUser, ownProfileId],
  );

  // Bloque 3/4 — al abrir el detalle de una reseña o un perfil AJENO, baja su lista completa de juegos (cache-first
  // 24h en IndexedDB; sin red si está fresca) y la guarda filtrada por su visibilidad. El perfil propio no se baja
  // (ya tiene datos locales). Sin token o ante fallo de red se queda index-only (snippet del evento).
  useEffect(() => {
    if (activePanel !== 'detail' && activePanel !== 'profile-detail' && activePanel !== 'profile-review') return;
    const targetProfileId = (activePanel === 'profile-detail' || activePanel === 'profile-review') ? profileDetailId : activeDetailEvent?.profileId || '';
    if (!targetProfileId) return;
    if (isOwnProfileIdentity(targetProfileId, authUser?.uid, ownProfileId)) return;
    if (foreignGamesByProfile[targetProfileId]) return;
    const entry = socialDirectory.find((item) => item.id === targetProfileId);
    if (!entry || !entry.gamesGistId) return;
    // Amistad: solo se baja el gist de listados COMPLETO de un amigo. Para no-amigos no se lee nada (ahorro de
    // llamadas + coherente con "perfil no-amigo = solo nombre y foto"); el detalle muestra el CTA de "Añadir amigo".
    if (relationshipWith(entry.uid) !== 'friends') return;

    let cancelled = false;
    const token = getSocialSyncConfig()?.token || mainSyncConfig?.token || null;
    setLoadingForeignProfile(true);
    loadForeignProfileGames({ profileId: targetProfileId, gamesGistId: entry.gamesGistId, token })
      .then((games) => {
        if (cancelled || !games) return;
        const visible = applyProfileVisibility(games, entry.visibility || defaultSocialVisibility);
        setForeignGamesByProfile((prev) => ({ ...prev, [targetProfileId]: visible }));
      })
      .catch(() => {
        /* fallback index-only: el detalle/perfil muestra snippet/vacío sin romper la pantalla. */
      })
      .finally(() => {
        // Flag de UI (no datos rancios): debe bajar SIEMPRE, aunque el efecto se haya cancelado al navegar; si no,
        // un perfil abierto luego desde caché (return temprano) dejaría el botón "Actualizar listados" colgado.
        setLoadingForeignProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeDetailEvent, authUser, defaultSocialVisibility, foreignGamesByProfile, mainSyncConfig?.token, ownProfileId, profileDetailId, relationshipWith, socialDirectory]);

  // Amigo inactivo (su gist social no se leyó al hidratar el directorio, para no ocupar el feed ni gastar la
  // llamada): al ABRIR su perfil sí se lee, para que su hero no salga a medias (nombre/visibilidad/foto).
  // La actividad se deja fuera a propósito: el corte por inactividad es sobre el feed, no sobre su perfil.
  useEffect(() => {
    if (activePanel !== 'profile-detail' && activePanel !== 'profile-review') return;
    if (!profileDetailId) return;
    const entry = socialDirectory.find((item) => item.id === profileDetailId);
    if (!entry?.socialSkipped || !entry.socialGistId) return;

    let cancelled = false;
    const token = getSocialSyncConfig()?.token || mainSyncConfig?.token || null;
    void readPublicSocialGistById(entry.socialGistId, token)
      .then((socialData) => {
        if (cancelled) return;
        const showsPhoto = socialData.profile.visibility?.showPhoto !== false;
        setSocialDirectory((prev) =>
          prev.map((item) =>
            item.id === profileDetailId
              ? {
                  ...item,
                  displayName: socialData.profile.name || item.displayName,
                  photoURL: socialData.profile.photoURL || (showsPhoto ? item.photoURL : ''),
                  visibility: socialData.profile.visibility || defaultSocialVisibility,
                  socialSkipped: false,
                }
              : item,
          ),
        );
      })
      .catch(() => {
        /* best-effort: el perfil se queda index-only, como hasta ahora. */
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, defaultSocialVisibility, mainSyncConfig?.token, profileDetailId, socialDirectory]);

  // Bloque 4 — refresco manual del perfil abierto: invalida la caché de IndexedDB y relee del gist de listados.
  const refreshProfileDetail = useCallback(async () => {
    const profileId = profileDetailId;
    const entry = socialDirectory.find((item) => item.id === profileId);
    if (!entry || !entry.gamesGistId || isOwnProfileIdentity(profileId, authUser?.uid, ownProfileId)) return;
    if (relationshipWith(entry.uid) !== 'friends') return; // solo se refrescan listados de amigos.
    try {
      setLoadingForeignProfile(true);
      await invalidateProfileGames(profileId);
      const token = getSocialSyncConfig()?.token || mainSyncConfig?.token || null;
      const games = await loadForeignProfileGames({ profileId, gamesGistId: entry.gamesGistId, token, forceRefresh: true });
      if (games) {
        const visible = applyProfileVisibility(games, entry.visibility || defaultSocialVisibility);
        setForeignGamesByProfile((prev) => ({ ...prev, [profileId]: visible }));
      } else {
        setFeedback('warn', SOCIAL_UI.status.profileGamesRefreshFailed);
      }
    } catch (error) {
      setFeedback('warn', error instanceof Error ? error.message : SOCIAL_UI.status.profileGamesRefreshFailed);
    } finally {
      setLoadingForeignProfile(false);
    }
  }, [authUser, defaultSocialVisibility, mainSyncConfig?.token, ownProfileId, profileDetailId, relationshipWith, setFeedback, socialDirectory]);

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

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!feedDraggingRef.current || !feedRowRef.current) {
        return;
      }

      const deltaX = event.clientX - feedStartXRef.current;
      feedRowRef.current.scrollLeft = feedStartScrollRef.current - deltaX;
      event.preventDefault();
    };

    const handleMouseUp = () => {
      if (!feedDraggingRef.current) {
        return;
      }

      feedDraggingRef.current = false;
      setIsFeedDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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
      const linkedExisting = await attachExistingSocialGist(authUser);
      if (linkedExisting) {
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
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.createGistFailed);
    } finally {
      setConnecting(false);
    }
  }, [attachExistingSocialGist, authUser, mainSyncConfig, setFeedback]);

  const handleSignInGoogle = useCallback(async () => {
    try {
      setSigningIn(true);
      const user = await signInWithGoogle();
      setAuthUser(user);
      const linkedExisting = await attachExistingSocialGist(user);
      if (linkedExisting) {
        setShowSocialSpace(true);
        setFeedback('ok', SOCIAL_UI.status.signInAndLinked);
      } else {
        // No hacer nada aquí; el useEffect automático manejará la creación del gist
      }
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.signInFailed);
    } finally {
      setSigningIn(false);
    }
  }, [attachExistingSocialGist, setFeedback]);

  const hydrateSocialProfile = useCallback(async () => {
    if (!socialSpaceOpen || !authUser || !socialCfgGistId) {
      return;
    }

    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token) {
      setFeedback('err', SOCIAL_UI.status.missingSocialToken);
      return;
    }

    // Caché persistente del perfil propio: al volver a la pantalla social dentro de la ventana (<5 min) se sirve de
    // IndexedDB sin releer el gist propio ni consultar Firestore. El guardado del perfil invalida esta caché.
    const cachedProfile = await getCachedSocialProfile(socialCfgGistId);
    if (cachedProfile) {
      // No confiamos en el `profileExists` cacheado (pudo escribirse con una regla antigua): lo recalculamos con el
      // criterio actual (nombre Y ≥1 juego completado) para que los perfiles incompletos ya guardados sean
      // redirigidos al editor sin esperar a que caduque la caché (~5 min).
      const cachedProfileExists = Boolean(cachedProfile.name.trim()) && hasCompletedGames;
      setProfileName(cachedProfile.name);
      setHiddenTabs(getOrderedUniqueTabs(cachedProfile.hiddenTabs || []));
      setHideReplayable(cachedProfile.hideReplayable);
      setHideRetry(cachedProfile.hideRetry);
      setHideGameTime(cachedProfile.hideGameTime);
      setShowPhoto(cachedProfile.showPhoto);
      setHasCreatedProfile(cachedProfileExists);

      const mustCreateCached = shouldRequireProfileCreation(cachedProfileExists, justSavedProfile);
      if (mustCreateCached) {
        lockProfileEditor();
      } else if (cachedProfileExists) {
        setMustCreateProfile(false);
      }
      return;
    }

    try {
      setHydratingProfile(true);
      const existingProfile = await resolveOwnProfile(authUser);

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
      // Un perfil se considera COMPLETO (y por tanto utilizable sin pasar por el editor) solo si tiene nombre Y al
      // menos un juego completado en local: misma regla que aplica el guardado y el gate del botón de Cuenta. Así
      // nadie entra al feed sin contenido que compartir. Un doc en Firestore (era previa o reconexión) NO basta si
      // el gist no cumple.
      const profileExists = Boolean(socialRead.data.profile.name.trim()) && hasCompletedGames;

      setProfileName(nextName);
      setHiddenTabs(getOrderedUniqueTabs(profileVisibility.hiddenTabs || []));
      setHideReplayable(Boolean(profileVisibility.hideReplayable));
      setHideRetry(Boolean(profileVisibility.hideRetry));
      setHideGameTime(Boolean(profileVisibility.hideGameTime));
      setShowPhoto(profileVisibility.showPhoto !== false);
      setHasCreatedProfile(profileExists);

      // Sembrar la caché para que la próxima navegación a social no relea el gist propio dentro de la ventana de TTL.
      void putCachedSocialProfile(socialCfgGistId, {
        name: nextName,
        hiddenTabs: getOrderedUniqueTabs(profileVisibility.hiddenTabs || []),
        hideReplayable: Boolean(profileVisibility.hideReplayable),
        hideRetry: Boolean(profileVisibility.hideRetry),
        hideGameTime: Boolean(profileVisibility.hideGameTime),
        showPhoto: profileVisibility.showPhoto !== false,
        profileExists,
        activity: socialRead.data.activity,
      });

      const mustCreate = shouldRequireProfileCreation(profileExists, justSavedProfile);

      // Keep profile creation routing centralized to avoid navigation regressions.
      if (mustCreate) {
        lockProfileEditor();
      } else if (profileExists) {
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

      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.loadProfileFailed);
    } finally {
      setHydratingProfile(false);
    }
  }, [
    authUser,
    hasCompletedGames,
    defaultSocialVisibility,
    getOrderedUniqueTabs,
    lockProfileEditor,
    navigate,
    setFeedback,
    socialSpaceOpen,
    socialCfgEtag,
    socialCfgGistId,
    justSavedProfile,
    mainSyncConfig?.token,
  ]);

  useEffect(() => {
    // Force profile edit if profile doesn't exist yet
    if (shouldRedirectToProfileEditor(profileEditorLocked, activePanel)) {
      navigate('/social/profile');
    }
  }, [profileEditorLocked, activePanel, navigate]);

  useEffect(() => {
    void hydrateSocialProfile();
  }, [hydrateSocialProfile]);

  // Rango propio → cadencia del feed. Una sola lectura del perfil propio (ya cacheada 60 s en memoria por
  // `getOwnProfileRef`). Mientras no se resuelva se asume bronce; cuando llega, `hydrateSocialDirectory` cambia de
  // identidad y vuelve a evaluar la caché con el TTL bueno, así que un mithril no se queda con datos viejos por
  // haber entrado antes de saber su rango. Cualquier fallo deja bronce: degradar es lo seguro.
  useEffect(() => {
    if (!authUser?.uid) {
      setOwnTier(DEFAULT_PROFILE_TIER);
      return;
    }
    let cancelled = false;
    void resolveOwnProfile(authUser)
      .then((profile) => {
        if (!cancelled) setOwnTier(profile?.tier || DEFAULT_PROFILE_TIER);
      })
      .catch(() => {
        /* sin rango conocido → bronce */
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const hydrateSocialDirectory = useCallback(async (forceRefresh = false) => {
    // `!friendshipsResolved`: NO hidratar (ni cachear) hasta conocer a los amigos. Si no, el feed solo-amigos cachearía
    // el directorio sin actividad de amigos (carrera de arranque) y quedaría en blanco hasta invalidar la caché.
    if (!socialSpaceOpen || activePanel === 'profile' || profileEditorLocked || !authUser || !socialCfgGistId || !friendshipsResolved) {
      return;
    }

    // Anti-spam del refresco forzado: cada `forceRefresh` relee el directorio + ~50 gists sociales (cuenta contra el
    // rate-limit del token aunque devuelvan 304). Si se pulsa "Actualizar feed" repetidamente en pocos segundos, se
    // ignora y se avisa. Las cargas automáticas (forceRefresh=false) usan la caché de sesión y no entran aquí.
    if (forceRefresh) {
      const now = Date.now();
      if (now - lastForcedHydrateRef.current < FORCED_REFRESH_MIN_MS) {
        setFeedback('warn', SOCIAL_UI.status.refreshThrottled);
        return;
      }
      lastForcedHydrateRef.current = now;
      // Deshabilita el botón durante el cooldown (en vez de solo avisar al pulsar).
      setRefreshCoolingDown(true);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => setRefreshCoolingDown(false), FORCED_REFRESH_MIN_MS);
    } else {
      // Caché persistente: si el directorio sigue fresco (<30 min), se sirve de IndexedDB sin releer ningún gist
      // social. Evita el coste N+1 al navegar feed→detalle→feed o al re-renderizar. El refresco manual lo evita.
      const cachedDirectory = await getCachedSocialDirectory<SocialDirectoryEntry>(
        socialCfgGistId,
        PROFILE_TIER_FEED_TTL_MS[ownTier],
      );
      if (cachedDirectory) {
        setSocialDirectory(cachedDirectory);
        return;
      }
    }

    try {
      setLoadingDirectory(true);
      const dirEntries = await listSocialDirectory(SOCIAL_DIRECTORY_LIMIT, { forceRefresh });
      const socialConfig = getSocialSyncConfig();
      // Foto propia inmediata (de la sesión Google) aunque aún no se haya re-guardado el perfil; respeta showPhoto.
      const ownPhotoURL = showPhoto && authUser?.photoURL ? authUser.photoURL : '';
      // FEED SOLO-AMIGOS: el gist social (actividad/publicaciones) SOLO se lee de tus amigos y del propio.
      // Los no-amigos quedan index-only (nombre/foto del directorio Firestore), sin lectura de gist → gran ahorro de
      // llamadas. Como el feed deriva su actividad de estas entradas, mostrar solo la de amigos es automático.
      const friendUids = new Set(friendships.friends.map((friend) => friend.otherUid));
      // Para un AMIGO, el `otherSocialGistId` del doc de amistad es la fuente FIABLE de su gist social: se sanea en
      // cada apertura del hub (healOwnFriendshipIdentity), mientras que el `social.gistId` del directorio Firestore
      // solo se reescribe al re-publicar el perfil y puede quedar anclado a un gist viejo/vacío. Si divergen, leer el
      // del directorio hace que sus reseñas nunca aparezcan en el feed (bug del amigo con perfil sin re-publicar).
      const friendSocialGistByUid = new Map(
        friendships.friends
          .filter((friend) => friend.otherSocialGistId)
          .map((friend) => [friend.otherUid, friend.otherSocialGistId] as const),
      );
      // L1: mismo razonamiento para el gist de JUEGOS. Ya no se publica en el directorio (era legible por cualquier
      // usuario autenticado), así que para un amigo la fuente es su doc de amistad; del directorio solo puede venir
      // el valor legacy de un perfil aún sin purgar. Un no-amigo se queda sin lista de juegos, que es lo pretendido.
      const friendGamesGistByUid = new Map(
        friendships.friends
          .filter((friend) => friend.otherGamesGistId)
          .map((friend) => [friend.otherUid, friend.otherGamesGistId] as const),
      );

      // Escalabilidad (>30 amigos): el directorio de descubrimiento está capado a SOCIAL_DIRECTORY_LIMIT y solo lista
      // perfiles con `social.enabled`. Para que NINGÚN amigo desaparezca del feed / detalle / gestión por caer fuera
      // de ese tope (o por desactivar social), se sintetizan entradas para los amigos ausentes usando los datos
      // DENORMALIZADOS del doc de amistad (nombre/foto/gists). Así los amigos son autosuficientes e independientes del
      // tope del directorio; los pendientes NO se sintetizan (no son amigos aún).
      const directoryUids = new Set(dirEntries.map((entry) => entry.uid));
      const friendOnlyEntries = friendships.friends
        // No se exige `otherSocialGistId`: sin él el amigo desaparecía por completo del hub (ni perfil ni gestión).
        // Entra igual como index-only; sin gist social simplemente no aporta actividad.
        .filter((friend) => !directoryUids.has(friend.otherUid))
        .map((friend) => ({
          id: friend.otherUid,
          uid: friend.otherUid,
          displayName: friend.otherName || 'Usuario',
          photoURL: friend.otherPhoto || '',
          socialGistId: friend.otherSocialGistId,
          gamesGistId: friend.otherGamesGistId,
          // Amigo fuera del directorio: no hay marca de recencia. 0 = desconocida → no se le aplica el corte.
          updatedAt: 0,
          // El doc de amistad no denormaliza el rango, así que un amigo que caiga fuera del tope del directorio
          // se pinta como bronce. Preferible a una lectura extra por amigo solo para un punto de color.
          tier: DEFAULT_PROFILE_TIER,
        }));
      const entries = [...dirEntries, ...friendOnlyEntries];

      const withProfiles = await mapWithConcurrency(
        entries,
        SOCIAL_DIRECTORY_FETCH_CONCURRENCY,
        async (entry) => {
          const isOwnEntry = entry.socialGistId === socialCfgGistId;
          const isFriend = friendUids.has(entry.uid);
          // Amigo: se prefiere su gist social saneado desde la amistad, porque el del directorio solo se
          // reescribe al re-publicar el perfil y puede quedar anclado a un gist viejo/vacío.
          const friendSocialGistId = isFriend ? friendSocialGistByUid.get(entry.uid) : undefined;
          const effectiveSocialGistId = friendSocialGistId || entry.socialGistId;
          // Gist de juegos: la amistad manda; `entry.gamesGistId` solo trae valor en perfiles legacy sin purgar.
          const effectiveGamesGistId = (isFriend ? friendGamesGistByUid.get(entry.uid) : undefined) || entry.gamesGistId;
          // …pero la deriva puede ir en CUALQUIER dirección (publicar una reseña sanea el directorio y no los docs
          // de amistad; abrir el hub sanea ambos), así que preferir a ciegas una de las dos fuentes deja al amigo
          // sin actividad la mitad de las veces. Si divergen, se leen las DOS y se fusionan: una lectura extra en
          // un caso raro a cambio de que su actividad no dependa de qué saneado corrió último.
          const socialGistCandidates = [effectiveSocialGistId, ...(isFriend ? [entry.socialGistId] : [])]
            .map((id) => String(id || '').trim())
            .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
          // CORTE POR INACTIVIDAD: la actividad de un amigo que hace mucho que no usa la app no ocupa el feed (ni
          // gasta una lectura de su gist). Solo se aplica si conocemos su recencia; el perfil propio nunca se corta.
          const lastActiveAt = Number(entry.updatedAt || 0);
          const isInactiveFriend =
            !isOwnEntry && lastActiveAt > 0 && Date.now() - lastActiveAt > FRIEND_ACTIVITY_MAX_AGE_MS;
          if (!isOwnEntry && (!isFriend || isInactiveFriend || socialGistCandidates.length === 0)) {
            // Index-only, sin leer su gist. Solo nombre/foto (Firestore); sin actividad ni publicaciones.
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || 'Usuario',
              socialGistId: entry.socialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: entry.photoURL || '',
              tier: entry.tier,
              activity: [],
              posts: [],
              // Marca para el detalle: es un amigo cuyo gist social NO se ha leído por inactividad. Al abrir su
              // perfil se hidrata bajo demanda (nombre/visibilidad/foto) para que no se vea a medias.
              socialSkipped: isFriend && isInactiveFriend,
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
          try {
            // Lectura de los candidatos (normalmente uno). Con varios, se fusiona: perfil del más reciente y
            // unión de actividad/publicaciones. Un candidato ilegible (gist borrado) no invalida al otro; si
            // fallan todos, se propaga para caer en el `catch` de degradación index-only.
            const reads = await Promise.allSettled(
              socialGistCandidates.map((id) => readPublicSocialGistById(id, socialConfig?.token || null)),
            );
            const readable = reads
              .map((result, index) => ({ result, gistId: socialGistCandidates[index] }))
              .filter((item): item is { result: PromiseFulfilledResult<SocialGistData>; gistId: string } =>
                item.result.status === 'fulfilled');
            if (readable.length === 0) {
              throw (reads[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('Gist social ilegible');
            }
            const socialData = readable
              .map((item) => item.result.value)
              .reduce((merged, current) => mergeSocialGistData(merged, current));
            // Id efectivo: el del payload más reciente de los legibles (el que "gana" la fusión del perfil).
            const resolvedSocialGistId = readable
              .reduce((best, item) => (item.result.value.updatedAt > best.result.value.updatedAt ? item : best))
              .gistId;
            // Foto: prioridad al gist (con su visibilidad); si no la trae, se usa la del directorio de Firestore
            // (`entry.photoURL`) SIEMPRE QUE el usuario no la tenga desactivada. Esto propaga la foto de quienes
            // tienen el gist antiguo (sin photoURL) sin esperar a que reentren. Para uno mismo, fallback a la sesión.
            const showsPhoto = socialData.profile.visibility?.showPhoto !== false;
            const resolvedPhoto = socialData.profile.photoURL || (showsPhoto ? entry.photoURL || '' : '') || (isOwnEntry ? ownPhotoURL : '');
            // E3: el canal social NO lee el gist de juegos EN CRUDO de otros usuarios (privacidad + desacople del
            // formato del gist de juegos). Las listas compartidas quedan index-only vacías para perfiles ajenos: el
            // detalle de actividad muestra nombre/rating/snippet del propio evento social; los metadatos
            // (plataformas/géneros) solo se ven para los juegos PROPIOS (fallback local en getGameItemById).
            const sharedLists: Partial<Record<TabId, SocialSharedGame[]>> = {};

            const activity = socialData.activity
              .map((activityEntry) => {
                const now = Date.now();
                const createdAt = toSafeTimestamp(activityEntry.createdAt, now);
                const updatedAt = toSafeTimestamp(activityEntry.updatedAt, createdAt);

                return {
                  ...activityEntry,
                  createdAt,
                  updatedAt,
                  profileId: entry.id,
                  profileDisplayName: socialData.profile.name || entry.displayName || 'Usuario',
                  socialGistId: resolvedSocialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, SOCIAL_ACTIVITY_PER_PROFILE);

            const posts = (socialData.posts || [])
              .map((postEntry) => {
                const now = Date.now();
                const createdAt = toSafeTimestamp(postEntry.createdAt, now);
                const updatedAt = toSafeTimestamp(postEntry.updatedAt, createdAt);

                return {
                  ...postEntry,
                  createdAt,
                  updatedAt,
                  profileId: entry.id,
                  profileDisplayName: socialData.profile.name || entry.displayName || 'Usuario',
                  socialGistId: resolvedSocialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, SOCIAL_POSTS_PER_PROFILE);

            return {
              id: entry.id,
              uid: entry.uid,
              displayName: socialData.profile.name || entry.displayName || 'Usuario',
              socialGistId: resolvedSocialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: resolvedPhoto,
              // El rango sale SIEMPRE de Firestore (lo asigna el admin), nunca del gist: el gist lo controla su
              // dueño y podría auto-otorgarse mithril editándolo a mano.
              tier: entry.tier,
              activity,
              posts,
              sharedLists,
              visibility: socialData.profile.visibility || defaultSocialVisibility,
            };
          } catch {
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || 'Usuario',
              socialGistId: effectiveSocialGistId,
              gamesGistId: effectiveGamesGistId,
              // Gist ilegible: usamos la foto del directorio de Firestore (best-effort) para no perderla.
              photoURL: entry.photoURL || (isOwnEntry ? ownPhotoURL : ''),
              tier: entry.tier,
              activity: [],
              posts: [],
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
        },
      );

      setSocialDirectory(withProfiles);
      void putCachedSocialDirectory(socialCfgGistId, withProfiles);
    } catch (error) {
      setSocialDirectory([]);
      setFeedback('warn', error instanceof Error ? error.message : SOCIAL_UI.status.firestoreCheckFailed);
    } finally {
      setLoadingDirectory(false);
    }
  }, [activePanel, authUser, defaultSocialVisibility, friendships.friends, friendshipsResolved, mainSyncConfig?.token, ownTier, profileEditorLocked, setFeedback, socialSpaceOpen, socialCfgGistId, showPhoto]);

  // F3 — publica una publicación de texto libre y refresca el feed (definido tras hydrateSocialDirectory para evitar TDZ).
  const handlePublishPost = useCallback(async () => {
    const text = composePostText.trim();
    if (!text || publishingPost) {
      return;
    }

    try {
      setPublishingPost(true);
      await publishPost({ text });
      setComposePostText('');
      await hydrateSocialDirectory(true);
      setFeedback('ok', SOCIAL_UI.status.postPublished);
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.postPublishFailed);
    } finally {
      setPublishingPost(false);
    }
  }, [composePostText, publishingPost, hydrateSocialDirectory, setFeedback]);

  useEffect(() => {
    void hydrateSocialDirectory();
  }, [hydrateSocialDirectory]);

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

  // Limpia el timer del cooldown al desmontar (evita setState tras desmontar).
  useEffect(() => () => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
  }, []);

  // Bloque 2 — propaga la foto propia a los DEMÁS: la foto solo la ven otros si está en NUESTRO gist social
  // público. Gists creados antes del soporte de foto (o sin re-guardar el perfil) no la llevan, así que nadie veía
  // la de nadie. Aquí, una vez por sesión, si tenemos foto de Google y `showPhoto`, la escribimos en el gist si
  // falta o difiere. Best-effort: si falla, se reintenta en la próxima sesión.
  const photoHealAttemptedRef = useRef(false);
  useEffect(() => {
    if (photoHealAttemptedRef.current) return;
    if (!socialSpaceOpen || !socialCfgGistId || !showPhoto) return;
    const photo = authUser?.photoURL;
    if (!photo) return;
    const cfg = getSocialSyncConfig();
    if (!cfg?.token) return;
    photoHealAttemptedRef.current = true;

    void (async () => {
      try {
        // 2b — idempotencia entre sesiones: si ya propagamos esta misma foto, no releemos ni reescribimos el gist.
        const meta = await getLocalMeta();
        if (meta?.photoHealedFor === photo) return;

        const current = await readSocialGist(cfg.token, socialCfgGistId, null);
        const data = current.data;
        if (!data) return;
        // El gist es la fuente de verdad: si el usuario tiene la foto desactivada, NO la republicamos (evita revertir
        // su opt-out por una carrera con la hidratación del perfil, que arranca con showPhoto=true por defecto).
        if (data.profile.visibility?.showPhoto === false) return;

        if (data.profile.photoURL !== photo) {
          await writeSocialGist(cfg.token, socialCfgGistId, {
            profile: { ...data.profile, photoURL: photo },
            activity: data.activity,
            posts: data.posts,
            updatedAt: Date.now(),
          });
          // 2a — sin re-hidratación completa (~30 lecturas). La foto propia ya se ve por el fallback de sesión; solo
          // parcheamos la entrada propia del directorio en memoria por si acaso, y la del directorio cacheado.
          setSocialDirectory((prev) => prev.map((e) => (e.socialGistId === socialCfgGistId ? { ...e, photoURL: photo } : e)));
        }
        // Propaga también la foto al doc público de Firestore (la lee el directorio), para que la vean los demás
        // sin depender de que cada uno reabra la app y re-publique su gist. Best-effort.
        if (authUser?.uid) {
          await updateProfilePhoto(authUser.uid, photo);
        }
        await patchLocalMeta({ photoHealedFor: photo });
      } catch {
        // best-effort: no bloquea el feed; se reintenta la próxima sesión.
      }
    })();
  }, [authUser?.photoURL, showPhoto, socialSpaceOpen, socialCfgGistId]);

  // Auto-crear gist social si tenemos token + Google pero no gist
  useEffect(() => {
    if (hasMainSync && authUser && !hasSocialGist && !connecting && !resolvingSocialGist && !signingIn) {
      void handleCreateSocialGist();
    }
  }, [hasMainSync, authUser, hasSocialGist, connecting, resolvingSocialGist, signingIn, handleCreateSocialGist]);

  const handleSaveProfile = useCallback(async () => {
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
      const normalizedHiddenTabs = getOrderedUniqueTabs(hiddenTabs);

      const visibility: SocialProfileVisibility = {
        hiddenTabs: normalizedHiddenTabs,
        hideReplayable,
        hideRetry,
        hideGameTime,
        showPhoto,
      };

      const profile = {
        name: profileName.trim() || authUser.displayName || authUser.email,
        private: false,
        visibility,
        sharedLists: {},
        // Solo se publica la foto si el usuario la muestra (normalize la valida/descarta si no).
        ...(showPhoto && authUser.photoURL ? { photoURL: authUser.photoURL } : {}),
      };

      const currentGistResult = await readSocialGist(socialConfig.token, socialCfgGistId, null);
      const currentGistData = currentGistResult.data;

      const writeResult = await writeSocialGist(socialConfig.token, socialCfgGistId, {
        profile,
        activity: currentGistData.activity,
        posts: currentGistData.posts, // preservar las publicaciones al guardar el perfil
        updatedAt: Date.now(),
      });

      const privacyResult = await updateGistPrivacy(socialConfig.token, socialCfgGistId, true);
      const finalGistId = privacyResult.gistId;
      const finalEtag = privacyResult.etag || writeResult.etag || socialCfgEtag;

      await ensureProfileByEmail({
        user: authUser,
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
        githubToken: mainSyncConfig?.token || socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
        socialGistEtag: finalEtag,
        preferredName: profile.name,
        // Publica la foto en el doc público (la lee el directorio); '' la borra si el usuario desactiva la foto.
        photoURL: showPhoto && authUser.photoURL ? authUser.photoURL : '',
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
        photo: showPhoto && authUser.photoURL ? authUser.photoURL : '',
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
      });

      // Refrescar la caché del perfil con lo recién guardado: evita releer el gist al volver a social y mantiene
      // la caché coherente con la edición.
      void putCachedSocialProfile(finalGistId, {
        name: profile.name,
        hiddenTabs: normalizedHiddenTabs,
        hideReplayable,
        hideRetry,
        hideGameTime,
        showPhoto,
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

      navigate('/social');
      void hydrateSocialDirectory();
      setFeedback('ok', SOCIAL_UI.status.profileSaved);

      setTimeout(() => setJustSavedProfile(false), 1000);
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.saveProfileFailed);
    } finally {
      setSavingProfile(false);
    }
  }, [
    authUser,
    hasCompletedGames,
    getOrderedUniqueTabs,
    hiddenTabs,
    hideReplayable,
    hideRetry,
    hideGameTime,
    hydrateSocialDirectory,
    navigate,
    profileName,
    reconcileGames,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
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
  const buildFriendshipSelfInfo = useCallback((): FriendshipSelfInfo => ({
    name: profileName.trim(),
    photo: showPhoto && authUser?.photoURL ? authUser.photoURL : '',
    socialGistId: socialCfgGistId,
    gamesGistId: mainSyncConfig?.gistId || '',
  }), [authUser?.photoURL, mainSyncConfig?.gistId, showPhoto, profileName, socialCfgGistId]);

  // "Añadir amigo" o "Aceptar": según el estado actual. Si no hay relación, envía petición; si el otro ya me pidió,
  // acepta. Maneja la carrera de petición simultánea (el doc canónico ya existe) releyendo y aceptando si procede.
  const handleAddOrAcceptFriend = useCallback(async (otherUid: string) => {
    const myUid = authUser?.uid;
    if (!myUid || !otherUid || myUid === otherUid) {
      return;
    }
    const relation = relationshipWith(otherUid);
    if (relation === 'friends' || relation === 'outgoing') {
      return; // ya gestionado desde otra acción específica.
    }
    try {
      setFriendshipBusyUid(otherUid);
      if (relation === 'incoming') {
        const docId = friendships.byOtherUid[otherUid]?.docId;
        if (docId) {
          await acceptFriendRequest({ myUid, docId, self: buildFriendshipSelfInfo() });
          await refreshAfterFriendshipChange();
          setFeedback('ok', SOCIAL_UI.status.friendRequestAccepted);
        }
        return;
      }
      try {
        await sendFriendRequest({ myUid, otherUid, self: buildFriendshipSelfInfo() });
        await refreshAfterFriendshipChange();
        setFeedback('ok', SOCIAL_UI.status.friendRequestSent);
      } catch (error) {
        // Carrera: el doc canónico ya existía. Releer y decidir.
        const existing = await readFriendship(myUid, otherUid);
        if (existing?.state === 'incoming') {
          await acceptFriendRequest({ myUid, docId: existing.docId, self: buildFriendshipSelfInfo() });
          await refreshAfterFriendshipChange();
          setFeedback('ok', SOCIAL_UI.status.friendRequestAccepted);
          return;
        }
        if (existing) {
          await refreshAfterFriendshipChange(); // ya outgoing/friends: reflejar el estado real sin error ruidoso.
          return;
        }
        throw error;
      }
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.friendActionFailed);
    } finally {
      setFriendshipBusyUid('');
    }
  }, [authUser?.uid, buildFriendshipSelfInfo, friendships, refreshAfterFriendshipChange, relationshipWith, setFeedback]);

  // Borra el doc de amistad (cancelar enviada / rechazar recibida / eliminar amistad), con mensaje específico.
  const deleteRelationship = useCallback(async (otherUid: string, successMsg: string) => {
    const myUid = authUser?.uid;
    const docId = friendships.byOtherUid[otherUid]?.docId;
    if (!myUid || !docId) {
      return;
    }
    try {
      setFriendshipBusyUid(otherUid);
      await deleteFriendship({ myUid, docId });
      await refreshAfterFriendshipChange();
      setFeedback('ok', successMsg);
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.friendActionFailed);
    } finally {
      setFriendshipBusyUid('');
    }
  }, [authUser?.uid, friendships, refreshAfterFriendshipChange, setFeedback]);

  const handleCancelFriendRequest = useCallback(
    (otherUid: string) => deleteRelationship(otherUid, SOCIAL_UI.status.friendRequestCanceled),
    [deleteRelationship],
  );
  const handleRejectFriendRequest = useCallback(
    (otherUid: string) => deleteRelationship(otherUid, SOCIAL_UI.status.friendRequestRejected),
    [deleteRelationship],
  );
  // "Dejar de ser amigos": NO borra directamente; abre un diálogo de confirmación (evita pulsaciones sin querer).
  const handleRemoveFriend = useCallback((otherUid: string) => {
    const view = friendships.byOtherUid[otherUid];
    const name = view ? enrichFriendRequest(view).name : SOCIAL_UI.requests.unknownUser;
    setRemoveFriendTarget({ uid: otherUid, name });
  }, [friendships, enrichFriendRequest]);

  const cancelRemoveFriend = useCallback(() => setRemoveFriendTarget(null), []);

  const confirmRemoveFriend = useCallback(async () => {
    const target = removeFriendTarget;
    if (!target) {
      return;
    }
    setRemoveFriendTarget(null);
    await deleteRelationship(target.uid, SOCIAL_UI.status.friendRemoved);
  }, [removeFriendTarget, deleteRelationship]);

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
        action: () => navigate('/ajustes'),
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
    // L4 — puerta de aceptación (solo con sesión y consentimiento no vigente).
    legalConsentRequired: legalConsent?.status === 'required' && legalConsent.uid === authUser?.uid,
    savingConsent,
    acceptLegalConsent,
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
    profileSearch,
    setProfileSearch,
    composePostText,
    setComposePostText,
    publishingPost,
    handlePublishPost,
    feedItems,
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
    profileDetailId,
    profileReviewsView,
    activeProfileReview,
    openProfileReviews,
    closeProfileReviews,
    openProfileReviewDetail,
    refreshProfileDetail,
    loadingForeignProfile,
    refreshCoolingDown,
    activeDetailEvent,
    getGameItemById,
    groupedFeedItems,
    hasMoreFeed,
    showMoreFeed,
    handleFeedRowMouseDown,
    handleFeedRowKeyDown,
    openActivityDetail,
    openProfileDetail,
    openOwnProfileDetail,
    isOwnProfileDetail,
    handleActivityItemKeyDown,
    handleProfileCardKeyDown,
    handleCreateSocialGist,
    handleSignInGoogle,
    hydrateSocialDirectory,
    handleSaveProfile,
    handleSignOut,
    primaryGatewayCta,
    // Amistad
    friendships,
    loadingFriendships,
    friendshipBusyUid,
    pendingIncomingCount,
    incomingRequests,
    outgoingRequests,
    friendsList,
    relationshipWith,
    refreshFriendships,
    handleAddOrAcceptFriend,
    handleCancelFriendRequest,
    handleRejectFriendRequest,
    handleRemoveFriend,
    removeFriendTarget,
    confirmRemoveFriend,
    cancelRemoveFriend,
  };
}
