import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { SocialGistData } from '../../src/model/repository/gistRepository';

// Firebase: sesión de Google + profileId estable. La reconciliación no debe tocar Firestore para nada más.
const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async () => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real Name', photoURL: null })),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  findSocialProfileByEmail: vi.fn(async (): Promise<null> => null),
}));
vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

// IndexedDB: sello/recuento en memoria (jsdom no trae IndexedDB).
const idbMocks = vi.hoisted(() => {
  let meta: Record<string, unknown> | null = null;
  return {
    __setMeta: (next: Record<string, unknown> | null) => { meta = next; },
    __getMeta: () => meta,
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (patch: Record<string, unknown>) => { meta = { ...(meta || {}), ...patch }; }),
    invalidateCachedSocialDirectory: vi.fn(async () => {}),
  };
});
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

import { reconcileReviewActivity } from '../../src/model/repository/socialActivityReconcile';

const TOKEN = 'ghp_0123456789abcdefghij';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

function game(input: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    platforms: [], genres: [], steamDeck: false, review: '', score: 0, years: [],
    strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0,
    _ts: 1_700_000_000_000,
    ...input,
  } as GameItem;
}

function lists(partial: Partial<TabData>): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 2_000_000_000_000, ...partial };
}

function socialGist(activity: SocialGistData['activity'] = []): SocialGistData {
  return {
    profile: {
      name: 'Nick',
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity,
    posts: [],
    updatedAt: 1,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

function reviewEntry(gameId: number, gameName: string, updatedAt: number, actor = 'pid-1') {
  return {
    id: `${actor}:${gameId}:review`,
    key: `${actor}:${gameId}:review`,
    type: 'review' as const,
    actorProfileId: actor,
    actorName: 'Nick',
    gameId,
    gameName,
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'algo',
    createdAt: updatedAt,
    updatedAt,
  };
}

/** Gist en memoria (GET/PATCH) para ejercitar el repositorio de gist real. */
function stubGistStore(gistId: string, data: SocialGistData) {
  const store: Record<string, { content: string }> = {
    [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(data) },
  };
  const patches: Array<Record<string, { content: string } | null>> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = { etag: `W/"etag-${patches.length}"` };
    if (!String(url).includes(gistId)) {
      return new Response('not found', { status: 404 });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
      patches.push(body.files);
      for (const [name, file] of Object.entries(body.files)) {
        if (file === null) delete store[name];
        else store[name] = file;
      }
      return new Response(JSON.stringify({ updated_at: '2026-07-01T00:00:00Z' }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers });
  }));

  return {
    writes: () => patches.length,
    /** Estado del gist tras el último PATCH. */
    current: () => JSON.parse(store[SOCIAL_GIST_FILENAME].content) as SocialGistData,
  };
}

function armChannel(gistId: string): void {
  localStorage.setItem(
    'mis-listas-social-gist-config',
    JSON.stringify({ token: TOKEN, gistId, etag: null, lastRemoteUpdatedAt: 0 }),
  );
}

beforeEach(() => {
  idbMocks.__setMeta(null);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('reconcileReviewActivity', () => {
  it('publica las reseñas que nunca llegaron al gist social, con su fecha real', async () => {
    const gistId = 'aabbcc01dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(gistId, socialGist([]));

    const outcome = await reconcileReviewActivity({
      games: lists({
        c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, grade: 96, _ts: 1_650_000_000_000 })],
        // 'p' (próximos) no publica reseña ni cuenta para el recuento.
        p: [game({ id: 9, name: 'Silksong', review: 'Espero mucho' })],
      }),
    });

    expect(outcome).toMatchObject({ added: 1, removed: 0, relinked: 0, repaired: 0, skipped: false });
    expect(store.writes()).toBe(1);

    const published = store.current().activity;
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: 'review',
      actorProfileId: 'pid-1',
      actorName: 'Nick', // el nick del gist, nunca el displayName real de Google
      gameId: 7,
      gameName: 'Hollow Knight',
      snippet: 'Obra maestra',
      createdAt: 1_650_000_000_000,
      updatedAt: 1_650_000_000_000, // fecha REAL de la reseña, no "ahora"
    });
    // Canal público: el texto completo de la reseña no se publica.
    expect(JSON.stringify(published[0])).not.toContain('review":');
  });

  it('es idempotente: una segunda pasada no reescribe el gist', async () => {
    const gistId = 'aabbcc02dd11ee22';
    armChannel(gistId);
    const games = lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5 })] });
    const store = stubGistStore(gistId, socialGist([]));

    await reconcileReviewActivity({ games });
    expect(store.writes()).toBe(1);

    const second = await reconcileReviewActivity({ games, force: true });
    expect(second).toMatchObject({ added: 0, removed: 0, relinked: 0, repaired: 0, skipped: false });
    expect(store.writes()).toBe(1);
  });

  it('retira la entrada cuando el juego ya no existe o su reseña se vació', async () => {
    const gistId = 'aabbcc03dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(
      gistId,
      socialGist([reviewEntry(7, 'Hollow Knight', 1_000_000_000_000), reviewEntry(8, 'Borrado', 1_000_000_000_000)]),
    );

    const outcome = await reconcileReviewActivity({
      // 7 sigue existiendo pero sin texto de reseña; 8 ya no está en ningún listado.
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: '   ' })] }),
    });

    expect(outcome).toMatchObject({ added: 0, removed: 2, skipped: false });
    expect(store.current().activity).toHaveLength(0);
  });

  it('NO retira una entrada más nueva que los listados locales (reseña escrita en otro dispositivo)', async () => {
    const gistId = 'aabbcc04dd11ee22';
    armChannel(gistId);
    // La entrada es posterior al reloj de los listados: aquí todavía no ha llegado el sync de juegos.
    const store = stubGistStore(gistId, socialGist([reviewEntry(42, 'Recién reseñado', 2_000_000_500_000)]));

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 1, name: 'Otro', review: '' })], updatedAt: 2_000_000_000_000 }),
    });

    expect(outcome).toMatchObject({ added: 0, removed: 0, relinked: 0, repaired: 0, skipped: false });
    expect(store.writes()).toBe(0);
  });

  it('no hace nada si los listados están sin hidratar (evita borrar por un estado vacío)', async () => {
    const gistId = 'aabbcc05dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', 1)]));

    const outcome = await reconcileReviewActivity({ games: lists({}) });

    expect(outcome.skipped).toBe(true);
    expect(store.writes()).toBe(0);
    expect(firebaseMocks.getCurrentSocialAuthUser).not.toHaveBeenCalled();
  });

  it('con el sello fresco y el mismo recuento no toca la red; con publicación pendiente sí', async () => {
    const gistId = 'aabbcc06dd11ee22';
    armChannel(gistId);
    const games = lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5 })] });
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', 1)]));

    idbMocks.__setMeta({ activityReconciledAt: Date.now(), activityReviewCount: 1, activityReconcileVersion: 2 });
    expect((await reconcileReviewActivity({ games })).skipped).toBe(true);
    expect(firebaseMocks.getCurrentSocialAuthUser).not.toHaveBeenCalled();

    // Una publicación perdida fuerza la pasada aunque el sello siga fresco, y la marca se limpia.
    idbMocks.__setMeta({ activityReconciledAt: Date.now(), activityReviewCount: 1, activityReconcileVersion: 2, pendingSocialActivity: true });
    expect((await reconcileReviewActivity({ games })).skipped).toBe(false);
    expect(idbMocks.__getMeta()).toMatchObject({ pendingSocialActivity: false, activityReviewCount: 1 });
    expect(store.writes()).toBe(0); // ya estaba publicada: se comprueba, no se reescribe
  });

  it('el sello de una versión anterior no vale: fuerza pasada aunque esté fresco y el recuento cuadre', async () => {
    // Es lo que permite que una corrección de la lógica alcance a los gists que tocó una versión anterior sin
    // esperar 12 h ni pedirle nada al usuario. Aquí la entrada quedó sellada con "ahora" por la versión 1.
    const gistId = 'aabbcc14dd11ee22';
    armChannel(gistId);
    const tsDelJuego = 1_500_000_000_000;
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', Date.now())]));
    idbMocks.__setMeta({ activityReconciledAt: Date.now(), activityReviewCount: 1, activityReconcileVersion: 1 });

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, _ts: tsDelJuego })] }),
    });

    expect(outcome.skipped).toBe(false);
    expect(outcome.repaired).toBe(1);
    expect(store.current().activity[0].updatedAt).toBe(tsDelJuego);
    // Y deja sellada la versión nueva, para no repetir la pasada en la siguiente apertura.
    expect(idbMocks.__getMeta()).toMatchObject({ activityReconcileVersion: 2 });
  });

  it('el sello caduca cuando el recuento de reseñas locales cambia', async () => {
    const gistId = 'aabbcc07dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', 1)]));

    idbMocks.__setMeta({ activityReconciledAt: Date.now(), activityReviewCount: 1 });
    const outcome = await reconcileReviewActivity({
      games: lists({
        c: [
          game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5 }),
          game({ id: 8, name: 'Celeste', review: 'Precioso', score: 5 }),
        ],
      }),
    });

    expect(outcome).toMatchObject({ added: 1, removed: 0, relinked: 0, repaired: 0, skipped: false });
    expect(store.current().activity.map((entry) => entry.gameId).sort()).toEqual([7, 8]);
  });

  it('acota cuántas reseñas publica por pasada (las más recientes primero)', async () => {
    const gistId = 'aabbcc08dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(gistId, socialGist([]));

    const outcome = await reconcileReviewActivity({
      games: lists({
        c: [
          game({ id: 1, name: 'Vieja', review: 'x', _ts: 1_000 }),
          game({ id: 2, name: 'Media', review: 'x', _ts: 2_000 }),
          game({ id: 3, name: 'Nueva', review: 'x', _ts: 3_000 }),
        ],
      }),
      max: 2,
    });

    expect(outcome.added).toBe(2);
    expect(store.current().activity.map((entry) => entry.gameName)).toEqual(['Nueva', 'Media']);
    // La pasada no convergió (queda 'Vieja'): sigue pendiente para continuar en la siguiente apertura.
    expect(idbMocks.__getMeta()).toMatchObject({ pendingSocialActivity: true });
  });

  it('una reseña ya publicada bajo otro profileId NO se duplica ni pierde su fecha', async () => {
    // Regresión: `publishedGameIds` filtraba por `actorProfileId`, así que una reseña publicada con un id
    // antiguo (uid legacy o el UUID de otro dispositivo previo al seeding de `privateConfig`) no se reconocía
    // como publicada. Se añadía un duplicado y `dedupeActivityByGame` —que colapsa por (gameId, type)
    // quedándose con el `updatedAt` mayor— borraba la original: la reseña "desaparecía" y volvía con otra fecha.
    const gistId = 'aabbcc10dd11ee22';
    armChannel(gistId);
    const publicadaHaceMucho = 1_400_000_000_000;
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', publicadaHaceMucho, 'pid-VIEJO')]));

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, _ts: 1_500_000_000_000 })] }),
    });

    expect(outcome.added).toBe(0); // ya estaba publicada: no se añade nada
    expect(outcome.relinked).toBe(1); // solo se reindexa su identidad
    const published = store.current().activity;
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      gameId: 7,
      actorProfileId: 'pid-1', // identidad convergida a la actual
      key: 'pid-1:7:review',
      updatedAt: publicadaHaceMucho, // …CONSERVANDO su fecha original
      createdAt: publicadaHaceMucho,
    });
  });

  it('devuelve a su fecha real una entrada sellada con "ahora" (daño del backfill)', async () => {
    const gistId = 'aabbcc11dd11ee22';
    armChannel(gistId);
    const tsDelJuego = 1_500_000_000_000;
    const selladaHoy = Date.now();
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', selladaHoy)]));

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, _ts: tsDelJuego })] }),
    });

    expect(outcome.repaired).toBe(1);
    expect(store.current().activity[0]).toMatchObject({ updatedAt: tsDelJuego, createdAt: tsDelJuego });
  });

  it('NO recoloca una reseña cuyo juego se editó DESPUÉS de publicarla', async () => {
    // El caso legítimo inverso: `_ts` por delante de la fecha de publicación. Debe quedarse como está, para
    // respetar que sincronizar solo nota/nombre no recoloque la tarjeta en el feed.
    const gistId = 'aabbcc12dd11ee22';
    armChannel(gistId);
    const publicada = 1_500_000_000_000;
    const store = stubGistStore(gistId, socialGist([reviewEntry(7, 'Hollow Knight', publicada)]));

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, _ts: 1_600_000_000_000 })] }),
    });

    expect(outcome).toMatchObject({ added: 0, removed: 0, relinked: 0, repaired: 0 });
    expect(store.writes()).toBe(0);
    expect(store.current().activity[0].updatedAt).toBe(publicada);
  });

  it('sin `_ts` usa `listedAt` antes que la fecha de hoy', async () => {
    const gistId = 'aabbcc13dd11ee22';
    armChannel(gistId);
    const store = stubGistStore(gistId, socialGist([]));
    const llegada = 1_450_000_000_000;

    await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, _ts: 0, listedAt: llegada })] }),
    });

    expect(store.current().activity[0]).toMatchObject({ updatedAt: llegada, createdAt: llegada });
  });

  it('sin canal social armado en este dispositivo no publica ni lanza', async () => {
    const gistId = 'aabbcc09dd11ee22';
    // Sin config social en localStorage y sin perfil en Firestore → no hay nada que armar.
    const store = stubGistStore(gistId, socialGist([]));

    const outcome = await reconcileReviewActivity({
      games: lists({ c: [game({ id: 7, name: 'Hollow Knight', review: 'Obra maestra' })] }),
    });

    expect(outcome.skipped).toBe(true);
    expect(store.writes()).toBe(0);
  });
});
