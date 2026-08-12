import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ADMIN_PANEL_UI } from '../../src/core/constants/labels';
import { ADMIN_EMAIL } from '../../src/core/security/admin';
import type { AdminAnomaly } from '../../src/model/types/firestore';

// La sesión y el repositorio se controlan desde el test: aquí se comprueba la PUERTA y el cableado de la tabla,
// no Firestore (eso lo cubre tests/unit/adminRepository.test.ts y las reglas en tests/integration).
let emitAuth: (user: { uid: string; email: string; displayName: string; photoURL: string } | null) => void = () => {};

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  subscribeSocialAuth: (callback: (user: unknown) => void) => {
    emitAuth = callback as typeof emitAuth;
    return () => {};
  },
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

vi.mock('../../src/model/repository/firebaseAdminRepository', () => ({
  ADMIN_PROFILES_LIMIT: 300,
  loadAdminCensus: (...args: unknown[]) => loadAdminCensusMock(...args),
  setUserSocialEnabled: (...args: unknown[]) => setUserSocialEnabledMock(...args),
  purgeLegacyProfileFields: (...args: unknown[]) => purgeLegacyProfileFieldsMock(...args),
  deleteUserProfile: (...args: unknown[]) => deleteUserProfileMock(...args),
  setUserTier: (...args: unknown[]) => setUserTierMock(...args),
  migrateForeignProfileDoc: (...args: unknown[]) => migrateForeignProfileDocMock(...args),
  healUserFriendshipIdentity: (...args: unknown[]) => healUserFriendshipIdentityMock(...args),
  purgeFossilFriendshipRequests: (...args: unknown[]) => purgeFossilFriendshipRequestsMock(...args),
}));

import { AdminHub } from '../../src/view/components/AdminHub';

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
    hasSocialEtag: true,
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

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminHub />} />
        <Route path="/completados" element={<div>LISTAS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function signIn(email: string) {
  emitAuth({ uid: 'uid-admin', email, displayName: '', photoURL: '' });
}

describe('AdminHub — puerta de acceso', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    setUserSocialEnabledMock.mockClear();
    purgeLegacyProfileFieldsMock.mockClear();
    deleteUserProfileMock.mockClear();
    setUserTierMock.mockClear();
  });

  it('mientras la sesión se resuelve no decide nada (ni panel ni expulsión)', () => {
    renderHub();
    expect(screen.getByText(ADMIN_PANEL_UI.checking)).toBeInTheDocument();
    expect(screen.queryByText('LISTAS')).not.toBeInTheDocument();
  });

  it('expulsa a quien no es el administrador y NO consulta Firestore', async () => {
    renderHub();
    signIn('otra.persona@example.com');

    expect(await screen.findByText('LISTAS')).toBeInTheDocument();
    expect(loadAdminCensusMock).not.toHaveBeenCalled();
  });

  it('expulsa también sin sesión iniciada', async () => {
    renderHub();
    emitAuth(null);
    expect(await screen.findByText('LISTAS')).toBeInTheDocument();
  });

  it('con la cuenta de administrador carga el censo', async () => {
    renderHub();
    signIn(ADMIN_EMAIL);

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(loadAdminCensusMock).toHaveBeenCalledTimes(1);
  });

  it('el correo del administrador se compara sin distinguir mayúsculas', async () => {
    renderHub();
    signIn(ADMIN_EMAIL.toUpperCase());
    expect(await screen.findByText('Ada')).toBeInTheDocument();
  });
});

describe('AdminHub — moderación', () => {
  beforeEach(() => {
    loadAdminCensusMock.mockReset();
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    setUserSocialEnabledMock.mockClear();
    purgeLegacyProfileFieldsMock.mockClear();
    deleteUserProfileMock.mockClear();
    setUserTierMock.mockClear();
    migrateForeignProfileDocMock.mockClear();
    migrateForeignProfileDocMock.mockResolvedValue({ outcome: 'moved', carried: [] });
  });

  // CUTOVER DE IDENTIDAD: la acción borra un documento, así que la ficha tiene que enseñar de dónde a dónde va.
  it('migra la identidad de un perfil que vive bajo otro id, tras confirmar', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // Los dos ids, visibles: el actual y el destino.
    expect(screen.getByText('doc-legacy')).toBeInTheDocument();
    expect(screen.getByText('profiles/uid-a')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.cutover.btn }));
    expect(migrateForeignProfileDocMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(migrateForeignProfileDocMock).toHaveBeenCalledWith('doc-legacy', 'uid-a'));
    expect(await screen.findByText(ADMIN_PANEL_UI.cutover.okMoved)).toBeInTheDocument();
  });

  // Sin campo `uid` en el documento, el censo iguala el uid al id: no hay destino y no se puede migrar desde aquí.
  it('no ofrece migrar cuando el documento no dice de quién es', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-huerfano', uid: 'doc-huerfano', idMatchesUid: false, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    const blocked = screen.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.cutover.btn) });
    expect(blocked).toBeDisabled();
    // El motivo va en el nombre accesible: es el turno de su dueño, no un fallo.
    expect(blocked.getAttribute('aria-label')).toContain(ADMIN_PANEL_UI.cutover.unknownUid);
    expect(migrateForeignProfileDocMock).not.toHaveBeenCalled();
  });

  it('ninguna acción se ejecuta sin pasar por la confirmación', async () => {
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.disableBtn }));
    expect(setUserSocialEnabledMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));
    await waitFor(() => expect(setUserSocialEnabledMock).toHaveBeenCalledWith('uid-a', false));
  });

  it('cancelar la confirmación deja al usuario intacto', async () => {
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmCancel }));
    expect(deleteUserProfileMock).not.toHaveBeenCalled();
  });

  it('solo aparece etiqueta (y botón de purga) de los restos que ese perfil arrastra de verdad', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-b', uid: 'uid-b', displayName: 'Bob', legacy: { email: true, gamesGistId: false, token: true } })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Bob');

    expect(screen.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyToken, 'Bob') })).toBeEnabled();
    expect(screen.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyEmail, 'Bob') })).toBeEnabled();
    // Se nombra QUÉ resto queda, no su valor; y el que no tiene, no se ofrece.
    expect(
      screen.queryByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyGamesGist, 'Bob') }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(ADMIN_PANEL_UI.legacyNone)).toHaveLength(1); // Ada está limpia
  });

  it('purga UN campo, no los tres: el token en claro sin arrastrar el id del gist', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ legacy: { email: true, gamesGistId: true, token: true } })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(
      screen.getByRole('button', { name: ADMIN_PANEL_UI.legacyPurgeAria(ADMIN_PANEL_UI.legacyToken, 'Ada') }),
    );
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    await waitFor(() => expect(purgeLegacyProfileFieldsMock).toHaveBeenCalledWith('uid-a', ['token']));
  });

  it('el email de un perfil que NO se identifica por el uid no se puede purgar: lo dejaría huérfano', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'perfil-legacy', idMatchesUid: false, legacy: { email: true, gamesGistId: false, token: false } })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // El nombre accesible lleva el motivo: un botón deshabilitado y mudo no explica nada a un lector de pantalla.
    const locked = screen.getByRole('button', { name: /Purgar email de Ada/ });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleName(new RegExp(ADMIN_PANEL_UI.legacyEmailLocked.slice(0, 40)));
    expect(purgeLegacyProfileFieldsMock).not.toHaveBeenCalled();
  });

  it('un borrado incompleto se avisa en vez de darse por bueno', async () => {
    deleteUserProfileMock.mockResolvedValue({ ok: false, failures: ['amistades: 1 de 2 no se pudieron borrar'] });
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.deleteBtn }));
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    expect(await screen.findByText(ADMIN_PANEL_UI.partialDeleted)).toBeInTheDocument();
  });

  it('a quien no tiene nombre en su perfil se le identifica por el que guardaron sus amistades', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ displayName: '', knownAs: 'Ada la del gist' })]));
    renderHub();
    signIn(ADMIN_EMAIL);

    expect(await screen.findByText('Ada la del gist', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`· ${ADMIN_PANEL_UI.knownAsHint}`)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.noName)).not.toBeInTheDocument();
  });

  it('sin nombre por ningún lado queda el uid, copiable para buscarlo en Firebase Auth', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ displayName: '', knownAs: '' })]));
    renderHub();
    signIn(ADMIN_EMAIL);

    expect(await screen.findByText(ADMIN_PANEL_UI.noName, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${ADMIN_PANEL_UI.copyUid}: uid-a` })).toBeInTheDocument();
  });

  it('cambiar el rango es directo, sin modal: es reversible y no destruye nada', async () => {
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') }), 'gold');

    await waitFor(() => expect(setUserTierMock).toHaveBeenCalledWith('uid-a', 'gold'));
    expect(screen.queryByRole('button', { name: ADMIN_PANEL_UI.confirmAccept })).not.toBeInTheDocument();
  });

  it('Mithril solo se ofrece en la fila del propio administrador', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user(), user({ id: 'uid-admin', uid: 'uid-admin', displayName: 'Jefe' })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL); // la sesión de `signIn` es uid-admin
    await screen.findByText('Jefe');

    const ajena = screen.getByRole('combobox', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') });
    const propia = screen.getByRole('combobox', { name: ADMIN_PANEL_UI.tier.selectAria('Jefe') });

    expect(within(ajena).getByRole('option', { name: /Mithril/ })).toBeDisabled();
    expect(within(propia).getByRole('option', { name: 'Mithril' })).toBeEnabled();
  });

  it('el ViewModel rechaza Mithril sobre otra cuenta aunque se fuerce el `select`', async () => {
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // Saltándose la opción deshabilitada: la reserva no puede depender solo de lo que pinte la tabla.
    fireEvent.change(screen.getByRole('combobox', { name: ADMIN_PANEL_UI.tier.selectAria('Ada') }), {
      target: { value: 'mithril' },
    });

    expect(await screen.findByText(ADMIN_PANEL_UI.tierReservedWarning)).toBeInTheDocument();
    expect(setUserTierMock).not.toHaveBeenCalled();
  });

  it('pinta las señales del perfil con su explicación, y destaca las graves', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ anomalies: ['gist-drift', 'inactive'], friendSocialGistIds: ['gs-viejo'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    const grave = screen.getByText(ADMIN_PANEL_UI.anomalies['gist-drift'].label);
    const leve = screen.getByText(ADMIN_PANEL_UI.anomalies.inactive.label);
    expect(grave).toHaveAttribute('title', ADMIN_PANEL_UI.anomalies['gist-drift'].hint);
    // La gravedad se distingue por clase, no solo por color: unas reseñas que no llegan al feed no pueden quedar
    // al mismo nivel visual que "lleva 30 días sin entrar".
    expect(grave.className).toContain('is-severe');
    expect(leve.className).not.toContain('is-severe');
  });

  it('no repite los restos legacy como señal: el pie ya los muestra como botón de purga', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([
        user({
          anomalies: ['legacy-token', 'inactive'],
          legacy: { email: false, gamesGistId: false, token: true },
        }),
      ]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // "token en claro" sale UNA vez, y es el botón que lo purga (no una píldora informativa gemela).
    const apariciones = screen.getAllByText(ADMIN_PANEL_UI.legacyToken);
    expect(apariciones).toHaveLength(1);
    expect(apariciones[0].tagName).toBe('BUTTON');
    // La señal no legacy sí se pinta.
    expect(screen.getByText(ADMIN_PANEL_UI.anomalies.inactive.label)).toBeInTheDocument();
  });

  it('con deriva de gist enseña LOS DOS ids y ofrece unificar', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ socialGistId: 'gs-nuevo', friendSocialGistIds: ['gs-viejo'], anomalies: ['gist-drift'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // Los dos candidatos a la vista DENTRO del bloque de deriva: la decisión del árbitro tiene que ser
    // comprobable, no un acto de fe. (El id del perfil sale además en la ficha de datos, de ahí el `within`.)
    const bloque = screen.getByRole('group', { name: ADMIN_PANEL_UI.gist.driftTitle });
    expect(within(bloque).getByText('gs-nuevo')).toBeInTheDocument();
    expect(within(bloque).getByText('gs-viejo')).toBeInTheDocument();

    // Ya no hay acción: la deriva se resuelve sola cuando su dueño abre el hub (su cliente elige el canal con
    // contenido y repunta sus amistades). Desde el panel no se puede: haría falta su token de GitHub.
    expect(within(bloque).getByText(ADMIN_PANEL_UI.gist.driftHint)).toBeInTheDocument();
  });

  it('sin deriva no se muestra el bloque de gists', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.queryByRole('group', { name: ADMIN_PANEL_UI.gist.driftTitle })).not.toBeInTheDocument();
  });

  it('un perfil sin señales no muestra la lista de señales', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user()]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.queryByRole('list', { name: ADMIN_PANEL_UI.anomalies.aria })).not.toBeInTheDocument();
  });

  it('muestra la fecha de alta sellada cuando existe', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ createdAt: 1_690_000_000_000 })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.createdAt)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.field.createdAtEstimated)).not.toBeInTheDocument();
  });

  it('sin alta sellada la estima por su amistad más antigua y lo dice', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ createdAt: 0, estimatedFirstSeenAt: 1_688_000_000_000 })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    // Se etiqueta como estimada y se marca con `~`: no puede confundirse con un dato sellado.
    expect(screen.getByText(ADMIN_PANEL_UI.field.createdAtEstimated)).toBeInTheDocument();
    expect(screen.getByText(/^~ /)).toBeInTheDocument();
  });

  it('sin alta ni amistades lo admite en vez de inventar una fecha', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ createdAt: 0, estimatedFirstSeenAt: 0 })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.createdAtUnknown)).toBeInTheDocument();
  });

  // El id del canal dejó de publicarse en el perfil (se purga al guardar), así que ese campo está vacío para
  // cualquier perfil al día: pintarlo siempre enseñaba un "—" que se leía como un dato que faltaba. El canal de
  // alguien se ve ahora por lo que guardan sus amistades, y eso sí se pinta siempre.
  it('el gist del perfil solo aparece si de verdad lo arrastra, y el de sus amistades siempre', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ socialGistId: '', friendSocialGistIds: ['gs-vivo'] })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.queryByText(ADMIN_PANEL_UI.field.socialGist)).not.toBeInTheDocument();
    expect(screen.getByText(ADMIN_PANEL_UI.field.friendGists)).toBeInTheDocument();
    expect(screen.getByText('gs-vivo')).toBeInTheDocument();
  });

  it('un perfil que aún publica el id legacy sí lo muestra', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ socialGistId: 'gs-legacy' })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.socialGist)).toBeInTheDocument();
    expect(screen.getByText('gs-legacy')).toBeInTheDocument();
  });

  it('enseña el nombre viejo que le ven sus amigos, y no lo repite cuando está al día', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada Vieja'], anomalies: ['stale-friend-name'] })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.staleFriendNames)).toBeInTheDocument();
    expect(screen.getByText('Ada Vieja')).toBeInTheDocument();

    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada'] })]));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.refresh) }));
    await waitFor(() =>
      expect(screen.queryByText(ADMIN_PANEL_UI.field.staleFriendNames)).not.toBeInTheDocument(),
    );
  });

  // Se busca por lo que identifica la ficha en pantalla: a quien no tiene nick lo identifica el nombre que le dan
  // sus amigos, y antes escribir ese nombre no encontraba nada.
  it('el buscador encuentra por el nombre de sus amistades y por el pseudónimo', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ displayName: '', knownAs: 'Ada la del gist', friendKnownNames: ['Ada la del gist'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada la del gist');

    const search = screen.getByRole('textbox', { name: ADMIN_PANEL_UI.searchLabel });

    fireEvent.change(search, { target: { value: 'la del gist' } });
    expect(screen.getByText('Ada la del gist')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'p-ada' } });
    expect(screen.getByText('Ada la del gist')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'nadie' } });
    expect(screen.queryByText('Ada la del gist')).not.toBeInTheDocument();
  });

  it('un fallo de permisos al cargar se muestra tal cual, sin tabla vacía silenciosa', async () => {
    loadAdminCensusMock.mockRejectedValue(new Error('Sin permisos de administrador para listar los perfiles.'));
    renderHub();
    signIn(ADMIN_EMAIL);

    expect(await screen.findByText(/Sin permisos de administrador/)).toBeInTheDocument();
    // Y NO se afirma además que no haya usuarios: la lista está vacía porque falló la lectura, no porque el
    // servicio esté vacío. Decir las dos cosas a la vez desinforma sobre el estado real.
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
  });

  // El bloque solo aparece cuando hay algo que propagar: es una escritura sobre documentos de dos personas.
  it('ofrece propagar la identidad cuando sus amistades le guardan un nombre viejo', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ friendKnownNames: ['Ada Vieja'], anomalies: ['stale-friend-name'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btn }));
    // Pasa por confirmación, como el resto de acciones que escriben.
    expect(healUserFriendshipIdentityMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    expect(healUserFriendshipIdentityMock).toHaveBeenCalledWith('uid-a', { name: 'Ada', photoURL: '' });
    expect(await screen.findByText(ADMIN_PANEL_UI.healIdentity.ok(2))).toBeInTheDocument();
  });

  it('también lo ofrece cuando lo que está rancio es la foto', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ photoURL: 'https://f/nueva.png', friendKnownPhotos: ['https://f/vieja.png'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.friendPhotoStale)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btn })).toBeInTheDocument();
  });

  it('con la identidad al día no se ofrece propagar nada', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendKnownNames: ['Ada'], friendKnownPhotos: [''] })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.queryByRole('button', { name: ADMIN_PANEL_UI.healIdentity.btn })).not.toBeInTheDocument();
    expect(screen.getByText(ADMIN_PANEL_UI.field.friendPhotoFresh)).toBeInTheDocument();
  });

  // La señal avisa a los 90 días; el botón de purga espera a los 180. Con solo señal, no hay botón.
  it('avisa de las solicitudes rancias sin ofrecer purga hasta los 180 días', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ stalePendingOut: 2, fossilPendingOut: 0, anomalies: ['stale-pending-out'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.stalePendingDetail(2, 0))).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_PANEL_UI.fossil.title)).not.toBeInTheDocument();
  });

  it('purga las fosilizadas tras confirmar, diciendo cuántas son', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ stalePendingOut: 3, fossilPendingOut: 3, anomalies: ['stale-pending-out'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.fossil.btn(3) }));
    expect(purgeFossilFriendshipRequestsMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: ADMIN_PANEL_UI.confirmAccept }));

    expect(purgeFossilFriendshipRequestsMock).toHaveBeenCalledWith('uid-a');
    expect(await screen.findByText(ADMIN_PANEL_UI.fossil.ok(3))).toBeInTheDocument();
  });

  // Mover y fusionar no tienen las mismas consecuencias: hay que saber cuál toca ANTES de pulsar.
  it('dice si el cutover moverá el documento o lo fusionará con el canónico', async () => {
    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, canonicalTwinFound: true, anomalies: ['foreign-doc-id'] })]),
    );
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.cutover.outcomeMerge)).toBeInTheDocument();

    loadAdminCensusMock.mockResolvedValue(
      census([user({ id: 'doc-legacy', uid: 'uid-a', idMatchesUid: false, canonicalTwinFound: false, anomalies: ['foreign-doc-id'] })]),
    );
    await userEvent.click(screen.getByRole('button', { name: new RegExp(ADMIN_PANEL_UI.refresh) }));
    expect(await screen.findByText(ADMIN_PANEL_UI.cutover.outcomeMove)).toBeInTheDocument();
  });

  it('enseña el gist de juegos que conocen sus amistades', async () => {
    loadAdminCensusMock.mockResolvedValue(census([user({ friendGamesGistIds: ['gj-1'] })]));
    renderHub();
    signIn(ADMIN_EMAIL);
    await screen.findByText('Ada');

    expect(screen.getByText(ADMIN_PANEL_UI.field.friendGamesGists)).toBeInTheDocument();
    expect(screen.getByText('gj-1')).toBeInTheDocument();
  });
});
