import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { SocialGistData } from '../../src/model/repository/gistRepository';

// Escenario real: `normalizeData({ forceTimestamp: true })` (importar JSON / sobrescribir remoto) puso `_ts` de
// TODA la biblioteca en un mismo día, así que las reseñas que el backfill publicó con ese `_ts` llevan una fecha
// que no es la suya. Las que se publicaron en su día SÍ tienen fecha real, y no se pueden tocar.

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async () => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real', photoURL: null })),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  resolveOwnProfile: vi.fn(async (): Promise<null> => null),
}));
vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const idbMocks = vi.hoisted(() => {
  let meta: Record<string, unknown> | null = null;
  return {
    __setMeta: (m: Record<string, unknown> | null) => { meta = m; },
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (p: Record<string, unknown>) => { meta = { ...(meta || {}), ...p }; }),
    invalidateCachedSocialDirectory: vi.fn(async () => {}),
  };
});
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

const localMocks = vi.hoisted(() => ({
  loadLocalState: vi.fn((): TabData => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 })),
  normalizeData: vi.fn((d: unknown) => d),
}));
vi.mock('../../src/model/repository/localRepository', () => localMocks);

import { repairUndatedHistoryDates } from '../../src/model/repository/socialActivityHistory';
import { reconcileReviewActivity } from '../../src/model/repository/socialActivityReconcile';

const TOKEN = 'ghp_0123456789abcdefghij';
const FILE = 'myGameList.social.json';

const SELLO = Date.parse('2026-07-26T09:00:00.000Z'); // día del import: `_ts` en bloque
const ANCLA = '2026-05-12';
const REAL_1 = Date.parse('2026-05-13T07:19:00.000Z');
const REAL_2 = Date.parse('2026-07-08T18:02:00.000Z');

function game(id: number, name: string, ts: number): GameItem {
  return {
    id, name, _ts: ts, review: `reseña de ${name}`, score: 4,
    platforms: [], genres: [], steamDeck: false, years: [],
    strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0,
  } as GameItem;
}

function reviewEntry(gameId: number, gameName: string, updatedAt: number) {
  return {
    id: `pid-1:${gameId}:review`,
    key: `pid-1:${gameId}:review`,
    type: 'review' as const,
    actorProfileId: 'pid-1',
    actorName: 'Nick',
    gameId, gameName, rating: 4, grade: 80,
    recommendationText: '', snippet: 'algo',
    createdAt: updatedAt, updatedAt,
  };
}

function socialGist(activity: SocialGistData['activity']): SocialGistData {
  return {
    profile: {
      name: 'Nick', private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity, posts: [], updatedAt: 1, schemaVersion: 2,
  } as unknown as SocialGistData;
}

function stubGist(data: SocialGistData) {
  const store: Record<string, { content: string }> = { [FILE]: { content: JSON.stringify(data) } };
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if ((init.method || 'GET').toUpperCase() === 'PATCH') {
      writes += 1;
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string }> };
      Object.assign(store, body.files);
      return new Response(JSON.stringify({ updated_at: '2026-07-27T00:00:00Z' }), { status: 200, headers: { etag: 'W/"1"' } });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers: { etag: 'W/"0"' } });
  }));
  return {
    writes: () => writes,
    activity: () => (JSON.parse(store[FILE].content) as SocialGistData).activity,
    byGame: (gameId: number) => (JSON.parse(store[FILE].content) as SocialGistData).activity.find((e) => e.gameId === gameId)!,
  };
}

/**
 * Biblioteca del escenario: 12 juegos reseñados con `_ts` del día del sello (supera el umbral de detección en
 * bloque). Dos de ellos (1 y 2) ya estaban publicados en su día con fecha real.
 */
function bibliotecaConSello(): TabData {
  const games = Array.from({ length: 12 }, (_, i) => game(i + 1, `Juego ${i + 1}`, SELLO));
  return { c: games, v: [], e: [], p: [], deleted: [], updatedAt: SELLO };
}

beforeEach(() => {
  idbMocks.__setMeta(null);
  localStorage.clear();
  sessionStorage.clear();
  localMocks.loadLocalState.mockReturnValue(bibliotecaConSello());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function armChannel(gistId: string): void {
  localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ token: TOKEN, gistId, etag: null, lastRemoteUpdatedAt: 0 }));
}

describe('repairUndatedHistoryDates', () => {
  it('mueve a la fecha ancla solo el histórico sellado en bloque y CONSERVA las fechas reales', async () => {
    const gistId = 'ffee1122aabb0001';
    armChannel(gistId);
    const store = stubGist(
      socialGist([
        reviewEntry(1, 'Juego 1', REAL_1), // publicada en su día
        reviewEntry(2, 'Juego 2', REAL_2), // publicada en su día
        reviewEntry(3, 'Juego 3', SELLO), // backfill con el `_ts` del import
        reviewEntry(4, 'Juego 4', SELLO), // backfill con el `_ts` del import
      ]),
    );

    const plan = await repairUndatedHistoryDates({ date: ANCLA, apply: true });

    expect(plan?.bulkDays).toEqual(['2026-07-26']);
    expect(plan?.toMove.map((item) => item.gameId).sort()).toEqual([3, 4]);
    expect(plan?.keeping.map((item) => item.gameId).sort()).toEqual([1, 2]);

    // Las reales, intactas.
    expect(store.byGame(1).updatedAt).toBe(REAL_1);
    expect(store.byGame(2).updatedAt).toBe(REAL_2);
    // El histórico, al día ancla (y `createdAt` con él, para no quedar por delante de `updatedAt`).
    expect(new Date(store.byGame(3).updatedAt).toISOString().slice(0, 10)).toBe(ANCLA);
    expect(new Date(store.byGame(4).updatedAt).toISOString().slice(0, 10)).toBe(ANCLA);
    expect(store.byGame(3).createdAt).toBe(store.byGame(3).updatedAt);
    // Fechas distintas entre sí → orden estable dentro del día.
    expect(store.byGame(3).updatedAt).not.toBe(store.byGame(4).updatedAt);
  });

  it('mueve la entrada sellada aunque el `_ts` del juego haya saltado a OTRO día sellado', async () => {
    // Caso real: la primera pasada del backfill publicó con el sello del día 26; una importación posterior movió
    // el `_ts` de esos juegos al 27. La entrada sigue en el 26 (día sellado) pero ya no coincide con su `_ts`.
    armChannel('ffee1122aabb0005');
    const SELLO_2 = Date.parse('2026-07-27T10:00:00.000Z');
    const games = [
      ...Array.from({ length: 12 }, (_, i) => game(i + 1, `Juego ${i + 1}`, SELLO)),
      // 10 juegos con el `_ts` del segundo sello: suficientes para que ese día también se detecte.
      ...Array.from({ length: 10 }, (_, i) => game(100 + i, `Movido ${i + 1}`, SELLO_2)),
    ];
    localMocks.loadLocalState.mockReturnValue({ c: games, v: [], e: [], p: [], deleted: [], updatedAt: SELLO_2 });

    const store = stubGist(
      socialGist([
        reviewEntry(1, 'Juego 1', REAL_1), // publicada en su día → intacta
        reviewEntry(100, 'Movido 1', SELLO), // publicada con el sello del 26, `_ts` ahora en el 27
      ]),
    );

    const plan = await repairUndatedHistoryDates({ date: ANCLA, apply: true });

    expect(plan?.bulkDays).toEqual(['2026-07-26', '2026-07-27']);
    expect(plan?.toMove.map((item) => item.gameId)).toEqual([100]);
    expect(new Date(store.byGame(100).updatedAt).toISOString().slice(0, 10)).toBe(ANCLA);
    expect(store.byGame(1).updatedAt).toBe(REAL_1);
  });

  it('por defecto es un simulacro: devuelve el plan sin escribir', async () => {
    const gistId = 'ffee1122aabb0002';
    armChannel(gistId);
    const store = stubGist(socialGist([reviewEntry(3, 'Juego 3', SELLO)]));

    const plan = await repairUndatedHistoryDates({ date: ANCLA });

    expect(plan?.toMove).toHaveLength(1);
    expect(plan?.applied).toBe(false);
    expect(store.writes()).toBe(0);
    expect(store.byGame(3).updatedAt).toBe(SELLO);
  });

  it('sin sello en bloque (pocas reseñas ese día) no mueve nada', async () => {
    const gistId = 'ffee1122aabb0003';
    armChannel(gistId);
    localMocks.loadLocalState.mockReturnValue({
      c: [game(1, 'Juego 1', SELLO), game(2, 'Juego 2', SELLO)], // solo 2: por debajo del umbral
      v: [], e: [], p: [], deleted: [], updatedAt: SELLO,
    });
    const store = stubGist(socialGist([reviewEntry(1, 'Juego 1', SELLO)]));

    const plan = await repairUndatedHistoryDates({ date: ANCLA, apply: true });

    expect(plan?.bulkDays).toEqual([]);
    expect(plan?.toMove).toHaveLength(0);
    expect(store.writes()).toBe(0);
  });

  it('la reconciliación posterior NO deshace el cambio ni toca las fechas reales', async () => {
    const gistId = 'ffee1122aabb0004';
    armChannel(gistId);
    const store = stubGist(
      socialGist([reviewEntry(1, 'Juego 1', REAL_1), reviewEntry(3, 'Juego 3', SELLO)]),
    );

    await repairUndatedHistoryDates({ date: ANCLA, apply: true });
    const trasReparar = { real: store.byGame(1).updatedAt, historico: store.byGame(3).updatedAt };
    const escriturasTrasReparar = store.writes();

    // Pasada de reconciliación con los mismos listados: publica lo que falte, pero no debe re-fechar nada.
    const outcome = await reconcileReviewActivity({ games: bibliotecaConSello(), force: true });

    expect(outcome.repaired).toBe(0);
    expect(outcome.removed).toBe(0);
    expect(store.byGame(1).updatedAt).toBe(trasReparar.real);
    expect(store.byGame(3).updatedAt).toBe(trasReparar.historico);
    // Las 10 reseñas restantes de la biblioteca sí se publican (nunca lo habían estado).
    expect(outcome.added).toBe(10);
    expect(store.writes()).toBe(escriturasTrasReparar + 1);
  });
});
