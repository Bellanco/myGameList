import { memo, useEffect, useMemo, useState } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { FILTER_BOOL, UI_MESSAGES } from '../../core/constants/labels';
import { HOURS_RANGES } from '../../core/constants/uiConfig';
import type { TabId, ToolbarFilters } from '../../model/types/game';
import type { TabOptions } from '../../viewmodel/toolbarFilters';
import { renderStars } from '../../core/utils/renderStars';
import { gradeFloorForStars } from '../../core/utils/scoreScale';
import { useScoreScale } from '../hooks/useScoreScale';
import { Icon } from './Icon';

interface ToolbarProps {
  currentTab: TabId;
  filters: ToolbarFilters;
  options: TabOptions;

  activeFilterCount: number;
  compactFilters: boolean;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  onFilterChange: (key: keyof ToolbarFilters, value: string | boolean) => void;
  onToggleValue: (key: 'genres' | 'platforms', value: string) => void;
  onClearFilter: (key: keyof ToolbarFilters) => void;
  onClearAll: () => void;
  /** Visibilidad del botón "Steam Deck" (preferencia de cuenta; por defecto true). */
  showSteamButton: boolean;
}

export const Toolbar = memo(function Toolbar({
  currentTab,
  filters,
  options,
  activeFilterCount,
  compactFilters,
  filtersOpen,
  onFiltersToggle,
  onFilterChange,
  onToggleValue,
  onClearFilter,
  onClearAll,
  showSteamButton,
}: ToolbarProps) {
  const scoreScale = useScoreScale();
  const [searchDraft, setSearchDraft] = useState(filters.search);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (searchDraft !== filters.search) {
        onFilterChange('search', searchDraft);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchDraft, filters.search, onFilterChange]);

  const supportsScore = (tab: TabId) => tab === 'c' || tab === 'p';
  const supportsHours = (tab: TabId) => tab === 'c';
  const config = FILTER_BOOL[currentTab];

  // Multiselección por adición: el <select> queda siempre en su opción por defecto y, al elegir un valor,
  // lo añade (los ya seleccionados se ocultan de la lista y se ven como chips abajo, con su "x" para quitar).
  const genreOptions = useMemo(() => options.genres.filter((value) => !filters.genres.includes(value)), [options.genres, filters.genres]);
  const platformOptions = useMemo(
    () => options.platforms.filter((value) => !filters.platforms.includes(value)),
    [options.platforms, filters.platforms],
  );
  const hoursOptions = useMemo(() => HOURS_RANGES.filter((range) => options.hours.includes(range.key)), [options.hours]);

  const activeItems = useMemo(() => {
    const items: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (filters.search.trim()) items.push({ id: 'search', label: `Buscar: ${filters.search.trim()}`, onRemove: () => onClearFilter('search') });
    filters.genres.forEach((value) => items.push({ id: `genre:${value}`, label: `Género: ${value}`, onRemove: () => onToggleValue('genres', value) }));
    filters.platforms.forEach((value) =>
      items.push({ id: `platform:${value}`, label: `Plataforma: ${value}`, onRemove: () => onToggleValue('platforms', value) }),
    );
    if (filters.score) {
      // El umbral se guarda en estrellas (1–5); en modo nota se muestra el suelo de su tramo (5★=90, 4★=70, …).
      const shown = scoreScale === 'grade' ? gradeFloorForStars(Number(filters.score)) : filters.score;
      items.push({ id: 'score', label: `Puntuación: ${shown}+`, onRemove: () => onClearFilter('score') });
    }
    if (filters.hours) {
      const range = HOURS_RANGES.find((entry) => entry.key === filters.hours);
      items.push({ id: 'hours', label: `Horas: ${range?.label || filters.hours}`, onRemove: () => onClearFilter('hours') });
    }
    if (filters.only && config) items.push({ id: 'only', label: config.label, onRemove: () => onClearFilter('only') });
    if (filters.deck) items.push({ id: 'deck', label: 'Steam Deck', onRemove: () => onClearFilter('deck') });
    return items;
  }, [filters, config, onClearFilter, onToggleValue, scoreScale]);

  return (
    <div className="toolbar">
      <div className="toolbar-top">
        <div className="search-wrap">
          <input
            type="search"
            className="input-base search-input"
            placeholder={UI_MESSAGES.toolbar.searchPlaceholder}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          {searchDraft ? (
            <button
              type="button"
              className="search-clear"
              aria-label={UI_MESSAGES.toolbar.clearSearch}
              onClick={() => {
                setSearchDraft('');
                onClearFilter('search');
              }}
            >
              <Icon name={COMMON_ICONS.close} />
            </button>
          ) : null}
        </div>
        {compactFilters ? (
          <button
            className="btn-icon btn-filter-toggle"
            type="button"
            aria-label={UI_MESSAGES.toolbar.toggleFilters(filtersOpen)}
            aria-expanded={filtersOpen}
            onClick={onFiltersToggle}
          >
            <Icon name={filtersOpen ? COMMON_ICONS.close : activeFilterCount ? COMMON_ICONS.filterActive : COMMON_ICONS.filter} />
          </button>
        ) : null}
      </div>

      <div className={`filters-row ${!compactFilters || filtersOpen ? 'open' : ''}`}>
        {genreOptions.length || filters.genres.length ? (
          <div className="filter-field">
            <label htmlFor="filter-genre" className="flabel">{UI_MESSAGES.toolbar.genre}</label>
            <select
              id="filter-genre"
              className="input-base"
              value=""
              onChange={(event) => {
                if (event.target.value) onToggleValue('genres', event.target.value);
              }}
            >
              <option value="">{UI_MESSAGES.toolbar.allGenres}</option>
              {genreOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {platformOptions.length || filters.platforms.length ? (
          <div className="filter-field">
            <label htmlFor="filter-platform" className="flabel">{UI_MESSAGES.toolbar.platform}</label>
            <select
              id="filter-platform"
              className="input-base"
              value=""
              onChange={(event) => {
                if (event.target.value) onToggleValue('platforms', event.target.value);
              }}
            >
              <option value="">{UI_MESSAGES.toolbar.allPlatforms}</option>
              {platformOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {supportsScore(currentTab) && options.scores.length ? (
          <div className="filter-field">
            <label htmlFor="filter-score" className="flabel">{UI_MESSAGES.toolbar.score}</label>
            <select id="filter-score" className="input-base" value={filters.score} onChange={(event) => onFilterChange('score', event.target.value)}>
              <option value="">{UI_MESSAGES.toolbar.anyScore}</option>
              {options.scores.map((value) => (
                <option key={value} value={String(value)}>
                  {scoreScale === 'grade'
                    ? UI_MESSAGES.toolbar.scoreOrMore(gradeFloorForStars(value))
                    : `${renderStars(value)} ${UI_MESSAGES.toolbar.scoreOrMore(value)}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {supportsHours(currentTab) && hoursOptions.length ? (
          <div className="filter-field">
            <label htmlFor="filter-hours" className="flabel">{UI_MESSAGES.toolbar.hours}</label>
            <select id="filter-hours" className="input-base" value={filters.hours} onChange={(event) => onFilterChange('hours', event.target.value)}>
              <option value="">{UI_MESSAGES.toolbar.anyDuration}</option>
              {hoursOptions.map((range) => (
                <option key={range.key} value={range.key}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {config ? (
          <div className="filter-field filter-field-toggle">
            <label className="flabel filter-field-hidden-label" aria-hidden="true">
              {config.label}
            </label>
            <button
              className={`btn btn-toggle ${filters.only ? 'active' : ''}`}
              type="button"
              onClick={() => onFilterChange('only', !filters.only)}
            >
              <Icon name={config.field === 'replayable' ? COMMON_ICONS.repeat : COMMON_ICONS.undo} />
              <span>{config.label}</span>
            </button>
          </div>
        ) : null}

        {showSteamButton ? (
          <div className="filter-field filter-field-toggle">
            <button
              className={`btn btn-toggle btn-toggle-deck ${filters.deck ? 'active' : ''}`}
              type="button"
              aria-label={UI_MESSAGES.toolbar.steamDeck}
              onClick={() => onFilterChange('deck', !filters.deck)}
            >
              <Icon name={COMMON_ICONS.steamDeck} />
              <span>{UI_MESSAGES.toolbar.steamDeck}</span>
            </button>
          </div>
        ) : null}
      </div>

      {activeFilterCount ? (
        <div className="active-filters show">
          {activeItems.map((item) => (
            <span key={item.id} className="active-filter-chip">
              <span>{item.label}</span>
              <button
                type="button"
                className="chip-x"
                aria-label={UI_MESSAGES.toolbar.removeFilter(item.label)}
                onClick={item.onRemove}
              >
                <Icon name={COMMON_ICONS.close} />
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-ghost" onClick={onClearAll}>
            Limpiar filtros
          </button>
        </div>
      ) : null}
    </div>
  );
});
