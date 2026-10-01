import type { GameItem } from '../../model/types/game';

/**
 * CUÁNDO SE TERMINÓ UN JUEGO, para el resumen del año. Puro.
 *
 * El dato sale de `enteredAt.c`: el sello de la PRIMERA entrada en completados, que nadie teclea (ver
 * `GameItem.enteredAt`). Es la mejor aproximación que hay a «el día que lo terminé», con dos trampas que se
 * resuelven aquí y no en cada lector:
 *
 *  - LAS CARGAS EN BLOQUE. Una importación o una migración meten muchos juegos en completados el mismo día, y esa
 *    fecha no es la de terminarlos. Un día con `BULK_DAY_MIN` o más entradas se descarta entero: esos juegos
 *    siguen contando para todo lo demás, pero no tienen fecha. Mejor un juego sin fecha que un «marzo: 40».
 *  - LAS REJUGADAS. El sello es de la primera vez; la segunda (otro año en `years`) no lo mueve. Eso lo resuelve
 *    quien lee, que sabe de qué año pregunta (ver `core/stats/yearSummary`).
 *
 * El día se calcula en la zona horaria de quien lo lee. Para el perfil propio es la del dueño; para el de otra
 * persona puede diferir unas horas en el borde de un día o de un mes, que para un resumen anual no cambia nada.
 */

/** Con cuántas entradas en completados el mismo día se considera una carga en bloque, no juegos terminados. */
export const BULK_DAY_MIN = 5;

/**
 * Con qué precisión se ENSEÑA la fecha. Las amistades ven el mes; el día —que dice qué días juega alguien— solo
 * su dueño y la cuenta de administración (ver `applyProfileVisibility`).
 */
export type FinishPrecision = 'month' | 'day';

/**
 * Un juego con su fecha de fin ya recortada a la precisión que le toca a quien mira: `AAAA-MM` o `AAAA-MM-DD`.
 *
 * Es un campo DERIVADO y de memoria: lo añade el filtro de visibilidad al juego de otra persona (que nunca se
 * guarda en las listas propias: copiar un juego ajeno construye uno nuevo, ver `addGameToProximos`) y el resumen
 * propio al leer. No es parte del modelo del gist y no se escribe en ningún sitio.
 */
export type FinishedGame = GameItem & { finishedOn?: string };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `AAAA-MM-DD` del instante en la zona horaria local. */
export function localDayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Día de fin (`AAAA-MM-DD`) de cada juego de la lista que lo tenga, sin los días de carga en bloque.
 *
 * Recibe la lista de completados ENTERA y no un juego suelto porque la carga en bloque solo se ve mirando todos:
 * un sello no sabe si cayó el mismo día que otros cuarenta.
 */
export function finishDays(completed: readonly GameItem[]): Map<number, string> {
  const byGame = new Map<number, string>();
  const perDay = new Map<string, number>();
  for (const game of completed) {
    const stamp = Number(game.enteredAt?.c);
    if (!Number.isFinite(stamp) || stamp <= 0) continue;
    const key = localDayKey(stamp);
    byGame.set(game.id, key);
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  for (const [id, key] of byGame) {
    if ((perDay.get(key) || 0) >= BULK_DAY_MIN) byGame.delete(id);
  }
  return byGame;
}

/**
 * La lista de completados con `finishedOn` puesto a la precisión pedida. No toca nada más del juego, y el que no
 * tiene fecha (o la tiene en un día de carga en bloque) sale sin el campo.
 */
export function withFinishedOn<T extends GameItem>(completed: readonly T[], precision: FinishPrecision): Array<T & { finishedOn?: string }> {
  const days = finishDays(completed);
  return completed.map((game) => {
    const day = days.get(game.id);
    if (!day) return game;
    return { ...game, finishedOn: precision === 'day' ? day : day.slice(0, 7) };
  });
}
