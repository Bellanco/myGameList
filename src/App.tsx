import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, ROUTE_TAB, SYNC_BADGE_TEXT, TAB_ROUTE } from './core/constants/labels';
import type { TabData, TabId } from './model/types/game';
import { IconSprite } from './view/components/IconSprite';
import { Header } from './view/components/Header';
import { TabBar } from './view/components/TabBar';
import { Toolbar } from './view/components/Toolbar';
import { GameTable } from './view/components/GameTable';
import { StatusBanner } from './view/components/StatusBanner';
import { FormModal } from './view/modals/FormModal';
import { AdminModal } from './view/modals/AdminModal';
import { SyncModal } from './view/modals/SyncModal';
import { ConfirmModal } from './view/modals/ConfirmModal';
import { useGameListViewModel } from './viewmodel/useGameListViewModel';
import { useSyncViewModel } from './viewmodel/useSyncViewModel';

function getCurrentTab(pathname: string): TabId {
  return ROUTE_TAB[pathname] || 'c';
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

  const vm = useGameListViewModel();
  const syncVm = useSyncViewModel({
    getData: () => vm.data,
    setData: (next) => vm.persist(next),
    getMeta: () => vm.meta,
    setMeta: vm.setMeta,
    onNotice: vm.notify,
    persist: vm.persist,
  });

  const [showToken, setShowToken] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(isCompactFilters());

  const tabFilter = vm.filters[currentTab];

  useEffect(() => {
    syncVm.initializeSync();
  }, []);

  useEffect(() => {
    vm.setFilter(currentTab, 'search', '');
  }, [currentTab]);

  useEffect(() => {
    const onResize = () => {
      const nextCompactFilters = isCompactFilters();
      const nextCompactTable = isCompactTable();
      setCompactFilters(nextCompactFilters);
      if (!nextCompactFilters) {
        setFiltersOpen(false);
      }
      document.body.classList.toggle('compact-filters', nextCompactFilters);
      document.body.classList.toggle('table-compact', nextCompactTable);
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  const exportData = () => {
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
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Partial<TabData>;
      vm.persist({
        c: payload.c || [],
        v: payload.v || [],
        e: payload.e || [],
        p: payload.p || [],
        deleted: payload.deleted || [],
        updatedAt: payload.updatedAt || Date.now(),
      });
      vm.notify('ok', 'Datos importados correctamente');
    } catch {
      vm.notify('err', 'Archivo JSON no válido');
    }
  };

  const syncBadgeText = SYNC_BADGE_TEXT[syncVm.status] || SYNC_BADGE_TEXT.idle;

  return (
    <>
      <IconSprite />
      <Header
        syncStatus={syncBadgeText}
        onExport={exportData}
        onImport={importData}
        onOpenSync={() => vm.setSyncModalOpen(true)}
        onOpenAdmin={() => vm.setAdminModalOpen(true)}
      />
      <TabBar currentTab={currentTab} tabCounts={vm.tabCounts} onTabChange={(tab) => {
        navigate(TAB_ROUTE[tab]);
        vm.setExpandedId(null);
      }} />
      <StatusBanner notice={vm.notice} />
      <main className="main">
        <Toolbar
          currentTab={currentTab}
          filters={tabFilter}
          lookups={vm.lookups}
          activeFilterCount={activeFilterCount}
          compactFilters={compactFilters}
          filtersOpen={filtersOpen}
          onFiltersToggle={() => setFiltersOpen((prev) => !prev)}
          onFilterChange={(key, value) => vm.setFilter(currentTab, key, value)}
          onClearFilter={(key) => vm.clearFilter(currentTab, key)}
          onClearAll={() => vm.clearAllFilters(currentTab)}
        />
        <GameTable
          games={list}
          currentTab={currentTab}
          expandedId={vm.expandedId}
          onExpandedChange={vm.setExpandedId}
          onEdit={vm.openEditGame}
          onDelete={vm.deleteGame}
          onMigrate={vm.migrateGame}
          tabActions={vm.tabActions[currentTab]}
        />
      </main>

      <button className="fab" type="button" aria-label="Añadir juego" onClick={() => vm.openNewGame(currentTab)}>
        <svg aria-hidden="true">
          <use href="#icon-plus" />
        </svg>
      </button>

      <FormModal
        open={vm.formModalOpen}
        draft={vm.draft}
        currentTab={vm.editingTab}
        lookups={vm.lookups}
        onClose={() => vm.setFormModalOpen(false)}
        onDraftChange={vm.setDraft}
        onSave={(nextDraft) => vm.saveDraft(vm.editingTab, nextDraft)}
        onNotice={vm.notify}
      />

      <AdminModal
        open={vm.adminModalOpen}
        adminTab={vm.adminTab}
        lookups={vm.lookups}
        onClose={() => vm.setAdminModalOpen(false)}
        onTabChange={vm.setAdminTab}
        onEdit={(key, oldValue, newValue) => vm.renameTagAcrossGames(key, oldValue, newValue)}
        onDelete={(key, value) => {
          vm.setConfirmState({
            title: DIALOG_MESSAGES.deleteTagTitle(value),
            action: () => vm.removeTagAcrossGames(key, value),
          });
        }}
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
        onClose={() => vm.setSyncModalOpen(false)}
        onTokenChange={syncVm.setToken}
        onGistIdChange={syncVm.setGistId}
        onShowTokenToggle={() => setShowToken((prev) => !prev)}
        onConnect={syncVm.connectSync}
        onDisconnect={syncVm.disconnectSync}
        onSyncNow={syncVm.syncNow}
      />

      <ConfirmModal
        open={!!vm.confirmState}
        title={vm.confirmState?.title || ''}
        onCancel={() => vm.setConfirmState(null)}
        onConfirm={() => {
          const pending = vm.confirmState;
          if (pending) {
            pending.action();
          }
          vm.setConfirmState(null);
        }}
      />

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
        <Route path="*" element={<Navigate to="/completados" replace />} />
      </Routes>
    </>
  );
}
