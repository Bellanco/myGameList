import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// «Mis enlaces» cuesta un `list()` de KV en el servidor, y ese cupo es de 1.000 al día para toda la cuenta. El botón
// de compartir lo pide al montarse en cada detalle de reseña propia: sin copia, era el primer techo de la app.

const currentUser = vi.hoisted(() => ({ value: { uid: 'u1', getIdToken: async () => 'id-token' } as unknown }));

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  initializeFirebaseServices: async () => ({
    auth: {
      authStateReady: async () => undefined,
      get currentUser() {
        return currentUser.value;
      },
    },
  }),
}));
vi.mock('../../src/model/repository/appCheckRepository', () => ({ getAppCheckToken: async () => null }));

const repo = await import('../../src/model/repository/shareRepository');

const mine = { shares: [], quota: { maxActive: 5, ttlDays: 7 }, ban: null, nick: 'Me', tier: 'bronze' };
const fetchMock = vi.fn();

function minesCalls(): number {
  return fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/mine') && !(init as RequestInit)?.method).length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(mine), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  currentUser.value = { uid: 'u1', getIdToken: async () => 'id-token' };
  repo.invalidateMySharesCache();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('listMyShares — copia en memoria', () => {
  it('dos detalles de reseña seguidos piden una sola vez', async () => {
    await repo.listMyShares();
    await repo.listMyShares();
    expect(minesCalls()).toBe(1);
  });

  it('varios botones montándose a la vez comparten la petición en vuelo', async () => {
    await Promise.all([repo.listMyShares(), repo.listMyShares(), repo.listMyShares()]);
    expect(minesCalls()).toBe(1);
  });

  it('pasado el plazo se vuelve a preguntar', async () => {
    await repo.listMyShares();
    vi.setSystemTime(Date.now() + repo.MY_SHARES_MAX_AGE_MS + 1);
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });

  it('publicar tira la copia: lo siguiente que se pinta es lo del servidor', async () => {
    await repo.listMyShares();
    await repo.publishShare({} as Parameters<typeof repo.publishShare>[0]);
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });

  it('retirar tira la copia aunque la petición falle', async () => {
    await repo.listMyShares();
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'No es tuyo' }), { status: 403 }));
    await expect(repo.removeShare('tok')).rejects.toThrow();
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });

  it('una lectura que salió antes de publicar no guarda su respuesta vieja', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const stale = repo.listMyShares();
    await vi.waitFor(() => expect(minesCalls()).toBe(1));
    await repo.publishShare({} as Parameters<typeof repo.publishShare>[0]);
    release(new Response(JSON.stringify(mine), { status: 200 }));
    await stale;
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });

  it('la copia es de cada usuario: otra sesión en el mismo navegador pregunta de nuevo', async () => {
    await repo.listMyShares();
    currentUser.value = { uid: 'u2', getIdToken: async () => 'id-token-2' };
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });

  it('un error no se guarda', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Falta la sesión' }), { status: 401 }));
    await expect(repo.listMyShares()).rejects.toThrow();
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });
});

// docs/plan-degradacion-servicios.md, fase 3: «no disponible» no sale del estado (el 429 también es el límite
// diario, que hay que explicar), sino de la marca del servidor, un 5xx, una página HTML o la falta de red.
describe('listMyShares — servicio no disponible', () => {
  it('la marca `unavailable` del servidor: no se vuelve a preguntar durante un rato', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'x', unavailable: true }), { status: 503, headers: { 'retry-after': '600' } }));

    const error = await repo.listMyShares().catch((e) => e);
    expect(repo.isShareUnavailable(error)).toBe(true);
    expect(repo.isShareServiceDown()).toBe(true);

    await expect(repo.listMyShares()).rejects.toMatchObject({ unavailable: true });
    expect(minesCalls()).toBe(1);
  });

  it('la página de error de Cloudflare (HTML) cuenta como no disponible', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('<html>1027</html>', { status: 429, headers: { 'content-type': 'text/html' } }));
    await expect(repo.listMyShares()).rejects.toMatchObject({ unavailable: true });
  });

  it('el límite diario (429 con su JSON) NO es «no disponible»: se explica', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Has compartido demasiadas reseñas hoy.' }), { status: 429 }));
    const error = await repo.publishShare({} as Parameters<typeof repo.publishShare>[0]).catch((e) => e);
    expect(repo.isShareUnavailable(error)).toBe(false);
    expect(error.message).toContain('demasiadas');
    expect(repo.isShareServiceDown()).toBe(false);
  });

  it('sin red también, y la última lista buena queda para enseñarla', async () => {
    await repo.listMyShares();
    repo.invalidateMySharesCache();
    fetchMock.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });

    await expect(repo.listMyShares()).rejects.toMatchObject({ unavailable: true });
    expect(await repo.readLastMyShares()).toMatchObject({ shares: [] });
  });

  it('pasado el rato, vuelve a preguntar', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ unavailable: true }), { status: 503 }));
    await repo.listMyShares().catch(() => null);
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);

    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
    expect(repo.isShareServiceDown()).toBe(false);
  });
});

