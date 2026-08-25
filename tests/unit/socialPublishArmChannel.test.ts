import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialGistData } from '../../src/model/repository/socialGistRepository';

// Antes, `publishReviewActivity` se rendía en silencio si este dispositivo no tenía config social en
// localStorage (solo la armaba el hub al abrirse). Un usuario dado de alta y con sesión que escribiera reseñas
// desde otro dispositivo/navegador publicaba CERO actividad, para siempre y sin rastro.

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<unknown> => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real Name', photoURL: null })),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  ensureProfileByEmail: vi.fn(async () => ({})),
  resolveOwnProfile: vi.fn(async (): Promise<unknown> => null),
  // El canal se recupera primero de `privateConfig` (owner-only); el perfil público es respaldo legacy.
  getPrivateConfig: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const idbMocks = vi.hoisted(() => {
  let meta: Record<string, unknown> | null = null;
  return {
    __getMeta: () => meta,
    __reset: () => { meta = null; },
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (patch: Record<string, unknown>) => { meta = { ...(meta || {}), ...patch }; }),
    invalidateCachedSocialDirectory: vi.fn(async () => {}),
  };
});
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

import { publishReviewActivity } from '../../src/model/repository/socialPublishRepository';
import { getSocialSyncConfig } from '../../src/model/repository/gistConfigRepository';

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'ddee1122aabb3344';
const GIST_ID_ROTATION = 'ddee1122aabb9999';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

function socialGist(name = 'Nick'): SocialGistData {
  return {
    profile: {
      name,
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

function stubGistStore(gist: SocialGistData = socialGist()) {
  const store: Record<string, { content: string }> = {
    [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(gist) },
  };
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'PATCH') {
      writes += 1;
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string }> };
      Object.assign(store, body.files);
      return new Response(JSON.stringify({ updated_at: '2026-07-01T00:00:00Z' }), { status: 200, headers: { etag: 'W/"e1"' } });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers: { etag: 'W/"e0"' } });
  }));
  return {
    writes: () => writes,
    current: () => JSON.parse(store[SOCIAL_GIST_FILENAME].content) as SocialGistData,
  };
}

const REVIEW = { id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, grade: 96, reviewChanged: true };

beforeEach(() => {
  idbMocks.__reset();
  localStorage.clear();
  sessionStorage.clear();
  // `clearAllMocks` borra las llamadas pero NO las implementaciones: hay que restaurar los valores por
  // defecto en cada test o el `mockResolvedValue` de uno se filtra al siguiente.
  firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Real Name', photoURL: null });
  firebaseMocks.resolveStableProfileId.mockResolvedValue('pid-1');
  firebaseMocks.ensureProfileByEmail.mockResolvedValue({});
  firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
  firebaseMocks.getPrivateConfig.mockResolvedValue(null);
  // Sync principal conectada (token en claro legacy: `getSyncConfig` lo sirve tal cual).
  localStorage.setItem('mis-listas-gist-config', JSON.stringify({ token: TOKEN, gistId: 'games111122223333', etag: null, lastRemoteUpdatedAt: 0 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('publishReviewActivity — armado del canal social', () => {
  it('sin config social en el dispositivo, recupera el gist del perfil de Firestore y publica', async () => {
    firebaseMocks.resolveOwnProfile.mockResolvedValue({
      id: 'uid-1', email: 'yo@example.com', displayName: 'Nick', photoURL: '',
      socialGistId: GIST_ID, gamesGistId: 'games111122223333', githubToken: '', socialEnabled: true,
    });
    const store = stubGistStore();

    await publishReviewActivity(REVIEW);

    expect(store.writes()).toBe(1);
    expect(store.current().activity).toHaveLength(1);
    expect(store.current().activity[0]).toMatchObject({ gameId: 7, gameName: 'Hollow Knight', actorProfileId: 'pid-1' });
    // Y deja el canal armado para las siguientes publicaciones de este dispositivo.
    expect(JSON.parse(localStorage.getItem('mis-listas-social-gist-config') || '{}')).toMatchObject({ gistId: GIST_ID });
    // C4: el token del canal social NO se guarda en claro (es el mismo PAT que cifra el canal de juegos, así que
    // dejarlo aquí legible anulaba el cifrado del otro). Queda accesible descifrado en memoria.
    expect(localStorage.getItem('mis-listas-social-gist-config')).not.toContain(TOKEN);
    expect(getSocialSyncConfig()?.token).toBe(TOKEN);
  });

  // El id del canal ha dejado de publicarse en el perfil, así que para una cuenta nueva `privateConfig` es la
  // ÚNICA vía: sin esto, publicar desde un dispositivo sin config local dejaría de funcionar en silencio.
  it('recupera el gist de `privateConfig` sin tocar el perfil público', async () => {
    firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: GIST_ID });
    const store = stubGistStore();

    await publishReviewActivity(REVIEW);

    expect(store.writes()).toBe(1);
    expect(firebaseMocks.resolveOwnProfile).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('mis-listas-social-gist-config') || '{}')).toMatchObject({ gistId: GIST_ID });
  });

  // Con el gist sin nick, el perfil público se asegura igual: el nombre lo resuelve `ensureProfileByEmail`, que cae al
  // de la cuenta de Google (nunca al correo). Saltarse el perfil dejaría a esa persona fuera del directorio, y
  // crearlo con el nombre vacío sería la anomalía `no-display-name`: ninguna de las dos es mejor que un nombre real.
  it('con el gist sin nick publica igual y deja que el perfil resuelva el nombre', async () => {
    // Id propio: la caché en memoria de gists (`socialGistCacheById`) sobrevive al `sessionStorage.clear()` del
    // `beforeEach`, así que reutilizar el de otro test serviría su perfil —con nick— en lugar de este.
    firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: 'ddee1122aabb7777' });
    const store = stubGistStore(socialGist(''));

    await publishReviewActivity(REVIEW);

    expect(store.writes()).toBe(1);
    // Se llama con el nick vacío a propósito: la decisión del nombre vive en un solo sitio, no repartida por aquí.
    expect(firebaseMocks.ensureProfileByEmail).toHaveBeenCalledWith(expect.objectContaining({ preferredName: '' }));
  });

  it('sin sesión de Google marca la publicación como pendiente (antes se perdía en silencio)', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue(null);
    const store = stubGistStore();

    await expect(publishReviewActivity(REVIEW)).resolves.toBeUndefined();

    expect(store.writes()).toBe(0);
    expect(idbMocks.__getMeta()).toMatchObject({ pendingSocialActivity: true });
  });

  it('con perfil no publicado en Firestore tampoco lanza, pero queda pendiente', async () => {
    firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
    const store = stubGistStore();

    await expect(publishReviewActivity(REVIEW)).resolves.toBeUndefined();

    expect(store.writes()).toBe(0);
    expect(idbMocks.__getMeta()).toMatchObject({ pendingSocialActivity: true });
  });

  it('refresca el token social rancio con el de la sync principal (rotación del PAT)', async () => {
    localStorage.setItem(
      'mis-listas-social-gist-config',
      JSON.stringify({ token: 'ghp_viejoviejoviejoviejo', gistId: GIST_ID_ROTATION, etag: null, lastRemoteUpdatedAt: 0 }),
    );
    const store = stubGistStore();

    await publishReviewActivity(REVIEW);

    expect(store.writes()).toBe(1);
    // El token refrescado es el de la sync principal, y se guarda cifrado (C4): en el registro no queda ni el
    // viejo ni el nuevo en claro.
    const raw = localStorage.getItem('mis-listas-social-gist-config') || '';
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toContain('ghp_viejoviejoviejoviejo');
    expect(getSocialSyncConfig()?.token).toBe(TOKEN);
    expect(firebaseMocks.resolveOwnProfile).not.toHaveBeenCalled(); // ya había gistId: no hace falta Firestore
  });
});
