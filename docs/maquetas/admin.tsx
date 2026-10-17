// Entrada de la maqueta del PANEL DE ADMINISTRACIÓN: las pantallas REALES (`src/view/components/admin/`), montadas
// con el mismo marco que les pone `AdminHub` y un contexto de mentira —censo, enlaces, capacidad, registro— con
// datos inventados y sin red. Ver `admin.html` para los parámetros de la URL.
//
// Para qué: el panel exige el claim de administrador y en local no hay Firebase, así que `/admin` rebota. Esto es
// lo que permite VER el panel —y fotografiarlo— sin sesión, igual que `social.html` con el hub. Las acciones
// funcionan sobre el censo inventado (cambiar rango, suspender…) y se apuntan en el registro con «Deshacer».
//
// `tsconfig.json` incluye `docs/maquetas`: si una pantalla cambia de props o el contexto cambia de forma, esto deja
// de compilar en vez de quedarse viejo en silencio.
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import '../../src/styles/index.scss';
import '../../src/styles/admin.scss';
import '../../src/styles/settings.scss';
import { IconSprite } from '../../src/view/components/IconSprite';
import { IconSpriteRest } from '../../src/view/components/IconSpriteRest';
import { parsePaletteId } from '../../src/core/constants/palettes';
import { loadPaletteSkin } from '../../src/view/hooks/paletteSkin';
import { ADMIN_PATHS, matchAdminPath } from '../../src/core/admin/adminRoutes';
import { buildDailySnapshot, communityTotals, localDayKey, previousSnapshot, type DailySnapshot } from '../../src/core/admin/communityStats';
import { ADMIN_SHELL_UI } from '../../src/core/constants/adminLabels';
import { PROFILE_TIER_LABELS, type ProfileTier } from '../../src/core/constants/tiers';
import type { Announcement } from '../../src/core/announcement/announcement';
import type { AdminCensus, AdminUserRow } from '../../src/model/repository/firebaseAdminRepository';
import type { AdminLogEntry, AdminTodo } from '../../src/model/repository/admin/adminPanelStore';
import type { AdminAnomaly } from '../../src/model/types/firestore';
import type { AdminShareRow } from '../../src/model/repository/shareAdminRepository';
import type { useAdminViewModel } from '../../src/viewmodel/useAdminViewModel';
import type { AdminInsights } from '../../src/viewmodel/useAdminInsights';
import type { AdminHealthState, HealthMeterView } from '../../src/viewmodel/useAdminHealth';
import { sortAccounts, type AdminAccountsState, type AdminAccountView } from '../../src/viewmodel/useAdminAccounts';
import type { AdminAccount } from '../../src/model/repository/adminAccountsRepository';
import { judgeRetention, retentionFactsOf } from '../../src/core/admin/accountRetention';
import type { AdminLogState } from '../../src/viewmodel/useAdminLog';
import type { AdminPanelData } from '../../src/viewmodel/useAdminPanelData';
import { AdminPanelContext, type AdminConfirmRequest, type AdminPanelContextValue, type AdminToast } from '../../src/view/components/admin/AdminPanelContext';
import { AdminNav } from '../../src/view/components/admin/AdminNav';
import { AdminTodayScreen } from '../../src/view/components/admin/AdminTodayScreen';
import { AdminUsersScreen } from '../../src/view/components/admin/AdminUsersScreen';
import { AdminCommunityScreen } from '../../src/view/components/admin/AdminCommunityScreen';
import { AdminCapacityScreen } from '../../src/view/components/admin/AdminCapacityScreen';
import { AdminLogScreen } from '../../src/view/components/admin/AdminLogScreen';
import { AdminAccountsScreen } from '../../src/view/components/admin/AdminAccountsScreen';
import { AdminConfirmDialog } from '../../src/view/components/admin/AdminConfirmDialog';
import { AdminToastView } from '../../src/view/components/admin/AdminToastView';
import { AdminSearch } from '../../src/view/components/admin/AdminSearch';
import { AdminAnnouncement } from '../../src/view/components/AdminAnnouncement';

loadPaletteSkin(parsePaletteId(document.documentElement.dataset.palette));

const params = new URLSearchParams(window.location.search);
const PANTALLAS: Record<string, string> = {
  hoy: ADMIN_PATHS.today,
  usuarios: ADMIN_PATHS.users,
  cuentas: ADMIN_PATHS.accounts,
  comunidad: ADMIN_PATHS.community,
  capacidad: ADMIN_PATHS.capacity,
  registro: ADMIN_PATHS.log,
  aviso: ADMIN_PATHS.announcement,
};
const pantalla = params.get('pantalla') || 'hoy';
const ficha = params.get('ficha');
const inicio = ficha ? `${ADMIN_PATHS.users}/${ficha}` : PANTALLAS[pantalla] || ADMIN_PATHS.today;

// ─── Datos inventados ────────────────────────────────────────────────────────────────────────────────────────

/** Generador con semilla: la maqueta sale igual cada vez que se abre. */
function semilla(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIA = 86_400_000;
const AHORA = Date.now();
const NOMBRES = [
  'Marta', 'Iván', 'Lucía R.', 'Nacho', 'Paula G.', 'Sergio', 'Carmen', 'Álex M.', 'Bea', 'Tomás', 'Irene', 'Javi',
  'Noelia', 'Rubén', 'Sara P.', 'Hugo', 'Elena', 'Dani', 'Clara', 'Mario', 'Laura V.', 'Pablo', 'Ainhoa', 'Óscar',
  'Nerea', 'Víctor', 'Alba', 'Raúl', 'Marina', 'Jorge', 'Cris', 'Adrián', 'Silvia', 'Diego', 'Andrea', 'Fran',
  'Lorena', 'Guille', 'Patri', 'Edu', 'Miriam', 'Quique',
];
const PLATA = new Set([2, 3, 6, 9, 11, 15, 19]);
const SIN_AMIGOS = new Set([8, 13, 24, 27, 35, 40]);
const NUEVOS: Record<number, number> = { 38: 2, 39: 4, 41: 6 };
const SENALES: Record<number, AdminAnomaly[]> = {
  4: ['legacy-token', 'legacy-fields'],
  7: ['gist-drift'],
  10: ['stray-photo'],
  12: ['friend-name-mismatch'],
  16: ['stray-photo'],
  21: ['stale-pending-out'],
  29: ['foreign-doc-id'],
  33: ['never-active'],
};

const USUARIOS: AdminUserRow[] = (() => {
  const r = semilla(7);
  return NOMBRES.map((nombre, i): AdminUserRow => {
    const tier: ProfileTier = i === 1 ? 'mithril' : i === 0 ? 'gold' : PLATA.has(i) ? 'silver' : 'bronze';
    const tirada = r();
    let dias = tirada < 0.5 ? 0 : tirada < 0.75 ? 1 + Math.floor(r() * 6) : tirada < 0.9 ? 7 + Math.floor(r() * 22) : 31 + Math.floor(r() * 90);
    if (i === 1) dias = 0;
    const anomalies = [...(SENALES[i] || [])];
    if (dias > 30) anomalies.push('inactive');
    const amigos = SIN_AMIGOS.has(i) ? 0 : 1 + Math.floor(r() * 9);
    return {
      id: i === 29 ? `perfil-viejo-${i}` : `uid-${i}`,
      uid: `uid-${i}`,
      displayName: nombre,
      knownAs: nombre,
      friendKnownNames: i === 12 ? ['Noe'] : [nombre],
      friendKnownPhotos: [],
      photoURL: '',
      socialEnabled: i !== 20 && i !== 31,
      socialGistId: '',
      tier,
      updatedAt: i === 33 ? 0 : AHORA - dias * DIA - Math.floor(r() * 6) * 3600_000,
      friends: amigos,
      pending: i === 21 ? 3 : 0,
      legacy: { email: false, gamesGistId: false, token: i === 4 },
      idMatchesUid: i !== 29,
      profileId: `p-${i}`,
      schemaVersion: 3,
      hasPhoto: i === 10 || i === 16,
      createdAt: AHORA - (NUEVOS[i] ?? 20 + Math.floor(r() * 300)) * DIA,
      estimatedFirstSeenAt: 0,
      lastFriendshipAt: 0,
      pendingOut: i === 21 ? 3 : 0,
      pendingIn: 0,
      friendSocialGistIds: i === 7 ? ['g1', 'g2'] : amigos ? ['g1'] : [],
      friendGamesGistIds: amigos ? ['j1'] : [],
      stalePendingOut: i === 21 ? 3 : 0,
      fossilPendingOut: i === 21 ? 2 : 0,
      canonicalTwinFound: false,
      anomalies,
    };
  });
})();

function censoDe(users: AdminUserRow[]): AdminCensus {
  return {
    users,
    mirrors: [],
    truncated: false,
    totals: {
      profiles: users.length,
      socialEnabled: users.filter((u) => u.socialEnabled).length,
      friendships: 61,
      pending: 3,
      legacy: users.filter((u) => u.legacy.token).length,
      flagged: users.filter((u) => u.anomalies.length > 0).length,
      byTier: users.reduce(
        (acc, u) => ({ ...acc, [u.tier]: acc[u.tier] + 1 }),
        { bronze: 0, silver: 0, gold: 0, mithril: 0 } as Record<ProfileTier, number>,
      ),
    },
  };
}

/** Fotos diarias de los últimos 60 días, con algún hueco: la gráfica de Comunidad con historia. */
const FOTOS: DailySnapshot[] = (() => {
  const r = semilla(11);
  const base = communityTotals(USUARIOS, AHORA);
  return Array.from({ length: 60 }, (_, index) => {
    const t = AHORA - (60 - index) * DIA;
    const ola = [0.85, 0.9, 0.95, 1, 1.05, 1.25, 1.2][new Date(t).getDay()];
    const foto = buildDailySnapshot(base, 61, t);
    return { ...foto, active24h: Math.max(3, Math.round((9 + index * 0.18) * ola + (r() - 0.5) * 5)), active7: 20 + Math.round(index / 5) };
  }).filter((_, index) => index % 9 !== 4);
})();

const enlace = (uid: string, n: number, gameName: string, days: number) =>
  ({ uid, token: `${uid}-${n}`, gameId: n, gameName, createdAt: AHORA - n * DIA, expiresAt: AHORA + days * DIA }) as AdminShareRow;
const ENLACES: Record<string, AdminShareRow[]> = {
  'uid-0': [enlace('uid-0', 1, 'Outer Wilds', 20), enlace('uid-0', 2, 'Hades', 20), enlace('uid-0', 3, 'Celeste', 20)],
  'uid-3': [enlace('uid-3', 1, 'Elden Ring', 5), enlace('uid-3', 2, 'Tunic', 5)],
};

const AVISO = {
  id: 'mantenimiento',
  kicker: 'Aviso',
  title: 'Mantenimiento el sábado',
  body: 'La sincronización puede tardar un rato.',
  url: 'https://example.com',
  icon: 'info',
  active: true,
  repeats: 3,
  intervalHours: 24,
  updatedAt: AHORA - 2 * DIA,
  startsAt: 0,
  endsAt: 0,
  audience: 'all',
} as Announcement;

const ENTRADAS: AdminLogEntry[] = [
  { id: 'e1', at: AHORA - 40 * 60_000, kind: 'tier', text: 'Rango: Bronce → Plata', targetUid: 'uid-15', targetName: 'Hugo', undo: { action: 'tier', profileDocId: 'uid-15', tier: 'bronze' }, undone: false },
  { id: 'e2', at: AHORA - 42 * 60_000, kind: 'photo', text: 'Foto de más retirada', targetUid: 'uid-28', targetName: 'Marina', undo: null, undone: false },
  { id: 'e3', at: AHORA - 26 * 3600_000, kind: 'shares', text: 'Enlace retirado', targetUid: 'uid-27', targetName: 'Raúl', undo: null, undone: false },
  { id: 'e4', at: AHORA - 27 * 3600_000, kind: 'social', text: 'Social suspendido', targetUid: 'uid-20', targetName: 'Laura V.', undo: { action: 'social', profileDocId: 'uid-20', enabled: true }, undone: false },
];

const K = ADMIN_SHELL_UI.capacity;
const medidor = (id: keyof typeof K.meters, source: HealthMeterView['source'], used: number | null, limit: number, home = false): HealthMeterView => ({
  id,
  source,
  used,
  limit,
  status: used === null ? 'not-configured' : 'ok',
  resetsAt: used === null ? 0 : AHORA + 8 * 3600_000,
  previous: id === 'covers' ? 431 : null,
  label: K.meters[id],
  sourceLabel: K.sources[source],
  home,
});
const MEDIDORES: HealthMeterView[] = [
  medidor('covers', 'covers', 588, 700),
  medidor('kv-reads', 'cloudflare', 18_420, 100_000),
  medidor('kv-writes', 'cloudflare', 742, 1_000, true),
  medidor('functions', 'cloudflare', 9_870, 100_000),
];

// ─── El contexto de mentira ──────────────────────────────────────────────────────────────────────────────────

type Vm = ReturnType<typeof useAdminViewModel>;

/** El nombre de su cuenta de Google, que no tiene por qué coincidir con el del perfil social. */
const APELLIDOS = ['García', 'López', 'Martín', 'Sánchez', 'Romero', 'Navarro', 'Torres'];

/**
 * Las cuentas de Firebase Auth: las de los perfiles inventados (con su último uso) y unas pocas que solo entraron
 * con Google, para que salgan los cuatro estados — caducada, a punto, activa y protegida.
 */
const CUENTAS: AdminAccount[] = (() => {
  const conPerfil = USUARIOS.map((user, i): AdminAccount => ({
    uid: user.uid,
    email: `${user.displayName.toLowerCase().replace(/[^a-z]/g, '')}@ejemplo.com`,
    displayName: `${user.displayName.replace(/ \p{Lu}\.$/u, '')} ${APELLIDOS[i % APELLIDOS.length]}`,
    photoURL: '',
    createdAt: user.createdAt,
    authLastUsedAt: user.updatedAt,
    profile: user.socialEnabled ? 'social' : 'suspended',
    profileUpdatedAt: user.updatedAt,
    hasBallot: user.uid === 'uid-5',
    premiosParticipant: false,
    admin: user.uid === 'uid-1',
    disabled: false,
  }));
  const soloGoogle = (uid: string, displayName: string, dias: number, extra: Partial<AdminAccount> = {}): AdminAccount => ({
    uid,
    email: `${uid}@ejemplo.com`,
    displayName,
    photoURL: '',
    createdAt: AHORA - (dias + 30) * DIA,
    authLastUsedAt: AHORA - dias * DIA,
    profile: null,
    profileUpdatedAt: 0,
    hasBallot: false,
    premiosParticipant: false,
    admin: false,
    disabled: false,
    ...extra,
  });
  return [
    ...conPerfil,
    // Un perfil que lleva más de un año parado.
    { ...soloGoogle('uid-viejo', 'Rocío', 400), profile: 'social', profileUpdatedAt: AHORA - 400 * DIA },
    soloGoogle('uid-g1', 'Gonzalo', 75),
    soloGoogle('uid-g2', 'Inés', 92),
    soloGoogle('uid-g3', 'Mateo', 45),
    soloGoogle('uid-g4', 'Lidia', 3),
    soloGoogle('uid-g5', 'Teo', 120, { premiosParticipant: true }),
  ];
})();

function useFakeAccounts(notify: (toast: AdminToast) => void): AdminAccountsState {
  const [cuentas, setCuentas] = useState(CUENTAS);
  const census = useMemo(() => ({ fetchedAt: AHORA, accounts: cuentas, orphanProfiles: 1 }), [cuentas]);
  const accounts = useMemo<AdminAccountView[]>(
    () => sortAccounts(cuentas.map((account) => ({ ...account, verdict: judgeRetention(retentionFactsOf(account), AHORA) }))),
    [cuentas],
  );
  const expired = accounts.filter((account) => account.verdict.state === 'expired');
  return {
    status: 'ok',
    failure: '',
    census,
    accounts,
    byUid: new Map(accounts.map((account) => [account.uid, account])),
    expired,
    expiring: accounts.filter((account) => account.verdict.state === 'expiring'),
    loading: false,
    purging: false,
    refresh: async () => {},
    purge: async (targets) => {
      const fuera = new Set(targets.map((account) => account.uid));
      setCuentas((list) => list.filter((account) => !fuera.has(account.uid)));
      notify({ text: 'Borradas (maqueta).', kind: 'ok' });
      return { deleted: targets.length, skipped: 0, failed: 0 };
    },
  };
}

function useFakePanel(notify: (toast: AdminToast) => void): Omit<AdminPanelContextValue, 'notify' | 'confirm' | 'openSearch'> {
  const [users, setUsers] = useState(USUARIOS);
  const [entries, setEntries] = useState(ENTRADAS);
  const [todos, setTodos] = useState<AdminTodo[]>([
    { id: 't1', text: 'Retirar la cota de logros sin primera foto', due: localDayKey(AHORA + 14 * DIA), done: false, createdAt: 0 },
    { id: 't2', text: 'Pages en «Fail open» tras desplegar la degradación', due: '', done: false, createdAt: 0 },
    { id: 't3', text: 'Cerrar la votación de los retos', due: localDayKey(AHORA), done: false, createdAt: 0 },
  ]);
  const [announcement, setAnnouncement] = useState<Announcement | null | undefined>(AVISO);
  const census = useMemo(() => censoDe(users), [users]);

  const patch = useCallback((id: string, change: Partial<AdminUserRow>) => {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...change } : u)));
  }, []);
  const apuntar = useCallback((entry: Omit<AdminLogEntry, 'id' | 'at' | 'undone'>) => {
    const saved: AdminLogEntry = { ...entry, id: `m${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), undone: false };
    setEntries((list) => [saved, ...list]);
    return saved;
  }, []);
  const deshacer = useCallback(async (entry: AdminLogEntry) => {
    if (!entry.undo) return;
    if (entry.undo.action === 'tier') patch(entry.undo.profileDocId, { tier: entry.undo.tier as ProfileTier });
    else patch(entry.undo.profileDocId, { socialEnabled: entry.undo.enabled });
    setEntries((list) => list.map((item) => (item.id === entry.id ? { ...item, undone: true } : item)));
    notify({ kind: 'ok', text: ADMIN_SHELL_UI.log.undone(entry.text) });
  }, [notify, patch]);
  const ok = (text: string) => notify({ kind: 'ok', text });

  const signalCounts = new Map<AdminAnomaly, number>();
  users.forEach((u) => u.anomalies.forEach((code) => signalCounts.set(code, (signalCounts.get(code) || 0) + 1)));

  const vm = {
    access: 'granted',
    ownUid: 'uid-1',
    census,
    loadedAt: AHORA - 4 * 60_000,
    loading: false,
    error: '',
    status: null,
    signalCounts,
    busyId: '',
    refresh: async () => ok('Censo releído (maqueta).'),
    changeTier: async (row: AdminUserRow, tier: ProfileTier) => {
      patch(row.id, { tier });
      const entry = apuntar({
        kind: 'tier',
        text: ADMIN_SHELL_UI.log.texts.tier(PROFILE_TIER_LABELS[row.tier], PROFILE_TIER_LABELS[tier]),
        targetUid: row.uid,
        targetName: row.displayName,
        undo: { action: 'tier', profileDocId: row.id, tier: row.tier },
      });
      notify({ kind: 'ok', text: `Rango cambiado a ${PROFILE_TIER_LABELS[tier]}.`, undo: () => deshacer(entry) });
    },
    toggleSocial: async (row: AdminUserRow) => {
      patch(row.id, { socialEnabled: !row.socialEnabled });
      const entry = apuntar({
        kind: 'social',
        text: row.socialEnabled ? ADMIN_SHELL_UI.log.texts.socialOff : ADMIN_SHELL_UI.log.texts.socialOn,
        targetUid: row.uid,
        targetName: row.displayName,
        undo: { action: 'social', profileDocId: row.id, enabled: row.socialEnabled },
      });
      notify({ kind: 'ok', text: row.socialEnabled ? 'Social desactivado.' : 'Social reactivado.', undo: () => deshacer(entry) });
    },
    purgeLegacy: async (row: AdminUserRow) => {
      patch(row.id, { legacy: { email: false, gamesGistId: false, token: false }, anomalies: row.anomalies.filter((a) => !a.startsWith('legacy')) });
      ok('Campos legacy purgados.');
    },
    migrateIdentity: async () => ok('Identidad migrada.'),
    healIdentity: async () => ok('Identidad propagada a 4 amistades.'),
    chooseDisplayName: async () => ok('Nombre fijado.'),
    purgeFossilRequests: async () => ok('2 solicitudes fosilizadas borradas.'),
    clearStrayPhoto: async (row: AdminUserRow) => {
      patch(row.id, { anomalies: row.anomalies.filter((a) => a !== 'stray-photo') });
      ok('Foto retirada.');
    },
    clearAllStrayPhotos: async () => {
      setUsers((list) => list.map((u) => ({ ...u, anomalies: u.anomalies.filter((a) => a !== 'stray-photo') })));
      ok('Fotos retiradas: 2.');
    },
    clearingStrayPhotos: false,
    clearAchievements: async () => ok('Espejo de logros borrado.'),
    deleteUser: async (row: AdminUserRow) => {
      setUsers((list) => list.filter((u) => u.id !== row.id));
      ok('Perfil y amistades borrados.');
    },
    undoLogged: deshacer,
    bulkBusy: false,
    bulkSetTier: async (rows: readonly AdminUserRow[], tier: ProfileTier) => {
      rows.forEach((row) => patch(row.id, { tier }));
      ok(ADMIN_SHELL_UI.users.bulk.done(rows.length, rows.length));
    },
    bulkDisableSocial: async (rows: readonly AdminUserRow[]) => {
      rows.forEach((row) => patch(row.id, { socialEnabled: false }));
      ok(ADMIN_SHELL_UI.users.bulk.done(rows.length, rows.length));
    },
  } as unknown as Vm;

  const data: AdminPanelData = {
    shares: { byUser: ENLACES, banned: new Set(['uid-26']), overrides: { 'uid-3': { maxActive: 5, ttlDays: 30 } }, summary: { total: 5, complete: true } },
    loadShares: async () => {},
    coverStats: { dia: localDayKey(AHORA), gastado: 588, techo: 700, quedan: 112 },
    premiosStatus: { stage: 'open', closesAt: AHORA + 3 * DIA },
    loadPremiosStatus: async () => {},
    refreshPremiosStatus: () => {},
    announcement,
    setAnnouncement,
    loadAnnouncement: async () => {},
  };

  const totals = communityTotals(users, AHORA);
  const today = localDayKey(AHORA);
  const insights: AdminInsights = {
    now: AHORA,
    totals,
    snapshots: [...FOTOS, buildDailySnapshot(totals, 61, AHORA)],
    yesterday: previousSnapshot(FOTOS, AHORA),
    todos,
    todosError: '',
    dueTodos: todos.filter((t) => !t.done && t.due && t.due <= today).length,
    addTodo: async (text, due) => setTodos((list) => [...list, { id: `t${list.length + 1}`, text, due, done: false, createdAt: Date.now() }]),
    toggleTodo: async (id) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
    removeTodo: async (id) => setTodos((list) => list.filter((t) => t.id !== id)),
  };

  const itad = { status: 'ok' as const, calls: 340, callsYesterday: 510, denied: 0, deniedYesterday: 2, resetsAt: Math.ceil(AHORA / 86_400_000) * 86_400_000 };
  const health: AdminHealthState = { meters: MEDIDORES, itad, fetchedAt: AHORA - 2 * 60_000, loading: false, unreachable: false, refresh: async () => {} };
  const log: AdminLogState = { entries, error: '', load: async () => {}, record: async (draft) => apuntar(draft), undo: deshacer };
  const copyUid = async () => ok('Identificador copiado.');
  const runShareAction = async (action: () => Promise<string>) => ok(await action().catch(() => 'Hecho (maqueta).'));

  const accounts = useFakeAccounts(notify);

  return { vm, data, insights, health, accounts, log, copyUid, runShareAction };
}

// ─── El marco: el mismo que pinta `AdminHub` ─────────────────────────────────────────────────────────────────

function Panel() {
  const location = useLocation();
  const { screen } = matchAdminPath(location.pathname);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const [pending, setPending] = useState<AdminConfirmRequest | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const notify = useCallback((next: AdminToast) => setToast(next), []);
  const fake = useFakePanel(notify);
  const value: AdminPanelContextValue = { ...fake, notify, confirm: setPending, openSearch: () => setSearchOpen(true) };
  const counts = {
    today: { value: (fake.insights.totals?.severe || 0) + fake.insights.dueTodos },
    users: { value: fake.vm.census?.totals.flagged || 0, soft: true },
    accounts: { value: fake.accounts.expired.length },
  };

  return (
    <AdminPanelContext.Provider value={value}>
      <section className="admin-hub adm-shell" aria-label="Panel de administración">
        <AdminNav current={screen} counts={counts} onSearch={() => setSearchOpen(true)} />
        <div className="adm-main">
          <Routes>
            <Route path="/admin" element={<AdminTodayScreen />} />
            <Route path="/admin/usuarios" element={<AdminUsersScreen />} />
            <Route path="/admin/usuarios/:userId" element={<AdminUsersScreen />} />
            <Route path="/admin/cuentas" element={<AdminAccountsScreen />} />
            <Route path="/admin/comunidad" element={<AdminCommunityScreen />} />
            <Route path="/admin/capacidad" element={<AdminCapacityScreen />} />
            <Route path="/admin/registro" element={<AdminLogScreen />} />
            <Route
              path="/admin/aviso"
              element={
                <AdminAnnouncement
                  current={fake.data.announcement}
                  onSave={async (next) => {
                    fake.data.setAnnouncement(next);
                    return next;
                  }}
                  loadHistory={async () => [{ ...AVISO, id: 'votar-2026', title: 'Ya puedes votar en los retos', active: false }]}
                />
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
        <AdminSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <AdminConfirmDialog request={pending} onClose={() => setPending(null)} />
        <AdminToastView toast={toast} onDismiss={() => setToast(null)} />
      </section>
    </AdminPanelContext.Provider>
  );
}

// ─── Barra de la maqueta ─────────────────────────────────────────────────────────────────────────────────────

const TEMAS = ['tierramedia', 'arcade', 'witcher', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'];

function Barra() {
  const ir = (cambios: Record<string, string>) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.location.href = u.toString();
  };
  const raiz = document.documentElement;
  const caja: CSSProperties = { font: '12px/1.2 system-ui, sans-serif', padding: '4px 6px', borderRadius: 6, border: '1px solid #555', background: '#1b1d22', color: '#eee' };
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: 8, borderRadius: 10, background: 'rgba(15,16,20,.92)', boxShadow: '0 6px 20px rgba(0,0,0,.4)', maxWidth: 'calc(100vw - 24px)' }}>
      <select aria-label="Pantalla" style={caja} value={pantalla in PANTALLAS ? pantalla : 'hoy'} onChange={(e) => ir({ pantalla: e.target.value, ficha: '' })}>
        {Object.keys(PANTALLAS).map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <select aria-label="Tema" style={caja} value={raiz.dataset.palette || 'tierramedia'} onChange={(e) => ir({ 'gl-palette': e.target.value })}>
        {TEMAS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="button" style={{ ...caja, cursor: 'pointer' }} onClick={() => ir({ 'gl-theme': raiz.dataset.theme === 'light' ? 'dark' : 'light' })}>
        {raiz.dataset.theme === 'light' ? 'Claro → oscuro' : 'Oscuro → claro'}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter initialEntries={[inicio]}>
    <IconSprite />
    <IconSpriteRest />
    <main id="contenido" className="main main-settings main-admin">
      <Panel />
    </main>
    {params.get('barra') !== '0' ? <Barra /> : null}
  </MemoryRouter>,
);
