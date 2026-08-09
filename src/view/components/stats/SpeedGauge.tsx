import { memo, useId, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { CountUp } from './CountUp';
import { formatCount, formatPercent } from './format';
import type { StatsSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.ratio;

const WIDTH = 280;
const HEIGHT = 212;
const CX = WIDTH / 2;
/** El eje va alto: lo que queda por debajo de las puntas del cuadrante es el hueco de la lectura digital. */
const CY = 118;
const R = 100;
/**
 * CUADRANTE DE COMPETICIÓN: el dial arranca abajo a la izquierda y barre 240° hasta abajo a la derecha, que es
 * la apertura de un tacómetro de coche. El hueco de 120° que queda abajo es donde va la lectura digital, así
 * que la aguja nunca la tapa por mucho que suba.
 */
const START = 240;
const SWEEP = 240;
/** Marca mayor cada 10 puntos y menor cada 5, con número cada 20: más números y el dial se emborrona. */
const MAJOR = 10;
const MINOR = 5;
const NUMBERED = 20;
/** A partir de aquí el dial entra en su tramo bueno, marcado como la zona roja de un cuentavueltas. */
const REDLINE = 80;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
}

function point(angleDeg: number, radius: number): string {
  const at = polar(angleDeg, radius);
  return `${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
}

/** Arco entre dos porcentajes del dial, al radio dado. */
function arc(fromPercent: number, toPercent: number, radius: number): string {
  const from = START + (fromPercent / 100) * SWEEP;
  const to = START + (toPercent / 100) * SWEEP;
  const large = to - from > 180 ? 1 : 0;
  return `M ${point(from, radius)} A ${radius} ${radius} 0 ${large} 1 ${point(to, radius)}`;
}

/**
 * Completados frente a abandonados, leído como un CUADRO DE MANDOS de coche: dial graduado, zona roja al final
 * y aguja que sube desde cero hasta tu porcentaje.
 *
 * Sustituye a la tarta de dos porciones, que no decía nada que no dijera ya la cifra: con dos categorías no hay
 * reparto que descubrir, hay una aguja que marca un valor sobre una escala. El dial añade justo lo que faltaba
 * —dónde cae ese número dentro de todo el recorrido posible— y da al bloque una figura que no se repite en
 * ninguna otra tarjeta del panel.
 *
 * Todo el color sale de los tokens del tema, así que el mismo cuadro se pinta en ámbar de terminal, en neón o
 * en tinta de cómic sin tocar una línea.
 */
export const SpeedGauge = memo(function SpeedGauge({ ratio }: { ratio: StatsSummary['completionRatio'] }) {
  const gradientId = useId();
  const { completed, abandoned } = ratio;

  if (completed + abandoned === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const percent = formatPercent(ratio.percent);
  const ticks: Array<{ at: number; major: boolean; numbered: boolean }> = [];
  for (let value = 0; value <= 100; value += MINOR) {
    ticks.push({ at: value, major: value % MAJOR === 0, numbered: value % NUMBERED === 0 });
  }

  return (
    <div className="gauge">
      <div className="gauge-fig">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={L.gaugeAria(percent, completed, abandoned)}
          style={{ '--deg': `${(percent / 100) * SWEEP}deg`, '--cx': `${CX}px`, '--cy': `${CY}px` } as CSSProperties}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" className="gauge-stop-from" />
              <stop offset="100%" className="gauge-stop-to" />
            </linearGradient>
          </defs>

          <path className="gauge-track" d={arc(0, 100, R)} />
          {/* La zona roja del cuentavueltas, que aquí marca el tramo al que se aspira. */}
          <path className="gauge-redline" d={arc(REDLINE, 100, R + 11)} />

          {ticks.map((tick) => {
            const deg = START + (tick.at / 100) * SWEEP;
            const inner = tick.major ? R - 20 : R - 14;
            const from = polar(deg, inner);
            const to = polar(deg, R - 9);
            return (
              <line
                key={tick.at}
                className={`gauge-tick${tick.major ? ' is-major' : ''}`}
                x1={from.x.toFixed(1)}
                y1={from.y.toFixed(1)}
                x2={to.x.toFixed(1)}
                y2={to.y.toFixed(1)}
              />
            );
          })}

          {ticks.filter((tick) => tick.numbered).map((tick) => {
            const at = polar(START + (tick.at / 100) * SWEEP, R - 34);
            return (
              <text key={tick.at} className="gauge-number" x={at.x.toFixed(1)} y={at.y.toFixed(1)} textAnchor="middle" dominantBaseline="central">
                {tick.at}
              </text>
            );
          })}

          {/* `pathLength` a 1: el trazo se mide en fracciones, y así el CSS puede descubrirlo sin saber cuánto
              mide realmente el arco. */}
          <path className="gauge-value" d={arc(0, Math.max(percent, 0.5), R)} pathLength={1} stroke={`url(#${gradientId})`} />

          {/* La aguja se dibuja en el cero y llega a su marca girando: el barrido de encendido de un salpicadero. */}
          <g className="gauge-needle">
            <polygon
              points={`${point(START, R - 26)}, ${point(START - 90, 4.5)}, ${point(START + 180, 16)}, ${point(START + 90, 4.5)}`}
            />
          </g>
          <circle className="gauge-cap" cx={CX} cy={CY} r="7" />
        </svg>

        <p className="gauge-read">
          <b><CountUp value={percent} />%</b>
          <span>{L.heroLabel}</span>
        </p>
      </div>

      {/* El barrido rojo del morro: puro guiño de salpicadero, decorativo y silenciado con menos movimiento. */}
      <span className="gauge-scan" aria-hidden="true" />

      <ul className="ratio-legend">
        <li>
          <span className="ratio-dot is-completed" aria-hidden="true" />
          <span className="ratio-legend-label">{L.completed}</span>
          <b>{formatCount(completed)}</b>
        </li>
        <li>
          <span className="ratio-dot is-abandoned" aria-hidden="true" />
          <span className="ratio-legend-label">{L.abandoned}</span>
          <b>{formatCount(abandoned)}</b>
        </li>
      </ul>
    </div>
  );
});
