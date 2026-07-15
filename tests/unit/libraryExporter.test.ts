import { describe, it, expect } from 'vitest';
import { parseLibraryExporter } from '../../src/core/import/libraryExporter';

describe('parseLibraryExporter (Playnite Library Exporter, JSON único)', () => {
  it('mapea nombres resueltos, PC→tienda, horas y externalId', () => {
    const json = {
      games: [
        {
          playniteId: 'abc',
          name: 'ABZÛ',
          providerGameId: '384190',
          sourceName: 'Steam',
          steamAppId: 384190,
          platforms: ['PC (Windows)'],
          genres: ['Adventure', 'Indie', 'Simulator'],
          playtimeSeconds: 56280,
        },
      ],
    };
    const [g] = parseLibraryExporter(json);
    expect(g.name).toBe('ABZÛ');
    expect(g.source).toBe('steam');
    expect(g.platforms).toEqual(['Steam']); // PC → tienda
    expect(g.genres).toEqual(['Adventure', 'Indie', 'Simulation']); // 'Simulator' → 'Simulation'
    expect(g.hours).toBe(15.6); // 56280/3600
    expect(g.externalId).toBe('384190');
    expect(g.suggestedTab).toBeUndefined();
    expect(g.grade).toBeNull();
  });

  it('PC→tienda usa el nombre de tienda real (incluye EA/Ubisoft); conserva Macintosh', () => {
    const json = {
      games: [
        { name: 'A', sourceName: 'GOG', platforms: ['PC (Windows)'], genres: [], playtimeSeconds: 0 },
        { name: 'B', sourceName: 'Epic', platforms: ['PC (Windows)'], genres: [] },
        { name: 'C', sourceName: 'EA app', platforms: ['PC (Windows)'], genres: [] },
        { name: 'D', sourceName: 'Ubisoft Connect', platforms: ['PC (Windows)'], genres: [] },
        { name: 'E', sourceName: 'Steam', platforms: ['Macintosh'], genres: [] },
      ],
    };
    const out = parseLibraryExporter(json);
    // La plataforma toma el nombre de tienda tal cual (regla PC→tienda), reconocida o no.
    expect(out.map((g) => g.platforms?.[0])).toEqual(['GOG', 'Epic', 'EA app', 'Ubisoft Connect', 'Macintosh']);
    // El `source` (ImportSource) solo distingue las tiendas con integración prevista; el resto → 'playnite'.
    expect(out.map((g) => g.source)).toEqual(['gog', 'egs', 'playnite', 'playnite', 'steam']);
  });

  it('usa sortingName si falta name y descarta sin nombre', () => {
    const out = parseLibraryExporter({ games: [{ sortingName: 'Fallback' }, { name: '' }] });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Fallback');
  });

  it('acepta array directo y JSON inesperado → []', () => {
    expect(parseLibraryExporter([{ name: 'X', sourceName: 'Steam', platforms: [], genres: [] }])).toHaveLength(1);
    expect(parseLibraryExporter(null)).toEqual([]);
    expect(parseLibraryExporter('nope')).toEqual([]);
  });
});
