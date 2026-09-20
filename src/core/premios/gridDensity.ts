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
 * ⚠️ ESTA CALIBRACIÓN ESTÁ MEDIDA CONTRA OTRA MAQUETA. Los números vienen de la aplicación de origen, que usaba
 * utilidades de Tailwind: otros márgenes, otro interlineado y otra tipografía. Al rehacer la pantalla con el
 * sistema de esta casa (F3 del plan) hay que VOLVER A MEDIR los anchos mínimos y los topes de columnas — lo que
 * no cambia es la forma de repartir, que es lo que estas pruebas protegen.
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

/** Ancho mínimo de tarjeta y tope de columnas para cada situación. */
function densityFor({ width, optionCount, isMobile, isLandscape }: GridContext): Density {
  const isMobilePortrait = isMobile && !isLandscape;

  if (isMobilePortrait) {
    // Hasta 430 px se mantienen dos columnas para evitar el salto brusco de 5 nominados en dos columnas y 6 en
    // tres, que en un móvil de tamaño medio se nota mucho.
    if (width <= 360) return { minCardWidthPx: 130, maxColumns: 2 };
    if (width <= 430) return { minCardWidthPx: 150, maxColumns: 2 };
    // Móviles grandes: la tercera columna solo compensa con muchos nominados; con 4 o 5 las tarjetas quedarían
    // más estrechas que el propio texto.
    if (optionCount >= 6) return { minCardWidthPx: 160, maxColumns: 3 };
    return { minCardWidthPx: 180, maxColumns: 2 };
  }

  if (isMobile && isLandscape) {
    // Apaisado lo escaso es el ALTO: más columnas para que quepan sin scroll.
    if (optionCount <= 4) return { minCardWidthPx: 165, maxColumns: 4 };
    if (optionCount <= 6) return { minCardWidthPx: 180, maxColumns: 3 };
    return { minCardWidthPx: 165, maxColumns: 4 };
  }

  // Tablet vertical. Dos columnas dejaban tarjetas larguísimas y tres filas con scroll con 6 nominados. La cuarta
  // columna se abre solo a partir de 7, donde tres dejarían una tarjeta sola en la última fila (3+3+1).
  if (width < 900) {
    return optionCount >= 7
      ? { minCardWidthPx: 175, maxColumns: 4 }
      : { minCardWidthPx: 205, maxColumns: 3 };
  }

  // Portátiles pequeños y tablets apaisadas.
  if (width < 1280) {
    return optionCount >= 7
      ? { minCardWidthPx: 210, maxColumns: 4 }
      : { minCardWidthPx: 230, maxColumns: 3 };
  }

  // Portátiles y monitores normales.
  if (width < 1600) return { minCardWidthPx: 240, maxColumns: 4 };

  // Monitores grandes: caben cinco o seis en una sola fila, que es lo ideal para una categoría de ese tamaño.
  if (width < 2000) return { minCardWidthPx: 250, maxColumns: 6 };

  return { minCardWidthPx: 280, maxColumns: 7 };
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
