import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { splitTagInput, TAG_SEPARATOR } from '../../core/utils/tags';
import { capGrowth, capTag } from '../../core/utils/fieldLimits';
import { Icon } from './Icon';
import { useId, type KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  values: Array<string | number>;
  pendingValue: string;
  onPendingValueChange: (value: string) => void;
  /**
   * Commit de etiquetas. Recibe SIEMPRE una lista ya troceada por separadores y sin espacios sobrantes: escribir
   * "Acción, RPG" o pegar tres líneas entra por aquí en una sola llamada, y así el padre las añade en un único
   * cambio de estado (encadenar un `onAdd` por etiqueta perdía todas menos la última).
   */
  onAdd: (values: string[]) => void;
  onRemove: (value: string | number) => void;
  placeholder?: string;
  hint?: string;
  chipClassName: string;
  invalid?: boolean;
  warning?: boolean;
  required?: boolean;
  /** Texto de error del campo: sustituye al `hint` y marca el campo como inválido para un lector de pantalla. */
  errorMessage?: string;
  /** Id del `<input>` (para el `htmlFor` de la etiqueta y para poder enfocarlo desde el guardado). */
  inputId?: string;
  /**
   * Caracteres de cada etiqueta. No es un `maxLength` del `<input>`: ese recortaría también un pegado de VARIAS
   * etiquetas separadas por comas. Se aplica a cada trozo y a lo que queda escrito.
   */
  maxLength?: number;
  /** La lista ha llegado a su tope: el campo no admite más (se puede quitar alguna) y el `hint` dice por qué. */
  full?: boolean;
  /**
   * Solo cifras (los años): lo demás no llega al campo, ni tecleado ni pegado. Los separadores sí, para poder escribir
   * o pegar varios («2020, 2021»), y el móvil saca el teclado numérico.
   */
  digitsOnly?: boolean;
}

/** `true` si lo escrito termina en separador ("Acción, ") → no queda nada a medias que dejar en el campo. */
const ENDS_WITH_SEPARATOR = /[,;\t\r\n]\s*$/;

export function TagInput({
  label,
  values,
  pendingValue,
  onPendingValueChange,
  onAdd,
  onRemove,
  placeholder,
  hint,
  chipClassName,
  invalid = false,
  warning = false,
  required = false,
  errorMessage,
  inputId,
  maxLength,
  full = false,
  digitsOnly = false,
}: TagInputProps) {
  const generatedId = useId();
  const fieldId = inputId || `tag-input-${generatedId}`;
  const messageId = `${fieldId}-msg`;

  /** Trocea lo escrito y recorta cada etiqueta a su tope. */
  const split = (raw: string) => {
    const parts = splitTagInput(raw);
    return maxLength ? parts.map((part) => capTag(part, maxLength)) : parts;
  };

  /** Commit de lo que hay escrito (Enter, o el trozo cerrado por un separador). */
  const commitRaw = (raw: string) => {
    const parts = split(raw);
    onPendingValueChange('');
    if (parts.length) onAdd(parts);
  };

  return (
    <div className="fg">
      <label className={`flabel ${required ? 'is-required' : ''}`.trim()} htmlFor={fieldId}>
        {label}
      </label>
      <div className={`tag-inp-wrap ${invalid || errorMessage ? 'has-error' : ''} ${warning ? 'has-warning' : ''}`.trim()}>
        {values.map((value) => (
          <span key={`${label}-${String(value)}`} className={`chip ${chipClassName}`}>
            {String(value)}
            <button
              type="button"
              className="chip-rm"
              aria-label={UI_MESSAGES.table.removeTag(String(value))}
              title={UI_MESSAGES.table.removeTag(String(value))}
              onClick={() => onRemove(value)}
            >
              <Icon name={COMMON_ICONS.close} />
            </button>
          </span>
        ))}

        <input
          type="text"
          id={fieldId}
          className="finput"
          value={pendingValue}
          // Llena, no se escribe más; `readOnly` y no `disabled`, para que siga en el orden del tabulador y el lector
          // lea el aviso de por qué.
          readOnly={full}
          placeholder={full ? undefined : placeholder}
          enterKeyHint="done"
          inputMode={digitsOnly ? 'numeric' : undefined}
          autoComplete="off"
          aria-required={required || undefined}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage || hint ? messageId : undefined}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRaw(pendingValue);
            }
          }}
          onChange={(event) => {
            // Tras cerrar una etiqueta con un separador se suele teclear un espacio ("Acción, RPG"): no se
            // arrastra al principio de la siguiente.
            const typed = digitsOnly ? event.target.value.replace(/[^\d,;\s]/g, '') : event.target.value;
            const val = pendingValue === '' ? typed.replace(/^\s+/, '') : typed;
            // Comas, punto y coma, tabuladores y saltos de línea cierran etiqueta: escribir "Acción, RPG" crea
            // dos chips y pegar una lista entera las reparte. Lo escrito tras el último separador sigue en el
            // campo para poder terminarlo (salvo que el texto acabe justo en el separador).
            if (TAG_SEPARATOR.test(val)) {
              const parts = split(val);
              const tail = ENDS_WITH_SEPARATOR.test(val) ? '' : (parts.pop() ?? '');
              onPendingValueChange(tail);
              if (parts.length) onAdd(parts);
              return;
            }
            onPendingValueChange(maxLength ? capGrowth(val, pendingValue, maxLength) : val);
          }}
        />
      </div>
      {errorMessage ? (
        <small id={messageId} className="tag-hint is-error">{errorMessage}</small>
      ) : hint ? (
        <small id={messageId} className="tag-hint">{hint}</small>
      ) : null}
    </div>
  );
}
