// Clave con la que se reconoce el MISMO juego entre dos bibliotecas distintas.
//
// Existe porque el `id` de un juego se asigna por biblioteca (`max(ids)+1` en `useGameListViewModel.saveDraft`):
// el 42 de una amistad no tiene nada que ver con el 42 propio, y lo único que significa lo mismo en dos aparatos
// es el título. Pero el título lo teclea cada persona, así que «Marvel's Spider-Man» y «Marvels Spider Man» son
// el mismo juego escrito por dos manos distintas y hay que verlo.
//
// NO SUSTITUYE A `normalizeName`, y la diferencia es de CONSECUENCIAS, no de calidad. Aquella decide si un
// guardado es un duplicado (y entonces lo BLOQUEA, ver `saveDraft`) y si dos filas de una importación son la
// misma (y entonces las FUNDE, ver `addGamesToInbox`): ahí un falso positivo le impide a alguien meter un juego
// legítimo o le fusiona dos. Aquí lo peor que pasa es que el bloque de reseñas relacionadas enseñe una tarjeta de
// más. Por eso esta clave puede permitirse ser atrevida y aquella no, y por eso son dos funciones y no una.
//
// LO QUE NO HACE: acrónimos y abreviaturas. «Zelda: TOTK» no casa con «The Legend of Zelda: Tears of the
// Kingdom», y no hay forma de que case sin un diccionario de abreviaturas que habría que mantener a mano.
//
// LA REGLA QUE GOBIERNA TODO LO DEMÁS: NO SE BORRAN NÚMEROS. Son lo que separa una secuela de su original —«Nioh»
// y «Nioh 2» son dos juegos— y ninguna de las reglas de aquí puede tocarlos.

/** Sufijos de REEDICIÓN: la misma obra vuelta a publicar. Se quitan del final, en la forma ya normalizada. */
const EDITION_SUFFIXES = [
  'game of the year edition',
  'game of the year',
  'goty edition',
  'goty',
  'definitive edition',
  'deluxe edition',
  'complete edition',
  'enhanced edition',
  'ultimate edition',
  'special edition',
  'gold edition',
  'legendary edition',
  'anniversary edition',
  'anniversary',
  'directors cut',
  'remastered',
  'remaster',
  'hd',
] as const;

// LO QUE NUNCA DEBE ENTRAR EN ESA LISTA: `remake`, `rebirth`, `reloaded`, `redux`. Un remake es una obra NUEVA,
// no una reedición. «Final Fantasy VII Remake» no es «Final Fantasy VII», y fundirlos sería el peor falso
// positivo posible: dos juegos distintos, de dos épocas distintas, con opiniones que no hablan de lo mismo.
// No hace falta código para excluirlos —no estando en la lista, sus palabras se conservan solas—, así que quien
// vigila esto es una prueba (`gameTitleKey.test.ts`) y no una comprobación que aparentaría trabajar sin hacerlo.

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/**
 * Un número romano de DOS O MÁS cifras. La longitud mínima no es un capricho: las letras romanas sueltas son,
 * en los títulos de videojuegos, casi siempre letras y no números.
 *
 * La que obliga a esta regla es la `x`. «Mega Man X» NO es «Mega Man 10» —son dos juegos, y el 10 existe—, así
 * que convertir la equis suelta fusionaría dos series enteras. Por el mismo motivo se quedan fuera la `i` (que
 * en inglés es una palabra: «I Am Setsuna» no es «1 Am Setsuna») y la `l` de «L.A. Noire».
 *
 * El precio es que «Final Fantasy X» no casa con «Final Fantasy 10». Es una coincidencia que se pierde, y se
 * pierde a propósito: perder un acierto es barato, fundir dos juegos distintos no.
 */
const ROMAN_MULTI = /^(?=[ivxlcdm]{2,}$)m*(c[md]|d?c{0,3})(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/;

/**
 * La ÚNICA cifra romana suelta que se convierte. Se usa de verdad como número en los títulos («Grand Theft Auto
 * V», «Street Fighter V») y no se conoce ninguna serie donde la uve suelta sea una letra que choque con su
 * número, que es lo que descarta a la equis.
 */
const ROMAN_SINGLE = 'v';

function romanToArabic(token: string): number {
  let total = 0;
  for (let index = 0; index < token.length; index += 1) {
    const value = ROMAN_VALUES[token[index]];
    const next = ROMAN_VALUES[token[index + 1]] || 0;
    total += value < next ? -value : value;
  }
  return total;
}

/** Quita del final todos los sufijos de reedición encadenados («Definitive Edition HD»). */
function stripEditionSuffixes(key: string): string {
  let current = key;

  for (let pass = 0; pass < EDITION_SUFFIXES.length; pass += 1) {
    const suffix = EDITION_SUFFIXES.find((candidate) => current.endsWith(` ${candidate}`));
    if (!suffix) {
      break;
    }
    const stripped = current.slice(0, -(suffix.length + 1)).trim();
    // Un título que se quede en nada al recortarlo no era un título con sufijo: era eso. Se devuelve entero
    // antes que producir una clave vacía, que no casa con nada y saca la reseña del bloque.
    if (!stripped) {
      break;
    }
    current = stripped;
  }

  return current;
}

/**
 * Clave de un título. Dos títulos con la misma clave se consideran el mismo juego.
 *
 * El orden de los pasos importa: la puntuación se va ANTES de buscar sufijos («Wild Hunt – Game of the Year
 * Edition» tiene que ser ya «wild hunt game of the year edition» para que el sufijo se reconozca), y los
 * romanos se convierten al final, sobre palabras ya limpias.
 */
export function gameTitleKey(name: string): string {
  const base = String(name || '')
    // Los diacríticos se separan de su letra y se tiran: «Pokémon» y «Pokemon» son el mismo juego.
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // La ampersand se dice de dos maneras y las dos se escriben.
    .replace(/&/g, ' and ')
    // El apóstrofe se BORRA, no se convierte en espacio como el resto de la puntuación, porque une en vez de
    // separar: «Marvel's» es una palabra y «marvel s» son dos, así que no casaría con «Marvels». Se contemplan
    // el recto y el tipográfico —que es el que escriben los teclados de iOS y los copiar-pega de una web— más
    // los acentos que se usan como apóstrofe.
    .replace(/['‘’ʼ`´]/g, '')
    // Todo lo que no sea letra o número pasa a ser separación: guiones, dos puntos, apóstrofes, ™, ®. Se usan
    // clases Unicode y no `[^a-z0-9]` para no vaciar los títulos que no se escriben en alfabeto latino, que
    // quedarían todos con la misma clave (ninguna).
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  if (!base) {
    return '';
  }

  // Artículo inicial en inglés, que se escribe o no se escribe según a quién le preguntes («The Last of Us»).
  // Solo el inglés: en español el artículo suele ser parte del nombre («La-Mulana», «El Shaddai»).
  const withoutArticle = base.startsWith('the ') ? base.slice(4) : base;

  const words = stripEditionSuffixes(withoutArticle).split(' ').filter(Boolean);

  return words
    .map((word) => (word === ROMAN_SINGLE || ROMAN_MULTI.test(word) ? String(romanToArabic(word)) : word))
    .join(' ');
}
