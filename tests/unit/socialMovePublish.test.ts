// F4 — publicación A REBUFO de los mensajes de lista.
//
// La idea que esto protege: mover un juego de lista NO pide su propia escritura contra GitHub. Los mensajes
// viajan gratis en la primera escritura del canal que ocurra por otro motivo (una reseña, una publicación), y si
// no ocurre ninguna, los recoge la reconciliación al abrir el hub. Lo que se comprueba aquí es que van, que no
// añaden ni una petición, y que respetan lo que el usuario esconde.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialGistData } from '../../src/model/repository/socialGistRepository';
import type { GameItem } from '../../src/model/types/game';

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<unknown> => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real Name', photoURL: null })),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  ensureProfileByEmail: vi.fn(async () => ({})),
  resolveOwnProfile: vi.fn(async (): Promise<unknown> => null),
  getPrivateConfig: vi.fn(async (): Promise<unknown> => null),
  healOwnFriendshipIdentity: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const idbMocks = vi.hoisted(() => {
  let meta: Record<string, unknown> | null = null;
  return {
    __reset: () => { meta = null; },
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (patch: Record<string, unknown>) => { meta = { ...(meta || {}), ...patch }; }),
    invalidateCachedSocialDirectory: vi.fn(async () => {}),
  };
});
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

import { publishPost, publishReviewActivity } from '../../src/model/repository/socialPublishRepository';

const TOKEN = 'ghp_0123456789abcdefghij';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';
const STORAGE_KEY = 'mis-listas-v12-unified';

const P = 1_600_000_000_000;
const E = 1_650_000_000_000;
const C = 1_700_000_000_000;
/** Año del sello de completado: la proyección exige que `years` lo incluya (jugar, no catalogar). */
const ANIO_C = new Date(C).getFullYear();

function game(input: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    platforms: ['Steam'], genres: ['Metroidvania'], steamDeck: false, review: '', score: 0,
    // Terminado en el año de su sello: el caso corriente. Los tests del filtro pasan su propio `years`.
    years: [ANIO_C],
    _ts: C,
    ...input,
  } as GameItem;
}

/** Siembra los listados en localStorage: es de donde `withMoveActivity` los lee (no del estado del render). */
function seedLocalGames(games: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    c: [], v: [], e: [], p: [], deleted: [], updatedAt: 2_000_000_000_000, etag: null, lastRemoteUpdatedAt: 0,
    ...games,
  }));
}

function socialGist(overrides: Partial<SocialGistData> = {}): SocialGistData {
  return {
    profile: {
      name: 'Nick',
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    updatedAt: 1,
    schemaVersion: 2,
    ...overrides,
  } as unknown as SocialGistData;
}

function stubGistStore(gist: SocialGistData) {
  const store: Record<string, { content: string }> = { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(gist) } };
  let writes = 0;
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'PATCH') {
      writes += 1;
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string }> };
      Object.assign(store, body.files);
      return new Response(JSON.stringify({ updated_at: '2026-07-01T00:00:00Z' }), { status: 200, headers: { etag: 'W/"e1"' } });
    }
    reads += 1;
    return new Response(JSON.stringify({ files: store }), { status: 200, headers: { etag: 'W/"e0"' } });
  }));
  return {
    writes: () => writes,
    reads: () => reads,
    requests: () => writes + reads,
    current: () => JSON.parse(store[SOCIAL_GIST_FILENAME].content) as SocialGistData,
  };
}

function armChannel(gistId: string): void {
  localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ token: TOKEN, gistId, etag: null, lastRemoteUpdatedAt: 0 }));
}

const REVIEW = { id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, grade: 96, reviewChanged: true };

beforeEach(() => {
  idbMocks.__reset();
  localStorage.clear();
  sessionStorage.clear();
  firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real Name', photoURL: null });
  firebaseMocks.resolveStableProfileId.mockResolvedValue('pid-1');
  firebaseMocks.ensureProfileByEmail.mockResolvedValue({});
  firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
  firebaseMocks.getPrivateConfig.mockResolvedValue(null);
  localStorage.setItem('mis-listas-gist-config', JSON.stringify({ token: TOKEN, gistId: 'games111122223333', etag: null, lastRemoteUpdatedAt: 0 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('F4 — los mensajes de lista viajan en la escritura que ya iba a ocurrir', () => {
  it('publicar una reseña sube también los mensajes pendientes, en la MISMA escritura', async () => {
    armChannel('f4aa000000000001');
    seedLocalGames({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, enteredAt: { p: P, e: E, c: C } })] });
    const store = stubGistStore(socialGist());

    await publishReviewActivity(REVIEW);

    const written = store.current();
    expect(store.writes()).toBe(1); // ni un PATCH de más por los mensajes
    expect(written.activity).toHaveLength(1);
    expect((written.moves || []).map((entry) => entry.id)).toEqual(['7:c', '7:e', '7:p']);
  });

  it('una publicación de texto libre también los arrastra', async () => {
    armChannel('f4aa000000000002');
    seedLocalGames({ e: [game({ id: 9, name: 'Tunic', enteredAt: { e: E } })] });
    const store = stubGistStore(socialGist());

    await publishPost({ text: 'Mirad qué he encontrado', maxLength: 1000 });

    expect(store.writes()).toBe(1);
    expect(store.current().posts).toHaveLength(1);
    expect((store.current().moves || []).map((entry) => entry.id)).toEqual(['9:e']);
  });

  it('no publica mensajes de las listas ocultas, aunque el usuario acabe de esconderlas', async () => {
    armChannel('f4aa000000000003');
    seedLocalGames({ v: [game({ id: 11, name: 'Un juego dejado', review: 'No pudo ser', score: 2, enteredAt: { e: E, v: C } })] });
    const store = stubGistStore(socialGist({
      profile: {
        name: 'Nick',
        private: false,
        visibility: { hiddenTabs: ['v'], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
        sharedLists: {},
      },
    } as Partial<SocialGistData>));

    await publishReviewActivity({ id: 11, name: 'Un juego dejado', review: 'No pudo ser', score: 2, grade: 40, reviewChanged: true });

    expect((store.current().moves || []).map((entry) => entry.tab)).toEqual(['e']);
  });

  it('un mensaje nuevo justifica la escritura aunque la reseña no haya cambiado nada', async () => {
    // Sincronizar solo nota/nombre de una reseña NO publicada es un no-op histórico… salvo que haya mensajes
    // pendientes: entonces sí hay algo que decir y el gist se escribe una vez.
    armChannel('f4aa000000000004');
    seedLocalGames({ e: [game({ id: 13, name: 'Sin reseña', enteredAt: { e: E } })] });
    const store = stubGistStore(socialGist());

    await publishReviewActivity({ id: 13, name: 'Sin reseña', review: 'Texto', score: 3, grade: 60, reviewChanged: false });

    expect(store.writes()).toBe(1);
    expect(store.current().activity).toHaveLength(0); // la reseña no se estrena…
    expect((store.current().moves || []).map((entry) => entry.id)).toEqual(['13:e']); // …pero el mensaje sí
  });

  it('sin nada nuevo que contar no se reescribe el gist', async () => {
    armChannel('f4aa000000000005');
    seedLocalGames({ e: [game({ id: 15, name: 'Ya publicado', enteredAt: { e: E } })] });
    const store = stubGistStore(socialGist({
      moves: [{ id: '15:e', gameId: 15, gameName: 'Ya publicado', tab: 'e', at: E }],
    }));

    await publishReviewActivity({ id: 15, name: 'Ya publicado', review: 'Texto', score: 3, grade: 60, reviewChanged: false });

    expect(store.writes()).toBe(0);
  });

  it('publicar NUNCA retira un mensaje: auditar es cosa de la reconciliación', async () => {
    // Los listados de este dispositivo no tienen el juego 99 (sync de juegos aún sin llegar). Guardar una reseña
    // no es el momento de decidir que ese mensaje ya no vale.
    armChannel('f4aa000000000006');
    seedLocalGames({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, enteredAt: { c: C } })] });
    const store = stubGistStore(socialGist({
      moves: [{ id: '99:c', gameId: 99, gameName: 'De otro aparato', tab: 'c', at: P }],
    }));

    await publishReviewActivity(REVIEW);

    const ids = (store.current().moves || []).map((entry) => entry.id);
    expect(ids).toContain('99:c');
    expect(ids).toContain('7:c');
  });

  it('catalogar hoy un juego terminado hace años no publica ningún mensaje', async () => {
    // El caso que motivó el filtro: alguien mete en su biblioteca algo que se pasó en 2019. El sello de
    // Completados es de HOY, así que sin el filtro el feed de sus amistades anunciaba «terminó tal cosa».
    armChannel('f4aa000000000008');
    seedLocalGames({
      c: [game({ id: 31, name: 'Un clásico', review: 'Sigue siendo bueno', score: 5, years: [2019], enteredAt: { c: Date.now() } })],
    });
    const store = stubGistStore(socialGist());

    await publishReviewActivity({ id: 31, name: 'Un clásico', review: 'Sigue siendo bueno', score: 5, grade: 96, reviewChanged: true });

    // La reseña sí sube (es de hoy y es suya); el movimiento no, porque no terminó nada hoy.
    expect(store.current().activity).toHaveLength(1);
    expect(store.current().moves || []).toEqual([]);
  });

  it('sin listados legibles se publica la reseña igual (los mensajes son un extra, no un requisito)', async () => {
    armChannel('f4aa000000000007');
    localStorage.setItem(STORAGE_KEY, '{ esto no es json');
    const store = stubGistStore(socialGist());

    await publishReviewActivity(REVIEW);

    expect(store.writes()).toBe(1);
    expect(store.current().activity).toHaveLength(1);
  });
});
