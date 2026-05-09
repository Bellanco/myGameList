import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

interface GameOption {
  id: number;
  name: string;
}

interface SocialGameCardSelectorProps {
  title: string;
  description: string;
  searchPlaceholder: string;
  searchValue: string;
  selectedIds: number[];
  options: GameOption[];
  emptyMessage: string;
  onSearchChange: (value: string) => void;
  onToggle: (id: number) => void;
}

/**
 * Selector horizontal de juegos en cards con buscador por nombre.
 */
export const SocialGameCardSelector = memo(function SocialGameCardSelector({
  title,
  description,
  searchPlaceholder,
  searchValue,
  selectedIds,
  options,
  emptyMessage,
  onSearchChange,
  onToggle,
}: SocialGameCardSelectorProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const didDragRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return options;
    }

    return options.filter((option) => option.name.toLowerCase().includes(query));
  }, [options, searchValue]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rowRef.current) {
      return;
    }

    draggingRef.current = true;
    didDragRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartScrollRef.current = rowRef.current.scrollLeft;
    setIsDragging(true);
  }, []);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!rowRef.current) {
      return;
    }

    if (event.key === 'ArrowRight') {
      rowRef.current.scrollLeft += 120;
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft') {
      rowRef.current.scrollLeft -= 120;
      event.preventDefault();
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current || !rowRef.current) {
        return;
      }

      const deltaX = event.clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 4) {
        didDragRef.current = true;
      }

      rowRef.current.scrollLeft = dragStartScrollRef.current - deltaX;
      event.preventDefault();
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) {
        return;
      }

      draggingRef.current = false;
      setIsDragging(false);

      window.setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <article className="social-profile-block social-profile-block-wide social-card-selector">
      <div className="social-card-selector-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong className="social-card-selector-counter">{selectedIds.length}</strong>
      </div>

      <label className="social-card-selector-search" aria-label={`${title} buscador`}>
        <span>Buscar</span>
        <input
          type="text"
          className="finput"
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      {filteredOptions.length === 0 ? (
        <p className="social-card-selector-empty">{emptyMessage}</p>
      ) : (
        <div
          ref={rowRef}
          className={`social-card-row ${isDragging ? 'is-dragging' : ''}`}
          aria-label={`${title} cards`}
          role="group"
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
        >
          {filteredOptions.map((option) => {
            const isSelected = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className={`social-game-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  if (didDragRef.current) {
                    return;
                  }

                  onToggle(option.id);
                }}
              >
                <span className="social-game-card-title">{option.name}</span>
                <span className="social-game-card-status">{isSelected ? 'Seleccionado' : 'Seleccionar'}</span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
});
