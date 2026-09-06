// Derivaciones compartidas de las métricas de logro. Ver docs/plan-logros.md §7.5.
//
// POR QUÉ NO SE IMPORTA `core/stats`. Varias de estas cifras las calcula ya `computeStats`, pero ese módulo
// arrastra el chunk perezoso del panel (~96 kB) y el evaluador corre también desde la ruta de publicación, así
// que importarlo metería el panel entero en el arranque y `ci-validate` cortaría el build (§7.2). Se duplica lo
// mínimo, apoyándose en los ayudantes compartidos que ya existen (`resolveGrade`, `localWeekKey`).
//
// LA REGLA QUE GOBIERNA ESTE FICHERO, y es la que se rompe sola al añadir el logro número 33: **ninguna métrica
// puede tratar un campo ausente como un valor**. `resolveGrade` devuelve 0 para un juego sin nota, y 0 cae dentro
// de «menos de 40»; una lista vacía es cierta para quien vació su pila Y para quien acaba de instalar la app; un
// denominador a cero no es un 0 %, es una división imposible. Cada guarda de abajo tapa uno de esos casos y
// todas están citadas en el §7.5.
import { localDayKey, localMonthKey, localWeekKey, mondayOfWeekKey } from '../utils/dateTime';
import { resolveGrade } from '../utils/scoreScale';
import { LIBRARY_TABS } from './types';
import type { GameItem, TabData, TabId } from '../../model/types/game';

/** Todos los juegos de las cuatro listas, con la lista en la que están. */
export function allGames(games: TabData): Array<{ game: GameItem; tab: TabId }> {
  const out: Array<{ game: GameItem; tab: TabId }> = [];
  for (const tab of LIBRARY_TABS) {
    for (const game of games[tab] || []) out.push({ game, tab });
  }
  return out;
}

/** Lo CERRADO: terminado o abandonado. Es el universo de varias métricas de la familia «datos». */
export function closedGames(games: TabData): GameItem[] {
  return [...(games.c || []), ...(games.v || [])];
}

/**
 * Nota EFECTIVA, y solo si existe.
 *
 * `resolveGrade` devuelve 0 cuando no hay ni `grade` ni `score`, así que un juego sin puntuar es indistinguible
 * de uno puntuado con un 0. Toda métrica que mire hacia abajo (`< 40`) o que cuente notas tiene que pasar por
 * aquí; las que miran hacia arriba (`== 100`, `>= 70`) no se ven afectadas, pero la usan igual para que no haya
 * que recordar cuál es cuál. Ver §7.5.
 */
export function gradeIfScored(game: GameItem): number | null {
  const grade = resolveGrade(game);
  return grade > 0 ? grade : null;
}

/** Sello de entrada a una lista concreta, o 0. */
export function enteredAt(game: GameItem, tab: TabId): number {
  const value = game.enteredAt?.[tab];
  return typeof value === 'number' && value > 0 ? value : 0;
}

/** El sello de entrada MÁS ANTIGUO del juego, sea de la lista que sea. La mejor fecha disponible. */
export function firstEnteredAt(game: GameItem): number {
  let best = 0;
  for (const tab of LIBRARY_TABS) {
    const stamp = enteredAt(game, tab);
    if (stamp > 0 && (best === 0 || stamp < best)) best = stamp;
  }
  return best;
}

/** Fin del año natural, en hora local. La fecha honesta de lo que solo se sabe por año (`years`, §6.8). */
export function endOfYear(year: number): number {
  return new Date(year, 11, 31, 12, 0, 0, 0).getTime();
}

/** Los años de `years` que son números de año plausibles. */
export function playedYears(game: GameItem): number[] {
  const years = Array.isArray(game.years) ? game.years : [];
  return years.filter((year) => typeof year === 'number' && year >= 1970 && year <= 2200);
}

/** ¿Tiene texto de reseña? */
export function hasReview(game: GameItem): boolean {
  return String(game.review || '').trim().length > 0;
}

/** ¿Tiene razón de abandono anotada? */
export function hasReason(game: GameItem): boolean {
  return Array.isArray(game.reasons) && game.reasons.some((reason) => String(reason || '').trim().length > 0);
}

/** Horas anotadas, o null. `hours` es `number | null` y el 0 no es «anotado». */
export function hoursOf(game: GameItem): number | null {
  return typeof game.hours === 'number' && game.hours > 0 ? game.hours : null;
}

/**
 * Todos los sellos FECHABLES de la biblioteca: entradas a lista, reseñas y cambios de nota.
 *
 * Es la materia prima de las métricas de calendario (rachas de semanas, año redondo). `listedAt` NO entra, y esa
 * ausencia es deliberada: en un juego catalogado hacia atrás esa fecha es la de catalogarlo, no la de nada que
 * pasara, y compararse contra ella es el falso positivo que el §6.8 midió (42 aciertos, los 42 falsos).
 */
export function activityStamps(games: TabData): number[] {
  const stamps: number[] = [];
  for (const { game } of allGames(games)) {
    for (const tab of LIBRARY_TABS) {
      const stamp = enteredAt(game, tab);
      if (stamp > 0) stamps.push(stamp);
    }
    if (typeof game.reviewedAt === 'number' && game.reviewedAt > 0) stamps.push(game.reviewedAt);
    if (typeof game.gradedAt === 'number' && game.gradedAt > 0) stamps.push(game.gradedAt);
  }
  return stamps;
}

/**
 * Racha MÁS LARGA de semanas naturales consecutivas con actividad, y cuándo se alcanzó cada longitud.
 *
 * Devuelve `at[n-1]` = el sello más tardío de la semana que completó una racha de `n`. Se queda con el instante
 * MÁS TEMPRANO en que se llegó a esa longitud, que es lo que hace que la fecha no se mueva al seguir usando la
 * app: un logro conseguido en marzo no puede pasar a decir que fue en agosto.
 */
export function bestWeekStreak(stamps: number[]): { value: number; at: number[] } {
  if (stamps.length === 0) return { value: 0, at: [] };

  // Último instante de cada semana, para poder fechar el momento en que la racha llegó a N.
  const lastByWeek = new Map<string, number>();
  for (const stamp of stamps) {
    const key = localWeekKey(stamp);
    const current = lastByWeek.get(key) || 0;
    if (stamp > current) lastByWeek.set(key, stamp);
  }

  const weeks = [...lastByWeek.keys()].sort();
  const at: number[] = [];
  let run = 0;
  let previous = 0;

  for (const key of weeks) {
    const monday = mondayOfWeekKey(key).getTime();
    if (Number.isNaN(monday)) continue;
    run = previous > 0 && isNextWeek(previous, monday) ? run + 1 : 1;
    previous = monday;
    // Solo la PRIMERA vez que se alcanza cada longitud: rachas posteriores no reescriben la fecha.
    if (at.length < run) at.push(lastByWeek.get(key) || 0);
  }

  return { value: at.length, at };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Son dos lunes consecutivos? Se compara en DÍAS REDONDEADOS y no en milisegundos exactos: los dos lunes vienen
 * a mediodía (`mondayOfWeekKey`), y un cambio de horario de verano entre ambos deja la diferencia en 7 días ± 1
 * hora. Con una igualdad exacta, la racha de todo el mundo se partiría dos veces al año.
 */
function isNextWeek(previousMonday: number, monday: number): boolean {
  return Math.round((monday - previousMonday) / DAY_MS) === 7;
}

/**
 * Curva de STOCK de Próximos, mes a mes, reconstruida desde `enteredAt`.
 *
 * NO usa `backlogHistory`: esa serie es una instantánea mensual que vive en el meta de IndexedDB, es local y por
 * dispositivo, y su propio módulo avisa de que quien use dos aparatos tendrá dos series parciales. Un logro
 * calculado con eso diría cosas distintas en el móvil y en el portátil, que es lo único que este sistema no puede
 * permitirse (§6.2.1). `enteredAt` viaja en el gist y es estable, así que la reconstrucción es idéntica en
 * cualquier aparato y en cualquier momento.
 *
 * Devuelve los meses ordenados con su variación neta: entradas a Próximos menos salidas hacia una lista jugada.
 */
export function backlogDeltas(games: TabData): Array<{ month: string; delta: number; at: number }> {
  const byMonth = new Map<string, { delta: number; at: number }>();

  const bump = (stamp: number, amount: number): void => {
    if (stamp <= 0) return;
    const month = localMonthKey(stamp);
    const entry = byMonth.get(month) || { delta: 0, at: 0 };
    entry.delta += amount;
    if (stamp > entry.at) entry.at = stamp;
    byMonth.set(month, entry);
  };

  for (const { game } of allGames(games)) {
    const arrived = enteredAt(game, 'p');
    if (arrived <= 0) continue;
    bump(arrived, 1);
    // La salida es la entrada a una lista JUGADA posterior a la de Próximos. Se toma la más temprana: es la que
    // sacó el juego de la pila, y las demás son movimientos posteriores entre listas jugadas.
    let left = 0;
    for (const tab of ['c', 'v', 'e'] as const) {
      const stamp = enteredAt(game, tab);
      if (stamp > arrived && (left === 0 || stamp < left)) left = stamp;
    }
    bump(left, -1);
  }

  return [...byMonth.entries()]
    .map(([month, entry]) => ({ month, delta: entry.delta, at: entry.at }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Racha más larga de meses consecutivos a la baja, con la fecha en que se alcanzó cada longitud. */
export function bestDownStreak(deltas: Array<{ month: string; delta: number; at: number }>): { value: number; at: number[] } {
  const at: number[] = [];
  let run = 0;
  let previous = '';

  for (const entry of deltas) {
    if (entry.delta >= 0) {
      run = 0;
      previous = entry.month;
      continue;
    }
    run = previous && isNextMonth(previous, entry.month) ? run + 1 : 1;
    previous = entry.month;
    if (at.length < run) at.push(entry.at);
  }

  return { value: at.length, at };
}

function isNextMonth(previous: string, current: string): boolean {
  const [py, pm] = previous.split('-').map(Number);
  const [cy, cm] = current.split('-').map(Number);
  if (!Number.isFinite(py) || !Number.isFinite(cy)) return false;
  return cy * 12 + cm === py * 12 + pm + 1;
}

/** Desviación típica poblacional. 0 con menos de dos valores. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** ¿Caen los dos sellos el mismo día LOCAL? Es la comparación que define «Speedrun» (§6.8). */
export function sameLocalDay(a: number, b: number): boolean {
  return a > 0 && b > 0 && localDayKey(a) === localDayKey(b);
}

/** Sellos de CIERRE: la entrada a Terminados o Abandonados. La materia prima del ritmo mensual. */
export function closedStamps(games: TabData): number[] {
  const stamps: number[] = [];
  for (const tab of ['c', 'v'] as const) {
    for (const game of games[tab] || []) {
      const stamp = enteredAt(game, tab);
      if (stamp > 0) stamps.push(stamp);
    }
  }
  return stamps;
}

/**
 * Racha más larga de MESES naturales consecutivos con actividad, y cuándo se alcanzó cada longitud.
 *
 * Gemela de `bestWeekStreak` y separada de ella a propósito: comparar meses por milisegundos no funciona —no
 * miden todos lo mismo— así que la contigüidad se decide sobre la clave `AAAA-MM`, que es exacta por
 * construcción. Se queda con el instante MÁS TEMPRANO en que se llegó a cada longitud, para que la fecha de un
 * logro no se mueva al seguir usando la app.
 */
export function bestMonthStreak(stamps: number[]): { value: number; at: number[] } {
  if (stamps.length === 0) return { value: 0, at: [] };

  const lastByMonth = new Map<string, number>();
  for (const stamp of stamps) {
    const key = localMonthKey(stamp);
    if (stamp > (lastByMonth.get(key) || 0)) lastByMonth.set(key, stamp);
  }

  const months = [...lastByMonth.keys()].sort();
  const at: number[] = [];
  let run = 0;
  let previous = '';

  for (const month of months) {
    run = previous && isNextMonth(previous, month) ? run + 1 : 1;
    previous = month;
    if (at.length < run) at.push(lastByMonth.get(month) || 0);
  }

  return { value: at.length, at };
}

/** Racha más larga de AÑOS consecutivos presentes en `years`, con la fecha de cada longitud. */
export function bestYearStreak(years: number[]): { value: number; at: number[] } {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const at: number[] = [];
  let run = 0;
  let previous = 0;

  for (const year of sorted) {
    run = previous > 0 && year === previous + 1 ? run + 1 : 1;
    previous = year;
    if (at.length < run) at.push(endOfYear(year));
  }

  return { value: at.length, at };
}

/**
 * Curva de STOCK de Próximos mes a mes: el máximo que llegó a tener y con qué se queda al final.
 *
 * Se reconstruye desde `backlogDeltas` —y por tanto desde `enteredAt`, nunca desde `backlogHistory`, que es local
 * y por dispositivo (§6.2.1)—. El `peak` es lo que convierte «bajar la pila» en algo medible: sin él, quien nunca
 * acumuló nada tendría el mismo cero que quien vació doscientos.
 */
export function backlogCurve(games: TabData): { peak: number; current: number; at: number } {
  let stock = 0;
  let peak = 0;
  let at = 0;
  for (const entry of backlogDeltas(games)) {
    stock += entry.delta;
    if (stock > peak) peak = stock;
    if (entry.at > at) at = entry.at;
  }
  return { peak, current: Math.max(0, stock), at };
}

/** Cuántos juegos hay ahora mismo en Próximos. Lo que mide una escalera descendente, sin reconstruir nada. */
export function backlogSize(games: TabData): number {
  return (games.p || []).length;
}
