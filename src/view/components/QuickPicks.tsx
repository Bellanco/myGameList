import { memo, useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { FORM_UI } from '../../core/constants/formLabels';

/**
 * SUGERENCIAS DE UN TOQUE bajo un campo de etiquetas: lo que el usuario más usa, en UNA línea (lo que no cabe se
 * desplaza en horizontal). Solo salen las que aún no están puestas, así que al tocar una «salta» al campo.
 *
 * Como el botón tocado desaparece, el foco se iría al `body` —y con él el Tab y ⌘↵—: pasa al botón que ocupa su
 * sitio, o al campo si ya no queda ninguno. Si la fila estaba filtrada por lo escrito (`returnToField`), vuelve
 * siempre al campo: lo escrito se vacía al elegir y lo natural es seguir tecleando la siguiente.
 *
 * FUERA DEL ORDEN DEL TABULADOR: Tab salta de campo a campo, no por cada sugerencia. Se llega a ellas con ↓ desde
 * el campo; dentro, ← → las recorren y ↑ vuelve al campo. La fila lleva también `tabIndex={-1}`: es un contenedor
 * con desplazamiento y, sin nada enfocable dentro, Chrome lo mete él mismo en el tabulador (una parada en blanco).
 *
 * `glow` ilumina cada sugerencia según lo cerca que esté lo escrito de su nombre (de 0 a 1, en `--pick-glow`).
 */
export const QuickPicks = memo(function QuickPicks({
  options,
  taken,
  label,
  fieldId,
  returnToField = false,
  glow,
  onPick,
}: {
  options: ReadonlyArray<string | number>;
  /** Lo ya puesto (se compara sin distinguir mayúsculas). */
  taken: ReadonlyArray<string | number>;
  /** Nombre del grupo para el lector de pantalla. */
  label: string;
  /** El campo al que vuelve el foco cuando no quedan sugerencias. */
  fieldId: string;
  /** Al elegir, el foco vuelve al campo en vez de pasar a la sugerencia siguiente. */
  returnToField?: boolean;
  /** Brillo de cada sugerencia, de 0 (apagada, como siempre) a 1 (lo escrito es justo esa). */
  glow?: (value: string) => number;
  onPick: (value: string) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const takenKeys = new Set(taken.map((value) => String(value).toLocaleLowerCase()));
  const free = options.filter((option) => !takenKeys.has(String(option).toLocaleLowerCase()));
  const hasPicks = free.length > 0;

  // ↓ en el campo entra en la fila (y el lector lo anuncia). El campo es de otro componente (`TagInput`): por su id.
  useEffect(() => {
    const field = hasPicks ? document.getElementById(fieldId) : null;
    if (!field) return undefined;
    const onFieldKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'ArrowDown' || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const first = groupRef.current?.querySelector<HTMLButtonElement>('.quick-pick');
      if (!first) return;
      event.preventDefault();
      first.focus();
    };
    field.addEventListener('keydown', onFieldKeyDown);
    field.setAttribute('aria-keyshortcuts', 'ArrowDown');
    return () => {
      field.removeEventListener('keydown', onFieldKeyDown);
      field.removeAttribute('aria-keyshortcuts');
    };
  }, [fieldId, hasPicks]);

  if (!hasPicks) return null;

  const onGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('.quick-pick') ?? []);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const target =
      event.key === 'ArrowRight' ? buttons[Math.min(index + 1, buttons.length - 1)]
        : event.key === 'ArrowLeft' ? buttons[Math.max(index - 1, 0)]
          : event.key === 'Home' ? buttons[0]
            : event.key === 'End' ? buttons[buttons.length - 1]
              : event.key === 'ArrowUp' ? document.getElementById(fieldId)
                : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  const pick = (value: string, index: number) => {
    onPick(value);
    requestAnimationFrame(() => {
      const buttons = returnToField ? undefined : groupRef.current?.querySelectorAll<HTMLButtonElement>('.quick-pick');
      const next = buttons?.length ? buttons[Math.min(index, buttons.length - 1)] : undefined;
      (next ?? document.getElementById(fieldId))?.focus();
    });
  };

  return (
    <div className="quick-picks" role="group" aria-label={label} ref={groupRef} tabIndex={-1}
      onKeyDown={onGroupKeyDown}>
      {free.map((option, index) => (
        <button
          key={option}
          type="button"
          tabIndex={-1}
          className={glow ? 'quick-pick is-matching' : 'quick-pick'}
          style={glow ? ({ '--pick-glow': glow(String(option)).toFixed(2) } as CSSProperties) : undefined}
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
