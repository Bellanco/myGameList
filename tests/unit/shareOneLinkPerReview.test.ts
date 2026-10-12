// UNA RESEÑA, UN ENLACE (12-10-2026). «Compartir» está en el panel (Estadísticas › Reseñas) y en el social (el
// detalle de tu actividad y tus reseñas desde tu perfil). Los tres sitios mandan el mismo `gameId` —el del juego
// en tus listas, ver `shareDraftOf`—, y la Function renueva el enlace activo de ese juego en vez de crear otro: se
// comparta desde donde se comparta, el enlace es el mismo y no gasta cuota.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareDraftOf } from '../../src/viewmodel/useShareViewModel';
import type { GameItem } from '../../src/model/types/game';

vi.mock('../../functions/_lib/context', () => ({
  requireUser: vi.fn(async () => ({ user: { uid: 'u1', idToken: 'id-token' }, projectId: 'proyecto', appCheckToken: null, isAdmin: false })),
}));

const { onRequestPost } = await import('../../functions/api/share/index');
const { onRequestGet: mine } = await import('../../functions/api/share/mine');

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

const hades = {
  id: 3, _ts: 1, name: 'Hades', platforms: ['PC'], genres: ['Roguelike'], steamDeck: false, review: 'Una maravilla.', grade: 92, score: 5,
} as GameItem;

function compartir(kv: ReturnType<typeof kvEspia>, game: GameItem, review: string) {
  const request = new Request('https://app.test/api/share', { method: 'POST', body: JSON.stringify(shareDraftOf(game, review)) });
  return onRequestPost({ request, env: { SHARES: kv, FIREBASE_PROJECT_ID: 'proyecto' } as never });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ fields: { displayName: { stringValue: 'Nick' }, tier: { stringValue: 'gold' } } }),
    { status: 200 },
  )));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('una reseña, un enlace', () => {
  it('compartir la misma reseña desde otra pantalla devuelve el MISMO enlace, renovado, sin crear otro', async () => {
    const kv = kvEspia();
    // Desde el panel…
    const first = (await (await compartir(kv, hades, 'Una maravilla.')).json()) as { token: string; renewed: boolean; url: string };
    expect(first.renewed).toBe(false);
    // …y después desde el social, con el texto ya corregido.
    const second = (await (await compartir(kv, hades, 'Una maravilla, sin más.')).json()) as { token: string; renewed: boolean; url: string };
    expect(second).toMatchObject({ token: first.token, url: first.url, renewed: true });

    const listed = (await (await mine({ request: new Request('https://app.test/api/share/mine'), env: { SHARES: kv, FIREBASE_PROJECT_ID: 'proyecto' } as never })).json()) as {
      shares: Array<{ token: string; gameId: number }>;
    };
    expect(listed.shares.filter((entry) => entry.gameId === hades.id)).toEqual([expect.objectContaining({ token: first.token })]);
  });

  it('otra reseña sí es otro enlace', async () => {
    const kv = kvEspia();
    const first = (await (await compartir(kv, hades, 'Una maravilla.')).json()) as { token: string };
    const celeste = { ...hades, id: 2, name: 'Celeste' } as GameItem;
    const other = (await (await compartir(kv, celeste, 'Preciosa.')).json()) as { token: string; renewed: boolean };
    expect(other.renewed).toBe(false);
    expect(other.token).not.toBe(first.token);
  });
});
