import { memo, useRef } from 'react';
import { FORM_UI } from '../../core/constants/formLabels';

/**
 * SUGERENCIAS DE UN TOQUE bajo un campo de etiquetas: lo que el usuario más usa, en UNA línea (lo que no cabe se
 * desplaza en horizontal). Solo salen las que aún no están puestas, así que al tocar una «salta» al campo.
 *
 * Como el botón tocado desaparece, el foco se iría al `body` —y con él el Tab y ⌘↵—: pasa al botón que ocupa su
 * sitio, o al campo si ya no queda ninguno.
 */
export const QuickPicks = memo(function QuickPicks({
  options,
  taken,
  label,
  fieldId,
  onPick,
}: {
  options: ReadonlyArray<string | number>;
  /** Lo ya puesto (se compara sin distinguir mayúsculas). */
  taken: ReadonlyArray<string | number>;
  /** Nombre del grupo para el lector de pantalla. */
  label: string;
  /** El campo al que vuelve el foco cuando no quedan sugerencias. */
  fieldId: string;
  onPick: (value: string) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const takenKeys = new Set(taken.map((value) => String(value).toLocaleLowerCase()));
  const free = options.filter((option) => !takenKeys.has(String(option).toLocaleLowerCase()));
  if (!free.length) return null;

  const pick = (value: string, index: number) => {
    onPick(value);
    requestAnimationFrame(() => {
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('.quick-pick');
      const next = buttons?.length ? buttons[Math.min(index, buttons.length - 1)] : undefined;
      (next ?? document.getElementById(fieldId))?.focus();
    });
  };

  return (
    <div className="quick-picks" role="group" aria-label={label} ref={groupRef}>
      {free.map((option, index) => (
        <button
          key={option}
          type="button"
          className="quick-pick"
          aria-label={FORM_UI.quickPicks.add(option)}
          onClick={() => pick(String(option), index)}
        >
          <span aria-hidden="true">+</span>
          {option}
        </button>
      ))}
    </div>
  );
});
