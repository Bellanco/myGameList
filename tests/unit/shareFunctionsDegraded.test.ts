import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// LAS FUNCTIONS DE COMPARTIR CON UN SERVICIO AGOTADO (docs/plan-degradacion-servicios.md, fase 3).
//
// Con KV sin cupo o Firestore sin cuota, la API respondía cosas que no eran verdad: «KV PUT failed: 429…» como si
// fuera un 400, error tras haber publicado, «Sesión no válida», o «Necesitas tener tu espacio social creado». Ahora
// es «no disponible ahora»: 503 con `unavailable: true` y `Retry-After`, que el cliente usa para esconder el botón.

vi.mock('../../functions/_lib/context', () => ({
  requireUser: vi.fn(async () => ({
    user: { uid: 'u1', idToken: 'id-token' },
    projectId: 'proyecto',
    appCheckToken: null,
    isAdmin: false,
  })),
}));

const { onRequestPost } = await import('../../functions/api/share/index');
const { onRequest: middleware } = await import('../../functions/api/_middleware');
const { tryReadProfileFacts } = await import('../../functions/_lib/quota');
const { ServiceUnavailableError, secondsUntilUtcMidnight } = await import('../../functions/_lib/http');
const { loadJwks } = await import('../../functions/_lib/jwt');
const { onRequestGet: shareLink } = await import('../../functions/r/[token]');

function kvFalso(opts: { putFails?: boolean; getFails?: boolean } = {}) {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string, type?: string) => {
      if (opts.getFails) throw new Error('KV GET failed: 429 Too Many Requests');
      const raw = store.get(key) ?? null;
      return type === 'json' && raw ? JSON.parse(raw) : raw;
    }),
    put: vi.fn(async (key: string, value: string) => {
      if (opts.putFails) throw new Error('KV PUT failed: 429 Too Many Requests');
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: '' })),
  };
}

function perfilFirestore(status = 200) {
  return new Response(
    status === 200 ? JSON.stringify({ fields: { displayName: { stringValue: 'Nick' }, tier: { stringValue: 'gold' } } }) : '{}',
    { status },
  );
}

function publicar(kv: ReturnType<typeof kvFalso>) {
  const body = { gameId: 7, gameName: 'Hollow Knight', review: 'Obra maestra', platforms: [], genres: [], strengths: [], weaknesses: [], reviewedAt: 1 };
  const request = new Request('https://app.test/api/share', { method: 'POST', body: JSON.stringify(body) });
  return onRequestPost({ request, env: { SHARES: kv, FIREBASE_PROJECT_ID: 'proyecto' } as never });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => perfilFirestore()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/share con un servicio agotado', () => {
  it('KV sin cupo de escrituras: no responde un 400 con el texto de KV, deja que la API diga «no disponible»', async () => {
    const kv = kvFalso({ putFails: true });

    await expect(publicar(kv)).rejects.toThrow(/KV PUT failed/);
    const respuesta = await middleware({ next: () => publicar(kv) });

    expect(respuesta.status).toBe(503);
    const cuerpo = (await respuesta.json()) as { unavailable?: boolean; error?: string };
    expect(cuerpo.unavailable).toBe(true);
    expect(cuerpo.error).not.toMatch(/KV/);
    expect(Number(respuesta.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('si el contador del día no se puede anotar DESPUÉS de publicar, responde que se ha publicado', async () => {
    const kv = kvFalso();
    const putReal = kv.put.getMockImplementation()!;
    kv.put.mockImplementation(async (key: string, value: string) => {
      if (key.includes('daily') || key.includes('quota:')) throw new Error('KV PUT failed: 429');
      return putReal(key, value);
    });

    const respuesta = await publicar(kv);

    expect(respuesta.status).toBe(200);
    expect(((await respuesta.json()) as { token?: string }).token).toBeTruthy();
  });

  it('Firestore sin cuota: «no disponible», no «necesitas tu espacio social»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => perfilFirestore(429)));

    const respuesta = await middleware({ next: () => publicar(kvFalso()) });

    expect(respuesta.status).toBe(503);
    expect(((await respuesta.json()) as { unavailable?: boolean }).unavailable).toBe(true);
  });
});

describe('lectura del perfil desde el borde', () => {
  const usuario = { uid: 'u1', idToken: 't' } as never;

  it('un perfil que no existe es una respuesta (null), no un fallo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => perfilFirestore(404)));
    await expect(tryReadProfileFacts(usuario, 'p', null)).resolves.toBeNull();
  });

  it('Firestore sin cuota, caído o sin red es «no disponible»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => perfilFirestore(429)));
    await expect(tryReadProfileFacts(usuario, 'p', null)).rejects.toBeInstanceOf(ServiceUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => perfilFirestore(503)));
    await expect(tryReadProfileFacts(usuario, 'p', null)).rejects.toBeInstanceOf(ServiceUnavailableError);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(tryReadProfileFacts(usuario, 'p', null)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe('el resto del borde', () => {
  it('la sesión se verifica aunque KV no atienda: se piden las claves a Google', async () => {
    const claves = { keys: [{ kid: 'k1', kty: 'RSA', n: 'x', e: 'AQAB' }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(claves), { status: 200, headers: { 'cache-control': 'max-age=3600' } })));

    const resultado = await loadJwks(kvFalso({ getFails: true, putFails: true }) as never, 'https://google.test/jwks', 'jwks:x', 3600);

    expect(resultado).toEqual(claves.keys);
  });

  it('el enlace público sirve la aplicación aunque KV no atienda', async () => {
    const shell = new Response('<html><head></head><body>app</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const respuesta = await shareLink({
      request: new Request('https://app.test/r/abcdefghijklmnopqrstuv'),
      env: { SHARES: kvFalso({ getFails: true }) } as never,
      params: { token: 'abcdefghijklmnopqrstuv' },
      next: async () => shell,
    });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toContain('app');
  });

  it('`Retry-After` apunta al reinicio de los cupos, las 00:00 UTC', () => {
    expect(secondsUntilUtcMidnight(Date.parse('2026-10-04T23:00:00Z'))).toBe(3600);
  });
});
