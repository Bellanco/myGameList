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
  remainingOpportunities,
  hasResults,
}: {
  remainingOpportunities: number;
  hasResults: boolean;
}) {
  const L = PREMIOS_UI.enviada;
  return (
    <section className="premios-estado" aria-label={L.sectionAria}>
      <h2>{L.title}</h2>
      <p>{L.body}</p>
      <p className="premios-estado__muted">{L.editHint(remainingOpportunities)}</p>
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

/**
 * LA PUERTA: llegar a votar sin sesión.
 *
 * Antes esto era un párrafo mudo —«entra con tu cuenta de Google para votar»— sin nada que pulsar: había que
 * adivinar que la sesión se inicia en otra pantalla y volver. El botón entra con la MISMA sesión de la
 * aplicación (`signInWithGoogle` del gateway), así que esto no es una segunda pantalla de acceso de las que
 * prohíbe `docs/plan-unificar-premios.md` §1.5: es la de casa, ofrecida donde hace falta.
 *
 * Los RESULTADOS no pasan por aquí: se ven sin cuenta, que es lo que hace que el enlace de una edición sirva
 * para algo (§4.2).
 */
export function PremiosIdentificate({
  signingIn,
  error,
  onSignIn,
}: {
  signingIn: boolean;
  error: string;
  onSignIn: () => void;
}) {
  const L = PREMIOS_UI.errores;
  return (
    <section className="premios-estado" aria-label={L.needsSessionAria}>
      <h2>{L.needsSessionTitle}</h2>
      <p>{L.needsSession}</p>
      <p className="premios-estado__muted">{L.needsSessionHint}</p>
      {error ? (
        <p className="premios-estado__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="premios-estado__actions">
        <button type="button" className="btn btn-primary" disabled={signingIn} onClick={onSignIn}>
          {signingIn ? PREMIOS_UI.portada.signingIn : PREMIOS_UI.portada.signIn}
        </button>
        <Link className="btn" to={PREMIOS_ROUTES.home}>
          {PREMIOS_UI.cerrada.toHome}
        </Link>
      </div>
    </section>
  );
}
