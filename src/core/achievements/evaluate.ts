// EL EVALUADOR. Una pasada por escalera, pura, `now` por parámetro: mismo contrato que `computeStats` y por los
// mismos motivos —no consulta red, no persiste nada y se prueba con fechas fijas—. Ver docs/plan-logros.md §7.
//
// SE MIDE POR ESCALERA Y SE RESUELVE POR ESCALÓN. La métrica de una escalera corre UNA vez y de su resultado
// salen los estados de todos sus escalones: once logros de «Créditos finales» no son once recorridos de la
// biblioteca, es uno.
//
// NO IMPORTA `core/stats`: arrastraría el chunk perezoso del panel (~96 kB) a cualquier sitio desde el que se
// evalúe, y `ci-validate` corta por presupuesto de arranque (§7.2).
import { ACHIEVEMENTS_BY_LADDER, LADDERS, META_LADDERS } from './catalog';
import { reaches } from './types';
import type { AchievementDef, AchievementInput, AchievementLadder, AchievementMeasure, AchievementState } from './types';

/**
 * Deduce la fecha de cada escalón a partir de los sellos de las unidades contadas.
 *
 * Contar «cuántos» es fácil; saber «cuándo llegaste a 50» exige ordenar los hechos por su sello y quedarse con el
 * que hace el número. Los sellos ausentes (0) van PRIMERO al ordenar, y eso es lo correcto: si el juego que hizo
 * el número no tiene fecha, el logro se consiguió sin fecha deducible, no en el instante del siguiente que sí la
 * tiene. Como el sello es estable, la fecha CONVERGE: dos dispositivos calculan la misma sin hablar entre ellos.
 */
function dateFromStamps(def: AchievementDef, stamps: number[]): number {
  if (def.descending) return 0; // una cuenta que baja no tiene «la unidad que hizo el número»
  const sorted = [...stamps].sort((a, b) => a - b);
  return def.step > 0 && def.step <= sorted.length ? sorted[def.step - 1] || 0 : 0;
}

/** Los estados de TODOS los escalones de una escalera, a partir de una sola medición. */
function statesOfLadder(
  ladder: AchievementLadder,
  measure: AchievementMeasure,
  peak: Map<string, number>,
): AchievementState[] {
  const value = Number.isFinite(measure.value) ? Math.max(0, measure.value) : 0;
  const steps = ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [];

  return steps.map((def, index) => {
    const earnedNow = reaches(def, value);
    // LA MARCA DE AGUA (§5.5). Lo conseguido no se devuelve: borras cinco duplicados, corriges unos años mal
    // puestos, y una medalla que llevaba meses ahí se esfumaría.
    const recorded = (peak.get(def.id) || 0) >= 1;
    const level = earnedNow || recorded ? 1 : 0;

    // La fecha se queda con el escalón, y solo si lo sostiene la medición de hoy: si el nivel lo sostiene la
    // marca de agua, no hay fecha que enseñar —recalcularla diría que se consiguió hoy, que es falso—.
    let unlockedAt = 0;
    if (earnedNow) {
      unlockedAt = measure.at ? measure.at[index] || 0 : dateFromStamps(def, measure.stamps ?? []);
    }

    return { id: def.id, level, value, next: level >= 1 ? null : def.step, unlockedAt };
  });
}

/** Mide una escalera sin dejar que una métrica rota tumbe la pantalla entera. */
function measureLadder(ladder: AchievementLadder, input: AchievementInput): AchievementMeasure {
  try {
    return ladder.metric(input);
  } catch {
    // Una métrica que revienta no puede tumbar la pantalla ni, peor, retirarle logros a nadie: se trata como «hoy
    // no sé medir esto» y la marca de agua conserva lo que ya estaba.
    return { value: 0 };
  }
}

/**
 * Evalúa el catálogo entero. `peak` es la marca de agua serializada (`id:nivel,…`), tal y como se guarda.
 *
 * DOS PASADAS, y la segunda existe por dos logros: `tutorial` y `platino` miden sobre lo que las demás escaleras
 * acaban de conceder. Se les pasa el conjunto de `id` ya conseguidos —marca de agua incluida, que es lo que hace
 * que no se retiren solos— y no pueden verse entre ellas, así que el orden dentro de la segunda pasada da igual.
 */
export function evaluateAchievements(input: AchievementInput, peakRaw = ''): AchievementState[] {
  const peak = parsePeak(peakRaw);
  const states: AchievementState[] = [];

  for (const ladder of LADDERS) {
    if (META_LADDERS.has(ladder.key)) continue;
    states.push(...statesOfLadder(ladder, measureLadder(ladder, input), peak));
  }

  const earned = new Set(states.filter((state) => state.level >= 1).map((state) => state.id));
  const metaInput: AchievementInput = { ...input, earned };
  for (const ladder of LADDERS) {
    if (!META_LADDERS.has(ladder.key)) continue;
    states.push(...statesOfLadder(ladder, measureLadder(ladder, metaInput), peak));
  }

  // En el orden del catálogo, no en el de evaluación: el orden de `ACHIEVEMENTS` es contrato (es el del espejo) y
  // devolverlo revuelto obligaría a cada consumidor a reordenar.
  const byId = new Map(states.map((state) => [state.id, state]));
  return [...ACHIEVEMENTS_BY_LADDER.values()].flat().map((def) => byId.get(def.id)!).filter(Boolean);
}

/** La marca de agua serializada: `id:nivel,id:nivel`. Formato de `localStorage`, nunca sale del aparato. */
export function parsePeak(raw: string): Map<string, number> {
  const peak = new Map<string, number>();
  for (const piece of String(raw || '').split(',')) {
    const [id, level] = piece.split(':');
    const value = Number(level);
    if (id && Number.isFinite(value) && value >= 1) peak.set(id, 1);
  }
  return peak;
}

/** La marca de agua que toca guardar: la de antes, más lo conseguido ahora. Nunca baja. */
export function nextPeak(states: readonly AchievementState[], raw: string): string {
  const peak = parsePeak(raw);
  for (const state of states) if (state.level >= 1) peak.set(state.id, 1);
  return [...peak.entries()].map(([id, level]) => `${id}:${level}`).join(',');
}

/**
 * Lo que ha subido entre dos evaluaciones. Es el aviso del instante (§7.4): solo lo que cambia AHORA, nunca el
 * arrastre de la retroactividad — quien importa una biblioteca entera no recibe cien avisos.
 */
export function levelUps(before: readonly AchievementState[], after: readonly AchievementState[]): AchievementState[] {
  const previous = new Map(before.map((state) => [state.id, state.level]));
  return after.filter((state) => state.level >= 1 && (previous.get(state.id) || 0) < 1);
}
