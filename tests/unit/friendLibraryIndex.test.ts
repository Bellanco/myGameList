import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { SocialProfileVisibility } from '../../src/model/types/social';

// EL ÍNDICE DE LAS BIBLIOTECAS DE TUS AMISTADES (F4 del plan de la ficha). Lee el gist de listados de cada amistad, que
// lleva la biblioteca entera: lo que importa aquí es que nunca se lea a quien no es amistad (regla 1), que lo que
// esconde cada cual no salga (regla 2) y que dentro del plazo del rango no se pregunte a GitHub (regla 3).

const repo = vi.hoisted(() => ({
  config: { gistId: 'gist-social', token: 'tkn' } as { gistId: string; token: string } | null,
  copia: null as { entries: unknown[]; friendsKey?: string } | null,
  meta: { uid: 'u-yo', profileId: 'p-yo' },
  guardadas: {} as Record<string, { games: TabData; cachedAt: number }>,
  leidas: [] as string[],
  remotas: {} as Record<string, TabData | Error>,
}));

vi.mock('../../src/model/repository/gistConfigRepository', () => ({
  getSocialSyncConfig: () => repo.config,
  ensureSyncConfigLoaded: () => Promise.resolve(),
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  peekCachedSocialDirectory: () => Promise.resolve(repo.copia),
  getLocalMeta: () => Promise.resolve(repo.meta),
  getCachedProfileGamesEntry: (profileId: string) => {
    const guardada = repo.guardadas[profileId];
    return Promise.resolve(guardada ? { ...guardada, etag: 'e', fresh: true } : null);
  },
}));
vi.mock('../../src/model/repository/foreignProfileRepository', () => ({
  loadForeignProfileGames: ({ profileId }: { profileId: string }) => {
    repo.leidas.push(profileId);
    const remota = repo.remotas[profileId];
    return remota instanceof Error ? Promise.reject(remota) : Promise.resolve(remota ?? null);
  },
}));

const { librarySignals, loadFriendGameEntry, loadFriendLibraryIndex, planFriendIndex, resetFriendLibraryIndexForTests } = await import(
  '../../src/viewmodel/gameSheet/friendLibraryIndex'
);

const HORA = 60 * 60 * 1000;
const visible: SocialProfileVisibility = { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true };

function juego(id: number, name: string, extra: Partial<GameItem> = {}): GameItem {
  return { id, _ts: 1, name, platforms: ['PC'], genres: [], steamDeck: false, review: '', ...extra };
}

function biblioteca(parcial: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0, ...parcial };
}

function entrada(uid: string, extra: object = {}) {
  return { id: `p-${uid}`, uid, displayName: uid, gamesGistId: `g-${uid}`, visibility: visible, ...extra };
}

const yo = entrada('yo', { tier: 'silver' });
const huella = (...amistades: string[]) => ['p-yo', ...amistades.map((uid) => `${uid}:s:g:1`)].join('|');

describe('planFriendIndex', () => {
  it('solo tus amistades: quien no lo es no entra, aunque esté en la copia (regla 1)', () => {
    const plan = planFriendIndex([yo, entrada('marta'), entrada('nadie')], new Set(['marta']), ['yo']);
    expect(plan.friends.map((f) => f.friend.name)).toEqual(['marta']);
  });

  it('el plazo es el de tu rango; en bronce, o sin saber quién eres, no hay índice', () => {
    expect(planFriendIndex([yo, entrada('marta')], new Set(['marta']), ['yo']).ttlMs).toBe(24 * HORA);
    expect(planFriendIndex([entrada('yo', { tier: 'mithril' })], new Set(), ['p-yo']).ttlMs).toBe(30 * 60 * 1000);
    expect(planFriendIndex([entrada('yo', { tier: 'bronze' }), entrada('marta')], new Set(['marta']), ['yo'])).toEqual({ ttlMs: null, friends: [] });
    expect(planFriendIndex([yo, entrada('marta')], new Set(['marta']), [])).toEqual({ ttlMs: null, friends: [] });
  });

  it('sin huella de amistades no hay índice: para la biblioteca entera hay que estar seguro', () => {
    expect(planFriendIndex([yo, entrada('marta')], null, ['yo']).friends).toEqual([]);
  });

  it('fuera quien está inactivo o no tiene gist de listados; si no se sabe qué esconde, todo oculto', () => {
    const plan = planFriendIndex(
      [yo, entrada('dormido', { socialSkipped: true }), entrada('singist', { gamesGistId: '' }), entrada('ilegible', { socialUnreadable: true })],
      new Set(['dormido', 'singist', 'ilegible']),
      ['yo'],
    );
    expect(plan.friends.map((f) => f.friend.name)).toEqual(['ilegible']);
    expect(plan.friends[0].visibility.hiddenTabs.length).toBeGreaterThan(0);
  });
});

describe('librarySignals', () => {
  it('cada juego visible es una señal de biblioteca; lo que esconde su dueño no sale (regla 2)', () => {
    const [marta] = planFriendIndex([yo, entrada('marta', { visibility: { ...visible, hiddenTabs: ['v'] } })], new Set(['marta']), ['yo']).friends;
    const signals = librarySignals(marta, biblioteca({ c: [juego(1, 'Celeste')], v: [juego(2, 'Oculto')] }));
    expect(signals.map((s) => (s.kind === 'library' ? `${s.tab}:${s.item.name}` : ''))).toEqual(['c:Celeste']);
  });
});

describe('loadFriendLibraryIndex', () => {
  beforeEach(() => {
    resetFriendLibraryIndexForTests();
    repo.config = { gistId: 'gist-social', token: 'tkn' };
    repo.copia = { entries: [yo, entrada('marta'), entrada('nacho'), entrada('nadie')], friendsKey: huella('marta', 'nacho') };
    repo.guardadas = {};
    repo.leidas = [];
    repo.remotas = {
      'p-marta': biblioteca({ c: [juego(1, 'Celeste')] }),
      'p-nacho': biblioteca({ p: [juego(2, 'Hades')] }),
      'p-nadie': biblioteca({ c: [juego(3, 'No debe leerse')] }),
    };
  });
  afterEach(() => vi.useRealTimers());

  it('lee las bibliotecas de tus amistades y nunca la de quien no lo es (regla 1)', async () => {
    const indice = await loadFriendLibraryIndex();
    expect(repo.leidas.sort()).toEqual(['p-marta', 'p-nacho']);
    expect(indice.signals.map((s) => (s.kind === 'library' ? s.item.name : ''))).toEqual(['Celeste', 'Hades']);
    expect(indice.missing).toBe(0);
  });

  it('dentro del plazo de tu rango no pregunta a GitHub: sirve la guardada (regla 3)', async () => {
    repo.guardadas['p-marta'] = { games: biblioteca({ c: [juego(9, 'Guardado')] }), cachedAt: Date.now() - HORA };
    repo.guardadas['p-nacho'] = { games: biblioteca(), cachedAt: Date.now() - 25 * HORA };
    const indice = await loadFriendLibraryIndex();
    expect(repo.leidas).toEqual(['p-nacho']);
    expect(indice.signals.map((s) => (s.kind === 'library' ? s.item.name : ''))).toEqual(['Guardado', 'Hades']);
  });

  it('lo que no se pudo leer se cuenta y no da error', async () => {
    repo.remotas['p-nacho'] = new Error('sin red');
    const indice = await loadFriendLibraryIndex();
    expect(indice.missing).toBe(1);
    expect(indice.signals).toHaveLength(1);
  });

  it('en la misma sesión, mientras no venza el plazo, no vuelve a leer', async () => {
    await loadFriendLibraryIndex();
    repo.leidas = [];
    await loadFriendLibraryIndex();
    expect(repo.leidas).toEqual([]);
  });

  it('sin espacio social, o en bronce, no lee nada', async () => {
    repo.copia = { entries: [entrada('yo', { tier: 'bronze' }), entrada('marta')], friendsKey: huella('marta') };
    expect(await loadFriendLibraryIndex()).toEqual({ signals: [], missing: 0 });
    repo.config = null;
    expect(await loadFriendLibraryIndex()).toEqual({ signals: [], missing: 0 });
    expect(repo.leidas).toEqual([]);
  });
});

// EL BLOQUE DE LA AMISTAD (F0.7): lo que tiene de ESE juego, con las mismas reglas que el índice.
describe('loadFriendGameEntry', () => {
  beforeEach(() => {
    repo.config = { gistId: 'gist-social', token: 'tkn' };
    repo.copia = {
      entries: [yo, entrada('marta', { visibility: { ...visible, hiddenTabs: ['v'] } }), entrada('nadie')],
      friendsKey: huella('marta'),
    };
    repo.guardadas = {};
    repo.leidas = [];
    repo.remotas = {};
  });

  it('con su biblioteca guardada, sin red: su entrada de ese juego, y sus listas ocultas no cuentan', async () => {
    repo.guardadas['p-marta'] = {
      games: biblioteca({ c: [juego(5, 'Celeste')], v: [juego(6, 'Hades')] }),
      cachedAt: Date.now() - 100 * HORA,
    };
    const celeste = await loadFriendGameEntry('p-marta', 'celeste');
    expect(celeste).toMatchObject({ friend: { id: 'p-marta', name: 'marta' }, tab: 'c', item: { name: 'Celeste' } });
    expect(await loadFriendGameEntry('p-marta', 'hades')).toBeNull();
    expect(repo.leidas).toEqual([]);
  });

  it('sin la guardada, la pide', async () => {
    repo.remotas['p-marta'] = biblioteca({ p: [juego(7, 'Celeste')] });
    expect(await loadFriendGameEntry('p-marta', 'celeste')).toMatchObject({ tab: 'p' });
    expect(repo.leidas).toEqual(['p-marta']);
  });

  it('de quien no es amistad no se lee nada (regla 1)', async () => {
    repo.remotas['p-nadie'] = biblioteca({ c: [juego(8, 'Celeste')] });
    expect(await loadFriendGameEntry('p-nadie', 'celeste')).toBeNull();
    expect(repo.leidas).toEqual([]);
  });
});
