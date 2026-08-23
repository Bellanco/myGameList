import { memo, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../Icon';

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
  /**
   * Tramo destacado sobre la escala completa, con una marca en su centro. Para las cifras que no son «cuánto de
   * un todo» sino «DÓNDE, y alrededor de qué»: la exigencia es la anchura de una zona, y una barra que crece
   * desde cero no puede decir eso —ni dónde empieza la zona ni dónde cae la media que la centra—.
   *
   * Los tres valores son porcentajes 0–100 de la escala que se esté pintando.
   */
  band?: { from: number; to: number; mark: number };
  /** Convierte la tarjeta en un enlace a otra pantalla del panel. */
  onClick?: () => void;
  /** Texto accesible de ese enlace; obligatorio si hay `onClick`, porque el rótulo solo dice la métrica. */
  actionLabel?: string;
}

/** Cifra grande con su etiqueta. La unidad y la pista van en menor peso para que el número sea lo que se lee. */
export const StatTile = memo(function StatTile({ label, value, hint, unit, progress, band, onClick, actionLabel }: StatTileProps) {
  const pct = (value: number) => `${Math.max(0, Math.min(value, 100))}%`;
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
          <i style={{ '--pct': pct(progress) } as CSSProperties} />
        </span>
      ) : null}
      {band ? (
        <span
          className="stat-tile-band"
          aria-hidden="true"
          style={{
            '--from': pct(band.from),
            '--to': pct(band.to),
            '--mark': pct(band.mark),
          } as CSSProperties}
        >
          <i />
          <b />
        </span>
      ) : null}
    </>
  );

  // Pulsable solo cuando lleva a alguna parte: así la tarjeta corriente sigue siendo un dato, no un control.
  if (onClick) {
    return (
      <button type="button" className="stat-tile is-link" onClick={onClick} aria-label={actionLabel}>
        {body}
        {/* La marca de destino. Lleva la clase `btn` A PROPÓSITO: así hereda el botón de la paleta activa —el
            chaflán del HUD en Cyberpunk, el sesgo entintado en Persona, el filete de oro en Grimdark…— sin que
            este componente sepa qué paleta hay puesta. `.stat-tile-go` solo la encoge (ver `stats.scss`).
            El HUECO va aparte y con clase propia: quién manda en la POSICIÓN no puede depender de una clase que
            los skins también estilan —Sea of Stars le da `position: relative` a todo `.btn`—.
            Es DECORATIVA: lo que nombra la acción es el `aria-label`, no la flecha, y en táctil —donde no hay
            puntero que señale— es la única pista de que la tarjeta lleva a otra pantalla. El icono va dentro
            del envoltorio para conservar su clase `ui-icon`, que es la que le da el tamaño. */}
        <span className="stat-tile-go-slot" aria-hidden="true">
          <span className="btn stat-tile-go">
            <Icon name="angle-right" />
          </span>
        </span>
      </button>
    );
  }

  return <div className="stat-tile">{body}</div>;
});
