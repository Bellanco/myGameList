import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { useChartFocus } from './useChartFocus';
import { CountUp } from './CountUp';
import { formatCount, formatPercent } from './format';
import type { StatsSummary } from '../../../core/stats/types';

const WIDTH = 280;
const HEIGHT = 212;
const CX = WIDTH / 2;
/** El eje va alto: lo que queda por debajo de las puntas del cuadrante es el hueco de la lectura. */
const CY = 118;
const R = 100;
/**
 * CUADRANTE DE COMPETICIÓN: el dial arranca abajo a la izquierda y barre 240° hasta abajo a la derecha, que es
 * la apertura de un tacómetro de coche. El hueco de 120° que queda abajo es donde va la cifra.
 */
const START = 240;
const SWEEP = 240;
/** Segmentos del dial. Cuarenta salen a dos puntos y medio cada uno: se cuentan con el dedo sin emborronarse. */
const SEGMENTS = 40;
/** Hueco entre segmentos, en grados. */
const SEG_GAP = 1.2;
/** Marca mayor cada 10 puntos y menor cada 5, con número cada 20. */
const MAJOR = 10;
const MINOR = 5;
const NUMBERED = 20;
/** A partir de aquí el dial entra en su tramo bueno, marcado como la zona roja de un cuentavueltas. */
const REDLINE = 80;

/** Contadores pequeños: mismo lenguaje de segmentos, en anillo completo. */
const SUB_SIZE = 78;
const SUB_R = 32;
const SUB_SEGMENTS = 20;
const SUB_GAP = 3;

function polar(cx: number, cy: number, angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function point(cx: number, cy: number, angleDeg: number, radius: number): string {
  const at = polar(cx, cy, angleDeg, radius);
  return `${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
}

function arc(cx: number, cy: number, fromDeg: number, toDeg: number, radius: number): string {
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${point(cx, cy, fromDeg, radius)} A ${radius} ${radius} 0 ${large} 1 ${point(cx, cy, toDeg, radius)}`;
}

/** Anillo segmentado: devuelve un tramo por segmento, sabiendo cuáles quedan encendidos. */
function segments(
  count: number,
  lit: number,
  geometry: { cx: number; cy: number; start: number; sweep: number; radius: number; gap: number },
): Array<{ d: string; on: boolean; index: number }> {
  const { cx, cy, start, sweep, radius, gap } = geometry;
  return Array.from({ length: count }, (_unused, index) => {
    const from = start + (index / count) * sweep + gap / 2;
    const to = start + ((index + 1) / count) * sweep - gap / 2;
    return { d: arc(cx, cy, from, to, radius), on: index < lit, index };
  });
}

/**
 * Completados frente a abandonados, leído como un CUADRO DE MANDOS: un dial de segmentos que se encienden hasta
 * tu marca y dos contadores pequeños, del mismo material, para las dos cuentas que lo forman.
 *
 * Sustituye a la tarta de dos porciones, que no decía nada que no dijera ya la cifra: con dos categorías no hay
 * reparto que descubrir, hay un valor sobre una escala. Los segmentos añaden lo que un arco liso no da —se
 * cuentan— y los últimos ocho marcan el tramo al que se aspira, encendidos o no.
 *
 * Todo el color sale de los tokens del tema, así que el mismo cuadro se pinta en ámbar de terminal, en neón o
 * en tinta de cómic sin tocar una línea.
 *
 * SE PUEDE TOCAR: los dos contadores son botones. Al señalar uno, su anillo se ilumina, el otro se aparta y su
 * cifra se acompaña del PORCENTAJE que representa —«24 · 67%»—, que es el puente entre los contadores y el dial
 * grande: hasta ahora había que dividir a mano para saber de dónde salía esa cifra.
 */
export const SpeedGauge = memo(function SpeedGauge({ ratio }: { ratio: StatsSummary['completionRatio'] }) {
  const L = useStatsLabels().ratio;
  const focus = useChartFocus();
  const { completed, abandoned } = ratio;
  const total = completed + abandoned;

  if (total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const percent = formatPercent(ratio.percent);
  const lit = Math.round((percent / 100) * SEGMENTS);
  const bars = segments(SEGMENTS, lit, { cx: CX, cy: CY, start: START, sweep: SWEEP, radius: R, gap: SEG_GAP });

  const ticks: Array<{ at: number; major: boolean; numbered: boolean }> = [];
  for (let value = 0; value <= 100; value += MINOR) {
    ticks.push({ at: value, major: value % MAJOR === 0, numbered: value % NUMBERED === 0 });
  }

  const counters = [
    { key: 'c', value: completed, label: L.completed },
    { key: 'v', value: abandoned, label: L.abandoned },
  ];

  return (
    <div className="gauge">
      <div className="gauge-fig">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={L.gaugeAria(percent, completed, abandoned)}
          style={{ '--n': SEGMENTS } as CSSProperties}
        >
          {bars.map((bar) => (
            <path
              key={bar.index}
              className={`gauge-seg${bar.on ? ' is-on' : ''}${(bar.index / SEGMENTS) * 100 >= REDLINE ? ' is-red' : ''}`}
              d={bar.d}
              style={{ '--i': bar.index } as CSSProperties}
            />
          ))}

          {ticks.map((tick) => {
            const deg = START + (tick.at / 100) * SWEEP;
            const from = polar(CX, CY, deg, tick.major ? R - 26 : R - 20);
            const to = polar(CX, CY, deg, R - 15);
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
            const at = polar(CX, CY, START + (tick.at / 100) * SWEEP, R - 40);
            return (
              <text
                key={tick.at}
                className="gauge-number"
                x={at.x.toFixed(1)}
                y={at.y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {tick.at}
              </text>
            );
          })}
          {/* La cifra vive DENTRO del instrumento, en el hueco que deja el cuadrante, como la lectura de un
              cuentakilómetros: es parte del dial, no un rótulo pegado debajo. */}
          <text className="gauge-hero" x={CX} y={HEIGHT - 10} textAnchor="middle">
            <CountUp value={percent} />
            <tspan className="gauge-hero-unit">%</tspan>
          </text>
        </svg>
      </div>

      {/* Los dos contadores que forman la cifra grande, con el mismo material que el dial. */}
      <ul className="gauge-subs">
        {counters.map((counter) => {
          const share = counter.value / total;
          const subLit = Math.max(Math.round(share * SUB_SEGMENTS), 1);
          const half = SUB_SIZE / 2;
          const share100 = formatPercent((counter.value / total) * 100);
          return (
            <li key={counter.key} className={`is-${counter.key}${focus.stateOf(counter.key)}`}>
              <button
                type="button"
                className="gauge-sub"
                {...focus.buttonProps(counter.key)}
              >
              <span className="gauge-sub-fig">
                <svg viewBox={`0 0 ${SUB_SIZE} ${SUB_SIZE}`} aria-hidden="true" style={{ '--n': SUB_SEGMENTS } as CSSProperties}>
                  {segments(SUB_SEGMENTS, subLit, { cx: half, cy: half, start: 0, sweep: 360, radius: SUB_R, gap: SUB_GAP })
                    .map((bar) => (
                      <path
                        key={bar.index}
                        className={`gauge-sub-seg${bar.on ? ' is-on' : ''}`}
                        d={bar.d}
                        style={{ '--i': bar.index } as CSSProperties}
                      />
                    ))}
                  <text className="gauge-sub-num" x={half} y={half} textAnchor="middle" dominantBaseline="central">
                    {formatCount(counter.value)}
                  </text>
                </svg>
              </span>
              <span className="gauge-sub-label">{counter.label}</span>
              {/* El porcentaje solo aparece en el contador señalado: en reposo, las dos cifras y el dial ya
                  cuentan la historia, y tres números por contador sería un panel de instrumentos de más. */}
              <span className="gauge-sub-share">{focus.active === counter.key ? `${share100}%` : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
