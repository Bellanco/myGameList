// LAS DOS CIFRAS: el porcentaje de Steam y el nivel de PlayStation. Ver docs/plan-logros.md §6.10.
//
// Los dos referentes resuelven cosas distintas y por eso van los dos. El PORCENTAJE contesta «¿cuánto me queda?»
// y SE PUEDE TERMINAR. El NIVEL contesta «¿cuánto llevo?» y NO TERMINA NUNCA. Con una sola, o el veterano se
// queda sin horizonte o el completista se queda sin meta.
//
// NINGUNA DE LAS DOS SE PUBLICA (§6.10.3): el espejo ya lleva la lista de logros con su nivel y el catálogo lleva
// la rareza de cada uno, así que cualquier cliente las reconstruye exactamente. Publicar un número que se puede
// derivar crearía un segundo sitio donde mentir.
import { ACHIEVEMENTS_BY_ID, ACHIEVEMENTS_BY_LADDER, SCORING_ACHIEVEMENTS } from './catalog';
import { openThrough, type OpenFrontier } from './visibility';
import { RARITY_POINTS } from './types';
import type { AchievementDef, AchievementState, AchievementSummary } from './types';

/** Los `id` que puntúan, en un conjunto: el recorrido de abajo va por escalera y necesita preguntarlo por `id`. */
const SCORING_IDS: ReadonlySet<string> = new Set(SCORING_ACHIEVEMENTS.map((def) => def.id));

/**
 * La curva de nivel: barata al principio, cara después, sin techo. Es la forma de PSN y por su mismo motivo —los
 * primeros niveles tienen que llegar en la primera semana o nadie llega al segundo—.
 *
 * La escala de puntos es SUAVE a propósito (5/10/25/60 y no 15/30/90/300 como PSN): un solo logro excepcional con
 * la escala de PSN dispara el nivel de golpe y la curva deja de sentirse ganada.
 *
 * ⚑ LOS TRAMOS SE DUPLICARON AL PASAR A UN LOGRO POR ESCALÓN, y no es un ajuste cosmético: el catálogo pasó de 32
 * logros a 251, y con ellos el máximo teórico de 895 puntos a 5.135. Con la curva antigua, completarlo todo daba
 * el nivel 54 y los primeros escalones subían de tres en tres. Duplicada, quedó en el 37 y con sitio por encima.
 *
 * ⚑ Y VUELVE A MOVERSE CADA VEZ QUE EL CATÁLOGO CRECE. Con la ampliación a 304 escalones el techo son **6.110
 * puntos, nivel 41**. Las cifras van escritas aquí y probadas en `tests/unit/achievements.test.ts` justo para
 * esto: al añadir escalones hay que venir a mirar si la curva sigue teniendo sitio por encima, en vez de
 * enterarse cuando alguien llegue al final.
 *
 * ⚑ Y EL NIVEL YA NO ES INFINITO. Antes lo era porque las metas abiertas no tenían techo; ahora cada escalón es
 * un logro y el catálogo es finito, así que los puntos también. Lo que sostenía «siempre hay un paso más» pasa a
 * ser el calendario —los repetibles anuales— y los escalones que se vayan añadiendo. Está anotado aquí porque el
 * §6.10 prometía lo contrario y quien lo lea tiene que saber qué cambió.
 */
const LEVEL_TIERS: ReadonlyArray<{ levels: number; cost: number }> = [
  { levels: 9, cost: 40 },    // niveles 2–10
  { levels: 15, cost: 120 },  // niveles 11–25
  { levels: 25, cost: 240 },  // niveles 26–50
];

/** Coste de cada nivel a partir del 51: sin techo. */
const OPEN_TIER_COST = 250;

/** Nivel de perfil a partir de los puntos, con lo que falta para el siguiente. El nivel 1 son cero puntos. */
export function levelFromPoints(points: number): { level: number; into: number; toNext: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(points));

  for (const tier of LEVEL_TIERS) {
    for (let step = 0; step < tier.levels; step += 1) {
      if (left < tier.cost) return { level, into: left, toNext: tier.cost - left };
      left -= tier.cost;
      level += 1;
    }
  }

  while (left >= OPEN_TIER_COST) {
    left -= OPEN_TIER_COST;
    level += 1;
  }
  return { level, into: left, toNext: OPEN_TIER_COST - left };
}

/**
 * Las dos cifras a partir del estado.
 *
 * El NUMERADOR cuenta ESCALONES, que ahora son los logros: cada uno suma una vez y para siempre. La distinción
 * entre «logros» y «niveles» que hacía el §6.3.1 desaparece con el modelo nuevo — no había otra forma de que un
 * porcentaje siguiera queriendo decir algo cuando la mitad del catálogo eran grados de otra cosa.
 *
 * El DENOMINADOR excluye los «primeros pasos» (se apagan solos, y un denominador que encoge convertiría un logro
 * en un castigo estadístico) y los retirados, y SÍ incluye los ocultos desde el principio —restarlos delataría
 * cuántos hay y, con el tiempo, cuáles—.
 */
export function summarize(
  states: readonly AchievementState[],
  open: OpenFrontier = {},
): AchievementSummary {
  const byId = new Map(states.map((state) => [state.id, state]));
  const isEarned = (def: AchievementDef): boolean => (byId.get(def.id)?.level ?? 0) >= 1;
  let earned = 0;
  let points = 0;
  let total = 0;

  // SOLO CUENTA LO QUE ESTÁ ABIERTO. El denominador no es el catálogo entero sino lo que hoy se le enseña a
  // alguien: un escalón que nadie ha visto todavía no es una tarea pendiente, es una que aún no ha empezado.
  //
  // ES LO QUE HACE QUE AMPLIAR EL CATÁLOGO NO CASTIGUE A NADIE. Con el catálogo entero de denominador, añadir
  // cincuenta escalones le bajaba el porcentaje de golpe a todo el mundo sin que nadie hubiera perdido nada.
  // Contando lo abierto, esos escalones entran en la cuenta según la comunidad los va alcanzando.
  //
  // A CAMBIO, EL DENOMINADOR CRECE SOLO: tu porcentaje puede bajar sin que toques nada, porque alguien abrió un
  // escalón nuevo. Es deliberado — la fracción dice cuánto llevas de lo que hoy está en juego, y lo que está en
  // juego lo mueve la gente.
  //
  // LO CONSEGUIDO CUENTA SIEMPRE, esté abierto o no: la marca de agua puede sostener un escalón cuyo tramo se
  // haya quedado atrás, y un logro que tienes y no aparece ni en el numerador ni en el denominador no existe.
  for (const steps of ACHIEVEMENTS_BY_LADDER.values()) {
    const openTo = openThrough(steps, open, isEarned);
    steps.forEach((def, index) => {
      if (!SCORING_IDS.has(def.id)) return;
      const mine = isEarned(def);
      if (!mine && index > openTo) return;
      total += 1;
      if (!mine) return;
      earned += 1;
      points += RARITY_POINTS[def.rarity];
    });
  }

  const curve = levelFromPoints(points);

  return {
    earned,
    total,
    percent: total > 0 ? Math.round((earned / total) * 100) : 0,
    points,
    level: curve.level,
    pointsIntoLevel: curve.into,
    pointsToNext: curve.toNext,
  };
}

/**
 * Las mismas cifras a partir de un espejo YA PARSEADO (`id → nivel`), que es lo que llega de otra persona.
 *
 * Sale igual que la del dueño sin coordinar nada: el espejo lleva exactamente los logros conseguidos y el
 * denominador ya excluía los primeros pasos —que no se publican— y los retirados. Un `id` que este cliente no
 * conozca se ignora en silencio, así que un catálogo desactualizado cuenta de menos: es la dirección segura del
 * error —nunca infla, siempre desmerece— y se corrige sola al actualizar.
 */
export function summarizeMirror(levels: ReadonlyMap<string, number>): AchievementSummary {
  const states: AchievementState[] = [];
  for (const [id, level] of levels) {
    if (!ACHIEVEMENTS_BY_ID.has(id) || level < 1) continue;
    states.push({ id, level, value: 0, next: null, unlockedAt: 0 });
  }
  return summarize(states);
}
