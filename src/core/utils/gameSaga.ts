// ¿Son dos títulos de la MISMA SAGA? Lo que hace que «Persona 5 Royal» y «Persona 3 Reloaded» sean parientes
// sin ser el mismo juego.
//
// LA IDEA. En los títulos de videojuegos el nombre de la saga va DELANTE y lo que distingue a cada entrega va
// detrás («Silent Hill 2», «Silent Hill f»). Así que la saga compartida es el PREFIJO DE PALABRAS COMÚN a los
// dos títulos, y todo el trabajo de aquí consiste en decidir cuándo ese prefijo nombra de verdad una saga y
// cuándo es una coincidencia («Dark Souls» y «Dark Sector» empiezan igual y no tienen nada que ver).
//
// SE APOYA EN `gameTitleKey`, no lo repite. De normalizar acentos, mayúsculas, puntuación, apóstrofes, el
// artículo inicial inglés, los sufijos de reedición y los números romanos ya se encarga esa clave, y esta
// función la llama sobre lo que reciba. Eso trae de balde que «The Witcher 3» y «Witcher III» compartan saga.
// Es idempotente, así que pasarle una clave ya calculada no cambia el resultado ni cuesta nada raro.
//
// LO QUE NO CUENTA COMO NOMBRE DE SAGA, y es la regla que pidió el encargo:
//
//   · LOS NÚMEROS. Son justo lo que SEPARA una entrega de otra: si el prefijo común acaba en cifra, la cifra no
//     forma parte del nombre («Final Fantasy 7» y «Final Fantasy 7 Remake» comparten «final fantasy»).
//   · LAS PALABRAS DE FUNCIÓN: artículos, preposiciones, conjunciones, pronombres y cópulas. Que dos títulos
//     coincidan en un «of», un «the» o un «de» no dice absolutamente nada («Call of Duty» y «Call of Cthulhu»
//     comparten dos palabras y son dos cosas distintas).
//
// UNA SOLA PALABRA NECESITA PRUEBA. Con dos o más palabras que nombren algo, el prefijo ya es un nombre y basta
// («God of War Ragnarok», «Assassins Creed Valhalla»). Con UNA sola no basta —de una palabra son «dark», «star»,
// «super», «final» o «last», que empiezan medio catálogo—, así que se le exige marca de serie: que en uno de los
// dos títulos esa palabra sea el título ENTERO o vaya seguida de un número. Es lo que distingue «Persona 5» ~
// «Persona 3» o «Doom» ~ «Doom Eternal» de «The Last of Us» ~ «The Last Guardian».
//
// Y un remate contra el falso positivo más incómodo de esa prueba: si tras la palabra compartida uno de los dos
// títulos sigue con una palabra de función, no hay saga. Es lo que separa «Journey» de «Journey to the Savage
// Planet» —un título corto que resulta ser el comienzo de otro más largo— y solo puede saltar en el lado que no
// aporta la marca de serie, porque el que la aporta o está vacío o empieza por cifra.
//
// EL PRECIO, asumido a conciencia: se le escapan las sagas cuyas entregas solo se distinguen por subtítulo y no
// llevan número en ninguna («Nier Automata» ~ «Nier Replicant», «Pokémon Rojo» ~ «Pokémon Escarlata»). Perder
// esas coincidencias sale más barato que emparentar «Dead Space» con «Dead Cells» o «Metal Gear Solid» con
// «Metal Slug», que es lo que pasa en cuanto se acepta cualquier primera palabra compartida.
//
// LO QUE NO HACE: diccionarios de sagas. Igual que `gameTitleKey` no lleva lista de abreviaturas, aquí no hay
// lista de franquicias que alguien tenga que mantener a mano; la única lista es la de palabras de función, que
// es una clase gramatical cerrada y no crece con el catálogo.
//
// PURO: sin reloj, sin E/S y sin estado.
import { gameTitleKey } from './gameTitleKey';

/**
 * Palabras que no nombran nada por sí solas: artículos, preposiciones, conjunciones, pronombres y cópulas, en
 * inglés y en español. Coincidir en ellas no emparenta dos títulos.
 *
 * Van en la forma que deja `gameTitleKey`: minúsculas y sin diacríticos («él» es «el», «más» es «mas»).
 */
const FUNCTION_WORDS = new Set([
  // Inglés.
  'the', 'a', 'an',
  'of', 'in', 'on', 'at', 'to', 'into', 'onto', 'for', 'from', 'with', 'without', 'by', 'as', 'over', 'under',
  'about', 'against', 'between', 'through', 'until', 'up', 'down', 'out', 'off', 'than', 'then',
  'and', 'or', 'nor', 'but',
  'i', 'me', 'we', 'us', 'you', 'he', 'she', 'it', 'they', 'them', 'who', 'whose',
  'my', 'your', 'our', 'his', 'her', 'its', 'their',
  'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'am', 'be',
  // Español.
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'tras',
  'y', 'e', 'o', 'u', 'ni', 'que', 'mas', 'pero',
  'yo', 'tu', 'ella', 'ellos', 'ellas', 'nos', 'te', 'se', 'mi', 'ti',
  'mis', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'esto', 'eso',
  'es', 'son', 'era', 'eran', 'ser',
]);

/** Una cifra suelta. `gameTitleKey` ya ha convertido los romanos, así que aquí los números son todos arábigos. */
const NUMBER_TOKEN = /^\d+$/;

/** ¿Esta palabra nombra algo? Ni cifras ni palabras de función: solo lo que puede ser el nombre de una saga. */
function namesSomething(token: string): boolean {
  return Boolean(token) && !NUMBER_TOKEN.test(token) && !FUNCTION_WORDS.has(token);
}

/**
 * ¿Lo que queda del título tras el nombre compartido es una MARCA DE SERIE? O no queda nada —el nombre es el
 * título entero, como «Doom» frente a «Doom Eternal»— o lo que queda empieza por la cifra de la entrega.
 */
function isSeriesTail(rest: readonly string[]): boolean {
  return rest.length === 0 || NUMBER_TOKEN.test(rest[0]);
}

/** ¿Sigue por una palabra de función? Entonces el nombre compartido se estaba comiendo el título de otra cosa. */
function opensWithFunctionWord(rest: readonly string[]): boolean {
  return rest.length > 0 && FUNCTION_WORDS.has(rest[0]);
}

function titleWords(name: string): string[] {
  return gameTitleKey(name).split(' ').filter(Boolean);
}

/**
 * Nombre de la saga que comparten dos títulos, o cadena vacía si no comparten ninguna.
 *
 * Devuelve el nombre en vez de un sí o un no porque es lo que hace las pruebas legibles y lo que permitiría
 * rotularlo algún día; a quien solo le importa el vínculo le basta con leerlo como booleano.
 */
export function sharedSagaName(a: string, b: string): string {
  const left = titleWords(a);
  const right = titleWords(b);

  // El prefijo común, palabra a palabra.
  let shared = 0;
  while (shared < left.length && shared < right.length && left[shared] === right[shared]) {
    shared += 1;
  }

  // Del prefijo se cae por el final todo lo que no nombra: la cifra de la entrega y las palabras de función.
  let core = shared;
  while (core > 0 && !namesSomething(left[core - 1])) {
    core -= 1;
  }
  if (core === 0) {
    return '';
  }

  const name = left.slice(0, core).join(' ');
  // Dos palabras o más ya son un nombre propio; ninguna coincidencia casual llega tan lejos.
  if (core >= 2) {
    return name;
  }

  // Una sola palabra: hace falta la marca de serie, y que ninguno de los dos títulos siga por una palabra de
  // función (el caso «Journey» ~ «Journey to the Savage Planet»).
  const restLeft = left.slice(core);
  const restRight = right.slice(core);
  if (opensWithFunctionWord(restLeft) || opensWithFunctionWord(restRight)) {
    return '';
  }

  return isSeriesTail(restLeft) || isSeriesTail(restRight) ? name : '';
}
