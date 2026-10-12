/**
 * LA VENTANA DE COMPARTIR EL RESUMEN DEL AÑO, vista desde el SERVIDOR (ver docs/plan-resumen-del-ano.md, Fase 4).
 *
 * El cliente decide con la hora local (`isShareSeason`: del 15 de diciembre al 15 de enero), pero la Function solo
 * conoce UTC y quien comparte puede estar en cualquier huso. Por eso aquí la ventana va de las 10:00 UTC del 14 de
 * diciembre (las 00:00 del 15 en UTC+14) a las 12:00 UTC del 16 de enero (las 24:00 del 15 en UTC−12): cubre los
 * dos días 15 completos en cualquier huso, y apenas nada más. El cierre es también la CADUCIDAD del enlace, sea cual sea el rango.
 *
 * Lo leen la Function y el cliente: SIN dependencias, como `constants/tiers.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface YearShareWindow {
  /** El año que se comparte: en diciembre el que acaba, en enero el anterior. */
  year: number;
  opensAt: number;
  /** Cierre de la ventana y caducidad de todos los enlaces de ese año. */
  closesAt: number;
}

/** La ventana abierta en `now`, o `null` si no hay ninguna. */
export function yearShareWindow(now: number): YearShareWindow | null {
  const date = new Date(now);
  const utcYear = date.getUTCFullYear();
  const year = date.getUTCMonth() === 11 ? utcYear : utcYear - 1;
  const opensAt = Date.UTC(year, 11, 14, 10);
  const closesAt = Date.UTC(year + 1, 0, 16, 12);
  return now >= opensAt && now < closesAt ? { year, opensAt, closesAt } : null;
}

/** Cuándo se puede volver a actualizar un enlace actualizado en `updatedAt`, con la espera de su rango en días. */
export function nextYearShareUpdateAt(updatedAt: number, waitDays: number): number {
  return updatedAt + waitDays * DAY_MS;
}
