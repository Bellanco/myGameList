import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { GRADE_MAX, hueFromGrade, starsFromGrade } from '../../../core/utils/scoreScale';
import { formatDecimal } from './format';
import type { GameRef } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.grades;

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
  /** Media de las notas (0–100), que se marca con una guía vertical. */
  average: number;
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
  const peak = Math.max(...bins, 1);
  // Media móvil de tres: suaviza el escalonado del histograma sin desplazar los máximos.
  const smooth = bins.map((value, index) => (value + (bins[index - 1] ?? value) + (bins[index + 1] ?? value)) / 3 / peak);

  const top = smooth.map((value, index) => ({ x: ((index + 0.5) / BINS) * 100, y: 50 - value * 38 }));
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
export const Beeswarm = memo(function Beeswarm({ games, scale, average }: BeeswarmProps) {
  if (games.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const dots = swarm(games);
  const spread = Math.max(...dots.map((dot) => Math.abs(dot.lane)), 1);
  // Los carriles se comprimen si el enjambre es alto, para no salirse del lienzo.
  const lane = Math.min(LANE, 42 / spread);
  const marks = scale === 'grade' ? [0, 25, 50, 75, 100] : [20, 40, 60, 80, 100];
  const mid = median(games);
  const best = games.reduce((top, game) => (game.grade > top.grade ? game : top), games[0]);

  return (
    <div className="beeswarm">
      <div className={`beeswarm-canvas${games.length >= DENSE_FROM ? ' is-dense' : ''}${games.length <= SPARSE_UP_TO ? ' is-sparse' : ''}`}>
        {marks.map((mark) => (
          <span key={mark} className="beeswarm-guide" style={{ left: `${mark}%` } as CSSProperties} />
        ))}

        {/* La silueta va detrás de los puntos: con la biblioteca entera, el enjambre se satura y es lo único
            que sigue diciendo dónde está el grueso. */}
        <svg className="beeswarm-density" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={densityPath(games)} />
        </svg>

        <span className="beeswarm-median" style={{ left: `${mid}%` } as CSSProperties}>
          <b>{L.median}</b>
        </span>
        <span className="beeswarm-average" style={{ left: `${average}%` } as CSSProperties}>
          <b>{scale === 'grade' ? Math.round(average) : formatDecimal(average / 20)}</b>
        </span>

        {dots.map((dot, index) => (
          <span
            key={dot.game.id}
            className="beeswarm-dot"
            title={`${dot.game.name}: ${Math.round(dot.game.grade)}`}
            style={{
              left: `${dot.x}%`,
              top: `calc(50% + ${dot.lane * lane}%)`,
              '--dot-hue': String(hueFromGrade(dot.game.grade)),
              '--i': index % 40,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="beeswarm-axis" aria-hidden="true">
        {marks.map((mark) => (
          <span key={mark} style={{ left: `${mark}%` } as CSSProperties}>
            {scale === 'grade' ? mark : '★'.repeat(starsFromGrade(mark))}
          </span>
        ))}
      </div>

      <p className="stats-note">{L.swarmHint(games.length, best.name)}</p>
    </div>
  );
});
