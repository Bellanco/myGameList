import { memo, useState, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { ChartDetail, ChartDetailHint } from './ChartDetail';
import { GRADE_MAX, SCORE_BUCKET_FLOORS, STARS_MAX, hueFromGrade, starsFromGrade } from '../../../core/utils/scoreScale';
import type { TabId } from '../../../model/types/game';
import type { GameRef } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

/** Ancho de la celda de agrupación, en % del eje: puntos más cercanos que esto se apilan en vez de solaparse. */
const CELL = 2.2;
/** Separación vertical entre puntos apilados, en % de la altura. */
const LANE = 9;
/** A partir de aquí los puntos se dibujan más pequeños para que un año cargado siga respirando. */
const DENSE_FROM = 120;
/** Y por debajo de aquí, más grandes: media docena de puntos diminutos dejaba el lienzo desierto. */
const SPARSE_UP_TO = 12;

/** Anchura de los tramos con los que se calcula la silueta de densidad. */
const BINS = 22;

interface BeeswarmProps {
  games: GameRef[];
  scale: ScoreScale;
}

interface Dot {
  game: GameRef;
  /** Posición en el eje (0–100 %) y carril vertical (0 = centro, ±1, ±2…). */
  x: number;
  lane: number;
}

/**
 * Reparte los puntos en carriles: el eje manda en la posición horizontal y lo único que se toca es la vertical,
 * alternando arriba y abajo desde el centro. Así ningún punto tapa a otro y la silueta del enjambre sigue
 * diciendo dónde se acumulan las notas.
 */
function swarm(games: GameRef[]): Dot[] {
  const perCell = new Map<number, number>();
  // De menor a mayor nota: el apilado queda simétrico y estable entre renders.
  return [...games]
    .sort((a, b) => a.grade - b.grade || a.id - b.id)
    .map((game) => {
      const x = (Math.min(game.grade, GRADE_MAX) / GRADE_MAX) * 100;
      const cell = Math.round(x / CELL);
      const used = perCell.get(cell) ?? 0;
      perCell.set(cell, used + 1);
      // 0, +1, -1, +2, -2… a partir del orden de llegada a la celda.
      const lane = used === 0 ? 0 : Math.ceil(used / 2) * (used % 2 === 1 ? 1 : -1);
      return { game, x, lane };
    });
}

/**
 * Silueta de densidad: un histograma suavizado que se dibuja detrás del enjambre, reflejado arriba y abajo.
 *
 * Con la biblioteca entera los puntos se tocan y la forma deja de leerse a simple vista; la silueta la
 * devuelve. Se traza con cuadráticas entre puntos medios, que no se pasan de frenada e inventan picos.
 */
function densityPath(games: GameRef[]): string {
  const bins = new Array<number>(BINS).fill(0);
  for (const game of games) {
    const index = Math.min(Math.floor((game.grade / GRADE_MAX) * BINS), BINS - 1);
    bins[index] += 1;
  }
  // Núcleo de CINCO tramos (1-2-3-2-1) en vez de la media de tres: con tres, la silueta llegaba al pico con
  // hombros —un escalón a cada lado de la cima— y contra el borde del lienzo se veía el filo recto. Con cinco
  // baja en pendiente larga, que es lo que se espera de un velo de densidad. Los máximos no se mueven: el
  // núcleo es simétrico.
  const at = (index: number) => bins[Math.max(0, Math.min(BINS - 1, index))];
  const smooth = bins.map((_unused, index) =>
    (at(index - 2) + 2 * at(index - 1) + 3 * at(index) + 2 * at(index + 1) + at(index + 2)) / 9);
  const peak = Math.max(...smooth, 1);

  // Amplitud un punto por debajo de la de antes: al suavizar más, la cima baja y el velo ganaba aire de sobra.
  const top = smooth.map((value, index) => ({ x: ((index + 0.5) / BINS) * 100, y: 50 - (value / peak) * 36 }));
  const bottom = [...top].reverse().map((point) => ({ x: point.x, y: 100 - point.y }));
  const curve = (points: Array<{ x: number; y: number }>, first: boolean) => {
    let d = `${first ? 'M' : 'L'} ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i += 1) {
      const mid = { x: (points[i - 1].x + points[i].x) / 2, y: (points[i - 1].y + points[i].y) / 2 };
      d += ` Q ${points[i - 1].x.toFixed(1)} ${points[i - 1].y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
    }
    return `${d} L ${points[points.length - 1].x.toFixed(1)} ${points[points.length - 1].y.toFixed(1)}`;
  };

  return `${curve(top, true)} ${curve(bottom, false)} Z`;
}

/** Mediana de las notas: la nota que parte tu biblioteca en dos mitades iguales. */
function median(games: GameRef[]): number {
  const sorted = games.map((game) => game.grade).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Enjambre de puntos: UN PUNTO POR JUEGO colocado en el eje de la nota. Frente a las cinco columnas de un
 * histograma, enseña dónde se agolpan de verdad las notas, qué huecos hay y qué juegos se salen del grupo —y
 * en un año de treinta o cuarenta juegos, que es el tamaño típico, cada punto sigue siendo distinguible.
 *
 * Los puntos son HTML y no SVG: al ir posicionados en porcentajes sobre un lienzo que se estira, dentro de un
 * SVG se deformarían en óvalos.
 */
export const Beeswarm = memo(function Beeswarm({ games, scale }: BeeswarmProps) {
  const L = useStatsLabels().grades;
  const focus = useChartFocus();
  // Qué listas entran. Se guarda la lista OCULTA y no la visible: así "ninguna oculta" es el estado inicial y
  // el gráfico nunca puede quedarse sin puntos, que es la regla del filtro.
  const [hiddenList, setHiddenList] = useState<TabId | null>(null);
  if (games.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const completed = games.filter((game) => game.list === 'c');
  const abandoned = games.filter((game) => game.list === 'v');
  // El filtro solo se ofrece si hay notas en las dos listas: con una sola, los botones no podrían hacer nada.
  const canFilter = completed.length > 0 && abandoned.length > 0;
  const hidden = canFilter ? hiddenList : null;
  const shown = hidden === 'c' ? abandoned : hidden === 'v' ? completed : games;

  const dots = swarm(shown);
  const spread = Math.max(...dots.map((dot) => Math.abs(dot.lane)), 1);
  // Los carriles se comprimen si el enjambre es alto, para no salirse del lienzo.
  const lane = Math.min(LANE, 42 / spread);
  const marks = scale === 'grade' ? [0, 25, 50, 75, 100] : [20, 40, 60, 80, 100];
  // Reparto por tramo para la tabla alternativa (el mismo esquema de estrellas que el resto de la app).
  const bands = Array.from({ length: STARS_MAX }, (_unused, index) => {
    const stars = index + 1;
    return {
      stars,
      floor: SCORE_BUCKET_FLOORS[stars],
      ceiling: stars === STARS_MAX ? GRADE_MAX : SCORE_BUCKET_FLOORS[stars + 1] - 1,
      count: shown.filter((game) => starsFromGrade(game.grade) === stars).length,
    };
  });
  const mid = median(shown);
  // Los dos extremos se rotulan con su nombre. Es la única etiqueta directa del gráfico: poner el nombre en
  // cada punto sería ilegible, y son justo los dos que se buscan al mirar una distribución.
  const best = dots[dots.length - 1];
  const worst = dots[0];
  const shownDot = dots.find((dot) => String(dot.game.id) === focus.active) || null;
  const labelled = shown.length > 2 ? [
    { dot: worst, side: 'start' as const },
    { dot: best, side: 'end' as const },
  ] : [];

  /**
   * Un botón por lista. El que está solo NO se puede apagar —queda deshabilitado— porque un reparto de notas
   * sin notas no dice nada; es la misma idea que las pestañas de año, que solo ofrecen años con contenido.
   */
  const listButton = (list: TabId, label: string, count: number) => {
    const on = hidden !== list;
    return (
      <button
        type="button"
        className={`btn btn-toggle${on ? ' active' : ''}`}
        aria-pressed={on}
        // Solo queda esta encendida: apagarla dejaría el gráfico vacío.
        disabled={on && hidden !== null}
        title={on && hidden !== null ? L.lists.onlyOne : undefined}
        onClick={() => setHiddenList(on ? list : null)}
      >
        <span>{label}</span>
        <span className="beeswarm-list-count">{count}</span>
      </button>
    );
  };

  return (
    <div className="beeswarm">
      {canFilter ? (
        <div className="beeswarm-lists" role="group" aria-label={L.lists.aria}>
          {listButton('c', L.lists.completed, completed.length)}
          {listButton('v', L.lists.abandoned, abandoned.length)}
        </div>
      ) : null}

      <div className={`beeswarm-canvas${shown.length >= DENSE_FROM ? ' is-dense' : ''}${shown.length <= SPARSE_UP_TO ? ' is-sparse' : ''}`}>
        {marks.map((mark) => (
          <span key={mark} className="beeswarm-guide" style={{ left: `${mark}%` } as CSSProperties} />
        ))}

        {/* La silueta va detrás de los puntos: con la biblioteca entera, el enjambre se satura y es lo único
            que sigue diciendo dónde está el grueso. */}
        <svg className="beeswarm-density" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={densityPath(shown)} />
        </svg>

        {/* Una sola referencia, la MEDIANA: la nota que parte la biblioteca en dos mitades. La media iba con
            otra guía a un palmo de esta y, salvo distribuciones muy sesgadas, las dos líneas caían casi
            encima —dos trazos verticales que había que distinguir para leer lo mismo—. La media sigue a la
            vista en su tarjeta de cifras. */}
        <span className="beeswarm-median" style={{ left: `${mid}%` } as CSSProperties}>
          {/* El valor va CON el rótulo: una línea vertical sin cifra obliga a estimarla contra el eje, y el
              dato ya está calculado. Se dice en la escala de la cuenta, como el resto del panel. */}
          <b>{L.median(scale === 'grade' ? String(Math.round(mid)) : '★'.repeat(starsFromGrade(mid)))}</b>
        </span>

        {labelled.map(({ dot, side }) => (
          <span
            key={`tag-${dot.game.id}`}
            className={`beeswarm-tag is-${side}`}
            style={{ left: `${dot.x}%`, top: `calc(50% + ${dot.lane * lane}%)` } as CSSProperties}
          >
            {dot.game.name}
          </span>
        ))}

        {/* Los puntos se señalan con el puntero pero NO entran en el recorrido del teclado: aquí hay uno por
            juego —cientos en una biblioteca de verdad—, y meterlos en el tabulador convertiría la figura en una
            trampa. Su dato tiene la salida que le corresponde: la tabla por tramos de más abajo. */}
        {dots.map((dot, index) => (
          <span
            key={dot.game.id}
            className={`beeswarm-dot${focus.stateOf(String(dot.game.id))}`}
            title={`${dot.game.name}: ${Math.round(dot.game.grade)}`}
            style={{
              left: `${dot.x}%`,
              top: `calc(50% + ${dot.lane * lane}%)`,
              '--dot-hue': String(hueFromGrade(dot.game.grade)),
              '--i': index % 40,
            } as CSSProperties}
            {...focus.hoverProps(String(dot.game.id))}
          />
        ))}
      </div>

      {/* Qué juego es cada punto. El `title` del sistema lo decía, pero tarda un segundo en salir y en una
          pantalla táctil no existe; y con el enjambre saturado, acertar dos veces el mismo punto para volver a
          leerlo es imposible. */}
      <ChartDetail>
        {shownDot ? (
          <>
            <b>{shownDot.game.name}</b>
            <span>{scale === 'grade' ? Math.round(shownDot.game.grade) : `${'★'.repeat(starsFromGrade(shownDot.game.grade))}`}</span>
          </>
        ) : (
          <ChartDetailHint>{L.countLabel(shown.length)}</ChartDetailHint>
        )}
      </ChartDetail>

      <div className="beeswarm-axis" aria-hidden="true">
        {marks.map((mark) => (
          <span key={mark} style={{ left: `${mark}%` } as CSSProperties}>
            {scale === 'grade' ? mark : '★'.repeat(starsFromGrade(mark))}
          </span>
        ))}
      </div>

      {/* Alternativa textual: el reparto por tramo, que es lo que el enjambre enseña de un vistazo. Sin ella,
          el dato exacto de cada punto solo estaría en su `title`, y un tooltip nunca puede ser la única vía. */}
      <div className="sr-only">
        <table>
          <caption>{L.chartAria}</caption>
          <thead>
            <tr>
              <th scope="col">{L.bandColumn}</th>
              <th scope="col">{L.countColumn}</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={band.stars}>
                <th scope="row">{scale === 'grade' ? L.gradeLabel(band.floor, band.ceiling) : L.starsLabel(band.stars)}</th>
                <td>{band.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
