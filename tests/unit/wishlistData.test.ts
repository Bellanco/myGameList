import { describe, expect, it } from 'vitest';
import { normalizeData } from '../../src/model/repository/localRepository';
import { migrateData } from '../../src/model/repository/migrateRepository';
import { mergeCrdt } from '../../src/model/repository/syncRepository';
import { buildGamesMainFile, leanTabData } from '../../src/model/repository/socialProjection';
import { unwrapGamesFile } from '../../src/model/migration/legacyGamesFormat';
import { assertValidGamesGist, inspectGamesGist } from '../../src/model/schemas/gamesGistSchema';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';
import { normalizeSocialGistForTests, type SocialGistData } from '../../src/model/repository/socialGistRepository';
import { decideReviewPublication } from '../../src/core/social/reviewPublication';
import { buildLibraryIndex, findInLibrary } from '../../src/core/premios/library';
import { buildListsPool } from '../../src/core/roulette/roulette';
import { tagFieldForTab } from '../../src/core/utils/tagMutations';
import { TAB_ORDER } from '../../src/core/constants/labels';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * FASE 0 DE LA LISTA DE DESEOS (`d`): la versión que aprende a LEERLA sin enseñarla todavía.
 *
 * El motivo de partirlo en dos versiones es el que estas pruebas vigilan: un cliente que no conoce una lista la
 * descarta al leer el gist y lo reescribe sin sus juegos. Así que antes de dejar llenarla, todos los aparatos
 * tienen que tener una versión que la conserve en cada paso del camino —normalizar, fusionar, empaquetar el gist
 * y validarlo— y que la deje fuera de lo que mide lo jugado o lo que se tiene.
 */

const DESEADO_TS = 1_780_000_000_000;

const juego = (extra: Partial<GameItem> = {}): GameItem =>
  ({
    id: 1,
    _ts: DESEADO_TS,
    name: 'Silksong',
    platforms: ['Switch 2'],
    genres: ['Metroidvania'],
    steamDeck: false,
    review: '',
    ...extra,
  }) as GameItem;

const biblioteca = (parcial: Partial<TabData>): TabData => ({
  c: [],
  v: [],
  e: [],
  p: [],
  d: [],
  deleted: [],
  updatedAt: 1,
  ...parcial,
});

describe('deseos en el estado local', () => {
  it('migrar y normalizar conservan la lista y sellan su entrada', () => {
    const normal = normalizeData(migrateData({ c: [], v: [], e: [], p: [], d: [juego({ listedAt: DESEADO_TS })] }));

    expect(normal.d.map((game) => game.name)).toEqual(['Silksong']);
    expect(normal.d[0].enteredAt).toEqual({ d: DESEADO_TS });
  });

  it('un estado anterior a la lista se lee con la lista vacía, no con un hueco', () => {
    const normal = normalizeData(migrateData({ c: [juego()], v: [], e: [], p: [] }));

    expect(normal.d).toEqual([]);
  });

  it('el id de un deseo no choca con el de otra lista', () => {
    const normal = normalizeData(biblioteca({ c: [juego({ id: 4, name: 'Hades' })], d: [juego({ id: 4 })] }));

    expect(normal.c[0].id).not.toBe(normal.d[0].id);
  });
});

describe('deseos en la sincronización', () => {
  it('la fusión no pierde un deseo que solo tiene un lado', () => {
    const local = biblioteca({ d: [juego()] });
    const remoto = biblioteca({});

    const { merged, remoteNeedsUpdate } = mergeCrdt(local, 1, remoto, 1);

    expect(merged.d.map((game) => game.id)).toEqual([1]);
    expect(remoteNeedsUpdate).toBe(true);
  });

  it('pasar de deseos a próximos en otro aparato gana por reloj, sin duplicar el juego', () => {
    const local = biblioteca({ d: [juego({ _ts: DESEADO_TS })] });
    const remoto = biblioteca({ p: [juego({ _ts: DESEADO_TS + 1 })] });

    const { merged } = mergeCrdt(local, 1, remoto, 1);

    expect(merged.d).toEqual([]);
    expect(merged.p.map((game) => game.id)).toEqual([1]);
  });

  it('el gist magro, el envoltorio v4 y su lectura conservan la lista', () => {
    const data = biblioteca({ c: [juego({ id: 2, name: 'Hades' })], d: [juego()] });

    const lean = leanTabData(data);
    expect(lean.d.map((game) => game.id)).toEqual([1]);
    expect(() => assertValidGamesGist(lean)).not.toThrow();

    const leido = unwrapGamesFile(buildGamesMainFile(data)) as TabData;
    expect(leido.d.map((game) => game.name)).toEqual(['Silksong']);
    expect(leido.c.map((game) => game.name)).toEqual(['Hades']);
  });

  it('un envoltorio con SOLO deseos se puede leer (antes no era reconstruible)', () => {
    const leido = unwrapGamesFile(buildGamesMainFile(biblioteca({ d: [juego()] }))) as TabData;

    expect(leido.d).toHaveLength(1);
  });

  it('el esquema acepta el sello de entrada en deseos y no exige la lista a un gist anterior', () => {
    expect(() => assertValidGamesGist(leanTabData(biblioteca({ p: [juego({ enteredAt: { d: 1, p: 2 } })] })))).not.toThrow();

    const sinDeseos = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1 };
    expect(inspectGamesGist(sinDeseos).valid).toBe(true);
  });
});

describe('deseos en el canal social', () => {
  const gistSocial = (): SocialGistData => ({
    profile: {
      name: 'Autor',
      private: false,
      visibility: { hiddenTabs: ['d'], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    moves: [{ id: 'm-1-d', gameId: 1, gameName: 'Silksong', tab: 'd', at: DESEADO_TS }],
    updatedAt: 1000,
    schemaVersion: 2,
  });

  it('el esquema de escritura admite la lista oculta y sus mensajes (si no, la subida entera se aborta)', () => {
    expect(() => assertValidSocialGist(gistSocial())).not.toThrow();
  });

  it('la lectura conserva la lista oculta y los mensajes de deseos', () => {
    const leido = normalizeSocialGistForTests(gistSocial());

    expect(leido.profile.visibility.hiddenTabs).toEqual(['d']);
    expect(leido.moves?.map((move) => move.tab)).toEqual(['d']);
  });
});

describe('deseos no es la biblioteca', () => {
  it('no se publica reseña desde deseos (no se ha jugado)', () => {
    const decision = decideReviewPublication({
      tab: 'd',
      previous: undefined,
      next: { name: 'Silksong', review: 'Lo quiero ya.', score: 5, grade: 100 },
    });

    expect(decision.kind).toBe('none');
  });

  it('premios no lo cuenta como juego de tus listas', () => {
    const index = buildLibraryIndex(biblioteca({ d: [juego()] }));

    expect(findInLibrary(index, 'Silksong')).toBeNull();
  });

  it('la ruleta de tus listas no lo saca: no se puede jugar lo que no se tiene', () => {
    expect(buildListsPool(biblioteca({ d: [juego()] }))).toEqual([]);

    // Ni mezclado con el resto ni con las marcas que meten un juego en la ruleta («rejugar», «otra oportunidad»).
    const pool = buildListsPool(biblioteca({
      c: [juego({ id: 2, name: 'Hades', replayable: true })],
      v: [juego({ id: 3, name: 'Nioh', retry: true })],
      p: [juego({ id: 4, name: 'Ori' })],
      d: [juego({ id: 5, replayable: true, retry: true })],
    }));
    expect(pool.map((candidate) => candidate.sourceTab)).toEqual(['c', 'v', 'p']);
    expect(pool.some((candidate) => candidate.game.id === 5)).toBe(false);
  });

  it('no tiene puntos fuertes ni débiles que renombrar', () => {
    expect(tagFieldForTab('d', 'strengths')).toBeNull();
    expect(tagFieldForTab('d', 'weaknesses')).toBeNull();
    expect(tagFieldForTab('d', 'genres')).toBe('genres');
  });
});

describe('la interfaz la enseña', () => {
  it('es la última pestaña, a la derecha de Próximos', () => {
    expect(TAB_ORDER).toEqual(['c', 'v', 'e', 'p', 'd']);
  });
});
