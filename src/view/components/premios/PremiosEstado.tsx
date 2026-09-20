import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { PREMIOS_ROUTES } from '../../../viewmodel/premios/premiosRoutes';

/**
 * Las pantallas de SALIDA del flujo de votación.
 *
 * Existen porque las tres situaciones que las provocan —acabar de enviar, llegar con el plazo cerrado y volver
 * sin correcciones— terminaban en la portada sin decir nada, y una portada muda después de enviar una papeleta se
 * lee como «no se ha guardado».
 */

export function PremiosEnviada({
  remainingEdits,
  hasResults,
}: {
  remainingEdits: number;
  hasResults: boolean;
}) {
  const L = PREMIOS_UI.enviada;
  return (
    <section className="premios-estado" aria-label={L.sectionAria}>
      <h2>{L.title}</h2>
      <p>{L.body}</p>
      <p className="premios-estado__muted">{L.editHint(remainingEdits)}</p>
      <p className="premios-estado__muted">{L.resultsSoon}</p>
      <div className="premios-estado__actions">
        {hasResults ? (
          <Link className="btn" to={PREMIOS_ROUTES.results}>
            {L.toResults}
          </Link>
        ) : null}
        <Link className="btn" to={PREMIOS_ROUTES.home}>
          {PREMIOS_UI.cerrada.toHome}
        </Link>
      </div>
    </section>
  );
}

/**
 * Llegar a votar cuando no se puede: porque el plazo se cerró o porque todavía no ha abierto.
 *
 * Se distinguen los dos casos a propósito. «Cerrada» y «aún no ha empezado» se parecen en que no se puede votar y
 * en nada más: quien llega antes de tiempo volverá, y quien llega tarde solo quiere saber cuándo se sabrá el
 * resultado.
 */
export function PremiosCerrada({
  scheduled,
  hasResults,
}: {
  scheduled: boolean;
  hasResults: boolean;
}) {
  const L = PREMIOS_UI.cerrada;
  return (
    <section className="premios-estado" aria-label={L.sectionAria}>
      <h2>{scheduled ? PREMIOS_UI.portada.scheduled : L.title}</h2>
      <p>{scheduled ? L.scheduled : L.body}</p>
      {!scheduled && !hasResults ? <p className="premios-estado__muted">{L.bodyPending}</p> : null}
      <div className="premios-estado__actions">
        {hasResults ? (
          <Link className="btn btn-primary" to={PREMIOS_ROUTES.results}>
            {L.toResults}
          </Link>
        ) : null}
        <Link className="btn" to={PREMIOS_ROUTES.home}>
          {L.toHome}
        </Link>
      </div>
    </section>
  );
}

/** Ya votó y no le quedan correcciones: se le enseña lo que votó, no un formulario que no puede enviar. */
export function PremiosYaVotaste({ hasResults }: { hasResults: boolean }) {
  const L = PREMIOS_UI.yaVotaste;
  return (
    <section className="premios-estado" aria-label={PREMIOS_UI.enviada.sectionAria}>
      <h2>{L.title}</h2>
      <p>{L.body}</p>
      <div className="premios-estado__actions">
        {hasResults ? (
          <Link className="btn" to={PREMIOS_ROUTES.results}>
            {PREMIOS_UI.cerrada.toResults}
          </Link>
        ) : null}
        <Link className="btn" to={PREMIOS_ROUTES.home}>
          {PREMIOS_UI.cerrada.toHome}
        </Link>
      </div>
    </section>
  );
}
