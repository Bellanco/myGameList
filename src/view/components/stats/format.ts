// Formateo de números del panel. Se instancian los `Intl.NumberFormat` UNA vez a nivel de módulo: crearlos en
// cada render es de lo más caro que hay en `Intl`, y aquí se llaman una vez por barra.
const INTEGER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
// Con decimal SIEMPRE: una media de 3,986 formateada "a lo sumo un decimal" sale "4" y se lee como un valor
// exacto. La media casi nunca lo es, así que el "4,0" es más honesto que el "4".
const AVERAGE = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Entero con separador de millares (1234 → "1.234"). */
export function formatCount(value: number): string {
  return INTEGER.format(Math.round(value));
}

/**
 * Horas legibles: con decimal solo cuando aporta (2,5 h sí; 120 h no). Los totales grandes se redondean, que es
 * como se leen ("340 h", no "340,4 h").
 */
export function formatHours(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value < 100 ? ONE_DECIMAL.format(value) : INTEGER.format(Math.round(value));
}

/** Un decimal siempre (notas medias: "3,8" y "80,0" se leen como lo que son, una media). */
export function formatDecimal(value: number): string {
  return AVERAGE.format(Number.isFinite(value) ? value : 0);
}

/** Porcentaje entero, para el aro de completados. */
export function formatPercent(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}
