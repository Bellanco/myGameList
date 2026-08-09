// Histórico del backlog: una instantánea mensual con el tamaño de cada lista.
//
// POR QUÉ EXISTE Y POR QUÉ ANTES QUE SU GRÁFICO: la evolución del backlog no se puede reconstruir a
// posteriori. `listedAt` marca la llegada a la lista ACTUAL y se reescribe al mover un juego de lista, así que
// nada en los datos dice cuántos juegos había en "próximos" hace seis meses. La serie solo puede construirse
// hacia delante, y cada mes sin registrar es un punto que se pierde para siempre: por eso el registrador entra
// aunque la pantalla que lo pintará llegue después.
//
// ALCANCE: local y por dispositivo. Vive en el meta de IndexedDB (que nunca sube), no toca el gist, no entra en
// el merge CRDT y no se proyecta al canal social. Consecuencia asumida: quien use dos dispositivos tendrá dos
// series parciales, cada una con los meses en que usó ese dispositivo.
import { getLocalMeta, patchLocalMeta } from './indexedDbRepository';
import type { BacklogSnapshot } from '../types/local';
import type { GameItem, TabData } from '../types/game';

/** Meses que se conservan (10 años). Cota dura del tamaño: ~40 bytes por punto. */
export const BACKLOG_HISTORY_LIMIT = 120;

/**
 * Mes `AAAA-MM` de una marca de tiempo, en la hora LOCAL del dispositivo (no UTC): el usuario piensa en meses
 * de su calendario, y en UTC una instantánea del 31 a las 23:00 caería en el mes siguiente.
 */
export function monthKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Instantánea (sin fecha) del tamaño de las cuatro listas. Ignora los registros sin nombre, como el panel. */
export function countLists(data: TabData): Omit<BacklogSnapshot, 'm'> {
  const size = (list: GameItem[] | undefined) => (list || []).filter((game) => game?.name?.trim()).length;
  return { c: size(data.c), v: size(data.v), e: size(data.e), p: size(data.p) };
}

/**
 * Inserta la instantánea del mes en la serie. Si el mes ya está registrado se REEMPLAZA: el punto de cada mes
 * es el último estado observado en él, así que el mes en curso siempre refleja la realidad de hoy y los
 * pasados quedan congelados en su última observación. Devuelve `null` si no hay nada que escribir.
 */
export function mergeSnapshot(
  history: BacklogSnapshot[],
  snapshot: BacklogSnapshot,
  limit = BACKLOG_HISTORY_LIMIT,
): BacklogSnapshot[] | null {
  const clean = history.filter((point) => point && typeof point.m === 'string');
  const last = clean[clean.length - 1];

  if (last?.m === snapshot.m) {
    // Mismo mes y mismas cuentas: no hay nada que actualizar (evita reescribir IndexedDB en cada edición).
    if (last.c === snapshot.c && last.v === snapshot.v && last.e === snapshot.e && last.p === snapshot.p) return null;
    return [...clean.slice(0, -1), snapshot];
  }

  return [...clean, snapshot].slice(-limit);
}

/** Evita releer IndexedDB en cada edición: firma de lo último que este mismo tab dejó escrito. */
let lastWritten = '';

/**
 * Registra (o actualiza) la instantánea del mes en curso. Best-effort y silencioso: es telemetría propia del
 * usuario, y un fallo de IndexedDB no puede afectar a nada de lo que estuviera haciendo.
 *
 * No registra una biblioteca vacía: al arrancar, el estado local puede tardar en hidratarse, y estampar un mes
 * a cero falsearía la serie justo en el punto en que empieza.
 */
export async function recordBacklogSnapshot(data: TabData, now: number): Promise<void> {
  const counts = countLists(data);
  if (counts.c + counts.v + counts.e + counts.p === 0) return;

  const snapshot: BacklogSnapshot = { m: monthKey(now), ...counts };
  const signature = `${snapshot.m}|${snapshot.c}|${snapshot.v}|${snapshot.e}|${snapshot.p}`;
  if (signature === lastWritten) return;

  try {
    const meta = await getLocalMeta();
    const next = mergeSnapshot(meta?.backlogHistory || [], snapshot);
    if (!next) {
      lastWritten = signature;
      return;
    }
    await patchLocalMeta({ backlogHistory: next });
    lastWritten = signature;
  } catch {
    /* best-effort: sin histórico se pierde un punto, no datos del usuario. */
  }
}

/** Serie completa registrada en este dispositivo, de más antigua a más reciente. */
export async function loadBacklogHistory(): Promise<BacklogSnapshot[]> {
  try {
    const meta = await getLocalMeta();
    return meta?.backlogHistory || [];
  } catch {
    return [];
  }
}

/** Solo para tests: olvida la firma en memoria del último registro. */
export function resetBacklogSnapshotCache(): void {
  lastWritten = '';
}
