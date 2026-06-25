import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  values: Array<string | number>;
  pendingValue: string;
  onPendingValueChange: (value: string) => void;
  /** Se actualizó para permitir pasar el valor directamente y evitar race conditions */
  onAdd: (explicitValue?: string) => void;
  onRemove: (value: string | number) => void;
  listId?: string;
  options?: string[]; // Propiedad recomendada para escalabilidad
  placeholder?: string;
  hint?: string;
  chipClassName: string;
  invalid?: boolean;
  warning?: boolean;
  required?: boolean;
}

// Se extrae la detección del agente para ejecutarla solo una vez en la carga del script
const IS_FIREFOX_MOBILE = typeof navigator !== 'undefined'
  && /Firefox\//.test(navigator.userAgent)
  && (
    /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)
    || navigator.maxTouchPoints > 1
    || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  );

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
}: TagInputProps) {
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const handleSelectSuggestion = (value: string) => {
    onPendingValueChange('');
    onAdd(value); // Pasamos el valor directamente eliminando el setTimeout peligroso
    setShowSuggestions(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const suggestionListId = `${(listId || label.replace(/\s+/g, '-').toLowerCase())}-suggestions`;

  return (
    <div className="fg">
      <label className="flabel">
        {label}
        {required ? ' *' : ''}
      </label>
      <div className={`tag-inp-wrap ${invalid ? 'has-error' : ''} ${warning ? 'has-warning' : ''}`.trim()}>
        {values.map((value) => (
          <span key={`${label}-${String(value)}`} className={`chip ${chipClassName}`}>
            {String(value)}
            <button
              type="button"
              className="chip-rm"
              aria-label={UI_MESSAGES.table.removeTag(String(value))}
              onClick={() => onRemove(value)}
            >
              <Icon name={COMMON_ICONS.close} />
            </button>
          </span>
        ))}
        
        <div style={{ position: 'relative', display: 'inline-block', flexGrow: 1 }}>
          <input
            type="text"
            className="finput"
            list={IS_FIREFOX_MOBILE ? undefined : listId}
            value={pendingValue}
            placeholder={placeholder}
            enterKeyHint="done"
            autoComplete="off"
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
                  onAdd(); // Añade el valor pendiente desde el estado del padre
                }
              }
            }}
            onChange={(event) => {
              const val = event.target.value;
              if (val.includes('\n') || val.includes('\r')) {
                const cleaned = val.replace(/\r|\n/g, '').trim();
                onPendingValueChange('');
                onAdd(cleaned);
                setShowSuggestions(false);
                setActiveIndex(-1);
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
      {hint ? <small className="tag-hint">{hint}</small> : null}
    </div>
  );
}
