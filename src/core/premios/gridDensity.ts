/**
 * Densidad de la rejilla de nominados: cuántas columnas y de qué tamaño.
 *
 * Depende de tres cosas a la vez: el ancho real disponible, CUÁNTOS nominados hay y cómo se reparten en filas.
 * Con pocos interesan tarjetas grandes; con muchos, que quepan todos sin scroll. La tabla está calibrada a mano
 * por rangos, así que vive aquí como cálculo puro y con pruebas, y no como cuarenta líneas en mitad del render.
 *
 * LOS DATOS REALES MANDAN: las categorías tienen entre 4 y 6 nominados (la mayoría 5), con nombres de hasta unos
 * 46 caracteres. El reparto está afinado para 4-7, que es el caso normal, sin dejar de funcionar fuera de ahí.
 *
 * Los anchos mínimos salen del mosaico de la biblioteca (ver `densityFor`); lo que protegen las pruebas es la
 * forma de repartir, sobre todo que no quede una tarjeta sola en la última fila.
 */

/**
 * Ancho máximo del contenido.
 *
 * En un monitor ultra-ancho, repartir 2560 px entre cinco tarjetas da tarjetas de 500 px con un nombre diminuto
 * en el centro: la pantalla crece y lo que se lee no mejora. A partir de aquí el contenido se centra en vez de
 * estirarse.
 */
export const CONTENT_MAX_WIDTH_PX = 1680;

/** Margen lateral que la rejilla nunca usa. */
const SIDE_PADDING_PX = 32;

/** Alto mínimo legible de una tarjeta. Por debajo, es preferible el scroll a seguir comprimiendo. */
export const MIN_CARD_HEIGHT_PX = 62;

export interface GridContext {
  /**
   * Ancho REAL DISPONIBLE, en píxeles: el del contenedor de la rejilla, no el de la ventana.
   *
   * La aplicación de origen pasaba aquí el viewport y luego le restaba un margen a ojo. Medir el contenedor es
   * lo que hace el resto de esta app (`GameTable`, `BottomNavigation`) y es más fiel: descuenta los márgenes
   * reales y la barra de desplazamiento, que en Linux se come unos quince píxeles y ya ha hecho fallar
   * comprobaciones de ancho en integración continua.
   */
  width: number;
  optionCount: number;
  isMobile: boolean;
  isLandscape: boolean;
}

interface Density {
  minCardWidthPx: number;
  maxColumns: number;
}

/**
 * Ancho mínimo de tarjeta y tope de columnas para cada situación.
 *
 * LA TARJETA LLEVA SIEMPRE CARÁTULA (ver `NomineeCard`), así que es la misma caja que el mosaico de la
 * biblioteca: estrecha y alta, con portada 3:4. Los anchos son los de `GRID_CARD_MIN_PX` de `GameTable`
 * (150 / 205 / 268 según la perilla), tomando el paso de en medio: es la medida con la que una portada 3:4 se lee
 * como portada y el título cabe debajo en dos líneas. Aquí no hay perilla, así que se escala con el hueco
 * disponible. La calibración de la tarjeta sin portada, que traía la porra de origen, se retiró con esa tarjeta
 * el 24-09-2026.
 */
function densityFor({ width, isMobile, isLandscape }: GridContext): Density {
  if (isMobile && !isLandscape) {
    // Dos columnas en un teléfono, igual que el mosaico: con tres, la portada baja de 110 px y deja de serlo.
    return width <= 360 ? { minCardWidthPx: 145, maxColumns: 2 } : { minCardWidthPx: 155, maxColumns: 3 };
  }
  if (isMobile && isLandscape) return { minCardWidthPx: 150, maxColumns: 5 };
  if (width < 900) return { minCardWidthPx: 180, maxColumns: 4 };
  if (width < 1280) return { minCardWidthPx: 195, maxColumns: 5 };
  if (width < 1600) return { minCardWidthPx: 205, maxColumns: 6 };
  return { minCardWidthPx: 215, maxColumns: 7 };
}

/**
 * Reparto de nominados en columnas, evitando la fila huérfana.
 *
 * Entre los repartos que ocupan el MISMO número de filas gana el que deja la última fila más llena: con 6
 * nominados y sitio para 5 columnas, 3+3 se lee mucho mejor que 5+1; con 7 y sitio para 6, 4+3 mejor que 6+1.
 * Menos filas siempre gana sobre mejor reparto: ver la categoría entera de un vistazo es lo primero.
 */
export function balanceColumns(maxColumns: number, optionCount: number): number {
  const limit = Math.max(1, Math.min(maxColumns, optionCount));

  let best = 1;
  let bestRows = Infinity;
  let bestLastRow = 0;

  for (let columns = 1; columns <= limit; columns += 1) {
    const rows = Math.ceil(optionCount / columns);
    // Cuántas tarjetas quedan en la última fila (una fila exacta = todas las columnas).
    const lastRow = optionCount % columns === 0 ? columns : optionCount % columns;

    if (rows < bestRows || (rows === bestRows && lastRow > bestLastRow)) {
      best = columns;
      bestRows = rows;
      bestLastRow = lastRow;
    }
  }

  return best;
}

/**
 * Columnas de la rejilla.
 *
 * Nunca más columnas que nominados, ni más de las que caben por ancho, ni más que el tope de la calibración; y
 * dentro de eso, el reparto más equilibrado.
 */
export function getGridColumns({ width, optionCount, isMobile, isLandscape }: GridContext): number {
  // Sin restar ningún margen: `width` YA es el hueco disponible (ver `GridContext`). El `- 24` que había aquí
  // descontaba dos veces el mismo espacio y estrechaba las tarjetas sin motivo.
  const safeWidth = Math.max(320, width || 320);
  const density = densityFor({ width: width || 320, optionCount, isMobile, isLandscape });

  const columnsByWidth = Math.max(1, Math.floor(safeWidth / density.minCardWidthPx));
  const fitting = Math.min(density.maxColumns, columnsByWidth);

  return balanceColumns(fitting, optionCount || 1);
}

/**
 * Ancho aproximado de cada tarjeta con ese reparto.
 *
 * Sirve para decidir la densidad de la TARJETA por el espacio que de verdad le toca, y no por el número de
 * nominados: cinco en un monitor grande son tarjetas holgadas, y las mismas cinco en una tablet vertical son
 * estrechas.
 */
export function estimateCardWidth({ width, columns }: { width: number; columns: number }): number {
  const usable = Math.min(Math.max(280, (width || 320) - SIDE_PADDING_PX), CONTENT_MAX_WIDTH_PX);
  return Math.floor(usable / Math.max(1, columns));
}

/** Alto que le toca a cada tarjeta repartiendo el área entre las filas. 0 si todavía no hay medida. */
export function cardHeightFor({
  areaHeight,
  rows,
  gapPx,
  reservedPx = 0,
}: {
  areaHeight: number;
  rows: number;
  gapPx: number;
  reservedPx?: number;
}): number {
  if (!areaHeight || rows < 1) return 0;
  const usable = areaHeight - gapPx * (rows - 1) - reservedPx;
  return Math.floor(usable / rows);
}
