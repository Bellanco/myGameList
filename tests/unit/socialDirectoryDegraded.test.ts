import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialDirectoryEntry } from '../../src/viewmodel/social/socialFeed';

// EL FEED CUANDO UN SERVICIO NO ATIENDE (docs/plan-degradacion-servicios.md, fase 2).
//
// Antes solo se rescataba la copia guardada ante un fallo de RED. Con Firestore sin cuota el feed se vaciaba, y si
// GitHub limitaba la lectura de algunos amigos, el feed se guardaba SIN su actividad como si fuera bueno: media hora
// de feed incompleto por un corte de minutos.

const getSocialProfilesByUid = vi.hoisted(() => vi.fn());
const readPublicSocialGistById = vi.hoisted(() => vi.fn());
const idb = vi.hoisted(() => ({
  stale: null as unknown[] | null,
  getCachedSocialDirectory: vi.fn(),
  putCachedSocialDirectory: vi.fn(async () => {}),
}));

vi.mock('../../src/model/repository/firebaseRepository', () => ({ getSocialProfilesByUid }));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedSocialDirectory: idb.getCachedSocialDirectory,
  putCachedSocialDirectory: idb.putCachedSocialDirectory,
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 't', gistId: 'gist-yo' }),
  mergeSocialGistData: (a: unknown) => a,
  readPublicSocialGistById,
}));

const { useSocialDirectory } = await import('../../src/viewmodel/social/useSocialDirectory');

const VISIBILIDAD = { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true };

function amistad(uid: string) {
  return { docId: `${uid}__yo`, otherUid: uid, otherName: uid, otherPhoto: '', otherSocialGistId: `${uid}-social`, otherGamesGistId: '', state: 'friends' };
}

function perfil(uid: string) {
  return { id: uid, uid, displayName: uid, photoURL: '', socialGistId: '', gamesGistId: '', updatedAt: Date.now(), tier: 'gold', achievementsMirror: '' };
}

/** La entrada que quedó guardada en una visita anterior, con su actividad. */
function guardada(uid: string, juego: string): SocialDirectoryEntry {
  return {
    id: uid, uid, displayName: uid, socialGistId: `${uid}-social`, gamesGistId: '', photoURL: '', tier: 'bronze',
    lastActiveAt: Date.now(), achievementsMirror: '', yearSummarySeen: null,
    activity: [{ gameName: juego } as never], posts: [], moves: [], sharedLists: {}, visibility: VISIBILIDAD,
  };
}

function montar(friends: string[]) {
  const reportFailure = vi.fn();
  const setNetworkFailure = vi.fn();
  const hook = renderHook(() =>
    useSocialDirectory({
      enabled: true,
      inputsReady: true,
      authUser: { uid: 'yo', email: 'yo@x.com', displayName: 'Yo', photoURL: null } as never,
      ownProfileId: 'yo',
      ownTier: 'bronze',
      ownPublishablePhoto: '',
      socialGistId: 'gist-yo',
      friends: friends.map(amistad) as never,
      defaultSocialVisibility: VISIBILIDAD as never,
      setFeedback: vi.fn(),
      reportFailure,
      setNetworkFailure,
    }),
  );
  return { ...hook, reportFailure, setNetworkFailure };
}

beforeEach(() => {
  vi.clearAllMocks();
  idb.stale = null;
  // Fresca no hay nada (obliga a hidratar); caducada, lo que diga cada test.
  idb.getCachedSocialDirectory.mockImplementation(async (_gist: string, _ttl: number, options?: { allowExpired?: boolean }) =>
    (options?.allowExpired ? idb.stale : null));
});

describe('useSocialDirectory con el servicio limitado', () => {
  it('con Firestore sin cuota, enseña el feed guardado en vez de vaciarlo', async () => {
    idb.stale = [guardada('ana', 'Juego guardado')];
    getSocialProfilesByUid.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const { result, reportFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory).toEqual(idb.stale));
    // Con copia, sin aviso (docs/plan-feed-sin-vacio.md, Fase 1): lo guardado se enseña tal cual.
    expect(reportFailure).not.toHaveBeenCalled();
    expect(idb.putCachedSocialDirectory).not.toHaveBeenCalled();
  });

  it('si GitHub limita a un amigo, su actividad sale de lo guardado y el feed no se guarda como nuevo', async () => {
    idb.stale = [guardada('ana', 'Juego guardado de Ana')];
    getSocialProfilesByUid.mockResolvedValue([perfil('yo'), perfil('ana'), perfil('bruno')]);
    readPublicSocialGistById.mockImplementation(async (gistId: string) => {
      if (gistId === 'ana-social') {
        throw Object.assign(new Error('Read failed: 403 - API rate limit exceeded'), { status: 403, rateLimited: true });
      }
      return { profile: { name: gistId, visibility: VISIBILIDAD }, activity: [], posts: [], moves: [], updatedAt: 1 };
    });
    const { result, reportFailure } = montar(['ana', 'bruno']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory.length).toBe(3));
    const ana = result.current.rawSocialDirectory.find((entry) => entry.uid === 'ana');
    expect(ana?.activity).toEqual(idb.stale[0] && (idb.stale[0] as SocialDirectoryEntry).activity);
    // Lo de Firestore, al día aunque la actividad sea de antes.
    expect(ana?.tier).toBe('gold');
    expect(idb.putCachedSocialDirectory).not.toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('con todo bien, guarda la copia y retira los avisos', async () => {
    getSocialProfilesByUid.mockResolvedValue([perfil('yo'), perfil('ana')]);
    readPublicSocialGistById.mockResolvedValue({ profile: { name: 'x', visibility: VISIBILIDAD }, activity: [], posts: [], moves: [], updatedAt: 1 });
    const { result, setNetworkFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(idb.putCachedSocialDirectory).toHaveBeenCalled());
    expect(setNetworkFailure).toHaveBeenCalledWith(false);
  });
});
