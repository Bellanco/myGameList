/**
 * QUÉ SE BUSCA EN TMDB PARA UNA INTERPRETACIÓN. El nominado se escribe «Actor - Juego» («Troy Baker - The Last of
 * Us»), que es lo que tiene que leer quien vota, pero la búsqueda de personas de TMDB solo casa por nombre: con el
 * juego detrás no devuelve NADA (medido el 29-09-2026: «Troy Baker» da su ficha; «Troy Baker - The Last of Us»,
 * cero). Así que se busca con lo que va antes del separador.
 *
 * El juego no sirve para desempatar homónimos: TMDB solo conoce a la gente por cine y series, y eso ya lo enseña
 * cada candidato debajo de su nombre.
 *
 * EL GUION CORTO SOLO SEPARA CON UN ESPACIO AL LADO: «Jean-Claude» o «Ruiz-Esparza» son un nombre, no un nombre y
 * un juego. El largo, los dos puntos, la barra vertical y el paréntesis no salen en nombres de persona, así que
 * separan siempre.
 */
const SEPARADOR = /\s+-+|-+\s+|[–—:|(]/;

/** El nombre del intérprete de un nominado «Actor - Juego». Sin separador, o sin nada delante, el nombre entero. */
export function nombreDeInterprete(nominado: string): string {
  const entero = nominado.replace(/\s+/g, ' ').trim();
  const corte = entero.search(SEPARADOR);
  const nombre = corte === -1 ? '' : entero.slice(0, corte).trim();
  return nombre || entero;
}
