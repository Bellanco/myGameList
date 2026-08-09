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

  return (
    <div className="beeswarm">
      <div className={`beeswarm-canvas${games.length >= DENSE_FROM ? ' is-dense' : ''}${games.length <= SPARSE_UP_TO ? ' is-sparse' : ''}`}>
        {marks.map((mark) => (
          <span key={mark} className="beeswarm-guide" style={{ left: `${mark}%` } as CSSProperties} />
        ))}
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

      <p className="stats-note">{L.swarmHint(games.length)}</p>
    </div>
  );
});
