/**
 * EMULADOR DEL ESPACIO SOCIAL. Se lanza con `npm run emulate:social`.
 *
 * PARA QUÉ SIRVE: el hub social no se puede observar sin una cuenta de Google y un token de GitHub, así que su
 * coste y su comportamiento eran invisibles hasta abrirlo en producción. Esto monta el hub REAL con una población
 * sintética —yo, cuatro amigos activos, un amigo inactivo, un amigo con deriva de gist, diez desconocidos y una
 * solicitud recibida— sustituyendo SOLO las tres costuras de red, y CUENTA lo que hace: lecturas de gist por
 * identificador, consultas a Firestore, aciertos de caché, cadenas de arranque y renders.
 *
 * NO AFIRMA NADA A PROPÓSITO: imprime. Por eso vive fuera de la suite (ver `vitest.emulacion.config.js`, y la
 * exclusión en `vitest.config.js`). Lo que sí se vigila en cada commit es el PRESUPUESTO que este emulador
 * descubrió: `tests/component/socialHubBudget.test.tsx`.
 *
 * CÓMO LEER LA SALIDA:
 *  - FEED: lo que cuesta una apertura en FRÍO. Los desconocidos y el amigo inactivo deben salir a cero lecturas;
 *    un amigo con deriva de gist cuesta dos.
 *  - NAVEGACIÓN: lo que cuesta una apertura con la caché CALIENTE. Las lecturas de gist deben ser cero, y la
 *    línea de SANEADOS dice cuántas cadenas de arranque siguen corriendo aunque no haya nada que hacer.
 *  - CACHÉ: el peso de lo que se guarda en IndexedDB y su proyección al tope de 50 perfiles.
 *  - SOLICITUDES: la bandeja, para comprobar que no cuesta ninguna lectura extra.
 *
 * PARA CAMBIAR LA POBLACIÓN, edita `MUNDO`. Si añades un amigo, añade también su gist.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profiler } from 'react';
import type { SecretSocialGistResult } from '../../src/model/repository/socialGistRepository';
import type { SocialAuthUser, SocialProfileReference } from '../../src/model/repository/firebaseClient';

// ─── Contadores de la emulación ──────────────────────────────────────────────
const contadores = vi.hoisted(() => ({
  lecturasDeGist: [] as string[],
  listadosDeDirectorio: 0,
  consultasDeAmistad: 0,
  cacheAciertos: 0,
  cacheFallos: 0,
  cacheEscrituras: 0,
  bytesCacheados: 0,
  reset() {
    this.lecturasDeGist = [];
    this.listadosDeDirectorio = 0;
    this.consultasDeAmistad = 0;
    this.cacheAciertos = 0;
    this.cacheFallos = 0;
    this.cacheEscrituras = 0;
    this.bytesCacheados = 0;
  },
}));

// ─── La población sintética ──────────────────────────────────────────────────
const MUNDO = vi.hoisted(() => {
  const DIA = 86_400_000;
  const ahora = Date.now();

  const perfil = (nombre: string) => ({
    name: nombre,
    private: false,
    visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
    sharedLists: {},
    photoURL: '',
  });

  const resena = (autorId: string, autorNombre: string, gameId: number, juego: string, diasAtras: number) => ({
    id: `${autorId}-r-${gameId}`,
    key: `${autorId}:${gameId}`,
    type: 'review' as const,
    actorProfileId: autorId,
    actorName: autorNombre,
    gameId,
    gameName: juego,
    rating: 4,
    grade: 82,
    recommendationText: `Reseña de ${juego} por ${autorNombre}.`,
    snippet: `Reseña de ${juego}`,
    createdAt: ahora - diasAtras * DIA,
    updatedAt: ahora - diasAtras * DIA,
  });

  const publicacion = (autorId: string, autorNombre: string, n: number, diasAtras: number) => ({
    id: `${autorId}-p-${n}`,
    authorProfileId: autorId,
    authorName: autorNombre,
    text: `Publicación ${n} de ${autorNombre}`,
    createdAt: ahora - diasAtras * DIA,
    updatedAt: ahora - diasAtras * DIA,
  });

  const movimiento = (gameId: number, juego: string, tab: string, diasAtras: number) => ({
    id: `${gameId}:${tab}`,
    gameId,
    gameName: juego,
    tab,
    at: ahora - diasAtras * DIA,
  });

  // Gists sociales por id. Cada amigo tiene el suyo.
  const gists: Record<string, any> = {
    'gist-yo': {
      profile: perfil('Yo'),
      activity: [resena('uid-yo', 'Yo', 900, 'Hollow Knight', 1)],
      posts: [publicacion('uid-yo', 'Yo', 1, 1)],
      moves: [movimiento(900, 'Hollow Knight', 'c', 1)],
      updatedAt: ahora,
      schemaVersion: 2,
    },
  };

  // Cuatro amigos activos, con 12 reseñas, 5 publicaciones y 20 movimientos cada uno.
  const amigos = ['ana', 'bruno', 'clara', 'dario'].map((nombre, indice) => {
    const uid = `uid-${nombre}`;
    const gistId = `gist-${nombre}`;
    gists[gistId] = {
      profile: perfil(nombre),
      activity: Array.from({ length: 12 }, (_u, i) => resena(uid, nombre, 1000 + indice * 100 + i, `Juego ${indice}-${i}`, i)),
      posts: Array.from({ length: 5 }, (_u, i) => publicacion(uid, nombre, i, i)),
      moves: Array.from({ length: 20 }, (_u, i) => movimiento(1000 + indice * 100 + i, `Juego ${indice}-${i}`, 'ce'[i % 2], i)),
      updatedAt: ahora - indice * 1000,
      schemaVersion: 2,
    };
    return { uid, nombre, gistId, updatedAt: ahora - indice * 60_000 };
  });

  // Un amigo INACTIVO (último uso hace 60 días): debería quedarse index-only, sin leer su gist.
  const inactivo = { uid: 'uid-eva', nombre: 'eva', gistId: 'gist-eva', updatedAt: ahora - 60 * DIA };
  gists[inactivo.gistId] = {
    profile: perfil('eva'),
    activity: [resena('uid-eva', 'eva', 700, 'Juego viejo', 61)],
    posts: [], moves: [], updatedAt: ahora - 60 * DIA, schemaVersion: 2,
  };

  // Un amigo con DERIVA: el directorio anuncia un gist y la amistad otro. Debería provocar DOS lecturas.
  const deriva = { uid: 'uid-fran', nombre: 'fran', gistDirectorio: 'gist-fran-viejo', gistAmistad: 'gist-fran', updatedAt: ahora };
  gists['gist-fran'] = {
    profile: perfil('fran'),
    activity: [resena('uid-fran', 'fran', 800, 'Juego nuevo', 0)],
    posts: [], moves: [], updatedAt: ahora, schemaVersion: 2,
  };
  gists['gist-fran-viejo'] = {
    profile: perfil('fran'),
    activity: [resena('uid-fran', 'fran', 801, 'Juego antiguo', 40)],
    posts: [], moves: [], updatedAt: ahora - 40 * DIA, schemaVersion: 2,
  };

  // Diez desconocidos en el directorio: NO son amigos, así que no debería leerse su gist.
  const desconocidos = Array.from({ length: 10 }, (_u, i) => ({
    uid: `uid-x${i}`, nombre: `Desconocido ${i}`, gistId: `gist-x${i}`, updatedAt: ahora - i * 1000,
  }));
  desconocidos.forEach((d) => {
    gists[d.gistId] = { profile: perfil(d.nombre), activity: [], posts: [], moves: [], updatedAt: ahora, schemaVersion: 2 };
  });

  return { ahora, gists, amigos, inactivo, deriva, desconocidos };
});

// ─── Seams: los mismos que usa el test de componente del hub ─────────────────
const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(async (): Promise<SocialAuthUser | null> => ({
    uid: 'uid-yo', email: 'yo@example.com', displayName: 'Yo', photoURL: null,
  } as never)),
  ensureProfileByEmail: vi.fn(async () => {}),
  resolveOwnProfile: vi.fn(async (): Promise<SocialProfileReference | null> => ({
    id: 'uid-yo', profileId: 'uid-yo', email: '', displayName: 'Yo', photoURL: '',
    socialGistId: 'gist-yo', gamesGistId: 'juegos-yo', githubToken: '', socialEnabled: true, tier: 'bronce',
  } as never)),
  getPublicConfig: vi.fn(async (): Promise<any> => ({ consent: { version: '2026-09-07', agreedAt: Date.now() } })),
  setPublicConfig: vi.fn(async () => {}),
  getPrivateConfig: vi.fn(async (): Promise<any> => ({ socialGistId: 'gist-yo', gamesGistId: 'juegos-yo' })),
  setPrivateConfig: vi.fn(async () => {}),
  listSocialDirectory: vi.fn(async (): Promise<any[]> => {
    contadores.listadosDeDirectorio += 1;
    return [
      { id: 'uid-yo', uid: 'uid-yo', displayName: 'Yo', photoURL: '', socialGistId: 'gist-yo', gamesGistId: 'juegos-yo', updatedAt: MUNDO.ahora, tier: 'bronce', achievementsMirror: '' },
      ...MUNDO.amigos.map((a) => ({ id: a.uid, uid: a.uid, displayName: a.nombre, photoURL: '', socialGistId: a.gistId, gamesGistId: `juegos-${a.nombre}`, updatedAt: a.updatedAt, tier: 'bronce', achievementsMirror: '' })),
      { id: MUNDO.inactivo.uid, uid: MUNDO.inactivo.uid, displayName: MUNDO.inactivo.nombre, photoURL: '', socialGistId: MUNDO.inactivo.gistId, gamesGistId: '', updatedAt: MUNDO.inactivo.updatedAt, tier: 'bronce', achievementsMirror: '' },
      { id: MUNDO.deriva.uid, uid: MUNDO.deriva.uid, displayName: MUNDO.deriva.nombre, photoURL: '', socialGistId: MUNDO.deriva.gistDirectorio, gamesGistId: '', updatedAt: MUNDO.deriva.updatedAt, tier: 'bronce', achievementsMirror: '' },
      ...MUNDO.desconocidos.map((d) => ({ id: d.uid, uid: d.uid, displayName: d.nombre, photoURL: '', socialGistId: d.gistId, gamesGistId: '', updatedAt: d.updatedAt, tier: 'bronce', achievementsMirror: '' })),
    ];
  }),
  signInWithGoogle: vi.fn(async () => null),
  signOutSocialUser: vi.fn(async () => {}),
  resolveStableProfileId: vi.fn(async (uid: string) => uid),
  updateProfilePhoto: vi.fn(async () => {}),
  publishAchievementMirror: vi.fn(async () => {}),
  getMyFriendships: vi.fn(async (): Promise<any> => {
    contadores.consultasDeAmistad += 1;
    const amigo = (uid: string, nombre: string, gist: string) => ({
      docId: `uid-yo__${uid}`, otherUid: uid, otherName: nombre, otherPhoto: '',
      otherSocialGistId: gist, otherGamesGistId: `juegos-${nombre}`, state: 'friends',
    });
    const friends = [
      ...MUNDO.amigos.map((a) => amigo(a.uid, a.nombre, a.gistId)),
      amigo(MUNDO.inactivo.uid, MUNDO.inactivo.nombre, MUNDO.inactivo.gistId),
      amigo(MUNDO.deriva.uid, MUNDO.deriva.nombre, MUNDO.deriva.gistAmistad),
    ];
    const incoming = [{ docId: 'uid-yo__uid-x0', otherUid: 'uid-x0', otherName: 'Desconocido 0', otherPhoto: '', otherSocialGistId: '', otherGamesGistId: '', state: 'incoming' }];
    const byOtherUid: Record<string, any> = {};
    [...friends, ...incoming].forEach((f) => { byOtherUid[f.otherUid] = f; });
    return { friends, incoming, outgoing: [], byOtherUid };
  }),
  acceptFriendRequest: vi.fn(async () => {}),
  deleteFriendship: vi.fn(async () => {}),
  sendFriendRequest: vi.fn(async () => {}),
  readFriendship: vi.fn(async (): Promise<any> => null),
  healOwnFriendshipIdentity: vi.fn(async () => {}),
  healOwnDirectoryGist: vi.fn(async () => ({ healed: false, adoptGistId: '' })),
  invalidateMyFriendshipsCache: vi.fn(),
  touchOwnProfileActivityThrottled: vi.fn(async () => {}),
  purgeOwnPublicGistIds: vi.fn(async () => false),
  repairProfileDisplayName: vi.fn(async () => false),
}));

vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const gistMocks = vi.hoisted(() => ({
  getSocialSyncConfig: vi.fn(() => ({ token: 'ghp_emulacion', gistId: 'gist-yo', etag: null, lastRemoteUpdatedAt: 0 })),
  getSyncConfig: vi.fn(() => ({ token: 'ghp_emulacion', gistId: 'juegos-yo', etag: null, lastRemoteUpdatedAt: 0 })),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  createSocialGist: vi.fn(async () => ({ gistId: 'gist-yo', etag: null })),
  readSocialGist: vi.fn(async (): Promise<any> => ({ data: MUNDO.gists['gist-yo'], etag: null })),
  readPublicSocialGistById: vi.fn(async (gistId?: string): Promise<any> => {
    contadores.lecturasDeGist.push(String(gistId || ''));
    const encontrado = MUNDO.gists[String(gistId || '')];
    if (!encontrado) throw new Error('404 gist no encontrado');
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

vi.mock('../../src/model/repository/indexedDbRepository', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/repository/indexedDbRepository')>();
  return {
    ...real,
    getCachedSocialDirectory: async (...args: Parameters<typeof real.getCachedSocialDirectory>) => {
      const out = await real.getCachedSocialDirectory(...args);
      if (out) contadores.cacheAciertos += 1; else contadores.cacheFallos += 1;
      return out;
    },
    putCachedSocialDirectory: async (gistId: string, entries: unknown[]) => {
      contadores.cacheEscrituras += 1;
      contadores.bytesCacheados = JSON.stringify(entries).length;
      return real.putCachedSocialDirectory(gistId, entries as never);
    },
  };
});

vi.mock('../../src/model/repository/localRepository', () => ({
  loadLocalState: vi.fn((): any => ({
    c: Array.from({ length: 40 }, (_u, i) => ({ id: 900 + i, name: `Mi juego ${i}`, _ts: Date.now(), platforms: [], genres: [], steamDeck: false, review: 'x' })),
    v: [], e: [], p: [], deleted: [], updatedAt: Date.now(),
  })),
}));

vi.mock('../../src/model/repository/foreignProfileRepository', () => ({
  invalidateProfileGames: vi.fn(async () => {}),
  loadForeignProfileGames: vi.fn(async ({ gamesGistId }: { gamesGistId: string }) => {
    const nombre = String(gamesGistId || '').replace('juegos-', '');
    if (!nombre || nombre === gamesGistId) return null;
    return {
      c: Array.from({ length: 6 }, (_u, i) => ({
        id: 1000 + i, name: `Juego de ${nombre} ${i}`, score: 4, grade: 80,
        review: `Análisis de ${nombre} sobre el juego ${i}.`,
        platforms: ['PC'], genres: ['RPG'], years: [2024], _ts: Date.now(),
      })),
      v: [], e: [], p: [], deleted: [], updatedAt: Date.now(),
    };
  }),
}));

vi.mock('../../src/viewmodel/useShareViewModel', () => ({
  useShareViewModel: vi.fn(() => ({
    shares: [], quota: { maxActive: 5, ttlDays: 7 }, ban: null, available: true, hasSocialSpace: true,
    nick: 'Yo', nickIsAccountName: false, loading: false, busyToken: null, error: '', errorDetails: {},
    refresh: vi.fn(async () => {}), share: vi.fn(async () => null), revoke: vi.fn(async () => false),
    shareOf: () => null, clearError: vi.fn(),
  })),
}));

vi.mock('../../src/view/hooks/useAchievementsConfig', () => ({
  useAchievementsConfig: () => ({ open: {}, loading: false, error: '' }),
}));

import { SocialHub } from '../../src/view/components/SocialHub';
import { invalidateCachedSocialDirectory, patchLocalMeta } from '../../src/model/repository/indexedDbRepository';

const JUEGOS = {
  c: Array.from({ length: 40 }, (_u, i) => ({ id: 900 + i, name: `Mi juego ${i}`, _ts: Date.now(), platforms: [], genres: [], steamDeck: false, review: 'x' })),
  v: [], e: [], p: [], deleted: [], updatedAt: Date.now(),
} as never;

let renders: number[] = [];
function abrirHub(ruta = '/social') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Profiler id="hub" onRender={(_id, _fase, duracion) => { renders.push(duracion); }}>
        <SocialHub games={JUEGOS} />
      </Profiler>
    </MemoryRouter>,
  );
}

const cuenta = (lista: string[]) => {
  const mapa = new Map<string, number>();
  lista.forEach((id) => mapa.set(id, (mapa.get(id) || 0) + 1));
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
};

describe('emulación del espacio social', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    contadores.reset();
    renders = [];
  });

  it('abre el feed y deja ver qué lee', async () => {
    abrirHub('/social');
    await waitFor(() => expect(contadores.lecturasDeGist.length).toBeGreaterThan(0), { timeout: 5000 });
    // Margen para que terminen las cadenas asíncronas encadenadas (saneados, reconciliación).
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });

    const texto = document.body.textContent || '';
    console.warn('\n════ FEED ════');
    console.warn('listSocialDirectory:', contadores.listadosDeDirectorio, '| getMyFriendships:', contadores.consultasDeAmistad);
    console.warn('lecturas de gist:', contadores.lecturasDeGist.length);
    console.warn('por gist:', JSON.stringify(cuenta(contadores.lecturasDeGist)));
    console.warn('¿aparece el inactivo (eva)?', texto.includes('eva'));
    console.warn('¿aparece fran (deriva)?', texto.includes('fran'));
    console.warn('¿aparece algún desconocido?', /Desconocido \d/.test(texto));
    console.warn('renders del hub en una apertura en frío:', renders.length, '· ms totales:', renders.reduce((a, b) => a + b, 0).toFixed(1));
    console.warn('primeros 600 caracteres del hub:\n', texto.slice(0, 600));
  });

  it('navega feed → perfiles → detalle → feed y cuenta las relecturas', async () => {
    const { unmount } = abrirHub('/social');
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    const trasFeed = contadores.lecturasDeGist.length;
    unmount();

    // Volver a montar el hub simula salir del espacio social y entrar otra vez.
    abrirHub('/social');
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    const trasVolver = contadores.lecturasDeGist.length;

    console.warn('\n════ NAVEGACIÓN ════');
    console.warn('lecturas tras el primer feed:', trasFeed);
    console.warn('lecturas tras volver a entrar:', trasVolver, `(+${trasVolver - trasFeed})`);
    console.warn('listados de directorio:', contadores.listadosDeDirectorio, '| consultas de amistad:', contadores.consultasDeAmistad);
    console.warn('caché del directorio → aciertos:', contadores.cacheAciertos, 'fallos:', contadores.cacheFallos, 'escrituras:', contadores.cacheEscrituras);
    const saneados = {
      healOwnFriendshipIdentity: firebaseMocks.healOwnFriendshipIdentity.mock.calls.length,
      repairProfileDisplayName: firebaseMocks.repairProfileDisplayName.mock.calls.length,
      purgeOwnPublicGistIds: firebaseMocks.purgeOwnPublicGistIds.mock.calls.length,
      touchOwnProfileActivityThrottled: firebaseMocks.touchOwnProfileActivityThrottled.mock.calls.length,
      resolveOwnProfile: firebaseMocks.resolveOwnProfile.mock.calls.length,
      resolveStableProfileId: firebaseMocks.resolveStableProfileId.mock.calls.length,
      getPrivateConfig: firebaseMocks.getPrivateConfig.mock.calls.length,
      getPublicConfig: firebaseMocks.getPublicConfig.mock.calls.length,
      ensureSecretSocialGist: gistMocks.ensureSecretSocialGist.mock.calls.length,
      readSocialGist: gistMocks.readSocialGist.mock.calls.length,
      writeSocialGist: gistMocks.writeSocialGist.mock.calls.length,
    };
    console.warn('SANEADOS/ARRANQUE en DOS aperturas con caché caliente:', JSON.stringify(saneados));
    console.warn('bytes cacheados en la última escritura:', contadores.bytesCacheados);
  });

  it('mide el peso de lo que se guarda en la caché del directorio', async () => {
    abrirHub('/social');
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    console.warn('caché → aciertos:', contadores.cacheAciertos, 'fallos:', contadores.cacheFallos, 'escrituras:', contadores.cacheEscrituras, 'bytes:', contadores.bytesCacheados);

    // Se reconstruye lo que la hidratación habría cacheado, con los mismos topes del hook.
    const entradas = Object.values(MUNDO.gists);
    const bytes = JSON.stringify(entradas).length;
    console.warn('\n════ CACHÉ ════');
    console.warn('gists de la población:', entradas.length, '· bytes en crudo:', bytes);
    console.warn('proyección a 50 perfiles con los topes del hook (320 act + 40 pub + 120 mov):');
    console.warn('  entradas máximas por perfil:', 320 + 40 + 120, '· por directorio:', (320 + 40 + 120) * 50);
  });

  it('lista lo que ve la pantalla de solicitudes', async () => {
    abrirHub('/social/requests');
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    const texto = document.body.textContent || '';
    console.warn('\n════ SOLICITUDES ════');
    console.warn(texto.slice(0, 800));
    console.warn('lecturas de gist acumuladas:', contadores.lecturasDeGist.length);
    expect(screen).toBeTruthy();
  });

  it('DERIVA: la segunda hidratación en frío ya no paga la lectura doble', async () => {
    // Los escenarios anteriores dejaron la caché del directorio caliente Y el ganador de la deriva ya aprendido.
    // Se tiran las dos cosas para poder ver el ANTES y el DESPUÉS en la misma ejecución.
    await invalidateCachedSocialDirectory('gist-yo');
    await patchLocalMeta({ socialGistWinnerByFriend: {} });
    contadores.reset();

    // Primera hidratación en frío: el amigo con deriva cuesta DOS lecturas (directorio y amistad no coinciden).
    const { unmount } = abrirHub('/social');
    await waitFor(() => expect(contadores.lecturasDeGist.length).toBeGreaterThan(0), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    const primera = contadores.lecturasDeGist.filter((id) => id.startsWith('gist-fran'));
    unmount();

    // Se tira la caché del directorio para forzar OTRA hidratación en frío (es lo que pasa al aceptar o quitar
    // una amistad, y lo que pasaba en cada apertura antes de que hubiera caché).
    await invalidateCachedSocialDirectory('gist-yo');
    contadores.reset();

    abrirHub('/social');
    await waitFor(() => expect(contadores.lecturasDeGist.length).toBeGreaterThan(0), { timeout: 5000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    const segunda = contadores.lecturasDeGist.filter((id) => id.startsWith('gist-fran'));

    console.warn('\n════ DERIVA DE CANAL ════');
    console.warn('1.ª hidratación en frío · lecturas de fran:', primera.length, JSON.stringify(primera));
    console.warn('2.ª hidratación en frío · lecturas de fran:', segunda.length, JSON.stringify(segunda));
    console.warn('total de lecturas de la 2.ª pasada:', contadores.lecturasDeGist.length, '(antes 7)');
    console.warn('¿sigue apareciendo fran en el feed?', (document.body.textContent || '').includes('fran'));
  });

  /**
   * RECORRIDO DE TODAS LAS PANTALLAS DEL HUB. Renderiza cada ruta social y revisa lo que se puede revisar sin
   * ojos: que no cae en el error boundary, que tiene encabezado, que ningún control se queda sin nombre accesible
   * y que no escribe errores en consola. Es la red que faltaba para las pantallas interiores, a las que no se
   * llega sin cuenta de Google.
   */
  // Catorce pantallas a 700 ms de reposo cada una no caben en el tiempo por defecto de vitest.
  it('RECORRIDO: revisa cada pantalla interior del hub', async () => {
    const RUTAS: Array<[string, string]> = [
      ['/social', 'Actividad (feed)'],
      ['/social/profile', 'Editor de perfil'],
      ['/social/profiles', 'Directorio de perfiles'],
      ['/social/requests', 'Solicitudes'],
      ['/social/profiles/me', 'Mi perfil (alias «me»)'],
      ['/social/profiles/uid-ana', 'Ficha de un amigo'],
      ['/social/profiles/uid-ana/reviews', 'Reseñas de un amigo'],
      ['/social/profiles/uid-ana/logros', 'Logros de un amigo'],
      ['/social/profiles/uid-ana/globales', 'Globales de un amigo'],
      ['/social/profiles/uid-ana/game/1000/review', 'Reseña concreta de un amigo'],
      ['/social/user/uid-ana/game/1000/review', 'Detalle de actividad'],
      ['/social/user/uid-ana/game/0/review', 'Detalle con gameId 0 (centinela de «sin juego»)'],
      ['/social/profiles/uid-eva', 'Ficha de un amigo INACTIVO (hidratación bajo demanda)'],
      ['/social/profiles/uid-x0', 'Ficha de un NO amigo'],
      ['/social/profiles/no-existe', 'Perfil inexistente (ruta manipulada)'],
    ];

    console.warn('\n════ RECORRIDO DE PANTALLAS ════');
    for (const [ruta, titulo] of RUTAS) {
      const errores: string[] = [];
      const errorOriginal = console.error;
      console.error = (...args: unknown[]) => { errores.push(String(args[0])); };

      const { unmount } = abrirHub(ruta);
      await act(async () => { await new Promise((r) => setTimeout(r, 700)); });

      const texto = (document.body.textContent || '').replace(/\s+/g, ' ').trim();
      // OJO: el `h1` del hub lo pinta `App` (sr-only, por sección), no el hub. Aquí se monta el hub aislado, así
      // que se comprueba el encabezado PROPIO de la pantalla, que es lo que sí es responsabilidad suya.
      const encabezado = document.querySelector('h2, h3')?.textContent?.trim() || '—';
      // Controles sin nombre accesible: ni texto propio, ni aria-label, ni title.
      const mudos = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter((el) => {
        const nombre = (el.textContent || '').trim()
          || el.getAttribute('aria-label')
          || el.getAttribute('title')
          || (el as HTMLInputElement).labels?.[0]?.textContent
          || (el.getAttribute('aria-labelledby') ? 'ref' : '');
        return !nombre;
      }).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
      // El error boundary del hub pinta su propio aviso; si aparece, la pantalla no ha renderizado.
      const roto = /Algo ha ido mal|no se ha podido cargar|Vuelve a intentarlo/i.test(texto);

      console.warn(
        `\n· ${titulo}  [${ruta}]`
        + `\n    encabezado: ${encabezado}`
        + `\n    ${roto ? '✗ CAE EN EL ERROR BOUNDARY' : '✓ renderiza'}`
        + `  · controles sin nombre: ${mudos.length}${mudos.length ? ' → ' + JSON.stringify(mudos.slice(0, 6)) : ''}`
        + `  · errores de consola: ${errores.length}${errores.length ? ' → ' + JSON.stringify(errores.slice(0, 2)) : ''}`
        + `\n    contenido: ${texto.slice(0, 220)}`,
      );

      console.error = errorOriginal;
      unmount();
    }
  }, 60_000);
});
