import { useCallback, useEffect, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { liveEditionRows, type LiveRevealedRow } from '../../../core/premios/revealedVotes';
import { SEASON_STAGE, type SeasonStage } from '../../../core/premios/votingSchedule';
import { deleteBallot } from '../../../model/repository/premios/premiosBallotRepository';
import { fetchWinners } from '../../../model/repository/premios/premiosWinnersRepository';
import { Icon } from '../Icon';
import { PremiosFinalBoard } from './PremiosFinalBoard';
import { readLiveEdition } from '../../../model/repository/premios/premiosSeasonRepository';
import type { PremiosBallot, PremiosCategory, PremiosWinnersMap } from '../../../model/types/premios';

const L = PREMIOS_UI.admin.ballots;

/**
 * Las papeletas de la edición en curso, con la MISMA clasificación que verán quienes votaron al publicarla
 * (`PremiosFinalBoard`): una fila por persona y, al desplegarla, lo que votó en cada categoría.
 *
 * SE LEE DE FIRESTORE, no del estado del panel, y por el mismo motivo que `readLiveEdition`: lo que se enseña
 * aquí tiene que ser lo que hay, no lo que había cuando se abrió la pestaña.
 *
 * DOS MOMENTOS, decididos por el estado de la edición (decisión del 07-10-2026):
 *  - **Votación abierta:** por orden de voto, sin puestos ni puntos. Todavía no hay ganadores contra los que contar.
 *  - **Cerrada sin publicar:** la clasificación PROVISIONAL, con los ganadores marcados hasta ahora. Sirve para
 *    comprobar antes de publicar que lo que va a salir es lo que se espera.
 */
export function AdminPremiosVotos({ categories, stage }: { categories: PremiosCategory[]; stage: SeasonStage }) {
  const [ballots, setBallots] = useState<PremiosBallot[]>([]);
  /**
   * Las categorías TAL Y COMO VAN A ARCHIVARSE, no las del panel: son las que se leen con las papeletas, en el
   * mismo viaje, así que lo que se enseña de cada voto no puede desfasarse de aquello contra lo que se cuenta.
   */
  const [archivables, setArchivables] = useState<PremiosCategory[]>([]);
  /** Los ganadores marcados hasta ahora: con ellos se cuenta la clasificación provisional. */
  const [winners, setWinners] = useState<PremiosWinnersMap>({});
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState('');
  const scored = stage !== SEASON_STAGE.OPEN;

  const cargar = useCallback(async () => {
    const [live, marcados] = await Promise.all([readLiveEdition(), fetchWinners(categories)]);
    setBallots(live.ballots);
    setArchivables(live.categories);
    setWinners(marcados);
  }, [categories]);

  useEffect(() => {
    let vivo = true;
    void cargar()
      .catch(() => {
        // Sin papeletas legibles la pantalla se queda vacía y lo dice; no hay nada que reintentar aquí.
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [cargar]);

  const filas = useMemo(
    () => liveEditionRows(ballots, archivables, winners, { scored }),
    [ballots, archivables, winners, scored],
  );

  /**
   * RETIRAR LA PAPELETA DE ALGUIEN. Se pregunta antes por su nombre y no se puede deshacer: el voto no está
   * guardado en ningún otro sitio. Al terminar se vuelve a leer la edición, porque lo que cambia no es solo esa
   * fila — la clasificación entera se recalcula sin ella.
   */
  const retirar = useCallback(
    async (userId: string, nombre: string) => {
      if (!window.confirm(L.removeConfirm(nombre))) return;
      setBorrando(userId);
      try {
        await deleteBallot(userId);
        await cargar();
      } finally {
        setBorrando('');
      }
    },
    [cargar],
  );

  const total = archivables.length;

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{scored ? L.previewHint : L.openHint}</p>

      {cargando ? null : ballots.length === 0 ? (
        <p>{L.none}</p>
      ) : (
        <>
          <p className="premios-admin__stage">{L.total(ballots.length)}</p>

          <PremiosFinalBoard
            rows={filas}
            title={scored ? L.preview : L.byVoteOrder}
            scored={scored}
            idPrefix="premios-admin-votos"
            renderAside={(row) => {
              const { ballot, entry } = row as LiveRevealedRow;
              return (
                <>
                  <span className="premios-admin__muted">
                    {`${L.voted(Object.keys(ballot.selections || {}).length, total)} · ${L.edits(ballot.editCount || 0)}`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger premios-admin__icon-btn"
                    aria-label={L.remove(entry.nickname)}
                    title={L.remove(entry.nickname)}
                    disabled={borrando === ballot.userId}
                    onClick={() => void retirar(ballot.userId, entry.nickname)}
                  >
                    <Icon name="trash" />
                  </button>
                </>
              );
            }}
          />
        </>
      )}
    </div>
  );
}
