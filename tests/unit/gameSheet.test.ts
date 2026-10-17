import { describe, expect, it } from 'vitest';
import { gameSheetSearch, gameSheetSlug, matchesGameSheet, ownGameSheetTab } from '../../src/core/utils/gameSheetPath';
import {
  buildGameSheet,
  entriesForGame,
  SAME_GENRE_MAX,
  findOwnEntry,
  signalGameName,
  type GameSheetFriendRef,
  type GameSheetSignal,
} from '../../src/core/gameSheet/buildGameSheet';
import { applyProfileVisibility } from '../../src/core/utils/profileVisibility';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { SocialProfileVisibility } from '../../src/model/types/social';

function juego(id: number, name: string, extra: Partial<GameItem> = {}): GameItem {
  return { id, _ts: 1, name, platforms: ['Steam'], genres: [], steamDeck: false, review: '', ...extra };
}

function biblioteca(parcial: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0, ...parcial };
}

const marta: GameSheetFriendRef = { id: 'marta', name: 'Marta' };
const nacho: GameSheetFriendRef = { id: 'nacho', name: 'Nacho' };
const lucia: GameSheetFriendRef = { id: 'lucia', name: 'Lucía' };

const visible: SocialProfileVisibility = {
  hiddenTabs: [],
  hideReplayable: false,
  hideRetry: false,
  hideGameTime: false,
  showPhoto: true,
};

describe('gameSheetPath', () => {
  it('da la misma clave a romanos y arábigos, acentos, «The» y sufijos de edición', () => {
    expect(gameSheetSlug('Hades II')).toBe(gameSheetSlug('Hades 2'));
    expect(gameSheetSlug('Pokémon Cristal')).toBe(gameSheetSlug('Pokemon Cristal'));
    expect(gameSheetSlug('The Witcher 3')).toBe(gameSheetSlug('Witcher III'));
    expect(gameSheetSlug('Tomb Raider Game of the Year Edition')).toBe(gameSheetSlug('Tomb Raider'));
  });

  it('separa las palabras con guiones y no deja espacios', () => {
    expect(gameSheetSlug('Hollow Knight: Silksong')).toBe('hollow-knight-silksong');
  });

  it('arma el parámetro de búsqueda', () => {
    expect(gameSheetSearch('Hollow Knight: Silksong')).toBe('?juego=hollow-knight-silksong');
  });

  it('reconoce un nombre por su clave y no casa con una vacía', () => {
    expect(matchesGameSheet('hades-2', 'Hades II')).toBe(true);
    expect(matchesGameSheet('hades-2', 'Hades')).toBe(false);
    expect(matchesGameSheet('', '')).toBe(false);
  });

  it('dice en qué lista tienes el juego, con el orden de `findOwnEntry`, y nada sin clave', () => {
    const datos = biblioteca({ e: [juego(1, 'Hades II')], d: [juego(2, 'Hades 2')] });
    expect(ownGameSheetTab(datos, 'hades-2')).toBe('e');
    expect(ownGameSheetTab(datos, 'hades-2')).toBe(findOwnEntry(datos, 'hades-2')?.tab);
    expect(ownGameSheetTab(datos, 'celeste')).toBeNull();
    expect(ownGameSheetTab(datos, '')).toBeNull();
  });
});

describe('findOwnEntry y entriesForGame', () => {
  it('encuentra el juego propio en cualquier lista, también en deseados', () => {
    const own = biblioteca({ d: [juego(1, 'Hades II')] });
    expect(findOwnEntry(own, 'hades-2')).toEqual({ tab: 'd', item: own.d[0] });
    expect(findOwnEntry(own, 'celeste')).toBeNull();
  });

  it('respeta la visibilidad: una lista oculta no aporta entradas', () => {
    const ajena = biblioteca({ c: [juego(1, 'Celeste')], v: [juego(2, 'Celeste')] });
    const filtrada = applyProfileVisibility(ajena, { ...visible, hiddenTabs: ['c'] });
    expect(entriesForGame(filtrada, 'celeste').map((e) => e.tab)).toEqual(['v']);
  });

  it('las horas ocultas no salen', () => {
    const ajena = biblioteca({ c: [juego(1, 'Celeste', { hours: 14 })] });
    const filtrada = applyProfileVisibility(ajena, { ...visible, hideGameTime: true });
    expect(entriesForGame(filtrada, 'celeste')[0].item.hours).toBeNull();
  });
});

describe('signalGameName', () => {
  it('es el nombre de la primera amistad que nombra el juego, como lo escribe ella', () => {
    const senales: GameSheetSignal[] = [
      { kind: 'review', friend: marta, gameName: 'Hades', grade: 90, snippet: '', at: 3 },
      { kind: 'move', friend: nacho, gameName: 'Outer Wilds', tab: 'p', at: 2 },
      { kind: 'library', friend: lucia, tab: 'c', item: juego(9, 'OUTER WILDS') },
    ];
    expect(signalGameName('outer-wilds', senales)).toBe('Outer Wilds');
    expect(signalGameName('celeste', senales)).toBeNull();
  });
});

describe('buildGameSheet', () => {
  const own = biblioteca({
    c: [juego(1, 'Hollow Knight', { grade: 92, score: 5 })],
    d: [juego(2, 'Hollow Knight: Silksong', { grade: 80, score: 4 })],
  });

  it('usa el nombre de la entrada propia y la encuentra', () => {
    const sheet = buildGameSheet({ slug: 'hollow-knight', own, signals: [] });
    expect(sheet.name).toBe('Hollow Knight');
    expect(sheet.own?.tab).toBe('c');
  });

  it('sin entrada propia, toma el nombre de lo que llega de las amistades', () => {
    const signals: GameSheetSignal[] = [{ kind: 'move', friend: marta, gameName: 'Outer Wilds', tab: 'e', at: 5 }];
    const sheet = buildGameSheet({ slug: 'outer-wilds', own, signals });
    expect(sheet.own).toBeNull();
    expect(sheet.name).toBe('Outer Wilds');
    expect(sheet.friends.map((f) => [f.name, f.tab])).toEqual([['Marta', 'e']]);
  });

  it('junta lo que llega de una misma amistad: la biblioteca manda en la lista y la reseña pone el adelanto', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'move', friend: marta, gameName: 'Hollow Knight', tab: 'e', at: 1 },
      { kind: 'library', friend: marta, tab: 'c', item: juego(9, 'Hollow Knight', { grade: 98, finishedOn: '2023-05' } as Partial<GameItem>) },
      { kind: 'review', friend: marta, gameName: 'Hollow Knight', grade: 98, snippet: 'Mi favorito', at: 2 },
    ];
    const [friend] = buildGameSheet({ slug: 'hollow-knight', own, signals }).friends;
    expect(friend).toMatchObject({ id: 'marta', tab: 'c', grade: 98, snippet: 'Mi favorito', finishedOn: '2023-05' });
  });

  it('sin biblioteca, el último aviso de lista decide dónde está', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'move', friend: nacho, gameName: 'Hades', tab: 'p', at: 1 },
      { kind: 'move', friend: nacho, gameName: 'Hades', tab: 'e', at: 3 },
      { kind: 'move', friend: nacho, gameName: 'Hades', tab: 'c', at: 2 },
    ];
    expect(buildGameSheet({ slug: 'hades', own, signals }).friends[0].tab).toBe('e');
  });

  it('ordena con reseña primero y después por nota', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'library', friend: nacho, tab: 'c', item: juego(1, 'Hades', { grade: 99 }) },
      { kind: 'library', friend: marta, tab: 'c', item: juego(2, 'Hades', { grade: 70 }) },
      { kind: 'review', friend: marta, gameName: 'Hades', grade: 70, snippet: 'Bien', at: 1 },
      { kind: 'library', friend: lucia, tab: 'c', item: juego(3, 'Hades', { grade: 85 }) },
    ];
    expect(buildGameSheet({ slug: 'hades', own, signals }).friends.map((f) => f.name)).toEqual(['Marta', 'Nacho', 'Lucía']);
  });

  it('la media sale con las notas que haya y dice cuántas son', () => {
    const una: GameSheetSignal[] = [{ kind: 'library', friend: marta, tab: 'c', item: juego(1, 'Hades', { grade: 90 }) }];
    expect(buildGameSheet({ slug: 'hades', own, signals: una }).average).toEqual({ grade: 90, count: 1 });
    const dos: GameSheetSignal[] = [...una, { kind: 'library', friend: nacho, tab: 'c', item: juego(2, 'Hades', { grade: 81 }) }];
    expect(buildGameSheet({ slug: 'hades', own, signals: dos }).average).toEqual({ grade: 86, count: 2 });
    expect(buildGameSheet({ slug: 'hades', own, signals: [] }).average).toBeNull();
  });

  it('en abandonados solo cuenta la nota si se puntuó, y en curso nunca', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'library', friend: marta, tab: 'v', item: juego(1, 'Hades', { grade: 40 }) },
      { kind: 'library', friend: nacho, tab: 'v', item: juego(2, 'Hades', { grade: 30, scored: true }) },
      { kind: 'library', friend: lucia, tab: 'e', item: juego(3, 'Hades', { score: 0 }) },
    ];
    const sheet = buildGameSheet({ slug: 'hades', own, signals });
    expect(sheet.friends.find((f) => f.id === 'marta')?.grade).toBeNull();
    expect(sheet.friends.find((f) => f.id === 'lucia')?.grade).toBeNull();
    expect(sheet.average).toEqual({ grade: 30, count: 1 });
  });

  it('los deseados de las amistades van aparte y sin nota', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'library', friend: marta, tab: 'd', item: juego(1, 'Hades', { grade: 80 }) },
      { kind: 'library', friend: nacho, tab: 'c', item: juego(2, 'Hades', { grade: 90 }) },
    ];
    const sheet = buildGameSheet({ slug: 'hades', own, signals });
    expect(sheet.friends.map((f) => f.id)).toEqual(['nacho']);
    expect(sheet.wishers).toEqual([expect.objectContaining({ id: 'marta', grade: null })]);
    expect(sheet.average).toEqual({ grade: 90, count: 1 });
  });

  it('la saga junta lo propio y lo de las amistades, marca el juego actual y no repite', () => {
    const signals: GameSheetSignal[] = [
      { kind: 'library', friend: marta, tab: 'c', item: juego(1, 'Hollow Knight') },
      { kind: 'library', friend: nacho, tab: 'c', item: juego(2, 'Hollow Knight') },
      { kind: 'library', friend: nacho, tab: 'd', item: juego(3, 'Hollow Knight: Silksong') },
    ];
    const saga = buildGameSheet({ slug: 'hollow-knight', own, signals }).saga;
    expect(saga).toEqual([
      { slug: 'hollow-knight', name: 'Hollow Knight', platforms: ['Steam'], ownTab: 'c', friendCount: 2, current: true },
      { slug: 'hollow-knight-silksong', name: 'Hollow Knight: Silksong', platforms: ['Steam'], ownTab: 'd', friendCount: 0, current: false },
    ]);
  });

  it('sin otra entrega, no hay saga', () => {
    expect(buildGameSheet({ slug: 'celeste', own: biblioteca({ c: [juego(1, 'Celeste')] }), signals: [] }).saga).toEqual([]);
  });

  it('no emparenta títulos que solo comparten una palabra suelta', () => {
    const conDead = biblioteca({ c: [juego(1, 'Dead Space'), juego(2, 'Dead Cells')] });
    expect(buildGameSheet({ slug: 'dead-space', own: conDead, signals: [] }).saga).toEqual([]);
  });

  it('sin saga, Más de «<género>»: los candidatos de «¿A qué juego ahora?» de su género principal, en su orden', () => {
    const accion = (id: number, name: string, extra: Partial<GameItem> = {}) => juego(id, name, { genres: ['Acción'], ...extra });
    const own = biblioteca({
      d: [accion(1, "Marvel's Spider-Man", { genres: ['Acción', 'Mundo abierto'] }), accion(2, 'Otro deseo')],
      p: [accion(3, 'Próximo flojo', { grade: 50 }), accion(4, 'Próximo bueno', { grade: 90 }), juego(5, 'Próximo de otro género', { genres: ['RPG'], grade: 99 })],
      c: [accion(6, 'Completado sin rejugar', { grade: 100 }), accion(7, 'Completado para rejugar', { grade: 100, replayable: true })],
      v: [accion(8, 'Abandonado con otra oportunidad', { retry: true })],
    });
    const sheet = buildGameSheet({ slug: gameSheetSlug("Marvel's Spider-Man"), own, signals: [] });
    expect(sheet.sameGenre?.genre).toBe('Acción');
    // El peso de la ruleta (nota² × lista): 90 en próximos (70,9), 100 en completados (25), la vergüenza con su nota
    // neutra (24,5) y 50 en próximos (21,9). Ni deseos, ni completados sin «rejugar», ni el propio juego.
    expect(sheet.sameGenre?.games.map((game) => [game.name, game.ownTab])).toEqual([
      ['Próximo bueno', 'p'],
      ['Completado para rejugar', 'c'],
      ['Abandonado con otra oportunidad', 'v'],
      ['Próximo flojo', 'p'],
    ]);
  });

  it('Más de «<género>» solo sin saga, con tope y nada si no hay ninguno', () => {
    const accion = (id: number, name: string) => juego(id, name, { genres: ['Acción'] });
    const muchos = biblioteca({ c: [accion(1, 'Hollow Knight'), accion(2, 'Hollow Knight: Silksong')], p: ['Celeste', 'Hades', 'Inside', 'Limbo', 'Tunic', 'Cuphead', 'Ori', 'Gris', 'Braid', 'Fez'].map((name, i) => accion(10 + i, name)) });
    expect(buildGameSheet({ slug: 'hollow-knight', own: muchos, signals: [] }).sameGenre).toBeNull();
    expect(buildGameSheet({ slug: 'celeste', own: muchos, signals: [] }).sameGenre?.games).toHaveLength(SAME_GENRE_MAX);
    const solo = biblioteca({ c: [accion(1, 'Celeste')] });
    expect(buildGameSheet({ slug: 'celeste', own: solo, signals: [] }).sameGenre).toBeNull();
  });
});
