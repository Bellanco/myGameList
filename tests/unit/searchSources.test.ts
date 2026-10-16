import { describe, expect, it } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';
import {
  friendSearchSources,
  gameSearchSources,
  ownReviewSearchSources,
  pageSearchSources,
  pickSearchSources,
} from '../../src/viewmodel/search/searchSources';

// docs/plan-notificaciones-y-buscador.md, B1 — de dónde sale lo que encuentra el buscador, y adónde lleva.

const game = (id: number, name: string, review = ''): GameItem =>
  ({ id, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review }) as GameItem;
const DATA = {
  c: [game(1, 'Hades', 'Una maravilla')],
  v: [],
  e: [game(2, 'Pokémon Escarlata')],
  p: [],
  d: [game(3, 'Hollow Knight: Silksong')],
  deleted: [],
  updatedAt: 0,
} as unknown as TabData;

describe('gameSearchSources', () => {
  it('cada juego abre su ficha; de respaldo, su lista con la ficha abierta', () => {
    const sources = gameSearchSources(DATA, ['c', 'v', 'e', 'p', 'd']);
    expect(sources.find((source) => source.title === 'Pokémon Escarlata')).toMatchObject({
      detail: 'En curso',
      path: '/en-curso?juego=pokemon-escarlata',
      gameSheet: 'Pokémon Escarlata',
    });
  });

  it('sin la lista de deseos activada no salen sus juegos', () => {
    expect(gameSearchSources(DATA, ['c', 'v', 'e', 'p']).map((source) => source.title)).not.toContain('Hollow Knight: Silksong');
  });
});

describe('ownReviewSearchSources', () => {
  it('solo los juegos con reseña, hacia su página en las estadísticas', () => {
    const sources = ownReviewSearchSources(DATA);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ title: 'Hades', detail: 'Tu reseña' });
    expect(sources[0].path).toMatch(/^\/stats\/resenas\/1-[0-9a-z]{6}$/);
  });
});

describe('friendSearchSources', () => {
  const MARTA = {
    id: 'uid-marta',
    uid: 'uid-marta',
    displayName: 'Marta',
    activity: [
      { id: 'pm:7:review', type: 'review', actorProfileId: 'pm', gameId: 7, gameName: 'Celeste' },
      { id: 'pm:8:recommendation', type: 'recommendation', actorProfileId: 'pm', gameId: 8, gameName: 'Antigua' },
    ],
  };
  const DESCONOCIDO = { id: 'uid-x', uid: 'uid-x', displayName: 'Desconocido', activity: [] };
  const YO = { id: 'uid-yo', uid: 'uid-yo', displayName: 'Yo', activity: [{ id: 'y:1:review', type: 'review', actorProfileId: 'y', gameId: 1, gameName: 'Hades' }] };

  it('con huella, solo las amistades; nunca la entrada propia', () => {
    const { reviews, friends } = friendSearchSources([MARTA, DESCONOCIDO, YO], new Set(['uid-marta']), 'uid-yo');
    expect(friends.map((friend) => friend.title)).toEqual(['Marta']);
    expect(friends[0].path).toBe('/social/profiles/uid-marta');
    expect(reviews).toEqual([expect.objectContaining({
      title: 'Celeste',
      detail: 'Reseña de Marta',
      path: '/social/user/pm/game/7/review',
    })]);
  });

  it('sin huella (copia antigua), las entradas con actividad: de un no-amigo no se lee el gist', () => {
    const { friends } = friendSearchSources([MARTA, DESCONOCIDO, YO], null, 'uid-yo');
    expect(friends.map((friend) => friend.title)).toEqual(['Marta']);
  });
});

describe('pageSearchSources', () => {
  it('las pantallas con las mismas puertas que la navegación', () => {
    const sin = pageSearchSources({ visibleTabs: ['c', 'v', 'e', 'p'], hasSocial: false, achievements: true }).map((page) => page.title);
    expect(sin).toContain('Estadísticas');
    expect(sin).toContain('Logros');
    expect(sin).not.toContain('Deseados');
    expect(sin).not.toContain('Perfiles');
    expect(sin).not.toContain('Diseño');
    expect(sin).not.toContain('¿A qué juego ahora?');

    const con = pageSearchSources({ visibleTabs: ['c', 'v', 'e', 'p', 'd'], hasSocial: true, achievements: false }).map((page) => page.title);
    expect(con).toContain('Deseados');
    expect(con).toContain('Perfiles');
    expect(con).toContain('Diseño');
    expect(con).not.toContain('Logros');
    expect(con).toContain('¿A qué juego ahora?');
  });
});

describe('pickSearchSources', () => {
  const conGeneros = (id: number, name: string, genres: string[], extra: Partial<GameItem> = {}): GameItem =>
    ({ ...game(id, name), genres, ...extra }) as GameItem;
  const BIBLIOTECA = {
    c: [conGeneros(1, 'Doom', ['FPS'], { replayable: true }), conGeneros(2, 'Halo', ['FPS'])],
    v: [conGeneros(3, 'Metro', ['FPS'], { retry: true })],
    e: [],
    p: [conGeneros(4, 'Hades', ['Roguelike'])],
    d: [conGeneros(5, 'Quake', ['FPS'])],
    deleted: [],
    updatedAt: 0,
  } as unknown as TabData;

  it('un género por resultado, con cuántos se pueden empezar y hacia la pantalla con él marcado', () => {
    // Halo no cuenta (completado sin «Rejugar») ni Quake (deseados): son los candidatos de la ruleta.
    expect(pickSearchSources(BIBLIOTECA)).toEqual([
      { id: 'pick:genre:FPS', title: 'FPS', detail: '2 opciones para empezar', path: '/elegir?genre=FPS' },
      { id: 'pick:genre:Roguelike', title: 'Roguelike', detail: '1 opción para empezar', path: '/elegir?genre=Roguelike' },
    ]);
  });
});
