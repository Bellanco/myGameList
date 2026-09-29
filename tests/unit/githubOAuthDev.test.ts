import { afterEach, describe, expect, it, vi } from 'vitest';
import { GITHUB_OAUTH_ROUTE, githubOAuthDevMiddleware, type DevRequest } from '../../scripts/devGithubOAuth';

/**
 * EL GEMELO DE DESARROLLO DE `/api/github-oauth`. Lo que se fija: que solo contesta a su ruta, que canjea con las
 * credenciales de la OAuth App DE DESARROLLO pasando por las mismas comprobaciones que la Function de producción,
 * y que sin credenciales lo dice en vez de fallar mudo.
 */

function peticion(body: unknown, overrides: Partial<Omit<DevRequest, typeof Symbol.asyncIterator>> = {}): DevRequest {
  const texto = JSON.stringify(body);
  return {
    url: GITHUB_OAUTH_ROUTE,
    method: 'POST',
    headers: { host: 'localhost:8000', origin: 'http://localhost:8000' },
    ...overrides,
    async *[Symbol.asyncIterator]() {
      yield texto;
    },
  };
}

function respuesta() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end(body = '') {
      res.body = body;
      done();
    },
  };
  let done: () => void = () => {};
  const terminada = new Promise<void>((resolve) => {
    done = resolve;
  });
  return { res, terminada };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gemelo de desarrollo de /api/github-oauth', () => {
  it('deja pasar lo que no es su ruta', () => {
    const middleware = githubOAuthDevMiddleware({ clientId: () => 'dev-id', clientSecret: () => 'dev-secret' });
    const next = vi.fn();
    const { res } = respuesta();
    middleware(peticion({}, { url: '/api/announcement' }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('canjea el código con la OAuth App de desarrollo y devuelve el token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'gho_local' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const middleware = githubOAuthDevMiddleware({ clientId: () => 'dev-id', clientSecret: () => 'dev-secret' });
    const { res, terminada } = respuesta();

    middleware(peticion({ code: 'abc', redirect_uri: 'http://localhost:8000/ajustes' }), res, vi.fn());
    await terminada;

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ token: 'gho_local' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: 'dev-id', client_secret: 'dev-secret', code: 'abc' });
  });

  it('pasa por las comprobaciones de la Function: otro origen no canjea', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const middleware = githubOAuthDevMiddleware({ clientId: () => 'dev-id', clientSecret: () => 'dev-secret' });
    const { res, terminada } = respuesta();

    middleware(peticion({ code: 'abc' }, { headers: { host: 'localhost:8000', origin: 'https://otro.example' } }), res, vi.fn());
    await terminada;

    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin OAuth App de desarrollo lo avisa una vez y contesta como la Function sin configurar', async () => {
    const warn = vi.fn();
    const middleware = githubOAuthDevMiddleware({ clientId: () => 'dev-id', clientSecret: () => '', warn });

    for (let intento = 0; intento < 2; intento += 1) {
      const { res, terminada } = respuesta();
      middleware(peticion({ code: 'abc' }), res, vi.fn());
      await terminada;
      expect(res.statusCode).toBe(500);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('GITHUB_DEV_CLIENT_SECRET');
  });
});
