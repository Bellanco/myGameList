import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIALOG_MESSAGES, ROUTE_TAB, SYNC_BADGE_TEXT, SYNC_MESSAGES, TAB_ROUTE, TAB_TITLES, UI_MESSAGES } from './core/constants/labels';
import { LEGAL_ROUTES, type LegalDocId } from './core/constants/legal';
import { TAB_IDS, type TabData, type TabId } from './model/types/game';
import { resolveGrade } from './core/utils/scoreScale';
import { normalizeData } from './model/repository/localRepository';
import { patchLocalMeta } from './model/repository/indexedDbRepository';
import { IconSprite } from './view/components/IconSprite';
import { FloatingControls } from './view/components/FloatingControls';
import { TabBar } from './view/components/TabBar';
import { Toolbar } from './view/components/Toolbar';
import { GameTable } from './view/components/GameTable';
import { StatusBanner } from './view/components/StatusBanner';
import { UpdateNotice } from './view/components/UpdateNotice';
import { BottomNavigation } from './view/components/BottomNavigation';
import { APP_ROUTES, FALLBACK_ROUTE, matchAppSection, type AppSection } from './core/constants/routes';
import { ScrollToTop } from './view/components/ScrollToTop';
import { ConsentBanner } from './view/components/ConsentBanner';
import { SocialHubSkeleton } from './view/components/SocialHubSkeleton';
import { useGameListViewModel } from './viewmodel/useGameListViewModel';
import { useToolbarFilters } from './viewmodel/useToolbarFilters';
import { computeTabOptions, countActiveFilters } from './viewmodel/toolbarFilters';
import { useSyncViewModel } from './viewmodel/useSyncViewModel';
import { useScoreScaleSession } from './view/hooks/useScoreScaleSession';
import { useSocialProfileSession } from './view/hooks/useSocialProfileSession';
import { useAppearanceSession } from './view/hooks/useAppearanceSession';
import { useUppercase } from './view/hooks/useUppercase';
import { useEffects } from './view/hooks/useEffects';
import { useShowSteamButton } from './view/hooks/useShowSteamButton';
import { useLegacyProfileHeal } from './view/hooks/useLegacyProfileHeal';
import { useShootingStars } from './view/hooks/useShootingStars';
import { useBacklogSnapshot } from './view/hooks/useBacklogSnapshot';
import { useSignatureEffects } from './view/hooks/useSignatureEffects';
import { useAppliedPalette } from './view/hooks/usePalette';
import { hasGithubOAuthRedirect } from './model/repository/githubOAuthRepository';
import { buildListsPool, buildListsWeigher, normalizeName } from './core/roulette/roulette';
import { useImportInbox } from './viewmodel/useImportInbox';
import { useImportFieldPrefs } from './viewmodel/useImportFieldPrefs';
import { useMountedOnceOpen } from './view/modals/useMountedOnceOpen';
import { runWhenIdle } from './core/utils/idle';
import { parseLibraryExporter } from './core/import/libraryExporter';
import { carryStamps } from './core/utils/gameStamps';
import { importedToPartialGame, mergeImportedIntoGame } from './core/import/staging';
import type { ImportedGame, RawExternalGame } from './model/types/import';

/**
 * Marca que una publicación de actividad social se ha perdido, para que la reconciliación del hub la recupere.
 * Se escribe aquí directamente (no vía `socialActivityReconcile`) porque el fallo que se está tratando puede
 * ser precisamente el del import dinámico de ese módulo.
 */
function markPendingSocialActivityFailure(): void {
  void patchLocalMeta({ pendingSocialActivity: true }).catch(() => {
    /* best-effort: no puede romper el guardado del juego. */
  });
}

// Los tres modales se montan solo tras su primera apertura (ver `useMountedOnceOpen`), así que sus chunks ya no
// entran en el arranque. Para que abrir siga siendo instantáneo, se precargan en idle: `import()` es idempotente
// —devuelve el módulo ya cacheado—, de modo que cuando `lazy` lo pida el trabajo estará hecho.
const importFormModal = () => import('./view/modals/FormModal');
const importConfirmModal = () => import('./view/modals/ConfirmModal');
const importRouletteModal = () => import('./view/components/roulette/RouletteModal');

const FormModal = lazy(() => importFormModal().then((module) => ({ default: module.FormModal })));
const ConfirmModal = lazy(() => importConfirmModal().then((module) => ({ default: module.ConfirmModal })));
const SettingsHub = lazy(() => import('./view/components/SettingsHub').then((module) => ({ default: module.SettingsHub })));
const SocialHub = lazy(() => import('./view/components/SocialHub').then((module) => ({ default: module.SocialHub })));
// Panel "Perfil" (estadísticas). Perezoso como el resto de hubs: su código y su hoja de estilos solo se
// descargan al entrar en la pestaña, así que no pesan en el arranque de los listados.
const StatsHub = lazy(() => import('./view/components/stats/StatsHub').then((module) => ({ default: module.StatsHub })));
const AccountHub = lazy(() => import('./view/components/AccountHub').then((module) => ({ default: module.AccountHub })));
const RouletteModal = lazy(() => importRouletteModal().then((module) => ({ default: module.RouletteModal })));
const IntegrationsScreen = lazy(() => import('./view/components/import/IntegrationsScreen').then((module) => ({ default: module.IntegrationsScreen })));
const PublicReviewScreen = lazy(() => import('./view/components/PublicReviewScreen').then((module) => ({ default: module.PublicReviewScreen })));
const InboxScreen = lazy(() => import('./view/components/import/InboxScreen').then((module) => ({ default: module.InboxScreen })));
const LegalScreen = lazy(() => import('./view/components/LegalScreen').then((module) => ({ default: module.LegalScreen })));
// Panel de administración: `lazy` como el resto de hubs, así que su código (y el correo del admin) solo se
// descarga si alguien pide `/admin`. El acceso lo deciden las reglas de Firestore, no este import.
const AdminHub = lazy(() => import('./view/components/AdminHub').then((module) => ({ default: module.AdminHub })));

function getCurrentTab(pathname: string): TabId {
  return ROUTE_TAB[pathname] || 'c';
}


/**
 * A11y-4 — Encabezado de nivel 1 de la pantalla actual. Va oculto visualmente (el diseño es "headerless" a
 * propósito): no cambia nada de lo que se ve y le da a un lector de pantalla el encabezado que ninguna pantalla
 * tenía. En los listados incluye la pestaña activa, que es lo que de verdad distingue una vista de otra.
 */
function getPageHeading(section: AppSection, currentTab: TabId): string {
  const H = UI_MESSAGES.pageHeading;
  if (section === 'lists') return H.lists(TAB_TITLES[currentTab]);
  return H[section];
}

/**
 * Reseña compartida (`/r/:token`) vista por alguien que tiene la app en este navegador.
 *
 * El token se saca del `pathname` en lugar de con `useParams` porque esta pantalla se monta desde el mapa de
 * secciones, que no está dentro del `<Route>` que lo captura.
 */
function SharedReviewRoute(): ReactNode {
  const location = useLocation();
  return <PublicReviewScreen token={location.pathname.replace(/^\/r\//, '').replace(/\/$/, '')} />;
}

/** L4 — documento legal correspondiente a la ruta (`/legal/*`). Por defecto, el aviso legal. */
function getLegalDocId(pathname: string): LegalDocId {
  const match = (Object.keys(LEGAL_ROUTES) as LegalDocId[]).find((id) => pathname.startsWith(LEGAL_ROUTES[id]));
  return match || 'terms';
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
  const activeSection = matchAppSection(location.pathname);
  const legalDocId = getLegalDocId(location.pathname);

  const vm = useGameListViewModel();
  // F2: enlaza la sesión de Google con la escala de puntuación (hidrata desde Firestore / resetea al salir);
  // devuelve el uid para gatear la opción en Ajustes. Se monta aquí para que la escala esté en toda la app.
  const { uid: scoreScaleUid, ready: authReady } = useScoreScaleSession();
  // El botón flotante de Cuenta se muestra solo si hay PERFIL SOCIAL COMPLETO (no basta la sesión de Google ni el
  // gist enlazado): sin ningún juego completado el perfil deja de estar completo y el botón se oculta para no poder
  // navegar a `/cuenta` hasta arreglarlo. Los ids de completados se pasan para que el gate sea reactivo al borrar
  // juegos, sin lecturas de red.
  const completedGameIds = useMemo(
    () => new Set(vm.data.c.filter((game) => game.id > 0 && game.name).map((game) => game.id)),
    [vm.data.c],
  );
  const hasSocialProfile = useSocialProfileSession(completedGameIds);
  // F1: enlaza la sesión con la apariencia (paleta + claro/oscuro) → hidrata/replica en Firestore.
  useAppearanceSession();
  // Al iniciar sesión, migra y limpia los restos legacy del perfil público (email / id del gist de juegos /
  // token en claro): primero los pone a salvo en `privateConfig` (owner-only, solo el dueño puede) y luego los
  // borra del documento que lee cualquier usuario autenticado. Silencioso y best-effort.
  useLegacyProfileHeal();
  // F1: aplica la paleta app-wide y reacciona a la hidratación de cuenta, para que el tema sincronizado se
  // aplique al iniciar sesión (no solo al abrir Ajustes, donde vive el selector `usePalette`).
  useAppliedPalette();
  // F1: aplica la preferencia de caja (mayúsculas) al <html> app-wide y reacciona a la hidratación.
  useUppercase();
  // F1: aplica la preferencia de efectos visuales (data-effects) al <html> app-wide y reacciona a la hidratación.
  useEffects();
  // F1: visibilidad del botón "Steam Deck" (preferencia de cuenta) → se pasa a la Toolbar.
  const { showSteamButton } = useShowSteamButton();
  // Histórico del backlog: anota una vez al mes el tamaño de cada lista. Va aquí y no en el panel "Perfil"
  // porque la serie debe acumularse se visite o no esa pantalla; sin este registro no hay forma de saber cómo
  // evoluciona el backlog (`listedAt` se reescribe al mover de lista). Local, silencioso y en idle.
  useBacklogSnapshot(vm.data);
  // Estrellas fugaces aleatorias por los bordes de botones/chips (solo en la paleta "Sol y luna").
  useShootingStars();
  // Efectos de firma por interacción (wipe P5 al navegar, apertura de portal al clic, sol↔luna, boot-up 40K).
  useSignatureEffects();

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

  // Bandeja de importados (local, no sincroniza). Se monta aquí para exponer su contador en los controles
  // flotantes y cablear la graduación (clasificar → formulario → retirar de la bandeja).
  const inbox = useImportInbox();
  // Qué datos traslada el import a cada juego (global, por grupo: nuevos / ya en tus listas).
  const importFields = useImportFieldPrefs();
  const graduatingIdRef = useRef<number | null>(null);
  // Nombres ya presentes en las listas (normalizados) → para marcar duplicados al importar y en la bandeja.
  const listNames = useMemo(
    () => new Set(TAB_IDS.flatMap((tab) => vm.data[tab].map((game) => normalizeName(game.name)))),
    [vm.data],
  );
  // ¿El importado ya está en alguna lista? (marca de la bandeja; O(1)).
  const isInLists = useCallback((name: string) => listNames.has(normalizeName(name)), [listNames]);
  // Resuelve el juego existente por nombre (para enriquecerlo). Solo al pulsar "Actualizar".
  const findGameByName = useCallback(
    (name: string): { tab: TabId; id: number } | null => {
      const norm = normalizeName(name);
      for (const tab of TAB_IDS) {
        const game = vm.data[tab].find((g) => normalizeName(g.name) === norm);
        if (game) return { tab, id: game.id };
      }
      return null;
    },
    [vm.data],
  );

  // ¿En QUÉ lista está? (para mostrarlo junto a la marca "Ya en tus listas" en la bandeja). null si no está.
  const listOfName = useCallback((name: string): TabId | null => findGameByName(name)?.tab ?? null, [findGameByName]);

  // Inserta en la bandeja el resultado de un parser y avisa; navega a la bandeja si hubo algo.
  const importGames = useCallback(
    (games: RawExternalGame[]) => {
      if (games.length === 0) {
        notify('warn', UI_MESSAGES.import.integrations.parseError);
        return;
      }
      const summary = inbox.addGames(games, listNames);
      notify('ok', UI_MESSAGES.import.notice(summary.added, summary.merged, summary.duplicates));
      navigate('/bandeja');
    },
    [inbox, listNames, navigate, notify],
  );

  // Opción A: "Json Library Import Export" → varios .json (games.json + ficheros de lookup).
  // Import de Playnite Library Exporter: un único fichero JSON.
  const handleImportLibraryExporter = useCallback(
    async (file: File) => {
      let json: unknown;
      try {
        json = JSON.parse(await file.text()) as unknown;
      } catch {
        notify('err', UI_MESSAGES.import.integrations.parseError);
        return;
      }
      importGames(parseLibraryExporter(json));
    },
    [importGames, notify],
  );

  const handleClassifyImport = useCallback(
    (item: ImportedGame, tab: TabId) => {
      graduatingIdRef.current = item.id;
      vm.openImportedDraft(tab, importedToPartialGame(item, importFields.prefs.newGames));
    },
    [importFields.prefs.newGames, vm],
  );

  // Enriquecer: el juego ya está en tus listas → fusiona género/plataforma en el existente (form en edición).
  const handleEnrichImport = useCallback(
    (item: ImportedGame) => {
      const match = findGameByName(item.name);
      if (!match) return;
      const game = vm.data[match.tab].find((g) => g.id === match.id);
      if (!game) return;
      graduatingIdRef.current = item.id;
      vm.openImportedDraft(match.tab, { ...game, ...mergeImportedIntoGame(game, item, importFields.prefs.existingGames) });
    },
    [findGameByName, importFields.prefs.existingGames, vm],
  );

  const handleDiscardImport = useCallback((id: number) => inbox.removeItem(id), [inbox]);
  const handleDiscardManyImport = useCallback((ids: number[]) => inbox.removeItems(ids), [inbox]);
  const handleClearInbox = useCallback(() => inbox.clear(), [inbox]);
  const openIntegrations = useCallback(() => navigate('/integraciones'), [navigate]);

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
      // `bumpChangedAgainst` en vez de `forceTimestamp`: lo importado tiene que ganar el merge frente a otros
      // dispositivos, pero solo necesita estrenar `_ts` lo que de verdad cambia. Sellar la biblioteca entera
      // borraba la fecha de modificación de todos los juegos (y con ella la única pista de cuándo se escribió
      // cada reseña, que es lo que el canal social publica).
      // Los sellos automáticos que ya estuvieran aquí sobreviven si el fichero no los trae: un respaldo anterior
      // a ellos (o de otra herramienta) no puede aportarlos, así que tampoco tiene por qué llevárselos.
      const normalizedData = normalizeData(carryStamps(nextData, vm.data), { bumpChangedAgainst: vm.data });
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
  }, [notify, persist, syncVm, vm.data]);

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

    if (section === 'stats') {
      navigate('/perfil');
      return;
    }

    if (section === 'account') {
      navigate('/cuenta');
      return;
    }

    if (section === 'integrations') {
      navigate('/integraciones');
      return;
    }

    if (section === 'inbox') {
      navigate('/bandeja');
      return;
    }

    navigate('/ajustes');
  }, [navigate, setExpandedId]);

  const handleAddGame = useCallback(() => {
    openNewGame(currentTab);
  }, [currentTab, openNewGame]);

  const handleCloseFormModal = useCallback(() => {
    // Si se cancela una graduación, el importado permanece en la bandeja (no se retira).
    graduatingIdRef.current = null;
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

    // Si una validación corta el guardado (campos obligatorios, nombre ya en las listas) no hay nada que
    // encadenar: ni retirar el importado de la bandeja, ni destellar la fila, ni tocar el canal social.
    if (!saveDraft(editingTab, nextDraft)) return;

    // Graduación desde la bandeja: si este guardado viene de clasificar un importado, se retira de la bandeja.
    if (graduatingIdRef.current !== null) {
      inbox.removeItem(graduatingIdRef.current);
      graduatingIdRef.current = null;
    }

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
        void import('./model/repository/socialPublishRepository')
          .then((m) => m.unpublishReviewActivity({ id: predictedId }))
          .catch(() => {
            markPendingSocialActivityFailure();
            notify('warn', 'Juego guardado; la actividad social de reseña se actualizará al abrir el hub social.');
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

    void import('./model/repository/socialPublishRepository')
      .then((m) => m.publishReviewActivity({
        id: predictedId,
        name: nextDraft.name.trim(),
        review: cleanReview, // audit-allow: publishReviewActivity lo convierte a snippet antes de publicar
        score: nextScore, // audit-allow: el canal social publica solo rating redondeado
        grade: nextGrade, // nota fina 0–100 (misma nombre que en el listado)
        // Solo cambiar el texto (re)publica en el feed. Cambiar solo nota/nombre sincroniza una reseña YA
        // publicada sin recolocarla; si no había reseña publicada, publishReviewActivity es un no-op.
        reviewChanged,
      }))
      .catch(() => {
        // El fallo puede ser del propio import dinámico (index.html cacheado tras un despliegue, red
        // intermitente) o de GitHub (403 por rate-limit, 5xx). En ambos casos la publicación se perdía sin
        // rastro ni reintento: se marca como pendiente para que la reconciliación la recupere.
        markPendingSocialActivityFailure();
        notify('warn', 'Juego guardado; la actividad social de reseña se actualizará al abrir el hub social.');
      });
  }, [editingTab, inbox, notify, saveDraft, vm.data]);

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



  // Los modales entran en el árbol al abrirse por primera vez y ya no salen (el `<dialog>` debe seguir montado
  // para que su cierre restaure el foco). Así sus chunks quedan fuera del render inicial.
  const formModalMounted = useMountedOnceOpen(vm.formModalOpen);
  const confirmModalMounted = useMountedOnceOpen(!!vm.confirmState);
  const rouletteMounted = useMountedOnceOpen(rouletteOpen);

  // Precarga en idle, ya pintada la pantalla: cuando el usuario abra un modal su módulo estará en caché y no
  // habrá que esperar a la red (el `fallback` de Suspense es `null`, así que una espera se vería como un clic
  // que no hace nada).
  useEffect(() => runWhenIdle(() => {
    void importFormModal();
    void importConfirmModal();
    void importRouletteModal();
  }), []);

  const syncBadgeText = SYNC_BADGE_TEXT[syncVm.status] || SYNC_BADGE_TEXT.idle;

  /**
   * Pantalla de cada sección. Las cuatro rutas de listados comparten elemento a propósito: la pestaña activa se
   * deriva del pathname ({@link getCurrentTab}), no de rutas distintas.
   */
  const sectionScreens: Record<AppSection, ReactNode> = {
    lists: (

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
    ),
    social: (

      // `fallback` con esqueleto, no `null`: el chunk del hub es lo primero que hay que descargar al entrar en
      // social, y con `null` la pantalla se quedaba en BLANCO hasta que llegaba. Es el mismo esqueleto que
      // pinta el propio hub mientras se hidrata, así que el usuario ve una sola escena de carga continua.
      <Suspense fallback={<SocialHubSkeleton />}>
        <SocialHub
          onAddToProximos={vm.addGameToProximos}
          hasGameInLists={vm.hasGameInLists}
          moveGameToCurrentByName={vm.moveGameToCurrentByName}
          games={vm.data}
        />
      </Suspense>
    ),
    stats: (

      <Suspense fallback={null}>
        <StatsHub games={vm.data} />
      </Suspense>
    ),
    account: (

      <Suspense fallback={null}>
        {scoreScaleUid ? <AccountHub scoreScaleUid={scoreScaleUid} hasSocialProfile={hasSocialProfile} /> : null}
      </Suspense>
    ),
    admin: (

      <Suspense fallback={null}>
        <AdminHub />
      </Suspense>
    ),
    // Reseña compartida abierta por alguien que SÍ tiene la app aquí: se ve dentro del cromo de siempre, con su
    // navegación. Quien no la tiene ni llega a este punto — `main.tsx` monta la pantalla suelta antes del
    // enrutador, sin cromo y sin ninguna salida más que el enlace a la app.
    'shared-review': (

      <Suspense fallback={null}>
        <SharedReviewRoute />
      </Suspense>
    ),
    legal: (

      <Suspense fallback={null}>
        <LegalScreen docId={legalDocId} />
      </Suspense>
    ),
    integrations: (

      <Suspense fallback={null}>
        <IntegrationsScreen
          onImport={handleImportLibraryExporter}
          onBack={() => navigate('/ajustes')}
          inboxCount={inbox.count}
          onOpenInbox={() => navigate('/bandeja')}
        />
      </Suspense>
    ),
    inbox: (

      <Suspense fallback={null}>
        <InboxScreen
          imported={inbox.imported}
          isInLists={isInLists}
          listOf={listOfName}
          onClassify={handleClassifyImport}
          onEnrich={handleEnrichImport}
          onDiscard={handleDiscardImport}
          onDiscardMany={handleDiscardManyImport}
          onClear={handleClearInbox}
          fieldPrefs={importFields.prefs}
          onFieldPrefChange={importFields.setField}
          onBack={() => navigate('/integraciones')}
          onGoIntegrations={() => navigate('/ajustes')}
        />
      </Suspense>
    ),
    settings: (

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
          onOpenIntegrations={openIntegrations}
        />
      </Suspense>
    ),
  };

  return (
    <>
      <IconSprite />
      {/* A11y-4: primer elemento enfocable de la página. Sin él, llegar al contenido con teclado obligaba a pasar
          por los controles flotantes y la barra de pestañas en cada carga. Solo se ve al recibir el foco. */}
      <a className="skip-link" href="#contenido">{UI_MESSAGES.skipToContent}</a>
      <FloatingControls
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        showAccount={hasSocialProfile}
      />
      {activeSection === 'lists' ? <TabBar currentTab={currentTab} tabCounts={vm.tabCounts} onTabChange={handleTabChange} /> : null}
      <StatusBanner notice={vm.notice} remoteChangesApplied={syncVm.lastRemoteChangesApplied} />
      <UpdateNotice />
      <main
        id="contenido"
        className={`main ${
          activeSection === 'lists'
            ? 'main-lists'
            : activeSection === 'social'
              ? 'main-social'
              : activeSection === 'admin'
                ? 'main-settings main-admin'
                : 'main-settings'
        }`.trim()}
      >
        <h1 className="sr-only">{getPageHeading(activeSection, currentTab)}</h1>
        <Routes>
          {APP_ROUTES.map(({ path, section }) => (
            <Route key={path} path={path} element={sectionScreens[section]} />
          ))}
          <Route path="*" element={<Navigate to={FALLBACK_ROUTE} replace />} />
        </Routes>
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

      <BottomNavigation currentSection={activeSection} onSectionChange={handleSectionChange} />
      <ConsentBanner />
      <ScrollToTop />

      <Suspense fallback={null}>
        {formModalMounted ? (
          <FormModal
            open={vm.formModalOpen}
            draft={vm.draft}
            currentTab={vm.editingTab}
            lookups={vm.lookups}
            findDuplicate={vm.findGameByName}
            onClose={handleCloseFormModal}
            onSave={handleSaveDraft}
            onNotice={vm.notify}
          />
        ) : null}

        {confirmModalMounted ? (
          <ConfirmModal
            open={!!vm.confirmState}
            title={vm.confirmState?.title || ''}
            onCancel={handleConfirmCancel}
            onConfirm={handleConfirmDelete}
          />
        ) : null}

        {rouletteMounted ? (
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
        ) : null}
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

    </>
  );
}
