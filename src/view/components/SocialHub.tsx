import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  createSocialGist,
  getSocialSyncConfig,
  getSyncConfig,
  readPublicGamesGistById,
  readPublicSocialGistById,
  readSocialGist,
  saveSocialSyncConfig,
  type SocialActivityEntry,
  type SocialProfileVisibility,
  type SocialSharedGame,
  updateGistPrivacy,
  writeSocialGist,
} from '../../model/repository/gistRepository';
import { SOCIAL_UI } from '../../core/constants/labels';
import type { IconName } from '../../core/constants/icons';
import type { GameItem, TabId } from '../../model/types/game';
import {
  ensureProfileByEmail,
  getCurrentSocialAuthUser,
  findSocialProfileByEmail,
  listSocialDirectory,
  signInWithGoogle,
  signOutSocialUser,
  type SocialAuthUser,
} from '../../model/repository/firebaseRepository';
import { loadLocalState } from '../../model/repository/localRepository';
import { Icon } from './Icon';

import { SocialProfileScreen } from './socialhub/SocialProfileScreen';
import { SocialDetailScreen } from './socialhub/SocialDetailScreen';
import { SocialProfileDetailScreen } from './socialhub/SocialProfileDetailScreen';
import { SocialFeedScreen } from './socialhub/SocialFeedScreen';

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

type SocialPanel = 'profile' | 'profile-detail' | 'detail' | 'feed';

type SocialRouteState = {
  activePanel: SocialPanel;
  profileDetailId: string;
  detailActorUid: string;
  detailGameId: number;
  detailEventType: string;
};

const PROFILE_EDIT_PATH = /^\/social\/profile\/?$/;
const PROFILE_DETAIL_PATH = /^\/social\/profiles\/([^/]+)$/;
const ACTIVITY_DETAIL_PATH = /^\/social\/user\/([^/]+)\/game\/(\d+)\/(review|recommendation)$/;

const getSocialRouteState = (pathname: string): SocialRouteState => {
  const profileEditMatch = pathname.match(PROFILE_EDIT_PATH);
  const profileDetailMatch = pathname.match(PROFILE_DETAIL_PATH);
  const detailMatch = pathname.match(ACTIVITY_DETAIL_PATH);

  return {
    activePanel: profileEditMatch ? 'profile' : profileDetailMatch ? 'profile-detail' : detailMatch ? 'detail' : 'feed',
    profileDetailId: profileDetailMatch ? decodeURIComponent(profileDetailMatch[1]) : '',
    detailActorUid: detailMatch ? decodeURIComponent(detailMatch[1]) : '',
    detailGameId: detailMatch ? Number(detailMatch[2]) : 0,
    detailEventType: detailMatch ? detailMatch[3] : '',
  };
};

/**
 * Hub social - Fase 1.
 *
 * Requisitos cubiertos:
 * - Gist social separado (nuevo gist)
 * - Login Google habilitado solo cuando existe gist social
 * - Pantalla social vacia tras autenticacion
 */
export const SocialHub = memo(function SocialHub() {
  const location = useLocation();
  const navigate = useNavigate();

  const routeState = useMemo(() => getSocialRouteState(location.pathname), [location.pathname]);
  const { activePanel, profileDetailId, detailActorUid, detailGameId, detailEventType } = routeState;

  type SocialActivityFeedItem = SocialActivityEntry & {
    profileId: string;
    profileDisplayName: string;
    socialGistId: string;
  };

  type SocialDirectoryEntry = {
    id: string;
    displayName: string;
    email: string;
    socialGistId: string;
    gamesGistId: string;
    favorites: string[];
    recommendations: string[];
    activity: SocialActivityFeedItem[];
    sharedLists: Partial<Record<TabId, SocialSharedGame[]>>;
    visibility: SocialProfileVisibility;
  };

  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
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
  const [hideReplayable, setHideReplayable] = useState(false);
  const [hideRetry, setHideRetry] = useState(false);
  const [hideGameTime, setHideGameTime] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedFilter] = useState<'all' | 'favorites'>('all');
  const [socialPayload, setSocialPayload] = useState<{ recommendations: Array<{ id: number; fromUid: string; toUid: string; gameId: number; gameName: string; message: string; rating: number; createdAt: number; updatedAt: number }>; activity: SocialActivityEntry[] }>({ recommendations: [], activity: [] });
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [socialDirectory, setSocialDirectory] = useState<SocialDirectoryEntry[]>([]);
  const feedRowRef = useRef<HTMLDivElement | null>(null);
  const feedDraggingRef = useRef(false);
  const feedStartXRef = useRef(0);
  const feedStartScrollRef = useRef(0);
  const [isFeedDragging, setIsFeedDragging] = useState(false);

  const setFeedback = useCallback((kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => {
    setStatusKind(kind);
    setStatus(message);

    // Any warning/error blocks feed access until a successful social action clears it.
    if (kind === 'ok') {
      setHasBlockingSocialIssue(false);
    } else {
      setHasBlockingSocialIssue(true);
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
      const mainConfig = getSyncConfig();
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

  const mainSyncConfig = useMemo(() => getSyncConfig(), []);
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

  const toSharedGame = useCallback((game: GameItem): SocialSharedGame => {
    return {
      id: game.id,
      name: game.name,
      platforms: game.platforms || [],
      genres: game.genres || [],
      steamDeck: Boolean(game.steamDeck),
      review: game.review || '',
      score: Number(game.score || 0),
      strengths: game.strengths || [],
      weaknesses: game.weaknesses || [],
      reasons: game.reasons || [],
      replayable: Boolean(game.replayable),
      retry: Boolean(game.retry),
      hours: typeof game.hours === 'number' ? game.hours : null,
    };
  }, []);

  const visibleSocialDirectory = useMemo(() => {
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
    const normalizedQuery = feedSearch.trim().toLowerCase();

    return visibleSocialDirectory.filter((entry) => {
      const matchesFilter =
        feedFilter === 'all' ||
        (feedFilter === 'favorites' && entry.favorites.length > 0);

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        entry.displayName,
        entry.email,
        ...entry.favorites,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [feedFilter, feedSearch, visibleSocialDirectory]);

  const selectedProfileDetail = useMemo(() => {
    if (activePanel !== 'profile-detail' || !profileDetailId) {
      return null;
    }

    return socialDirectory.find((entry) => entry.id === profileDetailId) || null;
  }, [activePanel, profileDetailId, socialDirectory]);

  const activityFeedItems = useMemo(() => {
    const normalizedQuery = feedSearch.trim().toLowerCase();

    const feedItems = socialDirectory
      .flatMap((entry) => entry.activity)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 300);

    if (!normalizedQuery) {
      return feedItems;
    }

    return feedItems.filter((item) => {
      const haystack = [
        item.profileDisplayName,
        item.actorName,
        item.gameName,
        item.recommendationText,
        item.reviewText,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [feedSearch, socialDirectory]);

  const activeDetailEvent = useMemo(() => {
    if (activePanel !== 'detail' || !detailActorUid || detailGameId <= 0 || !detailEventType) {
      return null;
    }

    return activityFeedItems.find(
      (entry) =>
        entry.actorUid === detailActorUid &&
        entry.gameId === detailGameId &&
        entry.type === detailEventType,
    ) || null;
  }, [activePanel, activityFeedItems, detailActorUid, detailEventType, detailGameId]);

  /**
   * Obtiene el GameItem por su ID desde el estado local de todas las tabs.
   */
  const getGameItemById = useCallback((gameId: number) => {
    const allGames = [
      ...localState.c,
      ...localState.v,
      ...localState.e,
      ...localState.p,
    ];
    return allGames.find((game) => game.id === gameId) || null;
  }, [localState]);

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
   * Agrupa las actividades por día y retorna array con day headers.
   */
  const groupedActivityFeedItems = useMemo(() => {
    const groups: Array<{
      dayHeader: string;
      dayDate: Date;
      items: SocialActivityFeedItem[];
    }> = [];

    const itemsByDay = new Map<string, SocialActivityFeedItem[]>();

    activityFeedItems.forEach((item) => {
      const itemDate = new Date(item.updatedAt);
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
  }, [activityFeedItems, formatDayHeader]);

  const handleFeedRowMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !feedRowRef.current) {
      return;
    }

    // No iniciar arrastre si el click es en una tarjeta de perfil
    const target = event.target as HTMLElement;
    if (target.closest('.social-feed-profile-item')) {
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
    navigate(`/social/user/${encodeURIComponent(entry.actorUid)}/game/${entry.gameId}/${entry.type}`);
  }, [navigate]);

  const openProfileDetail = useCallback((profileId: string) => {
    navigate(`/social/profiles/${encodeURIComponent(profileId)}`);
  }, [navigate]);

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
    if (!showSocialSpace || !authUser || !socialCfgGistId) {
      return;
    }

    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token) {
      setFeedback('err', SOCIAL_UI.status.missingSocialToken);
      return;
    }

    try {
      setHydratingProfile(true);
      const existingProfile = await findSocialProfileByEmail(authUser.email);

      const socialRead = await readSocialGist(socialConfig.token, socialCfgGistId, socialCfgEtag);
      if (!socialRead.notModified) {
        setSocialCfgEtag(socialRead.etag || null);
      }

      const nextName = socialRead.data.profile.name || existingProfile?.displayName || authUser.displayName || authUser.email;
      const favorites = socialRead.data.profile.favoriteGames
        .map((entry) => entry.id)
        .filter((id) => completedGameNameById.has(id));
      const profileVisibility = socialRead.data.profile.visibility || defaultSocialVisibility;
      const existsInGist = Boolean(socialRead.data.profile.name.trim()) || favorites.length > 0;
      const firestoreGistId = existingProfile?.socialGistId?.trim() || '';
      const existsInFirestore = Boolean(
        existingProfile?.id &&
          existingProfile.socialEnabled &&
          firestoreGistId &&
          firestoreGistId === socialCfgGistId,
      );
      const profileExists = existsInGist || existsInFirestore;

      setProfileName(nextName);
      setFavoriteGameIds(favorites);
      setHiddenTabs(getOrderedUniqueTabs(profileVisibility.hiddenTabs || []));
      setHideReplayable(Boolean(profileVisibility.hideReplayable));
      setHideRetry(Boolean(profileVisibility.hideRetry));
      setHideGameTime(Boolean(profileVisibility.hideGameTime));
      setHasCreatedProfile(profileExists);
      setSocialPayload({
        recommendations: [],
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

  const hydrateSocialDirectory = useCallback(async () => {
    if (!showSocialSpace || activePanel === 'profile' || profileEditorLocked || !authUser || !socialCfgGistId) {
      return;
    }

    try {
      setLoadingDirectory(true);
      const entries = await listSocialDirectory(50);

      const withProfiles = await Promise.all(
        entries.map(async (entry) => {
          try {
            const socialData = await readPublicSocialGistById(entry.socialGistId, mainSyncConfig?.token);
            let sharedLists: Partial<Record<TabId, SocialSharedGame[]>> = socialData.profile.sharedLists || {};

            if (entry.gamesGistId) {
              try {
                const gamesData = await readPublicGamesGistById(entry.gamesGistId, mainSyncConfig?.token);
                sharedLists = {
                  c: gamesData.c.map((game) => toSharedGame(game)).slice(0, 300),
                  v: gamesData.v.map((game) => toSharedGame(game)).slice(0, 300),
                  e: gamesData.e.map((game) => toSharedGame(game)).slice(0, 300),
                  p: gamesData.p.map((game) => toSharedGame(game)).slice(0, 300),
                };
              } catch {
                // Keep social shared snapshot as fallback.
              }
            }

            const highlightedRecommendations = socialData.profile.recommendations.map((game) => game.name);
            const sharedRecommendations = socialData.recommendations.map((entry) => entry.gameName);
            const mergedRecommendations = [...new Set([...highlightedRecommendations, ...sharedRecommendations])]
              .filter((name) => Boolean(name && name.trim()))
              .slice(0, 8);
            const activity = socialData.activity
              .map((activityEntry) => ({
                ...activityEntry,
                profileId: entry.id,
                profileDisplayName: socialData.profile.name || entry.displayName || entry.email,
                socialGistId: entry.socialGistId,
              }))
              .slice(0, 40);

            return {
              id: entry.id,
              displayName: socialData.profile.name || entry.displayName || entry.email,
              email: entry.email,
              socialGistId: entry.socialGistId,
              gamesGistId: entry.gamesGistId,
              favorites: socialData.profile.favoriteGames.map((game) => game.name).slice(0, 5),
              recommendations: mergedRecommendations,
              activity,
              sharedLists,
              visibility: socialData.profile.visibility || defaultSocialVisibility,
            };
          } catch {
            return {
              id: entry.id,
              displayName: entry.displayName || entry.email,
              email: entry.email,
              socialGistId: entry.socialGistId,
              gamesGistId: entry.gamesGistId,
              favorites: [],
              recommendations: [],
              activity: [],
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
        }),
      );

      setSocialDirectory(withProfiles);
    } catch (error) {
      setSocialDirectory([]);
      setFeedback('warn', error instanceof Error ? error.message : SOCIAL_UI.status.firestoreCheckFailed);
    } finally {
      setLoadingDirectory(false);
    }
  }, [activePanel, authUser, defaultSocialVisibility, mainSyncConfig?.token, profileEditorLocked, setFeedback, showSocialSpace, socialCfgGistId, toSharedGame]);

  useEffect(() => {
    void hydrateSocialDirectory();
  }, [hydrateSocialDirectory]);

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

    // Máximo de 3 favoritos
    if (current.length >= 3) {
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

    try {
      setSavingProfile(true);
      const validFavoriteIds = favoriteGameIds.filter((id) => completedGameNameById.has(id));
      const normalizedHiddenTabs = getOrderedUniqueTabs(hiddenTabs);
      const hiddenTabsSet = new Set<TabId>(normalizedHiddenTabs);

      const visibility: SocialProfileVisibility = {
        hiddenTabs: normalizedHiddenTabs,
        hideReplayable,
        hideRetry,
        hideGameTime,
      };

      const sharedLists: Partial<Record<TabId, SocialSharedGame[]>> = {};
      (['c', 'v', 'e', 'p'] as const).forEach((tab) => {
        if (hiddenTabsSet.has(tab)) {
          return;
        }

        const compactGames = localState[tab]
          .map((game) => toSharedGame(game))
          .filter((game) => game.id > 0 && Boolean(game.name.trim()))
          .slice(0, 300);

        sharedLists[tab] = compactGames;
      });

      const profile = {
        name: profileName.trim() || authUser.displayName || authUser.email,
        private: false,
        favoriteGames: validFavoriteIds.map((id) => ({ id, name: completedGameNameById.get(id) || `Juego ${id}` })),
        recommendations: [], // No más recomendaciones destacadas
        visibility,
        sharedLists,
      };

      const writeResult = await writeSocialGist(socialConfig.token, socialCfgGistId, {
        profile,
        recommendations: [],
        activity: socialPayload.activity,
        updatedAt: Date.now(),
      });

      // Todos los perfiles sociales se fuerzan como públicos.
      await updateGistPrivacy(socialConfig.token, socialCfgGistId, true);

      await ensureProfileByEmail({
        user: authUser,
        socialGistId: socialCfgGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
        githubToken: mainSyncConfig?.token || socialConfig.token,
        socialGistEtag: writeResult.etag || socialCfgEtag,
        preferredName: profile.name,
      });

      saveSocialSyncConfig({
        token: socialConfig.token,
        gistId: socialCfgGistId,
        etag: writeResult.etag || socialCfgEtag,
        lastRemoteUpdatedAt: Date.now(),
      });
      setSocialCfgEtag(writeResult.etag || socialCfgEtag);
      setHasCreatedProfile(true);
      setMustCreateProfile(false);
      setJustSavedProfile(true);
      navigate('/social');
      void hydrateSocialDirectory();
      setFeedback('ok', SOCIAL_UI.status.profileSaved);
      
      // Clear the flag after a short delay to allow normal hydration flow again
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
    localState,
    navigate,
    profileName,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
    socialPayload.activity,
    toSharedGame,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOutSocialUser();
    setAuthUser(null);
    setShowSocialSpace(false);
    setFeedback('ok', SOCIAL_UI.status.signOut, 'long');
  }, [setFeedback]);

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

  if (loading) {
    return (
      <section className="social-hub social-hub-gateway" aria-label="Social">
        <div className="social-hub-card social-hub-gateway-card">
          <div className="social-hub-title-wrap">
            <Icon name="bottom-hub" className="social-hub-icon" />
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
        hydrateSocialDirectory={hydrateSocialDirectory}
        openProfileDetail={(id) => {
          if (id === 'profile') {
            navigate('/social/profile');
          } else {
            openProfileDetail(id);
          }
        }}
        handleProfileCardKeyDown={handleProfileCardKeyDown}
        groupedActivityFeedItems={groupedActivityFeedItems}
        activityFeedItems={activityFeedItems}
        openActivityDetail={openActivityDetail}
        handleActivityItemKeyDown={handleActivityItemKeyDown}
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
    <section className="social-hub social-hub-gateway" aria-label="Social">
      <div className="social-hub-card social-hub-gateway-card">
        <div className="social-hub-title-wrap">
          <Icon name="bottom-hub" className="social-hub-icon" />
          <h2>{SOCIAL_UI.hubTitle}</h2>
        </div>
        <p className="social-gateway-lead">
          {SOCIAL_UI.gateway.lead}
        </p>

        <p className="social-gateway-step-caption">{SOCIAL_UI.gateway.stepCaption(currentStep, gatewaySteps.length)}</p>

        <div className="social-gateway-actions" aria-label="Acciones principales social">
          {primaryGatewayCta ? (
            <button
              className="btn btn-primary social-gateway-btn social-gateway-btn-primary"
              type="button"
              onClick={primaryGatewayCta.action}
              disabled={primaryGatewayCta.disabled}
            >
              <Icon name={primaryGatewayCta.icon} />
              <span>{primaryGatewayCta.label}</span>
            </button>
          ) : null}

          {hasSocialSession ? (
            <button className="btn btn-danger social-gateway-btn" type="button" onClick={handleSignOut}>
              <Icon name="logout" />
              <span>{SOCIAL_UI.gateway.signOut}</span>
            </button>
          ) : null}
        </div>

        <div className="social-gateway-progress" aria-label="Progreso de configuracion social">
          <div className="social-gateway-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={gatewayProgress}>
            <span className="social-gateway-progress-fill" style={{ width: `${gatewayProgress}%` }} />
          </div>
          <small>{SOCIAL_UI.gateway.progress(gatewayProgress)}</small>
        </div>

        <div className="social-gateway-steps" aria-label="Pasos de configuracion social">
          {gatewaySteps.map((step, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep && !step.done;
            return (
              <article
                key={step.id}
                className={`social-gateway-step ${step.done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`.trim()}
              >
                <span className="social-gateway-step-badge" aria-hidden="true">{step.done ? 'OK' : stepNumber}</span>
                <div className="social-gateway-step-copy">
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

        <details className="social-gateway-details" open>
          <summary>{SOCIAL_UI.gateway.detailsSummary}</summary>
          <div className="social-status-grid" aria-label="Estado de configuracion social">
            <article className={`social-status-card ${hasMainSync ? 'is-ok' : 'is-pending'}`}>
              <span className="social-status-label">{SOCIAL_UI.gateway.stateSync}</span>
              <strong>{hasMainSync ? SOCIAL_UI.gateway.stateConnected : SOCIAL_UI.gateway.stateNotConnected}</strong>
            </article>
            <article className={`social-status-card ${hasSocialGist ? 'is-ok' : 'is-pending'}`}>
              <span className="social-status-label">{SOCIAL_UI.gateway.stateGist}</span>
              <strong>{hasSocialGist ? SOCIAL_UI.gateway.stateLinked : SOCIAL_UI.gateway.stateNotLinked}</strong>
            </article>
            <article className={`social-status-card ${hasSocialSession ? 'is-ok' : 'is-pending'}`}>
              <span className="social-status-label">{SOCIAL_UI.gateway.stateSession}</span>
              <strong>{hasSocialSession ? (authUser?.displayName || authUser?.email || SOCIAL_UI.gateway.stateActive) : SOCIAL_UI.gateway.stateNotStarted}</strong>
            </article>
          </div>

          <div className="social-hub-tags" aria-label="Flujo social">
            {SOCIAL_UI.gateway.flow.map((flowStep) => (
              <span key={flowStep} className="social-chip">{flowStep}</span>
            ))}
          </div>
        </details>

        {!hasSocialGist ? <p>{SOCIAL_UI.gateway.gistMissing}</p> : null}
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
});
