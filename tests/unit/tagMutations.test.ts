import { describe, it, expect } from 'vitest';
import { mapTabDataTags, tagFieldForTab } from '../../src/core/utils/tagMutations';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(id: number, fields: Partial<GameItem> = {}): GameItem {
  return {
    id,
    _ts: 1,
    name: `Game ${id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    strengths: ['Historia'],
    weaknesses: ['Bugs'],
    reasons: ['Aburrido'],
    ...fields,
  };
}

function data(): TabData {
  return {
    c: [game(1)],
    v: [game(2)],
    e: [game(3)],
    p: [game(4)],
    deleted: [],
    updatedAt: 1,
  };
}

const TS = 5_000;
const drop = (target: string) => (values: string[]) => values.filter((v) => v.toLowerCase() !== target.toLowerCase());

describe('tagFieldForTab — mapeo categoría→campo por pestaña', () => {
  it('genres/platforms están en todas las pestañas', () => {
    for (const tab of ['c', 'v', 'e', 'p'] as const) {
      expect(tagFieldForTab(tab, 'genres')).toBe('genres');
      expect(tagFieldForTab(tab, 'platforms')).toBe('platforms');
    }
  });

  it('strengths está salvo en p', () => {
    expect(tagFieldForTab('c', 'strengths')).toBe('strengths');
    expect(tagFieldForTab('v', 'strengths')).toBe('strengths');
    expect(tagFieldForTab('e', 'strengths')).toBe('strengths');
    expect(tagFieldForTab('p', 'strengths')).toBeNull();
  });

  it('weaknesses: weaknesses en c/e, reasons en v, nada en p', () => {
    expect(tagFieldForTab('c', 'weaknesses')).toBe('weaknesses');
    expect(tagFieldForTab('e', 'weaknesses')).toBe('weaknesses');
    expect(tagFieldForTab('v', 'weaknesses')).toBe('reasons');
    expect(tagFieldForTab('p', 'weaknesses')).toBeNull();
  });
});

describe('mapTabDataTags', () => {
  it('marca _ts y updatedAt = ts en todos los juegos/pestañas', () => {
    const out = mapTabDataTags(data(), 'genres', drop('RPG'), TS);
    expect(out.updatedAt).toBe(TS);
    for (const tab of ['c', 'v', 'e', 'p'] as const) {
      expect(out[tab].every((g) => g._ts === TS)).toBe(true);
    }
  });

  it('genres: filtra el género en todas las pestañas, sin tocar otros campos', () => {
    const out = mapTabDataTags(data(), 'genres', drop('RPG'), TS);
    for (const tab of ['c', 'v', 'e', 'p'] as const) {
      expect(out[tab][0].genres).toEqual([]);
      expect(out[tab][0].platforms).toEqual(['Steam']);
    }
  });

  it('strengths: toca c/v/e pero NO p', () => {
    const out = mapTabDataTags(data(), 'strengths', drop('Historia'), TS);
    expect(out.c[0].strengths).toEqual([]);
    expect(out.v[0].strengths).toEqual([]);
    expect(out.e[0].strengths).toEqual([]);
    expect(out.p[0].strengths).toEqual(['Historia']); // p no tiene strengths → intacto
  });

  it('weaknesses: filtra `weaknesses` en c/e, `reasons` en v, y no toca p ni el `weaknesses` de v', () => {
    const out = mapTabDataTags(data(), 'weaknesses', drop('Bugs'), TS);
    expect(out.c[0].weaknesses).toEqual([]);
    expect(out.e[0].weaknesses).toEqual([]);
    // En 'v' la categoría weaknesses vive en `reasons`; `Bugs` no está en reasons → reasons intacto, weaknesses intacto.
    expect(out.v[0].reasons).toEqual(['Aburrido']);
    expect(out.v[0].weaknesses).toEqual(['Bugs']);
    expect(out.p[0].weaknesses).toEqual(['Bugs']);
  });

  it("weaknesses en 'v' opera sobre `reasons`", () => {
    const out = mapTabDataTags(data(), 'weaknesses', drop('Aburrido'), TS);
    expect(out.v[0].reasons).toEqual([]);
    expect(out.v[0].weaknesses).toEqual(['Bugs']); // el campo weaknesses de v no se toca
  });

  it('soporta transform de renombrado (replace + dedup)', () => {
    const rename = (values: string[]) => values.map((v) => (v === 'RPG' ? 'Acción' : v));
    const out = mapTabDataTags(data(), 'genres', rename, TS);
    expect(out.c[0].genres).toEqual(['Acción']);
  });

  it('no muta el TabData original', () => {
    const input = data();
    mapTabDataTags(input, 'genres', drop('RPG'), TS);
    expect(input.c[0].genres).toEqual(['RPG']);
    expect(input.updatedAt).toBe(1);
  });
});
