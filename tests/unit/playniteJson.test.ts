import { describe, it, expect } from 'vitest';
import { parseJsonLibraryExport } from '../../src/core/import/playniteJson';

const genres = [
  { Id: 'g-rpg', Name: 'Role-playing (RPG)' },
  { Id: 'g-adv', Name: 'Adventure' },
];
const platforms = [
  { Id: 'p-pc', Name: 'PC (Windows)' },
  { Id: 'p-ps4', Name: 'Sony PlayStation 4' },
];
const sources = [
  { Id: 's-steam', Name: 'Steam' },
  { Id: 's-psn', Name: 'PlayStation' },
];
const completionStatuses = [
  { Id: 'c-done', Name: 'Completed' },
  { Id: 'c-abandoned', Name: 'Abandonado' }, // ES para probar el mapeo localizado
];

describe('parseJsonLibraryExport (Json Library Import Export, multi-fichero)', () => {
  it('resuelve GUIDs a nombres, aplica PC→tienda, estado y nota', () => {
    const games = [
      {
        Name: 'The Witcher 3',
        GenreIds: ['g-rpg', 'g-adv'],
        PlatformIds: ['p-pc'],
        SourceId: 's-steam',
        CompletionStatusId: 'c-done',
        Playtime: 360000, // 100 h en segundos
        UserScore: 95,
        GameId: '292030',
      },
    ];
    const [g] = parseJsonLibraryExport({ games, genres, platforms, sources, completionStatuses });
    expect(g.name).toBe('The Witcher 3');
    expect(g.genres).toEqual(['RPG', 'Adventure']); // 'Role-playing (RPG)' → 'RPG'
    expect(g.platforms).toEqual(['Steam']); // PC → tienda (Steam)
    expect(g.source).toBe('steam');
    expect(g.hours).toBe(100);
    expect(g.suggestedTab).toBe('c');
    expect(g.grade).toBe(95);
    expect(g.externalId).toBe('292030');
  });

  it('conserva plataforma de consola y mapea estado en español', () => {
    const games = [
      { Name: 'Bloodborne', PlatformIds: ['p-ps4'], SourceId: 's-psn', CompletionStatusId: 'c-abandoned' },
    ];
    const [g] = parseJsonLibraryExport({ games, genres, platforms, sources, completionStatuses });
    expect(g.platforms).toEqual(['Sony PlayStation 4']);
    expect(g.source).toBe('psn');
    expect(g.suggestedTab).toBe('v'); // "Abandonado" → v
  });

  it('degrada si faltan ficheros de lookup (géneros vacíos, sin romper)', () => {
    const games = [{ Name: 'X', GenreIds: ['g-rpg'], PlatformIds: ['p-pc'], SourceId: 's-steam' }];
    const [g] = parseJsonLibraryExport({ games }); // sin genres/platforms/sources
    expect(g.name).toBe('X');
    expect(g.genres).toEqual([]);
    // sin sources.json no se conoce la tienda → source 'playnite', PC se conserva
    expect(g.source).toBe('playnite');
  });

  it('descarta juegos sin nombre; usa SortingName como respaldo', () => {
    const games = [{ Name: '' }, { SortingName: 'Fallback' }];
    const out = parseJsonLibraryExport({ games });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Fallback');
  });

  it('games no-array → []', () => {
    expect(parseJsonLibraryExport({ games: null })).toEqual([]);
  });
});
