// Pruebas del emparejador de carátulas (`functions/_lib/igdbCover.ts`).
//
// Mismo criterio que `shareFunctions.test.ts`: aquí se prueba solo lo PURO —normalizar, puntuar, traducir
// plataformas y formar la clave de caché—. Lo que necesita KV o hablar con IGDB se prueba con
// `wrangler pages dev` de verdad, porque simular esas dos cosas no demostraría nada.
//
// LOS CASOS NO SON INVENTADOS. Cada uno es un juego de una biblioteca real de 302 que falló al emparejar, y está
// aquí para que la regla que lo arregló no se pueda quitar sin que salte algo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claveCache,
  emparejar,
  esIdDeCaratula,
  leerCaratulaCacheada,
  normalizarTitulo,
  plataformasEsperadas,
  puntuarFicha,
  resolverCaratula,
  tamanoPedido,
  urlDeImagen,
  type FichaIgdb,
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

  /* La gente escribe la misma máquina de varias formas, y con una sola registrada el desempate por plataforma
     —lo que separa el «Hook» de Mega Drive del de móvil— no llegaba a aplicarse. */
  it('reconoce el nombre largo además del corto', () => {
    expect([...plataformasEsperadas(['PlayStation 4'])]).toEqual([...plataformasEsperadas(['PS4'])]);
    expect([...plataformasEsperadas(['Mega Drive'])]).toEqual([...plataformasEsperadas(['Sega Mega Drive'])]);
    expect(plataformasEsperadas(['Nintendo Wii U']).has('WiiU')).toBe(true);
    expect(plataformasEsperadas(['Xbox Series X']).has('Series X')).toBe(true);
  });

  it('las tiendas nuevas también son PC', () => {
    for (const tienda of ['Microsoft Store', 'Game Pass', 'Humble', 'Epic Games']) {
      expect([...plataformasEsperadas([tienda])]).toEqual(['PC']);
    }
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

/**
 * Los tamaños y la comprobación del identificador viven en este módulo porque hay DOS sitios que sirven
 * carátulas —la Pages Function y su gemelo del servidor de desarrollo—, y mientras estuvieron copiados en los
 * dos, añadir uno en un lado y olvidarlo en el otro hacía que desarrollo sirviera otra imagen que producción.
 */
describe('tamaños de la imagen', () => {
  it('cada tamaño pide a IGDB su transformación', () => {
    expect(urlDeImagen('co1abc', 'normal')).toContain('t_cover_big');
    expect(urlDeImagen('co1abc', 'medio')).toContain('t_720p');
    expect(urlDeImagen('co1abc', 'ancho')).toContain('t_1080p');
    expect(urlDeImagen('co1abc', 'normal')).toMatch(/^https:\/\/images\.igdb\.com\/.+\/co1abc\.jpg$/);
  });

  it('un tamaño que no se conoce cae en el normal, que es lo que espera un cliente viejo', () => {
    expect(tamanoPedido('ancho')).toBe('ancho');
    expect(tamanoPedido('gigante')).toBe('normal');
    expect(tamanoPedido(null)).toBe('normal');
  });

  it('el identificador que no tiene la pinta debida no llega a componer una URL', () => {
    expect(esIdDeCaratula('co1abc')).toBe(true);
    expect(esIdDeCaratula('../../secreto')).toBe(false);
    expect(esIdDeCaratula('')).toBe(false);
  });
});


/**
 * EL DESEMPATE, que es lo que decide qué carátula ve la gente. El orden es: parecido del nombre → es el juego y
 * no una expansión → coincide la plataforma → tiene carátula → cuánta gente lo ha valorado. Cada caso de aquí es
 * uno de esos escalones, y todos salieron de un juego real que se emparejaba mal sin él.
 */
describe('elegir entre candidatos', () => {
  let consultas: string[];

  /** Devuelve estas fichas a cualquier consulta. El token ya está en KV, así que no se pasa por Twitch. */
  function igdbResponde(...fichas: Partial<FichaIgdb>[]) {
    consultas = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => {
      consultas.push(String(init?.body ?? ''));
      return new Response(JSON.stringify(fichas), { status: 200 });
    }));
  }

  const env = () => ({ COVERS: { get: async (c: string) => (c === 'igdb:token:v1' ? 'token' : null), put: async () => {} } }) as never;
  const juego = (over: Partial<FichaIgdb>): Partial<FichaIgdb> =>
    ({ game_type: 0, total_rating_count: 100, cover: { image_id: 'co-generico' }, ...over });

  beforeEach(() => { consultas = []; });
  afterEach(() => { vi.unstubAllGlobals(); });

  // El Portal de Valve (4.023 votos) contra la novela de ordenador de 1986 que se llama igual (6).
  it('la popularidad separa a un juego de su homónimo olvidado', async () => {
    igdbResponde(
      juego({ name: 'Portal', total_rating_count: 6, cover: { image_id: 'co-novela' } }),
      juego({ name: 'Portal', total_rating_count: 4023, cover: { image_id: 'co-valve' } }),
    );
    expect((await emparejar(env(), 'Portal', ['Steam'])).coverId).toBe('co-valve');
  });

  // Dos fichas llamadas «Hook»: la de móvil de 2015 y la de Mega Drive de 1992. Lo único que dice cuál es la
  // tuya es que tú tienes la de Mega Drive, así que la plataforma pesa MÁS que la popularidad.
  it('la plataforma manda por encima de la popularidad', async () => {
    igdbResponde(
      juego({ name: 'Hook', total_rating_count: 500, platforms: [{ abbreviation: 'iOS' }], cover: { image_id: 'co-movil' } }),
      juego({ name: 'Hook', total_rating_count: 12, platforms: [{ abbreviation: 'MegaDrive' }], cover: { image_id: 'co-md' } }),
    );
    expect((await emparejar(env(), 'Hook', ['Sega Mega Drive'])).coverId).toBe('co-md');
  });

  // Una expansión que exige el juego base entra (hay quien la lista aparte), pero nunca por delante del juego.
  it('si existe el juego, gana el juego y no su expansión', async () => {
    igdbResponde(
      juego({ name: 'The Witcher 3', game_type: 2, total_rating_count: 9000, cover: { image_id: 'co-expansion' } }),
      juego({ name: 'The Witcher 3', game_type: 0, total_rating_count: 40, cover: { image_id: 'co-juego' } }),
    );
    expect((await emparejar(env(), 'The Witcher 3', [])).coverId).toBe('co-juego');
  });

  it('por debajo del umbral no se sirve carátula: una equivocada molesta más que un hueco', async () => {
    igdbResponde(juego({ name: 'Otra cosa completamente distinta', cover: { image_id: 'co-ajena' } }));
    const resultado = await emparejar(env(), 'Celeste', []);

    expect(resultado.coverId).toBeNull();
    expect(resultado.indeciso).toBeFalsy(); // se preguntó y no había: eso SÍ se puede cachear
  });

  /* «No se ha podido preguntar» no es «no existe», y la diferencia costó medio catálogo: una ráfaga de 429 se
     guardó como caché negativa de una semana. */
  it('marca indeciso cuando la consulta no llega a hacerse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    const resultado = await emparejar(env(), 'Celeste', []);

    expect(resultado.coverId).toBeNull();
    expect(resultado.indeciso).toBe(true);
  });

  /* Parar pronto ahorra consultas, y eso es lo que mantiene el llenado por debajo del tope de IGDB: cuatro
     consultas por juego multiplicadas por trescientos es lo que reventaba el límite en la primera carga. */
  it('con un candidato indudable no agota las cuatro consultas', async () => {
    igdbResponde(juego({ name: 'Celeste', total_rating_count: 3000, cover: { image_id: 'co-celeste' } }));
    const resultado = await emparejar(env(), 'Celeste', ['Steam']);

    expect(resultado.coverId).toBe('co-celeste');
    expect(consultas).toHaveLength(1);
  });

  it('pero un candidato exacto que no ha votado nadie no basta para parar', async () => {
    // Es la firma de una ficha homónima olvidada: fue lo que puso una carátula de shovelware en «Hades 2».
    igdbResponde(juego({ name: 'Hades 2', total_rating_count: 0, cover: { image_id: 'co-dudoso' } }));
    await emparejar(env(), 'Hades 2', ['Steam']);

    expect(consultas.length).toBeGreaterThan(1);
  });
});
