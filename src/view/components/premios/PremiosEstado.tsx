import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import { Icon } from '../Icon';

/**
 * Las pantallas de SALIDA del flujo de votación.
 *
 * Existen porque las tres situaciones que las provocan —acabar de enviar, llegar con el plazo cerrado y volver
 * sin correcciones— terminaban en la portada sin decir nada, y una portada muda después de enviar una papeleta se
 * lee como «no se ha guardado».
 */

export function PremiosEnviada({
  displayName,
  remainingOpportunities,
  canEdit,
  hasResults,
}: {
  /** El nombre con el que ha votado: es a quien se da las gracias. */
  displayName: string;
  remainingOpportunities: number;
  /** ¿Puede volver a entrar a corregirla? */
  canEdit: boolean;
  hasResults: boolean;
}) {
  const L = PREMIOS_UI.enviada;
  return (
    <section className="premios-enviada" aria-label={L.sectionAria}>
      {/* UNA MARCA DE CONFIRMACIÓN, grande y sola. Lo que hay que entender de un vistazo es que el voto entró; el
          resto de la pantalla es el detalle para quien se quede a leerlo. */}
      <span className="premios-enviada__check" aria-hidden="true">
        <Icon name="check" className="premios-enviada__check-icon" />
      </span>

      <h2 className="premios-enviada__title">{L.title}</h2>
      {displayName ? <p className="premios-enviada__thanks">{L.thanks(displayName)}</p> : null}
      <p className="premios-enviada__lead">{L.body}</p>

      {/* LAS TRES GARANTÍAS, cada una en su ficha: qué pasa con tu papeleta, qué pasa con la de los demás y
          cuándo se sabrá. Es lo que la porra de origen decía aquí, y es donde se lee — no en la portada. */}
      <ul className="premios-enviada__cards">
        <li className="premios-enviada__card">
          <Icon name="lock" />
          <span>{L.cards.privacy}</span>
        </li>
        <li className="premios-enviada__card">
          <Icon name="person" />
          <span>{L.cards.oneVote}</span>
        </li>
        <li className="premios-enviada__card">
          <Icon name="trophy" />
          <span>{L.cards.results}</span>
        </li>
      </ul>

      <div className="premios-enviada__confirm">
        <p className="premios-enviada__confirm-title">{L.confirmTitle}</p>
        <p>{L.editHint(remainingOpportunities)}</p>
        <p className="premios-estado__muted">{L.resultsSoon}</p>
      </div>

      <div className="premios-estado__actions">
        {canEdit ? (
          <Link className="btn btn-primary" to={votePath(1)}>
            {L.edit}
          </Link>
        ) : null}
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
