import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, ROUTE_TAB, SYNC_BADGE_TEXT, SYNC_MESSAGES, TAB_ROUTE } from './core/constants/labels';
import type { TabData, TabId } from './model/types/game';
import { ensureProfileByEmail, getCurrentSocialAuthUser } from './model/repository/firebaseRepository';
import { getSocialSyncConfig, readSocialGist, saveSocialSyncConfig, upsertReviewActivity, writeSocialGist } from './model/repository/gistRepository';
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
const ConfirmModal = lazy(() => import('./view/modals/ConfirmModal').then((module) => ({ default: module.ConfirmModal })));

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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(isCompactFilters());
  const resizeRafRef = useRef<number | null>(null);

  const tabFilter = vm.filters[currentTab];

  useEffect(() => {
    syncVm.initializeSync();
  }, []);

  useEffect(() => {
    setFilter(currentTab, 'search', '');
  }, [currentTab, setFilter]);

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
      githubToken: socialConfig.token,
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

  const handleEditTag = useCallback((key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', oldValue: string, newValue: string) => {
    renameTagAcrossGames(key, oldValue, newValue);
  }, [renameTagAcrossGames]);

  const handleDeleteTag = useCallback((key: 'genres' | 'platforms' | 'strengths' | 'weaknesses', value: string) => {
    setConfirmState({
      title: DIALOG_MESSAGES.deleteTagTitle(value),
      action: () => removeTagAcrossGames(key, value),
    });
  }, [removeTagAcrossGames, setConfirmState]);

  const handleCopyGistId = useCallback(async () => {
    const currentGistId = (syncVm.connectedGistId || syncVm.currentConfig?.gistId || syncVm.gistId || '').trim();
    if (!currentGistId) {
      notify('warn', SYNC_MESSAGES.copyMissing);
      return;
    }

    try {
      await navigator.clipboard.writeText(currentGistId);
      notify('ok', SYNC_MESSAGES.copySuccess);
    } catch {
      notify('err', SYNC_MESSAGES.copyError);
    }
  }, [notify, syncVm.connectedGistId, syncVm.currentConfig?.gistId, syncVm.gistId]);

  const handleRecoverGistId = useCallback(() => {
    void syncVm.recoverGistIdFromGoogle();
  }, [syncVm]);

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
              tabActions={vm.tabActions[currentTab]}
            />
          </>
        ) : activeSection === 'social' ? (
          <SocialHub />
        ) : (
          <SettingsHub
            syncStatus={syncBadgeText}
            hasSyncConfig={syncVm.hasConfig}
            connectedGistId={syncVm.connectedGistId || syncVm.currentConfig?.gistId || ''}
            token={syncVm.token}
            gistId={syncVm.gistId}
            syncError={syncVm.statusMessage}
            recoveringGistId={syncVm.recoveringGistId}
            onTokenChange={syncVm.setToken}
            onGistIdChange={syncVm.setGistId}
            onConnectSync={syncVm.connectSync}
            onSyncNow={syncVm.syncNow}
            onDisconnectSync={syncVm.disconnectSync}
            onCopyGistId={handleCopyGistId}
            onRecoverGistId={handleRecoverGistId}
            onExport={exportData}
            onImport={importData}
            lookups={vm.lookups}
            onEditTag={handleEditTag}
            onDeleteTag={handleDeleteTag}
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

        <ConfirmModal
          open={!!vm.confirmState}
          title={vm.confirmState?.title || ''}
          onCancel={handleConfirmCancel}
          onConfirm={handleConfirmDelete}
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
