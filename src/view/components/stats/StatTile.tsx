import { memo, type CSSProperties, type ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Sufijo pequeño pegado al número (p. ej. "h"); va fuera del valor para no engordar la cifra. */
  unit?: string;
  /**
   * Porcentaje 0–100 para una barra fina al pie. Solo cuando la cifra ES una parte de un todo —las reseñas
   * sobre lo que has cerrado—: en una cifra absoluta, una barra al 100% no significaría nada.
   */
  progress?: number;
  /** Convierte la tarjeta en un enlace a otra pantalla del panel. */
  onClick?: () => void;
  /** Texto accesible de ese enlace; obligatorio si hay `onClick`, porque el rótulo solo dice la métrica. */
  actionLabel?: string;
}

/** Cifra grande con su etiqueta. La unidad y la pista van en menor peso para que el número sea lo que se lee. */
export const StatTile = memo(function StatTile({ label, value, hint, unit, progress, onClick, actionLabel }: StatTileProps) {
  const body = (
    <>
      <span className="stat-tile-label">{label}</span>
      <strong className="stat-tile-value">
        {value}
        {unit ? <span className="stat-tile-unit">{unit}</span> : null}
      </strong>
      {hint ? <span className="stat-tile-hint">{hint}</span> : null}
      {typeof progress === 'number' ? (
        <span className="stat-tile-bar" aria-hidden="true">
          <i style={{ '--pct': `${Math.max(0, Math.min(progress, 100))}%` } as CSSProperties} />
        </span>
      ) : null}
    </>
  );

  // Pulsable solo cuando lleva a alguna parte: así la tarjeta corriente sigue siendo un dato, no un control.
  if (onClick) {
    return (
      <button type="button" className="stat-tile is-link" onClick={onClick} aria-label={actionLabel}>
        {body}
      </button>
    );
  }

  return <div className="stat-tile">{body}</div>;
});
