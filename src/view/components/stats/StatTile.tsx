import { memo, type ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Sufijo pequeño pegado al número (p. ej. "h"); va fuera del valor para no engordar la cifra. */
  unit?: string;
}

/** Cifra grande con su etiqueta. La unidad y la pista van en menor peso para que el número sea lo que se lee. */
export const StatTile = memo(function StatTile({ label, value, hint, unit }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <strong className="stat-tile-value">
        {value}
        {unit ? <span className="stat-tile-unit">{unit}</span> : null}
      </strong>
      {hint ? <span className="stat-tile-hint">{hint}</span> : null}
    </div>
  );
});
