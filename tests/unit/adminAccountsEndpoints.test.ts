// Los guardas de `/api/admin/accounts` y `/api/account` (docs/plan-cuentas-inactivas.md): es la parte que, si se
// rompe, borra cuentas que no debe. Se simulan la sesión (`requireAdmin` / `requireUser`) y la cuenta de servicio, y
// Google contesta con un `fetch` de mentira; lo que se comprueba es qué se deja borrar y qué no.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const caller = { user: { uid: 'admin', email: null, emailVerified: true, admin: true, idToken: 't' }, appCheckToken: null, projectId: 'p', isAdmin: true };
const requireAdminMock = vi.fn(async (): Promise<unknown> => caller);
const requireUserMock = vi.fn(async (): Promise<unknown> => ({ ...caller, user: { ...caller.user, uid: 'yo', admin: false }, isAdmin: false }));

vi.mock('../../functions/_lib/context', () => ({
  requireAdmin: () => requireAdminMock(),
  requireUser: () => requireUserMock(),
}));
vi.mock('../../functions/_lib/serviceAccount', () => ({
  hasServiceAccount: (env: { FIREBASE_ADMIN_SA?: string }) => Boolean(env.FIREBASE_ADMIN_SA),
  serviceAccessToken: async () => 'token',
}));

import { onRequestDelete } from '../../functions/api/account';
import { onRequestGet, onRequestPost, parsePurgeUids, PURGE_BATCH_MAX } from '../../functions/api/admin/accounts';
import type { KVNamespace } from '../../functions/_lib/keys';
import { PURGE_CHUNK } from '../../src/model/repository/adminAccountsRepository';

const DIA = 86_400_000;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const kv: KVNamespace = {
  get: (async () => null) as KVNamespace['get'],
  put: async () => {},
  delete: async () => {},
  list: (async () => ({ keys: [], list_complete: true })) as KVNamespace['list'],
};
const env = { SHARES: kv, FIREBASE_ADMIN_SA: '{}' };

/** Auth con estas cuentas (sin perfil ninguna) y Firestore vacío. Apunta a quién se pide borrar en Auth. */
function google(users: Array<Record<string, unknown>>, overrides: (url: string) => Response | undefined = () => undefined) {
  const deleted: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = overrides(url);
    if (custom) return custom;
    if (url.includes('accounts:batchGet')) return ok({ users });
    if (url.includes('accounts:delete')) {
      deleted.push((JSON.parse(String(init?.body)) as { localId: string }).localId);
      return ok({});
    }
    if (url.endsWith(':runQuery')) return ok([]);
    return ok({});
  }));
  return deleted;
}

const post = (body: unknown) =>
  onRequestPost({ request: new Request('https://x/api/admin/accounts', { method: 'POST', body: JSON.stringify(body) }), env });

const viejo = String(Date.now() - 300 * DIA);
const reciente = String(Date.now() - 2 * DIA);

beforeEach(() => {
  requireAdminMock.mockResolvedValue(caller);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/admin/accounts', () => {
  it('sin ser administrador no hace nada', async () => {
    requireAdminMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    const deleted = google([{ localId: 'a', createdAt: viejo }]);

    const response = await post({ uids: ['a'] });

    expect(response.status).toBe(403);
    expect(deleted).toEqual([]);
  });

  it('borra solo las caducadas: salta la activa, la del administrador y la de quien llama', async () => {
    const deleted = google([
      { localId: 'caducada', createdAt: viejo },
      { localId: 'activa', createdAt: viejo, lastRefreshAt: new Date(Number(reciente)).toISOString() },
      { localId: 'otroAdmin', createdAt: viejo, customAttributes: '{"admin":true}' },
      // Quien llama, aunque Auth no le viera el claim: su propia cuenta no se borra desde aquí.
      { localId: 'admin', createdAt: viejo },
    ]);

    type Body = { results: Array<{ uid: string; outcome: string; reason?: string }> };
    const first = (await (await post({ uids: ['caducada', 'activa', 'otroAdmin'] })).json()) as Body;
    const second = (await (await post({ uids: ['admin', 'noExiste'] })).json()) as Body;

    expect(deleted).toEqual(['caducada']);
    expect([...first.results, ...second.results]).toEqual([
      { uid: 'caducada', outcome: 'deleted' },
      { uid: 'activa', outcome: 'skipped', reason: 'not-expired' },
      { uid: 'otroAdmin', outcome: 'skipped', reason: 'not-expired' },
      { uid: 'admin', outcome: 'skipped', reason: 'not-expired' },
      { uid: 'noExiste', outcome: 'skipped', reason: 'not-found' },
    ]);
  });

  it('filtra lo que no tiene forma de uid y pone tope por petición', async () => {
    expect(parsePurgeUids({ uids: ['ok1', 'ok1', '../x', 7, '', 'a b'] })).toEqual(['ok1']);
    expect(parsePurgeUids(null)).toEqual([]);
    google([]);
    expect((await post({ uids: ['../x'] })).status).toBe(400);
    expect((await post({ uids: Array.from({ length: PURGE_BATCH_MAX + 1 }, (_, i) => `u${i}`) })).status).toBe(400);
  });

  it('el panel trocea igual que el servidor admite', () => {
    expect(PURGE_CHUNK).toBe(PURGE_BATCH_MAX);
  });

  it('con Google sin cupo a mitad, para y deja el resto como pendiente', async () => {
    let commits = 0;
    google([{ localId: 'a', createdAt: viejo }, { localId: 'b', createdAt: viejo }], (url) => {
      if (url.endsWith(':commit') && ++commits === 1) return new Response('{}', { status: 429 });
      return undefined;
    });

    const body = (await (await post({ uids: ['a', 'b'] })).json()) as { results: unknown[] };

    expect(body.results).toEqual([
      { uid: 'a', outcome: 'failed', failures: ['servicio no disponible'] },
      { uid: 'b', outcome: 'pending' },
    ]);
  });

  it('sin cuenta de servicio no borra nada', async () => {
    const response = await onRequestPost({ request: new Request('https://x', { method: 'POST', body: '{"uids":["a"]}' }), env: { SHARES: kv } });
    expect(response.status).toBe(503);
  });
});

describe('GET /api/admin/accounts', () => {
  it('sin cuenta de servicio lo dice en vez de dar una lista vacía', async () => {
    const response = await onRequestGet({ request: new Request('https://x'), env: { SHARES: kv } });
    expect(await response.json()).toEqual({ configured: false });
  });

  it('un rechazo de Google (rol que falta) sale como fallo de configuración, no como «no disponible»', async () => {
    google([], (url) => (url.includes('accounts:batchGet') ? new Response('{"error":{"message":"PERMISSION_DENIED"}}', { status: 403 }) : undefined));

    const response = await onRequestGet({ request: new Request('https://x'), env });
    const body = (await response.json()) as { google?: boolean; error?: string };

    expect(response.status).toBe(502);
    expect(body.google).toBe(true);
    // Solo el estado: el cuerpo de Google puede traer identificadores.
    expect(body.error).not.toContain('PERMISSION_DENIED');
  });
});

describe('DELETE /api/account', () => {
  it('borra solo la cuenta del uid que viene en el token', async () => {
    const deleted = google([]);
    const response = await onRequestDelete({ request: new Request('https://x', { method: 'DELETE' }), env });
    expect(response.status).toBe(200);
    expect(deleted).toEqual(['yo']);
  });

  it('un fallo de configuración no se presenta como «reintentar más tarde»', async () => {
    google([], (url) => (url.includes('accounts:delete') ? new Response('{}', { status: 403 }) : undefined));
    const response = await onRequestDelete({ request: new Request('https://x', { method: 'DELETE' }), env });
    expect(response.status).toBe(500);
    expect(((await response.json()) as { unavailable?: boolean }).unavailable).toBeUndefined();
  });

  it('sin sesión no llama a Google', async () => {
    requireUserMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const deleted = google([]);
    const response = await onRequestDelete({ request: new Request('https://x', { method: 'DELETE' }), env });
    expect(response.status).toBe(401);
    expect(deleted).toEqual([]);
  });
});
