// `/api/admin/accounts`, `/api/account` y sus piezas (docs/plan-cuentas-inactivas.md). Sin red: a cada pieza se le da
// un `fetch` de mentira que contesta como Google, y lo que se comprueba es lo que DECIDE — qué se cruza, qué se borra
// y en qué orden, y que la cuenta de Auth se quede si algo de Firestore no se pudo borrar.
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetWrites, premiosParticipants, purgeAccount, readAccountCensus } from '../../functions/_lib/accounts';
import { decodeFields, encodeValue, toAuthAccount } from '../../functions/_lib/googleAdmin';
import { ServiceUnavailableError } from '../../functions/_lib/http';
import type { KVNamespace } from '../../functions/_lib/keys';
import { forgetServiceToken, parseServiceAccount, serviceAccessToken, signAssertion } from '../../functions/_lib/serviceAccount';
import { sanitizeAccountCensus } from '../../src/model/repository/adminAccountsRepository';
import { summarizePurge } from '../../src/viewmodel/useAdminAccounts';

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

/** Un Google de mentira: responde según la URL y apunta cada llamada. */
function fakeGoogle(routes: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { method: init?.method || 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return routes(call) || new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { calls, fetcher };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Un KV mínimo en memoria, con lo que usan `listActiveShares` y `removeShares`. */
function memoryKv(entries: Record<string, string> = {}): KVNamespace & { data: Map<string, string> } {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get: (async (key: string, type?: string) => {
      const value = data.get(key) ?? null;
      return type === 'json' && value ? JSON.parse(value) : value;
    }) as KVNamespace['get'],
    put: async (key: string, value: string) => void data.set(key, value),
    delete: async (key: string) => void data.delete(key),
    list: (async ({ prefix = '' } = {}) => ({
      keys: [...data.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    })) as KVNamespace['list'],
  };
}

describe('cuenta de servicio', () => {
  beforeEach(() => forgetServiceToken());

  it('solo acepta el JSON de una clave de cuenta de servicio', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('no es json')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ type: 'authorized_user', client_email: 'a', private_key: 'PRIVATE KEY' }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'sa@p.iam', private_key: '-----BEGIN PRIVATE KEY-----x' })))
      .toEqual({ clientEmail: 'sa@p.iam', privateKeyPem: '-----BEGIN PRIVATE KEY-----x' });
  });

  it('firma con RS256 un JWT que la clave pública verifica', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;

    const jwt = await signAssertion({ clientEmail: 'sa@p.iam', privateKeyPem: pem }, 1_000);
    const [header, payload, signature] = jwt.split('.');
    const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(payload)).toMatchObject({ iss: 'sa@p.iam', aud: 'https://oauth2.googleapis.com/token', iat: 1_000, exp: 4_600 });

    const bytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signature.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, bytes, new TextEncoder().encode(`${header}.${payload}`));
    expect(valid).toBe(true);
  });

  it('sin secreto lanza el error propio, sin llamar a Google', async () => {
    const google = fakeGoogle(() => undefined);
    await expect(serviceAccessToken({}, google.fetcher)).rejects.toThrow('FIREBASE_ADMIN_SA');
    expect(google.calls).toHaveLength(0);
  });
});

describe('censo de cuentas', () => {
  it('lee el uso de Auth (la renovación de la sesión) y el claim de administrador', () => {
    const account = toAuthAccount({
      localId: 'u1',
      email: 'a@b.c',
      createdAt: '1000',
      lastLoginAt: '2000',
      lastRefreshAt: '2026-10-15T10:00:00Z',
      customAttributes: '{"admin":true}',
    });
    expect(account).toMatchObject({ uid: 'u1', createdAt: 1000, lastLoginAt: 2000, lastRefreshAt: Date.parse('2026-10-15T10:00:00Z'), admin: true });
    // Un claim que no es exactamente `true` no hace administrador a nadie.
    expect(toAuthAccount({ localId: 'u2', customAttributes: '{"admin":"true"}' })?.admin).toBe(false);
  });

  it('saca a los participantes de los premios de sus dos registros', () => {
    const uids = premiosParticipants([
      { id: 'voters-2025', data: { uids: ['a', 'b', ''] } },
      { id: 'palmares-2024', data: { recipients: [{ uid: 'c', rank: 1 }, { rank: 2 }] } },
      { id: 'winners', data: { winners: { x: 'y' } } },
    ]);
    expect([...uids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('cruza Auth con perfiles, papeletas y premios, y cuenta los perfiles sin cuenta', async () => {
    const doc = (path: string, fields: Record<string, unknown> = {}) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields });
    const google = fakeGoogle(({ url }) => {
      if (url.includes('accounts:batchGet')) {
        return ok({ users: [{ localId: 'social', lastLoginAt: '5' }, { localId: 'google', createdAt: '7' }, { localId: 'votante' }] });
      }
      if (url.includes('/documents/profiles?')) {
        return ok({
          documents: [
            doc('profiles/social', { social: { mapValue: { fields: { enabled: { booleanValue: true } } } }, updatedAt: { timestampValue: '2026-10-01T00:00:00Z' } }),
            doc('profiles/huerfano', { updatedAt: { integerValue: '9' } }),
          ],
        });
      }
      if (url.includes('/documents/premiosBallots?')) return ok({ documents: [doc('premiosBallots/google')] });
      if (url.includes('/documents/premiosAdmin?')) {
        return ok({ documents: [doc('premiosAdmin/voters-2025', { uids: { arrayValue: { values: [{ stringValue: 'votante' }] } } })] });
      }
      return undefined;
    });

    const census = await readAccountCensus({ token: 't', projectId: 'p', fetcher: google.fetcher });

    expect(census.orphanProfiles).toBe(1);
    expect(census.accounts).toEqual([
      expect.objectContaining({ uid: 'social', profile: 'social', profileUpdatedAt: Date.parse('2026-10-01T00:00:00Z'), authLastUsedAt: 5 }),
      expect.objectContaining({ uid: 'google', profile: null, hasBallot: true, createdAt: 7 }),
      expect.objectContaining({ uid: 'votante', profile: null, premiosParticipant: true }),
    ]);
  });

  it('decodifica los valores de Firestore REST que se leen', () => {
    expect(decodeFields({
      a: { booleanValue: false },
      b: { integerValue: '12' },
      c: { timestampValue: '1970-01-01T00:00:01Z' },
      d: { mapValue: { fields: { e: { stringValue: 'x' } } } },
      f: { arrayValue: {} },
    })).toEqual({ a: false, b: 12, c: 1000, d: { e: 'x' }, f: [] });
  });
});

describe('forgetWrites', () => {
  const doc = (path: string, fields: Record<string, unknown>, updateTime = 't1') => ({
    name: `projects/p/databases/(default)/documents/${path}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])),
    updateTime,
  });

  it('quita su uid de los registros de premios y su fila del archivo y de los votos, y nada más', () => {
    const writes = forgetWrites({
      uid: 'u1',
      profileIds: new Set(['p1']),
      premiosAdmin: [
        doc('premiosAdmin/voters-2025', { uids: ['u1', 'u2'] }),
        doc('premiosAdmin/palmares-2025', { recipients: [{ uid: 'u1', rank: 1 }, { uid: 'u2', rank: 0, place: 4 }] }),
        doc('premiosAdmin/palmares-2024', { recipients: [{ uid: 'u2', rank: 2 }] }),
        doc('premiosAdmin/winners', { winners: {} }),
      ],
      results: [
        doc('premiosResults/2025', {
          leaderboard: [
            { rank: 1, profileId: 'p1', nickname: 'Yo', points: 16 },
            // Gente de fuera de la app: el `profileId` vacío no se busca nunca.
            { rank: 1, profileId: '', nickname: 'Ismael', points: 16 },
            { rank: 2, profileId: 'p2', nickname: 'Otro', points: 14.5 },
          ],
        }),
        doc('premiosResults/2020', { leaderboard: [{ rank: 1, profileId: 'p2', nickname: 'Otro', points: 11 }] }),
      ],
      reveals: [doc('premiosReveal/2025', { ballots: [{ rank: 1, profileId: 'p1', nickname: 'Yo', points: 16, selections: { a: 'b' } }] }, 't9')],
    });

    expect(writes).toEqual([
      { update: 'premiosAdmin/voters-2025', fields: { uids: ['u2'] }, updateTime: 't1' },
      { update: 'premiosAdmin/palmares-2025', fields: { recipients: [{ uid: 'u2', rank: 0, place: 4 }] }, updateTime: 't1' },
      {
        update: 'premiosResults/2025',
        // El resto se queda con su puesto: quitar a alguien no reordena a los demás.
        fields: { leaderboard: [{ rank: 1, profileId: '', nickname: 'Ismael', points: 16 }, { rank: 2, profileId: 'p2', nickname: 'Otro', points: 14.5 }] },
        updateTime: 't1',
      },
      { update: 'premiosReveal/2025', fields: { ballots: [] }, updateTime: 't9' },
    ]);
  });

  it('sin seudónimo no toca el archivo, aunque haya filas con el profileId vacío', () => {
    const writes = forgetWrites({
      uid: 'u1',
      profileIds: new Set(),
      premiosAdmin: [],
      results: [doc('premiosResults/2025', { leaderboard: [{ rank: 1, profileId: '', nickname: 'X', points: 1 }] })],
      reveals: [],
    });
    expect(writes).toEqual([]);
  });
});

describe('purgeAccount', () => {
  const fs = (path: string, fields: Record<string, unknown> = {}) => ({
    name: `x/documents/${path}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])),
    updateTime: 'v1',
  });
  const routes = (overrides: (call: Call) => Response | undefined = () => undefined) => (call: Call) => {
    const custom = overrides(call);
    if (custom) return custom;
    if (call.url.endsWith(':runQuery')) {
      const query = call.body as { structuredQuery: { from: Array<{ collectionId: string }> } };
      const collection = query.structuredQuery.from[0].collectionId;
      if (collection === 'friendships') return ok([{ document: fs('friendships/a__u1') }]);
      if (collection === 'friendshipKeys') return ok([{ document: fs('friendshipKeys/u1__z') }, {}]);
      // Un perfil legacy con otro id, que lleva el uid dentro, y su seudónimo.
      if (collection === 'profiles') return ok([{ document: fs('profiles/perfil-viejo', { profileId: 'p-viejo' }) }]);
      if (collection === 'adminLog') return ok([{ document: fs('adminLog/e1') }]);
    }
    if (call.method === 'GET' && call.url.includes('/documents/privateConfig/')) return ok(fs('privateConfig/u1', { profileId: 'p1' }));
    if (call.method === 'GET' && call.url.includes('/documents/userMap/')) return new Response('{}', { status: 404 });
    if (call.url.includes('/documents/premiosAdmin?')) return ok({ documents: [fs('premiosAdmin/palmares-2025', { recipients: [{ uid: 'u1', rank: 1 }] })] });
    if (call.url.includes('/documents/premiosResults?')) {
      return ok({ documents: [fs('premiosResults/2025', { leaderboard: [{ rank: 1, profileId: 'p1', nickname: 'Yo', points: 3 }, { rank: 1, profileId: 'p-viejo', nickname: 'Yo antes', points: 3 }] })] });
    }
    if (call.url.includes('/documents/premiosReveal?')) return ok({ documents: [] });
    return undefined;
  };
  const committed = (calls: Call[]) =>
    calls
      .filter((call) => call.url.endsWith(':commit'))
      .flatMap((call) => (call.body as { writes: Array<{ delete?: string; update?: { name: string } }> }).writes)
      .map((write) => (write.delete ? `borra ${write.delete.split('/documents/')[1]}` : `reescribe ${write.update?.name.split('/documents/')[1]}`));

  it('se lleva todo: amistades, depósitos, perfiles, registro del panel, premios, KV y la cuenta de Auth la última', async () => {
    const google = fakeGoogle(routes());
    const now = Date.UTC(2026, 9, 15, 12);
    const kv = memoryKv({
      'user:u1:tok1': '',
      'share:tok1': '{}',
      'owner:tok1': 'u1',
      'share:otro': '{}',
      'ban:u1': '1',
      'quota:override:u1': '{}',
      'relidx:u1': '[]',
      'quota:u1:2026-10-15': '2',
      'quota:u1:2026-10-14': '1',
      'ban:u2': '1',
    });

    const outcome = await purgeAccount({ token: 't', projectId: 'p', fetcher: google.fetcher }, kv, 'u1', now);

    expect(outcome).toEqual({ failures: [], authDeleted: true });
    expect(committed(google.calls).sort()).toEqual([
      'borra adminLog/e1',
      'borra friendshipKeys/a__u1',
      'borra friendshipKeys/u1__z',
      'borra friendships/a__u1',
      'borra premiosBallots/u1',
      'borra privateConfig/u1',
      'borra profiles/perfil-viejo',
      'borra profiles/u1',
      'borra publicConfig/u1',
      'borra userMap/u1',
      'reescribe premiosAdmin/palmares-2025',
      'reescribe premiosResults/2025',
    ]);
    // Sus dos filas del archivo (por los dos seudónimos) se van.
    const commit = google.calls.find((call) => call.url.endsWith(':commit'));
    const results = (commit?.body as { writes: Array<{ update?: { name: string; fields: Record<string, unknown> } }> }).writes
      .find((write) => write.update?.name.endsWith('premiosResults/2025'));
    expect(results?.update?.fields).toEqual({ leaderboard: { arrayValue: { values: [] } } });
    // Once llamadas a Google por cuenta, tenga lo que tenga: nueve lecturas, el commit y Auth.
    expect(google.calls).toHaveLength(11);
    const last = google.calls[google.calls.length - 1];
    expect(last.url).toContain('accounts:delete');
    expect(last.body).toEqual({ localId: 'u1' });
    // KV: lo suyo se va; lo de otros, no.
    expect([...kv.data.keys()].sort()).toEqual(['ban:u2', 'share:otro']);
  });

  it('si el borrado de documentos falla, la cuenta de Auth se queda y se dice qué falló', async () => {
    const google = fakeGoogle(routes((call) => (call.url.endsWith(':commit') ? new Response('{}', { status: 409 }) : undefined)));

    const outcome = await purgeAccount({ token: 't', projectId: 'p', fetcher: google.fetcher }, memoryKv(), 'u1');

    expect(outcome.authDeleted).toBe(false);
    expect(outcome.failures).toEqual([expect.stringContaining('documentos')]);
    expect(google.calls.some((call) => call.url.includes('accounts:delete'))).toBe(false);
  });

  it('si no puede leer algo, no borra nada', async () => {
    const google = fakeGoogle(routes((call) => (call.url.includes('/documents/premiosResults?') ? new Response('{}', { status: 403 }) : undefined)));
    const kv = memoryKv({ 'user:u1:tok1': '', 'share:tok1': '{}' });

    const outcome = await purgeAccount({ token: 't', projectId: 'p', fetcher: google.fetcher }, kv, 'u1');

    expect(outcome.failures).toEqual([expect.stringContaining('archivo de premios')]);
    expect(committed(google.calls)).toEqual([]);
    expect(kv.data.has('share:tok1')).toBe(true);
  });

  it('una cuenta que ya no está en Auth cuenta como borrada', async () => {
    const google = fakeGoogle(routes((call) =>
      call.url.includes('accounts:delete') ? new Response(JSON.stringify({ error: { message: 'USER_NOT_FOUND' } }), { status: 400 }) : undefined));

    const outcome = await purgeAccount({ token: 't', projectId: 'p', fetcher: google.fetcher }, memoryKv(), 'u1');

    expect(outcome).toEqual({ failures: [], authDeleted: true });
  });

  it('con Google sin cupo o sin red deja pasar el error para que quien llama pare', async () => {
    const sinCupo = fakeGoogle(() => new Response('{}', { status: 429 }));
    await expect(purgeAccount({ token: 't', projectId: 'p', fetcher: sinCupo.fetcher }, memoryKv(), 'u1')).rejects.toBeInstanceOf(ServiceUnavailableError);
    const sinRed = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(purgeAccount({ token: 't', projectId: 'p', fetcher: sinRed }, memoryKv(), 'u1')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe('cliente del panel', () => {
  it('descarta las filas sin uid y normaliza el resto', () => {
    const census = sanitizeAccountCensus({
      fetchedAt: 10,
      orphanProfiles: 2,
      accounts: [{ uid: '' }, { uid: 'a', profile: 'otro', createdAt: 'x', admin: 'true', email: 'a@b.c' }],
    });
    expect(census).toEqual({
      fetchedAt: 10,
      orphanProfiles: 2,
      accounts: [expect.objectContaining({ uid: 'a', profile: null, createdAt: 0, admin: false, email: 'a@b.c' })],
    });
    expect(sanitizeAccountCensus({ accounts: 'no' })).toBeNull();
  });

  it('resume el borrado: lo pendiente cuenta como no borrado', () => {
    expect(summarizePurge([
      { uid: 'a', outcome: 'deleted' },
      { uid: 'b', outcome: 'skipped', reason: 'not-expired' },
      { uid: 'c', outcome: 'failed', failures: ['x'] },
      { uid: 'd', outcome: 'pending' },
    ])).toEqual({ deleted: 1, skipped: 1, failed: 2 });
  });
});
