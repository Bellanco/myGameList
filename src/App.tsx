import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, ROUTE_TAB, SYNC_BADGE_TEXT, SYNC_MESSAGES, TAB_ROUTE, TAB_TITLES } from './core/constants/labels';
import { TAB_IDS, type TabData, type TabId } from './model/types/game';
import { resolveGrade } from './core/utils/scoreScale';
import { publishReviewActivity, unpublishReviewActivity } from './model/repository/socialPublishRepository';
import { normalizeData } from './model/repository/localRepository';
import { IconSprite } from './view/components/IconSprite';
import { FloatingControls } from './view/components/FloatingControls';
import { TabBar } from './view/components/TabBar';
import { Toolbar } from './view/components/Toolbar';
import { GameTable } from './view/components/GameTable';
import { StatusBanner } from './view/components/StatusBanner';
import { BottomNavigation, type AppSection } from './view/components/BottomNavigation';
import { useGameListViewModel } from './viewmodel/useGameListViewModel';
import { useToolbarFilters } from './viewmodel/useToolbarFilters';
import { computeTabOptions, countActiveFilters } from './viewmodel/toolbarFilters';
import { useSyncViewModel } from './viewmodel/useSyncViewModel';
import { useScoreScaleSession } from './view/hooks/useScoreScaleSession';
import { useAppearanceSession } from './view/hooks/useAppearanceSession';
import { useUppercase } from './view/hooks/useUppercase';
import { useShowSteamButton } from './view/hooks/useShowSteamButton';
import { hasGithubOAuthRedirect } from './model/repository/githubOAuthRepository';
import { buildListsPool, buildListsWeigher } from './core/roulette/roulette';

const FormModal = lazy(() => import('./view/modals/FormModal').then((module) => ({ default: module.FormModal })));
const ConfirmModal = lazy(() => import('./view/modals/ConfirmModal').then((module) => ({ default: module.ConfirmModal })));
const SettingsHub = lazy(() => import('./view/components/SettingsHub').then((module) => ({ default: module.SettingsHub })));
const SocialHub = lazy(() => import('./view/components/SocialHub').then((module) => ({ default: module.SocialHub })));
const AccountHub = lazy(() => import('./view/components/AccountHub').then((module) => ({ default: module.AccountHub })));
const RouletteModal = lazy(() => import('./view/components/roulette/RouletteModal').then((module) => ({ default: module.RouletteModal })));

function getCurrentTab(pathname: string): TabId {
  return ROUTE_TAB[pathname] || 'c';
}

function getCurrentSection(pathname: string): AppSection {
  if (pathname.startsWith('/social')) return 'social';
  if (pathname.startsWith('/ajustes')) return 'settings';
  if (pathname.startsWith('/cuenta')) return 'account';
  return 'lists';
}

function isCompactFilters(): boolean {
  return window.innerWidth <= 1400;
}

function isCompactTable(): boolean {
  return window.innerWidth <= 1100;
}

// Rutas VÁLIDAS de la app. El `<Route path="*">` redirige a /completados cualquier ruta no listada aquí, así que
// TODA pantalla nueva (incl. las sub-rutas sociales de useSocialViewModel) debe añadirse a esta lista o quedará
// inaccesible (rebotaría a completados). Exportada para el test de regresión de rutas.
export const APP_ROUTE_PATHS = [
  '/completados',
  '/visitados',
  '/en-curso',
  '/proximos',
  '/social',
  '/social/profile',
  '/social/profiles',
  '/social/profiles/:profileId',
  '/social/profiles/:profileId/reviews',
  '/social/profiles/:profileId/game/:gameId/review',
  '/social/requests',
  '/social/user/:userId/game/:gameId/:eventType',
  '/ajustes',
  '/cuenta',
] as const;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = getCurrentTab(location.pathname);
  const activeSection = getCurrentSection(location.pathname);

  const vm = useGameListViewModel();
  // F2: enlaza la sesión de Google con la escala de puntuación (hidrata desde Firestore / resetea al salir);
  // devuelve el uid para gatear la opción en Ajustes. Se monta aquí para que la escala esté en toda la app.
  const { uid: scoreScaleUid, ready: authReady } = useScoreScaleSession();
  // F1: enlaza la sesión con la apariencia (paleta + claro/oscuro) → hidrata/replica en Firestore.
  useAppearanceSession();
  // F1: aplica la preferencia de caja (mayúsculas) al <html> app-wide y reacciona a la hidratación.
  useUppercase();
  // F1: visibilidad del botón "Steam Deck" (preferencia de cuenta) → se pasa a la Toolbar.
  const { showSteamButton } = useShowSteamButton();

  // La pantalla "Cuenta" solo existe con sesión de Google (todos sus ajustes la requieren). Si se llega a
  // `/cuenta` sin sesión (URL directa) o se cierra sesión estando allí, se redirige a la lista. Se espera a
  // `authReady` para no expulsar a un usuario logueado durante la resolución inicial de la sesión.
  useEffect(() => {
    if (authReady && !scoreScaleUid && activeSection === 'account') {
      navigate('/completados', { replace: true });
    }
  }, [authReady, scoreScaleUid, activeSection, navigate]);
  const { filters, setFilter, toggleFilterValue, clearFilter, clearAllFilters } = useToolbarFilters();
  const {
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
    persistFromSync,
    notify,
  } = vm;

  // El sync lee el estado local vía refs (no closures del render) para que un ciclo EN VUELO vea las
  // ediciones confirmadas mientras estaba esperando la red. Con `() => vm.data` un ciclo iniciado antes
  // de una edición leía la foto vieja y, al fusionar/persistir, revertía la edición y limpiaba dirty
  // (pérdida de datos silenciosa). Mismo patrón que el `metaRef` interno de useGameListViewModel.
  const dataRef = useRef(vm.data);
  dataRef.current = vm.data;
  const metaRef = useRef(vm.meta);
  metaRef.current = vm.meta;

  // C1: el ciclo de sync persiste SIN marcar dirty (aplica merge/resultado remoto, no es edición de usuario).
  const syncVm = useSyncViewModel({
    getData: () => dataRef.current,
    setData: (next) => persistFromSync(next),
    getMeta: () => metaRef.current,
    setMeta: vm.setMeta,
    onNotice: notify,
    persist: persistFromSync,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(isCompactFilters());
  const resizeRafRef = useRef<number | null>(null);

  const tabFilter = filters;
  const tabOptions = useMemo(() => computeTabOptions(vm.data[currentTab]), [vm.data, currentTab]);

  const [rouletteOpen, setRouletteOpen] = useState(false);
  const roulettePool = useMemo(() => buildListsPool(vm.data), [vm.data]);
  const rouletteWeight = useMemo(() => buildListsWeigher(vm.data), [vm.data]);

  useEffect(() => {
    // Si volvemos del "Conectar con GitHub" (OAuth), completamos ese flujo; si no, arrancamos el sync normal.
    if (hasGithubOAuthRedirect()) {
      void syncVm.completeGithubLoginFromRedirect();
    } else {
      syncVm.initializeSync();
    }
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

  // P2: `getFilteredList` ya está memoizado sobre data/filters/sort; basta con depender de la propia función
  // (cambia cuando cambian esos inputs) y de la pestaña, en vez de re-listar sus internals.
  const list = useMemo(() => vm.getFilteredList(currentTab, filters), [vm.getFilteredList, currentTab, filters]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

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

  const importData = useCallback(async (file: File, overwrite = false) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Partial<TabData>;
      const nextData: TabData = {
        c: payload.c || [],
        v: payload.v || [],
        e: payload.e || [],
        p: payload.p || [],
        deleted: payload.deleted || [],
        updatedAt: Date.now(),
      };
      const normalizedData = normalizeData(nextData, { forceTimestamp: true });
      normalizedData.updatedAt = Date.now();

      persist(normalizedData);

      if (overwrite) {
        const overwritten = await syncVm.overwriteRemoteData(normalizedData);
        if (overwritten) {
          notify('ok', 'Datos importados y Gist sobrescrito correctamente');
          return;
        }
        notify('warn', 'Datos importados localmente, pero no hay Gist configurado para sobrescribir.');
        return;
      }

      notify('ok', 'Datos importados correctamente');
    } catch {
      notify('err', 'Archivo JSON no válido');
    }
  }, [notify, persist, syncVm]);

  const handleFiltersToggle = useCallback(() => {
    setFiltersOpen((prev) => !prev);
  }, []);

  const handleFilterChange = useCallback((key: keyof typeof tabFilter, value: string | boolean) => {
    setFilter(key, value);
  }, [setFilter]);

  const handleToggleValue = useCallback((key: 'genres' | 'platforms', value: string) => {
    toggleFilterValue(key, value);
  }, [toggleFilterValue]);

  const handleClearFilter = useCallback((key: keyof typeof tabFilter) => {
    clearFilter(key);
  }, [clearFilter]);

  const handleClearAllFilters = useCallback(() => {
    clearAllFilters();
  }, [clearAllFilters]);

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

    if (section === 'account') {
      navigate('/cuenta');
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

  // Destello de fila: id del juego recién guardado; se limpia tras la animación.
  const [recentlyChangedId, setRecentlyChangedId] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSaveDraft = useCallback((nextDraft: typeof vm.draft) => {
    const predictedId =
      nextDraft.id ||
      Math.max(
        0,
        ...TAB_IDS.flatMap((tab) => vm.data[tab].map((item) => item.id)),
      ) + 1;

    const previousGame = [...vm.data.c, ...vm.data.v, ...vm.data.e, ...vm.data.p].find((entry) => entry.id === predictedId);
    const cleanReview = nextDraft.review.trim();
    const nextScore = Number(nextDraft.score || 0);
    const nextGrade = resolveGrade(nextDraft); // nota fina 0–100 (real si la usa, si no derivada del score)

    saveDraft(editingTab, nextDraft);

    // Marca la fila guardada para el destello de localización (se limpia a los 1,4 s).
    setRecentlyChangedId(predictedId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setRecentlyChangedId(null), 1400);

    // Sin reseña publicable (pestaña 'próximos' o texto vacío): si el juego TENÍA una reseña, se retira del feed
    // para no dejar una entrada fantasma con el título/snippet viejos (p. ej. al vaciar el texto y renombrar). Si
    // nunca la tuvo, `unpublishReviewActivity` es un no-op (no reescribe el gist).
    if (editingTab === 'p' || !cleanReview) {
      const hadPublishedReview = (previousGame?.review || '').trim().length > 0;
      if (hadPublishedReview) {
        void unpublishReviewActivity({ id: predictedId }).catch(() => {
          notify('warn', 'Juego guardado, pero no se pudo actualizar la actividad social de reseña.');
        });
      }
      return;
    }

    const reviewChanged = (previousGame?.review || '').trim() !== cleanReview;
    const scoreChanged = Number(previousGame?.score || 0) !== nextScore;
    // La nota fina puede cambiar sin mover las estrellas (p. ej. 73→77 = 4★): también hay que sincronizarla.
    const gradeChanged = resolveGrade(previousGame || {}) !== nextGrade;
    const nameChanged = (previousGame?.name || '').trim() !== nextDraft.name.trim();

    if (!reviewChanged && !scoreChanged && !gradeChanged && !nameChanged) {
      return;
    }

    void publishReviewActivity({
      id: predictedId,
      name: nextDraft.name.trim(),
      review: cleanReview, // audit-allow: publishReviewActivity lo convierte a snippet antes de publicar
      score: nextScore, // audit-allow: el canal social publica solo rating redondeado
      grade: nextGrade, // nota fina 0–100 (misma nombre que en el listado)
      // Solo cambiar el texto (re)publica en el feed. Cambiar solo nota/nombre sincroniza una reseña YA
      // publicada sin recolocarla; si no había reseña publicada, publishReviewActivity es un no-op.
      reviewChanged,
    }).catch(() => {
      notify('warn', 'Juego guardado, pero no se pudo actualizar la actividad social de reseña.');
    });
  }, [editingTab, notify, saveDraft, vm.data]);

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
      <FloatingControls />
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
              options={tabOptions}
              activeFilterCount={activeFilterCount}
              compactFilters={compactFilters}
              filtersOpen={filtersOpen}
              onFiltersToggle={handleFiltersToggle}
              onFilterChange={handleFilterChange}
              onToggleValue={handleToggleValue}
              onClearFilter={handleClearFilter}
              onClearAll={handleClearAllFilters}
              showSteamButton={showSteamButton}
            />
            <GameTable
              games={list}
              currentTab={currentTab}
              expandedId={vm.expandedId}
              onExpandedChange={setExpandedId}
              onEdit={vm.openEditGame}
              onDelete={vm.deleteGame}
              onMigrate={vm.migrateGame}
              onAddGame={handleAddGame}
              tabActions={vm.tabActions[currentTab]}
              sort={vm.sort[currentTab]}
              onSort={vm.sortBy}
              recentlyChangedId={recentlyChangedId}
            />
          </>
        ) : activeSection === 'social' ? (
          <Suspense fallback={null}>
            <SocialHub
              onAddToProximos={vm.addGameToProximos}
              hasGameInLists={vm.hasGameInLists}
              moveGameToCurrentByName={vm.moveGameToCurrentByName}
            />
          </Suspense>
        ) : activeSection === 'account' ? (
          <Suspense fallback={null}>
            {scoreScaleUid ? <AccountHub scoreScaleUid={scoreScaleUid} /> : null}
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            <SettingsHub
              syncStatus={syncBadgeText}
              hasSyncConfig={syncVm.hasConfig}
              connectedGistId={syncVm.connectedGistId || syncVm.currentConfig?.gistId || ''}
              token={syncVm.token}
              gistId={syncVm.gistId}
              syncError={syncVm.statusMessage}
              recoveringGistId={syncVm.recoveringGistId}
              githubOAuthEnabled={syncVm.githubOAuthEnabled}
              githubLoggingIn={syncVm.githubLoggingIn}
              onGithubLogin={syncVm.beginGithubLogin}
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
          </Suspense>
        )}
      </main>

      {activeSection === 'lists' ? (
        <>
          <button
            className="fab-roulette"
            type="button"
            aria-label="Sortear próximo juego"
            onClick={() => setRouletteOpen(true)}
          >
            <svg className="ui-icon" aria-hidden="true">
              <use href="#icon-dice-d20" />
            </svg>
          </button>
          <button className="fab" type="button" aria-label="Añadir juego" onClick={handleAddGame}>
            <svg aria-hidden="true">
              <use href="#icon-plus" />
            </svg>
          </button>
        </>
      ) : null}

      <BottomNavigation currentSection={activeSection} onSectionChange={handleSectionChange} showAccount={scoreScaleUid !== null} />

      <Suspense fallback={null}>
        <FormModal
          open={vm.formModalOpen}
          draft={vm.draft}
          currentTab={vm.editingTab}
          lookups={vm.lookups}
          onClose={handleCloseFormModal}
          onSave={handleSaveDraft}
          onNotice={vm.notify}
        />

        <ConfirmModal
          open={!!vm.confirmState}
          title={vm.confirmState?.title || ''}
          onCancel={handleConfirmCancel}
          onConfirm={handleConfirmDelete}
        />

        <RouletteModal
          open={rouletteOpen}
          onClose={() => setRouletteOpen(false)}
          title="Elige tu próximo juego"
          candidates={roulettePool}
          weight={rouletteWeight}
          tag={(candidate) => TAB_TITLES[candidate.sourceTab]}
          action={() => ({
            btnClass: 'btn-complete',
            icon: 'play',
            label: 'Pasa a "En curso"',
            doneLabel: '✓ En curso',
            onAct: (candidate) => {
              vm.moveGameToTab(candidate.sourceTab, candidate.game.id, 'e');
            },
          })}
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
        {APP_ROUTE_PATHS.map((path) => (
          <Route key={path} path={path} element={null} />
        ))}
        <Route path="*" element={<Navigate to="/completados" replace />} />
      </Routes>
    </>
  );
}
