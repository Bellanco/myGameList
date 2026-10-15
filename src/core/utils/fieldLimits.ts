// Cómo se aplican los topes del formulario de juego (`GAME_LIMITS`) a lo que se escribe. Puras: el formulario las
// llama en cada cambio, y los tests las cubren sin montar nada.
//
// La regla común: un tope frena lo que CRECE, nunca recorta lo que ya había. Un valor que llega más largo que el tope
// (de una versión anterior, de la sincronización o de Playnite) se puede acortar o dejar como está, pero no alargar.

/**
 * El texto de un campo tras un cambio, con el tope `max` aplicado.
 *
 * - Si cabe, o si no ha crecido (se ha borrado algo de un valor que ya pasaba del tope), entra tal cual.
 * - Si ha crecido por el FINAL (escribir o pegar al final) y lo de antes cabía, entra hasta el tope: es lo que hace
 *   el `maxLength` del navegador, y así un pegado largo entra recortado en vez de no entrar.
 * - Si ha crecido por en medio, o lo de antes ya pasaba del tope, el cambio no entra: recortar el final de un texto
 *   para hacer sitio a algo escrito en medio se comería lo que no se está tocando.
 */
export function capGrowth(next: string, prev: string, max: number): string {
  if (next.length <= max || next.length <= prev.length) return next;
  return prev.length < max && next.startsWith(prev) ? next.slice(0, max) : prev;
}

/** Una etiqueta recortada al tope (sin dejar un espacio colgando al final del corte). */
export function capTag(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).trimEnd();
}

/**
 * Una lista de etiquetas tras añadir, con el tope `max` aplicado: lo nuevo entra mientras quepa, y lo que ya había
 * se queda entero aunque pase del tope. `next` es `current` con lo nuevo detrás (como lo deja `mergeTags`).
 */
export function capList<T>(next: readonly T[], current: readonly T[], max: number): T[] {
  return next.slice(0, Math.max(max, current.length));
}
