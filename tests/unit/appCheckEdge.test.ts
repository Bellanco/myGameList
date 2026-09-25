// Verificación de JWT en el borde: el token de App Check (`functions/_lib/appCheck.ts`), su interruptor, y el ID
// token de Firebase Auth, que comparte con él las piezas de `functions/_lib/jwt.ts`.
//
// Las claves se generan aquí con WebCrypto y las claves públicas se sirven con un `fetch` simulado, así que cada
// prueba firma un token de verdad y el verificador hace la comprobación criptográfica real: lo único simulado es
// de dónde salen las claves. El KV es un `Map`: aquí solo guarda la caché de claves, no lógica que probar.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { APPCHECK_JWKS_URL, appCheckMode, gateAppCheck, verifyAppCheckToken } from '../../functions/_lib/appCheck';
import { JWKS_URL, verifyIdToken } from '../../functions/_lib/firebaseAuth';
import type { Env, KVNamespace } from '../../functions/_lib/keys';

const PROJECT_NUMBER = '721023375695';
const APP_ID = `1:${PROJECT_NUMBER}:web:da7ab55e6d8afc73470d3a`;
const PROJECT_ID = 'mylists-f7313';
const KID = 'clave-de-prueba';

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let publicJwk: JsonWebKey;

function memoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: (async (key: string, type?: 'text' | 'json') => {
      const value = store.get(key) ?? null;
      return type === 'json' && value !== null ? JSON.parse(value) : value;
    }) as KVNamespace['get'],
    put: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true }),
  };
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encodeJson = (value: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: CryptoKey = signingKey,
): Promise<string> {
  const body = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(signature))}`;
}

const now = (): number => Math.floor(Date.now() / 1000);

const appCheckHeader = { alg: 'RS256', typ: 'JWT', kid: KID };
const appCheckPayload = (): Record<string, unknown> => ({
  iss: `https://firebaseappcheck.googleapis.com/${PROJECT_NUMBER}`,
  aud: [`projects/${PROJECT_NUMBER}`, `projects/${PROJECT_ID}`],
  sub: APP_ID,
  iat: now() - 10,
  exp: now() + 3600,
});

const fetchSpy = vi.fn(async (url: string | URL | Request) => {
  const target = String(url);
  if (target === APPCHECK_JWKS_URL || target === JWKS_URL) {
    return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256' }] }), { status: 200 });
  }
  return new Response('no encontrado', { status: 404 });
});

beforeAll(async () => {
  const params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const pair = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const other = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  foreignKey = other.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  fetchSpy.mockClear();
  vi.restoreAllMocks();
});

const verify = (token: string): Promise<void> => verifyAppCheckToken(token, PROJECT_NUMBER, APP_ID, memoryKv());

describe('token de App Check', () => {
  it('acepta un token de este proyecto y de esta app', async () => {
    await expect(verify(await sign(appCheckHeader, appCheckPayload()))).resolves.toBeUndefined();
  });

  // Documentado como lista, pero si Google la simplifica a una cadena tiene que seguir valiendo.
  it('acepta la audiencia como cadena suelta', async () => {
    const token = await sign(appCheckHeader, { ...appCheckPayload(), aud: `projects/${PROJECT_NUMBER}` });
    await expect(verify(token)).resolves.toBeUndefined();
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>, RegExp]>([
    ['otro algoritmo (alg: none)', { ...appCheckHeader, alg: 'none' }, {}, /Algoritmo/],
    ['otro algoritmo (HS256)', { ...appCheckHeader, alg: 'HS256' }, {}, /Algoritmo/],
    ['un tipo que no es JWT', { ...appCheckHeader, typ: 'at+jwt' }, {}, /Tipo/],
    ['una clave que no está entre las vigentes', { ...appCheckHeader, kid: 'otra' }, {}, /Clave de firma/],
    ['un token caducado', appCheckHeader, { exp: now() - 3600 }, /caducado/],
    ['el emisor de otro proyecto', appCheckHeader, { iss: 'https://firebaseappcheck.googleapis.com/1' }, /Emisor/],
    [
      'el emisor de Auth en vez del de App Check',
      appCheckHeader,
      { iss: `https://securetoken.google.com/${PROJECT_ID}` },
      /Emisor/,
    ],
    // La audiencia se comprueba por NÚMERO: el id del proyecto solo no basta.
    ['una audiencia sin el número de proyecto', appCheckHeader, { aud: [`projects/${PROJECT_ID}`] }, /Audiencia/],
    ['el token de otra app del proyecto', appCheckHeader, { sub: `1:${PROJECT_NUMBER}:android:abc` }, /App desconocida/],
  ])('rechaza %s', async (_caso, header, overrides, error) => {
    const token = await sign(header, { ...appCheckPayload(), ...overrides });
    await expect(verify(token)).rejects.toThrow(error);
  });

  it('rechaza una firma hecha con otra clave', async () => {
    const token = await sign(appCheckHeader, appCheckPayload(), foreignKey);
    await expect(verify(token)).rejects.toThrow(/Firma/);
  });

  it('rechaza lo que no tiene forma de JWT', async () => {
    await expect(verify('no-es-un-token')).rejects.toThrow(/mal formado/);
    await expect(verify('a.b.c')).rejects.toThrow(/ilegible/);
  });

  // `/v1/jwks`, en plural: al revés que la de Auth (`/jwk/`), y por eso invita a «igualarlas».
  it('pide las claves al endpoint de App Check, en plural', () => {
    expect(APPCHECK_JWKS_URL).toBe('https://firebaseappcheck.googleapis.com/v1/jwks');
  });

  it('cachea las claves en KV en vez de pedirlas en cada petición', async () => {
    const kv = memoryKv();
    const token = await sign(appCheckHeader, appCheckPayload());
    await verifyAppCheckToken(token, PROJECT_NUMBER, APP_ID, kv);
    await verifyAppCheckToken(token, PROJECT_NUMBER, APP_ID, kv);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Cupo de escrituras de KV agotado (lo comparten carátulas y enlaces) o 429 por dos renovaciones a la vez.
  it('verifica igual si no puede guardar las claves en KV', async () => {
    const kv: KVNamespace = {
      ...memoryKv(),
      put: async () => {
        throw new Error('KV put() limit exceeded for the day.');
      },
    };
    await expect(verifyAppCheckToken(await sign(appCheckHeader, appCheckPayload()), PROJECT_NUMBER, APP_ID, kv))
      .resolves.toBeUndefined();
  });
});

describe('interruptor APPCHECK_EDGE_MODE', () => {
  const env = (mode: string | undefined, extra: Partial<Env> = {}): Env => ({
    SHARES: memoryKv(),
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_PROJECT_NUMBER: PROJECT_NUMBER,
    FIREBASE_APP_ID: APP_ID,
    APPCHECK_EDGE_MODE: mode,
    ...extra,
  });
  const request = (token?: string, path = '/api/share'): Request =>
    new Request(`https://example.test${path}`, { headers: token ? { 'X-Firebase-AppCheck': token } : {} });

  // Un valor mal escrito apaga en vez de exigir: prefiere dejar pasar a dejar a todo el mundo fuera.
  it('lee los tres modos y trata cualquier otro valor como apagado', () => {
    expect(appCheckMode(env('monitor'))).toBe('monitor');
    expect(appCheckMode(env('enforce'))).toBe('enforce');
    expect(appCheckMode(env(undefined))).toBe('off');
    expect(appCheckMode(env('enforced'))).toBe('off');
  });

  it('apagado no mira nada, ni siquiera pide las claves', async () => {
    expect(await gateAppCheck(request('basura'), env('off'))).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('en monitor deja pasar un token inválido o ausente, y lo registra', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await gateAppCheck(request(), env('monitor'))).toBeNull();
    expect(await gateAppCheck(request('a.b.c'), env('monitor'))).toBeNull();
    const verdicts = log.mock.calls.map(([line]) => JSON.parse(String(line)).verdict);
    expect(verdicts).toEqual(['missing', 'invalid']);
  });

  it('en monitor registra también los válidos, que es lo que dice cuándo pasar a enforce', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await sign(appCheckHeader, appCheckPayload());
    expect(await gateAppCheck(request(token), env('monitor'))).toBeNull();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ evt: 'appcheck', mode: 'monitor', verdict: 'ok' });
  });

  // Algunas rutas llevan el token de un enlace compartido: en el log sería un enlace que se puede abrir o retirar.
  it('no escribe en el log ni el token de App Check ni el tramo de la ruta que lleva el enlace', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await sign(appCheckHeader, { ...appCheckPayload(), exp: now() - 3600 });
    await gateAppCheck(request(token, '/api/share/token-secreto-del-enlace'), env('monitor'));
    const line = String(log.mock.calls[0][0]);
    expect(line).not.toContain(token);
    expect(line).not.toContain('token-secreto-del-enlace');
    expect(JSON.parse(line)).toMatchObject({ route: '/api/share', verdict: 'invalid', reason: 'Token caducado' });
  });

  it('en enforce deja pasar un token válido', async () => {
    const token = await sign(appCheckHeader, appCheckPayload());
    expect(await gateAppCheck(request(token), env('enforce'))).toBeNull();
  });

  it('en enforce responde 401 sin token o con uno inválido', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await gateAppCheck(request(), env('enforce')))?.status).toBe(401);
    expect((await gateAppCheck(request('a.b.c'), env('enforce')))?.status).toBe(401);
  });

  // Fallo nuestro, no del cliente: un 500 que se note al desplegar, no un 401 que parezca de sesión.
  it('en enforce sin número de proyecto o App ID responde 500', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await sign(appCheckHeader, appCheckPayload());
    expect((await gateAppCheck(request(token), env('enforce', { FIREBASE_APP_ID: '' })))?.status).toBe(500);
    expect((await gateAppCheck(request(token), env('enforce', { FIREBASE_PROJECT_NUMBER: '' })))?.status).toBe(500);
  });
});

// El ID token comparte con App Check la decodificación, la caché de claves y la firma (`jwt.ts`). Estas pruebas
// fijan que al sacarlas de `firebaseAuth.ts` no cambió nada de lo que se exige a una sesión.
describe('ID token de Firebase Auth', () => {
  const authHeader = { alg: 'RS256', kid: KID };
  const authPayload = (): Record<string, unknown> => ({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: 'uid-1',
    email: 'alguien@example.test',
    email_verified: true,
    iat: now() - 10,
    exp: now() + 3600,
  });

  it('devuelve quién es con un token válido', async () => {
    const token = await sign(authHeader, authPayload());
    await expect(verifyIdToken(token, PROJECT_ID, memoryKv())).resolves.toMatchObject({
      uid: 'uid-1',
      email: 'alguien@example.test',
      emailVerified: true,
      idToken: token,
    });
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>, RegExp]>([
    ['otro algoritmo', { ...authHeader, alg: 'none' }, {}, /Algoritmo/],
    ['una clave desconocida', { ...authHeader, kid: 'otra' }, {}, /Clave de firma/],
    ['un token caducado', authHeader, { exp: now() - 3600 }, /caducado/],
    ['un token emitido en el futuro', authHeader, { iat: now() + 3600 }, /futuro/],
    ['otra audiencia', authHeader, { aud: 'otro-proyecto' }, /Audiencia/],
    ['otro emisor', authHeader, { iss: 'https://securetoken.google.com/otro-proyecto' }, /Emisor/],
    ['un token sin sujeto', authHeader, { sub: '' }, /sujeto/],
  ])('rechaza %s', async (_caso, header, overrides, error) => {
    const token = await sign(header, { ...authPayload(), ...overrides });
    await expect(verifyIdToken(token, PROJECT_ID, memoryKv())).rejects.toThrow(error);
  });

  // Un token de App Check no es una sesión, aunque lo firme Google con el mismo algoritmo.
  it('rechaza un token de App Check presentado como sesión', async () => {
    const token = await sign(appCheckHeader, appCheckPayload());
    await expect(verifyIdToken(token, PROJECT_ID, memoryKv())).rejects.toThrow(/Audiencia/);
  });
});
