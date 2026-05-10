import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, ROUTE_TAB, SYNC_BADGE_TEXT, TAB_ROUTE } from './core/constants/labels';
import type { TabData, TabId } from './model/types/game';
import { ensureProfileByEmail, getCurrentSocialAuthUser } from './model/repository/firebaseRepository';
import { getSocialSyncConfig, readSocialGist, saveSocialSyncConfig, upsertRecommendationActivity, upsertReviewActivity, writeSocialGist } from './model/repository/gistRepository';
import { IconSprite } from './view/components/IconSprite';
import { Header } from './view/components/Header';
import { TabBar } from './view/components/TabBar';
import { Toolbar } from './view/components/Toolbar';
import { GameTable } from './view/components/GameTable';
import { StatusBanner } from './view/components/StatusBanner';
import { BottomNavigation, type AppSection } from './view/components/BottomNavigation';
import { SettingsHub } from './view/components/SettingsHub';
import { SocialHub } from './view/components/SocialHub';
import { useGameListViewModel } from './viewmodel/useGameListViewModel';
import { useSyncViewModel } from './viewmodel/useSyncViewModel';

const FormModal = lazy(() => import('./view/modals/FormModal').then((module) => ({ default: module.FormModal })));
const AdminModal = lazy(() => import('./view/modals/AdminModal').then((module) => ({ default: module.AdminModal })));
const SyncModal = lazy(() => import('./view/modals/SyncModal').then((module) => ({ default: module.SyncModal })));
const ConfirmModal = lazy(() => import('./view/modals/ConfirmModal').then((module) => ({ default: module.ConfirmModal })));
const RecommendationModal = lazy(() => import('./view/modals/RecommendationModal').then((module) => ({ default: module.RecommendationModal })));

function getCurrentTab(pathname: string): TabId {
  return ROUTE_TAB[pathname] || 'c';
}

function getCurrentSection(pathname: string): AppSection {
  if (pathname.startsWith('/social')) return 'social';
  if (pathname.startsWith('/ajustes')) return 'settings';
  return 'lists';
}

function isCompactFilters(): boolean {
  return window.innerWidth <= 1400;
}

function isCompactTable(): boolean {
  return window.innerWidth <= 1100;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = getCurrentTab(location.pathname);
  const activeSection = getCurrentSection(location.pathname);

  const vm = useGameListViewModel();
  const {
    setFilter,
    clearFilter,
    clearAllFilters,
    setExpandedId,
    setSyncModalOpen,
    setAdminModalOpen,
    openNewGame,
    setFormModalOpen,
    saveDraft,
    editingTab,
    setConfirmState,
    removeTagAcrossGames,
    renameTagAcrossGames,
    confirmState,
    persist,
    notify,
  } = vm;

  const syncVm = useSyncViewModel({
    getData: () => vm.data,
    setData: (next) => persist(next),
    getMeta: () => vm.meta,
    setMeta: vm.setMeta,
    onNotice: notify,
    persist,
  });

  const [showToken, setShowToken] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(isCompactFilters());
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendationGame, setRecommendationGame] = useState<{ id: number; name: string; score: number } | null>(null);
  const [recommendedGameIds, setRecommendedGameIds] = useState<number[]>([]);
  const resizeRafRef = useRef<number | null>(null);

  const tabFilter = vm.filters[currentTab];

  useEffect(() => {
    syncVm.initializeSync();
  }, []);

  useEffect(() => {
    setFilter(currentTab, 'search', '');
  }, [currentTab, setFilter]);

  /**
   * Carga los juegos recomendados del gist social para mostrar estado visual en el botón.
   */
  useEffect(() => {
    const loadRecommendedGames = async () => {
      try {
        const socialConfig = getSocialSyncConfig();
        if (!socialConfig?.token || !socialConfig.gistId) {
          setRecommendedGameIds([]);
          return;
        }

        const socialRead = await readSocialGist(
          socialConfig.token,
          socialConfig.gistId,
          socialConfig.etag || null,
        );

        const gameIds = socialRead.data.recommendations.map((rec) => rec.gameId);
        setRecommendedGameIds([...new Set(gameIds)]);
      } catch {
        setRecommendedGameIds([]);
      }
    };

    void loadRecommendedGames();
  }, []);

  useEffect(() => {
    const applyLayoutFlags = () => {
      const nextCompactFilters = isCompactFilters();
      const nextCompactTable = isCompactTable();

      setCompactFilters((prev) => (prev === nextCompactFilters ? prev : nextCompactFilters));
      if (!nextCompactFilters) {
        setFiltersOpen((prev) => (prev ? false : prev));
      }

      document.body.classList.toggle('compact-filters', nextCompactFilters);
      document.body.classList.toggle('table-compact', nextCompactTable);
    };

    const onResize = () => {
      if (resizeRafRef.current !== null) {
        return;
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null;
        applyLayoutFlags();
      });
    };

    applyLayoutFlags();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const list = useMemo(() => vm.getFilteredList(currentTab), [currentTab, vm.data, vm.filters, vm.sort]);
  const activeFilterCount = useMemo(() => {
    const count =
      (tabFilter.search.trim() ? 1 : 0) +
      (tabFilter.genre ? 1 : 0) +
      (tabFilter.platform ? 1 : 0) +
      (tabFilter.score ? 1 : 0) +
      (tabFilter.hours ? 1 : 0) +
      (tabFilter.only ? 1 : 0) +
      (tabFilter.deck ? 1 : 0);
    return count;
  }, [tabFilter]);

  const exportData = useCallback(() => {
    const payload = {
      c: vm.data.c,
      v: vm.data.v,
      e: vm.data.e,
      p: vm.data.p,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'myGames.json';
    a.click();
    URL.revokeObjectURL(href);
  }, [vm.data.c, vm.data.v, vm.data.e, vm.data.p]);

  const importData = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Partial<TabData>;
      persist({
        c: payload.c || [],
        v: payload.v || [],
        e: payload.e || [],
        p: payload.p || [],
        deleted: payload.deleted || [],
        updatedAt: payload.updatedAt || Date.now(),
      });
      notify('ok', 'Datos importados correctamente');
    } catch {
      notify('err', 'Archivo JSON no válido');
    }
  }, [notify, persist]);

  const handleFiltersToggle = useCallback(() => {
    setFiltersOpen((prev) => !prev);
  }, []);

  const handleFilterChange = useCallback((key: keyof typeof tabFilter, value: string | boolean) => {
    setFilter(currentTab, key, value);
  }, [currentTab, setFilter]);

  const handleClearFilter = useCallback((key: keyof typeof tabFilter) => {
    clearFilter(currentTab, key);
  }, [clearFilter, currentTab]);

  const handleClearAllFilters = useCallback(() => {
    clearAllFilters(currentTab);
  }, [clearAllFilters, currentTab]);

  const handleTabChange = useCallback((tab: TabId) => {
    navigate(TAB_ROUTE[tab]);
    setExpandedId(null);
  }, [navigate, setExpandedId]);

  const handleSectionChange = useCallback((section: AppSection) => {
    setExpandedId(null);
    if (section !== 'lists') {
      setFiltersOpen(false);
    }

    if (section === 'lists') {
      navigate('/completados');
      return;
    }

    if (section === 'social') {
      navigate('/social');
      return;
    }

    navigate('/ajustes');
  }, [navigate, setExpandedId]);

  const handleOpenSync = useCallback(() => {
    setSyncModalOpen(true);
  }, [setSyncModalOpen]);

  const handleOpenAdmin = useCallback(() => {
    setAdminModalOpen(true);
  }, [setAdminModalOpen]);

  const handleAddGame = useCallback(() => {
    openNewGame(currentTab);
  }, [currentTab, openNewGame]);

  const handleCloseFormModal = useCallback(() => {
    setFormModalOpen(false);
  }, [setFormModalOpen]);

  const publishReviewActivity = useCallback(async (input: { id: number; name: string; review: string; score: number }) => {
    const authUser = await getCurrentSocialAuthUser();
    if (!authUser) {
      return;
    }

    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token || !socialConfig.gistId) {
      return;
    }

    const socialRead = await readSocialGist(
      socialConfig.token,
      socialConfig.gistId,
      socialConfig.etag || null,
    );

    const now = Date.now();
    const nextPayload = upsertReviewActivity(socialRead.data, {
      actorUid: authUser.uid,
      actorName: authUser.displayName || authUser.email,
      gameId: input.id,
      gameName: input.name,
      reviewText: input.review,
      rating: input.score,
      timestamp: now,
    });

    const writeResult = await writeSocialGist(socialConfig.token, socialConfig.gistId, nextPayload);

    saveSocialSyncConfig({
      token: socialConfig.token,
      gistId: socialConfig.gistId,
      etag: writeResult.etag || socialConfig.etag || null,
      lastRemoteUpdatedAt: now,
    });

    await ensureProfileByEmail({
      user: authUser,
      socialGistId: socialConfig.gistId,
      socialGistEtag: writeResult.etag || socialConfig.etag || null,
      preferredName: authUser.displayName || authUser.email,
    });
  }, []);

  const handleSaveDraft = useCallback((nextDraft: typeof vm.draft) => {
    const predictedId =
      nextDraft.id ||
      Math.max(
        0,
        ...['c', 'v', 'e', 'p'].flatMap((tab) => vm.data[tab as TabId].map((item) => item.id)),
      ) + 1;

    const previousGame = [...vm.data.c, ...vm.data.v, ...vm.data.e, ...vm.data.p].find((entry) => entry.id === predictedId);
    const cleanReview = nextDraft.review.trim();
    const nextScore = Number(nextDraft.score || 0);

    saveDraft(editingTab, nextDraft);

    if (editingTab === 'p' || !cleanReview) {
      return;
    }

    const reviewChanged = (previousGame?.review || '').trim() !== cleanReview;
    const scoreChanged = Number(previousGame?.score || 0) !== nextScore;
    const nameChanged = (previousGame?.name || '').trim() !== nextDraft.name.trim();

    if (!reviewChanged && !scoreChanged && !nameChanged) {
      return;
    }

    void publishReviewActivity({
      id: predictedId,
      name: nextDraft.name.trim(),
      review: cleanReview,
      score: nextScore,
    }).catch(() => {
      notify('warn', 'Juego guardado, pero no se pudo actualizar la actividad social de reseña.');
    });
  }, [editingTab, notify, publishReviewActivity, saveDraft, vm.data]);

  const handleCloseAdmin = useCallback(() => {
    setAdminModalOpen(false);
  }, [setAdminModalOpen]);

  const handleEditTag = useCallback((key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', oldValue: string, newValue: string) => {
    renameTagAcrossGames(key, oldValue, newValue);
  }, [renameTagAcrossGames]);

  const handleDeleteTag = useCallback((key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', value: string) => {
    setConfirmState({
      title: DIALOG_MESSAGES.deleteTagTitle(value),
      action: () => removeTagAcrossGames(key, value),
    });
  }, [removeTagAcrossGames, setConfirmState]);

  const handleCloseSync = useCallback(() => {
    setSyncModalOpen(false);
  }, [setSyncModalOpen]);

  const handleToggleShowToken = useCallback(() => {
    setShowToken((prev) => !prev);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    setConfirmState(null);
  }, [setConfirmState]);

  const handleConfirmDelete = useCallback(() => {
    const pending = confirmState;
    if (pending) {
      pending.action();
    }
    setConfirmState(null);
  }, [confirmState, setConfirmState]);

  const handleRecommendGame = useCallback((game: { id: number; name: string; score?: number }) => {
    setRecommendationGame({
      id: game.id,
      name: game.name,
      score: Number(game.score || 0),
    });
    setRecommendationOpen(true);
  }, []);

  const handleSendRecommendation = useCallback(async () => {
    const authUser = await getCurrentSocialAuthUser();
    if (!authUser) {
      throw new Error('No hay sesión de usuario para enviar recomendación. Inicia sesión en Social primero.');
    }

    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token || !socialConfig.gistId) {
      throw new Error('No hay gist social conectado. Configura Social primero.');
    }

    const game = recommendationGame;
    if (!game) {
      throw new Error('No hay juego seleccionado para recomendar');
    }

    try {
      const socialRead = await readSocialGist(
        socialConfig.token,
        socialConfig.gistId,
        socialConfig.etag || null,
      );

      const now = Date.now();
      const nextPayload = upsertRecommendationActivity(socialRead.data, {
        actorUid: authUser.uid,
        actorName: authUser.displayName || authUser.email,
        gameId: game.id,
        gameName: game.name,
        rating: game.score,
        timestamp: now,
      });

      const writeResult = await writeSocialGist(socialConfig.token, socialConfig.gistId, nextPayload);

      saveSocialSyncConfig({
        token: socialConfig.token,
        gistId: socialConfig.gistId,
        etag: writeResult.etag || socialConfig.etag || null,
        lastRemoteUpdatedAt: now,
      });

      // Mantener el perfil social descubrible por otras cuentas en el feed.
      await ensureProfileByEmail({
        user: authUser,
        socialGistId: socialConfig.gistId,
        socialGistEtag: writeResult.etag || socialConfig.etag || null,
        preferredName: authUser.displayName || authUser.email,
      });

      // Actualizar lista de recomendados para UI
      setRecommendedGameIds((prev) => 
        prev.includes(game.id) ? prev.filter((id) => id !== game.id) : [...prev, game.id]
      );

      notify('ok', `Recomendación de "${game.name}" publicada en tu gist social`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      notify('err', `Error al enviar recomendación: ${msg}`);
      throw error;
    }
  }, [recommendationGame, notify]);

  const handleCloseRecommendationModal = useCallback(() => {
    setRecommendationOpen(false);
    setRecommendationGame(null);
  }, []);

  const syncBadgeText = SYNC_BADGE_TEXT[syncVm.status] || SYNC_BADGE_TEXT.idle;

  return (
    <>
      <IconSprite />
      <Header
        sectionLabel={
          activeSection === 'lists'
            ? 'Listados'
            : activeSection === 'social'
              ? 'Social'
              : 'Ajustes'
        }
      />
      {activeSection === 'lists' ? <TabBar currentTab={currentTab} tabCounts={vm.tabCounts} onTabChange={handleTabChange} /> : null}
      <StatusBanner notice={vm.notice} remoteChangesApplied={syncVm.lastRemoteChangesApplied} />
      <main
        className={`main ${
          activeSection === 'lists'
            ? 'main-lists'
            : activeSection === 'social'
              ? 'main-social'
              : 'main-settings'
        }`.trim()}
      >
        {activeSection === 'lists' ? (
          <>
            <Toolbar
              currentTab={currentTab}
              filters={tabFilter}
              lookups={vm.lookups}
              activeFilterCount={activeFilterCount}
              compactFilters={compactFilters}
              filtersOpen={filtersOpen}
              onFiltersToggle={handleFiltersToggle}
              onFilterChange={handleFilterChange}
              onClearFilter={handleClearFilter}
              onClearAll={handleClearAllFilters}
            />
            <GameTable
              games={list}
              currentTab={currentTab}
              expandedId={vm.expandedId}
              onExpandedChange={setExpandedId}
              onEdit={vm.openEditGame}
              onDelete={vm.deleteGame}
              onMigrate={vm.migrateGame}
              onRecommend={handleRecommendGame}
              recommendedGameIds={recommendedGameIds}
              tabActions={vm.tabActions[currentTab]}
            />
          </>
        ) : activeSection === 'social' ? (
          <SocialHub />
        ) : (
          <SettingsHub
            syncStatus={syncBadgeText}
            onOpenSync={handleOpenSync}
            onExport={exportData}
            onImport={importData}
            onOpenAdmin={handleOpenAdmin}
          />
        )}
      </main>

      {activeSection === 'lists' ? (
        <button className="fab" type="button" aria-label="Añadir juego" onClick={handleAddGame}>
          <svg aria-hidden="true">
            <use href="#icon-plus" />
          </svg>
        </button>
      ) : null}

      <BottomNavigation currentSection={activeSection} onSectionChange={handleSectionChange} />

      <Suspense fallback={null}>
        <FormModal
          open={vm.formModalOpen}
          draft={vm.draft}
          currentTab={vm.editingTab}
          lookups={vm.lookups}
          onClose={handleCloseFormModal}
          onDraftChange={vm.setDraft}
          onSave={handleSaveDraft}
          onNotice={vm.notify}
        />

        <AdminModal
          open={vm.adminModalOpen}
          adminTab={vm.adminTab}
          lookups={vm.lookups}
          onClose={handleCloseAdmin}
          onTabChange={vm.setAdminTab}
          onEdit={handleEditTag}
          onDelete={handleDeleteTag}
        />

        <SyncModal
          open={vm.syncModalOpen}
          status={syncVm.status}
          hasConfig={syncVm.hasConfig}
          connectedGistId={syncVm.connectedGistId || syncVm.currentConfig?.gistId || ''}
          token={syncVm.token}
          gistId={syncVm.gistId}
          statusMessage={syncVm.statusMessage}
          showToken={showToken}
          onClose={handleCloseSync}
          onTokenChange={syncVm.setToken}
          onGistIdChange={syncVm.setGistId}
          onShowTokenToggle={handleToggleShowToken}
          onConnect={syncVm.connectSync}
          onDisconnect={syncVm.disconnectSync}
          onSyncNow={syncVm.syncNow}
        />

        <ConfirmModal
          open={!!vm.confirmState}
          title={vm.confirmState?.title || ''}
          onCancel={handleConfirmCancel}
          onConfirm={handleConfirmDelete}
        />

        <RecommendationModal
          open={recommendationOpen}
          game={recommendationGame}
          currentUserName={'Jugador'}
          onClose={handleCloseRecommendationModal}
          onSend={handleSendRecommendation}
        />
      </Suspense>

      <datalist id="dl-genres">
        {vm.lookups.genres.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id="dl-platforms">
        {vm.lookups.platforms.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id="dl-strengths">
        {vm.lookups.strengths.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id="dl-weaknesses">
        {vm.lookups.weaknesses.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>

      <Routes>
        <Route path="/completados" element={null} />
        <Route path="/visitados" element={null} />
        <Route path="/en-curso" element={null} />
        <Route path="/proximos" element={null} />
        <Route path="/social" element={null} />
        <Route path="/social/profile" element={null} />
        <Route path="/social/profiles/:profileId" element={null} />
        <Route path="/social/user/:userId/game/:gameId/:eventType" element={null} />
        <Route path="/ajustes" element={null} />
        <Route path="*" element={<Navigate to="/completados" replace />} />
      </Routes>
    </>
  );
}
