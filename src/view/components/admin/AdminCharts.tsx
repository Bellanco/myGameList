// Las piezas de dibujo del panel: minigráfica, línea por días, barras, medidor y diferencia. SVG a mano y sin
// librería: son cuatro formas, y el panel es un chunk que abre una persona —no merece cargar una de gráficas—.
// El color sale de los tokens del tema (`--steam`, los tres de estado), así que cada tema las viste solo.
import { memo } from 'react';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';

const C = ADMIN_SHELL_UI.charts;
const NUMBER = new Intl.NumberFormat('es-ES');

/** La serie como trazo: los huecos (`null`) cortan la línea en vez de unir con una recta lo que no se sabe. */
function pathOf(values: ReadonlyArray<number | null>, x: (index: number) => number, y: (value: number) => number): string {
  let path = '';
  let pen = false;
  values.forEach((value, index) => {
    if (value === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    pen = true;
  });
  return path;
}

/** Minigráfica sin ejes, para el pie de una cifra. */
export const Sparkline = memo(function Sparkline({ values }: { values: ReadonlyArray<number | null> }) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known, 1);
  const x = (index: number) => (index / (values.length - 1)) * 100;
  const y = (value: number) => 30 - (value / max) * 28;
  return (
    <svg className="adm-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path className="line" d={pathOf(values, x, y)} />
    </svg>
  );
});

/** Línea por días con su media móvil. `labels` son las marcas del eje horizontal (índice → texto). */
export const DayLineChart = memo(function DayLineChart({
  values,
  average,
  labels,
  ariaLabel,
}: {
  values: ReadonlyArray<number | null>;
  average?: ReadonlyArray<number | null>;
  labels: ReadonlyArray<{ index: number; text: string }>;
  ariaLabel: string;
}) {
  const W = 1000, H = 220, PAD = 30;
  const known = values.filter((value): value is number => value !== null);
  const max = Math.max(5, Math.ceil(Math.max(0, ...known) / 5) * 5);
  const x = (index: number) => PAD + (index / Math.max(1, values.length - 1)) * (W - PAD - 8);
  const y = (value: number) => H - 22 - (value / max) * (H - 36);
  return (
    <svg className="adm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {[0, max / 2, max].map((tick) => (
        <g key={tick}>
          <line className="grid" x1={PAD} x2={W - 8} y1={y(tick)} y2={y(tick)} />
          <text className="axis" x={PAD - 6} y={y(tick) + 4} textAnchor="end">{NUMBER.format(tick)}</text>
        </g>
      ))}
      {labels.map(({ index, text }) => (
        <text key={index} className="axis" x={x(index)} y={H - 4} textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}>
          {text}
        </text>
      ))}
      {average ? <path className="line is-avg" d={pathOf(average, x, y)} /> : null}
      <path className="line" d={pathOf(values, x, y)} />
      {/* Un punto suelto (sin vecinos) no se vería como trazo: se marca con un círculo. */}
      {values.map((value, index) =>
        value !== null && (values[index - 1] ?? null) === null && (values[index + 1] ?? null) === null ? (
          <circle key={index} className="dot" cx={x(index)} cy={y(value)} r={3.5} />
        ) : null,
      )}
    </svg>
  );
});

/** Barras con su cifra encima. `highlight` pinta una en ámbar (p. ej. «0 amigos»). */
export const BarChart = memo(function BarChart({
  values,
  labels,
  ariaLabel,
  highlight,
  ceiling,
}: {
  values: readonly number[];
  labels: readonly string[];
  ariaLabel: string;
  highlight?: number;
  /** Un techo que dibujar como línea discontinua (p. ej. el cupo de carátulas). */
  ceiling?: number;
}) {
  const W = 640, H = 180, PAD = 8;
  const max = Math.max(1, ...values, ceiling || 0) * 1.1;
  const width = (W - PAD * 2) / Math.max(1, values.length);
  const y = (value: number) => H - 20 - (value / max) * (H - 36);
  return (
    <svg className="adm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <line className="grid" x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} />
      {values.map((value, index) => (
        <g key={labels[index] || index}>
          <rect
            className={`bar${highlight === index ? ' is-warn' : ''}`}
            x={PAD + index * width + width * 0.18}
            y={y(value)}
            width={width * 0.64}
            height={Math.max(1, y(0) - y(value))}
            rx={3}
          >
            <title>{`${labels[index]}: ${NUMBER.format(value)}`}</title>
          </rect>
          <text className="axis" x={PAD + index * width + width / 2} y={H - 4} textAnchor="middle">{labels[index]}</text>
          <text className="axis value" x={PAD + index * width + width / 2} y={y(value) - 5} textAnchor="middle">{NUMBER.format(value)}</text>
        </g>
      ))}
      {ceiling ? (
        <g>
          <line className="grid is-ceiling" x1={PAD} x2={W - PAD} y1={y(ceiling)} y2={y(ceiling)} />
          <text className="axis" x={W - PAD} y={y(ceiling) - 5} textAnchor="end">{C.ceiling(NUMBER.format(ceiling))}</text>
        </g>
      ) : null}
    </svg>
  );
});

/** Lo usado frente a un techo, con el estado (verde, ámbar, rojo) y una marca al 80 %. */
export const Meter = memo(function Meter({
  label,
  used,
  limit,
  foot,
}: {
  label: string;
  used: number;
  limit: number;
  foot?: string;
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const state = ratio >= 0.9 ? 'is-bad' : ratio >= 0.7 ? 'is-warn' : 'is-ok';
  return (
    <li className={`adm-meter ${state}`}>
      <div className="adm-meter-top">
        <b>{label}</b>
        <span>{C.meter(NUMBER.format(used), NUMBER.format(limit), Math.round(ratio * 100))}</span>
      </div>
      <div className="adm-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <span className="adm-meter-fill" style={{ width: `${ratio * 100}%` }} />
        <span className="adm-meter-mark" />
      </div>
      {foot ? <div className="adm-meter-foot">{foot}</div> : null}
    </li>
  );
});

/** La diferencia con la foto anterior. Sin foto con la que comparar no se pinta nada. */
export const Delta = memo(function Delta({
  value,
  against,
  lowerIsBetter = false,
}: {
  value: number | null;
  against: string;
  /** Para lo que conviene que baje (señales, gente sin amigos): bajar se pinta en verde. */
  lowerIsBetter?: boolean;
}) {
  if (value === null) return null;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const tone = value === 0 ? 'is-flat' : good ? 'is-up' : 'is-down';
  return (
    <span className={`adm-delta ${tone}`}>
      <span aria-hidden="true">{value > 0 ? '▲ ' : value < 0 ? '▼ ' : '= '}</span>
      {value === 0 ? C.same : NUMBER.format(Math.abs(value))}
      <em> {against}</em>
    </span>
  );
});

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}
