import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ADMIN_ANNOUNCEMENT_UI, ADMIN_PANEL_UI, ADMIN_SHARES_UI, ADMIN_SHELL_UI } from '../../src/core/constants/adminLabels';
import {
  PROFILE_TIER_LABELS,
  PROFILE_TIER_SHARE_MAX_ACTIVE,
  PROFILE_TIER_SHARE_TTL_DAYS,
} from '../../src/core/constants/tiers';
import type { AdminAnomaly } from '../../src/model/types/firestore';

// La sesión y el repositorio se controlan desde el test: aquí se comprueba la PUERTA y el cableado de la tabla,
// no Firestore (eso lo cubre tests/unit/adminRepository.test.ts y las reglas en tests/integration).
let emitAuth: (user: { uid: string; email: string; displayName: string; photoURL: string } | null) => void = () => {};

// EL CLAIM, NO EL CORREO. La puerta del panel pregunta por el custom claim `admin` del token (ver
// `src/core/security/admin.ts`), así que lo que el test controla es la RESPUESTA A ESA PREGUNTA, no qué cuenta
// inicia sesión. `readAdminClaimMock` recibe el `forceRefresh`, y eso permite montar el caso que de verdad
// importa: el claim que solo aparece al refrescar el token.
const readAdminClaimMock = vi.fn<(forceRefresh?: boolean) => Promise<boolean>>(async () => false);

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  // El cromo pregunta si hay sesión guardada para decidir si refresca la entrada de premios
  // (`usePremiosVisible`). Sin esto, montar la aplicación en un test revienta con «No export is defined».
  hasStoredAuthSession: () => false,
  // Dentro de `act`: el callback cambia el estado del panel en el acto, y fuera de él React avisa en cada test.
  subscribeSocialAuth: (callback: (user: unknown) => void) => {
    emitAuth = (user) => act(() => callback(user));
    return () => {};
  },
  readAdminClaim: (forceRefresh?: boolean) => readAdminClaimMock(forceRefresh),
}));

const loadAdminCensusMock = vi.fn<(...args: unknown[]) => unknown>();
const setUserSocialEnabledMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const purgeLegacyProfileFieldsMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const deleteUserProfileMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; failures: string[] }>>(async () => ({
  ok: true,
  failures: [],
}));
const setUserTierMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const migrateForeignProfileDocMock = vi.fn<(...args: unknown[]) => Promise<{ outcome: string; carried: string[] }>>(
  async () => ({ outcome: 'moved', carried: [] }),
);
type SweepResult = { ok: boolean; failures: string[]; touched: number; scanned: number };
const healUserFriendshipIdentityMock = vi.fn<(...args: unknown[]) => Promise<SweepResult>>(async () => ({
  ok: true, failures: [], touched: 2, scanned: 2,
}));
const purgeFossilFriendshipRequestsMock = vi.fn<(...args: unknown[]) => Promise<SweepResult>>(async () => ({
  ok: true, failures: [], touched: 3, scanned: 3,
}));
const setUserDisplayNameMock = vi.fn<(...args: unknown[]) => Promise<SweepResult>>(async () => ({
  ok: true, failures: [], touched: 2, scanned: 2,
}));

// La relectura de UNA ficha tras una acción. Por defecto relee del mismo sitio que el censo (la ficha tal y como la
// devuelva ahora `loadAdminCensusMock`), para que los casos que cambian el censo tras la acción sigan valiendo.
const readAdminCensusRowMock = vi.fn(async (_census: unknown, id: string) => {
  const next = (await loadAdminCensusMock()) as { users: Array<{ id: string }> };
  return { id, row: next.users.find((entry) => entry.id === id) || null };
});

const clearStrayProfilePhotoMock = vi.fn<(...args: unknown[]) => Promise<SweepResult & { profileCleared: boolean }>>(
  async () => ({ ok: true, failures: [], touched: 0, scanned: 1, profileCleared: true }),
);

const clearProfileAchievementsMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/firebaseAdminRepository', async (importOriginal) => ({
  clearProfileAchievements: (...args: unknown[]) => clearProfileAchievementsMock(...args),
  clearAllAchievements: vi.fn(async () => 0),
  clearStrayProfilePhoto: (...args: unknown[]) => clearStrayProfilePhotoMock(...args),
  ADMIN_PROFILES_LIMIT: 300,
  loadAdminCensus: (...args: unknown[]) => loadAdminCensusMock(...args),
  readAdminCensusRow: (census: unknown, id: string) => readAdminCensusRowMock(census, id),
  // Colocar la ficha es puro: el de verdad.
  replaceCensusRow: (await importOriginal<typeof import('../../src/model/repository/firebaseAdminRepository')>()).replaceCensusRow,
  setUserSocialEnabled: (...args: unknown[]) => setUserSocialEnabledMock(...args),
  purgeLegacyProfileFields: (...args: unknown[]) => purgeLegacyProfileFieldsMock(...args),
  deleteUserProfile: (...args: unknown[]) => deleteUserProfileMock(...args),
  setUserTier: (...args: unknown[]) => setUserTierMock(...args),
  migrateForeignProfileDoc: (...args: unknown[]) => migrateForeignProfileDocMock(...args),
  healUserFriendshipIdentity: (...args: unknown[]) => healUserFriendshipIdentityMock(...args),
  purgeFossilFriendshipRequests: (...args: unknown[]) => purgeFossilFriendshipRequestsMock(...args),
  setUserDisplayName: (...args: unknown[]) => setUserDisplayNameMock(...args),
}));

// Los enlaces compartidos son otra fuente (el Worker, no Firestore) y se piden al montar el panel. Se controlan
// desde aquí para poder comprobar la cuota que enseña cada ficha; sin el mock, el `fetch` real fallaría y la
// sección quedaría siempre vacía.
const listAllSharesMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
  shares: [], bans: [], overrides: {}, cursor: null, complete: true,
}));
const setQuotaOverrideMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const clearQuotaOverrideMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/shareAdminRepository', () => ({
  listAllShares: (...args: unknown[]) => listAllSharesMock(...args),
  adminRemoveShare: vi.fn(async () => {}),
  banUser: vi.fn(async () => 0),
  unbanUser: vi.fn(async () => {}),
  setQuotaOverride: (...args: unknown[]) => setQuotaOverrideMock(...args),
  clearQuotaOverride: (...args: unknown[]) => clearQuotaOverrideMock(...args),
}));

// jsdom no trae portapapeles: el botón de copiar el uid lo necesita para poder comprobarse.
const writeTextMock = vi.fn(async () => {});
Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });

// El aviso publicado se lee de `/api/announcement`. Aquí se controla CUÁNDO llega, que es de lo que va el caso.
const loadAnnouncementMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null);
const saveAnnouncementMock = vi.fn(async (next: unknown) => next);
vi.mock('../../src/model/repository/announcementRepository', () => ({
  loadAnnouncement: (...args: unknown[]) => loadAnnouncementMock(...args),
  loadAnnouncementForAdmin: (...args: unknown[]) => loadAnnouncementMock(...args),
  saveAnnouncement: (next: unknown) => saveAnnouncementMock(next),
  loadAnnouncementHistory: vi.fn(async () => []),
}));

// El estado de los retos para la línea del menú: un documento de Firestore que aquí se sirve a mano.
const fetchVotingConfigMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null);
vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  fetchVotingConfig: (...args: unknown[]) => fetchVotingConfigMock(...args),
}));

// LO QUE EL PANEL GUARDA PARA SÍ (pendientes, foto diaria y registro): en memoria, para poder comprobar qué se
// apunta y qué se deshace sin Firestore.
const appendAdminLogMock = vi.fn(async (entry: Record<string, unknown>) => ({ ...entry, id: `log-${appendAdminLogMock.mock.calls.length}`, undone: false }));
const markAdminLogUndoneMock = vi.fn(async () => {});
const saveDailySnapshotMock = vi.fn(async () => {});
const loadDailySnapshotsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
const saveAdminTodosMock = vi.fn(async (items: unknown[]) => items);
vi.mock('../../src/model/repository/admin/adminPanelStore', () => ({
  loadAdminTodos: vi.fn(async () => []),
  saveAdminTodos: (items: unknown[]) => saveAdminTodosMock(items),
  loadDailySnapshots: (...args: unknown[]) => loadDailySnapshotsMock(...args),
  saveDailySnapshot: () => saveDailySnapshotMock(),
  loadAdminLog: vi.fn(async () => []),
  appendAdminLog: (entry: Record<string, unknown>) => appendAdminLogMock(entry),
  markAdminLogUndone: () => markAdminLogUndoneMock(),
}));

// Capacidad: el endpoint no existe en los tests (ni en desarrollo); el panel tiene que seguir en pie sin él.
vi.mock('../../src/model/repository/adminHealthRepository', () => ({ loadAdminHealth: vi.fn(async () => null) }));
vi.mock('../../src/model/repository/coverStatsRepository', () => ({ leerGastoDeCaratulas: vi.fn(async () => null) }));

import { AdminHub } from '../../src/view/components/AdminHub';
import { ADMIN_PATHS } from '../../src/core/admin/adminRoutes';
import { useAdminViewModel } from '../../src/viewmodel/useAdminViewModel';

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uid-a',
    uid: 'uid-a',
    displayName: 'Ada',
    knownAs: '',
    friendKnownNames: [] as string[],
    friendKnownPhotos: [] as string[],
    photoURL: '',
    socialEnabled: true,
    socialGistId: 'g1',
    tier: 'bronze' as const,
    idMatchesUid: true,
    updatedAt: 1_700_000_000_000,
    friends: 2,
    pending: 1,
    pendingOut: 1,
    pendingIn: 0,
    profileId: 'p-ada',
    schemaVersion: 1,
    hasPhoto: false,
    createdAt: 1_690_000_000_000,
    estimatedFirstSeenAt: 0,
    lastFriendshipAt: 1_695_000_000_000,
    friendSocialGistIds: [] as string[],
    friendGamesGistIds: [] as string[],
    stalePendingOut: 0,
    fossilPendingOut: 0,
    canonicalTwinFound: false,
    anomalies: [] as AdminAnomaly[],
    legacy: { email: false, gamesGistId: false, token: false },
    ...overrides,
  };
}

function census(users: ReturnType<typeof user>[]) {
  return {
    users,
    truncated: false,
    totals: {
      profiles: users.length,
      socialEnabled: users.length,
      friendships: 1,
      pending: 0,
      legacy: 0,
      flagged: users.filter((entry) => entry.anomalies.length > 0).length,
      byTier: { bronze: users.length, silver: 0, gold: 0, mithril: 0 },
    },
  };
}

/** El panel en una dirección. Por defecto, la ficha de Ada abierta sobre la tabla: es donde viven las acciones. */
function renderHub(path = '/admin/usuarios/uid-a') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminHub />} />
        <Route path="/completados" element={<div>LISTAS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** La ficha lateral de esa persona, ya pintada. */
async function ficha(name = 'Ada') {
  return within(await screen.findByRole('complementary', { name: ADMIN_SHELL_UI.detail.aria(name) }));
}

/** Los nombres de la tabla, en el orden en que salen. */
function namesInTable(): string[] {
  return within(screen.getByRole('table'))
    .getAllByRole('button', { name: /^Abrir la ficha de / })
    .map((button) => (button.getAttribute('aria-label') || '').replace(/^Abrir la ficha de /, ''));
}

/** Sesión CON el claim de administrador. El correo ya no decide nada; se deja por realismo del objeto. */
function signInAsAdmin() {
  readAdminClaimMock.mockResolvedValue(true);
  emitAuth({ uid: 'uid-admin', email: 'quien.manda@example.com', displayName: '', photoURL: '' });
}

/** Sesión SIN el claim: una cuenta cualquiera que ha encontrado la ruta oculta. */
function signInAsVisitor() {
  readAdminClaimMock.mockResolvedValue(false);
  emitAuth({ uid: 'uid-visita', email: 'otra.persona@example.com', displayName: '', photoURL: '' });
}

beforeEach(() => {
  appendAdminLogMock.mockClear();
  markAdminLogUndoneMock.mockClear();
  saveDailySnapshotMock.mockClear();
  loadDailySnapshotsMock.mockReset();
  loadDailySnapshotsMock.mockResolvedValue([]);
  readAdminCensusRowMock.mockClear();
});

describe('AdminHub — puerta de acceso', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    setUserSocialEnabledMock.mockClear();
    purgeLegacyProfileFieldsMock.mockClear();
    deleteUserProfileMock.mockClear();
    setUserTierMock.mockClear();
    readAdminClaimMock.mockReset();
    readAdminClaimMock.mockResolvedValue(false);
  });

  it('mientras la sesión se resuelve no decide nada (ni panel ni expulsión)', () => {
    renderHub();
    expect(screen.getByText(ADMIN_PANEL_UI.checking)).toBeInTheDocument();
    expect(screen.queryByText('LISTAS')).not.toBeInTheDocument();
  });

  it('expulsa a quien no es el administrador y NO consulta Firestore', async () => {
    renderHub();
    signInAsVisitor();

    expect(await screen.findByText('LISTAS')).toBeInTheDocument();
    expect(loadAdminCensusMock).not.toHaveBeenCalled();
  });

  it('expulsa también sin sesión iniciada, desde cualquier pantalla del panel', async () => {
    renderHub('/admin/comunidad');
    emitAuth(null);
    expect(await screen.findByText('LISTAS')).toBeInTheDocument();
  });

  it('con la cuenta de administrador carga el censo', async () => {
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();

    expect(await screen.findByRole('button', { name: ADMIN_SHELL_UI.users.openOne('Ada') })).toBeInTheDocument();
    expect(loadAdminCensusMock).toHaveBeenCalledTimes(1);
  });

  // Un claim recién asignado no aparece en el ID token cacheado (Firebase lo guarda hasta una hora): la segunda
  // lectura va forzando el refresco, y es la que tiene que abrir.
  it('entra cuando el claim solo aparece al refrescar el token', async () => {
    readAdminClaimMock.mockReset();
    readAdminClaimMock.mockImplementation(async (forceRefresh?: boolean) => forceRefresh === true);
    renderHub(ADMIN_PATHS.users);
    emitAuth({ uid: 'uid-admin', email: 'quien.manda@example.com', displayName: '', photoURL: '' });

    expect(await screen.findByRole('button', { name: ADMIN_SHELL_UI.users.openOne('Ada') })).toBeInTheDocument();
    expect(readAdminClaimMock).toHaveBeenCalledWith(undefined);
    expect(readAdminClaimMock).toHaveBeenCalledWith(true);
  });
});

// RUTAS REALES: cada pantalla en su dirección, con su entrada del menú marcada. Antes era una vista guardada en un
// estado y recargar sacaba del panel.
describe('AdminHub — rutas y menú', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    readAdminClaimMock.mockReset();
  });

  it.each([
    [ADMIN_PATHS.today, ADMIN_SHELL_UI.nav.screens.today, ADMIN_SHELL_UI.today.title],
    [ADMIN_PATHS.users, ADMIN_SHELL_UI.nav.screens.users, ADMIN_SHELL_UI.users.title],
    [ADMIN_PATHS.community, ADMIN_SHELL_UI.nav.screens.community, ADMIN_SHELL_UI.community.title],
    [ADMIN_PATHS.capacity, ADMIN_SHELL_UI.nav.screens.capacity, ADMIN_SHELL_UI.capacity.title],
    [ADMIN_PATHS.log, ADMIN_SHELL_UI.nav.screens.log, ADMIN_SHELL_UI.log.title],
  ])('%s abre su pantalla y la marca en el menú', async (path, menuLabel, heading) => {
    renderHub(path);
    signInAsAdmin();

    expect(await screen.findByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: ADMIN_SHELL_UI.nav.aria });
    expect(within(menu).getByRole('link', { name: new RegExp(`^${menuLabel}`) })).toHaveAttribute('aria-current', 'page');
  });

  it('una dirección del panel que no existe lleva a la portada', async () => {
    renderHub('/admin/no-existe');
    signInAsAdmin();
    expect(await screen.findByRole('heading', { level: 2, name: ADMIN_SHELL_UI.today.title })).toBeInTheDocument();
  });

  it('pulsar una fila abre su ficha en su propia dirección, y cerrarla vuelve a la tabla', async () => {
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();

    await userEvent.click(await screen.findByRole('button', { name: ADMIN_SHELL_UI.users.openOne('Ada') }));
    const detalle = await ficha('Ada');
    await userEvent.click(detalle.getByRole('button', { name: ADMIN_SHELL_UI.detail.closeAria }));
    expect(screen.queryByRole('complementary', { name: ADMIN_SHELL_UI.detail.aria('Ada') })).not.toBeInTheDocument();
  });

  it('una ficha que no está en el censo lo dice en vez de quedarse en blanco', async () => {
    renderHub('/admin/usuarios/nadie');
    signInAsAdmin();
    expect(await screen.findByText(ADMIN_SHELL_UI.detail.notFound)).toBeInTheDocument();
  });
});

describe('AdminHub — moderación', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    setUserSocialEnabledMock.mockClear();
    purgeLegacyProfileFieldsMock.mockClear();
    deleteUserProfileMock.mockClear();
    deleteUserProfileMock.mockResolvedValue({ ok: true, failures: [] });
    setUserTierMock.mockClear();
    migrateForeignProfileDocMock.mockClear();
    migrateForeignProfileDocMock.mockResolvedValue({ outcome: 'moved', carried: [] });
  });

  // CUTOVER DE IDENTIDAD: la acción borra un documento, así que la ficha tiene que decir a dónde va y qué hará.
  it('migra la identidad de un perfil que vive bajo otro id, tras confirmar', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub('/admin/usuarios/doc-legacy');
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByText(ADMIN_PANEL_UI.cutover.targetCanonical)).toBeInTheDocument();
    expect(detalle.getByText(ADMIN_PANEL_UI.cutover.outcomeMove)).toBeInTheDocument();
    expect(screen.queryByText('doc-legacy')).not.toBeInTheDocument();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.cutover.btn }));
    expect(migrateForeignProfileDocMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(migrateForeignProfileDocMock).toHaveBeenCalledWith('doc-legacy', 'uid-a'));
    expect(await screen.findByText(ADMIN_PANEL_UI.cutover.okMoved)).toBeInTheDocument();
  });

  it('no ofrece migrar cuando el documento no dice de quién es', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-huerfano', uid: 'doc-huerfano', idMatchesUid: false, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub('/admin/usuarios/doc-huerfano');
    signInAsAdmin();
    const detalle = await ficha();

    const blocked = detalle.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.cutover.btn) });
    expect(blocked).toBeDisabled();
    expect(blocked.getAttribute('aria-label')).toContain(ADMIN_PANEL_UI.cutover.unknownUid);
    expect(migrateForeignProfileDocMock).not.toHaveBeenCalled();
  });

  it('ninguna acción se ejecuta sin pasar por la confirmación', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.disableBtn }));
    expect(setUserSocialEnabledMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(setUserSocialEnabledMock).toHaveBeenCalledWith('uid-a', false));
  });

  it('cancelar la confirmación deja al usuario intacto', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmCancel }));
    expect(deleteUserProfileMock).not.toHaveBeenCalled();
  });

  // Borrar un perfil es lo único del panel sin vuelta atrás: no basta un clic, hay que escribir su nombre.
  it('borrar un perfil exige escribir su nombre antes de poder confirmar', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));
    const dialog = within(screen.getByRole('dialog', { name: ADMIN_PANEL_UI.confirmDelete('Ada') }));
    const borrar = dialog.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn });
    expect(borrar).toBeDisabled();
    await userEvent.type(dialog.getByRole('textbox', { name: ADMIN_SHELL_UI.confirm.typeName('Ada') }), 'Ad');
    expect(borrar).toBeDisabled();
    await userEvent.type(dialog.getByRole('textbox', { name: ADMIN_SHELL_UI.confirm.typeName('Ada') }), 'a');
    await userEvent.click(borrar);

    await waitFor(() => expect(deleteUserProfileMock).toHaveBeenCalledWith('uid-a', 'uid-a'));
  });

  it('solo aparece etiqueta (y botón de purga) de los restos que ese perfil arrastra de verdad', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', legacy: { email: true, gamesGistId: false, token: true } })]),
    );
    renderHub('/admin/usuarios/uid-b');
    signInAsAdmin();
    const detalle = await ficha('Bob');

    expect(detalle.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyToken, 'Bob') })).toBeEnabled();
    expect(detalle.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyEmail, 'Bob') })).toBeEnabled();
    expect(
      detalle.queryByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyGamesGist, 'Bob') }),
    ).not.toBeInTheDocument();
    expect(detalle.queryByText(ADMIN_PANEL_UI.legacyNone)).not.toBeInTheDocument();
  });

  it('una ficha sin restos legacy lo dice', async () => {
    renderHub();
    signInAsAdmin();
    expect((await ficha()).getByText(ADMIN_PANEL_UI.legacyNone)).toBeInTheDocument();
  });

  it('purga UN campo, no los tres: el token en claro sin arrastrar el id del gist', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ legacy: { email: true, gamesGistId: true, token: true } })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyToken, 'Ada') }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(purgeLegacyProfileFieldsMock).toHaveBeenCalledWith('uid-a', ['token']));
  });

  it('el email de un perfil que NO se identifica por el uid no se puede purgar: lo dejaría huérfano', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'perfil-legacy', idMatchesUid: false, legacy: { email: true, gamesGistId: false, token: false } })]),
    );
    renderHub('/admin/usuarios/perfil-legacy');
    signInAsAdmin();
    const detalle = await ficha();

    const locked = detalle.getByRole('button', { name: /Purgar email de Ada/ });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleName(new RegExp(ADMIN_PANEL_UI.legacyEmailLocked.slice(0, 40)));
    expect(purgeLegacyProfileFieldsMock).not.toHaveBeenCalled();
  });

  it('un borrado incompleto se avisa en vez de darse por bueno', async () => {
    deleteUserProfileMock.mockResolvedValue({ ok: false, failures: ['amistades: 1 de 2 no se pudieron borrar'] });
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));
    await userEvent.type(screen.getByRole('textbox', { name: ADMIN_SHELL_UI.confirm.typeName('Ada') }), 'Ada');
    await userEvent.click(within(screen.getByRole('dialog', { name: ADMIN_PANEL_UI.confirmDelete('Ada') })).getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));

    expect(await screen.findByText(ADMIN_PANEL_UI.partialDeleted)).toBeInTheDocument();
  });

  it('a quien no tiene nombre en su perfil se le identifica por el que guardaron sus amistades', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ displayName: '', knownAs: 'Ada la del gist' })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha('Ada la del gist');

    expect(detalle.getByText(`· ${ADMIN_PANEL_UI.knownAsHint}`)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.noName)).not.toBeInTheDocument();
  });

  // El uid no se pinta (no se puede hacer nada con él en esta pantalla), pero se sigue pudiendo COPIAR: es la única
  // forma de cruzar una ficha con Firebase Auth, que es donde vive el correo.
  it('sin nombre por ningún lado, el identificador sigue siendo copiable aunque no se vea', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ displayName: '', knownAs: '' })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha(ADMIN_PANEL_UI.noName);
    expect(screen.queryByText('uid-a')).not.toBeInTheDocument();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.copyUidAria(ADMIN_PANEL_UI.noName) }));
    expect(writeTextMock).toHaveBeenCalledWith('uid-a');
  });

  it('cambiar el rango es directo, sin modal: es reversible y no destruye nada', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    const rango = within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') }));
    await userEvent.click(rango.getByRole('button', { name: PROFILE_TIER_LABELS.gold }));

    await waitFor(() => expect(setUserTierMock).toHaveBeenCalledWith('uid-a', 'gold'));
    expect(screen.queryByRole('button', { name: ADMIN_PANEL_UI.confirmAccept })).not.toBeInTheDocument();
  });

  it('Mithril solo se ofrece en la ficha del propio administrador', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user(), user({ id: 'uid-admin', uid: 'uid-admin', displayName: 'Jefe' })]));
    const { unmount } = renderHub();
    signInAsAdmin(); // la sesión de `signIn` es uid-admin
    const ajena = within((await ficha('Ada')).getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') }));
    expect(ajena.getByRole('button', { name: PROFILE_TIER_LABELS.mithril })).toBeDisabled();
    unmount();

    renderHub('/admin/usuarios/uid-admin');
    signInAsAdmin();
    const propia = within((await ficha('Jefe')).getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Jefe') }));
    expect(propia.getByRole('button', { name: PROFILE_TIER_LABELS.mithril })).toBeEnabled();
  });

  // La reserva no puede depender solo de lo que pinte la ficha: el ViewModel la comprueba también.
  it('el ViewModel rechaza Mithril sobre otra cuenta aunque se le pida directamente', async () => {
    const { result } = renderHook(() => useAdminViewModel());
    act(() => signInAsAdmin());
    await waitFor(() => expect(result.current.census).not.toBeNull());

    await act(async () => {
      await result.current.changeTier(result.current.census!.users[0], 'mithril');
    });

    expect(result.current.status?.text).toBe(ADMIN_PANEL_UI.tierReservedWarning);
    expect(setUserTierMock).not.toHaveBeenCalled();
  });

  it('pinta las señales en la tabla con su explicación, y destaca las graves', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ anomalies: ['gist-drift', 'inactive'], friendSocialGistIds: ['gs-viejo'] })]));
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    const tabla = within(await screen.findByRole('table'));

    const grave = tabla.getByText(ADMIN_PANEL_UI.anomalies['gist-drift'].label);
    const leve = tabla.getByText(ADMIN_PANEL_UI.anomalies.inactive.label);
    expect(grave).toHaveAttribute('title', ADMIN_PANEL_UI.anomalies['gist-drift'].hint);
    // La gravedad se distingue por clase, no solo por color.
    expect(grave.className).toContain('is-severe');
    expect(leve.className).not.toContain('is-severe');
  });

  it('en la ficha, los restos legacy salen como botón de purga y no además como píldora', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ anomalies: ['legacy-token', 'inactive'], legacy: { email: false, gamesGistId: false, token: true } })]),
    );
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    const apariciones = detalle.getAllByText(ADMIN_PANEL_UI.legacyToken);
    expect(apariciones).toHaveLength(1);
    expect(apariciones[0].tagName).toBe('BUTTON');
    expect(detalle.getByText(ADMIN_PANEL_UI.anomalies.inactive.label)).toBeInTheDocument();
  });

  it('con deriva de gist dice de dónde sale, sin enseñar los ids', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ socialGistId: 'gs-nuevo', friendSocialGistIds: ['gs-viejo', 'gs-otro'], anomalies: ['gist-drift'] })]),
    );
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    const bloque = within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.gist.driftTitle }));
    expect(bloque.getByText(ADMIN_PANEL_UI.gist.profileGistOwn)).toBeInTheDocument();
    expect(bloque.getByText(ADMIN_PANEL_UI.field.channelMany(2))).toBeInTheDocument();
    expect(screen.queryByText('gs-nuevo')).not.toBeInTheDocument();
    expect(screen.queryByText('gs-viejo')).not.toBeInTheDocument();
    expect(bloque.getByText(ADMIN_PANEL_UI.gist.driftHint)).toBeInTheDocument();
  });

  it('sin deriva no se muestra el bloque de gists', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    expect(detalle.queryByRole('group', { name: ADMIN_PANEL_UI.gist.driftTitle })).not.toBeInTheDocument();
  });

  it('un perfil sin señales no muestra ninguna lista de señales', async () => {
    renderHub();
    signInAsAdmin();
    await ficha();
    expect(screen.queryByRole('list', { name: ADMIN_PANEL_UI.anomalies.aria })).not.toBeInTheDocument();
  });

  it('la ficha dice el alta sellada cuando existe', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ createdAt: 1_690_000_000_000 })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    expect(detalle.getByText(/^Alta el /)).toBeInTheDocument();
  });

  it('sin alta sellada la estima por su amistad más antigua y lo dice', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ createdAt: 0, estimatedFirstSeenAt: 1_688_000_000_000 })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    // Se marca como estimada en la ficha y con `~` en la tabla: no puede confundirse con un dato sellado.
    expect(detalle.getByText(/^Alta hacia el /)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText(/^~ /)).toBeInTheDocument();
  });

  it('sin alta ni amistades lo admite en vez de inventar una fecha', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ createdAt: 0, estimatedFirstSeenAt: 0 })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    expect(detalle.getByText(new RegExp(ADMIN_PANEL_UI.field.createdAtUnknown))).toBeInTheDocument();
  });

  it('el gist del perfil solo aparece si de verdad lo arrastra, y un canal sano no ocupa sitio', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ socialGistId: '', friendSocialGistIds: ['gs-vivo'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.queryByText(ADMIN_PANEL_UI.field.socialGist)).not.toBeInTheDocument();
    expect(screen.queryByText('gs-vivo')).not.toBeInTheDocument();
  });

  it('un perfil que aún publica el id legacy lo dice, sin enseñarlo', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ socialGistId: 'gs-legacy' })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByText(ADMIN_PANEL_UI.field.socialGist)).toBeInTheDocument();
    expect(detalle.getByText(ADMIN_PANEL_UI.field.socialGistPresent)).toBeInTheDocument();
    expect(screen.queryByText('gs-legacy')).not.toBeInTheDocument();
  });

  // Cuando los nombres no coinciden se enseñan LOS DOS, etiquetados por origen: el panel no sabe cuál es el vigente.
  it('enseña los dos nombres cuando no coinciden, y ninguno cuando están de acuerdo', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada Vieja'], anomalies: ['friend-name-mismatch'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByText(ADMIN_PANEL_UI.field.profileNameSource)).toBeInTheDocument();
    expect(detalle.getByText(ADMIN_PANEL_UI.field.staleFriendNames)).toBeInTheDocument();
    expect(detalle.getByText('Ada Vieja')).toBeInTheDocument();
    expect(detalle.getByText(ADMIN_PANEL_UI.field.nameMismatchHint)).toBeInTheDocument();

    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada'] })]));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.refresh) }));
    await waitFor(() => {
      expect(screen.queryByText(ADMIN_PANEL_UI.field.staleFriendNames)).not.toBeInTheDocument();
      expect(screen.queryByText(ADMIN_PANEL_UI.field.profileNameSource)).not.toBeInTheDocument();
    });
  });

  // Se busca por lo que identifica la fila: a quien no tiene nick lo identifica el nombre que le dan sus amigos.
  it('el buscador de la tabla encuentra por el nombre de sus amistades y por el pseudónimo', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ displayName: '', knownAs: 'Ada la del gist', friendKnownNames: ['Ada la del gist'] })]),
    );
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('button', { name: ADMIN_SHELL_UI.users.openOne('Ada la del gist') });

    const search = screen.getByRole('searchbox', { name: ADMIN_SHELL_UI.users.searchAria });
    fireEvent.change(search, { target: { value: 'la del gist' } });
    expect(namesInTable()).toEqual(['Ada la del gist']);

    fireEvent.change(search, { target: { value: 'p-ada' } });
    expect(namesInTable()).toEqual(['Ada la del gist']);

    fireEvent.change(search, { target: { value: 'nadie' } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(ADMIN_SHELL_UI.users.emptyFiltered)).toBeInTheDocument();
  });

  it('un fallo de permisos al cargar se muestra tal cual, sin tabla vacía silenciosa', async () => {
    loadAdminCensusMock.mockRejectedValue(new Error('Sin permisos de administrador para listar los perfiles.'));
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();

    expect(await screen.findByText(/Sin permisos de administrador/)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.empty)).not.toBeInTheDocument();
  });
});

describe('AdminHub — identidad denormalizada y solicitudes fosilizadas', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    healUserFriendshipIdentityMock.mockClear();
    healUserFriendshipIdentityMock.mockResolvedValue({ ok: true, failures: [], touched: 2, scanned: 2 });
    purgeFossilFriendshipRequestsMock.mockClear();
    purgeFossilFriendshipRequestsMock.mockResolvedValue({ ok: true, failures: [], touched: 3, scanned: 3 });
    setUserDisplayNameMock.mockClear();
    setUserDisplayNameMock.mockResolvedValue({ ok: true, failures: [], touched: 2, scanned: 2 });
  });

  it('ofrece propagar la identidad, diciendo en la confirmación qué nombre va a escribir', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada Vieja'], anomalies: ['friend-name-mismatch'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btn }));
    expect(healUserFriendshipIdentityMock).not.toHaveBeenCalled();
    expect(screen.getByText(ADMIN_PANEL_UI.healIdentity.confirmWithName('Ada', 'Ada'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(healUserFriendshipIdentityMock).toHaveBeenCalledWith('uid-a', { name: 'Ada', photoURL: '' }));
    expect(await screen.findByText(ADMIN_PANEL_UI.healIdentity.ok(2))).toBeInTheDocument();
  });

  it('también lo ofrece cuando lo que está rancio es la foto', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ photoURL: 'https://f/nueva.png', friendKnownPhotos: ['https://f/vieja.png'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByText(ADMIN_PANEL_UI.healIdentity.titlePhoto)).toBeInTheDocument();
    expect(detalle.getByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btnPhoto })).toBeInTheDocument();
  });

  // PRIVACIDAD: el panel no lee el interruptor de la foto y la acción no se la pone, así que tampoco se la ofrece.
  it('no ofrece propagar una foto a amistades que no tienen ninguna', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ photoURL: 'https://f/cara.png', hasPhoto: true, friendKnownNames: ['Ada'], friendKnownPhotos: [''] })]),
    );
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.queryByText(ADMIN_PANEL_UI.healIdentity.titlePhoto)).not.toBeInTheDocument();
    expect(detalle.queryByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btnPhoto })).not.toBeInTheDocument();
  });

  it('y al confirmarlo no pregunta por un nombre que nadie discute', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ photoURL: 'https://f/nueva.png', friendKnownPhotos: ['https://f/vieja.png'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btnPhoto }));
    expect(screen.getByText(ADMIN_PANEL_UI.healIdentity.confirmPhoto('Ada'))).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.healIdentity.confirmWithName('Ada', 'Ada'))).not.toBeInTheDocument();
  });

  it('con la identidad al día no se ofrece propagar nada', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada'], friendKnownPhotos: [''] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.queryByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btn })).not.toBeInTheDocument();
    expect(detalle.queryByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btnPhoto })).not.toBeInTheDocument();
  });

  // La señal avisa a los 90 días; el botón de purga espera a los 180.
  it('avisa de las solicitudes rancias sin ofrecer purga hasta los 180 días', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ stalePendingOut: 2, fossilPendingOut: 0, anomalies: ['stale-pending-out'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByText(ADMIN_PANEL_UI.field.stalePendingDetail(2, 0))).toBeInTheDocument();
    expect(detalle.queryByText(ADMIN_PANEL_UI.fossil.title)).not.toBeInTheDocument();
  });

  it('purga las fosilizadas tras confirmar, diciendo cuántas son', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ stalePendingOut: 3, fossilPendingOut: 3, anomalies: ['stale-pending-out'] })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.fossil.btn(3) }));
    expect(purgeFossilFriendshipRequestsMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(purgeFossilFriendshipRequestsMock).toHaveBeenCalledWith('uid-a'));
    expect(await screen.findByText(ADMIN_PANEL_UI.fossil.ok(3))).toBeInTheDocument();
  });

  it('dice si el cutover moverá el documento o lo fusionará con el canónico', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, canonicalTwinFound: true, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub('/admin/usuarios/doc-legacy');
    signInAsAdmin();
    expect((await ficha()).getByText(ADMIN_PANEL_UI.cutover.outcomeMerge)).toBeInTheDocument();

    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, canonicalTwinFound: false, anomalies: ['foreign-doc-id'] })]),
    );
    await userEvent.click(screen.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.refresh) }));
    expect(await screen.findByText(ADMIN_PANEL_UI.cutover.outcomeMove)).toBeInTheDocument();
  });

  it('ofrece los dos nombres en circulación, etiquetados por origen', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ displayName: 'Ada', friendKnownNames: ['Ada Vieja'], anomalies: ['friend-name-mismatch'] })]),
    );
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(detalle.getByRole('button', { name: ADMIN_PANEL_UI.chooseName.btnAria('Ada', 'Ada') })).toBeInTheDocument();
    expect(detalle.getByRole('button', { name: ADMIN_PANEL_UI.chooseName.btnAria('Ada Vieja', 'Ada') })).toBeInTheDocument();
  });

  it('fija el nombre elegido en el perfil y en sus amistades, tras confirmar', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ displayName: 'Ada', photoURL: 'https://f/a.png', friendKnownNames: ['Ada Nueva'], anomalies: ['friend-name-mismatch'] })]),
    );
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.chooseName.btnAria('Ada Nueva', 'Ada') }));
    expect(setUserDisplayNameMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(setUserDisplayNameMock).toHaveBeenCalledWith('uid-a', 'uid-a', 'Ada Nueva', 'https://f/a.png'));
    expect(await screen.findByText(ADMIN_PANEL_UI.chooseName.ok('Ada Nueva', 2))).toBeInTheDocument();
  });

  it('con los nombres de acuerdo no se ofrece elegir', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada'] })]));
    renderHub();
    signInAsAdmin();
    expect((await ficha()).queryByText(ADMIN_PANEL_UI.chooseName.title)).not.toBeInTheDocument();
  });

  it('el canal de listas dice cuántos hay, y no tenerlo no es un fallo', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendGamesGistIds: ['gj-1'] })]));
    const { unmount } = renderHub();
    signInAsAdmin();
    expect((await ficha()).getByText(ADMIN_PANEL_UI.field.channelSingle)).toBeInTheDocument();
    expect(screen.queryByText('gj-1')).not.toBeInTheDocument();
    unmount();

    loadAdminCensusMock.mockResolvedValue(census([user({ friendGamesGistIds: [] })]));
    renderHub();
    signInAsAdmin();
    expect((await ficha()).getByText(ADMIN_PANEL_UI.field.listsNone)).toBeInTheDocument();
  });

  // TRES ESTADOS PARA LA FOTO, no un sí/no: el interruptor real vive en el gist del usuario y este panel no lo lee.
  describe('estado de la foto', () => {
    it.each([
      ['publica foto: activada', { hasPhoto: true, photoURL: 'https://x/y.png' }, ADMIN_PANEL_UI.field.photoOn],
      ['no publica pero sus amigos guardan una suya: la ha ocultado', { hasPhoto: false, photoURL: '', friendKnownPhotos: ['https://x/vieja.png'] }, ADMIN_PANEL_UI.field.photoHidden],
      ['tiene amistades y ninguna guarda foto suya: desactivada', { hasPhoto: false, photoURL: '', friendKnownPhotos: [], friends: 2 }, ADMIN_PANEL_UI.field.photoOff],
      ['sin foto y sin amistades con las que comparar: no se afirma nada', { hasPhoto: false, photoURL: '', friendKnownPhotos: [], friends: 0, pending: 0, pendingOut: 0, pendingIn: 0 }, ADMIN_PANEL_UI.field.photoUnknown],
    ])('%s', async (_title, overrides, expected) => {
      loadAdminCensusMock.mockResolvedValue(census([user(overrides)]));
      renderHub();
      signInAsAdmin();
      expect((await ficha()).getByText(expected)).toBeInTheDocument();
    });
  });
});

// CUOTA DE ENLACES COMPARTIDOS: los campos llegan con lo que el usuario tiene AHORA y no dejan pasar del máximo de su
// rango (para dar más, se le sube el rango).
describe('AdminHub — cuota de enlaces compartidos', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    listAllSharesMock.mockReset();
    listAllSharesMock.mockResolvedValue({ shares: [], bans: [], overrides: {}, cursor: null, complete: true });
    setQuotaOverrideMock.mockClear();
    clearQuotaOverrideMock.mockClear();
  });

  async function abrirEnlaces(maxActive: number = PROFILE_TIER_SHARE_MAX_ACTIVE.bronze) {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    await userEvent.click(await detalle.findByRole('button', { name: ADMIN_SHARES_UI.toggle(0, maxActive) }));
  }

  it('sin ajuste individual, los campos traen la cuota del rango y el tope es el suyo', async () => {
    await abrirEnlaces();

    const enlaces = screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaMaxLabel));
    const dias = screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaDaysLabel));
    expect(enlaces).toHaveValue(PROFILE_TIER_SHARE_MAX_ACTIVE.bronze);
    expect(dias).toHaveValue(PROFILE_TIER_SHARE_TTL_DAYS.bronze);
    expect(enlaces).toHaveAttribute('max', String(PROFILE_TIER_SHARE_MAX_ACTIVE.bronze));
    expect(dias).toHaveAttribute('max', String(PROFILE_TIER_SHARE_TTL_DAYS.bronze));
    expect(screen.getByText(ADMIN_SHARES_UI.quotaFromTier(PROFILE_TIER_LABELS.bronze))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADMIN_SHARES_UI.quotaClear })).not.toBeInTheDocument();
  });

  it('con ajuste individual enseña el ajuste, no la cuota del rango, y ofrece retirarlo', async () => {
    listAllSharesMock.mockResolvedValue({ shares: [], bans: [], overrides: { 'uid-a': { maxActive: 2, ttlDays: 3 } }, cursor: null, complete: true });
    await abrirEnlaces(2);

    expect(screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaMaxLabel))).toHaveValue(2);
    expect(screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaDaysLabel))).toHaveValue(3);
    expect(screen.getByText(ADMIN_SHARES_UI.quotaFromOverride)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_SHARES_UI.quotaClear }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(clearQuotaOverrideMock).toHaveBeenCalledWith('uid-a'));
  });

  it('aplica los dos valores como cifras absolutas, tras confirmar, y lo apunta en el registro', async () => {
    await abrirEnlaces();

    const enlaces = screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaMaxLabel));
    await userEvent.clear(enlaces);
    await userEvent.type(enlaces, '3');
    await userEvent.click(screen.getByRole('button', { name: ADMIN_SHARES_UI.quota }));
    expect(setQuotaOverrideMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(setQuotaOverrideMock).toHaveBeenCalledWith('uid-a', { maxActive: 3, ttlDays: 7 }));
    await waitFor(() => expect(appendAdminLogMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'shares', targetUid: 'uid-a' })));
  });

  it('no deja pasar del máximo del rango: lo dice y bloquea el botón', async () => {
    await abrirEnlaces();

    const enlaces = screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaMaxLabel));
    await userEvent.clear(enlaces);
    await userEvent.type(enlaces, '40');

    expect(screen.getByText(ADMIN_SHARES_UI.quotaOverLimit(PROFILE_TIER_SHARE_MAX_ACTIVE.bronze, PROFILE_TIER_LABELS.bronze))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADMIN_SHARES_UI.quota })).toBeDisabled();
  });

  it('un campo vacío tampoco se aplica: el servidor lo descartaría sin decir nada', async () => {
    await abrirEnlaces();
    await userEvent.clear(screen.getByLabelText(new RegExp(ADMIN_SHARES_UI.quotaDaysLabel)));
    expect(screen.getByRole('button', { name: ADMIN_SHARES_UI.quota })).toBeDisabled();
  });
});

function share(overrides: Record<string, unknown> = {}) {
  return { uid: 'uid-a', token: 't1', gameId: 1, gameName: 'Juego', createdAt: 1_700_000_000_000, expiresAt: 1_800_000_000_000, ...overrides };
}

// La portada: los números que deciden si hay que abrir algo.
describe('AdminHub — portada (Hoy)', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    listAllSharesMock.mockReset();
    listAllSharesMock.mockResolvedValue({ shares: [], bans: [], overrides: {}, cursor: null, complete: true });
    loadAnnouncementMock.mockReset();
    loadAnnouncementMock.mockResolvedValue(null);
    fetchVotingConfigMock.mockReset();
    fetchVotingConfigMock.mockResolvedValue(null);
    clearStrayProfilePhotoMock.mockClear();
  });

  it('el resumen suma los enlaces y los vetados', async () => {
    listAllSharesMock.mockResolvedValue({ shares: [share(), share({ token: 't2' })], bans: ['uid-a'], overrides: {}, cursor: null, complete: true });
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    const enlaces = await screen.findByText(ADMIN_PANEL_UI.totals.activeShares);
    expect(enlaces.parentElement).toHaveTextContent('2');
    expect(screen.getByText(ADMIN_PANEL_UI.totals.banned).parentElement).toHaveTextContent('1');
  });

  // Un cero cuando la respuesta no llegó afirmaría que no hay ningún enlace ni ningún veto.
  it('si el censo de enlaces falla, sus dos totales no se pintan', async () => {
    listAllSharesMock.mockRejectedValue(new Error('sin red'));
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    expect(await screen.findByText(ADMIN_SHELL_UI.today.kpi.profiles)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.totals.activeShares)).not.toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.totals.banned)).not.toBeInTheDocument();
  });

  it('con más enlaces de los listados, el total lleva un "+" y lo explica', async () => {
    listAllSharesMock.mockResolvedValue({ shares: [share()], bans: [], overrides: {}, cursor: 'c1', complete: false });
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    const parcial = await screen.findByText(ADMIN_PANEL_UI.totals.partialCount(1));
    expect(parcial).toHaveAttribute('title', ADMIN_PANEL_UI.totals.partialHint);
  });

  it('sin nada grave, la bandeja lo dice', async () => {
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();
    expect(await screen.findByText(ADMIN_SHELL_UI.today.nothing)).toBeInTheDocument();
  });

  it('un token en claro sale el primero en la bandeja y lleva a su ficha', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-c', uid: 'uid-c', displayName: 'Cleo', anomalies: ['legacy-token'], legacy: { email: false, gamesGistId: false, token: true } })]),
    );
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    expect(await screen.findByText(ADMIN_SHELL_UI.today.items.legacyToken(1))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: ADMIN_SHELL_UI.today.items.legacyTokenAction }));
    expect(await ficha('Cleo')).toBeTruthy();
  });

  // La cifra de señales graves lleva a la tabla YA FILTRADA: es la pregunta siguiente («¿quiénes?»).
  it('las cifras enlazan con la tabla ya filtrada', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-c', uid: 'uid-c', displayName: 'Cleo', anomalies: ['gist-drift'] })]),
    );
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    const graves = await screen.findByText(ADMIN_SHELL_UI.today.kpi.severe);
    await userEvent.click(within(graves.parentElement as HTMLElement).getByRole('link', { name: '1' }));
    await screen.findByRole('heading', { level: 2, name: ADMIN_SHELL_UI.users.title });
    expect(namesInTable()).toEqual(['Cleo']);
  });

  // Cada acción relee su ficha, y el censo cambia: las fotos NO pueden ir detrás (eran hasta 90 lecturas por acción).
  it('cambiar un rango no vuelve a pedir las fotos diarias', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    await waitFor(() => expect(loadDailySnapshotsMock).toHaveBeenCalledTimes(1));

    await userEvent.click(within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') })).getByRole('button', { name: PROFILE_TIER_LABELS.gold }));
    await waitFor(() => expect(readAdminCensusRowMock).toHaveBeenCalled());
    expect(loadDailySnapshotsMock).toHaveBeenCalledTimes(1);
  });

  it('toma la foto del día si aún no existe, y solo entonces', async () => {
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();
    await waitFor(() => expect(saveDailySnapshotMock).toHaveBeenCalledTimes(1));
  });

  it('dice qué aviso hay publicado y si los retos esperan a publicarse', async () => {
    loadAnnouncementMock.mockResolvedValue({
      id: 'c-1', kicker: '', title: 'Premios 2026', body: '', url: 'https://example.com',
      icon: 'votar', active: true, repeats: 3, intervalHours: 24, updatedAt: 1,
    });
    // Cerrada ayer y sin publicar: pide hacer algo, así que sale también en la bandeja.
    fetchVotingConfigMock.mockResolvedValue({ closesAtMillis: Date.now() - 86_400_000 });
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    expect(await screen.findByText(ADMIN_PANEL_UI.menuStatus.announcementActive('Premios 2026'))).toBeInTheDocument();
    expect(await screen.findByText(ADMIN_PANEL_UI.menuStatus.premiosPending)).toHaveClass('is-pending');
    expect(screen.getByText(ADMIN_SHELL_UI.today.items.premiosPending)).toBeInTheDocument();
  });

  it('sin aviso ni edición lo dice, y mientras no ha leído no afirma nada', async () => {
    let entregar: (value: unknown) => void = () => {};
    loadAnnouncementMock.mockImplementation(() => new Promise((resolve) => { entregar = resolve; }));
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    expect(await screen.findByText(ADMIN_PANEL_UI.menuStatus.premiosNone)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.menuStatus.announcementNone)).not.toBeInTheDocument();
    await act(async () => entregar(null));
    expect(await screen.findByText(ADMIN_PANEL_UI.menuStatus.announcementNone)).toBeInTheDocument();
  });
});

describe('AdminHub — tabla de usuarios', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    listAllSharesMock.mockReset();
    listAllSharesMock.mockResolvedValue({ shares: [], bans: [], overrides: {}, cursor: null, complete: true });
    setUserTierMock.mockClear();
    setUserSocialEnabledMock.mockClear();
  });

  it('la ficha dice en el rótulo de sus enlaces cuántos tiene DE cuántos puede', async () => {
    listAllSharesMock.mockResolvedValue({ shares: [share(), share({ token: 't2' })], bans: [], overrides: {}, cursor: null, complete: true });
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    expect(await detalle.findByRole('button', { name: ADMIN_SHARES_UI.toggle(2, PROFILE_TIER_SHARE_MAX_ACTIVE.bronze) })).toBeInTheDocument();
    expect(detalle.queryByText(ADMIN_SHARES_UI.full)).not.toBeInTheDocument();
  });

  it('con el cupo agotado lo dice sin tener que desplegar', async () => {
    listAllSharesMock.mockResolvedValue({
      shares: Array.from({ length: PROFILE_TIER_SHARE_MAX_ACTIVE.bronze }, (_, i) => share({ token: `t${i}` })),
      bans: [], overrides: {}, cursor: null, complete: true,
    });
    renderHub();
    signInAsAdmin();
    expect(await (await ficha()).findByText(ADMIN_SHARES_UI.full)).toBeInTheDocument();
  });

  it('el filtro de señales deja solo los perfiles que hay que mirar, y lo escribe en la dirección', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', anomalies: ['inactive'] })]));
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('table');

    await userEvent.click(within(screen.getByRole('group', { name: ADMIN_SHELL_UI.users.rows.signal })).getByRole('button', { name: new RegExp(ADMIN_SHELL_UI.users.signal.flagged) }));
    expect(namesInTable()).toEqual(['Bob']);
    expect(screen.getByText(ADMIN_SHELL_UI.users.count(1, 2))).toBeInTheDocument();
  });

  it('los filtros se leen de la dirección: un enlace abre la tabla ya filtrada', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', tier: 'silver' }), user({ id: 'uid-c', uid: 'uid-c', displayName: 'Cleo', tier: 'gold' })]),
    );
    renderHub(`${ADMIN_PATHS.users}?rango=silver,gold&orden=nombre`);
    signInAsAdmin();
    await screen.findByRole('table');

    expect(namesInTable()).toEqual(['Bob', 'Cleo']);
  });

  // Lista vacía con el filtro puesto es una BUENA noticia, no un «no se encontró nada».
  it('sin ninguna señal, el filtro lo dice con sus palabras', async () => {
    renderHub(`${ADMIN_PATHS.users}?senal=con`);
    signInAsAdmin();
    expect(await screen.findByText(ADMIN_SHELL_UI.users.emptySignal)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_SHELL_UI.users.emptyFiltered)).not.toBeInTheDocument();
  });

  it('el filtro se combina con la búsqueda, y entonces el vacío es el de la búsqueda', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', anomalies: ['inactive'] })]));
    renderHub(`${ADMIN_PATHS.users}?senal=con`);
    signInAsAdmin();
    await screen.findByRole('table');

    fireEvent.change(screen.getByRole('searchbox', { name: ADMIN_SHELL_UI.users.searchAria }), { target: { value: 'Zoe' } });
    expect(screen.getByText(ADMIN_SHELL_UI.users.emptyFiltered)).toBeInTheDocument();
  });

  // «¿Quién más tiene ESTO?»: el desplegable ofrece solo las señales que alguna ficha tiene, con cuántas.
  it('filtra por una señal concreta, y solo ofrece las que hay', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ anomalies: ['stale-schema'] }), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', anomalies: ['inactive', 'stale-schema'] })]),
    );
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('table');

    const filter = screen.getByRole('combobox', { name: ADMIN_SHELL_UI.users.oneSignal });
    expect(within(filter).getByRole('option', { name: ADMIN_PANEL_UI.signalFilter.one(ADMIN_PANEL_UI.anomalies.inactive.label, 1) })).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: ADMIN_PANEL_UI.signalFilter.one(ADMIN_PANEL_UI.anomalies['stale-schema'].label, 2) })).toBeInTheDocument();
    expect(within(filter).queryByRole('option', { name: new RegExp(ADMIN_PANEL_UI.anomalies['legacy-token'].label) })).not.toBeInTheDocument();

    await userEvent.selectOptions(filter, 'inactive');
    expect(namesInTable()).toEqual(['Bob']);
  });

  // Lo grave primero: un token en claro no puede quedar debajo de cuarenta fichas sanas más recientes.
  it('pone primero las filas con señales graves, y luego lo más reciente', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([
        user({ updatedAt: 3 }),
        user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', updatedAt: 2, anomalies: ['inactive'] }),
        user({ id: 'uid-c', uid: 'uid-c', displayName: 'Cleo', updatedAt: 1, anomalies: ['legacy-token'] }),
      ]),
    );
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('table');

    expect(namesInTable()).toEqual(['Cleo', 'Ada', 'Bob']);
  });

  it('ordena por una columna al pulsarla, y al pulsarla otra vez da la vuelta', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ friends: 1 }), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', friends: 9 }), user({ id: 'uid-c', uid: 'uid-c', displayName: 'Cleo', friends: 4 })]),
    );
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('table');

    const amigos = screen.getByRole('button', { name: ADMIN_SHELL_UI.users.sortBy(ADMIN_SHELL_UI.users.columns.friends) });
    await userEvent.click(amigos);
    expect(namesInTable()).toEqual(['Bob', 'Cleo', 'Ada']);
    await userEvent.click(amigos);
    expect(namesInTable()).toEqual(['Ada', 'Cleo', 'Bob']);
  });

  it('cambia el rango de varias personas a la vez, tras confirmar, y apunta cada una (sin tocar Mithril)', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob' }), user({ id: 'uid-admin', uid: 'uid-admin', displayName: 'Jefe', tier: 'mithril' })]),
    );
    renderHub(ADMIN_PATHS.users);
    signInAsAdmin();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('checkbox', { name: ADMIN_SHELL_UI.users.selectAll }));
    const lote = within(screen.getByRole('region', { name: ADMIN_SHELL_UI.users.bulk.aria }));
    expect(lote.getByText(ADMIN_SHELL_UI.users.bulk.selected(3))).toBeInTheDocument();
    await userEvent.selectOptions(lote.getByRole('combobox', { name: ADMIN_SHELL_UI.users.bulk.tier }), 'silver');
    expect(setUserTierMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(setUserTierMock).toHaveBeenCalledTimes(2));
    expect(setUserTierMock).toHaveBeenCalledWith('uid-a', 'silver');
    expect(setUserTierMock).toHaveBeenCalledWith('uid-b', 'silver');
    expect(await screen.findByText(ADMIN_SHELL_UI.users.bulk.done(2, 2))).toBeInTheDocument();
    expect(appendAdminLogMock).toHaveBeenCalledTimes(2);
  });

  // Tras una acción de ficha se relee ESA ficha, no el censo entero.
  it('tras cambiar el rango relee solo esa ficha', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    loadAdminCensusMock.mockClear();

    await userEvent.click(within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') })).getByRole('button', { name: PROFILE_TIER_LABELS.silver }));

    await waitFor(() => expect(readAdminCensusRowMock).toHaveBeenCalledWith(expect.anything(), 'uid-a'));
    // La única llamada al censo es la que hace el mock de la relectura para servir la ficha.
    expect(loadAdminCensusMock).toHaveBeenCalledTimes(1);
  });

  // Cuánto hace, de un vistazo; la fecha exacta, en el `title` de la ficha.
  it('la actividad se dice en relativo', async () => {
    const haceTresDias = Date.now() - 3 * 86_400_000;
    loadAdminCensusMock.mockResolvedValue(census([user({ updatedAt: haceTresDias })]));
    renderHub();
    signInAsAdmin();
    await ficha();

    const enTabla = within(screen.getByRole('table')).getByText(ADMIN_PANEL_UI.field.lastActivityAgo(haceTresDias, Date.now()));
    expect(enTabla.textContent).toBe('hace 3 días');
  });
});

// REGISTRO Y DESHACER: lo reversible (rango, social) se apunta con el valor de antes y se deshace con un clic.
describe('AdminHub — registro y deshacer', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    setUserTierMock.mockClear();
    setUserSocialEnabledMock.mockClear();
  });

  it('cambiar el rango se apunta y el aviso permite deshacerlo, volviendo al rango de antes', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    // La relectura tras la acción trae lo que se escribió (el mock no guarda nada por sí solo).
    loadAdminCensusMock.mockResolvedValue(census([user({ tier: 'gold' })]));

    await userEvent.click(within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') })).getByRole('button', { name: PROFILE_TIER_LABELS.gold }));
    await waitFor(() => expect(setUserTierMock).toHaveBeenCalledWith('uid-a', 'gold'));
    expect(appendAdminLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tier', targetUid: 'uid-a', undo: { action: 'tier', profileDocId: 'uid-a', tier: 'bronze', to: 'gold' } }),
    );

    const aviso = within(await screen.findByRole('status'));
    await userEvent.click(aviso.getByRole('button', { name: ADMIN_SHELL_UI.toast.undo }));
    await waitFor(() => expect(setUserTierMock).toHaveBeenLastCalledWith('uid-a', 'bronze'));
    expect(markAdminLogUndoneMock).toHaveBeenCalled();
  });

  // Deshacer escribe el valor de ANTES: si después cambió otra vez, pisaría ese cambio. Se niega y lo dice.
  it('no deshace un rango que ya cambió después', async () => {
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();
    // La relectura tras la acción trae otro rango: alguien (u otra acción) lo cambió entre medias.
    loadAdminCensusMock.mockResolvedValue(census([user({ tier: 'silver' })]));

    await userEvent.click(within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') })).getByRole('button', { name: PROFILE_TIER_LABELS.gold }));
    await waitFor(() => expect(readAdminCensusRowMock).toHaveBeenCalled());
    setUserTierMock.mockClear();

    const aviso = within(await screen.findByRole('status'));
    await userEvent.click(aviso.getByRole('button', { name: ADMIN_SHELL_UI.toast.undo }));
    expect(await screen.findByText(ADMIN_SHELL_UI.log.undoStale)).toBeInTheDocument();
    expect(setUserTierMock).not.toHaveBeenCalled();
  });

  it('lo que no tiene vuelta atrás no ofrece deshacer', async () => {
    purgeLegacyProfileFieldsMock.mockClear();
    loadAdminCensusMock.mockResolvedValue(census([user({ legacy: { email: false, gamesGistId: false, token: true } })]));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyToken, 'Ada') }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    const aviso = within(await screen.findByRole('status'));
    expect(aviso.getByText(ADMIN_PANEL_UI.okPurged)).toBeInTheDocument();
    expect(aviso.queryByRole('button', { name: ADMIN_SHELL_UI.toast.undo })).not.toBeInTheDocument();
    expect(appendAdminLogMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'legacy', undo: null }));
  });

  it('si el registro no se puede escribir, la acción sale igual', async () => {
    appendAdminLogMock.mockRejectedValueOnce(new Error('reglas sin desplegar'));
    renderHub();
    signInAsAdmin();
    const detalle = await ficha();

    await userEvent.click(within(detalle.getByRole('group', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') })).getByRole('button', { name: PROFILE_TIER_LABELS.silver }));
    expect(await screen.findByText(ADMIN_PANEL_UI.okTier(PROFILE_TIER_LABELS.silver))).toBeInTheDocument();
    expect(setUserTierMock).toHaveBeenCalledWith('uid-a', 'silver');
  });
});

describe('AdminHub — el aviso publicado', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    readAdminClaimMock.mockReset();
    saveAnnouncementMock.mockClear();
    loadAnnouncementMock.mockReset();
  });

  // El formulario copiaba el aviso en su estado AL MONTARSE, cuando la lectura aún no había vuelto: se quedaba en
  // blanco, y «Guardar cambios» estrenaba campaña en vez de corregir la publicada.
  it('no abre el formulario hasta tener el aviso, y guardar corrige la campaña publicada', async () => {
    let entregar: (value: unknown) => void = () => {};
    loadAnnouncementMock.mockImplementation(() => new Promise((resolve) => { entregar = resolve; }));
    const publicado = {
      id: 'campana-1', kicker: 'Ya puedes votar', title: 'Premios 2026', body: '', url: 'https://example.com/premios',
      icon: 'votar', active: true, repeats: 3, intervalHours: 24, updatedAt: 1,
    };
    renderHub(ADMIN_PATHS.announcement);
    signInAsAdmin();

    expect(await screen.findByText(ADMIN_ANNOUNCEMENT_UI.loading)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADMIN_ANNOUNCEMENT_UI.save })).toBeNull();
    await act(async () => entregar(publicado));

    await userEvent.click(await screen.findByRole('button', { name: ADMIN_ANNOUNCEMENT_UI.save }));
    await waitFor(() => expect(saveAnnouncementMock).toHaveBeenCalledTimes(1));
    expect(saveAnnouncementMock.mock.calls[0][0]).toMatchObject({ id: 'campana-1', title: 'Premios 2026' });
  });
});

// Los restos del fallo de la foto: perfiles que publican una foto que su dueño ocultó (o el avatar genérico).
describe('AdminHub — fotos publicadas de más', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    readAdminClaimMock.mockReset();
    clearStrayProfilePhotoMock.mockClear();
  });

  const conFoto = (id: string, name: string) =>
    user({ id, uid: id, displayName: name, photoURL: `https://f/${id}.png`, hasPhoto: true, anomalies: ['stray-photo'] });

  it('la portada las retira todas de una vez, tras confirmar, y relee el censo', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user(), conFoto('uid-b', 'Bob'), conFoto('uid-c', 'Cleo')]));
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();
    const boton = await screen.findByRole('button', { name: ADMIN_PANEL_UI.strayPhoto.bulkBtn(2) });
    loadAdminCensusMock.mockClear();

    await userEvent.click(boton);
    expect(screen.getByText(ADMIN_PANEL_UI.strayPhoto.bulkConfirm(2))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    expect(await screen.findByText(ADMIN_PANEL_UI.strayPhoto.bulkOk(2, 2))).toBeInTheDocument();
    expect(clearStrayProfilePhotoMock).toHaveBeenCalledWith('uid-b', 'uid-b', 'https://f/uid-b.png');
    expect(clearStrayProfilePhotoMock).toHaveBeenCalledWith('uid-c', 'uid-c', 'https://f/uid-c.png');
    expect(clearStrayProfilePhotoMock).not.toHaveBeenCalledWith('uid-a', expect.anything(), expect.anything());
    expect(loadAdminCensusMock).toHaveBeenCalled();
  });

  it('dice cuántas no salieron si un perfil no se deja escribir', async () => {
    loadAdminCensusMock.mockResolvedValue(census([conFoto('uid-b', 'Bob'), conFoto('uid-c', 'Cleo')]));
    clearStrayProfilePhotoMock.mockResolvedValueOnce({ ok: false, failures: ['x'], touched: 0, scanned: 0, profileCleared: false });
    renderHub(ADMIN_PATHS.today);
    signInAsAdmin();

    await userEvent.click(await screen.findByRole('button', { name: ADMIN_PANEL_UI.strayPhoto.bulkBtn(2) }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    expect(await screen.findByText(ADMIN_PANEL_UI.strayPhoto.bulkOk(1, 2))).toBeInTheDocument();
  });

  it('cada ficha afectada tiene su botón, y sin ninguna no hay bloque', async () => {
    loadAdminCensusMock.mockResolvedValue(census([conFoto('uid-b', 'Bob')]));
    const { unmount } = renderHub('/admin/usuarios/uid-b');
    signInAsAdmin();
    const detalle = await ficha('Bob');

    await userEvent.click(detalle.getByRole('button', { name: ADMIN_PANEL_UI.strayPhoto.btn }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(clearStrayProfilePhotoMock).toHaveBeenCalledWith('uid-b', 'uid-b', 'https://f/uid-b.png'));

    unmount();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    renderHub();
    signInAsAdmin();
    const limpia = await ficha();
    expect(limpia.queryByRole('button', { name: ADMIN_PANEL_UI.strayPhoto.btn })).not.toBeInTheDocument();
  });
});
