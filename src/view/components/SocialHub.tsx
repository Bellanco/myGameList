import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createSocialGist, getSocialSyncConfig, getSyncConfig, readPublicSocialGistById, readSocialGist, saveSocialSyncConfig, writeSocialGist, updateGistPrivacy } from '../../model/repository/gistRepository';
import { SOCIAL_UI } from '../../core/constants/labels';
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
import { SocialGameCardSelector } from './SocialGameCardSelector';

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

  // Determinar panel basado en URL
  const activePanel = location.pathname.includes('/profile') ? 'profile' : 'feed';

  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingSocialGist, setResolvingSocialGist] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'err'>('ok');
  const [showSocialSpace, setShowSocialSpace] = useState(false);
  const [hasCreatedProfile, setHasCreatedProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [favoriteGameIds, setFavoriteGameIds] = useState<number[]>([]);
  const [recommendationGameIds, setRecommendationGameIds] = useState<number[]>([]);
  const [socialPrivate, setSocialPrivate] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [recommendationSearch, setRecommendationSearch] = useState('');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'favorites' | 'recommendations'>('all');
  const [socialPayload, setSocialPayload] = useState<{ recommendations: Array<{ id: number; fromUid: string; toUid: string; gameId: number; gameName: string; createdAt: number }>; activity: Array<{ id: number; type: string; actorUid: string; createdAt: number }> }>({ recommendations: [], activity: [] });
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [socialDirectory, setSocialDirectory] = useState<Array<{ id: string; displayName: string; email: string; socialGistId: string; favorites: string[]; recommendations: string[] }>>([]);
  const feedRowRef = useRef<HTMLDivElement | null>(null);
  const feedDraggingRef = useRef(false);
  const feedStartXRef = useRef(0);
  const feedStartScrollRef = useRef(0);
  const [isFeedDragging, setIsFeedDragging] = useState(false);

  const setFeedback = useCallback((kind: 'ok' | 'warn' | 'err', message: string) => {
    setStatusKind(kind);
    setStatus(message);
  }, []);

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
  }, []);

  const mainSyncConfig = useMemo(() => getSyncConfig(), []);
  const hasMainSync = Boolean(mainSyncConfig?.token && mainSyncConfig?.gistId);
  const hasSocialGist = Boolean(socialCfgGistId);
  const hasSocialSession = Boolean(authUser);
  const hasReadyAccess = hasSocialSession && hasSocialGist;
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

  const nonCompletedGames = useMemo(() => {
    const map = new Map<number, string>();
    [...localState.v, ...localState.e, ...localState.p].forEach((game) => {
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

  const nonCompletedGameNameById = useMemo(() => {
    const map = new Map<number, string>();
    nonCompletedGames.forEach((game) => {
      map.set(game.id, game.name);
    });
    return map;
  }, [nonCompletedGames]);

  const feedStats = useMemo(() => {
    const favorites = socialDirectory.reduce((acc, entry) => acc + entry.favorites.length, 0);
    const recommendations = socialDirectory.reduce((acc, entry) => acc + entry.recommendations.length, 0);
    return {
      profiles: socialDirectory.length,
      favorites,
      recommendations,
    };
  }, [socialDirectory]);

  const socialDisplayName = useMemo(() => {
    const preferred = profileName.trim();
    if (preferred) {
      return preferred;
    }

    return authUser?.displayName || authUser?.email || '';
  }, [authUser, profileName]);

  const filteredSocialDirectory = useMemo(() => {
    const normalizedQuery = feedSearch.trim().toLowerCase();

    return socialDirectory.filter((entry) => {
      const matchesFilter =
        feedFilter === 'all' ||
        (feedFilter === 'favorites' && entry.favorites.length > 0) ||
        (feedFilter === 'recommendations' && entry.recommendations.length > 0);

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
        ...entry.recommendations,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [feedFilter, feedSearch, socialDirectory]);

  const handleFeedRowMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !feedRowRef.current) {
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
        setFeedback('ok', SOCIAL_UI.status.signInNeedCreate);
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
      const highlighted = socialRead.data.profile.recommendations
        .map((entry) => entry.id)
        .filter((id) => nonCompletedGameNameById.has(id));
      const existsInGist = Boolean(socialRead.data.profile.name.trim()) || favorites.length > 0 || highlighted.length > 0;
      const existsInFirestore = Boolean(existingProfile?.id && existingProfile.socialEnabled && existingProfile.socialGistId);
      const profileExists = existsInGist || existsInFirestore;

      setProfileName(nextName);
      setFavoriteGameIds(favorites);
      setRecommendationGameIds(highlighted);
      setSocialPrivate(Boolean(socialRead.data.profile.private));
      setHasCreatedProfile(profileExists);
      navigate('/social');
      setSocialPayload({
        recommendations: socialRead.data.recommendations,
        activity: socialRead.data.activity,
      });
      if (!profileExists) {
        setFeedback('warn', SOCIAL_UI.status.profileMissing);
      }
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.loadProfileFailed);
    } finally {
      setHydratingProfile(false);
    }
  }, [authUser, completedGameNameById, nonCompletedGameNameById, setFeedback, showSocialSpace, socialCfgEtag, socialCfgGistId]);

  useEffect(() => {
    void hydrateSocialProfile();
  }, [hydrateSocialProfile]);

  const hydrateSocialDirectory = useCallback(async () => {
    if (!showSocialSpace || activePanel !== 'feed' || !authUser || !socialCfgGistId) {
      return;
    }

    try {
      setLoadingDirectory(true);
      const entries = await listSocialDirectory(50);

      const withProfiles = await Promise.all(
        entries.map(async (entry) => {
          try {
            const socialData = await readPublicSocialGistById(entry.socialGistId);
            const highlightedRecommendations = socialData.profile.recommendations.map((game) => game.name);
            const sharedRecommendations = socialData.recommendations.map((entry) => entry.gameName);
            const mergedRecommendations = [...new Set([...highlightedRecommendations, ...sharedRecommendations])]
              .filter((name) => Boolean(name && name.trim()))
              .slice(0, 8);

            return {
              id: entry.id,
              displayName: socialData.profile.name || entry.displayName || entry.email,
              email: entry.email,
              socialGistId: entry.socialGistId,
              favorites: socialData.profile.favoriteGames.map((game) => game.name).slice(0, 5),
              recommendations: mergedRecommendations,
            };
          } catch {
            return {
              id: entry.id,
              displayName: entry.displayName || entry.email,
              email: entry.email,
              socialGistId: entry.socialGistId,
              favorites: [],
              recommendations: [],
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
  }, [activePanel, authUser, setFeedback, showSocialSpace, socialCfgGistId]);

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

    setFn([...current, id]);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const socialConfig = getSocialSyncConfig();
    if (!authUser || !socialConfig?.token || !socialCfgGistId) {
      setFeedback('err', SOCIAL_UI.status.invalidSaveContext);
      return;
    }

    try {
      setSavingProfile(true);
      const validFavoriteIds = favoriteGameIds.filter((id) => completedGameNameById.has(id));
      const validRecommendationIds = recommendationGameIds.filter((id) => nonCompletedGameNameById.has(id));
      const nextSharedRecommendations = validRecommendationIds.length === 0 ? [] : socialPayload.recommendations;

      const profile = {
        name: profileName.trim() || authUser.displayName || authUser.email,
        private: socialPrivate,
        favoriteGames: validFavoriteIds.map((id) => ({ id, name: completedGameNameById.get(id) || `Juego ${id}` })),
        recommendations: validRecommendationIds.map((id) => ({ id, name: nonCompletedGameNameById.get(id) || `Juego ${id}` })),
      };

      const writeResult = await writeSocialGist(socialConfig.token, socialCfgGistId, {
        profile,
        recommendations: nextSharedRecommendations,
        activity: socialPayload.activity,
        updatedAt: Date.now(),
      });

      // Actualizar privacidad del gist si cambió
      try {
        await updateGistPrivacy(socialConfig.token, socialCfgGistId, !socialPrivate);
      } catch (error) {
        // Log but don't fail on privacy update - main profile save succeeded
        console.warn('Warning: Could not update gist privacy setting:', error);
      }

      await ensureProfileByEmail({
        user: authUser,
        socialGistId: socialCfgGistId,
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
      setSocialPayload((prev) => ({
        ...prev,
        recommendations: nextSharedRecommendations,
      }));
      navigate('/social');
      void hydrateSocialDirectory();
      setFeedback('ok', SOCIAL_UI.status.profileSaved);
    } catch (error) {
      setFeedback('err', error instanceof Error ? error.message : SOCIAL_UI.status.saveProfileFailed);
    } finally {
      setSavingProfile(false);
    }
  }, [
    authUser,
    completedGameNameById,
    favoriteGameIds,
    hydrateSocialDirectory,
    nonCompletedGameNameById,
    profileName,
    recommendationGameIds,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
    socialPayload.activity,
    socialPayload.recommendations,
    socialPrivate,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOutSocialUser();
    setAuthUser(null);
    setShowSocialSpace(false);
    setFeedback('ok', SOCIAL_UI.status.signOut);
  }, [setFeedback]);

  const primaryGatewayCta = useMemo(() => {
    // Paso 1: Conectar sincronización principal (token)
    if (!hasMainSync) {
      return {
        icon: 'settings' as const,
        label: SOCIAL_UI.gateway.connectSync,
        action: () => navigate('/ajustes'),
        disabled: false,
      };
    }

    // Paso 2: Google (si tenemos token pero no sesión)
    if (resolvingSocialGist) {
      return {
        icon: 'cloud-sync' as const,
        label: SOCIAL_UI.gateway.resolveProfile,
        action: () => undefined,
        disabled: true,
      };
    }

    if (canSignInGoogle) {
      return {
        icon: 'bottom-hub' as const,
        label: signingIn ? SOCIAL_UI.gateway.signingIn : SOCIAL_UI.gateway.signIn,
        action: () => void handleSignInGoogle(),
        disabled: signingIn,
      };
    }

    // Paso 3: Gist social (si tenemos sesión pero no gist) - normalmente automático pero se puede forzar
    if (canConnectSocialGist) {
      return {
        icon: 'cloud-sync' as const,
        label: connecting ? SOCIAL_UI.gateway.creatingGist : SOCIAL_UI.gateway.createGist,
        action: () => void handleCreateSocialGist(),
        disabled: connecting,
      };
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
                  <button className="btn btn-secondary" type="button" onClick={() => navigate('/social')}>
                    <Icon name="arrow-right" />
                    {SOCIAL_UI.profile.toFeed}
                  </button>
                ) : null}
                <button className="btn btn-primary" type="button" disabled={savingProfile || hydratingProfile} onClick={handleSaveProfile}>
                  <Icon name="save" />
                  {savingProfile ? SOCIAL_UI.profile.saving : SOCIAL_UI.profile.save}
                </button>
              </div>
              <div className="social-screen-actions-right">
                <button className="btn btn-danger" type="button" onClick={handleSignOut}>
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

              <article className="social-profile-block">
                <h3>{SOCIAL_UI.profile.privacyTitle}</h3>
                <label className="social-profile-checkbox">
                  <input
                    type="checkbox"
                    checked={socialPrivate}
                    onChange={(event) => setSocialPrivate(event.target.checked)}
                  />
                  <span>{SOCIAL_UI.profile.privacyLabel}</span>
                </label>
                <p>{socialPrivate ? SOCIAL_UI.profile.privacyPrivate : SOCIAL_UI.profile.privacyPublic}</p>
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

              <SocialGameCardSelector
                title={SOCIAL_UI.profile.recommendationsTitle}
                description={SOCIAL_UI.profile.recommendationsDescription}
                searchPlaceholder={SOCIAL_UI.profile.recommendationsSearchPlaceholder}
                searchValue={recommendationSearch}
                selectedIds={recommendationGameIds}
                options={nonCompletedGames}
                emptyMessage={SOCIAL_UI.profile.searchEmpty}
                onSearchChange={setRecommendationSearch}
                onToggle={(id) => toggleGameInSet(id, recommendationGameIds, setRecommendationGameIds)}
              />
            </div>

            {hydratingProfile ? <p>{SOCIAL_UI.profile.hydrating}</p> : null}
            {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
          </div>
        </section>
      );
    }

    return (
      <section className="social-hub social-screen" aria-label="Social">
        <div className="social-hub-card social-screen-card social-feed-card-shell">
          <header className="social-screen-header">
            <div className="social-hub-title-wrap">
              <Icon name="bottom-hub" className="social-hub-icon" />
              <h2>{SOCIAL_UI.feed.title}</h2>
            </div>
            <p>{SOCIAL_UI.feed.subtitle}</p>
            <h3 className="social-feed-owner">{socialDisplayName}</h3>
          </header>

          <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del feed social">
            <div className="social-screen-actions-left">
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/social/profile')}>
                <Icon name="edit" />
                {SOCIAL_UI.feed.profile}
              </button>
              <button className="btn btn-secondary" type="button" disabled={loadingDirectory} onClick={() => void hydrateSocialDirectory()}>
                <Icon name="refresh" />
                {loadingDirectory ? SOCIAL_UI.feed.refreshing : SOCIAL_UI.feed.refresh}
              </button>
            </div>
            <div className="social-screen-actions-right">
              <button className="btn btn-danger" type="button" onClick={handleSignOut}>
                <Icon name="logout" />
                {SOCIAL_UI.feed.signOut}
              </button>
            </div>
          </div>

          <div className="social-feed-metrics" aria-label="Resumen del feed social">
            <article className="social-metric-card">
              <span>{SOCIAL_UI.feed.statsProfiles}</span>
              <strong>{feedStats.profiles}</strong>
            </article>
            <article className="social-metric-card">
              <span>{SOCIAL_UI.feed.statsFavorites}</span>
              <strong>{feedStats.favorites}</strong>
            </article>
            <article className="social-metric-card">
              <span>{SOCIAL_UI.feed.statsRecommendations}</span>
              <strong>{feedStats.recommendations}</strong>
            </article>
          </div>

          <div className="social-feed-toolbar" aria-label="Búsqueda y filtros del feed">
            <label className="social-feed-search">
              <span>{SOCIAL_UI.feed.searchLabel}</span>
              <input
                type="text"
                className="finput"
                value={feedSearch}
                placeholder={SOCIAL_UI.feed.searchPlaceholder}
                onChange={(event) => setFeedSearch(event.target.value)}
              />
            </label>
            <div className="social-feed-filters" role="tablist" aria-label="Filtro de perfiles">
              <button
                type="button"
                className={`social-filter-chip ${feedFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFeedFilter('all')}
              >
                {SOCIAL_UI.feed.filterAll}
              </button>
              <button
                type="button"
                className={`social-filter-chip ${feedFilter === 'favorites' ? 'is-active' : ''}`}
                onClick={() => setFeedFilter('favorites')}
              >
                {SOCIAL_UI.feed.filterFavorites}
              </button>
              <button
                type="button"
                className={`social-filter-chip ${feedFilter === 'recommendations' ? 'is-active' : ''}`}
                onClick={() => setFeedFilter('recommendations')}
              >
                {SOCIAL_UI.feed.filterRecommendations}
              </button>
            </div>
            <p className="social-feed-result-count">{SOCIAL_UI.feed.resultCount(filteredSocialDirectory.length)}</p>
          </div>

          <div className="fg">
            <span className="flabel">{SOCIAL_UI.feed.sectionTitle}</span>
            {loadingDirectory ? <p>{SOCIAL_UI.feed.loading}</p> : null}
            {!loadingDirectory && filteredSocialDirectory.length === 0 ? (
              <p>{SOCIAL_UI.feed.empty}</p>
            ) : null}
            {!loadingDirectory && filteredSocialDirectory.length > 0 ? (
              <div
                ref={feedRowRef}
                className={`social-feed-row ${isFeedDragging ? 'is-dragging' : ''}`}
                aria-label="Feed social"
                role="group"
                tabIndex={0}
                onMouseDown={handleFeedRowMouseDown}
                onKeyDown={handleFeedRowKeyDown}
              >
                {filteredSocialDirectory.map((entry) => (
                  <article key={entry.id} className="social-feed-card">
                    <header>
                      <h3>{entry.displayName}</h3>
                    </header>
                    <p>
                      {entry.favorites.length
                        ? `${SOCIAL_UI.feed.favoritesPrefix}${entry.favorites.join(', ')}`
                        : SOCIAL_UI.feed.noFavorites}
                    </p>
                    <p>
                      {entry.recommendations.length
                        ? `${SOCIAL_UI.feed.recommendationsPrefix}${entry.recommendations.join(', ')}`
                        : SOCIAL_UI.feed.noRecommendations}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
        </div>
      </section>
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
              <strong>{hasSocialGist ? SOCIAL_UI.gateway.stateLinked(socialCfgGistId) : SOCIAL_UI.gateway.stateNotLinked}</strong>
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

        {hasSocialGist ? <p>{SOCIAL_UI.gateway.gistActive(socialCfgGistId)}</p> : <p>{SOCIAL_UI.gateway.gistMissing}</p>}
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
});
