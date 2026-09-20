import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import {
  deleteSeasonResult,
  listSeasonResults,
  renameSeasonResult,
} from '../../../model/repository/premios/premiosSeasonRepository';
import { resultsPath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosSeasonResult } from '../../../model/types/premios';

const L = PREMIOS_UI.admin.history;

/**
 * Las ediciones publicadas.
 *
 * DE UN ARCHIVO SOLO SE PUEDE CAMBIAR EL NOMBRE. Los ganadores y la clasificación son el resultado histórico y no
 * se pueden recalcular —los votos de esa edición se retiraron al publicarla—, así que tocarlos dejaría el archivo
 * incoherente.
 *
 * Y se puede BORRAR, que existe para las pruebas: publicar una edición de prueba deja un archivo permanente, y
 * sin esto el histórico se llena de «Test» que no se pueden quitar desde la aplicación.
 */
export function AdminPremiosHistorico({
  busy,
  ejecutar,
}: {
  busy: boolean;
  ejecutar: (accion: () => Promise<string>) => Promise<void>;
}) {
  const [seasons, setSeasons] = useState<Array<PremiosSeasonResult & { id: string }>>([]);

  const recargar = useCallback(async () => {
    setSeasons(await listSeasonResults().catch(() => []));
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const renombrar = (season: PremiosSeasonResult & { id: string }) => {
    const nombre = window.prompt(L.rename, season.name || season.id);
    if (nombre === null || !nombre.trim()) return;
    void ejecutar(async () => {
      await renameSeasonResult(season.id, nombre);
      await recargar();
      return L.renamed(nombre.trim());
    });
  };

  const borrar = (season: PremiosSeasonResult & { id: string }) => {
    const nombre = season.name || season.id;
    if (!window.confirm(L.removeConfirm(nombre))) return;
    void ejecutar(async () => {
      const result = await deleteSeasonResult(season.id);
      await recargar();
      // Si era la publicada, la pantalla pública pasa a enseñar otra: decirlo evita el susto de ver cambiar algo
      // que no se ha tocado.
      if (!result.wasPublished) return L.removed(nombre);
      return `${L.removed(nombre)} ${result.lastPublishedId ? L.repointed(result.lastPublishedId) : L.repointedEmpty}`;
    });
  };

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{L.hint}</p>

      {seasons.length === 0 ? <p>{L.empty}</p> : null}

      <ul className="premios-admin__cats">
        {seasons.map((season) => (
          <li key={season.id} className="premios-admin__cat">
            <div className="premios-admin__cat-head">
              <strong>{season.name || season.id}</strong>
              <span className="premios-admin__muted">
                {`${season.season} · ${L.ballots(season.totalBallots || 0)}`}
              </span>
              <span className="premios-admin__cat-actions">
                <Link className="btn" to={resultsPath(season.id)}>
                  {L.open}
                </Link>
                <button type="button" className="btn" disabled={busy} onClick={() => renombrar(season)}>
                  {L.rename}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => borrar(season)}>
                  {L.remove}
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
