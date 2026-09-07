// EL CATÁLOGO. Una tabla declarativa: añadir un logro es añadir un umbral, nunca tocar la vista.
//
// SE DECLARAN ESCALERAS Y SE PUBLICAN ESCALONES. Cada `AchievementLadder` de abajo trae una métrica y una lista
// de umbrales, y `expand()` la convierte en un logro independiente por umbral (`completados-10`,
// `completados-25`…). Es lo que ve el resto de la app: `ACHIEVEMENTS` son escalones, no escaleras.
//
// Los umbrales están MEDIDOS, no supuestos: salen de una biblioteca real de 302 juegos replicando `normalizeGame`
// con la siembra de sellos incluida (docs/plan-logros.md §6.8 y §6.9, y los datos crudos en
// docs/logros/catalogo.json).
//
// CUATRO REGLAS QUE NO SE PUEDEN SALTAR AL EDITAR ESTE FICHERO:
//
//  1. **Un `id` no se renombra ni se reutiliza jamás.** Viaja en lo que se publica y en el estado local de todos
//     los dispositivos. El `id` sale de `key` + umbral, así que renombrar una `key` o CAMBIAR UN UMBRAL EXISTENTE
//     es renombrar logros: se añaden umbrales nuevos, no se mueven los que ya están.
//  2. **El ORDEN de esta lista es contrato.** El espejo publica un mapa de bits y su índice es la posición en
//     `MIRROR_ORDER` (ver `pack.ts`): reordenar escaleras o intercalar umbrales cambia lo que significa cada bit
//     en todos los espejos ya publicados. Los umbrales nuevos se ordenan solos dentro de su escalera (por eso el
//     orden se calcula de forma estable, ver `expand`), y las escaleras nuevas van AL FINAL de su familia.
//  3. **Los umbrales no se ablandan ni se endurecen.** Endurecer retira un logro concedido; ablandar regala uno
//     que nadie hizo. Si un listón está mal, se añade otro escalón.
//  4. **Ninguna métrica compara contra `listedAt`.** En un juego catalogado hacia atrás esa fecha es la de
//     catalogarlo, no la de nada que pasara: la definición ingenua de «Speedrun» daba 42 aciertos y los 42 eran
//     falsos (§6.8). Y ninguna trata un campo ausente como un valor — ver la cabecera de `metrics.ts`.
import {
  activityStamps,
  allGames,
  backlogCurve,
  backlogDeltas,
  backlogSize,
  bestDownStreak,
  bestMonthStreak,
  bestWeekStreak,
  bestYearStreak,
  closedGames,
  closedStamps,
  endOfYear,
  enteredAt,
  firstEnteredAt,
  gradeIfScored,
  hasReason,
  hasReview,
  hoursOf,
  playedYears,
  sameLocalDay,
  stdDev,
} from './metrics';
import { localMonthKey } from '../utils/dateTime';
import { romanLevel } from '../constants/achievementLabels';
import type { AchievementDef, AchievementLadder, AchievementMeasure } from './types';
import type { GameItem } from '../../model/types/game';

/** Un año en milisegundos, para «esperó más de un año en Próximos». */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Métrica de CONTEO: cuenta lo que pasa el filtro y toma de cada uno su sello. */
function count(items: Array<{ ok: boolean; at: number }>): AchievementMeasure {
  const kept = items.filter((item) => item.ok);
  return { value: kept.length, stamps: kept.map((item) => item.at) };
}

/** Métrica de SÍ/NO, sin fecha: los «primeros pasos», que no se publican y no necesitan sello. */
function flag(value: boolean): AchievementMeasure {
  return { value: value ? 1 : 0 };
}

/** Nota mínima de dispersión para que «Nota del crítico» cuente: por debajo, no hay criterio, hay una sola nota. */
const CRITERIA_MIN_STDDEV = 12;

/** Horas que hacen «un juego largo». Medido: 19 juegos de 302 lo pasan, contra 11 con el listón en 60 (§6.9bis). */
const MARATHON_HOURS = 40;

/** Longitud de una reseña larga. No se sube de aquí: subirlo retira el logro a quien lo tenga por los pelos. */
const THESIS_CHARS = 1000;

/** Géneros distintos que hacen variado un mes. */
const VARIETY_GENRES = 3;

export const LADDERS: readonly AchievementLadder[] = [
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // ESPEJO — lo que ya haces. Sale de la biblioteca y no pide ningún cambio de conducta.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'completados',
    family: 'mirror',
    steps: [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500],
    rarity: 'raro',
    icon: 'completados',
    labels: { name: 'Créditos finales', condition: 'Juegos que has terminado' },
    goal: (step) => (step === 1
      ? 'Termina un juego'
      : `Termina ${step} juegos`),
    done: (step) => (step === 1
      ? 'Has terminado un juego'
      : `Has terminado ${step} juegos`),
    metric: ({ games }) => count((games.c || []).map((game) => ({ ok: true, at: enteredAt(game, 'c') }))),
  },
  {
    key: 'abandonos-razonados',
    family: 'mirror',
    steps: [5, 10, 20, 35, 50, 75, 100, 150],
    rarity: 'infrecuente',
    icon: 'abandonos-razonados',
    labels: { name: 'Retirada táctica', condition: 'Juegos que dejaste diciendo por qué' },
    goal: (step) => (step === 1
      ? 'Deja un juego y apunta por qué'
      : `Deja ${step} juegos apuntando por qué`),
    done: (step) => (step === 1
      ? 'Has dejado un juego diciendo por qué'
      : `Has dejado ${step} juegos diciendo por qué`),
    metric: ({ games }) => count((games.v || []).map((game) => ({ ok: hasReason(game), at: enteredAt(game, 'v') }))),
  },
  {
    key: 'constancia',
    family: 'mirror',
    steps: [2, 4, 8, 12, 18, 26, 39, 52],
    rarity: 'raro',
    icon: 'constancia',
    labels: { name: 'Aún estás aquí', condition: 'Semanas seguidas sin faltar' },
    goal: (step) => `Aguanta ${step} semanas seguidas`,
    done: (step) => `Llevas ${step} semanas seguidas sin faltar`,
    metric: ({ games }) => bestWeekStreak(activityStamps(games)),
  },
  {
    key: 'ritmo',
    family: 'mirror',
    steps: [2, 3, 6, 9, 12, 18, 24, 36],
    rarity: 'raro',
    icon: 'ritmo',
    labels: { name: 'Sin prisa pero sin pausa', condition: 'Meses seguidos cerrando algo' },
    goal: (step) => `Cierra algún juego ${step} meses seguidos`,
    done: (step) => `Has cerrado algo ${step} meses seguidos`,
    // NO es «Aún estás aquí» con otra unidad: aquella cuenta CUALQUIER actividad —catalogar incluido— y esta
    // exige cerrar. Es la única métrica del catálogo que no se puede satisfacer ordenando fichas.
    metric: ({ games }) => bestMonthStreak(closedStamps(games)),
  },
  {
    key: 'generos',
    family: 'mirror',
    steps: [5, 8, 12, 16, 20, 25, 30, 40],
    rarity: 'infrecuente',
    icon: 'generos',
    labels: { name: 'Mundo abierto', condition: 'Géneros distintos de los que ya has cerrado algo' },
    goal: (step) => `Cierra algo de ${step} géneros distintos`,
    done: (step) => `Has cerrado algo de ${step} géneros distintos`,
    metric: ({ games }) => firstOfEach(closedGames(games), (game) => game.genres),
  },
  {
    key: 'degustacion',
    family: 'mirror',
    steps: [1, 3, 5, 10, 15, 25],
    rarity: 'infrecuente',
    icon: 'degustacion',
    labels: { name: 'Menú degustación', condition: 'Meses en los que cierras tres géneros distintos' },
    goal: (step) => (step === 1
      ? 'Cierra tres géneros distintos en un mismo mes'
      : `Cierra tres géneros distintos en ${step} meses`),
    done: (step) => (step === 1
      ? 'Has cerrado tres géneros distintos en un mismo mes'
      : `Has cerrado tres géneros distintos en ${step} meses`),
    // Variedad SIN volumen: un mes bueno son tres juegos, no treinta. Es el contrapeso de «Mundo abierto», que
    // premia el catálogo entero y por tanto también a quien lo llenó de una tacada.
    metric: ({ games }) => {
      const byMonth = new Map<string, { genres: Set<string>; at: number }>();
      for (const tab of ['c', 'v'] as const) {
        for (const game of games[tab] || []) {
          const stamp = enteredAt(game, tab);
          if (stamp <= 0) continue;
          const month = localMonthKey(stamp);
          const entry = byMonth.get(month) || { genres: new Set<string>(), at: 0 };
          for (const raw of game.genres || []) {
            const label = String(raw || '').trim().toLowerCase();
            if (label) entry.genres.add(label);
          }
          if (stamp > entry.at) entry.at = stamp;
          byMonth.set(month, entry);
        }
      }
      const good = [...byMonth.values()].filter((entry) => entry.genres.size >= VARIETY_GENRES);
      return { value: good.length, stamps: good.map((entry) => entry.at) };
    },
  },
  {
    key: 'plataformas',
    family: 'mirror',
    steps: [3, 5, 7, 9, 12, 15],
    rarity: 'comun',
    icon: 'plataformas',
    labels: { name: 'Guerra de consolas', condition: 'Plataformas distintas en tu biblioteca' },
    goal: (step) => `Junta juegos de ${step} plataformas distintas`,
    done: (step) => `Tienes juegos de ${step} plataformas distintas`,
    metric: ({ games }) => firstOfEach(allGames(games).map((entry) => entry.game), (game) => game.platforms),
  },
  {
    key: 'rejugados',
    family: 'mirror',
    steps: [1, 2, 3, 5, 7, 10],
    rarity: 'infrecuente',
    icon: 'rejugados',
    labels: { name: 'New Game +', condition: 'Vueltas extra que has apuntado' },
    goal: (step) => (step === 1
      ? 'Apunta una vuelta extra'
      : `Apunta ${step} vueltas extra`),
    done: (step) => (step === 1
      ? 'Has apuntado una vuelta extra'
      : `Has apuntado ${step} vueltas extra`),
    metric: ({ games }) => {
      const stamps: number[] = [];
      for (const { game } of allGames(games)) {
        const years = playedYears(game).sort((a, b) => a - b);
        // La PRIMERA vuelta no cuenta: lo que se premia es volver, no jugar. De cada vuelta extra se toma el fin
        // de su año, que es toda la precisión que `years` da y la única honesta (§6.8).
        for (let index = 1; index < years.length; index += 1) stamps.push(endOfYear(years[index]));
      }
      return { value: stamps.length, stamps };
    },
  },
  {
    key: 'volvere',
    family: 'mirror',
    steps: [3, 10, 20, 30, 40, 50],
    rarity: 'comun',
    icon: 'volvere',
    labels: { name: 'Aquí volveré', condition: 'Juegos que has marcado como rejugables' },
    goal: (step) => `Marca ${step} juegos como rejugables`,
    done: (step) => `Has marcado ${step} juegos como rejugables`,
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: Boolean(game.replayable), at: firstEnteredAt(game) }))),
  },
  {
    key: 'revancha',
    family: 'mirror',
    steps: [1, 5, 10, 20, 35, 50],
    rarity: 'comun',
    icon: 'revancha',
    labels: { name: 'Cuenta pendiente', condition: 'Juegos que dejaste y quieres reintentar' },
    goal: (step) => (step === 1
      ? 'Marca un abandono para reintentarlo'
      : `Marca ${step} abandonos para reintentarlos`),
    done: (step) => (step === 1
      ? 'Tienes un abandono marcado para la revancha'
      : `Tienes ${step} abandonos marcados para la revancha`),
    // Pareja de «Volver a la hoguera»: marcar la revancha aquí, cumplirla allí.
    metric: ({ games }) =>
      count((games.v || []).map((game) => ({ ok: Boolean(game.retry), at: enteredAt(game, 'v') }))),
  },
  {
    key: 'maraton',
    family: 'mirror',
    steps: [1, 3, 5, 10, 15, 25, 40, 60, 75],
    rarity: 'raro',
    icon: 'maraton',
    labels: { name: 'Un verano entero', condition: `Juegos con ${MARATHON_HOURS} h o más a la espalda` },
    goal: (step) => (step === 1
      ? `Llega a las ${MARATHON_HOURS} h en un juego`
      : `Llega a las ${MARATHON_HOURS} h en ${step} juegos`),
    done: (step) => (step === 1
      ? `Le has metido ${MARATHON_HOURS} h a un juego`
      : `Le has metido ${MARATHON_HOURS} h a ${step} juegos`),
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: (hoursOf(game) ?? 0) >= MARATHON_HOURS, at: firstEnteredAt(game) }))),
  },
  {
    key: 'paciencia',
    family: 'mirror',
    steps: [1, 2, 3, 4, 5],
    rarity: 'excepcional',
    icon: 'paciencia',
    labels: { name: 'Ya iba siendo hora', condition: 'Juegos rescatados después de más de un año esperando' },
    goal: (step) => (step === 1
      ? 'Termina un juego que llevaba más de un año en Próximos'
      : `Termina ${step} juegos que llevaban más de un año en Próximos`),
    done: (step) => (step === 1
      ? 'Has rescatado un juego que llevaba más de un año en Próximos'
      : `Has rescatado ${step} juegos que llevaban más de un año en Próximos`),
    metric: ({ games }) =>
      count(
        (games.c || []).map((game) => {
          const waited = enteredAt(game, 'p');
          const done = enteredAt(game, 'c');
          return { ok: waited > 0 && done > waited + YEAR_MS, at: done };
        }),
      ),
  },
  {
    key: 'criterio',
    family: 'mirror',
    steps: [25, 50, 75, 100, 150, 200, 300, 400, 500],
    rarity: 'infrecuente',
    icon: 'criterio',
    labels: { name: 'Nota del crítico', condition: 'Juegos puntuados, y no todos igual' },
    goal: (step) => `Puntúa ${step} juegos sin clavar la misma nota`,
    done: (step) => `Has puntuado ${step} juegos, y no todos igual`,
    metric: ({ games }) => {
      // GUARDA (§7.5): solo las notas que EXISTEN. Los juegos sin puntuar resuelven a 0, y contarlos inflaría a la
      // vez el número de notas y la dispersión —un montón de ceros junto a notas reales dispara la desviación—,
      // que es justo lo contrario de lo que este logro premia.
      const scored = allGames(games)
        .map(({ game }) => ({ grade: gradeIfScored(game), at: game.gradedAt || 0 }))
        .filter((entry): entry is { grade: number; at: number } => entry.grade !== null);
      if (stdDev(scored.map((entry) => entry.grade)) < CRITERIA_MIN_STDDEV) return { value: 0 };
      return { value: scored.length, stamps: scored.map((entry) => entry.at) };
    },
  },
  {
    key: 'memoria-larga',
    family: 'mirror',
    steps: [3, 8, 15, 25],
    rarity: 'raro',
    icon: 'memoria-larga',
    labels: { name: 'Partida guardada', condition: 'Años distintos en los que completaste algo' },
    goal: (step) => `Completa algo en ${step} años distintos`,
    done: (step) => `Has completado algo en ${step} años distintos`,
    // Mide sobre `years` y NO sobre `enteredAt`: sobre una biblioteca real, `enteredAt.c` daba 1 año y `years`
    // daba 22, poblado al 100 % (§6.8).
    metric: ({ games }) => {
      const years = new Set<number>();
      for (const game of games.c || []) for (const year of playedYears(game)) years.add(year);
      return { value: years.size, stamps: [...years].sort((a, b) => a - b).map(endOfYear) };
    },
  },
  {
    key: 'cadena-de-anos',
    family: 'mirror',
    steps: [3, 5, 8, 10, 12, 15, 17, 20],
    rarity: 'raro',
    icon: 'cadena-de-anos',
    labels: { name: 'Toda una vida', condition: 'Años seguidos jugando' },
    goal: (step) => `Enlaza ${step} años seguidos jugando`,
    done: (step) => `Llevas ${step} años seguidos jugando`,
    // Años SEGUIDOS, no distintos: es lo que «Partida guardada» no puede decir. Y sale de `years`, así que
    // reconoce al veterano desde el primer día en vez de pedirle que empiece a contar ahora.
    metric: ({ games }) => {
      const years: number[] = [];
      for (const { game } of allGames(games)) years.push(...playedYears(game));
      return bestYearStreak(years);
    },
  },
  {
    key: 'deshielo',
    family: 'mirror',
    steps: [2, 3, 4, 6, 8],
    rarity: 'excepcional',
    icon: 'deshielo',
    labels: { name: 'El deshielo', condition: 'Meses seguidos bajando la pila de Próximos' },
    goal: (step) => `Baja Próximos ${step} meses seguidos`,
    done: (step) => `Has bajado Próximos ${step} meses seguidos`,
    metric: ({ games }) => bestDownStreak(backlogDeltas(games)),
  },
  {
    key: 'estanteria',
    family: 'mirror',
    steps: [5, 10, 20, 35, 50, 75, 100],
    rarity: 'raro',
    icon: 'estanteria',
    labels: { name: 'La pila de la vergüenza', condition: 'Juegos que sacaste de Próximos para jugarlos' },
    goal: (step) => `Saca ${step} juegos de Próximos y juégalos`,
    done: (step) => `Has sacado ${step} juegos de Próximos para jugarlos`,
    metric: ({ games }) =>
      count(
        allGames(games).map(({ game }) => {
          const waited = enteredAt(game, 'p');
          if (waited <= 0) return { ok: false, at: 0 };
          let played = 0;
          for (const tab of ['c', 'v', 'e'] as const) {
            const stamp = enteredAt(game, tab);
            if (stamp > waited && (played === 0 || stamp < played)) played = stamp;
          }
          return { ok: played > 0, at: played };
        }),
      ),
  },
  {
    key: 'dieta',
    family: 'mirror',
    steps: [1],
    rarity: 'raro',
    icon: 'dieta',
    labels: { name: 'A régimen', condition: 'Próximos, a la mitad de lo que llegó a ser' },
    goal: () => 'Deja Próximos en la mitad de lo que llegó a ser',
    done: () => 'Has dejado Próximos en la mitad de lo que llegó a ser',
    // El escalón alcanzable que faltaba entre «El deshielo» (rachas) y «Exterminatus» (el cero absoluto). Es
    // RELATIVO a tu propio máximo, así que dice lo mismo para una pila de diez que para una de doscientos.
    metric: ({ games }) => {
      const curve = backlogCurve(games);
      // GUARDA (§7.5): sin pila que bajar no hay mérito. Con menos de cuatro, «la mitad» es ruido.
      if (curve.peak < 4) return { value: 0 };
      return { value: backlogSize(games) * 2 <= curve.peak ? 1 : 0, stamps: [curve.at] };
    },
  },
  {
    key: 'veterano',
    family: 'mirror',
    steps: [1, 2, 3, 5],
    rarity: 'comun',
    icon: 'veterano',
    labels: { name: 'De la vieja escuela', condition: 'Años que llevas con perfil aquí' },
    goal: (step) => (step === 1
      ? 'Cumple un año con perfil aquí'
      : `Cumple ${step} años con perfil aquí`),
    done: (step) => (step === 1
      ? 'Llevas un año por aquí'
      : `Llevas ${step} años por aquí`),
    // EL ÚNICO LOGRO VERIFICABLE DE TODO EL CATÁLOGO, y por eso está: `createdAt` lo sella el SERVIDOR
    // (`serverTimestamp()`) y a partir de ahí las reglas lo congelan, incluso para su dueño
    // (`profileCreatedAtIsImmutable`). No se puede falsear sin que el panel de administración lo cante.
    metric: ({ social, now }) => {
      const since = social.profileCreatedAt;
      if (since <= 0 || since > now) return { value: 0 };
      const stamps: number[] = [];
      for (let year = 1; ; year += 1) {
        const anniversary = new Date(since);
        anniversary.setFullYear(anniversary.getFullYear() + year);
        if (anniversary.getTime() > now) break;
        stamps.push(anniversary.getTime());
        if (year > 50) break; // cordura: un perfil no tiene medio siglo
      }
      return { value: stamps.length, stamps };
    },
  },
  {
    key: 'tutorial',
    family: 'mirror',
    steps: [1],
    rarity: 'comun',
    icon: 'tutorial',
    labels: { name: 'Tutorial superado', condition: 'Todos los primeros pasos, hechos' },
    goal: () => 'Haz todos los primeros pasos',
    done: () => 'Has hecho todos los primeros pasos',
    // META: se calcula sobre OTROS logros, en la segunda pasada del evaluador (`earned`). Y NO es de familia
    // «primeros pasos» a propósito: aquella no puntúa ni se publica porque se apaga sola, y este es justo el que
    // se queda —«ya sabes usar esto»— y el único de los diez que merece contar.
    metric: ({ earned }) => {
      const steps = ACHIEVEMENTS.filter((def) => def.family === 'onboarding');
      if (steps.length === 0 || !earned) return { value: 0 };
      return flag(steps.every((def) => earned.has(def.id)));
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // ESPEJO · OCULTOS — nombre y condición tapados hasta conseguirlos (§6.7).
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'obra-maestra',
    family: 'mirror',
    hidden: true,
    steps: [1, 2],
    rarity: 'excepcional',
    icon: 'obra-maestra',
    labels: { name: 'Obra maestra', condition: 'Un 100 a un juego' },
    goal: (step) => (step === 1
      ? 'Ponle un 100 a un juego'
      : `Ponle un 100 a ${step} juegos`),
    done: (step) => (step === 1
      ? 'Le has puesto un 100 a un juego'
      : `Le has puesto un 100 a ${step} juegos`),
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: gradeIfScored(game) === 100, at: game.gradedAt || 0 }))),
  },
  {
    key: 'sofa',
    family: 'mirror',
    hidden: true,
    steps: [5, 15, 25, 50, 75],
    rarity: 'comun',
    icon: 'sofa',
    labels: { name: 'Jugado en el sofá', condition: 'Juegos que has marcado como Steam Deck' },
    goal: (step) => `Marca ${step} juegos como Steam Deck`,
    done: (step) => `Has marcado ${step} juegos como Steam Deck`,
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: Boolean(game.steamDeck), at: firstEnteredAt(game) }))),
  },
  {
    key: 'speedrun',
    family: 'mirror',
    hidden: true,
    retired: true,
    steps: [1, 3],
    rarity: 'excepcional',
    icon: 'speedrun',
    labels: { name: 'Speedrun', condition: 'Juegos cerrados el mismo día que los apilaste' },
    goal: (step) => (step === 1
      ? 'Cierra un juego el mismo día que lo apilas'
      : `Cierra ${step} juegos el mismo día que los apilas`),
    done: (step) => (step === 1
      ? 'Has cerrado un juego el mismo día que lo apilaste'
      : `Has cerrado ${step} juegos el mismo día que los apilaste`),
    // RETIRADO, no borrado (§6.4): deja de ofrecerse y de contar en la fracción, pero se sigue pintando a quien
    // lo tenga. Se retira porque pide el par de sellos que ninguna biblioteca preexistente tiene (0 de 302) Y
    // además el mismo día: era la casilla más dormida del catálogo.
    metric: ({ games }) =>
      count(
        allGames(games).map(({ game }) => {
          const arrived = enteredAt(game, 'p');
          let closed = 0;
          for (const tab of ['c', 'v'] as const) {
            const stamp = enteredAt(game, tab);
            if (stamp > 0 && (closed === 0 || stamp < closed)) closed = stamp;
          }
          return { ok: sameLocalDay(arrived, closed), at: closed };
        }),
      ),
  },
  {
    key: 'segunda-vuelta',
    family: 'mirror',
    hidden: true,
    steps: [1, 3, 5, 10, 20, 35, 50],
    rarity: 'raro',
    icon: 'segunda-vuelta',
    labels: { name: 'Volver a la hoguera', condition: 'Juegos que terminaste después de haberlos dejado' },
    goal: (step) => (step === 1
      ? 'Termina un juego que habías dejado'
      : `Termina ${step} juegos que habías dejado`),
    done: (step) => (step === 1
      ? 'Has terminado un juego que habías dejado'
      : `Has terminado ${step} juegos que habías dejado`),
    metric: ({ games }) =>
      count(
        (games.c || []).map((game) => {
          const quit = enteredAt(game, 'v');
          const done = enteredAt(game, 'c');
          return { ok: quit > 0 && done > quit, at: done };
        }),
      ),
  },
  {
    key: 'estanteria-cero',
    family: 'mirror',
    hidden: true,
    descending: true,
    steps: [50, 25, 10, 5, 1],
    rarity: 'excepcional',
    icon: 'estanteria-cero',
    labels: { name: 'Exterminatus', condition: 'Próximos bajo mínimos' },
    goal: (step) => (step === 1
      ? 'Deja Próximos en un juego o ninguno'
      : `Deja Próximos en ${step} juegos o menos`),
    done: (step) => (step === 1
      ? 'Has dejado Próximos en un juego o ninguno'
      : `Has dejado Próximos en ${step} juegos o menos`),
    // MENOS ES MEJOR, y por eso es la única escalera descendente del catálogo. El escalón único de «dejarlo a
    // cero» le pasaba a quien no usa Próximos y no le llegaba jamás a quien tiene sesenta: escalonarlo lo
    // convierte en el trayecto que de verdad se recorre.
    //
    // GUARDA (§7.5): la lista vacía es cierta para quien vació su pila **y para quien acaba de instalar la app**.
    // Hay que HABER TENIDO pila; sin ella el valor es deliberadamente inalcanzable, no cero.
    metric: ({ games }) => {
      const curve = backlogCurve(games);
      if (curve.peak < 4) return { value: UNREACHABLE };
      // Sin fecha por escalón: reconstruir cuándo cruzó cada umbral hacia abajo exigiría el stock día a día, y el
      // sello del último movimiento diría que todos se consiguieron a la vez. Conseguido sin fecha es un estado
      // previsto (§5.3).
      return { value: backlogSize(games) };
    },
  },
  {
    key: 'orgullo',
    family: 'mirror',
    hidden: true,
    steps: [1, 3, 5],
    rarity: 'raro',
    icon: 'orgullo',
    labels: { name: 'Por pura cabezonería', condition: 'Juegos terminados con menos de 50' },
    goal: (step) => (step === 1
      ? 'Termina un juego al que le pusiste menos de 50'
      : `Termina ${step} juegos a los que les pusiste menos de 50`),
    done: (step) => (step === 1
      ? 'Has terminado un juego que ni te gustaba'
      : `Has terminado ${step} juegos que ni te gustaban`),
    metric: ({ games }) =>
      count(
        (games.c || []).map((game) => {
          // GUARDA (§7.5): `grade > 0`. Sin ella este logro cuenta TODOS los completados sin puntuar, porque la
          // nota ausente resuelve a 0 y 0 es menor que 50. Es el falso positivo de «Speedrun» con otro campo.
          const grade = gradeIfScored(game);
          return { ok: grade !== null && grade < 50, at: game.gradedAt || enteredAt(game, 'c') };
        }),
      ),
  },
  {
    key: 'no-eres-tu',
    family: 'mirror',
    hidden: true,
    steps: [1, 3, 5],
    rarity: 'raro',
    icon: 'no-eres-tu',
    labels: { name: 'No eres tú, soy yo', condition: 'Juegos que dejaste con un 70 o más' },
    goal: (step) => (step === 1
      ? 'Deja un juego al que le pusiste 70 o más'
      : `Deja ${step} juegos a los que les pusiste 70 o más`),
    done: (step) => (step === 1
      ? 'Has dejado un juego que te gustaba'
      : `Has dejado ${step} juegos que te gustaban`),
    metric: ({ games }) =>
      count(
        (games.v || []).map((game) => {
          const grade = gradeIfScored(game);
          return { ok: grade !== null && grade >= 70, at: game.gradedAt || enteredAt(game, 'v') };
        }),
      ),
  },
  {
    key: 'vida-entera',
    family: 'mirror',
    hidden: true,
    steps: [1, 2, 4],
    rarity: 'raro',
    icon: 'vida-entera',
    labels: { name: 'Ahí se te fue la vida', condition: 'Más de 300 h en un solo juego' },
    goal: (step) => (step === 1
      ? 'Pasa de 300 h en un solo juego'
      : `Pasa de 300 h en ${step} juegos distintos`),
    done: (step) => (step === 1
      ? 'Le has echado más de 300 h a un juego'
      : `Le has echado más de 300 h a ${step} juegos`),
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: (hoursOf(game) ?? 0) >= 300, at: firstEnteredAt(game) }))),
  },
  {
    key: 'platino',
    family: 'mirror',
    hidden: true,
    steps: [3, 10],
    rarity: 'excepcional',
    icon: 'platino',
    labels: { name: 'Cien por cien', condition: 'Logros llevados hasta su último escalón' },
    goal: (step) => `Lleva ${step} logros hasta su último escalón`,
    done: (step) => `Has llevado ${step} logros hasta el último escalón`,
    // META, como «Tutorial superado»: segunda pasada del evaluador. Dos escalones y no cuatro, por la regla del
    // §6.9 — un excepcional se consigue, no se repite.
    metric: ({ earned }) => {
      if (!earned) return { value: 0 };
      const done = new Set<string>();
      for (const ladder of LADDERS) {
        // Ni a sí mismo, ni los retirados, ni los primeros pasos: una escalera de un solo escalón que se apaga
        // sola no es una escalera «terminada», y contarla regalaría medio logro a quien acaba de instalar.
        if (ladder.key === 'platino' || ladder.retired || ladder.family === 'onboarding') continue;
        const last = ladder.steps[ladder.steps.length - 1];
        if (last !== undefined && earned.has(`${ladder.key}-${last}`)) done.add(ladder.key);
      }
      return { value: done.size };
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // DATOS — rellenar la ficha. El único empuje con contraprestación: cada campo mejora TUS estadísticas.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'horas',
    family: 'data',
    steps: [10, 25, 40, 60, 80, 100, 125, 150],
    rarity: 'comun',
    icon: 'horas',
    labels: { name: 'El contador de horas', condition: 'Juegos con las horas apuntadas' },
    goal: (step) => `Apunta las horas de ${step} juegos`,
    done: (step) => `Has apuntado las horas de ${step} juegos`,
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: hoursOf(game) !== null, at: firstEnteredAt(game) }))),
  },
  {
    key: 'resenas',
    family: 'data',
    steps: [5, 25, 50, 75, 100, 150, 200],
    rarity: 'infrecuente',
    icon: 'resenas',
    labels: { name: 'Con tus palabras', condition: 'Reseñas que has escrito' },
    goal: (step) => (step === 1
      ? 'Escribe una reseña'
      : `Escribe ${step} reseñas`),
    done: (step) => (step === 1
      ? 'Has escrito una reseña'
      : `Has escrito ${step} reseñas`),
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: hasReview(game), at: game.reviewedAt || 0 }))),
  },
  {
    key: 'cobertura',
    family: 'data',
    steps: [25, 40, 50, 60, 75, 90],
    rarity: 'raro',
    icon: 'cobertura',
    labels: { name: 'Sin cabos sueltos', condition: 'Parte de lo que cierras que acaba con reseña' },
    goal: (step) => `Deja con reseña el ${step} % de lo que cierras`,
    done: (step) => `Dejas con reseña el ${step} % de lo que cierras`,
    // EN PORCENTAJE Y NO EN NÚMEROS, a propósito: contado en unidades diría exactamente lo mismo que «Con mis
    // palabras» —dos medallas para el mismo número— y lo que aquí se mide es la PROPORCIÓN, que no mide nadie más.
    metric: ({ games }) => {
      const closed = closedGames(games);
      // GUARDA (§7.5): sin nada cerrado el denominador es 0. Un `NaN` recorriendo el empaquetado ensucia la
      // cadena sin que salte ningún error, que es la peor forma de fallar.
      if (closed.length === 0) return { value: 0 };
      const withReview = closed.filter(hasReview).length;
      // Un porcentaje no tiene sello por unidad: este logro se consigue SIN FECHA, y es un estado previsto (§5.3).
      return { value: Math.round((withReview / closed.length) * 100) };
    },
  },
  {
    key: 'ficha-completa',
    family: 'data',
    steps: [10, 25, 50, 100, 150, 250],
    rarity: 'infrecuente',
    icon: 'ficha-completa',
    labels: { name: 'Ficha de manual', condition: 'Fichas con géneros, plataforma, nota y reseña' },
    goal: (step) => `Rellena la ficha entera de ${step} juegos: géneros, plataforma, nota y reseña`,
    done: (step) => `Tienes la ficha entera de ${step} juegos`,
    metric: ({ games }) =>
      count(
        allGames(games).map(({ game }) => ({
          ok:
            (game.genres || []).length > 0 &&
            (game.platforms || []).length > 0 &&
            gradeIfScored(game) !== null &&
            hasReview(game),
          at: game.reviewedAt || firstEnteredAt(game),
        })),
      ),
  },
  {
    key: 'autopsia',
    family: 'data',
    steps: [3, 10, 20, 30, 50, 75],
    rarity: 'infrecuente',
    icon: 'autopsia',
    labels: { name: 'Informe forense', condition: 'Juegos que dejaste con motivo y reseña' },
    goal: (step) => `Deja motivo y reseña en ${step} abandonos`,
    done: (step) => `Has dejado motivo y reseña en ${step} abandonos`,
    metric: ({ games }) =>
      count(
        (games.v || []).map((game) => ({
          ok: hasReason(game) && hasReview(game),
          at: game.reviewedAt || enteredAt(game, 'v'),
        })),
      ),
  },
  {
    key: 'luces-y-sombras',
    family: 'data',
    steps: [5, 25, 50, 75, 100, 150, 200, 250],
    rarity: 'infrecuente',
    icon: 'luces-y-sombras',
    labels: { name: 'Luces y sombras', condition: 'Reseñas en las que cuentas lo bueno y lo malo' },
    goal: (step) => `Escribe ${step} reseñas contando lo bueno y lo malo`,
    done: (step) => `Has escrito ${step} reseñas contando lo bueno y lo malo`,
    metric: ({ games }) =>
      count(
        allGames(games).map(({ game }) => ({
          ok: hasReview(game) && (game.strengths || []).length > 0 && (game.weaknesses || []).length > 0,
          at: game.reviewedAt || 0,
        })),
      ),
  },
  {
    key: 'tesis',
    family: 'data',
    hidden: true,
    steps: [1, 5, 20, 50, 100],
    rarity: 'infrecuente',
    icon: 'tesis',
    labels: { name: 'Tesis doctoral', condition: `Reseñas de más de ${THESIS_CHARS} caracteres` },
    goal: (step) => (step === 1
      ? `Escribe una reseña de más de ${THESIS_CHARS} caracteres`
      : `Escribe ${step} reseñas de más de ${THESIS_CHARS} caracteres`),
    done: (step) => (step === 1
      ? `Te has soltado en una reseña de más de ${THESIS_CHARS} caracteres`
      : `Te has soltado en ${step} reseñas de más de ${THESIS_CHARS} caracteres`),
    // Oculto y de familia `datos`, que no es contradictorio: lo que hace dañino a un oculto no es su familia, es
    // pedir un trabajo largo que no se puede empezar porque no se sabe cuál es. Esto es un hecho suelto que se
    // reconoce, no una campaña por toda la biblioteca (§6.7).
    metric: ({ games }) =>
      count(
        allGames(games).map(({ game }) => ({
          ok: String(game.review || '').trim().length > THESIS_CHARS,
          at: game.reviewedAt || 0,
        })),
      ),
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // SOCIAL — umbrales bajos y planos a propósito: nada que premie coleccionar contactos ni llenar el feed ajeno.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'amistades',
    family: 'social',
    steps: [1, 3, 5, 10, 15, 20, 30, 40],
    rarity: 'comun',
    icon: 'amistades',
    labels: { name: 'Modo cooperativo', condition: 'Amistades confirmadas' },
    goal: (step) => (step === 1
      ? 'Confirma una amistad'
      : `Confirma ${step} amistades`),
    done: (step) => (step === 1
      ? 'Tienes una amistad confirmada'
      : `Tienes ${step} amistades confirmadas`),
    metric: ({ social }) => ({ value: Math.max(0, social.friends) }),
  },
  {
    key: 'conversador',
    family: 'social',
    steps: [2, 8, 16, 26, 39, 52, 78, 104],
    rarity: 'infrecuente',
    icon: 'conversador',
    labels: { name: 'Charla de taberna', condition: 'Semanas distintas en las que has publicado algo' },
    goal: (step) => `Publica algo en ${step} semanas distintas`,
    done: (step) => `Has publicado algo en ${step} semanas distintas`,
    // SEMANAS, no publicaciones: si midiera volumen, el premio sería llenar el feed ajeno; midiendo semanas, el
    // premio es aparecer de vez en cuando. El gist recorta `posts` a 100 y `activity` a 320, así que quien
    // publique mucho durante años perderá las semanas viejas: el valor puede bajar y la marca de agua lo sostiene.
    metric: ({ social }) => ({ value: Math.max(0, social.postWeeks) }),
  },
  {
    key: 'escaparate',
    family: 'social',
    steps: [1, 5, 15, 30, 50, 75, 100, 150],
    rarity: 'infrecuente',
    icon: 'escaparate',
    labels: { name: 'Puertas abiertas', condition: 'Juegos que has compartido al canal público' },
    goal: (step) => (step === 1
      ? 'Comparte un juego al canal público'
      : `Comparte ${step} juegos al canal público`),
    done: (step) => (step === 1
      ? 'Has compartido un juego al canal público'
      : `Has compartido ${step} juegos al canal público`),
    // Usa `shared`, que hasta ahora no daba nada. Arranca en cero para todo el mundo —nadie tiene juegos
    // compartidos todavía— y despierta con un clic, no con años: es conducta futura, no historia.
    metric: ({ games }) =>
      count(allGames(games).map(({ game }) => ({ ok: Boolean(game.shared), at: firstEnteredAt(game) }))),
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // ANUAL — el calendario fabrica contenido nuevo sin tocar el catálogo (§6.3).
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'ano-redondo',
    family: 'annual',
    steps: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30],
    rarity: 'excepcional',
    icon: 'ano-redondo',
    labels: { name: 'Solsticio a solsticio', condition: 'Años en los que no faltaste ningún mes' },
    goal: (step) => (step === 1
      ? 'Aguanta un año entero sin faltar ningún mes'
      : `Aguanta ${step} años sin faltar ningún mes`),
    done: (step) => (step === 1
      ? 'Has estado los doce meses de un año'
      : `Has estado los doce meses en ${step} años`),
    metric: ({ games }) => {
      const monthsByYear = new Map<number, Set<string>>();
      for (const stamp of activityStamps(games)) {
        const month = localMonthKey(stamp);
        const year = Number(month.slice(0, 4));
        if (!Number.isFinite(year)) continue;
        const set = monthsByYear.get(year) || new Set<string>();
        set.add(month);
        monthsByYear.set(year, set);
      }
      const complete = [...monthsByYear.entries()]
        .filter(([, months]) => months.size === 12)
        .map(([year]) => year)
        .sort((a, b) => a - b);
      return { value: complete.length, stamps: complete.map(endOfYear) };
    },
  },
  {
    key: 'buena-cosecha',
    family: 'annual',
    steps: [5, 8, 12, 16, 20, 25],
    rarity: 'raro',
    icon: 'buena-cosecha',
    labels: { name: 'Cosecha del año', condition: 'Juegos terminados en un mismo año' },
    goal: (step) => `Termina ${step} juegos en un mismo año`,
    done: (step) => `Has terminado ${step} juegos en un mismo año`,
    // El valor es LA MEJOR COSECHA, no cuántos años buenos llevas. Mide sobre `years`, como `memoria-larga`.
    metric: ({ games }) => {
      const perYear = new Map<number, number>();
      for (const game of games.c || []) {
        for (const year of playedYears(game)) perYear.set(year, (perYear.get(year) || 0) + 1);
      }
      let best = 0;
      let bestYear = 0;
      for (const [year, total] of perYear) {
        if (total > best) { best = total; bestYear = year; }
      }
      // Un solo sello, repetido: la cosecha se cierra al acabar su año, y todos los escalones que alcanza los
      // alcanza ahí.
      return { value: best, stamps: best > 0 ? Array.from({ length: best }, () => endOfYear(bestYear)) : [] };
    },
  },
  {
    key: 'aniversario',
    family: 'annual',
    steps: [1, 2, 3, 5, 10, 15, 20, 25, 30],
    rarity: 'raro',
    icon: 'aniversario',
    labels: { name: 'Otro año más', condition: 'Cumpleaños de tu perfil en los que andabas por aquí' },
    goal: (step) => (step === 1
      ? 'Ven por aquí el mes en que tu perfil cumpla años'
      : `Ven por aquí ${step} cumpleaños de tu perfil`),
    done: (step) => (step === 1
      ? 'Andabas por aquí cuando tu perfil cumplió años'
      : `Andabas por aquí en ${step} cumpleaños de tu perfil`),
    // El segundo repetible anual, y el que de verdad premia VOLVER: no basta con que pase el tiempo —eso ya lo
    // cuenta «De la vieja escuela»—, hay que estar ahí el mes en que la cuenta cumple años.
    metric: ({ games, social, now }) => {
      const since = social.profileCreatedAt;
      if (since <= 0 || since > now) return { value: 0 };
      const active = new Set(activityStamps(games).map((stamp) => localMonthKey(stamp)));
      const stamps: number[] = [];
      for (let year = 1; year <= 50; year += 1) {
        const anniversary = new Date(since);
        anniversary.setFullYear(anniversary.getFullYear() + year);
        const at = anniversary.getTime();
        if (at > now) break;
        if (active.has(localMonthKey(at))) stamps.push(at);
      }
      return { value: stamps.length, stamps };
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  // PRIMEROS PASOS — conocer la app. Un solo escalón, NO SE PUBLICAN NUNCA, no dan tema, no puntúan y se apagan
  // solos. Ocho, uno más de lo que el §6.2 recomendaba: los dos nuevos entran porque enseñan las dos cosas que
  // la app hace y nadie más hace —apilar y abandonar con motivo—, y «apilar» es además el gesto que despierta
  // los logros que necesitan el par de sellos de `enteredAt`.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    key: 'paso-primer-juego',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-primer-juego',
    labels: { name: 'Empieza la partida', condition: 'Tu primer juego' },
    goal: () => 'Añade tu primer juego',
    done: () => 'Has añadido tu primer juego',
    metric: ({ games }) => flag(allGames(games).length > 0),
  },
  {
    key: 'paso-proximos',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-proximos',
    labels: { name: 'La pila empieza aquí', condition: 'Tu primer juego en Próximos' },
    goal: () => 'Añade tu primer juego a Próximos',
    done: () => 'Ya tienes tu primer juego en Próximos',
    // El gesto más rentable del catálogo: sin un solo sello en `p` hay seis logros que no pueden despertar nunca.
    metric: ({ games }) => flag((games.p || []).length > 0),
  },
  {
    key: 'paso-resena',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-resena',
    labels: { name: 'Despierta, samurái', condition: 'Tu primera reseña' },
    goal: () => 'Escribe tu primera reseña',
    done: () => 'Has escrito tu primera reseña',
    metric: ({ games }) => flag(allGames(games).some(({ game }) => hasReview(game))),
  },
  {
    key: 'paso-abandono',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-abandono',
    labels: { name: 'Corta por lo sano', condition: 'Tu primer juego dejado con su motivo' },
    goal: () => 'Deja un juego y apunta por qué',
    done: () => 'Has dejado un juego apuntando por qué',
    metric: ({ games }) => flag((games.v || []).some((game) => hasReason(game))),
  },
  {
    key: 'paso-sync',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-sync',
    labels: { name: 'Partida en la nube', condition: 'La sincronización, conectada' },
    goal: () => 'Conecta la sincronización',
    done: () => 'Tienes la sincronización conectada',
    metric: ({ device }) => flag(device.hasSync),
  },
  {
    key: 'paso-nota',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-nota',
    labels: { name: 'Del 0 al 100', condition: 'Tu primera nota fina' },
    goal: () => 'Pon tu primera nota fina',
    done: () => 'Has puesto tu primera nota fina',
    metric: ({ games }) => flag(allGames(games).some(({ game }) => gradeIfScored(game) !== null)),
  },
  {
    key: 'paso-ruleta',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-ruleta',
    labels: { name: 'Tira el dado', condition: 'La ruleta, probada' },
    goal: () => 'Prueba la ruleta',
    done: () => 'Has probado la ruleta',
    // EL ÚNICO DATO DE TODO EL CATÁLOGO QUE HAY QUE REGISTRAR EN VEZ DE DERIVAR: `core/roulette/roulette.ts` es
    // una función pura —tira, devuelve un juego y no persiste ni un byte—, así que sin este sello no hay forma de
    // saber que alguien la usó. Vive en `LocalMeta`, nunca sube y no se publica (§5.3ter).
    metric: ({ device }) => flag(device.rouletteUsedAt > 0),
  },
  {
    key: 'paso-tema',
    family: 'onboarding',
    steps: [1],
    rarity: 'comun',
    icon: 'paso-tema',
    labels: { name: 'Ajustes de vídeo', condition: 'Un tema estrenado' },
    goal: () => 'Estrena un tema',
    done: () => 'Has estrenado un tema',
    // Derivado de la paleta activa, no de un registro: si vuelve a la de fábrica el valor cae a 0 y la marca de
    // agua lo conserva, que es justo para lo que está (§5.5).
    metric: ({ device }) => flag(device.themeChanged),
  },
];

/**
 * Valor que NINGÚN umbral descendente alcanza. Es lo que devuelve una escalera de «menos es mejor» cuando la
 * guarda dice que no hay nada que medir: cero significaría «lo has conseguido todo».
 */
export const UNREACHABLE = 999_999;

/** Cuenta valores DISTINTOS de una lista de etiquetas, con el sello del juego que estrena cada uno. */
function firstOfEach(games: GameItem[], pick: (game: GameItem) => string[] | undefined): AchievementMeasure {
  const firstSeen = new Map<string, number>();
  // Por orden cronológico, para que el sello sea el del juego que de verdad estrenó la etiqueta y no el del
  // primero que aparezca en la lista.
  const ordered = [...games].sort((a, b) => firstEnteredAt(a) - firstEnteredAt(b));
  for (const game of ordered) {
    for (const raw of pick(game) || []) {
      const label = String(raw || '').trim().toLowerCase();
      if (!label || firstSeen.has(label)) continue;
      firstSeen.set(label, firstEnteredAt(game));
    }
  }
  return { value: firstSeen.size, stamps: [...firstSeen.values()] };
}

/**
 * La expansión: de escalera a escalones.
 *
 * El nombre lleva el grado en romano y la condición lleva el umbral, porque cada fila del listado es ya un logro
 * completo y tiene que poder leerse sola: «Créditos finales III · Juegos que has terminado: 50». Sin las dos
 * cosas, media pantalla dice el mismo nombre cinco veces.
 */
function expand(ladder: AchievementLadder): AchievementDef[] {
  const grades = ladder.steps.length;
  return ladder.steps.map((step, index) => ({
    id: `${ladder.key}-${step}`,
    ladder: ladder.key,
    grade: index + 1,
    grades,
    step,
    descending: Boolean(ladder.descending),
    family: ladder.family,
    icon: ladder.icon,
    rarity: ladder.rarity,
    ...(ladder.hidden ? { hidden: ladder.hidden } : {}),
    ...(ladder.retired ? { retired: ladder.retired } : {}),
    labels: {
      name: grades > 1 ? `${ladder.labels.name} ${romanLevel(index + 1, grades)}`.trim() : ladder.labels.name,
      condition: ladder.goal ? ladder.goal(step) : `${ladder.labels.condition}: ${step}`,
      // EL HECHO cae en la meta si la escalera no lo escribe. Es un respaldo que se lee raro a propósito
      // («Termina 100 juegos» bajo una medalla conseguida): así se nota en cuanto una escalera nueva se olvida
      // de su `done`, en vez de quedarse callado.
      done: ladder.done ? ladder.done(step) : (ladder.goal ? ladder.goal(step) : `${ladder.labels.condition}: ${step}`),
    },
    metric: ladder.metric,
  }));
}

/** EL CATÁLOGO: un logro por escalón, en el orden en que se declaran las escaleras. Ese orden es contrato. */
export const ACHIEVEMENTS: readonly AchievementDef[] = LADDERS.flatMap(expand);

/** Índice por `id`, para que el parser y la vista no recorran el catálogo entero en cada consulta. */
export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((def) => [def.id, def]),
);

/** Los escalones de una escalera, en orden. Lo usa la pantalla para enseñar solo el siguiente (§8.1ter). */
export const ACHIEVEMENTS_BY_LADDER: ReadonlyMap<string, readonly AchievementDef[]> = new Map(
  LADDERS.map((ladder) => [ladder.key, ACHIEVEMENTS.filter((def) => def.ladder === ladder.key)]),
);

export const LADDERS_BY_KEY: ReadonlyMap<string, AchievementLadder> = new Map(
  LADDERS.map((ladder) => [ladder.key, ladder]),
);

/**
 * Los que CUENTAN para la fracción y para los puntos: todos menos los «primeros pasos» y los retirados (§6.3.1).
 *
 * La regla es simétrica y de una línea: **lo que no se publica, no cuenta**. Los primeros pasos no salen del
 * aparato, así que si puntuaran, el dueño se vería un nivel y su amistad —que reconstruye el nivel desde el
 * espejo— le vería otro, con las dos cuentas correctas y ninguna forma de conciliarlas.
 */
export const SCORING_ACHIEVEMENTS: readonly AchievementDef[] = ACHIEVEMENTS.filter(
  (def) => def.family !== 'onboarding' && !def.retired,
);

/** Las escaleras que se evalúan al FINAL porque miden sobre otros logros (`tutorial`, `platino`). */
export const META_LADDERS: ReadonlySet<string> = new Set(['tutorial', 'platino']);
