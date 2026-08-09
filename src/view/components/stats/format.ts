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

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });

/** Etiqueta corta de un mes `AAAA-MM` para el eje del gráfico ("ene 24"). */
export function formatMonthLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return `${MONTH_SHORT.format(date).replace('.', '')} ${match[1].slice(2)}`;
}

/** Mes y año de una marca de tiempo ("may 2024"); vacío si no hay fecha utilizable. */
export function formatMonthYear(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return MONTH_YEAR.format(new Date(ms)).replace('.', '');
}

const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** Rótulo de una marca del eje temporal, según su granularidad: "3 mar", "mar 25" o "2025". */
export function formatTick(at: number, unit: 'day' | 'month' | 'year'): string {
  const date = new Date(at);
  if (unit === 'year') return String(date.getFullYear());
  if (unit === 'month') return `${MONTH_SHORT.format(date).replace('.', '')} ${String(date.getFullYear()).slice(2)}`;
  return DAY_MONTH.format(date).replace('.', '');
}

/** Porcentaje entero, para el aro de completados. */
export function formatPercent(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}
