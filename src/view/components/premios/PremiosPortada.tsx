import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { daysUntil } from '../../../core/premios/votingSchedule';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import { PremiosCompartir } from './PremiosCompartir';
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

  return (
    <section className="premios-portada" aria-label={PREMIOS_UI.sectionAria}>
      <h2 className="premios-portada__title">{nombre}</h2>
      <p className="premios-portada__lead">{L.lead}</p>

      {votingOpen ? (
        <p className="premios-portada__state">
          <span className="premios-portada__badge">{L.openNow}</span>
          {dias !== null ? <span>{dias === 0 ? L.lastDay : L.daysLeft(dias)}</span> : null}
        </p>
      ) : null}

      <div className="premios-portada__actions">
        {/* CON SESIÓN SE VOTA, SIN ELLA SE ENTRA, y en el mismo sitio: quien no ha entrado ve el botón de
            identificarse donde el resto ve el de votar, y al volver de Google se encuentra la portada como
            estaba, ya con su papeleta. Los RESULTADOS no dependen de esto: se ven sin cuenta. */}
        {votingOpen && signedIn ? (
          <Link className="btn btn-primary" to={votePath(1)}>
            {hasBallot && canEdit ? L.edit : votedCount > 0 ? L.resume : L.start}
          </Link>
        ) : null}
        {votingOpen && !signedIn ? (
          <button type="button" className="btn btn-primary" disabled={signingIn} onClick={onSignIn}>
            {signingIn ? L.signingIn : L.signIn}
          </button>
        ) : null}
        {hasResults ? (
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
          {L.empty}
          <span>{L.emptyHint}</span>
        </p>
      ) : null}

      {votingOpen && total > 0 ? (
        <p className="premios-portada__progress">{`${votedCount} / ${total}`}</p>
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
    </section>
  );
}
