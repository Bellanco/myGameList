import { describe, it, expect } from 'vitest';
import { mapPlayniteExport } from '../../src/core/import/playnite';

describe('mapPlayniteExport', () => {
  it('mapea nombre, géneros (objetos o strings), horas e id', () => {
    const [g] = mapPlayniteExport([
      {
        Name: 'The Witcher 3',
        Source: 'Steam',
        Genres: [{ Name: 'RPG' }, 'Aventura'],
        Platforms: [{ Name: 'PC (Windows)' }],
        Playtime: 7200, // 2 h
        GameId: '292030',
      },
    ]);
    expect(g.name).toBe('The Witcher 3');
    expect(g.genres).toEqual(['RPG', 'Aventura']);
    expect(g.hours).toBe(2);
    expect(g.externalId).toBe('292030');
    expect(g.source).toBe('steam');
  });

  it('regla de plataformas: PC se sustituye por la tienda de origen', () => {
    const [steam] = mapPlayniteExport([{ Name: 'A', Source: 'Steam', Platforms: ['PC (Windows)'] }]);
    expect(steam.platforms).toEqual(['Steam']);
    const [gog] = mapPlayniteExport([{ Name: 'B', Source: 'GOG', Platforms: ['PC (Windows)'] }]);
    expect(gog.platforms).toEqual(['GOG']);
    const [epic] = mapPlayniteExport([{ Name: 'C', Source: 'Epic', Platforms: ['PC (Windows)'] }]);
    expect(epic.platforms).toEqual(['Epic']);
  });

  it('las plataformas de consola se conservan', () => {
    const [g] = mapPlayniteExport([{ Name: 'Bloodborne', Source: 'PlayStation', Platforms: ['Sony PlayStation 4'] }]);
    expect(g.platforms).toEqual(['Sony PlayStation 4']);
    expect(g.source).toBe('psn');
  });

  it('PC sin tienda conocida conserva "PC"', () => {
    const [g] = mapPlayniteExport([{ Name: 'X', Source: 'Otra', Platforms: ['PC (Windows)'] }]);
    expect(g.platforms).toEqual(['PC (Windows)']);
    expect(g.source).toBe('playnite');
  });

  it('CompletionStatus → lista sugerida', () => {
    const rows = mapPlayniteExport([
      { Name: 'a', CompletionStatus: 'Completed' },
      { Name: 'b', CompletionStatus: 'Abandoned' },
      { Name: 'c', CompletionStatus: 'Playing' },
      { Name: 'd', CompletionStatus: 'Plan to Play' },
      { Name: 'e', CompletionStatus: 'No aplica' },
    ]);
    expect(rows.map((r) => r.suggestedTab)).toEqual(['c', 'v', 'e', 'p', undefined]);
  });

  it('UserScore → grade (0–100, redondeado y acotado)', () => {
    const [g] = mapPlayniteExport([{ Name: 'a', UserScore: 87.6 }]);
    expect(g.grade).toBe(88);
    const [h] = mapPlayniteExport([{ Name: 'b', UserScore: 250 }]);
    expect(h.grade).toBe(100);
  });

  it('descarta entradas sin nombre y tolera formas { games: [...] }', () => {
    const rows = mapPlayniteExport({ games: [{ Name: '' }, { name: 'Ok' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ok');
  });

  it('JSON inesperado → []', () => {
    expect(mapPlayniteExport(null)).toEqual([]);
    expect(mapPlayniteExport('nope')).toEqual([]);
    expect(mapPlayniteExport(42)).toEqual([]);
  });
});
