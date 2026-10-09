import { Icon } from '../Icon';

/**
 * Botón "Atrás" estándar de las pantallas sociales. `ariaLabel`, cuando el rótulo visible va abreviado: el nombre
 * accesible debe empezar por lo que se ve (WCAG 2.5.3).
 */
export function HubBackButton({ onBack, label, ariaLabel }: { onBack: () => void; label: string; ariaLabel?: string }) {
  return (
    <button className="btn btn-secondary btn-back" type="button" onClick={onBack} aria-label={ariaLabel}>
      <Icon name="arrow-back" />
      {label}
    </button>
  );
}
