/**
 * PRESUPUESTO DE LLAMADAS DEL HUB SOCIAL.
 *
 * Abrir el espacio social cuesta lecturas de gist contra GitHub y lecturas de documento contra Firestore, y ese
 * coste crece con el número de amigos. Hasta ahora nadie lo vigilaba: se descubrió con el emulador
 * (`npm run emulate:social`) que una apertura con TODO cacheado seguía disparando nueve cadenas de arranque, y que
 * un amigo con el canal derivado costaba dos lecturas en vez de una, en cada pasada.
 *
 * Esto fija lo que se arregló, en forma de presupuesto. No mide tiempos —eso es inestable en CI— sino LLAMADAS,
 * que es lo que de verdad se paga: cuota de Firestore, rate-limit de GitHub y latencia antes de pintar el feed.
 *
 * Si un cambio hace fallar este test, la pregunta no es «¿subo el número?» sino «¿qué he añadido al arranque?».
 * Los números están justificados uno a uno abajo.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SecretSocialGistResult } from '../../src/model/repository/socialGistRepository';
import type { SocialAuthUser, SocialProfileReference } from '../../src/model/repository/firebaseClient';

const contador = vi.hoisted(() => ({ gists: [] as string[], directorio: 0 }));

const MUNDO = vi.hoisted(() => {
  const ahora = Date.now();
  const perfil = (nombre: string) => ({
    name: nombre,
    private: false,
    visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
    sharedLists: {},
  });
  const resena = (autorId: string, nombre: string, gameId: number) => ({
    id: `${autorId}-${gameId}`, key: `${autorId}:${gameId}`, type: 'review' as const,
    actorProfileId: autorId, actorName: nombre, gameId, gameName: `Juego ${gameId}`,
    rating: 4, grade: 80, recommendationText: 'x', snippet: 'x',
    createdAt: ahora, updatedAt: ahora,
  });
  const gists: Record<string, unknown> = {
    'gist-yo': { profile: perfil('Yo'), activity: [resena('uid-yo', 'Yo', 1)], posts: [], moves: [], updatedAt: ahora, schemaVersion: 2 },
    'gist-ana': { profile: perfil('ana'), activity: [resena('uid-ana', 'ana', 2)], posts: [], moves: [], updatedAt: ahora, schemaVersion: 2 },
    'gist-bruno': { profile: perfil('bruno'), activity: [resena('uid-bruno', 'bruno', 3)], posts: [], moves: [], updatedAt: ahora, schemaVersion: 2 },
    // De este NO se debe leer nunca: está en el directorio pero no es amigo.
    'gist-ajeno': { profile: perfil('ajeno'), activity: [resena('uid-ajeno', 'ajeno', 4)], posts: [], moves: [], updatedAt: ahora, schemaVersion: 2 },
  };
  return { ahora, gists };
});

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<SocialAuthUser | null> => ({ uid: 'uid-yo', email: 'yo@x.com', displayName: 'Yo', photoURL: null } as never)),
  ensureProfileByEmail: vi.fn(async () => {}),
  resolveOwnProfile: vi.fn(async (): Promise<SocialProfileReference | null> => ({
    id: 'uid-yo', profileId: 'uid-yo', email: '', displayName: 'Yo', photoURL: '',
    socialGistId: 'gist-yo', gamesGistId: 'juegos-yo', githubToken: '', socialEnabled: true, tier: 'bronce',
  } as never)),
  getPublicConfig: vi.fn(async (): Promise<unknown> => ({ consent: { version: '2026-09-07', agreedAt: Date.now() } })),
  setPublicConfig: vi.fn(async () => {}),
  getPrivateConfig: vi.fn(async (): Promise<unknown> => ({ socialGistId: 'gist-yo', gamesGistId: 'juegos-yo' })),
  setPrivateConfig: vi.fn(async () => {}),
  listSocialDirectory: vi.fn(async (): Promise<unknown[]> => {
    contador.directorio += 1;
    const fila = (uid: string, nombre: string, gist: string) => ({
      id: uid, uid, displayName: nombre, photoURL: '', socialGistId: gist, gamesGistId: '',
      updatedAt: MUNDO.ahora, tier: 'bronce', achievementsMirror: '',
    });
    return [fila('uid-yo', 'Yo', 'gist-yo'), fila('uid-ana', 'ana', 'gist-ana'), fila('uid-bruno', 'bruno', 'gist-bruno'), fila('uid-ajeno', 'ajeno', 'gist-ajeno')];
  }),
  signInWithGoogle: vi.fn(async () => null),
  signOutSocialUser: vi.fn(async () => {}),
  resolveStableProfileId: vi.fn(async (uid: string) => uid),
  updateProfilePhoto: vi.fn(async () => {}),
  publishAchievementMirror: vi.fn(async () => {}),
  getMyFriendships: vi.fn(async (): Promise<unknown> => {
    const amigo = (uid: string, nombre: string, gist: string) => ({
      docId: `uid-yo__${uid}`, otherUid: uid, otherName: nombre, otherPhoto: '',
      otherSocialGistId: gist, otherGamesGistId: '', state: 'friends',
    });
    const friends = [amigo('uid-ana', 'ana', 'gist-ana'), amigo('uid-bruno', 'bruno', 'gist-bruno')];
    const byOtherUid: Record<string, unknown> = {};
    friends.forEach((f) => { byOtherUid[f.otherUid] = f; });
    return { friends, incoming: [], outgoing: [], byOtherUid };
  }),
  acceptFriendRequest: vi.fn(async () => {}),
  deleteFriendship: vi.fn(async () => {}),
  sendFriendRequest: vi.fn(async () => {}),
  readFriendship: vi.fn(async (): Promise<unknown> => null),
  healOwnFriendshipIdentity: vi.fn(async () => {}),
  healOwnDirectoryGist: vi.fn(async () => ({ healed: false, adoptGistId: '' })),
  invalidateMyFriendshipsCache: vi.fn(),
  touchOwnProfileActivityThrottled: vi.fn(async () => {}),
  purgeOwnPublicGistIds: vi.fn(async () => false),
  repairProfileDisplayName: vi.fn(async () => false),
}));

vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const gistMocks = vi.hoisted(() => ({
  getSocialSyncConfig: vi.fn(() => ({ token: 'ghp_presupuesto', gistId: 'gist-yo', etag: null, lastRemoteUpdatedAt: 0 })),
  getSyncConfig: vi.fn(() => ({ token: 'ghp_presupuesto', gistId: 'juegos-yo', etag: null, lastRemoteUpdatedAt: 0 })),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  createSocialGist: vi.fn(async () => ({ gistId: 'gist-yo', etag: null })),
  readSocialGist: vi.fn(async (): Promise<unknown> => ({ data: MUNDO.gists['gist-yo'], etag: null })),
  readPublicSocialGistById: vi.fn(async (gistId?: string): Promise<unknown> => {
    contador.gists.push(String(gistId || ''));
    const encontrado = MUNDO.gists[String(gistId || '')];
    if (!encontrado) throw new Error('404');
    return encontrado;
  }),
  ensureSecretSocialGist: vi.fn(async (_t?: string, gistId?: string): Promise<SecretSocialGistResult> => ({
    gistId: gistId || 'gist-yo', etag: null, migrated: false, supersededGistIds: [], keptPublicGistIds: [], copiedEntries: 0,
  })),
  socialGistHasContent: vi.fn(async () => true),
  deleteGist: vi.fn(async () => true),
  writeSocialGist: vi.fn(async () => ({ etag: null })),
  saveSocialSyncConfig: vi.fn(),
  updateGistPrivacy: vi.fn(async () => ({ gistId: 'gist-yo', etag: null })),
  buildReviewSnippet: (review: string) => (review || '').slice(0, 160),
}));

vi.mock('../../src/model/repository/gistRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/gistRepository')>()),
  ...gistMocks,
}));
vi.mock('../../src/model/repository/socialGistRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/socialGistRepository')>()),
  ...gistMocks,
}));

vi.mock('../../src/model/repository/localRepository', () => ({
  loadLocalState: vi.fn(() => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 })),
}));

vi.mock('../../src/viewmodel/useShareViewModel', () => ({
  useShareViewModel: vi.fn(() => ({
    shares: [], quota: { maxActive: 5, ttlDays: 7 }, ban: null, available: true, hasSocialSpace: true,
    nick: 'Yo', nickIsAccountName: false, loading: false, busyToken: null, error: '', errorDetails: {},
    refresh: vi.fn(async () => {}), share: vi.fn(async () => null), revoke: vi.fn(async () => false),
    shareOf: () => null, clearError: vi.fn(),
  })),
}));

// El repositorio de la configuración de logros NO pasa por la fachada de Firebase, así que sin esto el hub habla
// con el Firestore de PRODUCCIÓN: por aquí van `useAchievementsConfig`, `useOpenFrontier` y la caché, y el
// segundo además intenta ESCRIBIR la frontera abierta. Mockearlo aquí los cubre los tres de una vez.
vi.mock('../../src/model/repository/achievementsConfigRepository', () => ({
  loadAchievementsConfig: vi.fn(async () => ({ open: {}, hidden: {}, extraSteps: {} })),
  setLadderHidden: vi.fn(async () => ({})),
  setExtraSteps: vi.fn(async () => ({})),
  publishOpenFrontier: vi.fn(async () => ({})),
  advanceOpenFrontier: vi.fn(async () => {}),
}));

// La configuración de logros no pasa por la fachada de Firebase: sin este mock, el hub habla con Firestore de
// verdad (ver el guard de red de `tests/setup.ts`).
vi.mock('../../src/view/hooks/useAchievementsConfig', () => ({
  useAchievementsConfig: () => ({ open: {}, loading: false, error: '' }),
}));

import { SocialHub } from '../../src/view/components/SocialHub';
import { invalidateCachedSocialDirectory, patchLocalMeta } from '../../src/model/repository/indexedDbRepository';

const JUEGOS = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 } as never;

function abrirHub() {
  return render(
    <MemoryRouter initialEntries={['/social']}>
      <SocialHub games={JUEGOS} />
    </MemoryRouter>,
  );
}

const reposar = () => act(async () => { await new Promise((r) => setTimeout(r, 700)); });

describe('presupuesto de llamadas del hub social', () => {
  // IndexedDB SOBREVIVE de un test al siguiente dentro del mismo fichero, y en él viven justo las dos cosas que
  // estos tests miden: la caché del directorio y los sellos de los saneados. Sin este reinicio, cada test heredaría
  // el trabajo del anterior y mediría lo contrario de lo que dice medir.
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    contador.gists = [];
    contador.directorio = 0;
    await invalidateCachedSocialDirectory('gist-yo');
    await patchLocalMeta({
      profileNameRepairedFor: '',
      publicGistIdsPurgedFor: '',
      socialChannelPrivateFor: '',
      socialGistWinnerByFriend: {},
    });
  });

  it('en frío lee el gist propio y el de cada AMIGO, y ninguno más', async () => {
    abrirHub();
    await waitFor(() => expect(contador.gists.length).toBeGreaterThan(0), { timeout: 5000 });
    await reposar();

    // Tres: el propio y los dos amigos. El cuarto perfil del directorio no es amigo y el feed es solo-amigos, así
    // que su gist no se toca: es lo que impide que el coste crezca con el TAMAÑO DEL DIRECTORIO en vez de con el
    // número de amigos.
    expect([...new Set(contador.gists)].sort()).toEqual(['gist-ana', 'gist-bruno', 'gist-yo']);
    expect(contador.gists).not.toContain('gist-ajeno');
    // Sin lecturas repetidas: cada gist, una vez.
    expect(contador.gists.length).toBe(3);
    expect(contador.directorio).toBe(1);
  });

  it('con la caché caliente, volver a abrir no cuesta NI UNA lectura de gist', async () => {
    const { unmount } = abrirHub();
    await waitFor(() => expect(contador.gists.length).toBeGreaterThan(0), { timeout: 5000 });
    await reposar();
    unmount();

    contador.gists = [];
    contador.directorio = 0;

    abrirHub();
    await reposar();

    // La caché del directorio (IndexedDB, TTL por rango) tiene que absorber la reapertura entera.
    expect(contador.gists).toEqual([]);
    expect(contador.directorio).toBe(0);
  });

  it('los saneados de arranque no se repiten al reabrir el hub', async () => {
    const { unmount } = abrirHub();
    await reposar();
    unmount();
    abrirHub();
    await reposar();

    // UNA vez cada uno en las DOS aperturas: su sello vive en `LocalMeta` y sobrevive al desmontaje (ver
    // `useSocialStartupTasks`). Antes eran un `useRef` por tarea, así que se repetían en cada apertura.
    expect(firebaseMocks.repairProfileDisplayName).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.purgeOwnPublicGistIds).toHaveBeenCalledTimes(1);
    // La migración a canal secreto lista los gists de la cuenta contra GitHub: una vez, y sellada para siempre.
    expect(gistMocks.ensureSecretSocialGist).toHaveBeenCalledTimes(1);
  });
});
