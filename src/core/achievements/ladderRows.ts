import type { AchievementItem } from './types';

/**
 * UNA FILA POR ESCALERA (09-10-2026): la misma forma para tus logros y para los de otra persona.
 *
 * La lista llegaba escalón a escalón —«Solsticio a solsticio I, II, III, IV, V», cinco filas casi iguales— y una
 * vitrina de 180 medallas se volvía una pared. Aquí cada escalera se queda en UNA entrada:
 *
 *  - la CARA es el escalón más alto conseguido (su medalla, su fecha, su texto); si no hay ninguno, el primero
 *    que se ve de la escalera, apagado;
 *  - el PROGRESO, si lo hay, es el del escalón siguiente que la lista traía: «31 de 50» hacia el próximo. En la
 *    vitrina de otra persona no hay escalón siguiente —su espejo solo lleva lo conseguido—, así que tampoco hay
 *    progreso, que es la línea del §3.
 *
 * El orden es el de la lista que llega: cada escalera ocupa el sitio de su cara. La lista ya viene ordenada
 * (lo conseguido por día, lo que falta por lo cerca que está), así que una escalera con algo conseguido sale entre
 * lo conseguido, en el día de su escalón más alto.
 *
 * Los LOGROS GLOBALES no pasan por aquí: allí cada escalón tiene su propio porcentaje y la fila ES el escalón.
 */
export function groupByLadder(items: readonly AchievementItem[]): AchievementItem[] {
  const top = new Map<string, AchievementItem>();
  const next = new Map<string, AchievementItem>();
  for (const item of items) {
    const ladder = item.def.ladder;
    if (item.state.level >= 1) {
      const seen = top.get(ladder);
      if (!seen || item.def.grade > seen.def.grade) top.set(ladder, item);
    } else {
      const seen = next.get(ladder);
      if (!seen || item.def.grade < seen.def.grade) next.set(ladder, item);
    }
  }

  const faceOf = (ladder: string): AchievementItem | undefined => {
    const earned = top.get(ladder);
    const upcoming = next.get(ladder);
    if (!earned) return upcoming;
    // Lo conseguido, con el camino hacia el escalón siguiente si la lista lo traía.
    // Sin escalón siguiente a la vista (al máximo, o cerrado por encima de la frontera) no hay camino que pintar.
    return upcoming
      ? { def: earned.def, state: { ...earned.state, value: upcoming.state.value, next: upcoming.state.next } }
      : { def: earned.def, state: { ...earned.state, next: null } };
  };

  const out: AchievementItem[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const ladder = item.def.ladder;
    if (placed.has(ladder)) continue;
    // La escalera se coloca donde está su cara, no donde aparece su primer escalón.
    const face = top.get(ladder) ?? next.get(ladder);
    if (face !== item) continue;
    const row = faceOf(ladder);
    if (row) out.push(row);
    placed.add(ladder);
  }
  return out;
}
