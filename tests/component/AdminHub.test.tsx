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

vi.mock('../../src/model/repository/firebaseAdminRepository', () => ({
  ADMIN_PROFILES_LIMIT: 300,
  loadAdminCensus: (...args: unknown[]) => loadAdminCensusMock(...args),
  setUserSocialEnabled: (...args: unknown[]) => setUserSocialEnabledMock(...args),
  purgeLegacyProfileFields: (...args: unknown[]) => purgeLegacyProfileFieldsMock(...args),
  deleteUserProfile: (...args: unknown[]) => deleteUserProfileMock(...args),
  setUserTier: (...args: unknown[]) => setUserTierMock(...args),
}));

import { AdminHub } from '../../src/view/components/AdminHub';

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uid-a',
    uid: 'uid-a',
    displayName: 'Ada',
    knownAs: '',
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
      census([user({ anomalies: ['gist-drift', 'inactive'] })]),
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
