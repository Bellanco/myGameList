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
export function coverUrl(
  name: string,
  platforms: readonly string[] = [],
  ampliado = false,
  /**
   * `normal` (264×374) es la de la ranura 3:4 del mosaico en una pantalla de densidad sencilla.
   * `medio`  (508×720) es la misma para una pantalla de densidad doble, donde la caja ocupa 471 píxeles reales y
   *          la normal se estiraría 1,78 veces. Las dos se ofrecen juntas con `srcset` y elige el navegador.
   *          Es también la del renglón de la lista, que recorta una franja a lo ancho de la fila entera.
   * `ancho`  (~762×1080) la pide la franja de las reseñas del social.
   */
  tamano: 'normal' | 'medio' | 'ancho' = 'normal',
  /**
   * Qué hace el servidor con un título que aún no tiene emparejado. Resolverlo es lo que escribe en KV, y ese
   * presupuesto es de la cuenta entera y lo necesitan los enlaces compartidos (ver `functions/cover.ts`):
   *   · `resolver`: lo resuelve con el cupo entero. Tu biblioteca.
   *   · `ajeno` (`c=2`): lo resuelve solo mientras quede la parte del cupo del día reservada a lo ajeno, y si
   *     no, se queda sin imagen hasta otro intento. La biblioteca y las reseñas de otra persona en el hub social.
   *   · `solo-cache` (`c=1`): nunca, sirve solo lo ya resuelto. Los nominados de los premios.
   */
  siNoEstaResuelta: 'resolver' | 'ajeno' | 'solo-cache' = 'resolver',
): string {
  const parametros = new URLSearchParams({ n: name });
  const plataformas = platforms.filter(Boolean).join(',');
  if (plataformas) parametros.set('p', plataformas);
  /* `x=1` pide el modo ampliado (DLC, packs y mods), que solo enciende la cuenta de administración. Va en la URL
     a propósito: así su respuesta tiene clave de caché propia y no puede colarse en la de los demás. Con `s`
     pasa lo mismo: el service worker cachea por URL y sin `Vary`, así que cada tamaño necesita su clave. */
  if (ampliado) parametros.set('x', '1');
  if (tamano !== 'normal') parametros.set('s', tamano);
  if (siNoEstaResuelta === 'solo-cache') parametros.set('c', '1');
  if (siNoEstaResuelta === 'ajeno') parametros.set('c', '2');
  return `/cover?${parametros.toString()}`;
}
