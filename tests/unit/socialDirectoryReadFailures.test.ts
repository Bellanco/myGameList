import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialDirectoryEntry } from '../../src/viewmodel/social/socialFeed';

// LECTURAS FALLIDAS DEL FEED (docs/plan-feed-sin-vacio.md, Fase 1).
//
// La regla del usuario: si de un amigo que no se ha podido leer hay copia en este dispositivo, se enseña sin
// avisar de nada; si no la hay, error genérico. Y con el token de GitHub caducado, sus amigos no se reintentan sin
// token (60 peticiones/h por IP) ni se insiste con el mismo token: se corta al primer 401 y se pide reconectar.

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
  getSocialSyncConfig: () => ({ token: 'token-social', gistId: 'gist-yo' }),
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

function guardada(uid: string, juego: string): SocialDirectoryEntry {
  return {
    id: uid, uid, displayName: uid, socialGistId: `${uid}-social`, gamesGistId: '', photoURL: '', tier: 'bronze',
    lastActiveAt: Date.now(), achievementsMirror: '', yearSummarySeen: null,
    activity: [{ gameName: juego } as never], posts: [], moves: [], sharedLists: {}, visibility: VISIBILIDAD,
  };
}

const gistVacio = { profile: { name: 'x', visibility: VISIBILIDAD }, activity: [], posts: [], moves: [], updatedAt: 1 };
const limitado = () => Object.assign(new Error('Read failed: 403 - API rate limit exceeded'), { status: 403, rateLimited: true });
const caducado = () => Object.assign(new Error('Read public social gist failed: 401 - Bad credentials'), { status: 401 });

function montar(friends: string[], token: { current: string | null } = { current: 'token-principal' }) {
  const reportFailure = vi.fn();
  const setFeedback = vi.fn();
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
      setFeedback,
      reportFailure,
      setNetworkFailure,
      readToken: () => token.current,
    }),
  );
  return { ...hook, reportFailure, setFeedback, setNetworkFailure };
}

beforeEach(() => {
  vi.clearAllMocks();
  idb.stale = null;
  idb.getCachedSocialDirectory.mockImplementation(async (_gist: string, _ttl: number, options?: { allowExpired?: boolean }) =>
    (options?.allowExpired ? idb.stale : null));
  getSocialProfilesByUid.mockImplementation(async (uids: string[]) => uids.map(perfil));
  readPublicSocialGistById.mockResolvedValue(gistVacio);
});

describe('useSocialDirectory · lectura fallida con copia', () => {
  it('GitHub limita a un amigo con copia: su actividad sale de la copia y NO se avisa de nada', async () => {
    idb.stale = [guardada('ana', 'Juego guardado de Ana')];
    readPublicSocialGistById.mockImplementation(async (gistId: string) => {
      if (gistId === 'ana-social') throw limitado();
      return gistVacio;
    });
    const { result, reportFailure, setFeedback, setNetworkFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory.length).toBe(2));
    expect(result.current.rawSocialDirectory.find((entry) => entry.uid === 'ana')?.activity).toEqual((idb.stale[0] as SocialDirectoryEntry).activity);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(setFeedback).not.toHaveBeenCalled();
    // Tampoco se da el servicio por bueno: lo que se ve no está al día.
    expect(setNetworkFailure).not.toHaveBeenCalledWith(false);
    expect(result.current.feedReadFailed).toBe(false);
    expect(idb.putCachedSocialDirectory).not.toHaveBeenCalled();
  });

  it('Firestore sin cuota y feed guardado: se enseña lo guardado sin avisar', async () => {
    idb.stale = [guardada('ana', 'Juego guardado')];
    getSocialProfilesByUid.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const { result, reportFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory).toEqual(idb.stale));
    expect(reportFailure).not.toHaveBeenCalled();
    expect(result.current.feedReadFailed).toBe(false);
  });
});

describe('useSocialDirectory · lectura fallida sin copia', () => {
  it('GitHub limita a un amigo sin copia: error genérico, no «todo tranquilo»', async () => {
    readPublicSocialGistById.mockImplementation(async (gistId: string) => {
      if (gistId === 'ana-social') throw limitado();
      return gistVacio;
    });
    const { result, reportFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.feedReadFailed).toBe(true));
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('Firestore sin cuota y nada guardado: error genérico', async () => {
    getSocialProfilesByUid.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const { result } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.feedReadFailed).toBe(true));
  });

  it('un 404 (el amigo ya no publica) no es un error', async () => {
    readPublicSocialGistById.mockImplementation(async (gistId: string) => {
      if (gistId === 'ana-social') throw Object.assign(new Error('Read public social gist failed: 404 - Not Found'), { status: 404 });
      return gistVacio;
    });
    const { result } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory.length).toBe(2));
    expect(result.current.feedReadFailed).toBe(false);
  });

  it('una pasada buena retira el error de la anterior', async () => {
    readPublicSocialGistById.mockRejectedValueOnce(limitado()).mockRejectedValueOnce(limitado());
    const { result } = montar(['ana']);
    await result.current.hydrateSocialDirectory();
    await waitFor(() => expect(result.current.feedReadFailed).toBe(true));

    readPublicSocialGistById.mockResolvedValue(gistVacio);
    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.feedReadFailed).toBe(false));
  });
});

describe('useSocialDirectory · token de GitHub caducado', () => {
  const amigos = Array.from({ length: 12 }, (_, index) => `amigo${index}`);

  it('corta al primer 401: no lanza una petición por amigo, pide reconectar y usa la copia', async () => {
    idb.stale = [guardada('amigo11', 'Juego guardado')];
    readPublicSocialGistById.mockImplementation(async () => {
      await Promise.resolve();
      throw caducado();
    });
    const { result, setFeedback } = montar(amigos);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.githubReconnectNeeded).toBe(true));
    // Como mucho las que ya estaban en vuelo (la concurrencia de la hidratación), no las trece.
    expect(readPublicSocialGistById.mock.calls.length).toBeLessThanOrEqual(6);
    expect(result.current.rawSocialDirectory.find((entry) => entry.uid === 'amigo11')?.activity)
      .toEqual((idb.stale[0] as SocialDirectoryEntry).activity);
    // El aviso es el persistente con botón, no el mensaje que se va solo.
    expect(setFeedback).not.toHaveBeenCalled();
    expect(idb.putCachedSocialDirectory).not.toHaveBeenCalled();
  });

  // Un 401 lo ha contestado GitHub: hay red. Si un fallo anterior (wifi sin salida) dejó puesto el aviso de sin
  // conexión, tiene que irse, o tapa el de reconectar y el usuario no ve nunca el botón.
  it('un 401 demuestra que hay red: retira el aviso de sin conexión aunque los amigos salgan de la copia', async () => {
    idb.stale = [guardada('ana', 'Juego guardado')];
    readPublicSocialGistById.mockRejectedValue(caducado());
    const { result, setNetworkFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.githubReconnectNeeded).toBe(true));
    expect(setNetworkFailure).toHaveBeenCalledWith(false);
  });

  it('un fallo de RED de un amigo no da la red por buena', async () => {
    idb.stale = [guardada('ana', 'Juego guardado')];
    readPublicSocialGistById.mockImplementation(async (gistId: string) => {
      if (gistId === 'ana-social') throw new TypeError('Failed to fetch');
      return gistVacio;
    });
    const { result, setNetworkFailure } = montar(['ana']);

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.rawSocialDirectory.length).toBe(2));
    expect(setNetworkFailure).not.toHaveBeenCalledWith(false);
  });

  it('con el mismo token, la pasada siguiente no vuelve a preguntar a GitHub', async () => {
    readPublicSocialGistById.mockRejectedValue(caducado());
    const { result } = montar(['ana']);
    await result.current.hydrateSocialDirectory();
    await waitFor(() => expect(result.current.githubReconnectNeeded).toBe(true));
    readPublicSocialGistById.mockClear();

    await result.current.hydrateSocialDirectory();

    expect(readPublicSocialGistById).not.toHaveBeenCalled();
    expect(result.current.githubReconnectNeeded).toBe(true);
  });

  it('tras reconectar (token nuevo) vuelve a leer, con el token nuevo, y retira el aviso', async () => {
    const token = { current: 'token-viejo' as string | null };
    readPublicSocialGistById.mockRejectedValue(caducado());
    const { result } = montar(['ana'], token);
    await result.current.hydrateSocialDirectory();
    await waitFor(() => expect(result.current.githubReconnectNeeded).toBe(true));

    token.current = 'token-nuevo';
    readPublicSocialGistById.mockReset();
    readPublicSocialGistById.mockResolvedValue(gistVacio);
    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(result.current.githubReconnectNeeded).toBe(false));
    expect(readPublicSocialGistById).toHaveBeenCalledWith('ana-social', 'token-nuevo');
  });

  it('sin token principal, lee con la copia del canal social', async () => {
    const { result } = montar(['ana'], { current: null });

    await result.current.hydrateSocialDirectory();

    await waitFor(() => expect(readPublicSocialGistById).toHaveBeenCalledWith('ana-social', 'token-social'));
  });
});
