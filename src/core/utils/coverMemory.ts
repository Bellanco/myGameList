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
 * UN «NO TIENE» ES DEFINITIVO EN ESTE NAVEGADOR, y esa es la decisión.
 *
 * Se probó a darle una semana de vida, para que un juego sin carátula volviera a intentarlo por su cuenta
 * cuando IGDB estrenara su ficha. Se deshizo a propósito: el reintento vuelve a preguntar por los MISMOS juegos
 * cada semana y en todos los dispositivos, y de esas preguntas casi ninguna cambia de respuesta —lo que no
 * empareja suele ser un título que IGDB no tiene, no uno que esté a punto de llegar—. Es una fuga pequeña, pero
 * constante y proporcional a los juegos sin carátula que tenga cada uno, que es justo la forma de gasto que
 * esta memoria existe para cerrar.
 *
 * LO QUE SÍ REABRE LA PREGUNTA ES EL TÍTULO. Esta memoria se guarda por la URL de la carátula, y la URL lleva el
 * nombre dentro: corregir la errata —que es la causa real de la mayoría de los «no»— da una URL distinta, que
 * aquí no consta, y el juego se pide otra vez como si fuera nuevo. Lo mismo pasa en el servidor, donde la clave
 * es el título normalizado. O sea que la vía de vuelta existe, y es la que el usuario controla.
 */
/** Las URL de las carátulas que consta que no existen. */
let memoria: Set<string> | null = null;

function cargar(): Set<string> {
  if (memoria) return memoria;
  memoria = new Set();
  try {
    const crudo = localStorage.getItem(CLAVE);
    const datos = crudo ? (JSON.parse(crudo) as unknown) : null;
    if (Array.isArray(datos)) {
      for (const url of datos) if (typeof url === 'string') memoria.add(url);
    } else if (datos && typeof datos === 'object') {
      /* Lo escrito por la versión que fechaba cada «no» (`{url: cuándo}`), que vivió lo justo. Se leen sus
         claves y se vuelve a guardar en lista: la fecha ya no la mira nadie y conservarla sería arrastrar un
         formato por si acaso. */
      for (const url of Object.keys(datos as Record<string, unknown>)) memoria.add(url);
    }
  } catch {
    memoria = new Set(); // sin memoria se vuelve a preguntar, que es el comportamiento de antes: molesto, no roto
  }
  return memoria;
}

/** ¿Sabemos ya que este juego no tiene carátula? */
export function sabemosQueNoTiene(url: string): boolean {
  return cargar().has(url);
}

/** Guarda la memoria tal y como está. Silencioso: sin almacenamiento se sigue recordando en RAM. */
function guardar(memoria: Set<string>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...memoria]));
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue con la memoria en RAM, que ya evita repetir en esta sesión.
  }
}

/** Apunta que este juego no tiene carátula. Idempotente. */
export function recordarQueNoTiene(url: string): void {
  const memoria = cargar();
  if (memoria.has(url)) return;
  memoria.add(url);
  /* El tope se aplica a la memoria VIVA y no solo a lo que se escribe. Antes se podaba al serializar
     (`slice(-MAX)`) dejando el conjunto en RAM entero: pasadas las MAX entradas, lo que esta sesión creía
     recordar y lo que iba a encontrar la siguiente dejaban de ser lo mismo, y el juego que se cayó de la lista
     volvía a pedir su carátula solo después de recargar. Los `Set` conservan el orden de inserción, así que las
     primeras son las más viejas. */
  // Al rango más alto no se le poda, mientras haya sitio de sobra (ver `coverLimits`).
  if (memoria.size > MAX && !topesLevantados()) {
    for (const vieja of [...memoria].slice(0, memoria.size - MAX)) memoria.delete(vieja);
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
