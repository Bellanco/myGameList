import { memo, useCallback, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { GRADE_MAX, clampGrade, hueFromGrade } from '../../core/utils/scoreScale';

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

  const angle = (current / GRADE_MAX) * 2 * Math.PI;
  const style = {
    '--score-pct': String(current),
    '--score-hue': String(hueFromGrade(current)),
    '--knob-left': `${50 + 50 * Math.sin(angle)}%`,
    '--knob-top': `${50 - 50 * Math.cos(angle)}%`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className="score-dial"
      style={style}
      role="slider"
      tabIndex={0}
      aria-label="Nota del juego (0 a 100)"
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
