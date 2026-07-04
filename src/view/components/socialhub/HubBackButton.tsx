import { Icon } from '../Icon';

/** Botón "Atrás" estándar de las pantallas sociales. */
export function HubBackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button className="btn btn-secondary" type="button" onClick={onBack}>
      <Icon name="arrow-back" />
      {label}
    </button>
  );
}
