import { useCallback, useEffect, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { computeLeaderboard } from '../../../core/premios/scoring';
import { deleteBallot } from '../../../model/repository/premios/premiosBallotRepository';
import { fetchWinners } from '../../../model/repository/premios/premiosWinnersRepository';
import { Icon } from '../Icon';
import { readLiveEdition } from '../../../model/repository/premios/premiosSeasonRepository';
import type { PremiosBallot, PremiosCategory, PremiosLeaderboardEntry } from '../../../model/types/premios';

const L = PREMIOS_UI.admin.ballots;

/**
 * Las papeletas de la edición en curso y la clasificación que saldría si se publicara ahora.
 *
 * SE LEE DE FIRESTORE, no del estado del panel, y por el mismo motivo que `readLiveEdition`: lo que se enseña
 * aquí tiene que ser lo que hay, no lo que había cuando se abrió la pestaña.
 *
 * La clasificación es PROVISIONAL a propósito: se calcula con los ganadores marcados hasta ahora, así que sirve
 * para comprobar antes de publicar que lo que va a salir es lo que se espera.
 */
export function AdminPremiosVotos({ categories }: { categories: PremiosCategory[] }) {
  const [ballots, setBallots] = useState<PremiosBallot[]>([]);
  const [leaderboard, setLeaderboard] = useState<PremiosLeaderboardEntry[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState('');

  const cargar = useCallback(async () => {
    const [live, winners] = await Promise.all([readLiveEdition(), fetchWinners(categories)]);
    setBallots(live.ballots);
    setLeaderboard(computeLeaderboard(live.ballots, live.categories, winners));
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

  /**
   * RETIRAR LA PAPELETA DE ALGUIEN. Se pregunta antes por su nombre y no se puede deshacer: el voto no está
   * guardado en ningún otro sitio. Al terminar se vuelve a leer la edición, porque lo que cambia no es solo esa
   * fila — la clasificación entera se recalcula sin ella.
   */
  const retirar = useCallback(
    async (entry: PremiosLeaderboardEntry) => {
      if (!window.confirm(L.removeConfirm(entry.nickname))) return;
      setBorrando(entry.userId);
      try {
        await deleteBallot(entry.userId);
        await cargar();
      } finally {
        setBorrando('');
      }
    },
    [cargar],
  );

  const total = categories.filter((category) => (category.options?.length || 0) > 0).length;

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{L.hint}</p>

      {cargando ? null : ballots.length === 0 ? (
        <p>{L.none}</p>
      ) : (
        <>
          <p className="premios-admin__stage">{L.total(ballots.length)}</p>

          <ul className="premios-admin__cats">
            {ballots.map((ballot) => (
              <li key={ballot.userId} className="premios-admin__cat">
                <div className="premios-admin__cat-head">
                  <strong>{ballot.userDisplayName || ballot.userNickname || ballot.userId}</strong>
                  <span className="premios-admin__muted">
                    {`${L.voted(Object.keys(ballot.selections || {}).length, total)} · ${L.edits(ballot.editCount || 0)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <h3>{L.preview}</h3>
          <p className="premios-admin__muted">{L.previewHint}</p>
          <ol className="premios-admin__board">
            {leaderboard.map((entry) => (
              <li key={entry.userId}>
                <span className="premios-admin__rank">{entry.rank}</span>
                <span className="premios-admin__board-name">{entry.nickname}</span>
                <span className="premios-admin__muted">{PREMIOS_UI.resultados.points(entry.points)}</span>
                <button
                  type="button"
                  className="btn btn-danger premios-admin__icon-btn"
                  aria-label={L.remove(entry.nickname)}
                  title={L.remove(entry.nickname)}
                  disabled={borrando === entry.userId}
                  onClick={() => void retirar(entry)}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
