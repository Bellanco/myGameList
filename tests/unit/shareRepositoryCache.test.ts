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
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 500 }));
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
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 500 }));
    await expect(repo.listMyShares()).rejects.toThrow();
    await repo.listMyShares();
    expect(minesCalls()).toBe(2);
  });
});
