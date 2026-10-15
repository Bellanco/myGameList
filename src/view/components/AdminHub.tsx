import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_PATHS, matchAdminPath, type AdminScreen } from '../../core/admin/adminRoutes';
import type { Announcement } from '../../core/announcement/announcement';
import type { ExtraSteps } from '../../core/achievements/types';
import type { HiddenOverrides, OpenFrontier } from '../../core/achievements/visibility';
import { ADMIN_PANEL_UI, ADMIN_SHARES_UI, ADMIN_SHELL_UI } from '../../core/constants/adminLabels';
import { copyText } from '../../core/utils/clipboard';
import { clearAllAchievements } from '../../model/repository/firebaseAdminRepository';
import { useAdminAccounts } from '../../viewmodel/useAdminAccounts';
import { useAdminHealth } from '../../viewmodel/useAdminHealth';
import { useAdminInsights } from '../../viewmodel/useAdminInsights';
import { useAdminLog } from '../../viewmodel/useAdminLog';
import { useAdminPanelData } from '../../viewmodel/useAdminPanelData';
import { useAdminViewModel } from '../../viewmodel/useAdminViewModel';
import { AdminAccountsScreen } from './admin/AdminAccountsScreen';
import { AdminCapacityScreen } from './admin/AdminCapacityScreen';
import { AdminCommunityScreen } from './admin/AdminCommunityScreen';
import { AdminLogScreen } from './admin/AdminLogScreen';
import { AdminTodayScreen } from './admin/AdminTodayScreen';
import { AdminConfirmDialog } from './admin/AdminConfirmDialog';
import { AdminNav } from './admin/AdminNav';
import {
  AdminPanelContext,
  useAdminPanel,
  type AdminConfirmRequest,
  type AdminPanelContextValue,
  type AdminToast,
} from './admin/AdminPanelContext';
import { AdminSearch } from './admin/AdminSearch';
import { AdminToastView } from './admin/AdminToastView';
import { AdminUsersScreen } from './admin/AdminUsersScreen';
// La hoja del panel se importa AQUÍ y no desde `index.scss`: como el panel entra por `lazy()`, Vite emite su CSS
// en el mismo chunk perezoso y el arranque no carga ni un byte de estilos de esta pantalla (igual que `stats.scss`).
import '../../styles/admin.scss';
// La hoja de las pantallas de Ajustes viaja en los chunks perezosos que la usan y no en el bundle base. Se importa
// desde CADA pantalla que la necesita: si se importara solo desde una, entrar por otra ruta la dejaría sin estilo.
import '../../styles/settings.scss';

const A = ADMIN_PANEL_UI;

/** El catálogo de logros, aparte y perezoso: son 250 escalones y los 50 símbolos del sprite. */
const AdminAchievements = lazy(() =>
  import('./AdminAchievements').then((module) => ({ default: module.AdminAchievements })));

/** El aviso a los usuarios, también aparte: trae la cápsula de verdad para la muestra, con su hoja. */
const AdminAnnouncement = lazy(() =>
  import('./AdminAnnouncement').then((module) => ({ default: module.AdminAnnouncement })));

/** LA PORRA, como una pantalla más del panel: no hay un segundo `/admin` ni una segunda guarda de acceso. */
const AdminPremios = lazy(() =>
  import('./premios/AdminPremios').then((module) => ({ default: module.AdminPremios })));

/** Cuánto se queda a la vista el aviso de una acción. Con «Deshacer», más: hay que darle tiempo a arrepentirse. */
const TOAST_MS = 4000;
const TOAST_UNDO_MS = 8000;

/**
 * Panel de administración (`/admin/*`, sin enlace en la navegación). Ver docs/plan-admin-rediseno.md.
 *
 * Es el armazón: la puerta (solo con el claim `admin`), el menú y las sub-rutas, y lo que comparten todas —el censo
 * y sus acciones, los enlaces y demás fuentes, el aviso de cada acción y la confirmación—. Cada pantalla vive en
 * `./admin/`, salvo las tres que ya existían (logros, aviso y retos), que se montan tal cual en su ruta.
 *
 * Todo se apoya en `isAdmin()` de firestore.rules; esta pantalla solo evita que quien no manda vea una tabla rota.
 */
export const AdminHub = memo(function AdminHub() {
  const log = useAdminLog();
  const { record, undo: undoEntry, load: loadLog } = log;
  const logPort = useMemo(() => ({ record, undo: undoEntry }), [record, undoEntry]);
  const vm = useAdminViewModel(logPort);
  const granted = vm.access === 'granted';
  const data = useAdminPanelData(granted);
  const insights = useAdminInsights(vm.census, vm.loadedAt);
  const health = useAdminHealth(granted);
  const accounts = useAdminAccounts(granted, record);
  useEffect(() => {
    if (granted) void loadLog();
  }, [granted, loadLog]);
  const location = useLocation();
  const { screen } = matchAdminPath(location.pathname);

  const [toast, setToast] = useState<AdminToast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState<AdminConfirmRequest | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const notify = useCallback((next: AdminToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    // Los errores no se van solos: hay que leerlos.
    if (next.kind !== 'err') {
      toastTimer.current = setTimeout(() => setToast(null), next.undo ? TOAST_UNDO_MS : TOAST_MS);
    }
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // El resultado de cada acción del censo llega como `vm.status`: se dice en el aviso.
  useEffect(() => {
    if (vm.status) notify({ text: vm.status.text, kind: vm.status.kind, undo: vm.status.undo });
  }, [vm.status, notify]);

  const copyUid = useCallback(async (uid: string) => {
    // Sin permiso de portapapeles no hay nada que decir.
    if (await copyText(uid)) notify({ text: A.copiedUid, kind: 'ok' });
  }, [notify]);

  const { loadShares } = data;
  const runShareAction = useCallback(async (action: () => Promise<string>, target?: { uid: string; name: string }) => {
    try {
      const text = await action();
      notify({ text, kind: 'ok' });
      // Se apunta con el texto del resultado: dice ya qué se hizo («Enlace retirado», «Vetado; 3 retirados»…).
      if (target) void record({ kind: 'shares', text: text.replace(/\.$/, ''), targetUid: target.uid, targetName: target.name, undo: null });
    } catch {
      notify({ text: ADMIN_SHARES_UI.failed, kind: 'err' });
    }
    await loadShares();
  }, [notify, loadShares, record]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // ⌘K / Ctrl+K DENTRO DEL PANEL abre su buscador y no el general de la app. Se escucha en la fase de CAPTURA y se
  // marca el evento (`preventDefault`): el buscador general mira `defaultPrevented` y no se abre encima.
  useEffect(() => {
    if (vm.access !== 'granted') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [vm.access]);

  const context = useMemo<AdminPanelContextValue>(
    () => ({ vm, data, insights, health, accounts, log, notify, confirm: setPending, copyUid, runShareAction, openSearch }),
    [vm, data, insights, health, accounts, log, notify, copyUid, runShareAction, openSearch],
  );

  const counts = useMemo<Partial<Record<AdminScreen, { value: number; soft?: boolean }>>>(
    () => ({
      // La portada se marca en rojo con lo grave y lo vencido: es lo que pide entrar hoy.
      today: { value: (insights.totals?.severe || 0) + insights.dueTodos },
      users: { value: vm.census?.totals.flagged || 0, soft: true },
      // Rojo con las caducadas (hay que borrarlas), gris con las que caducan pronto (solo avisar).
      accounts: accounts.expired.length > 0 ? { value: accounts.expired.length } : { value: accounts.expiring.length, soft: true },
    }),
    [vm.census, insights.totals, insights.dueTodos, accounts.expired.length, accounts.expiring.length],
  );

  if (vm.access === 'checking') {
    return (
      <section className="admin-hub" aria-label={A.sectionAria} aria-busy="true">
        <div className="admin-card">
          <p>{A.checking}</p>
        </div>
      </section>
    );
  }

  // Sin ser el admin no hay nada que enseñar aquí (y las reglas tampoco darían datos): fuera de la ruta.
  if (vm.access === 'denied') {
    return <Navigate to="/completados" replace />;
  }

  return (
    <AdminPanelContext.Provider value={context}>
      <section className="admin-hub adm-shell" aria-label={A.sectionAria}>
        <AdminNav current={screen} counts={counts} onSearch={openSearch} />
        <div className="adm-main">
          <Suspense fallback={null}>
            <Routes>
              <Route index element={<AdminTodayScreen />} />
              <Route path="usuarios" element={<AdminUsersScreen />} />
              <Route path="usuarios/:userId" element={<AdminUsersScreen />} />
              <Route path="cuentas" element={<AdminAccountsScreen />} />
              <Route path="comunidad" element={<AdminCommunityScreen />} />
              <Route path="capacidad" element={<AdminCapacityScreen />} />
              <Route path="registro" element={<AdminLogScreen />} />
              <Route path="logros" element={<AchievementsRoute />} />
              <Route path="aviso" element={<AnnouncementRoute />} />
              <Route path="retos" element={<AdminPremios />} />
              <Route path="*" element={<Navigate to={ADMIN_PATHS.today} replace />} />
            </Routes>
          </Suspense>
        </div>
        <AdminSearch open={searchOpen} onClose={closeSearch} />
        <AdminConfirmDialog request={pending} onClose={() => setPending(null)} />
        <AdminToastView toast={toast} onDismiss={dismissToast} />
      </section>
    </AdminPanelContext.Provider>
  );
});

/**
 * El catálogo de logros con su configuración: se lee al entrar en su ruta y solo entonces (el censo, que es a lo
 * que se entra, no la necesita). Los espejos ya vienen en el censo, así que medir el reparto no cuesta ni una
 * petición.
 */
function AchievementsRoute() {
  const { vm } = useAdminPanel();
  const [hidden, setHidden] = useState<HiddenOverrides>({});
  const [open, setOpen] = useState<OpenFrontier>({});
  const [extraSteps, setExtraSteps] = useState<ExtraSteps>({});

  useEffect(() => {
    let cancelled = false;
    void import('../../model/repository/achievementsConfigRepository')
      .then((module) => module.loadAchievementsConfig(true))
      .then((value) => {
        if (cancelled) return;
        setHidden(value.hidden);
        setOpen(value.open);
        setExtraSteps(value.extraSteps);
      })
      .catch(() => {
        // Sin configuración manda el catálogo; la pantalla lo enseña tal cual.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const repository = () => import('../../model/repository/achievementsConfigRepository');
  return (
    <AdminAchievements
      mirrors={vm.census?.mirrors}
      hiddenOverrides={hidden}
      onToggleHidden={async (ladderKey, value) => setHidden(await (await repository()).setLadderHidden(ladderKey, value))}
      openFrontier={open}
      onPublishFrontier={async (next) => setOpen(await (await repository()).publishOpenFrontier(next))}
      extraSteps={extraSteps}
      onSetExtraSteps={async (ladderKey, steps) => setExtraSteps(await (await repository()).setExtraSteps(ladderKey, steps))}
      onResetAll={async () => {
        // Borra el espejo de TODO el censo y, con él, la apertura publicada, que sin espejos no significa nada.
        const cleared = await clearAllAchievements((vm.census?.users || []).map((entry) => entry.id));
        setOpen(await (await repository()).publishOpenFrontier({}));
        await vm.refresh();
        return cleared;
      }}
      censusSize={vm.census?.users.length || 0}
    />
  );
}

/** El aviso publicado: el formulario espera a tenerlo leído (sin caché) para no editar sobre una foto vieja. */
function AnnouncementRoute() {
  const { data, log } = useAdminPanel();
  const { loadAnnouncement, setAnnouncement } = data;
  const { record } = log;
  // Cada entrada vuelve a leer: aquí se está a punto de reescribirlo.
  useEffect(() => {
    setAnnouncement(undefined);
    void loadAnnouncement();
  }, [loadAnnouncement, setAnnouncement]);
  const save = useCallback(async (next: Announcement): Promise<Announcement> => {
    const module = await import('../../model/repository/announcementRepository');
    const saved = await module.saveAnnouncement(next);
    setAnnouncement(saved);
    void record({ kind: 'announcement', text: ADMIN_SHELL_UI.log.texts.announcement(saved.title), targetUid: '', targetName: '', undo: null });
    return saved;
  }, [setAnnouncement, record]);
  return <AdminAnnouncement current={data.announcement} onSave={save} />;
}
