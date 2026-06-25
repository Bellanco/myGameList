import { memo } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { useTheme } from '../hooks/useTheme';

const APPEARANCE = UI_MESSAGES.settings.appearance;

function SunIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Botón-icono compacto para el header: alterna entre tema claro y oscuro.
 * Autocontenido vía `useTheme`; muestra el icono del tema ACTUAL (sol=claro, luna=oscuro)
 * y anuncia a qué tema cambiará al pulsar.
 */
export const ThemeToggle = memo(function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextLabel = theme === 'dark' ? APPEARANCE.light : APPEARANCE.dark;
  const currentLabel = theme === 'dark' ? APPEARANCE.dark : APPEARANCE.light;
  const hint = `${APPEARANCE.groupAria}: ${currentLabel}. ${APPEARANCE.cycleHint} ${nextLabel}.`;

  return (
    <button
      type="button"
      className="btn-icon theme-toggle-btn"
      onClick={toggle}
      aria-label={hint}
      title={hint}
    >
      {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
});
