// Escala del eje temporal, elegida a partir del recorrido REAL de los datos.
//
// Por qué existe: un eje fijo en años deja un gráfico de tres meses con una sola marca —o ninguna— y el
// dibujo no transmite nada; y uno fijo en meses llena de rótulos ilegibles una biblioteca de doce años. Aquí
// se elige el escalón (día, semana, mes, trimestre, año…) que deja un puñado de marcas repartidas por todo el
// ancho, sea cual sea el periodo. Puro y sin reloj del sistema: las fechas llegan como argumento.

/** Granularidad de las marcas; decide también cómo se rotulan (ver `formatTick` en la vista). */
export type TimeUnit = 'day' | 'month' | 'year';

export interface TimeTick {
  at: number;
  unit: TimeUnit;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Escalones candidatos, de más fino a más grueso. Se toma el primero que deje como mucho `maxTicks` marcas,
 * de modo que el eje siempre tenga entre tres y seis referencias repartidas: ni una sola perdida en medio, ni
 * una hilera apelmazada.
 */
const STEPS: Array<{ unit: TimeUnit; every: number; approx: number }> = [
  { unit: 'day', every: 1, approx: DAY },
  { unit: 'day', every: 2, approx: 2 * DAY },
  { unit: 'day', every: 7, approx: 7 * DAY },
  { unit: 'day', every: 14, approx: 14 * DAY },
  { unit: 'month', every: 1, approx: 30 * DAY },
  { unit: 'month', every: 2, approx: 61 * DAY },
  { unit: 'month', every: 3, approx: 91 * DAY },
  { unit: 'month', every: 6, approx: 182 * DAY },
  { unit: 'year', every: 1, approx: 365 * DAY },
  { unit: 'year', every: 2, approx: 730 * DAY },
  { unit: 'year', every: 5, approx: 1826 * DAY },
  { unit: 'year', every: 10, approx: 3652 * DAY },
];

/** Primer instante del escalón que contiene a `at` (día, mes o año redondos). */
function floorTo(at: number, unit: TimeUnit): Date {
  const date = new Date(at);
  if (unit === 'year') return new Date(date.getFullYear(), 0, 1);
  if (unit === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function advance(date: Date, unit: TimeUnit, every: number): Date {
  if (unit === 'year') return new Date(date.getFullYear() + every, 0, 1);
  if (unit === 'month') return new Date(date.getFullYear(), date.getMonth() + every, 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + every);
}

/**
 * Marcas del eje entre dos fechas. Devuelve solo las que caen dentro del intervalo, ya alineadas al escalón
 * (primero de mes, 1 de enero…), que es lo que hace que las referencias sean redondas y no fechas arbitrarias.
 */
export function timeTicks(from: number, to: number, maxTicks = 6, minUnit: TimeUnit = 'day'): TimeTick[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const span = to - from;
  // `minUnit` lo impone quien dibuja: una serie agrupada por meses no puede rotular días, porque dos marcas
  // del mismo mes caerían en la misma posición y se pintarían una encima de otra.
  const allowed = STEPS.filter((candidate) => (minUnit === 'year' ? candidate.unit === 'year'
    : minUnit === 'month' ? candidate.unit !== 'day'
      : true));
  const step = allowed.find((candidate) => span / candidate.approx <= maxTicks) ?? allowed[allowed.length - 1];

  const ticks: TimeTick[] = [];
  // Se arranca en el escalón redondo ANTERIOR al inicio y se avanza: así las marcas caen siempre en fechas
  // redondas, aunque los datos empiecen a mitad de mes.
  let cursor = floorTo(from, step.unit);
  for (let guard = 0; guard < 400; guard += 1) {
    const at = cursor.getTime();
    if (at > to) break;
    if (at >= from) ticks.push({ at, unit: step.unit });
    cursor = advance(cursor, step.unit, step.every);
  }
  return ticks;
}
