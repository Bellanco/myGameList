// EL EVALUADOR. Una pasada por escalera, pura, `now` por parámetro: mismo contrato que `computeStats` y por los
// mismos motivos —no consulta red, no persiste nada y se prueba con fechas fijas—. Ver docs/plan-logros.md §7.
//
// SE MIDE POR ESCALERA Y SE RESUELVE POR ESCALÓN. La métrica de una escalera corre UNA vez y de su resultado
// salen los estados de todos sus escalones: once logros de «Créditos finales» no son once recorridos de la
// biblioteca, es uno.
//
// NO IMPORTA `core/stats`: arrastraría el chunk perezoso del panel (~96 kB) a cualquier sitio desde el que se
// evalúe, y `ci-validate` corta por presupuesto de arranque (§7.2).
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_LADDER, LADDERS, META_LADDERS, UNREACHABLE } from './catalog';
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

/**
 * Holgura antes de tratar una fecha como FUTURA. Un día, el mismo número que usa `parseMirror` al leer el espejo
 * y por el mismo motivo: los sellos pueden venir de otro dispositivo con el reloj algo adelantado, y descartar
 * una fecha buena por unos minutos sería peor que aceptarla.
 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** Los estados de TODOS los escalones de una escalera, a partir de una sola medición. */
function statesOfLadder(
  ladder: AchievementLadder,
  measure: AchievementMeasure,
  peak: Map<string, number>,
  now: number,
): AchievementState[] {
  // EL VALOR DE RESPALDO NO ES CERO EN UNA ESCALERA DESCENDENTE, y no es un detalle: ahí «menos es mejor», así
  // que un cero de una métrica rota o de un `NaN` concede TODOS los escalones —«Exterminatus» entero, sesenta
  // puntos por escalón— y la marca de agua lo deja puesto para siempre. Hacia abajo, lo seguro es lo inalcanzable.
  const fallback = ladder.descending ? UNREACHABLE : 0;
  const value = Number.isFinite(measure.value) ? Math.max(0, measure.value) : fallback;
  const steps = ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [];

  return steps.map((def) => {
    const earnedNow = reaches(def, value);
    // LA MARCA DE AGUA (§5.5). Lo conseguido no se devuelve: borras cinco duplicados, corriges unos años mal
    // puestos, y una medalla que llevaba meses ahí se esfumaría.
    const recorded = (peak.get(def.id) || 0) >= 1;
    const level = earnedNow || recorded ? 1 : 0;

    // La fecha se queda con el escalón, y solo si lo sostiene la medición de hoy: si el nivel lo sostiene la
    // marca de agua, no hay fecha que enseñar —recalcularla diría que se consiguió hoy, que es falso—.
    // `at` VIENE INDEXADO POR VALOR, no por escalón: `at[n-1]` es cuándo la métrica llegó a `n` (una racha sabe
    // cuándo alcanzó siete semanas, no cuándo alcanzó «el tercer escalón»). Indexarlo por la posición del escalón
    // le colgaba a «Aún estás aquí VIII» la fecha en que la racha llegó a 3 — un logro fechado años antes de
    // conseguirse, y de los que no saltan en ningún test porque el nivel sale bien y solo miente el día.
    let unlockedAt = 0;
    if (earnedNow) {
      unlockedAt = measure.at ? measure.at[def.step - 1] || 0 : dateFromStamps(def, measure.stamps ?? []);
      /**
       * UNA FECHA EN EL FUTURO SE PINTA SIN FECHA, y el logro se queda. Es la misma regla que ya aplicaba
       * `parseMirror` al LEER el espejo, y aquí faltaba: lo que sale de `years` se fecha en el 31 de diciembre de
       * su año —toda la precisión que da el dato— así que un logro del año EN CURSO nacía con una fecha que
       * todavía no ha llegado. Se veía: la fila decía «31 dic 2026» y el listado la ordenaba por delante de lo
       * conseguido hoy, así que las medallas más recientes salían debajo de otras que aún no tocan.
       *
       * Sin fecha y no recortada a hoy, que sería la otra salida: de `years` no se sabe el día, y estampar el de
       * hoy diría que lo hiciste hoy. «Conseguido, sin día» es un estado que el sistema ya tiene previsto (§5.3)
       * y que la fila sabe pintar; una fecha inventada, no.
       */
      if (unlockedAt > now + FUTURE_TOLERANCE_MS) unlockedAt = 0;
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
    // no sé medir esto» y la marca de agua conserva lo que ya estaba. Hacia abajo, «no sé» es el valor que no
    // alcanza ningún umbral, nunca el cero — ver la nota de `statesOfLadder`.
    return { value: ladder.descending ? UNREACHABLE : 0 };
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
    states.push(...statesOfLadder(ladder, measureLadder(ladder, input), peak, input.now));
  }

  const earned = new Set(states.filter((state) => state.level >= 1).map((state) => state.id));
  const metaInput: AchievementInput = { ...input, earned };
  for (const ladder of LADDERS) {
    if (!META_LADDERS.has(ladder.key)) continue;
    states.push(...statesOfLadder(ladder, measureLadder(ladder, metaInput), peak, input.now));
  }

  // En el orden del catálogo, no en el de evaluación: el orden de `ACHIEVEMENTS` es contrato (es el del espejo) y
  // devolverlo revuelto obligaría a cada consumidor a reordenar.
  const byId = new Map(states.map((state) => [state.id, state]));
  return ACHIEVEMENTS.map((def) => byId.get(def.id)).filter((state): state is AchievementState => Boolean(state));
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
 * Lo que se recuerda de la FECHA de cada logro conseguido: el día que se le dio (`at`, 0 = sin fecha) y el
 * instante en que este dispositivo lo vio conseguido por primera vez (`cap`), que es el techo de esa fecha.
 */
interface FrozenDate {
  at: number;
  cap: number;
}

/** `id:at.cap,…`, con los instantes en base 36. Formato de `localStorage`, nunca sale del aparato. */
export function parseFrozenDates(raw: string): Map<string, FrozenDate> {
  const out = new Map<string, FrozenDate>();
  for (const piece of String(raw || '').split(',')) {
    const [id, pair] = piece.split(':');
    const [at, cap] = String(pair || '').split('.').map((part) => parseInt(part, 36));
    if (id && Number.isFinite(cap) && cap > 0) out.set(id, { at: Number.isFinite(at) && at > 0 ? at : 0, cap });
  }
  return out;
}

function serializeFrozenDates(dates: ReadonlyMap<string, FrozenDate>): string {
  return [...dates.entries()].map(([id, { at, cap }]) => `${id}:${at.toString(36)}.${cap.toString(36)}`).join(',');
}

/**
 * LA FECHA DE UN LOGRO SE FIJA, NO SE RECALCULA.
 *
 * El evaluador deduce la fecha de los sellos de los juegos (`enteredAt`, `gradedAt`, `reviewedAt`), y esos sellos
 * se MUEVEN: renotar un juego, reescribir una reseña o guardar uno anterior a un campo nuevo los estrena. Como la
 * fecha es «el sello número N de lo que cuenta», un sello que pasa a ser de hoy fecha HOY un logro de hace meses,
 * y así salía en el listado, en tu vitrina y en el feed de tus amistades — una vez cada vez que tocabas algo.
 *
 * Por eso lo deducido solo vale la PRIMERA vez que el dispositivo ve el logro conseguido, y a partir de ahí:
 *
 *  - la fecha solo puede ADELANTARSE, nunca retrasarse. Llega una biblioteca sincronizada con sellos más
 *    antiguos y la fecha se corrige; un sello que se mueve a hoy no la arrastra;
 *  - y nunca puede pasar de `cap`, el instante en que se vio conseguido por primera vez: lo que ya tenías no se
 *    pudo conseguir después. Es lo que impide que un logro SIN fecha gane una más tarde —antes bastaba con que el
 *    sello que hacía el número pasara de «sin fecha» a «hoy»—, y lo que hace que «conseguido, sin día» (§5.3) se
 *    quede así en vez de inventarse un día.
 *
 * Lo que ya estaba en la marca de agua cuando nació esta clave entra con `cap` = el momento de estrenarla: es la
 * mejor cota que existe, y cierra el mismo agujero para todo lo conseguido antes.
 *
 * Solo AÑADE: un registro no se borra aunque el logro no salga en esta evaluación (un escalón de configuración
 * que todavía no ha llegado, §6.4bis). Es estado de dispositivo, como la marca de agua.
 */
export function freezeDates(
  states: readonly AchievementState[],
  raw: string,
  now: number,
): { states: AchievementState[]; raw: string } {
  const dates = parseFrozenDates(raw);
  const out = states.map((state) => {
    if (state.level < 1) return state;
    const known = dates.get(state.id);
    if (!known) {
      dates.set(state.id, { at: state.unlockedAt, cap: now });
      return state;
    }
    const candidate = state.unlockedAt;
    if (candidate > 0 && candidate <= known.cap && (known.at === 0 || candidate < known.at)) {
      dates.set(state.id, { at: candidate, cap: known.cap });
      return state;
    }
    return known.at === state.unlockedAt ? state : { ...state, unlockedAt: known.at };
  });
  const next = serializeFrozenDates(dates);
  return { states: out, raw: next === raw ? raw : next };
}

/**
 * Lo que ha subido entre dos evaluaciones. Es el aviso del instante (§7.4): solo lo que cambia AHORA, nunca el
 * arrastre de la retroactividad — quien importa una biblioteca entera no recibe cien avisos.
 */
export function levelUps(before: readonly AchievementState[], after: readonly AchievementState[]): AchievementState[] {
  const previous = new Map(before.map((state) => [state.id, state.level]));
  return after.filter((state) => state.level >= 1 && (previous.get(state.id) || 0) < 1);
}
