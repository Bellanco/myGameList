/**
 * REPINTADOS DEL HUB SOCIAL.
 *
 * El feed es la pantalla más cara del hub: una tarjeta por actividad, cada una con su avatar, y crece con los
 * amigos. Dos cosas la repintaban entera sin que cambiara nada de lo que enseña, y las dos se arreglaron midiendo
 * (docs/revision-general-2026-09.md, hallazgo 2): el borrador del compositor viajaba por el view-model (155 renders
 * de avatar por 5 pulsaciones) y, al partir el view-model en piezas (docs/plan-arranque-social-y-movil.md, F2), una
 * pieza con identidad nueva en cada render habría hecho lo mismo por otro camino.
 *
 * Esto lo fija: escribir en el compositor y volver a pintar el hub sin datos nuevos no repintan ni el feed ni sus
 * avatares. Si falla, la pregunta es qué prop ha dejado de ser estable.
 */
import 'fake-indexeddb/auto';
import { LEGAL_VERSION } from '../../src/core/constants/legal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { SecretSocialGistResult } from '../../src/model/repository/socialGistRepository';
import type { SocialAuthUser, SocialProfileReference } from '../../src/model/repository/firebaseClient';

const contador = vi.hoisted(() => ({ gists: [] as string[], directorio: 0, perfiles: [] as string[] }));

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
  const fila = (uid: string, nombre: string, gist: string) => ({
    id: uid, uid, displayName: nombre, photoURL: '', socialGistId: gist, gamesGistId: '',
    updatedAt: ahora, tier: 'bronce', achievementsMirror: '',
  });
  const perfiles = [fila('uid-yo', 'Yo', 'gist-yo'), fila('uid-ana', 'ana', 'gist-ana'), fila('uid-bruno', 'bruno', 'gist-bruno'), fila('uid-ajeno', 'ajeno', 'gist-ajeno')];
  return { ahora, gists, perfiles };
});

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<SocialAuthUser | null> => ({ uid: 'uid-yo', email: 'yo@x.com', displayName: 'Yo', photoURL: null } as never)),
  ensureProfileByEmail: vi.fn(async () => {}),
  resolveOwnProfile: vi.fn(async (): Promise<SocialProfileReference | null> => ({
    id: 'uid-yo', profileId: 'uid-yo', email: '', displayName: 'Yo', photoURL: '',
    socialGistId: 'gist-yo', gamesGistId: 'juegos-yo', githubToken: '', socialEnabled: true, tier: 'bronce',
  } as never)),
  // La versión sale de la CONSTANTE y no de una cadena a mano: escrita a mano, cada subida de `LEGAL_VERSION`
  // dejaba la puerta legal cerrada en el test y este fichero fallaba entero con cuatro errores que no tienen nada
  // que ver con lo que mide —el presupuesto de lecturas de gist—.
  getPublicConfig: vi.fn(async (): Promise<unknown> => ({ consent: { version: LEGAL_VERSION, agreedAt: Date.now() } })),
  setPublicConfig: vi.fn(async () => {}),
  getPrivateConfig: vi.fn(async (): Promise<unknown> => ({ socialGistId: 'gist-yo', gamesGistId: 'juegos-yo' })),
  setPrivateConfig: vi.fn(async () => {}),
  // La consulta de los recientes: es la de «Perfiles». El feed NO debe lanzarla.
  listSocialDirectory: vi.fn(async (): Promise<unknown[]> => {
    contador.directorio += 1;
    return MUNDO.perfiles;
  }),
  // Lo que sí lee el feed: tus amigos y tú, por uid. Cada uid pedido es una lectura de Firestore.
  getSocialProfilesByUid: vi.fn(async (uids: string[]): Promise<unknown[]> => {
    contador.perfiles.push(...uids);
    return MUNDO.perfiles.filter((perfil) => uids.includes(perfil.uid));
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
  // Fase 2 de docs/plan-historial-amigo-nuevo.md: aquí no hay aristas pendientes, así que no se llega a llamar.
  haveFriendshipEdgesChanged: vi.fn(async () => false),
  claimRequesterKeys: vi.fn(async () => 0),
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS: 60_000,
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
// UN SOLO OBJETO, como el hook real (que devuelve su estado de React). Un literal nuevo por llamada recalculaba tus
// logros en cada render y repintaba el feed por culpa del mock, no del código: es la mitad de lo que se mide aquí.
const CONFIG_LOGROS = vi.hoisted(() => ({ open: {}, loading: false, error: '' }));
vi.mock('../../src/view/hooks/useAchievementsConfig', () => ({
  useAchievementsConfig: () => CONFIG_LOGROS,
}));


/* CONTADORES DE RENDER. Cada componente se envuelve en un `memo` que cuenta y delega: con la misma comparación que
   el original, el envoltorio solo se pinta cuando el original se habría pintado, así que el número es el suyo. */
const renders = vi.hoisted(() => ({ feed: 0, avatar: 0, propsDelFeed: [] as string[] }));
vi.mock('../../src/view/components/socialhub/SocialFeedScreen', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/view/components/socialhub/SocialFeedScreen')>();
  const { memo, createElement } = await import('react');
  const Real = real.SocialFeedScreen;
  // Además de contar, apunta QUÉ props cambiaron respecto al render anterior: es lo que dice dónde mirar si falla.
  let anteriores: Record<string, unknown> | null = null;
  const Contado = memo(function SocialFeedScreenContado(props: React.ComponentProps<typeof Real>) {
    renders.feed += 1;
    const actuales = props as unknown as Record<string, unknown>;
    if (anteriores) {
      const previas = anteriores;
      renders.propsDelFeed = Object.keys(actuales).filter((clave) => !Object.is(actuales[clave], previas[clave]));
    }
    anteriores = actuales;
    return createElement(Real, props);
  });
  return { ...real, SocialFeedScreen: Contado };
});
vi.mock('../../src/view/components/socialhub/HubAvatar', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/view/components/socialhub/HubAvatar')>();
  const { memo, createElement } = await import('react');
  const Real = real.HubAvatar;
  const Contado = memo(function HubAvatarContado(props: React.ComponentProps<typeof Real>) {
    renders.avatar += 1;
    return createElement(Real, props);
  });
  return { ...real, HubAvatar: Contado };
});

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

describe('repintados del hub social', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    contador.gists = [];
    contador.directorio = 0;
    contador.perfiles = [];
    renders.feed = 0;
    renders.avatar = 0;
    // Rango con publicaciones: sin él no hay compositor, y es justo donde se escribe.
    firebaseMocks.resolveOwnProfile.mockResolvedValue({
      id: 'uid-yo', profileId: 'uid-yo', email: '', displayName: 'Yo', photoURL: '',
      socialGistId: 'gist-yo', gamesGistId: 'juegos-yo', githubToken: '', socialEnabled: true, tier: 'gold',
    } as never);
    await invalidateCachedSocialDirectory('gist-yo');
    await patchLocalMeta({
      profileNameRepairedFor: '',
      publicGistIdsPurgedFor: '',
      socialChannelPrivateFor: '',
      socialGistWinnerByFriend: {},
    });
  });

  it('escribir en el compositor no repinta el feed ni sus avatares', async () => {
    abrirHub();
    await reposar();
    await waitFor(() => expect(document.querySelector('textarea.hub-post-input')).not.toBeNull());
    const cuadro = document.querySelector('textarea.hub-post-input') as HTMLTextAreaElement;
    await waitFor(() => expect(renders.avatar).toBeGreaterThan(0));
    await reposar();
    const antes = { ...renders };

    await userEvent.type(cuadro, 'hola!');

    expect(cuadro).toHaveValue('hola!');
    expect({ feed: renders.feed - antes.feed, avatar: renders.avatar - antes.avatar }).toEqual({ feed: 0, avatar: 0 });
  });

  it('volver a ejecutar el view-model sin datos nuevos no repinta el feed ni sus avatares', async () => {
    const { rerender } = abrirHub();
    await reposar();
    await waitFor(() => expect(renders.avatar).toBeGreaterThan(0));
    await reposar();
    const antes = { ...renders };

    /* `SocialHubInner` está memoizado: con las mismas props ni se ejecuta. Una `onAddGame` NUEVA lo obliga a pintarse
       —y con él al view-model entero— sin cambiar nada de lo que enseña el feed, que no la recibe (va a la ficha). */
    rerender(
      <MemoryRouter initialEntries={['/social']}>
        <SocialHub games={JUEGOS} onAddGame={() => 'added'} />
      </MemoryRouter>,
    );
    await reposar();

    expect({ feed: renders.feed - antes.feed, avatar: renders.avatar - antes.avatar, propsQueCambiaron: renders.feed - antes.feed ? renders.propsDelFeed : [] })
      .toEqual({ feed: 0, avatar: 0, propsQueCambiaron: [] });
  });
});
