import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// De qué depende que se pueda ofrecer compartir. El hook no decide cuotas (eso lo resuelve la Function), pero sí
// resuelve dos cosas que gobiernan lo que se pinta: si hay sesión de Google y si este navegador usa el espacio
// social. La segunda existe para no hablarle de lo social a quien nunca lo ha abierto.

const getCurrentSocialAuthUser = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null));
const getSocialSyncConfig = vi.hoisted(() => vi.fn((): unknown => null));
const listMyShares = vi.hoisted(() =>
  vi.fn(async () => ({ shares: [], quota: { maxActive: 5, ttlDays: 7 }, ban: null, nick: 'Me', tier: 'bronze' })),
);

vi.mock('../../src/model/repository/firebaseGateway', () => ({ getCurrentSocialAuthUser }));
vi.mock('../../src/model/repository/gistConfigRepository', () => ({ getSocialSyncConfig }));
vi.mock('../../src/model/repository/shareRepository', () => ({
  listMyShares,
  publishShare: vi.fn(),
  removeShare: vi.fn(),
}));

const { useShareViewModel } = await import('../../src/viewmodel/useShareViewModel');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentSocialAuthUser.mockResolvedValue(null);
  getSocialSyncConfig.mockReturnValue(null);
});

describe('useShareViewModel — a quién se le puede ofrecer compartir', () => {
  it('sin sesión y sin espacio social en este navegador: nada que ofrecer ni que explicar', async () => {
    const { result } = renderHook(() => useShareViewModel());
    await result.current.refresh();

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.hasSocialSpace).toBe(false);
    // Sin sesión no se gasta una petición que solo puede acabar en 401.
    expect(listMyShares).not.toHaveBeenCalled();
  });

  it('sin sesión pero con gist social configurado: se sabe que esta persona sí usa lo social', async () => {
    // El gist social vive en el dispositivo, así que la señal sobrevive a que la sesión de Google se caiga.
    getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });

    const { result } = renderHook(() => useShareViewModel());
    await result.current.refresh();

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.hasSocialSpace).toBe(true);
  });

  it('una config social sin gist no cuenta como espacio social', async () => {
    // Puede quedar una entrada a medias (config escrita antes de crear el canal); un id vacío no prueba nada.
    getSocialSyncConfig.mockReturnValue({ token: '', gistId: '   ', etag: null, lastRemoteUpdatedAt: 0 });

    const { result } = renderHook(() => useShareViewModel());
    await result.current.refresh();

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.hasSocialSpace).toBe(false);
  });

  it('con sesión se piden los enlaces y la cuota, que las resuelve el servidor', async () => {
    getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });

    const { result } = renderHook(() => useShareViewModel());
    await result.current.refresh();

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(listMyShares).toHaveBeenCalledOnce();
    expect(result.current.quota).toEqual({ maxActive: 5, ttlDays: 7 });
    // El nombre de la cuenta de Google coincide con el nick: se avisa antes de publicar con él.
    expect(result.current.nickIsAccountName).toBe(true);
  });
});
