import { memo, useEffect, useMemo, useState } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { FILTER_BOOL, UI_MESSAGES } from '../../core/constants/labels';
import { HOURS_RANGES } from '../../core/constants/uiConfig';
import type { TabId, ToolbarFilters } from '../../model/types/game';
import { renderStars } from '../../core/utils/renderStars';
import { Icon } from './Icon';

interface ToolbarProps {
  currentTab: TabId;
  filters: ToolbarFilters;
  lookups: {
    genres: string[];
    platforms: string[];
    strengths: string[];
    weaknesses: string[];
  };
  
  activeFilterCount: number;
  compactFilters: boolean;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  onFilterChange: (key: keyof ToolbarFilters, value: string | boolean) => void;
  onClearFilter: (key: keyof ToolbarFilters) => void;
  onClearAll: () => void;
}

export const Toolbar = memo(function Toolbar({
  currentTab,
  filters,
  lookups,
  activeFilterCount,
  compactFilters,
  filtersOpen,
  onFiltersToggle,
  onFilterChange,
  onClearFilter,
  onClearAll,
}: ToolbarProps) {
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
  const activeItems = useMemo(
    () => {
      const items: Array<{ key: keyof ToolbarFilters; label: string }> = [];
      if (filters.search.trim()) items.push({ key: 'search', label: `Buscar: ${filters.search.trim()}` });
      if (filters.genre) items.push({ key: 'genre', label: `Género: ${filters.genre}` });
      if (filters.platform) items.push({ key: 'platform', label: `Plataforma: ${filters.platform}` });
      if (filters.score) items.push({ key: 'score', label: `Puntuación: ${filters.score}+` });
      if (filters.hours) {
        const range = HOURS_RANGES.find((entry) => entry.key === filters.hours);
        items.push({ key: 'hours', label: `Horas: ${range?.label || filters.hours}` });
      }
      if (filters.only && config) items.push({ key: 'only', label: config.label });
      if (filters.deck) items.push({ key: 'deck', label: 'Steam Deck' });
      return items;
    },
    [filters, config],
  );

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
          <button className="btn-icon btn-filter-toggle" type="button" onClick={onFiltersToggle}>
            <Icon name={filtersOpen ? COMMON_ICONS.close : activeFilterCount ? COMMON_ICONS.filterActive : COMMON_ICONS.filter} />
          </button>
        ) : null}
      </div>

      <div className={`filters-row ${!compactFilters || filtersOpen ? 'open' : ''}`}>
        <div className="filter-field">
          <label htmlFor="filter-genre" className="flabel">{UI_MESSAGES.toolbar.genre}</label>
          <select id="filter-genre" className="input-base" value={filters.genre} onChange={(event) => onFilterChange('genre', event.target.value)}>
            <option value="">{UI_MESSAGES.toolbar.allGenres}</option>
            {lookups.genres.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="filter-platform" className="flabel">{UI_MESSAGES.toolbar.platform}</label>
          <select id="filter-platform" className="input-base" value={filters.platform} onChange={(event) => onFilterChange('platform', event.target.value)}>
            <option value="">{UI_MESSAGES.toolbar.allPlatforms}</option>
            {lookups.platforms.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {supportsScore(currentTab) ? (
          <div className="filter-field">
            <label htmlFor="filter-score" className="flabel">{UI_MESSAGES.toolbar.score}</label>
            <select id="filter-score" className="input-base" value={filters.score} onChange={(event) => onFilterChange('score', event.target.value)}>
              <option value="">{UI_MESSAGES.toolbar.anyScore}</option>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={String(value)}>
                  {renderStars(value)} {UI_MESSAGES.toolbar.scoreOrMore(value)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {supportsHours(currentTab) ? (
          <div className="filter-field">
            <label htmlFor="filter-hours" className="flabel">{UI_MESSAGES.toolbar.hours}</label>
            <select id="filter-hours" className="input-base" value={filters.hours} onChange={(event) => onFilterChange('hours', event.target.value)}>
              <option value="">{UI_MESSAGES.toolbar.anyDuration}</option>
              {HOURS_RANGES.map((range) => (
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

        <div className="filter-field filter-field-toggle">
          <button
            className={`btn btn-toggle ${filters.deck ? 'active btn-toggle-deck' : ''}`}
            type="button"
            aria-label={UI_MESSAGES.toolbar.steamDeck}
            onClick={() => onFilterChange('deck', !filters.deck)}
          >
            <Icon name={COMMON_ICONS.steamDeck} />
            <span>{UI_MESSAGES.toolbar.steamDeck}</span>
          </button>
        </div>
      </div>

      {activeFilterCount ? (
        <div className="active-filters show">
          {activeItems.map((item) => (
            <span key={item.key} className="active-filter-chip">
              <span>{item.label}</span>
              <button
                type="button"
                className="chip-x"
                aria-label={UI_MESSAGES.toolbar.removeFilter(item.label)}
                onClick={() => onClearFilter(item.key)}
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
