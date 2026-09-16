/**
 * Memoria de QUÉ JUEGOS NO TIENEN CARÁTULA, para no volver a pedirla.
 *
 * POR QUÉ ESTO Y NO GUARDAR LAS IMÁGENES. Las imágenes ya están guardadas, y en el mejor sitio posible: el
 * service worker mete toda respuesta 200 del mismo origen en la Cache Storage (`handleStaleWhileRevalidate` +
 * `isCacheable`), así que una carátula ya vista no se vuelve a descargar y la biblioteca se ve sin conexión.
 * Copiarlas además a IndexedDB sería una TERCERA copia de lo mismo y, encima, peor: habría que bajarlas por
 * JavaScript, guardarlas como blobs y fabricar URLs de objeto a mano, reimplementando lo que el navegador ya
 * hace solo detrás de un `<img src>`.
 *
 * Lo que de verdad se repetía era lo contrario: los juegos SIN carátula. Su respuesta es un 404 que, a
 * propósito, no se cachea en ningún lado —ni el navegador ni el service worker guardan lo que no es 200—, así
 * que cada visita volvía a preguntar por los mismos veinte juegos que nunca van a tener imagen. Recordar esa
 * respuesta aquí es lo que hace que la lista deje de preguntar.
 *
 * Y se guarda en `localStorage`, no en IndexedDB, porque es una lista de textos cortos que se lee entera de una
 * vez al arrancar: meterla en una base de datos asíncrona solo añadiría esperas al primer pintado.
 */

import { topesLevantados } from './coverLimits';

const CLAVE = 'mis-listas-covers-none';
/** Tope de la lista. Una biblioteca no tiene tantos juegos sin carátula; si los tuviera, se olvidan los viejos. */
const MAX = 1000;

/**
 * CUÁNTO DURA UN «NO TIENE», y por qué no es para siempre.
 *
 * Esta memoria empezó siendo una lista sin fecha, o sea un «no» definitivo: un juego que no tenía carátula el
 * día que se preguntó no la volvía a pedir NUNCA en ese navegador. Y eso convertía en permanente algo que no lo
 * es —IGDB añade fichas continuamente—, además de dejar sin efecto la caché negativa del servidor, que sí
 * caduca a la semana: por muchas veces que allí se reabriera la pregunta, aquí no se hacía.
 *
 * Una semana, el MISMO plazo que `MISS_TTL` en el servidor, para que las dos capas se reabran a la vez: cuando
 * el navegador vuelve a preguntar, al otro lado también toca volver a mirarlo en IGDB. Con plazos distintos, la
 * mitad de esas preguntas se las habría comido una caché que todavía decía que no.
 */
const VIDA_MS = 7 * 24 * 60 * 60 * 1000;

/** URL de la carátula → cuándo se supo que no la tenía. */
let memoria: Map<string, number> | null = null;

function cargar(): Map<string, number> {
  if (memoria) return memoria;
  memoria = new Map();
  try {
    const crudo = localStorage.getItem(CLAVE);
    const datos = crudo ? (JSON.parse(crudo) as unknown) : null;
    if (Array.isArray(datos)) {
      /* FORMATO ANTERIOR: una lista de URL sin fecha. Se les pone la de AHORA y no una del pasado, que sería
         más literal: lo pasado no se sabe, y darlas por caducadas de golpe haría que el primer arranque tras
         actualizar saliera preguntando por todos los juegos sin carátula a la vez. Con la fecha de hoy, ese
         reintento llega escalonado la semana que viene y sin que nadie lo note. */
      const ahora = Date.now();
      for (const url of datos) if (typeof url === 'string') memoria.set(url, ahora);
    } else if (datos && typeof datos === 'object') {
      for (const [url, cuando] of Object.entries(datos as Record<string, unknown>)) {
        if (typeof cuando === 'number') memoria.set(url, cuando);
      }
    }
  } catch {
    memoria = new Map(); // sin memoria se vuelve a preguntar, que es el comportamiento de antes: molesto, no roto
  }
  return memoria;
}

/**
 * ¿Sabemos ya que este juego no tiene carátula? Solo mientras ese «no» siga siendo reciente.
 *
 * Es una función PURA a propósito, aunque encuentre una marca caducada: la llama el listado por cada caja y en
 * cada repintado, así que limpiar aquí sería escribir en el almacenamiento desde el render. Lo caducado se
 * recoge al guardar, que es cuando toca.
 */
export function sabemosQueNoTiene(url: string): boolean {
  const cuando = cargar().get(url);
  return cuando !== undefined && Date.now() - cuando < VIDA_MS;
}

/**
 * Lo contrario y más preciso: de este juego consta un «no tiene», pero ya ha cumplido su semana.
 *
 * Lo usa el recorrido de fondo para volver a preguntar por él aunque esté en la lista de lo ya hecho. Sin esto,
 * caducar la marca no serviría de nada: el listado pediría la imagen otra vez en CADA visita —recibiendo el
 * mismo 404, que no cachea nadie— porque el único que aprende de la respuesta es el recorrido.
 */
export function tocaReintentar(url: string): boolean {
  const cuando = cargar().get(url);
  return cuando !== undefined && Date.now() - cuando >= VIDA_MS;
}

/**
 * ¿Hay alguna marca caducada? Se pregunta UNA vez al empezar el recorrido para no componer la URL de cada juego
 * de la biblioteca solo por comprobarlo: en una semana normal no hay ninguna y no se paga nada.
 */
export function hayQueReintentarAlgo(): boolean {
  const limite = Date.now() - VIDA_MS;
  for (const cuando of cargar().values()) if (cuando <= limite) return true;
  return false;
}

/** Guarda la memoria tal y como está. Silencioso: sin almacenamiento se sigue recordando en RAM. */
function guardar(memoria: Map<string, number>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(memoria)));
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue con la memoria en RAM, que ya evita repetir en esta sesión.
  }
}

/** Apunta que este juego no tiene carátula, AHORA. Repetirlo le da otra semana de silencio, que es lo correcto:
 *  se acaba de volver a preguntar y se ha vuelto a contestar que no. */
export function recordarQueNoTiene(url: string): void {
  const memoria = cargar();
  memoria.set(url, Date.now());
  /* El tope se aplica a la memoria VIVA y no solo a lo que se escribe. Antes se podaba al serializar
     (`slice(-MAX)`) dejando el conjunto en RAM entero: pasadas las MAX entradas, lo que esta sesión creía
     recordar y lo que iba a encontrar la siguiente dejaban de ser lo mismo, y el juego que se cayó de la lista
     volvía a pedir su carátula solo después de recargar. Los `Map` conservan el orden de inserción, así que las
     primeras son las más viejas. */
  // Al rango más alto no se le poda, mientras haya sitio de sobra (ver `coverLimits`).
  if (memoria.size > MAX && !topesLevantados()) {
    for (const vieja of [...memoria.keys()].slice(0, memoria.size - MAX)) memoria.delete(vieja);
  }
  guardar(memoria);
}

/**
 * Lo contrario: un juego que ANTES no tenía y ahora sí. Pasa al corregir una errata del título o cuando IGDB
 * añade la ficha, y sin esto el juego se quedaría sin carátula para siempre en ese navegador.
 */
export function olvidarQueNoTiene(url: string): void {
  const memoria = cargar();
  if (!memoria.delete(url)) return;
  guardar(memoria);
}

/** Solo para las pruebas: vacía la memoria en RAM para que el siguiente acceso relea el almacenamiento. */
export function reiniciarMemoriaDeCaratulas(): void {
  memoria = null;
}
