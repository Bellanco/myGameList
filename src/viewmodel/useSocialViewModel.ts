import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  createSocialGist,
  ensureSyncConfigLoaded,
  getSocialSyncConfig,
  getSyncConfig,
  readPublicSocialGistById,
  readSocialGist,
  remapSocialActorIds,
  saveSocialSyncConfig,
  type SocialActivityEntry,
  type SocialPostEntry,
  type SocialProfileVisibility,
  type SocialSharedGame,
  updateGistPrivacy,
  writeSocialGist,
} from '../model/repository/gistRepository';
import { publishPost, unpublishReviewActivity } from '../model/repository/socialPublishRepository';
import { invalidateProfileGames, loadForeignProfileGames } from '../model/repository/foreignProfileRepository';
import { getCachedSocialDirectory, getCachedSocialProfile, getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta, putCachedSocialDirectory, putCachedSocialProfile } from '../model/repository/indexedDbRepository';
import { applyProfileVisibility } from '../core/utils/profileVisibility';
import { SOCIAL_UI } from '../core/constants/labels';
import { MAX_SOCIAL_FAVORITES } from '../core/constants/uiConfig';
import type { IconName } from '../core/constants/icons';
import type { GameItem, SyncConfig, TabId } from '../model/types/game';
import {
  acceptFriendRequest,
  deleteFriendship,
  ensureProfileByEmail,
  getCurrentSocialAuthUser,
  findSocialProfileByEmail,
  getMyFriendships,
  listSocialDirectory,
  readFriendship,
  resolveStableProfileId,
  sendFriendRequest,
  signInWithGoogle,
  signOutSocialUser,
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

type SocialPanel = 'profile' | 'profiles' | 'profile-detail' | 'detail' | 'requests' | 'feed';

type SocialRouteState = {
  activePanel: SocialPanel;
  profileDetailId: string;
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
// Tope de perfiles del directorio social. Cada perfil = 1 lectura de gist social al refrescar; bajar este número
// reduce el consumo de rate-limit a costa de mostrar menos perfiles/actividad en el feed. Tunable.
const SOCIAL_DIRECTORY_LIMIT = 30;
// C3: el directorio se hidrata leyendo el gist social de cada perfil. En vez de disparar TODAS las lecturas a la
// vez (ráfaga que puede activar los "secondary rate limits" de GitHub al crecer el directorio), se limita la
// concurrencia. Las lecturas son baratas (caché de sesión + revalidación ETag/304), así que el coste en latencia
// de la carga fría es pequeño y se gana robustez frente a 403 por ráfaga.
const SOCIAL_DIRECTORY_FETCH_CONCURRENCY = 6;
const PROFILE_EDIT_PATH = /^\/social\/profile\/?$/;
const PROFILES_PATH = /^\/social\/profiles\/?$/;
const REQUESTS_PATH = /^\/social\/requests\/?$/;
const PROFILE_DETAIL_PATH = /^\/social\/profiles\/([^/]+)$/;
const ACTIVITY_DETAIL_PATH = /^\/social\/user\/([^/]+)\/game\/(\d+)\/(review|recommendation)$/;

const getSocialRouteState = (pathname: string): SocialRouteState => {
  const profileEditMatch = pathname.match(PROFILE_EDIT_PATH);
  const profilesMatch = pathname.match(PROFILES_PATH);
  const requestsMatch = pathname.match(REQUESTS_PATH);
  const profileDetailMatch = pathname.match(PROFILE_DETAIL_PATH);
  const detailMatch = pathname.match(ACTIVITY_DETAIL_PATH);

  return {
    activePanel: profileEditMatch ? 'profile' : profilesMatch ? 'profiles' : requestsMatch ? 'requests' : profileDetailMatch ? 'profile-detail' : detailMatch ? 'detail' : 'feed',
    profileDetailId: profileDetailMatch ? decodeURIComponent(profileDetailMatch[1]) : '',
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

export function useSocialViewModel() {
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = useMemo(() => getSocialRouteState(location.pathname), [location.pathname]);
  const { activePanel, profileDetailId, detailActorUid, detailGameId, detailEventType } = routeState;

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
    email: string;
    socialGistId: string;
    gamesGistId: string;
    photoURL: string;
    favorites: string[];
    recommendations: string[];
    activity: SocialActivityFeedItem[];
    posts: SocialPostFeedItem[];
    // Index-only (SocialSharedGame) para perfiles ajenos; para el perfil PROPIO se repuebla con GameItem completos.
    sharedLists: Partial<Record<TabId, Array<GameItem | SocialSharedGame>>>;
    visibility: SocialProfileVisibility;
  };

  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
  // P1: profileId canónico del usuario (6.2a), para detectar propiedad por identidad (no por email). Hoy el id del
  // doc de directorio es el uid; tras el cutover index-only será el profileId → comprobamos ambos (ver isOwnProfileIdentity).
  const [ownProfileId, setOwnProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingSocialGist, setResolvingSocialGist] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'err'>('ok');
  const [hasBlockingSocialIssue, setHasBlockingSocialIssue] = useState(false);
  const [showSocialSpace, setShowSocialSpace] = useState(false);
  const [hasCreatedProfile, setHasCreatedProfile] = useState(false);
  const [mustCreateProfile, setMustCreateProfile] = useState(false);
  const [justSavedProfile, setJustSavedProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [favoriteGameIds, setFavoriteGameIds] = useState<number[]>([]);
  const [hiddenTabs, setHiddenTabs] = useState<TabId[]>([]);
  const [showPhoto, setShowPhoto] = useState(true);
  const [hideReplayable, setHideReplayable] = useState(false);
  const [hideRetry, setHideRetry] = useState(false);
  const [hideGameTime, setHideGameTime] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  // Filtro por nombre de la pantalla "Perfiles" (directorio social). El feed de actividad ya no se filtra.
  const [profileSearch, setProfileSearch] = useState('');
  // Paginación del feed: 25 inicial, +25 por "Mostrar más". Se reinicia al cambiar la búsqueda.
  const [feedVisibleCount, setFeedVisibleCount] = useState(FEED_PAGE_SIZE);
  const [composePostText, setComposePostText] = useState('');
  const [publishingPost, setPublishingPost] = useState(false);
  const [socialPayload, setSocialPayload] = useState<{ activity: SocialActivityEntry[] }>({ activity: [] });
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

      if (!resolvedGistId && currentUser?.email && mainConfig?.token) {
        try {
          const profile = await findSocialProfileByEmail(currentUser.email);
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
  const hasReadyAccess = hasSocialSession && hasSocialGist;
  const profileEditorLocked = isProfileEditorLocked(mustCreateProfile, hasBlockingSocialIssue);
  const canConnectSocialGist = hasMainSync && hasSocialSession && !hasSocialGist && !connecting && !resolvingSocialGist;
  const canSignInGoogle = hasMainSync && !hasSocialSession && !signingIn;

  useEffect(() => {
    if (!hasReadyAccess || showSocialSpace) {
      return;
    }

    setShowSocialSpace(true);
    navigate('/social');
  }, [hasReadyAccess, showSocialSpace, navigate]);

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
      const existingProfile = await findSocialProfileByEmail(user.email);
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
    if (!showSocialSpace || !authUser?.uid) {
      return;
    }
    void refreshFriendships();
  }, [showSocialSpace, authUser?.uid, refreshFriendships]);

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
      name: view.otherName || dir?.displayName || SOCIAL_UI.requests.unknownUser,
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

  const completedGameNameById = useMemo(() => {
    const map = new Map<number, string>();
    completedGames.forEach((game) => {
      map.set(game.id, game.name);
    });
    return map;
  }, [completedGames]);

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
    // Directorio de descubrimiento: se muestran TODOS los perfiles publicados (el propio excluido). Ya no se filtra
    // por `favorites.length > 0`: con el feed solo-amigos ya no leemos el gist de los no-amigos, así que su lista de
    // favoritos viene vacía; exigirla ocultaría a todo el mundo e impediría enviarles peticiones de amistad. Los
    // perfiles del directorio ya vienen acotados por Firestore (`social.enabled` + gist social presente).
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
    if (activePanel !== 'profile-detail' || !profileDetailId) {
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
   * Obtiene GameItem desde listas compartidas cargadas por gamesGistId.
   * Mantiene fallback local para no romper eventos propios sin datos remotos.
   */
  const getGameItemById = useCallback((profileId: string, gameId: number) => {
    const profileEntry = socialDirectory.find((entry) => entry.id === profileId);
    if (profileEntry) {
      const allShared = [
        ...(profileEntry.sharedLists.c || []),
        ...(profileEntry.sharedLists.v || []),
        ...(profileEntry.sharedLists.e || []),
        ...(profileEntry.sharedLists.p || []),
      ];
      const sharedMatch = allShared.find((game) => game.id === gameId);
      if (sharedMatch) {
        return {
          ...sharedMatch,
          _ts: 0,
        };
      }
    }

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
  }, [authUser, foreignGamesByProfile, localState, ownProfileId, socialDirectory]);

  // Evita despublicar la misma reseña dos veces mientras la escritura está en vuelo (StrictMode / re-render).
  const orphanUnpublishInFlightRef = useRef<Set<number>>(new Set());

  // Reseña huérfana PROPIA: el dueño abre el detalle de una reseña cuyo juego ya no existe en sus listados
  // (borrado o perdido). Sin contraparte, `getGameItemById` devuelve null y el detalle sale vacío; entonces la
  // despublicamos del gist social para que no quede una reseña fantasma en el feed y volvemos al feed.
  // Salvaguarda: solo si hay listados cargados (localStorage no vacío/sin hidratar), para no borrar por un
  // estado local transitoriamente vacío. Solo actúa sobre el perfil propio y sobre eventos de tipo 'review'.
  useEffect(() => {
    if (activePanel !== 'detail') return;
    const event = activeDetailEvent;
    if (!event || event.type !== 'review') return;
    if (!isOwnProfileIdentity(event.profileId, authUser?.uid, ownProfileId)) return;

    const ownGames = [...localState.c, ...localState.v, ...localState.e, ...localState.p];
    if (ownGames.length === 0) return; // sin listados cargados → no despublicar (evita falsos positivos)
    if (ownGames.some((game) => game.id === event.gameId)) return; // tiene contraparte → no es huérfana

    const gameId = event.gameId;
    if (orphanUnpublishInFlightRef.current.has(gameId)) return;
    orphanUnpublishInFlightRef.current.add(gameId);

    let cancelled = false;
    void unpublishReviewActivity({ id: gameId })
      .then(() => {
        if (cancelled) return;
        // Quita la entrada del feed local (payload propio + entrada propia del directorio) para que desaparezca
        // sin recargar, y vuelve al feed.
        setSocialPayload((prev) => ({
          activity: prev.activity.filter((entry) => !(entry.gameId === gameId && entry.type === 'review')),
        }));
        setSocialDirectory((prev) =>
          prev.map((entry) =>
            entry.socialGistId === socialCfgGistId
              ? { ...entry, activity: entry.activity.filter((a) => !(a.gameId === gameId && a.type === 'review')) }
              : entry,
          ),
        );
        navigate('/social');
      })
      .catch(() => {
        /* best-effort: si falla la red se reintenta la próxima vez que se abra el detalle */
      })
      .finally(() => {
        orphanUnpublishInFlightRef.current.delete(gameId);
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeDetailEvent, authUser, localState, navigate, ownProfileId, socialCfgGistId]);

  /**
   * Formatea la fecha como "DD de MMM".
   */
  const formatDayHeader = (date: Date): string => {
    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];

    return `${date.getDate()} de ${monthNames[date.getMonth()]}`;
  };

  /**
   * Agrupa las actividades por dÃ­a y retorna array con day headers.
   */
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
  }, [feedItems, feedVisibleCount, formatDayHeader]);

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

  // Abre el DETALLE del perfil propio (vista pública con sus listados), no el editor. Si aún no existe entrada
  // propia con favoritos en el directorio, cae al editor para que el usuario complete su perfil.
  const openOwnProfileDetail = useCallback(() => {
    const ownEntry = socialDirectory.find(
      (entry) => entry.socialGistId === socialCfgGistId && entry.favorites.length > 0,
    );
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
    if (activePanel !== 'detail' && activePanel !== 'profile-detail') return;
    const targetProfileId = activePanel === 'profile-detail' ? profileDetailId : activeDetailEvent?.profileId || '';
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
        // No hacer nada aquÃ­; el useEffect automÃ¡tico manejarÃ¡ la creación del gist
      }
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.signInFailed);
    } finally {
      setSigningIn(false);
    }
  }, [attachExistingSocialGist, setFeedback]);

  const hydrateSocialProfile = useCallback(async () => {
    if (!showSocialSpace || !authUser || !socialCfgGistId) {
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
      const cachedFavorites = cachedProfile.favorites.filter((id) => completedGameNameById.has(id));
      // No confiamos en el `profileExists` cacheado (pudo escribirse con la regla antigua "solo nombre"): lo
      // recalculamos con el criterio actual (nombre Y ≥1 favorito) para que los perfiles incompletos ya guardados
      // sean redirigidos al editor sin esperar a que caduque la caché (~5 min).
      const cachedProfileExists = Boolean(cachedProfile.name.trim()) && cachedFavorites.length > 0;
      setProfileName(cachedProfile.name);
      setFavoriteGameIds(cachedFavorites);
      setHiddenTabs(getOrderedUniqueTabs(cachedProfile.hiddenTabs || []));
      setHideReplayable(cachedProfile.hideReplayable);
      setHideRetry(cachedProfile.hideRetry);
      setHideGameTime(cachedProfile.hideGameTime);
      setShowPhoto(cachedProfile.showPhoto);
      setHasCreatedProfile(cachedProfileExists);
      setSocialPayload({ activity: cachedProfile.activity });

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
      const existingProfile = await findSocialProfileByEmail(authUser.email);

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
      const favorites = socialRead.data.profile.favoriteGames
        .map((entry) => entry.id)
        .filter((id) => completedGameNameById.has(id));
      const profileVisibility = socialRead.data.profile.visibility || defaultSocialVisibility;
      // Un perfil se considera COMPLETO (y por tanto utilizable sin pasar por el editor) solo si tiene nombre Y al
      // menos un favorito: misma regla que aplica la visibilidad del directorio/detalle (visibleSocialDirectory,
      // selectedProfileDetail, openProfileDetail). Así el dueño no se cuela al feed con un perfil que nadie más puede
      // abrir. Un doc en Firestore (era previa o reconexión) NO basta si el gist no cumple ambos campos.
      const profileExists = Boolean(socialRead.data.profile.name.trim()) && favorites.length > 0;

      setProfileName(nextName);
      setFavoriteGameIds(favorites);
      setHiddenTabs(getOrderedUniqueTabs(profileVisibility.hiddenTabs || []));
      setHideReplayable(Boolean(profileVisibility.hideReplayable));
      setHideRetry(Boolean(profileVisibility.hideRetry));
      setHideGameTime(Boolean(profileVisibility.hideGameTime));
      setShowPhoto(profileVisibility.showPhoto !== false);
      setHasCreatedProfile(profileExists);
      setSocialPayload({
        activity: socialRead.data.activity,
      });

      // Sembrar la caché para que la próxima navegación a social no relea el gist propio dentro de la ventana de TTL.
      void putCachedSocialProfile(socialCfgGistId, {
        name: nextName,
        favorites,
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
    completedGameNameById,
    defaultSocialVisibility,
    getOrderedUniqueTabs,
    lockProfileEditor,
    navigate,
    setFeedback,
    showSocialSpace,
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

  const hydrateSocialDirectory = useCallback(async (forceRefresh = false) => {
    // `!friendshipsResolved`: NO hidratar (ni cachear) hasta conocer a los amigos. Si no, el feed solo-amigos cachearía
    // el directorio sin actividad de amigos (carrera de arranque) y quedaría en blanco hasta invalidar la caché.
    if (!showSocialSpace || activePanel === 'profile' || profileEditorLocked || !authUser || !socialCfgGistId || !friendshipsResolved) {
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
      const cachedDirectory = await getCachedSocialDirectory<SocialDirectoryEntry>(socialCfgGistId);
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
      // FEED SOLO-AMIGOS: el gist social (actividad/publicaciones/favoritos) SOLO se lee de tus amigos y del propio.
      // Los no-amigos quedan index-only (nombre/foto del directorio Firestore), sin lectura de gist → gran ahorro de
      // llamadas. Como el feed deriva su actividad de estas entradas, mostrar solo la de amigos es automático.
      const friendUids = new Set(friendships.friends.map((friend) => friend.otherUid));

      // Escalabilidad (>30 amigos): el directorio de descubrimiento está capado a SOCIAL_DIRECTORY_LIMIT y solo lista
      // perfiles con `social.enabled`. Para que NINGÚN amigo desaparezca del feed / detalle / gestión por caer fuera
      // de ese tope (o por desactivar social), se sintetizan entradas para los amigos ausentes usando los datos
      // DENORMALIZADOS del doc de amistad (nombre/foto/gists). Así los amigos son autosuficientes e independientes del
      // tope del directorio; los pendientes NO se sintetizan (no son amigos aún).
      const directoryUids = new Set(dirEntries.map((entry) => entry.uid));
      const friendOnlyEntries = friendships.friends
        .filter((friend) => friend.otherSocialGistId && !directoryUids.has(friend.otherUid))
        .map((friend) => ({
          id: friend.otherUid,
          uid: friend.otherUid,
          email: '',
          displayName: friend.otherName || 'Usuario',
          photoURL: friend.otherPhoto || '',
          socialGistId: friend.otherSocialGistId,
          gamesGistId: friend.otherGamesGistId,
        }));
      const entries = [...dirEntries, ...friendOnlyEntries];

      const withProfiles = await mapWithConcurrency(
        entries,
        SOCIAL_DIRECTORY_FETCH_CONCURRENCY,
        async (entry) => {
          const isOwnEntry = entry.socialGistId === socialCfgGistId;
          const isFriend = friendUids.has(entry.uid);
          if (!isOwnEntry && !isFriend) {
            // No-amigo: index-only, sin leer su gist. Solo nombre/foto (Firestore); sin actividad/posts/favoritos.
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || 'Usuario',
              email: entry.email,
              socialGistId: entry.socialGistId,
              gamesGistId: entry.gamesGistId,
              photoURL: entry.photoURL || '',
              favorites: [],
              recommendations: [],
              activity: [],
              posts: [],
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
          try {
            const socialData = await readPublicSocialGistById(entry.socialGistId, socialConfig?.token || null);
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

            const mergedRecommendations = socialData.activity
              .filter((activityEntry) => activityEntry.type === 'recommendation')
              .map((activityEntry) => activityEntry.gameName)
              .filter((name) => Boolean(name && name.trim()))
              .filter((name, index, arr) => arr.indexOf(name) === index)
              .slice(0, 8);
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
                  socialGistId: entry.socialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, 40);

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
                  socialGistId: entry.socialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, 40);

            return {
              id: entry.id,
              uid: entry.uid,
              displayName: socialData.profile.name || entry.displayName || 'Usuario',
              email: entry.email,
              socialGistId: entry.socialGistId,
              gamesGistId: entry.gamesGistId,
              photoURL: resolvedPhoto,
              favorites: socialData.profile.favoriteGames.map((game) => game.name).slice(0, 5),
              recommendations: mergedRecommendations,
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
              email: entry.email,
              socialGistId: entry.socialGistId,
              gamesGistId: entry.gamesGistId,
              // Gist ilegible: usamos la foto del directorio de Firestore (best-effort) para no perderla.
              photoURL: entry.photoURL || (isOwnEntry ? ownPhotoURL : ''),
              favorites: [],
              recommendations: [],
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
  }, [activePanel, authUser, defaultSocialVisibility, friendships.friends, friendshipsResolved, mainSyncConfig?.token, profileEditorLocked, setFeedback, showSocialSpace, socialCfgGistId, showPhoto]);

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
    if (!showSocialSpace || !socialCfgGistId || !showPhoto) return;
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
  }, [authUser?.photoURL, showPhoto, showSocialSpace, socialCfgGistId]);

  // Auto-crear gist social si tenemos token + Google pero no gist
  useEffect(() => {
    if (hasMainSync && authUser && !hasSocialGist && !connecting && !resolvingSocialGist && !signingIn) {
      void handleCreateSocialGist();
    }
  }, [hasMainSync, authUser, hasSocialGist, connecting, resolvingSocialGist, signingIn, handleCreateSocialGist]);

  const toggleGameInSet = useCallback((id: number, current: number[], setFn: (next: number[]) => void) => {
    if (current.includes(id)) {
      setFn(current.filter((entry) => entry !== id));
      return;
    }

    if (current.length >= MAX_SOCIAL_FAVORITES) {
      setFeedback('warn', SOCIAL_UI.status.maxFavoritesReached);
      return;
    }

    setFn([...current, id]);
  }, [setFeedback]);

  const handleSaveProfile = useCallback(async () => {
    const socialConfig = getSocialSyncConfig();
    if (!authUser || !socialConfig?.token || !socialCfgGistId) {
      setFeedback('err', SOCIAL_UI.status.invalidSaveContext);
      return;
    }

    // Un perfil solo es válido con nombre Y al menos un favorito (coherente con la visibilidad: sin ambos, nadie
    // más podría abrirlo). Bloquea aquí la creación del estado incompleto que dejaba al perfil invisible para todos.
    const validFavoriteIds = favoriteGameIds.filter((id) => completedGameNameById.has(id));
    if (!profileName.trim() || validFavoriteIds.length === 0) {
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
        favoriteGames: validFavoriteIds.map((id) => ({ id, name: completedGameNameById.get(id) || `Juego ${id}` })),
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

      setSocialPayload({
        activity: currentGistData.activity,
      });

      // Refrescar la caché del perfil con lo recién guardado: evita releer el gist al volver a social y mantiene
      // la caché coherente con la edición.
      void putCachedSocialProfile(finalGistId, {
        name: profile.name,
        favorites: validFavoriteIds,
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
    completedGameNameById,
    favoriteGameIds,
    getOrderedUniqueTabs,
    hiddenTabs,
    hideReplayable,
    hideRetry,
    hideGameTime,
    hydrateSocialDirectory,
    navigate,
    profileName,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
    socialPayload.activity,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOutSocialUser();
    setAuthUser(null);
    setShowSocialSpace(false);
    setFeedback('ok', SOCIAL_UI.status.signOut, 'long');
  }, [setFeedback]);

  // Datos que YO aporto al doc de amistad (denormalizados): mi nombre/foto (respetando showPhoto) + mis ids de gist.
  const buildFriendshipSelfInfo = useCallback((): FriendshipSelfInfo => ({
    name: socialDisplayName,
    photo: showPhoto && authUser?.photoURL ? authUser.photoURL : '',
    socialGistId: socialCfgGistId,
    gamesGistId: mainSyncConfig?.gistId || '',
  }), [authUser?.photoURL, mainSyncConfig?.gistId, showPhoto, socialCfgGistId, socialDisplayName]);

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

    // Paso 3: Gist social (si tenemos sesión pero no gist) - normalmente automÃ¡tico pero se puede forzar
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
    showPhoto,
    setShowPhoto,
    favoriteSearch,
    setFavoriteSearch,
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
    toggleGameInSet,
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
