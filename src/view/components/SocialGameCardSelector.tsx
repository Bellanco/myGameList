import { memo, useMemo } from 'react';
import { SOCIAL_UI } from '../../core/constants/labels';

interface GameOption {
  id: number;
  name: string;
}

interface SocialGameCardSelectorProps {
  title: string;
  /** Número de paso opcional (1,2,3…) que se muestra como badge junto al título. */
  step?: number;
  description: string;
  searchPlaceholder: string;
  searchValue: string;
  selectedIds: number[];
  options: GameOption[];
  emptyMessage: string;
  maxSelected?: number;
  onSearchChange: (value: string) => void;
  onToggle: (id: number) => void;
}

/**
 * Selector horizontal de juegos en cards con buscador por nombre.
 */
export const SocialGameCardSelector = memo(function SocialGameCardSelector({
  title,
  step,
  description,
  searchPlaceholder,
  searchValue,
  selectedIds,
  options,
  emptyMessage,
  maxSelected,
  onSearchChange,
  onToggle,
}: SocialGameCardSelectorProps) {
  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return options;
    }

    return options.filter((option) => option.name.toLowerCase().includes(query));
  }, [options, searchValue]);

  // Cupo lleno: al alcanzar el máximo, las tarjetas NO seleccionadas se deshabilitan (y cambian su literal).
  const full = maxSelected != null && selectedIds.length >= maxSelected;

  return (
    <article className="hub-profile-block hub-profile-block-wide hub-card-selector">
      <div className="hub-card-selector-head">
        <div>
          {step ? (
            <div className="hub-block-head"><span className="hub-block-step">{step}</span><h3>{title}</h3></div>
          ) : (
            <h3>{title}</h3>
          )}
          <p>{description}</p>
        </div>
        <strong className={`hub-card-selector-counter ${maxSelected && selectedIds.length >= maxSelected ? 'is-full' : ''}`.trim()}>
          {maxSelected ? `${selectedIds.length} / ${maxSelected}` : selectedIds.length}
        </strong>
      </div>

      <label className="hub-card-selector-search" aria-label={SOCIAL_UI.cardSelector.searchAria(title)}>
        <span>{SOCIAL_UI.cardSelector.searchLabel}</span>
        <input
          type="text"
          className="finput"
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      {filteredOptions.length === 0 ? (
        <p className="hub-card-selector-empty">{emptyMessage}</p>
      ) : (
        <div
          className="hub-card-grid"
          aria-label={SOCIAL_UI.cardSelector.cardsAria(title)}
          role="group"
        >
          {filteredOptions.map((option, i) => {
            const isSelected = selectedIds.includes(option.id);
            const disabled = !isSelected && full;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                // Tono variado por posición (--0..4): distingue las casillas de sus vecinas (lados y arriba/abajo).
                className={`hub-game-card hub-game-card--${i % 5} ${isSelected ? 'is-selected' : ''}`.trim()}
                onClick={() => onToggle(option.id)}
              >
                <span className="hub-game-card-check" aria-hidden="true" />
                <span className="hub-game-card-title">{option.name}</span>
                <span className="hub-game-card-status">
                  {isSelected ? 'Seleccionado' : disabled ? 'Máximo alcanzado' : 'Seleccionar'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
});

