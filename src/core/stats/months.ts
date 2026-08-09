// Utilidades del eje temporal mensual, compartidas por la curva derivada (entradas por `listedAt`) y por el
// histórico real (instantáneas mensuales). Puras y sin reloj del sistema: los meses llegan ya calculados.
import type { ArrivalPoint } from './types';

/** Cuántos meses se representan como mucho. Dos años entran en pantalla y siguen siendo legibles. */
export const MONTH_WINDOW = 24;

/** Descompone `AAAA-MM`; devuelve null si no tiene esa forma. */
function parseMonth(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

/** Mes siguiente a `AAAA-MM`. */
export function nextMonth(key: string): string {
  const parsed = parseMonth(key);
  if (!parsed) return key;
  const rolls = parsed.month === 12;
  const year = rolls ? parsed.year + 1 : parsed.year;
  const month = rolls ? 1 : parsed.month + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Rellena los meses sin datos entre el primero y el último, y recorta a la ventana.
 *
 * Sin esto, un año sin altas se dibujaría como dos columnas contiguas y el eje mentiría sobre el ritmo: un
 * hueco es información, y en un gráfico de evolución es justo la que interesa.
 */
export function fillMonthGaps(points: ArrivalPoint[], window = MONTH_WINDOW): ArrivalPoint[] {
  const valid = points.filter((point) => parseMonth(point.m));
  if (valid.length === 0) return [];

  const byMonth = new Map(valid.map((point) => [point.m, point]));
  const sorted = [...byMonth.keys()].sort();
  const last = sorted[sorted.length - 1];

  const filled: ArrivalPoint[] = [];
  let cursor = sorted[0];
  // La cota es la propia ventana más un margen: no hace falta materializar veinte años de ceros para luego
  // tirarlos, pero sí recorrer lo justo para que el recorte final caiga donde debe.
  for (let guard = 0; guard < 1200; guard += 1) {
    filled.push(byMonth.get(cursor) || { m: cursor, c: 0, v: 0, e: 0, p: 0 });
    if (cursor === last) break;
    cursor = nextMonth(cursor);
  }

  return filled.slice(-window);
}
