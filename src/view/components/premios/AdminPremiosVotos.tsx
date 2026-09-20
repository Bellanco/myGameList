import { useEffect, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { computeLeaderboard } from '../../../core/premios/scoring';
import { fetchWinners } from '../../../model/repository/premios/premiosWinnersRepository';
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

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [live, winners] = await Promise.all([readLiveEdition(), fetchWinners(categories)]);
        if (!vivo) return;
        setBallots(live.ballots);
        setLeaderboard(computeLeaderboard(live.ballots, live.categories, winners));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [categories]);

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
                <span>{entry.nickname}</span>
                <span className="premios-admin__muted">{PREMIOS_UI.resultados.points(entry.points)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
