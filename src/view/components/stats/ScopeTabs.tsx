import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { StatsScope } from '../../../viewmodel/useStatsViewModel';

const L = UI_MESSAGES.stats.scope;

interface ScopeTabsProps {
  scope: StatsScope;
  years: number[];
  onChange: (scope: StatsScope) => void;
}

/**
 * Selector de periodo: "General" y un botón por año. Los años los pone el propio contenido —solo aquellos en
 * los que completaste algo—, así que nunca se ofrece una pestaña que llevaría a una pantalla vacía.
 *
 * Mismo patrón de conmutador que el resto de la app (`aria-pressed` sobre `.btn-toggle`) en vez de `role="tab"`:
 * unas pestañas ARIA a medias (sin navegación por flechas) se anuncian como algo que luego no cumplen.
 */
export const ScopeTabs = memo(function ScopeTabs({ scope, years, onChange }: ScopeTabsProps) {
  if (years.length === 0) return null;

  return (
    <div className="scope-tabs" role="group" aria-label={L.groupAria}>
      <button
        type="button"
        className={`btn btn-toggle${scope === 'general' ? ' active' : ''}`}
        aria-pressed={scope === 'general'}
        onClick={() => onChange('general')}
      >
        <span>{L.general}</span>
      </button>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className={`btn btn-toggle${scope === year ? ' active' : ''}`}
          aria-pressed={scope === year}
          aria-label={L.yearAria(year)}
          onClick={() => onChange(year)}
        >
          <span>{year}</span>
        </button>
      ))}
    </div>
  );
});
