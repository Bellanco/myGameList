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

const CLAVE = 'mis-listas-covers-none';
/** Tope de la lista. Una biblioteca no tiene tantos juegos sin carátula; si los tuviera, se olvidan los viejos. */
const MAX = 1000;

let memoria: Set<string> | null = null;

function cargar(): Set<string> {
  if (memoria) return memoria;
  try {
    const crudo = localStorage.getItem(CLAVE);
    const lista = crudo ? (JSON.parse(crudo) as unknown) : [];
    memoria = new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    memoria = new Set(); // sin memoria se vuelve a preguntar, que es el comportamiento de antes: molesto, no roto
  }
  return memoria;
}

/** ¿Sabemos ya que este juego no tiene carátula? */
export function sabemosQueNoTiene(url: string): boolean {
  return cargar().has(url);
}

/** Guarda la lista tal y como está en memoria. Silencioso: sin almacenamiento se sigue recordando en RAM. */
function guardar(set: Set<string>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...set]));
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue con la memoria en RAM, que ya evita repetir en esta sesión.
  }
}

/** Apunta que este juego no tiene carátula. Idempotente. */
export function recordarQueNoTiene(url: string): void {
  const set = cargar();
  if (set.has(url)) return;
  set.add(url);
  /* El tope se aplica a la memoria VIVA y no solo a lo que se escribe. Antes se podaba al serializar
     (`slice(-MAX)`) dejando el conjunto en RAM entero: pasadas las MAX entradas, lo que esta sesión creía
     recordar y lo que iba a encontrar la siguiente dejaban de ser lo mismo, y el juego que se cayó de la lista
     volvía a pedir su carátula solo después de recargar. Los `Set` conservan el orden de inserción, así que las
     primeras son las más viejas. */
  if (set.size > MAX) {
    for (const vieja of [...set].slice(0, set.size - MAX)) set.delete(vieja);
  }
  guardar(set);
}

/**
 * Lo contrario: un juego que ANTES no tenía y ahora sí. Pasa al corregir una errata del título o cuando IGDB
 * añade la ficha, y sin esto el juego se quedaría sin carátula para siempre en ese navegador.
 */
export function olvidarQueNoTiene(url: string): void {
  const set = cargar();
  if (!set.delete(url)) return;
  guardar(set);
}

/** Solo para las pruebas: vacía la memoria en RAM para que el siguiente acceso relea el almacenamiento. */
export function reiniciarMemoriaDeCaratulas(): void {
  memoria = null;
}
