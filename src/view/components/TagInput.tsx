import { COMMON_ICONS } from '../../core/constants/icons';
import { Icon } from './Icon';

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
        <input
          type="text"
          className="finput"
          list={listId}
          value={pendingValue}
          placeholder={placeholder}
          onChange={(event) => onPendingValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onAdd();
          }}
        />
      </div>
      {hint ? <small className="tag-hint">{hint}</small> : null}
    </div>
  );
}
