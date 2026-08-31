import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { splitTagInput, TAG_SEPARATOR } from '../../core/utils/tags';
import { Icon } from './Icon';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

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
  listId?: string;
  options?: string[]; // Propiedad recomendada para escalabilidad
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
}

// Se extrae la detección del agente para ejecutarla solo una vez en la carga del script
const IS_FIREFOX_MOBILE = typeof navigator !== 'undefined'
  && /Firefox\//.test(navigator.userAgent)
  && (
    /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)
    || navigator.maxTouchPoints > 1
    || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  );

/** `true` si lo escrito termina en separador ("Acción, ") → no queda nada a medias que dejar en el campo. */
const ENDS_WITH_SEPARATOR = /[,;\t\r\n]\s*$/;

export function TagInput({
  label,
  values,
  pendingValue,
  onPendingValueChange,
  onAdd,
  onRemove,
  listId,
  options: externalOptions,
  placeholder,
  hint,
  chipClassName,
  invalid = false,
  warning = false,
  required = false,
  errorMessage,
  inputId,
}: TagInputProps) {
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generatedId = useId();
  const fieldId = inputId || `tag-input-${generatedId}`;
  const messageId = `${fieldId}-msg`;

  // Sincronizar opciones internas priorizando la prop directa sobre el DOM scraping
  useEffect(() => {
    if (externalOptions) {
      setLocalOptions(externalOptions);
      return;
    }
    if (!listId) return setLocalOptions([]);

    const el = document.getElementById(listId) as HTMLDataListElement | null;
    if (!el) return setLocalOptions([]);

    const opts = Array.from(el.querySelectorAll('option')).map((o) => o.value);
    setLocalOptions(opts);
  }, [listId, externalOptions]);

  // Se corrige la lógica del filtro
  const updateFilter = useMemo(() => (val: string) => {
    if (!IS_FIREFOX_MOBILE || !localOptions.length) return setShowSuggestions(false);

    const lower = val.toLowerCase().trim();
    const matched = !lower
      ? localOptions.slice(0, 8)
      : localOptions.filter((o) => o.toLowerCase().includes(lower)).slice(0, 8);

    setFiltered(matched);
    setActiveIndex(-1); // Cambiado a -1 para evitar falsas selecciones automáticas al pulsar Enter
    setShowSuggestions(matched.length > 0);
  }, [localOptions]);

  /** Commit de lo que hay escrito (Enter, o el trozo cerrado por un separador). */
  const commitRaw = (raw: string) => {
    const parts = splitTagInput(raw);
    onPendingValueChange('');
    setShowSuggestions(false);
    setActiveIndex(-1);
    if (parts.length) onAdd(parts);
  };

  const handleSelectSuggestion = (value: string) => {
    onPendingValueChange('');
    onAdd([value]); // Pasamos el valor directamente eliminando el setTimeout peligroso
    setShowSuggestions(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const suggestionListId = `${(listId || label.replace(/\s+/g, '-').toLowerCase())}-suggestions`;

  return (
    <div className="fg">
      <label className="flabel" htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
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

        <div style={{ position: 'relative', display: 'inline-block', flexGrow: 1 }}>
          <input
            type="text"
            id={fieldId}
            className="finput"
            list={IS_FIREFOX_MOBILE ? undefined : listId}
            value={pendingValue}
            placeholder={placeholder}
            enterKeyHint="done"
            autoComplete="off"
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage || hint ? messageId : undefined}
            ref={inputRef}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              const key = event.key;

              if (IS_FIREFOX_MOBILE && showSuggestions) {
                if (key === 'ArrowDown' || key === 'ArrowUp') {
                  event.preventDefault();
                  if (!filtered.length) return;
                  setActiveIndex((prev) => {
                    if (key === 'ArrowDown') return prev < filtered.length - 1 ? prev + 1 : 0;
                    return prev > 0 ? prev - 1 : filtered.length - 1;
                  });
                  return;
                }

                if (key === 'Escape') {
                  setShowSuggestions(false);
                  setActiveIndex(-1);
                  return;
                }
              }

              if (key === 'Enter') {
                event.preventDefault();
                if (IS_FIREFOX_MOBILE && showSuggestions && activeIndex >= 0 && filtered[activeIndex]) {
                  handleSelectSuggestion(filtered[activeIndex]);
                } else {
                  commitRaw(pendingValue);
                }
              }
            }}
            onChange={(event) => {
              // Tras cerrar una etiqueta con un separador se suele teclear un espacio ("Acción, RPG"): no se
              // arrastra al principio de la siguiente.
              const val = pendingValue === '' ? event.target.value.replace(/^\s+/, '') : event.target.value;
              // Comas, punto y coma, tabuladores y saltos de línea cierran etiqueta: escribir "Acción, RPG" crea
              // dos chips y pegar una lista entera las reparte. Lo escrito tras el último separador sigue en el
              // campo para poder terminarlo (salvo que el texto acabe justo en el separador).
              if (TAG_SEPARATOR.test(val)) {
                const parts = splitTagInput(val);
                const tail = ENDS_WITH_SEPARATOR.test(val) ? '' : (parts.pop() ?? '');
                onPendingValueChange(tail);
                setShowSuggestions(false);
                setActiveIndex(-1);
                if (parts.length) onAdd(parts);
                return;
              }
              onPendingValueChange(val);
              updateFilter(val);
            }}
            onFocus={() => updateFilter(pendingValue)}
            onBlur={() => {
              // Mantener un retraso prudente para permitir clicks físicos antes de desmontar
              setTimeout(() => setShowSuggestions(false), 200);
            }}
          />

          {IS_FIREFOX_MOBILE && showSuggestions && filtered.length ? (
            <div
              className="tag-suggestions"
              role="listbox"
              id={suggestionListId}
              style={{ position: 'absolute', zIndex: 20, width: '100%' }}
            >
              {filtered.map((opt, idx) => {
                const isSelected = activeIndex === idx;
                return (
                  <div key={opt} id={`${suggestionListId}-opt-${idx}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      // Deberías mapear una clase de CSS para resaltar visualmente el foco del teclado
                      className={`tag-suggestion-btn ${isSelected ? 'is-active' : ''}`.trim()}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        handleSelectSuggestion(opt);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '.6rem .8rem',
                        textAlign: 'left',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {opt}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {errorMessage ? (
        <small id={messageId} className="tag-hint is-error">{errorMessage}</small>
      ) : hint ? (
        <small id={messageId} className="tag-hint">{hint}</small>
      ) : null}
    </div>
  );
}
