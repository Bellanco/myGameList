/** Tres tintas que se alternan: negro, blanco y el rojo del tema (`.rc-n`, `.rc-b`, `.rc-r` en el skin). */
const TINTAS = ['n', 'b', 'r', 'n', 'b'] as const;
/** Tamaños relativos que se repiten, para que ninguna letra recortada mida igual que su vecina. */
const TAMANOS = [1, 1.12, .92, 1.05] as const;

/**
 * LA RECETA DE UNA LETRA RECORTADA (Persona): tinta, giro y tamaño de la letra que ocupa la posición `i`.
 *
 * Sale de la POSICIÓN y no del azar, así que el mismo texto se ve igual cada vez. La usan dos piezas que tienen que
 * leerse como la misma revista: el título de pantalla del hub (`ScreenTitle`) y el rótulo del sello que cae al
 * cerrar un juego (`useSignatureEffects`). Por eso vive aquí y no dentro de una de las dos.
 */
export function recorte(i: number): { clase: string; transform: string; fontSize: string } {
  return {
    clase: `rc rc-${TINTAS[(i * 7) % TINTAS.length]}`,
    transform: `rotate(${((i * 37) % 9) - 4}deg)`,
    fontSize: `${TAMANOS[i % TAMANOS.length]}em`,
  };
}
