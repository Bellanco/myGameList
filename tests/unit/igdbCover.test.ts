// Pruebas del emparejador de carátulas (`functions/_lib/igdbCover.ts`).
//
// Mismo criterio que `shareFunctions.test.ts`: aquí se prueba solo lo PURO —normalizar, puntuar, traducir
// plataformas y formar la clave de caché—. Lo que necesita KV o hablar con IGDB se prueba con
// `wrangler pages dev` de verdad, porque simular esas dos cosas no demostraría nada.
//
// LOS CASOS NO SON INVENTADOS. Cada uno es un juego de una biblioteca real de 302 que falló al emparejar, y está
// aquí para que la regla que lo arregló no se pueda quitar sin que salte algo.
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
  claveCache,
  leerCaratulaCacheada,
  normalizarTitulo,
  plataformasEsperadas,
  puntuarFicha,
  resolverCaratula,
} from '../../functions/_lib/igdbCover';

describe('normalizar un título', () => {
  it('quita acentos, marcas y puntuación', () => {
    expect(normalizarTitulo('ABZÛ')).toBe('abzu');
    expect(normalizarTitulo('Sekiro™: Shadows Die Twice')).toBe('sekiro shadows die twice');
  });

  it('pasa los números romanos a cifra, que es como los escribe media biblioteca', () => {
    expect(normalizarTitulo('The Witcher III')).toBe(normalizarTitulo('The Witcher 3'));
    expect(normalizarTitulo('Hades II')).toBe(normalizarTitulo('Hades 2'));
    expect(normalizarTitulo('Blasphemous 2')).toBe('blasphemous 2');
  });

  it('trata el ampersand como «and» para que «Ratchet & Clank» case con «Ratchet and Clank»', () => {
    expect(normalizarTitulo('Ratchet & Clank')).toBe(normalizarTitulo('Ratchet and Clank'));
  });
});

describe('puntuar una ficha contra el título buscado', () => {
  it('da 1 al título idéntico', () => {
    expect(puntuarFicha('Portal', { name: 'Portal' })).toBe(1);
  });

  it('reconoce la misma obra con sufijo de edición (Control ↔ Control: Ultimate Edition)', () => {
    expect(puntuarFicha('Control', { name: 'Control: Ultimate Edition' })).toBeGreaterThanOrEqual(0.95);
  });

  it('reconoce el subtítulo (Sekiro ↔ Sekiro: Shadows Die Twice)', () => {
    expect(puntuarFicha('Sekiro', { name: 'Sekiro: Shadows Die Twice' })).toBeGreaterThanOrEqual(0.85);
  });

  it('reconoce el juego dentro de su saga (Boltgun ↔ Warhammer 40,000: Boltgun)', () => {
    expect(puntuarFicha('Boltgun', { name: 'Warhammer 40,000: Boltgun' })).toBeGreaterThanOrEqual(0.85);
  });

  it('mira también los nombres alternativos', () => {
    const ficha = { name: 'Cursed Castilla', alternative_names: [{ name: 'Maldita Castilla' }] };
    expect(puntuarFicha('Maldita Castilla', ficha)).toBe(1);
  });

  it('no confunde una secuela con su original: los números no se borran nunca', () => {
    expect(puntuarFicha('Nioh', { name: 'Nioh 2' })).toBeLessThan(0.85);
    expect(puntuarFicha('Hades', { name: 'Hades II' })).toBeLessThan(0.85);
  });
});

describe('plataformas', () => {
  it('traduce las tiendas a PC, que es lo que entiende IGDB', () => {
    expect(plataformasEsperadas(['Steam'])).toEqual(new Set(['PC']));
    expect(plataformasEsperadas(['GOG', 'Epic', 'Battle.net'])).toEqual(new Set(['PC']));
  });

  it('traduce los aparatos a sus abreviaturas, con los alias de la misma máquina', () => {
    expect(plataformasEsperadas(['Sega Mega Drive']).has('MegaDrive')).toBe(true);
    expect(plataformasEsperadas(['Sega Mega Drive']).has('Genesis')).toBe(true);
    expect(plataformasEsperadas(['Game Boy Color'])).toEqual(new Set(['GBC']));
  });

  it('ignora lo que no reconoce en vez de inventarse una plataforma', () => {
    expect(plataformasEsperadas(['Tamagotchi'])).toEqual(new Set());
    expect(plataformasEsperadas([])).toEqual(new Set());
  });
});

describe('clave de caché', () => {
  it('separa los homónimos por plataforma: el Hook de Mega Drive no es el de móvil', () => {
    expect(claveCache('Hook', ['Sega Mega Drive'])).not.toBe(claveCache('Hook', ['Steam']));
  });

  it('es la misma escriba como escriba el usuario el mismo juego', () => {
    expect(claveCache('The Witcher III', ['Steam'])).toBe(claveCache('The Witcher 3', ['GOG']));
  });

  it('no depende del orden en que estén puestas las plataformas', () => {
    expect(claveCache('Control', ['Steam', 'Epic'])).toBe(claveCache('Control', ['Epic', 'Steam']));
  });
});

/**
 * Las dos piezas del emparejamiento —lo que ya se sabe y lo que hay que preguntar— están separadas porque el
 * endpoint necesita meterse en medio (comprobar el cupo). `resolverCaratula` las junta para quien no lo
 * necesita: el gemelo de desarrollo de `vite.config.ts`, que es el único que la usa.
 */
describe('caché del emparejamiento', () => {
  const kv = (datos: Record<string, string> = {}) => {
    const mapa = new Map(Object.entries(datos));
    return {
      get: vi.fn(async (clave: string) => mapa.get(clave) ?? null),
      put: vi.fn(async (clave: string, valor: string) => { mapa.set(clave, valor); }),
      mapa,
    };
  };

  it('distingue «no se sabe nada» de «consta que no tiene»', async () => {
    const almacen = kv({ [claveCache('Jotum', [])]: '' });
    const env = { COVERS: almacen } as never;

    expect(await leerCaratulaCacheada(env, 'Jotum', [])).toBeNull();
    expect(await leerCaratulaCacheada(env, 'Celeste', [])).toBeUndefined();
  });

  it('lo que está en la caché se sirve sin preguntarle a nadie', async () => {
    const almacen = kv({ [claveCache('Celeste', ['Steam'])]: 'co1abc' });
    const fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);

    expect(await resolverCaratula({ COVERS: almacen } as never, 'Celeste', ['Steam'])).toBe('co1abc');
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(almacen.put).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('y una sola lectura basta: no se mira la caché dos veces por juego', async () => {
    const almacen = kv({ [claveCache('Celeste', [])]: 'co1abc' });
    await resolverCaratula({ COVERS: almacen } as never, 'Celeste', []);
    expect(almacen.get).toHaveBeenCalledTimes(1);
  });
});
