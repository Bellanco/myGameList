import { PREMIOS_UI } from '../../../core/constants/premiosLabels';

const L = PREMIOS_UI.votar;

/**
 * LA CABECERA DE LA PAPELETA: dónde vas, cuánto llevas y qué toca ahora.
 *
 * Es la pieza que la porra de origen tenía en todas las pantallas del flujo y que aquí se había quedado en un
 * «Categoría 3 de 27» suelto. La diferencia no es adorno: en una papeleta de veintisiete categorías, saber que
 * vas por el 11 % es lo que decide si sigues ahora o lo dejas para luego.
 *
 * DOS NÚMEROS QUE NO SON EL MISMO, y por eso se dicen los dos:
 *   · el CONTADOR y la barra miden el recorrido (por dónde vas de la papeleta);
 *   · la marca de la derecha dice si ESTA categoría está votada, que es lo único que decide si tu papeleta suma.
 *
 * La barra es decorativa (`aria-hidden`): el mismo dato va en el texto del contador y en el porcentaje, y un
 * `progressbar` que repite lo que ya está escrito al lado solo alarga lo que se oye.
 */
export interface PremiosProgressProps {
  /** Titular de la pantalla: la categoría, o el rótulo de la revisión. */
  title: string;
  /** Lo que se dice debajo del titular. */
  subtitle?: string;
  current: number;
  total: number;
  /** Estado de ESTA categoría. Sin él no se pinta marca (la revisión no la necesita). */
  voted?: boolean | null;
}

export function PremiosProgress({ title, subtitle, current, total, voted = null }: PremiosProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <header className="premios-progress">
      <div className="premios-progress__row">
        <span className="premios-progress__count">{L.progressCount(current, total)}</span>
        {voted === null ? null : (
          <span className={`premios-progress__mark${voted ? ' is-voted' : ''}`}>
            {voted ? L.votedMark : L.pendingMark}
          </span>
        )}
        <span className="premios-progress__pct">{L.progressPercent(pct)}</span>
      </div>

      <div className="premios-progress__track" aria-hidden="true">
        <div className="premios-progress__bar" style={{ width: `${pct}%` }} />
      </div>

      <h2 className="premios-progress__title">{title}</h2>
      {subtitle ? <p className="premios-progress__sub">{subtitle}</p> : null}
    </header>
  );
}
