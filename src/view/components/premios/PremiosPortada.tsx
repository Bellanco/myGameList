import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { daysUntil } from '../../../core/premios/votingSchedule';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
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
        {votingOpen ? (
          <Link className="btn btn-primary" to={votePath(1)}>
            {hasBallot && canEdit ? L.edit : votedCount > 0 ? L.resume : L.start}
          </Link>
        ) : null}
        {hasResults ? (
          <Link className="btn" to={PREMIOS_ROUTES.results}>
            {L.seeResults}
          </Link>
        ) : null}
      </div>

      {!votingOpen && !hasResults ? (
        <p className="premios-portada__empty">
          {L.empty}
          <span>{L.emptyHint}</span>
        </p>
      ) : null}

      {votingOpen && total > 0 ? (
        <p className="premios-portada__progress">{`${votedCount} / ${total}`}</p>
      ) : null}

      <p className="premios-portada__foot">{L.oneVote}</p>
    </section>
  );
}
