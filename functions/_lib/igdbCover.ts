// Emparejar un juego de TUS listas con su ficha en IGDB, y quedarse con el id de su carátula.
//
// Esta carpeta la compila Cloudflare Pages, no Vite, así que aquí no se importa nada del bundle (misma regla que
// `_lib/http.ts`). El emparejador vive AQUÍ y no en el cliente a propósito: así el navegador nunca habla con
// IGDB —ni con Twitch— y la promesa de «sin terceros» sigue en pie.
//
// TODO LO QUE HAY EN ESTE FICHERO SALIÓ DE MEDIRLO CONTRA UNA BIBLIOTECA REAL DE 302 JUEGOS. No es una heurística
// escrita a ojo: cada regla está aquí porque sin ella fallaba un juego concreto, y esos juegos están nombrados
// en los comentarios para que se puedan volver a comprobar.

import type { KVNamespace } from './keys';

const IGDB_API = 'https://api.igdb.com/v4/games';
const IMAGENES = 'https://images.igdb.com/igdb/image/upload';

/**
 * LOS TRES TAMAÑOS DE CARÁTULA, y por qué hacen falta los tres.
 *
 * `t_cover_big` son 264×374: exactamente lo que pide la ranura 3:4 del mosaico, y ~25 kB por juego.
 *
 * `t_1080p` es la misma imagen hasta 1080 px de alto (una portada sale a ~762×1080), y la pide SOLO el renglón
 * de la lista, donde la portada se recorta en una franja que cruza la fila entera: a 1.400 px de ancho, ampliar
 * los 264 px de la pequeña son casi seis aumentos y lo que queda es una mancha de color, que es justo lo que no
 * se quería. Con la grande el aumento baja a menos de dos y la franja se reconoce.
 *
 * Cuesta unos 120 kB por juego en vez de 25, y por eso NO es el tamaño por defecto: lo pide quien lo necesita.
 * El service worker las guarda igual (misma regla de origen propio), así que se paga una vez por juego.
 *
 * `t_720p` (508×720, ~82 kB) es el del medio, y existe por una medición concreta: en una pantalla de densidad
 * doble la caja del mosaico ocupa 471×627 píxeles REALES, así que los 264 de la pequeña se estiran 1,78 veces y
 * la carátula sale blanda. Con este, el aumento desaparece. No sustituye a la pequeña: el mosaico ofrece los dos
 * con `srcset` y es el navegador quien elige, de modo que una pantalla normal se sigue llevando sus 25 kB.
 *
 * NINGUNO de los tres añade entradas al KV: ahí se guarda el emparejamiento (nombre → id de portada), que es el
 * mismo para los tres. Lo único que cambia es de qué URL de IGDB se traen los bytes.
 *
 * VIVEN AQUÍ y no en `functions/cover.ts` porque hay DOS sitios que sirven carátulas: la Pages Function de
 * producción y su gemelo del servidor de desarrollo (`localCoverApi`, en `vite.config.ts`). Mientras el mapa
 * estuvo copiado en los dos, añadir un tamaño en uno y olvidarlo en el otro hacía que desarrollo sirviera una
 * imagen distinta de la de producción, que es justo la clase de diferencia que un gemelo existe para no tener.
 */
const TAMANOS = { normal: 't_cover_big', medio: 't_720p', ancho: 't_1080p' } as const;

export type TamanoCaratula = keyof typeof TAMANOS;

/** El tamaño que pide el parámetro `s`. Cualquier otra cosa cae en el normal, que es lo que hay que servirle a
 *  un cliente viejo que no conozca este parámetro. */
export function tamanoPedido(valor: string | null | undefined): TamanoCaratula {
  return valor === 'ancho' || valor === 'medio' ? valor : 'normal';
}

/**
 * ¿Tiene este identificador la pinta que debe? El id viene de IGDB, pero se comprueba igual antes de meterlo en
 * una URL: si algún día llegara por otro camino, que no pueda salirse de la ruta.
 */
export function esIdDeCaratula(coverId: string): boolean {
  return /^[a-z0-9_-]{1,64}$/i.test(coverId);
}

/** Dónde están los bytes de una carátula, al tamaño pedido. */
export function urlDeImagen(coverId: string, tamano: TamanoCaratula): string {
  return `${IMAGENES}/${TAMANOS[tamano]}/${coverId}.jpg`;
}

/** Tope del título. Generoso para nombres reales y suficiente para que nadie use esto como saco de basura. */
export const MAX_NOMBRE = 200;
const TOKEN_API = 'https://id.twitch.tv/oauth2/token';

/** Cuánto se guarda un emparejamiento acertado. Un mes: la ficha de un juego no se mueve casi nunca. */
const HIT_TTL = 60 * 60 * 24 * 30;
/**
 * Y cuánto se guarda un FALLO. Más corto a propósito, pero no corto de verdad: sin caché negativa, los juegos
 * que no existen —las erratas, sobre todo— vuelven a consultar IGDB en cada visita de cada dispositivo, que es
 * justo el gasto que esta caché viene a evitar. Una semana deja que una errata corregida se note pronto.
 */
const MISS_TTL = 60 * 60 * 24 * 7;

const ROMANOS: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8',
  ix: '9', x: '10', xi: '11', xii: '12', xiii: '13', xiv: '14', xv: '15',
};
/** El camino de vuelta: hace falta porque IGDB escribe «Hades II» y el usuario escribe «Hades 2». */
const ARABIGOS: Record<string, string> = Object.fromEntries(
  Object.entries(ROMANOS).map(([romano, arabigo]) => [arabigo, romano.toUpperCase()]),
);

const EDICIONES =
  /\b(goty|game of the year|definitive|complete|deluxe|enhanced|remastered|remaster|redux|anniversary|classic|directors cut|edition|ultimate|collection|trilogy|bundle|pack|hd|version)\b/g;

/**
 * Tipos de ficha, en TRES grados. La diferencia no es de calidad del dato: es de qué puede haber en la
 * estantería de alguien.
 *
 * FUERTES — el juego en sí: principal (0), expansión independiente (4), remake (8), remaster (9), expandido (10)
 * y port (11). El 4 faltaba, y se llevó por delante tres juegos reales de una biblioteca de 302: *Wolfenstein:
 * The Old Blood* (461 votos), *Dishonored: Death of the Outsider* (236) y *Commandos: Beyond the Call of Duty*
 * (106). Una expansión independiente se compra y se juega sola; está en la estantería como cualquier otro.
 */
const TIPOS_FUERTES = new Set([0, 4, 8, 9, 10, 11]);

/**
 * DÉBIL — la expansión que exige el juego base (2). Se admite porque hay quien la lista como entrada propia
 * («The Witcher 3: Blood and Wine»), pero SIEMPRE por debajo de un tipo fuerte con el mismo parecido de nombre:
 * si existe el juego, gana el juego. Sin ese matiz, una expansión con nombre más corto podía desbancarlo.
 */
const TIPOS_DEBILES = new Set([2]);

/**
 * AMPLIADOS — DLC (1), bundle (3), mod (5) y pack (13). Fuera salvo que se pida el modo ampliado, y no por
 * capricho: NO dan más carátulas, dan peores. Son cosas que se llaman casi igual que el juego y compiten con él.
 * Con ellos dentro, *Batman: Arkham Knight* emparejaba con «- PlayStation 4 Exclusive Skins Pack» y *Dishonored:
 * Death of the Outsider* con un «Jewel of the South Pack». Es una lente para mirar qué hay, no una mejora.
 */
const TIPOS_AMPLIADOS = new Set([1, 3, 5, 13]);

/** ¿Esta ficha entra, y con qué fuerza? `null` = no entra. */
function gradoDeTipo(tipo: number | undefined, ampliado: boolean): 1 | 0 | null {
  if (tipo === undefined) return 1; // ficha sin tipo declarado: se trata como juego, que es lo habitual
  if (TIPOS_FUERTES.has(tipo)) return 1;
  if (TIPOS_DEBILES.has(tipo)) return 0;
  if (ampliado && TIPOS_AMPLIADOS.has(tipo)) return 0;
  return null;
}

/**
 * Forma canónica de un título para compararlo: sin acentos, sin marcas, sin puntuación, y con los números
 * romanos pasados a cifra («The Witcher III» y «The Witcher 3» son el mismo juego escrito por dos manos).
 */
export function normalizarTitulo(texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(' ')
    .map((palabra) => ROMANOS[palabra] ?? palabra)
    .join(' ');
}

function sinEdicion(texto: string): string {
  return texto.replace(EDICIONES, ' ').replace(/\s+/g, ' ').trim();
}

function bigramas(texto: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < texto.length - 1; i += 1) set.add(texto.slice(i, i + 2));
  return set;
}

/**
 * Coeficiente de Dice sobre bigramas: reparte bien títulos cortos y parecidos, que es lo que hay aquí.
 *
 * Recibe los del BUSCADO ya hechos porque se compara el mismo título contra todos los candidatos: hasta cuatro
 * consultas de veinte fichas cada una, y cada ficha con sus nombres alternativos. Rehacerlos en cada comparación
 * era repetir el mismo troceo ochenta veces por juego.
 */
function parecido(bigramasBuscado: Set<string>, otro: string): number {
  const B = bigramas(otro);
  let comunes = 0;
  for (const par of bigramasBuscado) if (B.has(par)) comunes += 1;
  return (2 * comunes) / (bigramasBuscado.size + B.size || 1);
}

/**
 * Las «plataformas» que escribe el usuario son sobre todo TIENDAS, y todas significan PC en IGDB. Las que sí son
 * aparatos se traducen a las abreviaturas de IGDB.
 *
 * Esto no es un adorno: es EL desempate. Con dos fichas llamadas «Hook» exactamente igual —la de móvil de 2015 y
 * la de Mega Drive de 1992—, lo único que dice cuál es la tuya es que tú tienes la de Mega Drive.
 */
const TIENDAS_PC =
  /^(steam|gog|gog\.com|epic|epic games|ubisoft connect|uplay|origin|ea app|ea desktop|battle\.net|amazon|amazon games|itch\.io|itch|humble|humble bundle|microsoft store|xbox game pass|game pass|windows|pc)$/i;

/**
 * Cada nombre que puede escribir alguien, con las abreviaturas que IGDB usa para esa máquina. Las claves van en
 * minúscula y se comparan enteras, así que aquí lo que hace falta es COBERTURA de las formas reales: quien tiene
 * una PS4 escribe «PS4» o «PlayStation 4» según el día, y con solo una de las dos el desempate por plataforma
 * —lo que separa el «Hook» de Mega Drive del de móvil— no llegaba a aplicarse.
 *
 * Un alias que no exista en IGDB no hace daño: simplemente no casa con ninguna ficha. Lo que sí hace daño es que
 * falte, porque entonces el juego se emparejaba sin desempate.
 */
const FAMILIAS: Record<string, string[]> = {
  'ps1': ['PS', 'PS1'],
  'ps2': ['PS2'],
  'ps3': ['PS3'],
  'ps4': ['PS4'],
  'ps5': ['PS5'],
  'psp': ['PSP'],
  'ps vita': ['Vita'],
  'psvita': ['Vita'],
  'playstation': ['PS', 'PS1'],
  'playstation 1': ['PS', 'PS1'],
  'playstation 2': ['PS2'],
  'playstation 3': ['PS3'],
  'playstation 4': ['PS4'],
  'playstation 5': ['PS5'],
  'playstation portable': ['PSP'],
  'playstation vita': ['Vita'],
  'game boy': ['Game Boy', 'GB'],
  'game boy color': ['GBC'],
  'game boy advance': ['GBA'],
  'gba': ['GBA'],
  'nintendo ds': ['NDS'],
  'nintendo 3ds': ['3DS'],
  '3ds': ['3DS'],
  'nintendo switch': ['Switch'],
  'switch': ['Switch'],
  'nintendo switch 2': ['Switch 2'],
  'wii': ['Wii'],
  'nintendo wii': ['Wii'],
  'wii u': ['WiiU'],
  'nintendo wii u': ['WiiU'],
  'gamecube': ['NGC'],
  'nintendo gamecube': ['NGC'],
  'sega mega drive': ['MegaDrive', 'Genesis', 'SMD', 'Sega CD'],
  'mega drive': ['MegaDrive', 'Genesis', 'SMD', 'Sega CD'],
  'megadrive': ['MegaDrive', 'Genesis', 'SMD', 'Sega CD'],
  'genesis': ['MegaDrive', 'Genesis', 'SMD'],
  'sega saturn': ['Saturn'],
  'dreamcast': ['DC'],
  'sega dreamcast': ['DC'],
  'super nintendo': ['SNES', 'SFAM'],
  'snes': ['SNES', 'SFAM'],
  'nes': ['NES', 'Famicom'],
  'nintendo 64': ['N64'],
  'n64': ['N64'],
  'xbox': ['XBOX'],
  'xbox 360': ['X360'],
  'xbox one': ['XONE'],
  'xbox series x': ['Series X', 'Series X|S'],
  'xbox series s': ['Series X', 'Series X|S'],
  'xbox series x|s': ['Series X', 'Series X|S'],
};

export function plataformasEsperadas(plataformas: readonly string[]): Set<string> {
  const salida = new Set<string>();
  for (const cruda of plataformas) {
    const nombre = cruda.trim();
    if (!nombre) continue;
    if (TIENDAS_PC.test(nombre)) {
      salida.add('PC');
      continue;
    }
    for (const abreviatura of FAMILIAS[nombre.toLowerCase()] ?? []) salida.add(abreviatura);
  }
  return salida;
}

export interface FichaIgdb {
  name?: string;
  game_type?: number;
  total_rating_count?: number;
  cover?: { image_id?: string };
  alternative_names?: { name?: string }[];
  platforms?: { abbreviation?: string }[];
}

/**
 * Cuánto se parece el título buscado al de una ficha, mirando también sus nombres alternativos. 1 es idéntico.
 *
 * Los escalones intermedios no son arbitrarios: `0,97` es «el mismo con sufijo de edición» (*Control* ↔ *Control:
 * Ultimate Edition*), `0,9` es «el mismo con subtítulo» (*Sekiro* ↔ *Sekiro: Shadows Die Twice*) y `0,88` es «el
 * mismo dentro de su saga» (*Boltgun* ↔ *Warhammer 40,000: Boltgun*). Los tres casos son aciertos y sin ellos
 * caían por debajo del umbral.
 */
export function puntuarFicha(buscado: string, ficha: FichaIgdb): number {
  const objetivo = normalizarTitulo(buscado);
  return puntuarContra(objetivo, bigramas(objetivo), ficha);
}

/**
 * La misma puntuación, con el título buscado YA normalizado y troceado. Es la que usa el emparejador, que
 * compara decenas de fichas contra un único título: normalizarlo una vez por ficha —como hacía— era rehacer el
 * mismo trabajo ochenta veces por juego, en el camino que encima va contra el tope de consultas de IGDB.
 */
function puntuarContra(objetivo: string, bigramasObjetivo: Set<string>, ficha: FichaIgdb): number {
  const candidatos = [ficha.name, ...(ficha.alternative_names ?? []).map((alias) => alias.name)].filter(
    (nombre): nombre is string => Boolean(nombre),
  );
  let mejor = 0;
  for (const nombre of candidatos) {
    const otro = normalizarTitulo(nombre);
    let valor: number;
    if (otro === objetivo) valor = 1;
    else if (sinEdicion(otro) === objetivo) valor = 0.97;
    // «Sekiro» ↔ «Sekiro: Shadows Die Twice» sí; «Nioh» ↔ «Nioh 2» NO. Lo que viene detrás decide: si es una
    // cifra, es una secuela y son dos juegos distintos. Es la misma regla que gobierna `gameTitleKey`: los
    // números no se tocan nunca.
    else if (otro.startsWith(`${objetivo} `) && !/^\d/.test(otro.slice(objetivo.length + 1))) valor = 0.9;
    else if (otro.endsWith(` ${objetivo}`)) valor = 0.88;
    else valor = parecido(bigramasObjetivo, otro);
    if (valor > mejor) mejor = valor;
  }
  return mejor;
}

/**
 * Orden de preferencia entre candidatos, de más a menos decisivo: parecido del nombre → es el juego y no una
 * expansión → coincide la plataforma → tiene carátula → cuánta gente lo ha valorado.
 *
 * La popularidad va la última pero hace un trabajo enorme: es lo que separa el *Portal* de Valve (4.023 votos) de
 * la novela de ordenador de 1986 que se llama igual (6 votos), y el *Dredge* de verdad (245) de un *Dredge+* sin
 * carátula (0). Ojo con subirla de sitio: por encima de la plataforma le quitaría a Hook su Mega Drive.
 */
function clave(nombre: number, grado: number, casaPlataforma: boolean, tieneCaratula: boolean, votos: number): number[] {
  return [nombre, grado, casaPlataforma ? 1 : 0, tieneCaratula ? 1 : 0, votos];
}

function ganaA(candidata: number[], campeona: number[] | null): boolean {
  if (!campeona) return true;
  for (let i = 0; i < candidata.length; i += 1) {
    if (candidata[i] !== campeona[i]) return candidata[i] > campeona[i];
  }
  return false;
}

export interface EntornoIgdb {
  IGDB_CLIENT_ID?: string;
  IGDB_CLIENT_SECRET?: string;
  COVERS?: KVNamespace;
}

const CLAVE_TOKEN = 'igdb:token:v1';

/**
 * APUNTAR EN KV ES EL MEJOR ESFUERZO, NUNCA UNA CONDICIÓN PARA RESPONDER.
 *
 * El `put` de KV LANZA cuando la cuenta agota su presupuesto diario de escrituras —1.000 en el plan gratuito, y
 * ese techo lo comparten este almacén y el de las reseñas compartidas (ver `docs/plan-compartir-resenas.md`)—.
 * Sin esta guarda, esa excepción subía hasta la Function, que no tiene `_middleware` que la recoja, y `/cover`
 * contestaba un 500 con la carátula YA resuelta y a un `fetch` de distancia.
 *
 * Y lo que venía detrás era peor que el 500: al no quedar nada apuntado, el mismo juego volvía a preguntarle a
 * IGDB en la visita siguiente. O sea que el día que el presupuesto se agota —justo cuando el sistema está más
 * apretado— la caché deja de amortiguar y el gasto contra IGDB se multiplica. Fallar en guardar cuesta una
 * consulta de más mañana; fallar en responder deja la biblioteca sin carátulas hoy.
 *
 * El silencio es a propósito: quien llama no puede hacer nada distinto según se haya guardado o no, y lo único
 * que cambia es que la próxima vez habrá que volver a preguntar.
 */
export async function apuntarSiSePuede(
  kv: KVNamespace | undefined,
  clave: string,
  valor: string,
  expirationTtl: number,
): Promise<void> {
  try {
    await kv?.put(clave, valor, { expirationTtl });
  } catch {
    // Presupuesto agotado, escritura rechazada por ritmo o KV caído: se sigue sirviendo con lo que ya se sabe.
  }
}

/** Token de aplicación de Twitch, reutilizado desde KV. Dura ~60 días; se guarda con margen. */
async function tokenIgdb(env: EntornoIgdb): Promise<string | null> {
  const guardado = await env.COVERS?.get(CLAVE_TOKEN);
  if (guardado) return guardado;

  const url = `${TOKEN_API}?client_id=${encodeURIComponent(env.IGDB_CLIENT_ID ?? '')}&client_secret=${encodeURIComponent(
    env.IGDB_CLIENT_SECRET ?? '',
  )}&grant_type=client_credentials`;
  const respuesta = await fetch(url, { method: 'POST' });
  if (!respuesta.ok) return null;
  const cuerpo = (await respuesta.json()) as { access_token?: string; expires_in?: number };
  if (!cuerpo.access_token) return null;

  // Se caduca ANTES que el token real (la mitad de su vida, con tope de 30 días): renovar de más es gratis,
  // servir carátulas con un token muerto no.
  const vida = Math.min(Math.floor((cuerpo.expires_in ?? 0) / 2) || HIT_TTL, HIT_TTL);
  // Si no se puede guardar, el token recién pedido sirve igual para ESTA petición: lo único que se pierde es
  // poder reutilizarlo, y Twitch da otro cuando haga falta.
  await apuntarSiSePuede(env.COVERS, CLAVE_TOKEN, cuerpo.access_token, Math.max(vida, 600));
  return cuerpo.access_token;
}

const CAMPOS = 'fields name,cover.image_id,game_type,total_rating_count,alternative_names.name,platforms.abbreviation;';
const escapar = (texto: string) => texto.replace(/["\\]/g, ' ');

/**
 * Una consulta a IGDB. Devuelve `null` cuando NO SE HA PODIDO PREGUNTAR, que es distinto de preguntar y que no
 * haya nada, y la diferencia costó cara: al abrir el mosaico por primera vez, el navegador pide ~140 carátulas
 * de golpe, cada una lanza varias consultas, e IGDB limita a 4 por segundo. La versión anterior se tragaba esos
 * 429 como «sin resultado» y los guardaba una semana en la caché negativa: medio catálogo se quedó sin carátula
 * de forma persistente por una ráfaga de treinta segundos. Un fallo de infraestructura NUNCA puede escribirse
 * como si fuera un dato.
 */
async function consultar(env: EntornoIgdb, token: string, cuerpo: string): Promise<FichaIgdb[] | null> {
  for (let intento = 0; intento < 3; intento += 1) {
    const respuesta = await fetch(IGDB_API, {
      method: 'POST',
      headers: {
        'Client-ID': env.IGDB_CLIENT_ID ?? '',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: cuerpo,
    });
    if (respuesta.ok) {
      const datos = (await respuesta.json()) as unknown;
      return Array.isArray(datos) ? (datos as FichaIgdb[]) : [];
    }
    if (respuesta.status !== 429 && respuesta.status < 500) return null; // error nuestro: reintentar no arregla nada
    // Espera con desorden: sin el azar, las 140 peticiones de la misma carga reintentan todas a la vez y se
    // vuelven a chocar contra el mismo tope.
    await new Promise((listo) => setTimeout(listo, 400 * (intento + 1) + Math.random() * 400));
  }
  return null;
}

/**
 * Las consultas que se lanzan, en orden. Son tres formas distintas de preguntar lo mismo porque cada una falla
 * donde la otra acierta:
 *
 *  1. POR PREFIJO DE NOMBRE, ordenado por popularidad. Es la buena, y la que trae al Portal de Valve — que la
 *     búsqueda libre de IGDB no devolvía ni entre los veinte primeros, por detrás de cosas como «Portal Maze 2».
 *  2. LA VARIANTE CON ROMANOS. «Hades II» no empieza por la cadena «Hades 2», así que la consulta anterior no lo
 *     encuentra jamás; sin esta, «Hades 2» acababa emparejado con una ficha homónima de 0 votos.
 *  3. BÚSQUEDA LIBRE, de red de seguridad: tolera el orden de las palabras y encuentra cosas como
 *     «Warhammer 40,000: Boltgun» cuando tú solo escribiste «Boltgun».
 */
function consultasPara(nombre: string): string[] {
  const porPrefijo = (texto: string) =>
    `${CAMPOS} where name ~ "${escapar(texto)}"*; sort total_rating_count desc; limit 20;`;

  const consultas = [porPrefijo(nombre)];

  const conRomanos = nombre.replace(/\b(\d{1,2})\b/g, (cifra) => ARABIGOS[cifra] ?? cifra);
  if (conRomanos !== nombre) consultas.push(porPrefijo(conRomanos));

  if (nombre.includes(':')) consultas.push(porPrefijo(nombre.split(':')[0].trim()));

  consultas.push(`search "${escapar(nombre)}"; ${CAMPOS} limit 20;`);
  return consultas;
}

/** Cuántos votos hacen que un candidato exacto sea creíble sin seguir mirando. Ver `resolverCaratula`. */
const VOTOS_CREIBLES = 5;

export interface Emparejamiento {
  /** `image_id` de la carátula en IGDB, o `null` si no se encontró nada suficientemente bueno. */
  coverId: string | null;
  /** Nombre de la ficha elegida, para poder auditar por qué salió esa carátula. */
  match?: string;
  score?: number;
  /** `true` si alguna consulta falló: entonces «sin carátula» significa «no se ha podido saber», y no se cachea. */
  indeciso?: boolean;
}

/**
 * Umbral de confianza. Por debajo de esto NO se sirve carátula, aunque haya candidato: una carátula equivocada
 * molesta más que un hueco, y el hueco tiene una portada de casa decente detrás. Los que caen aquí son material
 * de la cola de revisión, no de la pantalla.
 */
const UMBRAL = 0.85;

/** Busca en IGDB (sin caché) el mejor candidato para un título y devuelve su carátula. */
export async function emparejar(
  env: EntornoIgdb,
  nombre: string,
  plataformas: readonly string[],
  ampliado = false,
): Promise<Emparejamiento> {
  const token = await tokenIgdb(env);
  if (!token) return { coverId: null, indeciso: true };

  const quiero = plataformasEsperadas(plataformas);
  /* El título buscado se normaliza y se trocea UNA vez, aquí, y no dentro de cada comparación: por debajo hay
     hasta cuatro consultas de veinte fichas, y cada ficha con sus nombres alternativos. */
  const objetivo = normalizarTitulo(nombre);
  const bigramasObjetivo = bigramas(objetivo);
  let campeona: number[] | null = null;
  let elegida: FichaIgdb | null = null;

  let huboFallo = false;
  for (const consulta of consultasPara(nombre)) {
    const fichas = await consultar(env, token, consulta);
    if (fichas === null) {
      huboFallo = true;
      continue;
    }
    for (const ficha of fichas) {
      const grado = gradoDeTipo(ficha.game_type, ampliado);
      if (grado === null) continue;
      const nota = puntuarContra(objetivo, bigramasObjetivo, ficha);
      if (nota < 0.6) continue;
      const abreviaturas = (ficha.platforms ?? []).map((p) => p.abbreviation).filter(Boolean) as string[];
      const casa = quiero.size > 0 && abreviaturas.some((abbr) => quiero.has(abbr));
      const candidata = clave(nota, grado, casa, Boolean(ficha.cover?.image_id), ficha.total_rating_count ?? 0);
      if (ganaA(candidata, campeona)) {
        campeona = candidata;
        elegida = ficha;
      }
    }
    // Parar pronto ahorra consultas, pero NO con un candidato que no ha votado nadie: esa es justo la firma de
    // una ficha homónima olvidada, y fue lo que puso una carátula de shovelware en «Hades 2». Con votos de
    // verdad, nombre exacto, plataforma y carátula, no hay nada mejor que encontrar.
    // NO se exige que case la plataforma: pedirlo hacía que casi todos los juegos agotaran las cuatro consultas,
    // y ese multiplicador por cuatro es justo lo que revienta el tope de IGDB en la primera carga.
    if (campeona && campeona[0] >= 0.95 && campeona[1] === 1 && campeona[3] === 1 && campeona[4] >= VOTOS_CREIBLES) {
      break;
    }
  }

  if (!elegida || !campeona || campeona[0] < UMBRAL) {
    // Si alguna consulta no llegó a hacerse, esto no es «no existe»: es «no lo sé». Quien llama no debe guardarlo.
    return { coverId: null, indeciso: huboFallo };
  }
  return { coverId: elegida.cover?.image_id ?? null, match: elegida.name, score: campeona[0] };
}

/**
 * Clave de caché. Incluye la plataforma porque es parte de la pregunta —el «Hook» de Mega Drive no es el de
 * móvil— y el modo ampliado en un ESPACIO APARTE, que no es un detalle: esta caché la comparten todos los
 * usuarios, así que sin separarlos la lente de diagnóstico del administrador le pondría a los demás la carátula
 * de un pack de skins.
 */
export function claveCache(nombre: string, plataformas: readonly string[], ampliado = false): string {
  const plats = [...plataformasEsperadas(plataformas)].sort().join('+') || '-';
  return `igdb:cover:${ampliado ? 'v2x' : 'v2'}:${normalizarTitulo(nombre)}|${plats}`;
}

/**
 * EL EMPAREJAMIENTO, EN DOS PIEZAS Y NO EN UNA. `leerCaratulaCacheada` es lo que ya se sabe —gratis— y
 * `emparejarYGuardar` es lo que cuesta: preguntarle a IGDB y apuntar la respuesta. Están separadas porque el
 * endpoint tiene que hacer algo ENTRE las dos (comprobar el cupo de la IP, ver `functions/cover.ts`), y con una
 * sola función que hiciera ambas cosas acababa leyendo la misma clave de KV dos veces por cada juego nuevo:
 * una para saber si había que gastar cupo y otra dentro de la resolución. `resolverCaratula` las junta para
 * quien no necesita meterse en medio (el gemelo de desarrollo de `vite.config.ts`).
 */

/**
 * Lo que ya está en la caché, sin preguntar a nadie: el id, `null` si consta que no tiene carátula, y
 * `undefined` si de este juego no se sabe nada todavía.
 */
export async function leerCaratulaCacheada(
  env: EntornoIgdb,
  nombre: string,
  plataformas: readonly string[],
  ampliado = false,
): Promise<string | null | undefined> {
  const cacheado = await env.COVERS?.get(claveCache(nombre, plataformas, ampliado));
  if (cacheado === null || cacheado === undefined) return undefined;
  return cacheado === '' ? null : cacheado;
}

/**
 * Pregunta a IGDB —SIN mirar antes la caché, porque quien llama ya lo ha hecho— y guarda la respuesta. Apunta
 * TAMBIÉN los fallos (como cadena vacía): sin eso, cada errata de la biblioteca vuelve a preguntar en cada
 * visita de cada dispositivo.
 */
export async function emparejarYGuardar(
  env: EntornoIgdb,
  nombre: string,
  plataformas: readonly string[],
  ampliado = false,
): Promise<string | null> {
  const { coverId, indeciso } = await emparejar(env, nombre, plataformas, ampliado);
  if (!coverId && indeciso) return null; // no se ha podido preguntar: ni se cachea ni se da por definitivo
  // El emparejamiento se devuelve se haya podido guardar o no: ya está resuelto y la carátula se puede servir.
  await apuntarSiSePuede(
    env.COVERS,
    claveCache(nombre, plataformas, ampliado),
    coverId ?? '',
    coverId ? HIT_TTL : MISS_TTL,
  );
  return coverId;
}

/** Las dos piezas juntas: de la caché si está, y de IGDB si no. Para quien no necesita nada en medio. */
export async function resolverCaratula(
  env: EntornoIgdb,
  nombre: string,
  plataformas: readonly string[],
  ampliado = false,
): Promise<string | null> {
  const cacheado = await leerCaratulaCacheada(env, nombre, plataformas, ampliado);
  if (cacheado !== undefined) return cacheado;
  return emparejarYGuardar(env, nombre, plataformas, ampliado);
}
