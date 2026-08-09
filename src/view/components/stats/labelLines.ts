/** Caracteres que caben cómodamente en una línea de rótulo alrededor de una figura circular. */
const MAX_PER_LINE = 13;

/**
 * Parte un rótulo largo en DOS líneas por el espacio más cercano al centro.
 *
 * Antes se recortaba con puntos suspensivos, y en un rosetón los géneros con nombre largo —"Mundo abierto",
 * "Aventura gráfica"— quedaban truncados justo donde estaba la información. Partir por un espacio conserva el
 * nombre entero y no roba ancho a la figura, porque la segunda línea cae debajo de la primera.
 *
 * Una sola palabra que no cabe SÍ se recorta: partirla por la mitad sería peor que la elipsis.
 */
export function labelLines(tag: string): string[] {
  const clean = tag.trim();
  if (clean.length <= MAX_PER_LINE) return [clean];

  // Se busca el espacio que deje las dos mitades más parejas, para que el bloque quede equilibrado.
  const middle = clean.length / 2;
  let best = -1;
  for (let i = 0; i < clean.length; i += 1) {
    if (clean[i] !== ' ') continue;
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }

  if (best === -1) return [`${clean.slice(0, MAX_PER_LINE - 1)}…`];

  const first = clean.slice(0, best);
  const second = clean.slice(best + 1);
  // Si una de las dos mitades sigue siendo desproporcionada, se recorta esa y no el nombre entero.
  const trim = (line: string) => (line.length > MAX_PER_LINE + 3 ? `${line.slice(0, MAX_PER_LINE + 2)}…` : line);
  return [trim(first), trim(second)];
}
