import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateGistPrivacy, type SocialGistData } from '../../src/model/repository/gistRepository';

// `updateGistPrivacy` comprueba si el gist es legible sin autenticación y, si no coincide con la visibilidad
// deseada, lo CLONA a un id nuevo (GitHub no permite cambiar `public` de un gist existente). El problema: un 403
// por rate-limit anónimo (60 req/h por IP) o un corte de red se interpretaban como "no es público" y disparaban
// el clonado, cambiando el id del canal social del usuario por un error transitorio y dejando a sus amigos
// leyendo el gist antiguo.

const TOKEN = 'ghp_0123456789abcdefghij';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

function socialGist(): SocialGistData {
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
  } as unknown as SocialGistData;
}

/** Stub que distingue la lectura AUTENTICADA (siempre OK) de la ANÓNIMA (la respuesta la decide el test). */
function stubGist(anonymous: { status: number; statusText?: string } | 'ok') {
  const created: string[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const headers = new Headers((init.headers as Record<string, string>) || {});
    const method = (init.method || 'GET').toUpperCase();

    if (method === 'POST') {
      created.push('nuevo');
      return new Response(JSON.stringify({ id: 'ffff1111eeee2222' }), { status: 201, headers: { etag: 'W/"new"' } });
    }
    if (!headers.has('Authorization')) {
      if (anonymous === 'ok') {
        return new Response(JSON.stringify({ files: { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(socialGist()) } } }), { status: 200, headers: { etag: 'W/"anon"' } });
      }
      return new Response(JSON.stringify({ message: 'boom' }), { status: anonymous.status, statusText: anonymous.statusText || '' });
    }
    return new Response(JSON.stringify({ files: { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(socialGist()) } } }), { status: 200, headers: { etag: 'W/"auth"' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { clones: () => created.length, calls: () => fetchMock.mock.calls.length };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('updateGistPrivacy', () => {
  it('no clona el gist si la comprobación anónima falla por rate-limit (403)', async () => {
    const store = stubGist({ status: 403, statusText: 'rate limit exceeded' });
    const gistId = 'aa11bb22cc33dd01';

    const result = await updateGistPrivacy(TOKEN, gistId, true);

    expect(result.gistId).toBe(gistId); // el canal social conserva su id
    expect(store.clones()).toBe(0);
  });

  it('tampoco clona si la comprobación anónima falla por red', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
      const headers = new Headers((init.headers as Record<string, string>) || {});
      if (!headers.has('Authorization')) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ files: { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(socialGist()) } } }), { status: 200, headers: { etag: 'W/"auth"' } });
    }));
    const gistId = 'aa11bb22cc33dd02';

    const result = await updateGistPrivacy(TOKEN, gistId, true);

    expect(result.gistId).toBe(gistId);
  });

  it('no hace nada si ya es público y se pide público', async () => {
    const store = stubGist('ok');
    const gistId = 'aa11bb22cc33dd03';

    const result = await updateGistPrivacy(TOKEN, gistId, true);

    expect(result.gistId).toBe(gistId);
    expect(store.clones()).toBe(0);
  });

  it('clona cuando el 404 anónimo confirma que el gist es secreto y se pide público', async () => {
    const store = stubGist({ status: 404, statusText: 'Not Found' });
    const gistId = 'aa11bb22cc33dd04';

    const result = await updateGistPrivacy(TOKEN, gistId, true);

    expect(store.clones()).toBe(1);
    expect(result.gistId).toBe('ffff1111eeee2222');
  });
});
