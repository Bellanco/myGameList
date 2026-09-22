import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { daysUntil, getSeasonStage, SEASON_STAGE } from '../../../core/premios/votingSchedule';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import { PremiosCompartir } from './PremiosCompartir';
import { usePosicionSuperior } from './usePosicionSuperior';
import type { PremiosVotingConfig } from '../../../model/types/premios';

const L = PREMIOS_UI.portada;

export interface PremiosPortadaProps {
  config: PremiosVotingConfig | null;
  votingOpen: boolean;
  hasResults: boolean;
  /** ¿Ya votó esta cuenta? */
  hasBallot: boolean;
  canEdit: boolean;
  /** Cuántas categorías lleva votadas en el borrador. */
  votedCount: number;
  total: number;
  /** ¿Hay sesión de Google? Sin ella no se vota: se ofrece entrar aquí mismo. */
  signedIn: boolean;
  signingIn: boolean;
  signInError: string;
  onSignIn: () => void;
  /** Oportunidades totales de esta cuenta y las que le quedan. Solo tienen sentido con sesión. */
  opportunities: number;
  remainingOpportunities: number;
  /** ¿Tiene canal social? Si no, se dice qué se gana teniéndolo: es su única diferencia práctica aquí. */
  hasSocialAccount: boolean;
}

/**
 * La puerta de la sección: qué hay ahora mismo y qué se puede hacer.
 *
 * TIENE QUE FUNCIONAR SIN SESIÓN, porque el calendario es lo único que se lee en abierto: quien llegue por un
 * enlace en enero tiene que entender que aquí no hay nada en marcha en vez de encontrarse una pantalla vacía.
 */
export function PremiosPortada({
  config,
  votingOpen,
  hasResults,
  hasBallot,
  canEdit,
  votedCount,
  total,
  signedIn,
  signingIn,
  signInError,
  onSignIn,
  opportunities,
  remainingOpportunities,
  hasSocialAccount,
}: PremiosPortadaProps) {
  const dias = daysUntil(config?.closesAtMillis ?? null);
  const nombre = getSeasonLabel({ name: config?.seasonName, season: config?.season }) || PREMIOS_UI.eventName;

  /**
   * CERRADA Y ESPERANDO EL RESULTADO. Es un estado propio y no «aquí no hay nada»: hay una edición, ya votada, y
   * lo que se está haciendo es aguardar a que se publique. La portada lo contaba con el cartel de enero —«ahora
   * mismo no hay ninguna edición en marcha»— justo debajo del botón de ver los votos que acababas de emitir.
   */
  const esperando = getSeasonStage(config) === SEASON_STAGE.PENDING;

  // EL CARTEL SE CENTRA EN LO QUE QUEDA DE PANTALLA. Pegado al techo, con media pantalla vacía debajo, la
  // portada se leía como el principio de algo que no llega; centrado, es un cartel.
  const sectionRef = useRef<HTMLElement | null>(null);
  const top = usePosicionSuperior(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={`premios-portada${top === null ? '' : ' is-fitted'}`}
      aria-label={PREMIOS_UI.sectionAria}
      style={top === null ? undefined : ({ '--premios-top': `${top}px` } as React.CSSProperties)}
    >
      {/* EL CARTEL VA EN SU PROPIA CAJA y la sección es solo el sitio donde se centra. Con el fondo puesto en la
          sección, al darle el alto de la pantalla el cartel se estiraba de arriba abajo con el texto flotando en
          medio; separados, el cartel mide lo que mide y se queda en el centro. */}
      <div className="premios-portada__card">
      <h2 className="premios-portada__title">{nombre}</h2>
      <p className="premios-portada__lead">{esperando ? L.leadAwaiting : L.lead}</p>

      {votingOpen ? (
        <p className="premios-portada__state">
          <span className="premios-portada__badge">{L.openNow}</span>
          {dias !== null ? <span>{dias === 0 ? L.lastDay : L.daysLeft(dias)}</span> : null}
        </p>
      ) : esperando ? (
        <p className="premios-portada__state">
          <span className="premios-portada__badge is-waiting">{L.closed}</span>
        </p>
      ) : null}

      <div className="premios-portada__actions">
        {/* CON SESIÓN SE VOTA, SIN ELLA SE ENTRA, y en el mismo sitio: quien no ha entrado ve el botón de
            identificarse donde el resto ve el de votar, y al volver de Google se encuentra la portada como
            estaba, ya con su papeleta. Los RESULTADOS no dependen de esto: se ven sin cuenta. */}
        {/* SIN OPORTUNIDADES NO SE INVITA A VOTAR. Con la papeleta enviada y el cupo agotado, este botón seguía
            ahí diciendo «empezar a votar»: llevaba al formulario y al enviar lo rechazaban las reglas. Quien ya
            votó y no puede corregir solo tiene una cosa que hacer aquí, y es mirar lo que votó. */}
        {votingOpen && signedIn && (!hasBallot || canEdit) ? (
          <Link className="btn btn-primary" to={votePath(1)}>
            {hasBallot ? L.edit : votedCount > 0 ? L.resume : L.start}
          </Link>
        ) : null}
        {votingOpen && !signedIn ? (
          <button type="button" className="btn btn-primary" disabled={signingIn} onClick={onSignIn}>
            {signingIn ? L.signingIn : L.signIn}
          </button>
        ) : null}
        {/* LOS RESULTADOS NO SE OFRECEN MIENTRAS SE VOTA: lo único publicado es de otra edición, y un botón que
            dice «ver los resultados» al lado del de votar se lee como si fueran los de esta — que todavía no
            existen. Vuelve en cuanto se cierra el plazo. El enlace directo sigue funcionando para quien lo
            tenga. */}
        {/* REPASAR LO VOTADO, sin pasar por el formulario de envío: lleva a la papeleta en modo lectura. A TODO
            EL QUE VOTÓ, y no solo a quien tiene cuenta social como al principio: mirar no gasta oportunidad
            —la pantalla no lleva ni nombre ni botón de enviar—, y para quien votó con cuenta ligera es lo único
            que puede hacer aquí, además de lo último que queda de su papeleta antes de que se publique. */}
        {hasBallot ? (
          <Link className="btn" to={PREMIOS_ROUTES.ballot}>
            {PREMIOS_UI.enviada.see}
          </Link>
        ) : null}
        {hasResults && !votingOpen ? (
          <Link className="btn" to={PREMIOS_ROUTES.results}>
            {L.seeResults}
          </Link>
        ) : null}
      </div>

      {votingOpen && !signedIn && signInError ? (
        <p className="premios-portada__signin-error" role="alert">
          {signInError}
        </p>
      ) : null}

      {!votingOpen && !hasResults ? (
        <p className="premios-portada__empty">
          {esperando ? L.awaiting : L.empty}
          {esperando ? null : <span>{L.emptyHint}</span>}
        </p>
      ) : null}

      {/* EL BORRADOR EN MARCHA, con la misma barra que el flujo de votación: «12 / 27» solo dice un número, y la
          barra dice si vas por la mitad o por el final. Solo aparece cuando hay algo empezado. */}
      {votingOpen && total > 0 ? (
        <p className="premios-portada__progress">
          <span>{`${votedCount} / ${total}`}</span>
          <span className="premios-progress__track" aria-hidden="true">
            <span
              className="premios-progress__bar"
              style={{ width: `${Math.round((votedCount / total) * 100)}%` }}
            />
          </span>
        </p>
      ) : null}

      {votingOpen ? (
        <p className="premios-portada__quota">
          {signedIn ? (
            <>
              {hasBallot ? L.opportunitiesLeft(remainingOpportunities) : L.opportunities(opportunities)}
              {hasSocialAccount ? null : <span>{L.moreWithSocial}</span>}
            </>
          ) : (
            L.signInHint
          )}
        </p>
      ) : null}

      {/* CORRER LA VOZ, y por eso está en la portada y no dentro del flujo de voto: lo que se comparte es la
          invitación a votar, que sirve tanto a quien tiene cuenta como a quien va a crearla. Cuando no hay nada
          en marcha no se ofrece: un enlace a una pantalla vacía no invita a nada. */}
      {votingOpen || hasResults ? (
        <PremiosCompartir
          path={PREMIOS_ROUTES.home}
          title={PREMIOS_UI.compartir.inviteTitle(nombre)}
          text={PREMIOS_UI.compartir.inviteText}
        />
      ) : null}

        <p className="premios-portada__foot">{L.oneVote}</p>
      </div>
    </section>
  );
}
