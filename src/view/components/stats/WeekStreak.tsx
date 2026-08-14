import { memo } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
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

/** Lunes de la semana ISO `AAAA-Www`, para poder nombrar su mes. */
function mondayOf(key: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return new Date(NaN);
  const [year, week] = [Number(match[1]), Number(match[2])];
  const jan4 = new Date(year, 0, 4, 12);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** Rótulo de una celda: la semana por su lunes ("12 may"), que es más legible que su número ISO. */
function weekLabel(key: string): string {
  const monday = mondayOf(key);
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

  const weeks = activity.weeks.slice(-WEEKS);
  const rows = Math.ceil(weeks.length / COLUMNS);
  const width = LABEL + COLUMNS * (CELL + GAP);
  const height = TOP + rows * (CELL + GAP) + 6;
  // Escala de intensidad: el techo es la semana más movida del periodo, no un número fijo, para que el mapa
  // signifique lo mismo en una biblioteca de diez juegos que en una de mil.
  const ceiling = Math.max(...weeks.map((week) => week.total)) || 1;
  const levelOf = (total: number) => (total === 0 ? 0 : Math.min(LEVELS, Math.ceil((total / ceiling) * LEVELS)));

  const shown = weeks.find((week) => week.w === focus.active) || null;
  const active = weeks.filter((week) => week.total > 0).length;
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
            const monday = first ? mondayOf(first.w) : new Date(NaN);
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
          <dd>{L.weeks(activity.currentStreak)}</dd>
        </div>
      </dl>

      <ChartDetail>
        {shown ? (
          <span>{detailOf(shown)}</span>
        ) : (
          <ChartDetailHint>
            {activity.busiest ? L.busiest(weekLabel(activity.busiest.w), activity.busiest.total) : L.hint}
          </ChartDetailHint>
        )}
      </ChartDetail>
    </div>
  );
});
