import { COMMON_ICONS } from '../../core/constants/icons';
import { Icon } from './Icon';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  values: Array<string | number>;
  pendingValue: string;
  onPendingValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string | number) => void;
  listId?: string;
  placeholder?: string;
  hint?: string;
  chipClassName: string;
  invalid?: boolean;
  warning?: boolean;
  required?: boolean;
}

/**
 * Tag input con datalist nativo y chips.
 * Agrega valores al pulsar Enter para mantener el flujo de captura original.
 */
export function TagInput({
  label,
  values,
  pendingValue,
  onPendingValueChange,
  onAdd,
  onRemove,
  listId,
  placeholder,
  hint,
  chipClassName,
  invalid = false,
  warning = false,
  required = false,
}: TagInputProps) {
  const isFirefoxMobile = typeof navigator !== 'undefined'
    && /Firefox\//.test(navigator.userAgent)
    && (
      /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)
      || navigator.maxTouchPoints > 1
      || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    );
  const [options, setOptions] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!listId) return;
    const el = document.getElementById(listId) as HTMLDataListElement | null;
    if (!el) return setOptions([]);
    const opts = Array.from(el.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    setOptions(opts);
  }, [listId]);

  const updateFilter = useMemo(() => (val: string) => {
    if (!isFirefoxMobile || !options.length) return setShowSuggestions(false);
    const lower = val.toLowerCase().trim();
    const matched = !lower ? options.slice(0, 8) : options.filter((o) => o.toLowerCase().includes(lower)).slice(0, 8);
    setFiltered(matched);
    setActiveIndex(matched.length ? 0 : -1);
    setShowSuggestions(matched.length > 0);
  }, [isFirefoxMobile, options]);

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
              aria-label={`Eliminar ${String(value)}`}
              onClick={() => onRemove(value)}
            >
              <Icon name={COMMON_ICONS.close} />
            </button>
          </span>
        ))}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="finput"
            list={isFirefoxMobile ? undefined : listId}
            value={pendingValue}
            placeholder={placeholder}
            enterKeyHint="done"
            autoComplete="off"
            ref={inputRef}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              const key = event.key;
              if (isFirefoxMobile && showSuggestions && (key === 'ArrowDown' || key === 'ArrowUp')) {
                event.preventDefault();
                setActiveIndex((prev) => {
                  if (filtered.length === 0) return -1;
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

              if (key === 'Enter') {
                if (isFirefoxMobile && showSuggestions && activeIndex >= 0 && filtered[activeIndex]) {
                  event.preventDefault();
                  const opt = filtered[activeIndex];
                  onPendingValueChange(opt);
                  onAdd();
                  setShowSuggestions(false);
                  setActiveIndex(-1);
                  return;
                }
                event.preventDefault();
                onAdd();
              }
            }}
            onChange={(event) => {
              const val = event.target.value;
              if (val.includes('\n') || val.includes('\r')) {
                const cleaned = val.replace(/\r|\n/g, '').trim();
                onPendingValueChange(cleaned);
                onAdd();
                setShowSuggestions(false);
                setActiveIndex(-1);
                return;
              }
              onPendingValueChange(val);
              updateFilter(val);
            }}
            onFocus={() => updateFilter(pendingValue)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 150);
            }}
          />

          {isFirefoxMobile && showSuggestions && filtered.length ? (
            <ul className="tag-suggestions" role="listbox" id={suggestionListId} style={{ position: 'absolute', zIndex: 20 }}>
              {filtered.map((opt, idx) => (
                <li
                  key={opt}
                  id={`${suggestionListId}-opt-${idx}`}
                  role="option"
                  aria-selected={activeIndex === idx}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    onPendingValueChange(opt);
                    onAdd();
                    setShowSuggestions(false);
                    setActiveIndex(-1);
                  }}
                >
                  {opt}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {hint ? <small className="tag-hint">{hint}</small> : null}
    </div>
  );
}
