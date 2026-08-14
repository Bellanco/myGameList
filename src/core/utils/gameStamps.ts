/**
 * Sellos AUTOMÁTICOS de un juego: fechas que registra la propia app cuando el usuario hace algo, no campos que
 * él rellene. Mismo criterio que `reviewDate` y por la misma razón: `_ts` es el reloj del merge CRDT y lo mueve
 * cualquier edición (y la importación lo sella en bloque), así que no puede responder "¿cuándo pasó esto?".
 *
 * Funciones PURAS —sin reloj propio ni estado—: el `now` entra por parámetro, como en `resolveReviewedAt`.
 */
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';

/** Sellos de entrada por lista. Ver `GameItem.enteredAt`. */
export type EntryStamps = Partial<Record<TabId, number>>;

/**
 * Sella la entrada en `tab` conservando lo que ya hubiera.
 *
 * NO reescribe un sello existente: el dato es "cuándo entró por primera vez". Volver a guardar un juego que ya
 * estaba en la lista es editarlo, no entrar; y volver a una lista de la que se salió (una rejugada) ya lo cuenta
 * `years`. Que el valor no cambie es además lo que evita que cada guardado ensucie el merge con un campo nuevo.
 */
export function stampEntry(current: EntryStamps | undefined, tab: TabId, now: number): EntryStamps {
  const out: EntryStamps = {};
  for (const key of TAB_IDS) {
    const stamp = Number(current?.[key]);
    if (Number.isFinite(stamp) && stamp > 0) out[key] = stamp;
  }
  if (!out[tab]) out[tab] = now;
  return out;
}

/**
 * Fecha del último cambio de NOTA. Se estrena solo si la nota es distinta de la anterior.
 *
 * Sin nota (0 o ausente) no hay nada que fechar: en la lista de la vergüenza, "sin puntuar" es un estado
 * legítimo —el opt-in de `scored`— y no una opinión que datar. Un juego que nunca tuvo nota y sigue sin tenerla
 * se queda sin sello, igual que `resolveReviewedAt` hace con la reseña vacía.
 *
 * Si la nota no ha cambiado se conserva el sello anterior; si el juego es anterior al campo, se queda SIN sello
 * en vez de inventarse uno con `_ts` (los lectores caen a `_ts`, que aproxima sin fingir precisión).
 */
export function resolveGradedAt(input: {
  grade: number | null | undefined;
  previousGrade: number | null | undefined;
  previousGradedAt?: number;
  now: number;
}): number | undefined {
  const grade = Number(input.grade) || 0;
  if (grade <= 0) return undefined;

  const previous = Number(input.previousGrade) || 0;
  if (grade !== previous) return input.now;

  return input.previousGradedAt;
}

/**
 * Conserva los sellos que ya tenía la biblioteca cuando lo que entra no los trae.
 *
 * Para IMPORTAR un respaldo. Un fichero exportado por esta app los lleva y manda él; uno anterior a los sellos
 * —o de otra herramienta— no, y sin esto restaurar una copia de seguridad borraría el historial de listas de
 * golpe. Es información que solo existe en este aparato: el respaldo no puede aportarla, así que no tiene por
 * qué llevársela.
 *
 * Solo rellena huecos: si el fichero trae sellos, los suyos ganan (es lo que se está restaurando). El emparejado
 * es por `id`, igual que el resto de la importación.
 */
export function carryStamps(incoming: TabData, current: TabData): TabData {
  const known = new Map<number, GameItem>();
  for (const tab of TAB_IDS) {
    for (const game of current[tab] || []) if (Number(game?.id) > 0) known.set(Number(game.id), game);
  }
  if (known.size === 0) return incoming;

  const merge = (games: GameItem[] | undefined): GameItem[] =>
    (games || []).map((game) => {
      const previous = known.get(Number(game?.id));
      if (!previous) return game;
      const hasStamps = game.enteredAt && Object.keys(game.enteredAt).length > 0;
      if (hasStamps && game.gradedAt !== undefined) return game;
      return {
        ...game,
        enteredAt: hasStamps ? game.enteredAt : previous.enteredAt,
        gradedAt: game.gradedAt ?? previous.gradedAt,
      };
    });

  return { ...incoming, c: merge(incoming.c), v: merge(incoming.v), e: merge(incoming.e), p: merge(incoming.p) };
}
