import { memo } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { localWeekKey, mondayOfWeekKey } from '../../../core/utils/dateTime';
import type { ActivitySummary, WeekActivity } from '../../../core/stats/types';

/** Semanas que se enseñan: un año redondo, repartido en cuatro filas de trece (un trimestre por fila). */
const WEEKS = 52;
const COLUMNS = 13;
/** Sin al menos esto no hay ritmo que enseñar, solo un par de marcas sueltas. */
const MIN_WEEKS = 6;

const CELL = 22;
const GAP = 4;
const LABEL = 34;
const TOP = 4;

/** Cuántos niveles de intensidad. Cuatro se distinguen de un vistazo; con más, la rampa se vuelve un degradado. */
const LEVELS = 4;

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

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
function weekLabel(key: string): string {
  const monday = mondayOfWeekKey(key);
  return Number.isNaN(monday.getTime()) ? key : `sem. del ${DAY_MONTH.format(monday).replace('.', '')}`;
}

/**
 * TU CONSTANCIA: un mapa de calor donde cada cuadro es una SEMANA.
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
 * Cuatro niveles de intensidad y no un degradado continuo: lo que se lee en un mapa de calor es el patrón —dónde
 * hay racha y dónde hay hueco—, y para eso los saltos discretos se distinguen mejor que una rampa fina.
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
  const rows = Math.ceil(weeks.length / COLUMNS);
  const width = LABEL + COLUMNS * (CELL + GAP);
  const height = TOP + rows * (CELL + GAP) + 6;
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
      ? L.weekAria(weekLabel(week.w), 0)
      : `${weekLabel(week.w)}: ${L.detail(week.moves, week.reviews)}`;

  return (
    <div className="week-heat">
      <div className="week-heat-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} className="week-heat-svg" role="group" aria-label={L.chartAria}>
          {weeks.map((week, index) => {
            const row = Math.floor(index / COLUMNS);
            const column = index % COLUMNS;
            const level = levelOf(week.total);
            return (
              <g key={week.w} className={`week-heat-cell is-l${level}${focus.stateOf(week.w)}`} {...focus.controlProps(week.w, detailOf(week))}>
                <rect
                  x={LABEL + column * (CELL + GAP)}
                  y={TOP + row * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx="5"
                />
              </g>
            );
          })}
          {/* Un rótulo por fila con el mes en que arranca ese trimestre: sitúa el mapa en el calendario sin
              llenarlo de fechas. */}
          {Array.from({ length: rows }, (_unused, row) => {
            const first = weeks[row * COLUMNS];
            const monday = first ? mondayOfWeekKey(first.w) : new Date(NaN);
            return (
              <text key={row} className="week-heat-row" x="0" y={TOP + row * (CELL + GAP) + CELL / 2 + 4}>
                {Number.isNaN(monday.getTime()) ? '' : MONTH.format(monday).replace('.', '')}
              </text>
            );
          })}
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
