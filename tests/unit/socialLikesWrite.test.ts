import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMeta } from '../../src/model/types/local';
import type { SocialReactionEntry } from '../../src/core/social/reactions';

// FASE 2 de docs/plan-reacciones.md — dar y quitar «me gusta»: la cola, la subida agrupada y lo que NO se toca.

const deps = vi.hoisted(() => ({
  authUser: { uid: 'uid-yo', email: 'yo@example.com' } as { uid: string; email: string } | null,
  consent: true,
  channel: { status: 'ready', channel: { token: 'ghp_0123456789abcdefghij', gistId: 'abcdef99', etag: null } } as unknown,
  meta: {} as Partial<LocalMeta>,
}));

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getCurrentSocialAuthUser: vi.fn(async () => deps.authUser),
}));
vi.mock('../../src/model/repository/socialConsentGate', () => ({
  canPublishSocialInBackground: vi.fn(async () => deps.consent),
}));
vi.mock('../../src/model/repository/socialChannel', () => ({
  resolveSocialChannel: vi.fn(async () => deps.channel),
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: vi.fn(async () => deps.meta),
  patchLocalMeta: vi.fn(async (patch: Partial<LocalMeta>) => {
    deps.meta = { ...deps.meta, ...patch };
  }),
}));

import {
  FLUSH_DELAY_MS,
  flushSocialLikes,
  getPendingSocialLikes,
  resetSocialLikesForTests,
  retireSocialLikesTo,
  setSocialLike,
} from '../../src/model/repository/socialReactionsRepository';
import { resetSocialWriteQueueForTests } from '../../src/model/repository/socialWriteQueue';

const MAIN_FILE = 'myGameList.social.json';
const REACTIONS_FILE = 'myGameList.social-reactions.json';
const MAIN_CONTENT = '{"no":"se toca"}';

const REVIEW = { on: 'activity', to: 'perfil-marta', item: 'perfil-marta:42:review' } as const;
const POST = { on: 'post', to: 'perfil-ivan', item: 'perfil-ivan:1728720000000' } as const;

/** Gist en memoria: GET devuelve los ficheros; PATCH los fusiona. Cuenta y registra cada PATCH. */
function stubGist(initialReactions: unknown = undefined, options: { failPatch?: boolean; onPatch?: () => void } = {}) {
  const files: Record<string, { content: string }> = { [MAIN_FILE]: { content: MAIN_CONTENT } };
  if (initialReactions !== undefined) files[REACTIONS_FILE] = { content: JSON.stringify(initialReactions) };
  const patches: Array<Record<string, { content: string } | null>> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    if ((init.method || 'GET').toUpperCase() === 'PATCH') {
      if (options.failPatch) throw new TypeError('Failed to fetch');
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
      patches.push(body.files);
      options.onPatch?.();
      for (const [name, file] of Object.entries(body.files)) {
        if (file) files[name] = file;
        else delete files[name];
      }
    }
    return new Response(JSON.stringify({ files }), { status: 200, headers: { etag: `W/"${patches.length}"` } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const reactions = () => JSON.parse(files[REACTIONS_FILE]?.content || 'null') as { v: number; items: SocialReactionEntry[] } | null;
  return { fetchMock, patches, files, reactions };
}

beforeEach(() => {
  deps.authUser = { uid: 'uid-yo', email: 'yo@example.com' };
  deps.consent = true;
  deps.channel = { status: 'ready', channel: { token: 'ghp_0123456789abcdefghij', gistId: 'abcdef99', etag: null } };
  deps.meta = {};
  resetSocialLikesForTests();
  resetSocialWriteQueueForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('dar «me gusta»', () => {
  it('se apunta al momento, sin red, y queda guardado en IndexedDB', async () => {
    const gist = stubGist();
    vi.useFakeTimers();

    await setSocialLike(REVIEW, true);

    expect(gist.fetchMock).not.toHaveBeenCalled();
    expect((await getPendingSocialLikes()).map((entry) => entry.item)).toEqual([REVIEW.item]);
    expect(deps.meta.pendingReactions).toHaveLength(1);
  });

  it('una ráfaga se sube en UN solo PATCH, pasada la espera', async () => {
    const gist = stubGist();
    vi.useFakeTimers();

    await setSocialLike(REVIEW, true);
    await setSocialLike(POST, true);
    await setSocialLike(REVIEW, false);
    await setSocialLike(REVIEW, true);
    expect(gist.patches).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS - 1);
    expect(gist.fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // La subida ya ha arrancado; termina con reloj real (carga el esquema con un `import()` diferido).
    vi.useRealTimers();
    await vi.waitFor(() => expect(gist.patches).toHaveLength(1));
    await vi.waitFor(async () => expect(await getPendingSocialLikes()).toEqual([]));
    expect(gist.reactions()?.items.filter((entry) => !entry.del).map((entry) => entry.to).sort()).toEqual(['perfil-ivan', 'perfil-marta']);
    expect(await getPendingSocialLikes()).toEqual([]);
    expect(deps.meta.pendingReactions).toEqual([]);
  });

  it('el PATCH nombra SOLO el fichero de «me gusta»: el principal queda como estaba', async () => {
    const gist = stubGist();
    await setSocialLike(REVIEW, true);

    expect(await flushSocialLikes()).toBe('written');

    expect(Object.keys(gist.patches[0])).toEqual([REACTIONS_FILE]);
    expect(gist.files[MAIN_FILE].content).toBe(MAIN_CONTENT);
    expect(gist.reactions()?.v).toBe(1);
  });
});

describe('quitar y fusionar', () => {
  it('quitar un «me gusta» que solo está en el gist deja una lápida', async () => {
    const gist = stubGist({ v: 1, updatedAt: 1, items: [{ ...REVIEW, kind: 'like', at: 1000 }] });

    await setSocialLike(REVIEW, false);
    await flushSocialLikes();

    expect(gist.reactions()?.items).toEqual([expect.objectContaining({ ...REVIEW, del: true })]);
  });

  it('conserva lo que otro dispositivo ya subió', async () => {
    const otherDevice = { ...POST, kind: 'like', at: Date.now() - 60_000 };
    const gist = stubGist({ v: 1, updatedAt: 1, items: [otherDevice] });

    await setSocialLike(REVIEW, true);
    await flushSocialLikes();

    expect(gist.reactions()?.items.map((entry) => entry.to).sort()).toEqual(['perfil-ivan', 'perfil-marta']);
  });

  it('si no cambia nada, no escribe', async () => {
    const gist = stubGist({ v: 1, updatedAt: 1, items: [{ ...REVIEW, kind: 'like', at: Date.now() + 60_000 }] });

    await setSocialLike(REVIEW, true);

    expect(await flushSocialLikes()).toBe('unchanged');
    expect(gist.patches).toHaveLength(0);
    expect(await getPendingSocialLikes()).toEqual([]);
  });

  it('lo pulsado MIENTRAS sube se queda para la siguiente subida', async () => {
    let late: Promise<void> | null = null;
    const gist = stubGist(undefined, { onPatch: () => { late = setSocialLike(POST, true); } });

    await setSocialLike(REVIEW, true);
    await flushSocialLikes();
    await late;

    expect((await getPendingSocialLikes()).map((entry) => entry.to)).toEqual(['perfil-ivan']);
    expect(await flushSocialLikes()).toBe('written');
    expect(gist.reactions()?.items.map((entry) => entry.to).sort()).toEqual(['perfil-ivan', 'perfil-marta']);
  });
});

describe('dejar de ser amigos', () => {
  it('retira todos los «me gusta» dados a ese perfil, y solo a ese', async () => {
    const now = Date.now();
    const gist = stubGist({
      v: 1,
      updatedAt: 1,
      items: [
        { ...REVIEW, kind: 'like', at: now - 5000 },
        { on: 'post', to: 'perfil-marta', item: 'perfil-marta:99', kind: 'like', at: now - 4000 },
        { ...POST, kind: 'like', at: now - 3000 },
      ],
    });

    await retireSocialLikesTo('perfil-marta');
    await flushSocialLikes();

    const items = gist.reactions()?.items ?? [];
    expect(items.filter((entry) => entry.to === 'perfil-marta').every((entry) => entry.del)).toBe(true);
    expect(items.find((entry) => entry.to === 'perfil-ivan')?.del).toBeUndefined();
    expect(deps.meta.pendingReactionPurges).toEqual([]);
  });
});

describe('lo que NO se sube', () => {
  it('un fichero de una versión más nueva no se reescribe, y la cola espera', async () => {
    const gist = stubGist({ v: 2, updatedAt: 1, items: [{ algo: 'nuevo' }] });

    await setSocialLike(REVIEW, true);

    expect(await flushSocialLikes()).toBe('outdated');
    expect(gist.patches).toHaveLength(0);
    expect(await getPendingSocialLikes()).toHaveLength(1);
  });

  it('un fichero que no se puede leer no se sobrescribe', async () => {
    const gist = stubGist();
    gist.files[REACTIONS_FILE] = { content: '{roto' };

    await setSocialLike(REVIEW, true);

    await expect(flushSocialLikes()).rejects.toThrow(/no se puede leer/);
    expect(gist.patches).toHaveLength(0);
    expect(await getPendingSocialLikes()).toHaveLength(1);
  });

  it('sin red, la intención sigue en la cola y en IndexedDB, y sube en el siguiente intento', async () => {
    stubGist(undefined, { failPatch: true });
    await setSocialLike(REVIEW, true);

    await expect(flushSocialLikes()).rejects.toThrow();
    expect(deps.meta.pendingReactions).toHaveLength(1);

    const gist = stubGist();
    expect(await flushSocialLikes()).toBe('written');
    expect(gist.reactions()?.items).toHaveLength(1);
  });

  it('sobrevive a cerrar la pestaña: lo guardado en IndexedDB se sube al volver', async () => {
    const gist = stubGist();
    await setSocialLike(REVIEW, true);
    resetSocialLikesForTests(); // «se cierra la pestaña»: la memoria se pierde, IndexedDB no

    expect(await flushSocialLikes()).toBe('written');
    expect(gist.reactions()?.items.map((entry) => entry.item)).toEqual([REVIEW.item]);
  });

  it('sin sesión, sin la aceptación legal o sin canal no hay red, y la cola se conserva', async () => {
    const gist = stubGist();
    await setSocialLike(REVIEW, true);

    deps.authUser = null;
    expect(await flushSocialLikes()).toBe('no-session');
    deps.authUser = { uid: 'uid-yo', email: 'yo@example.com' };
    deps.consent = false;
    expect(await flushSocialLikes()).toBe('no-consent');
    deps.consent = true;
    deps.channel = { status: 'unavailable' };
    expect(await flushSocialLikes()).toBe('no-channel');

    expect(gist.fetchMock).not.toHaveBeenCalled();
    expect(await getPendingSocialLikes()).toHaveLength(1);
  });

  it('sin nada en la cola no hace nada', async () => {
    const gist = stubGist();
    expect(await flushSocialLikes()).toBe('nothing');
    expect(gist.fetchMock).not.toHaveBeenCalled();
  });
});
