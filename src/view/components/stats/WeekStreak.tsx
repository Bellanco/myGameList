import { memo } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { localWeekKey, mondayOfWeekKey } from '../../../core/utils/dateTime';
import type { ActivitySummary, WeekActivity } from '../../../core/stats/types';
import { APP_LOCALE } from '../../../core/constants/locale';

/** Semanas que se enseñan: un año redondo, en UNA sola fila. */
const WEEKS = 52;
/** Sin al menos esto no hay ritmo que enseñar, solo un par de marcas sueltas. */
const MIN_WEEKS = 6;

/* Geometría del pulso. El lienzo es de ancho fijo y el SVG escala solo (`width: 100%`), así que estas cifras
   son proporciones, no píxeles: lo que fijan es la relación entre el grosor de la barra y su separación. */
const BAR = 12;
const GAP = 3;
const PAD = 2;
/** Alto del área de barras y de la base que se deja para los rótulos de mes. */
const PLOT = 86;
const AXIS = 16;
/** Alto mínimo de una semana SIN apuntes: un muñón, no un hueco invisible. Un hueco tiene que verse. */
const STUB = 5;
/** Sitio de arriba para el corchete de la racha viva y su rótulo. */
const BRACKET = 22;

/** Cuántos niveles de intensidad. Cuatro se distinguen de un vistazo; con más, la rampa se vuelve un degradado. */
const LEVELS = 4;

const MONTH = new Intl.DateTimeFormat(APP_LOCALE, { month: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat(APP_LOCALE, { day: 'numeric', month: 'short' });

/**
 * Las claves de las 52 semanas que ocupa el mapa: el último año redondo, terminando SIEMPRE en la semana en
 * curso.
 *
 * La serie que llega (`activity.weeks`) va de la primera semana con apuntes a la última, así que por sí sola el
 * mapa terminaba en el último apunte: quien llevara un mes sin tocar sus listas veía una rejilla que se cerraba
 * en abril y cuatro filas de longitudes distintas según su historial. Fijar la ventana al calendario deja las
 * cuatro filas de trece siempre completas y devuelve al hueco su significado —«aquí no volviste»—, que es
 * justamente lo que un mapa de constancia tiene que poder decir.
 */
function windowWeeks(): string[] {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0); // mediodía: ningún cambio de horario de verano puede mover el día
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: WEEKS }, (_unused, index) => {
    const week = new Date(monday);
    week.setDate(monday.getDate() - (WEEKS - 1 - index) * 7);
    return localWeekKey(week);
  });
}

/** Rótulo de una celda: la semana por su lunes ("12 may"), que es más legible que su número ISO. */
function weekLabel(key: string, weekOf: (monday: string) => string): string {
  const monday = mondayOfWeekKey(key);
  return Number.isNaN(monday.getTime()) ? key : weekOf(DAY_MONTH.format(monday).replace('.', ''));
}

/**
 * TU CONSTANCIA: el PULSO del último año, una barra por SEMANA.
 *
 * La unidad es la decisión que define el gráfico. El mapa de calor clásico pinta un cuadro por día, y aquí eso
 * sería engañoso: una lista de juegos no se toca a diario —se anota lo que se termina, y eso pasa cada pocos
 * días—, así que el año saldría casi entero en blanco y haría parecer inactivo a quien lleva años cuidándola. La
 * semana es la unidad en la que esta afición tiene ritmo: quien apunta algo cada semana es constante, aunque no
 * abra la app dos martes seguidos.
 *
 * Lo que cuenta son las fechas que la app registra SOLA (ver `enteredAt` y `reviewedAt`): mover un juego de lista
 * y escribir una reseña. Nada de esto se teclea, así que el mapa no premia rellenar campos, sino usar la app.
 *
 * Cuatro niveles de intensidad y no un degradado continuo: lo que se lee es el patrón —dónde hay racha y dónde
 * hay hueco—, y para eso los saltos discretos se distinguen mejor que una rampa fina. Aquí el nivel se ve DOS
 * veces, en la altura de la barra y en su color: quien no distinga bien los tonos sigue leyendo el ritmo por la
 * silueta, que es la razón de cambiar la rejilla de cuadros por barras.
 *
 * Arriba, el corchete de la RACHA VIVA marca hasta dónde llega la cuenta sin faltar; abajo, un rótulo de mes
 * cada nueve semanas sitúa el año sin llenar el eje de fechas.
 */
export const WeekStreak = memo(function WeekStreak({ activity }: { activity: ActivitySummary }) {
  const L = useStatsLabels().activity;
  const focus = useChartFocus();

  if (activity.weeks.length < MIN_WEEKS) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  // Las semanas del último año, rellenando con vacías las que no tienen apuntes (incluidas las posteriores al
  // último): el mapa cubre siempre el mismo periodo, lo haya vivido la biblioteca o no.
  const byKey = new Map(activity.weeks.map((week) => [week.w, week]));
  const weeks: WeekActivity[] = windowWeeks().map(
    (key) => byKey.get(key) || { w: key, reviews: 0, moves: 0, total: 0 },
  );
  // Escala de intensidad: el techo es la semana más movida del periodo, no un número fijo, para que el mapa
  // signifique lo mismo en una biblioteca de diez juegos que en una de mil.
  const ceiling = Math.max(...weeks.map((week) => week.total)) || 1;
  const levelOf = (total: number) => (total === 0 ? 0 : Math.min(LEVELS, Math.ceil((total / ceiling) * LEVELS)));

  const shown = weeks.find((week) => week.w === focus.active) || null;
  const active = weeks.filter((week) => week.total > 0).length;
  /**
   * La racha viva se cuenta sobre la ventana, no sobre la serie: `activity.currentStreak` se mide desde la última
   * semana CON apuntes, así que seguía diciendo «racha viva: 5 semanas» meses después del último. Ahora que el
   * mapa llega hasta hoy, esa cifra contradecía a la vista.
   *
   * La semana en curso, si todavía está vacía, no rompe nada: acaba de empezar y quedan días para anotar algo.
   */
  const liveStreak = (() => {
    let index = weeks.length - 1;
    if (weeks[index].total === 0) index -= 1;
    let streak = 0;
    for (; index >= 0 && weeks[index].total > 0; index -= 1) streak += 1;
    return streak;
  })();
  const detailOf = (week: WeekActivity) =>
    week.total === 0
      ? L.weekAria(weekLabel(week.w, L.weekOf), 0)
      : `${weekLabel(week.w, L.weekOf)}: ${L.detail(week.moves, week.reviews)}`;

  const width = PAD * 2 + WEEKS * (BAR + GAP);
  const height = BRACKET + PLOT + AXIS;
  const xOf = (index: number) => PAD + index * (BAR + GAP);
  /**
   * Altura por TOTAL (continua), color por NIVEL (discreto). Se probó la altura por nivel y con datos reales
   * salía un peine: la mayoría de las semanas caen en el mismo nivel, así que todas las barras medían igual y
   * solo se distinguían al acercarse. Con el total, dos semanas distintas se ven distintas —que es lo que uno
   * viene a mirar— y el color sigue agrupando en cuatro escalones, que es donde los saltos discretos ayudan.
   * La raíz cuadrada abre la parte baja de la escala: entre una semana de un apunte y otra de dos hay la misma
   * diferencia real que entre nueve y diez, pero solo la primera cuenta algo.
   */
  const barOf = (total: number) =>
    total === 0 ? STUB : STUB + (PLOT - STUB) * Math.sqrt(total / ceiling);
  /** Un rótulo de mes cada nueve semanas: sitúa el año sin convertir el eje en un calendario. */
  const ticks = weeks
    .map((week, index) => ({ week, index }))
    .filter(({ index }) => index % 9 === 0)
    .map(({ week, index }) => {
      const monday = mondayOfWeekKey(week.w);
      return { x: xOf(index), label: Number.isNaN(monday.getTime()) ? '' : MONTH.format(monday).replace('.', '') };
    });

  return (
    <div className="week-heat">
      <div className="week-heat-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} className="week-heat-svg" role="group" aria-label={L.chartAria}>
          {/* Corchete de la racha viva. Solo cuando hay más de una semana: con una, el corchete es más ruido
              que dato, y la cifra ya está en el pie. */}
          {liveStreak > 1 ? (
            <g className="week-heat-streak" aria-hidden="true">
              <path
                d={`M ${xOf(weeks.length - liveStreak)} ${BRACKET - 2} v -6 H ${xOf(weeks.length - 1) + BAR} v 6`}
              />
              <text x={(xOf(weeks.length - liveStreak) + xOf(weeks.length - 1) + BAR) / 2} y={BRACKET - 12}>
                {L.weeks(liveStreak)}
              </text>
            </g>
          ) : null}

          {weeks.map((week, index) => {
            const level = levelOf(week.total);
            const barHeight = barOf(week.total);
            return (
              <g
                key={week.w}
                className={`week-heat-cell is-l${level}${focus.stateOf(week.w)}`}
                {...focus.controlProps(week.w, detailOf(week))}
              >
                {/* Pista invisible a toda la altura: sin ella, apuntar a una semana floja pide precisión de
                    cirujano — la barra mide cinco píxeles. Con la pista, el objetivo es toda la columna. */}
                <rect className="week-heat-hit" x={xOf(index)} y={BRACKET} width={BAR} height={PLOT} />
                {/* La barra lleva clase PROPIA. Sin ella, la rampa de intensidad (`.is-lN rect`) pintaba también
                    la pista de arriba —que mide toda la altura— y cada semana salía como una columna entera del
                    color de su nivel: 52 barras idénticas en las que solo se distinguía la punta. */}
                <rect
                  className="week-heat-bar"
                  x={xOf(index)}
                  y={BRACKET + PLOT - barHeight}
                  width={BAR}
                  height={barHeight}
                  rx="3"
                />
              </g>
            );
          })}

          {ticks.map((tick) => (
            <text key={tick.x} className="week-heat-row" x={tick.x} y={height - 4}>
              {tick.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="week-heat-scale">
        <span>{L.less}</span>
        {Array.from({ length: LEVELS + 1 }, (_unused, level) => (
          <i key={level} className={`week-heat-key is-l${level}`} aria-hidden="true" />
        ))}
        <span>{L.more}</span>
      </div>

      <dl className="week-heat-stats">
        <div>
          <dt>{L.active}</dt>
          <dd>{L.activeHint(active, weeks.length)}</dd>
        </div>
        <div>
          <dt>{L.best}</dt>
          <dd>{L.weeks(activity.bestStreak)}</dd>
        </div>
        <div>
          <dt>{L.current}</dt>
          <dd>{L.weeks(liveStreak)}</dd>
        </div>
      </dl>

      <ChartDetail>
        {shown ? (
          <span>{detailOf(shown)}</span>
        ) : (
          <ChartDetailHint>{L.hint}</ChartDetailHint>
        )}
      </ChartDetail>
    </div>
  );
});
