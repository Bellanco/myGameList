// POST /api/share/year: el enlace del resumen del año (docs/plan-resumen-del-ano.md, Fase 4). Lo que fijan estas
// pruebas es el COSTE en escrituras de KV —3 al crear, 1 al actualizar, 0 al rechazar—, la ventana, la espera por
// rango y que el enlace de resumen no se mezcle con la cuota de reseñas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildYearSummary } from '../../src/core/stats/yearSummary';
import { publicYearSummary } from '../../src/core/stats/publicYearSummary';
import type { FinishedGame } from '../../src/core/utils/finishDates';

vi.mock('../../functions/_lib/context', () => ({
  requireUser: vi.fn(async () => ({ user: { uid: 'u1', idToken: 'id-token' }, projectId: 'proyecto', appCheckToken: null, isAdmin: false })),
}));

const { onRequestPost } = await import('../../functions/api/share/year');
const { onRequestGet: mine } = await import('../../functions/api/share/mine');
const { userShareKey, shareKey, ownerKey } = await import('../../functions/_lib/keys');

const DAY = 24 * 60 * 60 * 1000;

function kvEspia() {
  const store = new Map<string, { value: string; metadata?: unknown }>();
  return {
    store,
    get: vi.fn(async (key: string, type?: string) => {
      const raw = store.get(key)?.value ?? null;
      return type === 'json' && raw ? JSON.parse(raw) : raw;
    }),
    put: vi.fn(async (key: string, value: string, opts?: { metadata?: unknown }) => {
      store.set(key, { value, metadata: opts?.metadata });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({
      keys: [...store.entries()].filter(([name]) => name.startsWith(prefix)).map(([name, entry]) => ({ name, metadata: entry.metadata })),
      list_complete: true,
      cursor: '',
    })),
  };
}

let tier = 'gold';
function perfil() {
  return new Response(JSON.stringify({ fields: { displayName: { stringValue: 'Nick' }, tier: { stringValue: tier } } }), { status: 200 });
}

const games: FinishedGame[] = [1, 2].map((id) => ({
  id, _ts: 1, name: `Juego ${id}`, platforms: ['PC'], genres: ['RPG'], steamDeck: false, review: 'Texto.', years: [2026], grade: 80 + id,
}));
const summary = publicYearSummary(buildYearSummary({ completed: games, year: 2026, precision: 'month' })!);

function compartir(kv: ReturnType<typeof kvEspia>, body: Record<string, unknown> = { year: 2026, summary }) {
  const request = new Request('https://app.test/api/share/year', { method: 'POST', body: JSON.stringify(body) });
  return onRequestPost({ request, env: { SHARES: kv, FIREBASE_PROJECT_ID: 'proyecto' } as never });
}

beforeEach(() => {
  tier = 'gold';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 11, 20, 12)));
  vi.stubGlobal('fetch', vi.fn(async () => perfil()));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('POST /api/share/year', () => {
  it('crear son 3 escrituras: artículo, propietario e índice marcado como resumen', async () => {
    const kv = kvEspia();
    const response = await compartir(kv);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; expiresAt: number; nextUpdateAt: number; renewed: boolean; url: string };
    expect(kv.put).toHaveBeenCalledTimes(3);
    expect(body.renewed).toBe(false);
    expect(body.url).toBe(`https://app.test/r/${body.token}`);
    // Caduca al cerrar la ventana, sea cual sea el rango; oro espera 2 días para actualizar.
    expect(body.expiresAt).toBe(Date.UTC(2027, 0, 16, 12));
    expect(body.nextUpdateAt).toBe(Date.now() + 2 * DAY);
    expect(kv.store.get(ownerKey(body.token))?.value).toBe('u1');
    expect(kv.store.get(userShareKey('u1', body.token))?.metadata).toMatchObject({ kind: 'year', year: 2026, gameId: 0, gameName: 'Resumen de 2026' });
    const article = JSON.parse(kv.store.get(shareKey(body.token))!.value);
    expect(article).toMatchObject({ v: 1, kind: 'year', year: 2026, authorNick: 'Nick', summary });
  });

  it('actualizar antes de la espera del rango: 429 con la fecha, y nada escrito', async () => {
    const kv = kvEspia();
    const first = (await (await compartir(kv)).json()) as { token: string };
    kv.put.mockClear();
    vi.setSystemTime(new Date(Date.now() + DAY));
    const response = await compartir(kv);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ nextUpdateAt: Date.UTC(2026, 11, 22, 12), token: first.token });
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('actualizar pasada la espera: 1 escritura, el mismo enlace y la misma caducidad', async () => {
    const kv = kvEspia();
    const first = (await (await compartir(kv)).json()) as { token: string; createdAt: number };
    kv.put.mockClear();
    vi.setSystemTime(new Date(Date.now() + 2 * DAY));
    const response = await compartir(kv);
    const body = (await response.json()) as { token: string; renewed: boolean; createdAt: number; updatedAt: number };
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ token: first.token, renewed: true, createdAt: first.createdAt, updatedAt: Date.now() });
  });

  it('la espera va por rango: mithril 1 día, bronce 5', async () => {
    tier = 'mithril';
    const kv = kvEspia();
    await compartir(kv);
    vi.setSystemTime(new Date(Date.now() + DAY));
    expect((await compartir(kv)).status).toBe(200);

    tier = 'bronze';
    const otro = kvEspia();
    await compartir(otro);
    vi.setSystemTime(new Date(Date.now() + 4 * DAY));
    expect((await compartir(otro)).status).toBe(429);
  });

  it('fuera de la ventana o con otro año: 409 y ni una lectura de KV', async () => {
    const kv = kvEspia();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 12)));
    expect((await compartir(kv)).status).toBe(409);
    vi.setSystemTime(new Date(Date.UTC(2026, 11, 20)));
    expect((await compartir(kv, { year: 2025, summary })).status).toBe(409);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.list).not.toHaveBeenCalled();
  });

  it('un resumen con la cita o con el día no se publica: 400 y nada escrito', async () => {
    const kv = kvEspia();
    const conCita = { ...summary, best: { ...summary.best!, quote: 'Mi reseña entera' } };
    expect((await compartir(kv, { year: 2026, summary: conCita })).status).toBe(400);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('no cuenta como reseña compartida: «mis enlaces» lo da aparte', async () => {
    const kv = kvEspia();
    const { token } = (await (await compartir(kv)).json()) as { token: string };
    const response = await mine({ request: new Request('https://app.test/api/share/mine'), env: { SHARES: kv, FIREBASE_PROJECT_ID: 'proyecto' } as never });
    const body = (await response.json()) as { shares: unknown[]; yearShares: Array<{ token: string; year: number }> };
    expect(body.shares).toEqual([]);
    expect(body.yearShares).toEqual([expect.objectContaining({ token, year: 2026 })]);
  });
});
