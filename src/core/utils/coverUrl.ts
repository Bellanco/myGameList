/**
 * La URL de la carátula de un juego. Siempre del PROPIO dominio: la sirve la Pages Function `functions/cover.ts`,
 * que es quien habla con IGDB. El navegador no conoce ninguna dirección de terceros, que es lo que mantiene en
 * pie la promesa de la política de privacidad y el smoke que la comprueba.
 *
 * La carátula es una FUNCIÓN del juego, no un dato guardado: no hay nada que sincronizar por el gist ni ningún
 * campo nuevo en `GameItem`, y dos dispositivos con la misma lista resuelven la misma imagen por su cuenta.
 *
 * Las plataformas viajan porque son el desempate entre homónimos: hay dos juegos llamados «Hook» y lo único que
 * dice cuál es el tuyo es que tú tienes el de Mega Drive.
 */
export function coverUrl(name: string, platforms: readonly string[] = [], ampliado = false): string {
  const parametros = new URLSearchParams({ n: name });
  const plataformas = platforms.filter(Boolean).join(',');
  if (plataformas) parametros.set('p', plataformas);
  /* `x=1` pide el modo ampliado (DLC, packs y mods), que solo enciende la cuenta de administración. Va en la URL
     a propósito: así su respuesta tiene clave de caché propia y no puede colarse en la de los demás. */
  if (ampliado) parametros.set('x', '1');
  return `/cover?${parametros.toString()}`;
}
