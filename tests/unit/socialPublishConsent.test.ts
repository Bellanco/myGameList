import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { SocialGistData } from '../../src/model/repository/socialGistRepository';
import { LEGAL_VERSION } from '../../src/core/constants/legal';

// LA PUERTA LEGAL DE LO QUE SALE FUERA DEL HUB (docs/plan-feed-sin-vacio.md, Fase 2).
//
// La reseña que se guarda desde la app principal se publicaba en el canal social sin mirar si la persona había
// aceptado las condiciones VIGENTES: el hub lo exige al entrar, pero esta ruta no pasa por el hub. Ahora hace falta
// la versión vigente aceptada; sin ella no sale nada y queda pendiente para cuando acepte.

const DIA = 24 * 60 * 60 * 1000;

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<unknown> => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: null })),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  ensureProfileByEmail: vi.fn(async () => ({})),
  resolveOwnProfile: vi.fn(async (): Promise<unknown> => null),
  getPrivateConfig: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const gatewayMocks = vi.hoisted(() => ({
  getPublicConfig: vi.fn(async (): Promise<unknown> => null),
  setPublicConfig: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

const idbMocks = vi.hoisted(() => {
  let meta: Record<string, unknown> | null = null;
  return {
    __getMeta: () => meta,
    __setMeta: (next: Record<string, unknown> | null) => { meta = next; },
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (patch: Record<string, unknown>) => { meta = { ...(meta || {}), ...patch }; }),
    invalidateCachedSocialDirectory: vi.fn(async () => {}),
  };
});
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

const { canPublishSocialInBackground } = await import('../../src/model/repository/socialConsentGate');
const { publishReviewActivity, unpublishReviewActivity } = await import('../../src/model/repository/socialPublishRepository');
const { useSocialLegalConsent } = await import('../../src/viewmodel/social/useSocialLegalConsent');

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'ddee1122aabb3344';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';
const REVIEW = { id: 7, name: 'Hollow Knight', review: 'Obra maestra', score: 5, grade: 96, reviewChanged: true };

function socialGist(activity: unknown[] = []): SocialGistData {
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

function stubGistStore(gist: SocialGistData = socialGist()) {
  const store: Record<string, { content: string }> = { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(gist) } };
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if ((init.method || 'GET').toUpperCase() === 'PATCH') {
      writes += 1;
      Object.assign(store, (JSON.parse(String(init.body)) as { files: Record<string, { content: string }> }).files);
      return new Response(JSON.stringify({ updated_at: '2026-10-10T00:00:00Z' }), { status: 200, headers: { etag: 'W/"e1"' } });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers: { etag: 'W/"e0"' } });
  }));
  return { writes: () => writes, current: () => JSON.parse(store[SOCIAL_GIST_FILENAME].content) as SocialGistData };
}

const sello = (version: string, checkedAt = Date.now(), uid = 'uid-1') => ({ legalConsent: { uid, version, checkedAt } });

beforeEach(() => {
  vi.clearAllMocks();
  idbMocks.__setMeta(null);
  localStorage.clear();
  sessionStorage.clear();
  gatewayMocks.getPublicConfig.mockResolvedValue(null);
  firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: null });
  localStorage.setItem('mis-listas-gist-config', JSON.stringify({ token: TOKEN, gistId: 'games111122223333', etag: null, lastRemoteUpdatedAt: 0 }));
  localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ token: TOKEN, gistId: GIST_ID, etag: null, lastRemoteUpdatedAt: 0 }));
});

describe('canPublishSocialInBackground', () => {
  it('con la versión vigente sellada para ese uid, sí, y sin preguntar a Firestore', async () => {
    idbMocks.__setMeta(sello(LEGAL_VERSION));
    expect(await canPublishSocialInBackground('uid-1')).toBe(true);
    expect(gatewayMocks.getPublicConfig).not.toHaveBeenCalled();
  });

  it('con una versión vieja comprobada hace menos de un día, no, y sin preguntar', async () => {
    idbMocks.__setMeta(sello('2020-01-01', Date.now() - DIA / 2));
    expect(await canPublishSocialInBackground('uid-1')).toBe(false);
    expect(gatewayMocks.getPublicConfig).not.toHaveBeenCalled();
  });

  it('con una versión vieja comprobada hace más de un día, vuelve a preguntar (aceptó en otro dispositivo)', async () => {
    idbMocks.__setMeta(sello('2020-01-01', Date.now() - 2 * DIA));
    gatewayMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    expect(await canPublishSocialInBackground('uid-1')).toBe(true);
    expect((idbMocks.__getMeta()?.legalConsent as { version: string }).version).toBe(LEGAL_VERSION);
  });

  it('el sello de otra cuenta no vale', async () => {
    idbMocks.__setMeta(sello(LEGAL_VERSION, Date.now(), 'otra'));
    gatewayMocks.getPublicConfig.mockResolvedValue(null);
    expect(await canPublishSocialInBackground('uid-1')).toBe(false);
    expect(gatewayMocks.getPublicConfig).toHaveBeenCalledWith('uid-1');
  });

  it('si no se puede comprobar, no se publica, y se volverá a comprobar', async () => {
    gatewayMocks.getPublicConfig.mockRejectedValue(new Error('offline'));
    expect(await canPublishSocialInBackground('uid-1')).toBe(false);
    expect(idbMocks.__getMeta()?.legalConsent).toBeUndefined();
  });

  it('sin uid, no', async () => {
    expect(await canPublishSocialInBackground('')).toBe(false);
  });
});

describe('publicar desde la app principal', () => {
  it('sin la aceptación vigente, la reseña no sale y queda pendiente', async () => {
    const gist = stubGistStore();
    gatewayMocks.getPublicConfig.mockResolvedValue({ consent: { version: '2020-01-01', agreedAt: 1 } });

    await publishReviewActivity(REVIEW);

    expect(gist.writes()).toBe(0);
    expect(idbMocks.__getMeta()?.pendingSocialActivity).toBe(true);
  });

  it('con la aceptación vigente, sale', async () => {
    const gist = stubGistStore();
    idbMocks.__setMeta(sello(LEGAL_VERSION));

    await publishReviewActivity(REVIEW);

    expect(gist.writes()).toBe(1);
    expect(gist.current().activity.some((entry) => entry.gameId === REVIEW.id)).toBe(true);
  });

  it('retirar una reseña no necesita la aceptación: es publicar menos', async () => {
    const gist = stubGistStore();
    idbMocks.__setMeta(sello(LEGAL_VERSION));
    await publishReviewActivity(REVIEW);
    expect(gist.writes()).toBe(1);
    idbMocks.__setMeta(sello('2020-01-01'));

    await unpublishReviewActivity({ id: REVIEW.id });

    expect(gist.writes()).toBe(2);
    expect(gist.current().activity.some((entry) => entry.gameId === REVIEW.id)).toBe(false);
  });
});

describe('useSocialLegalConsent sella la versión en este dispositivo', () => {
  it('al comprobarla NO escribe nada (eso lo hace la puerta cuando la necesita)', async () => {
    gatewayMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    const { result } = renderHook(() => useSocialLegalConsent('uid-1', vi.fn()));
    await waitFor(() => expect(result.current.gateOpen).toBe(true));
    expect(idbMocks.patchLocalMeta).not.toHaveBeenCalled();
  });

  // Aceptó en otro dispositivo: el hub lo ve, y la puerta, con su sello viejo de hace un rato, tardaría un día en
  // volver a preguntar. Se sella aquí, pero solo si había un sello distinto (sin sello, la puerta pregunta sola).
  it('al comprobar que está aceptada con un sello viejo en el dispositivo, lo pone al día', async () => {
    idbMocks.__setMeta(sello('2020-01-01'));
    gatewayMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    renderHook(() => useSocialLegalConsent('uid-1', vi.fn()));

    await waitFor(() => expect((idbMocks.__getMeta()?.legalConsent as { version: string }).version).toBe(LEGAL_VERSION));
    gatewayMocks.getPublicConfig.mockClear();
    expect(await canPublishSocialInBackground('uid-1')).toBe(true);
    expect(gatewayMocks.getPublicConfig).not.toHaveBeenCalled();
  });

  it('al aceptar, aunque la puerta tuviera sellada la versión vieja de hace un rato', async () => {
    idbMocks.__setMeta(sello('2020-01-01'));
    gatewayMocks.getPublicConfig.mockResolvedValue(null);
    const { result } = renderHook(() => useSocialLegalConsent('uid-1', vi.fn()));
    await waitFor(() => expect(result.current.required).toBe(true));

    await act(() => result.current.accept());

    expect(await canPublishSocialInBackground('uid-1')).toBe(true);
  });
});
