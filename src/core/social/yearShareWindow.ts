/**
 * LA VENTANA DE COMPARTIR EL RESUMEN DEL AÑO, vista desde el SERVIDOR (ver docs/plan-resumen-del-ano.md, Fase 4).
 *
 * El cliente decide con la hora local (`isShareSeason`: del 15 de diciembre al 15 de enero), pero la Function solo
 * conoce UTC y quien comparte puede estar en cualquier huso. Por eso aquí la ventana va de las 10:00 UTC del 14 de
 * diciembre (las 00:00 del 15 en UTC+14) a las 12:00 UTC del 16 de enero (las 24:00 del 15 en UTC−12): cubre los
 * dos días 15 completos en cualquier huso, y apenas nada más. El cierre es también la CADUCIDAD del enlace, sea cual sea el rango.
 *
 * Lo leen la Function y el cliente: SIN dependencias de ejecución, como `constants/tiers.ts` (solo un tipo).
 */

import type { ProfileTier } from '../constants/tiers';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Días de espera entre dos actualizaciones del enlace del RESUMEN DEL AÑO, por rango (decisión del usuario,
 * 12-10-2026). Actualizar reescribe el mismo artículo, así que lo que protege es el cupo de escrituras de KV, no el
 * número de enlaces. Lo aplica la Function; el cliente solo enseña la fecha, y nunca el rango (los rangos no se
 * nombran ante quien no administra).
 *
 * Aquí y no en `constants/tiers.ts` con el resto de límites por rango: aquel módulo va en el ARRANQUE, y todo lo
 * que exporta y alguien usa viaja con él aunque solo lo lea una pantalla perezosa (medido el 12-10-2026).
 */
export const PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS: Record<ProfileTier, number> = {
  bronze: 7, // 5 hasta el 13-10-2026, decisión del usuario
  silver: 5, // 3 hasta el 13-10-2026
  gold: 2,
  mithril: 1,
};

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
