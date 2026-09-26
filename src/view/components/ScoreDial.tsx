import { memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { GRADE_MAX, clampGrade, hueFromGrade } from '../../core/utils/scoreScale';
import { SCORE_UI } from '../../core/constants/scoreLabels';

/**
 * Punto del canto exterior del dial donde cae la manecilla, en fracciones del lado (0–1). `corner` es el radio
 * de la esquina partido por el lado: 0,5 es el círculo de serie; menos, un cuadrado redondeado (Portal). El
 * relleno es un `conic-gradient`, que avanza por ÁNGULO, así que la manecilla va donde el rayo de ese ángulo
 * corta el canto: en un lado recto, a la distancia del lado; en una esquina, sobre el arco de la curva.
 */
function knobPoint(angle: number, corner: number): { x: number; y: number } {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  if (corner >= 0.5) return { x: 0.5 + 0.5 * dx, y: 0.5 + 0.5 * dy };
  const straight = 0.5 - corner; // media longitud del tramo recto de cada lado
  const t = 0.5 / Math.max(Math.abs(dx), Math.abs(dy));
  let x = dx * t;
  let y = dy * t;
  if (Math.abs(x) > straight && Math.abs(y) > straight) {
    // Esquina: corte del rayo con el arco (centro a `straight` en cada eje, radio `corner`); la raíz lejana.
    const cx = Math.sign(dx) * straight;
    const cy = Math.sign(dy) * straight;
    const dot = dx * cx + dy * cy;
    const tc = dot + Math.sqrt(dot * dot - (cx * cx + cy * cy) + corner * corner);
    x = dx * tc;
    y = dy * tc;
  }
  return { x: 0.5 + x, y: 0.5 + y };
}

/**
 * Selector de nota (0–100) como aro: arrastra sobre el círculo (o teclado) y se rellena hasta la nota elegida,
 * de rojo a verde. Accesible: `role="slider"` con `aria-valuenow`. Sustituye al `StarPicker` cuando la escala es
 * 'grade'. El número va centrado; el borde es fino y la manecilla blanca (lo que se agarra) mayor que el borde.
 */
export const ScoreDial = memo(function ScoreDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (grade: number) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const current = Math.round(clampGrade(value));
  // La forma la pone el tema (Portal lo cuadra: radio proporcional al lado): se lee del CSS al montar para que la manecilla
  // siga el canto. Sin medida (jsdom, o `50%`) se queda en el círculo de serie.
  const [corner, setCorner] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.offsetWidth <= 0) return;
    const raw = getComputedStyle(el).borderTopLeftRadius;
    const radius = raw.endsWith('%') ? (parseFloat(raw) / 100) * el.offsetWidth : parseFloat(raw);
    if (Number.isFinite(radius)) setCorner(Math.min(radius / el.offsetWidth, 0.5));
  }, []);

  // Ángulo (rad) desde arriba en sentido horario a partir del punto del puntero, mapeado a 0–100.
  const gradeFromPoint = useCallback((clientX: number, clientY: number): number => {
    const el = ref.current;
    if (!el) return current;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    let a = Math.atan2(dx, -dy); // 0 arriba, horario
    if (a < 0) a += 2 * Math.PI;
    let next = Math.round((a / (2 * Math.PI)) * GRADE_MAX);
    // Guarda anti-salto al cruzar el tope superior (99↔0): imanta al extremo más cercano al valor actual.
    if (Math.abs(next - current) > 55) next = current <= GRADE_MAX / 2 ? 0 : GRADE_MAX;
    return next;
  }, [current]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(gradeFromPoint(event.clientX, event.clientY));
  }, [gradeFromPoint, onChange]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(gradeFromPoint(event.clientX, event.clientY));
  }, [gradeFromPoint, onChange]);

  const stopDragging = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': delta = 1; break;
      case 'ArrowLeft': case 'ArrowDown': delta = -1; break;
      case 'PageUp': delta = 10; break;
      case 'PageDown': delta = -10; break;
      case 'Home': event.preventDefault(); onChange(0); return;
      case 'End': event.preventDefault(); onChange(GRADE_MAX); return;
      default: return;
    }
    event.preventDefault();
    onChange(clampGrade(current + delta));
  }, [current, onChange]);

  const knob = knobPoint((current / GRADE_MAX) * 2 * Math.PI, corner);
  const style = {
    '--score-pct': String(current),
    '--score-hue': String(hueFromGrade(current)),
    '--knob-left': `${100 * knob.x}%`,
    '--knob-top': `${100 * knob.y}%`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className="score-dial"
      style={style}
      role="slider"
      tabIndex={0}
      aria-label={SCORE_UI.dialAria}
      aria-valuemin={0}
      aria-valuemax={GRADE_MAX}
      aria-valuenow={current}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={handleKeyDown}
    >
      <span className="score-dial-knob" aria-hidden="true" />
      <span className="score-dial-num">{current}</span>
    </div>
  );
});
