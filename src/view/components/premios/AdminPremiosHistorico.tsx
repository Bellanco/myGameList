import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { Icon } from '../Icon';
import {
  fetchPalmaresRecords,
  setSeasonPalmaresGranted,
  type PalmaresRecord,
} from '../../../model/repository/premios/premiosPalmaresRepository';
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
 * sin esto el histórico se llena de «Test» que no se pueden quitar desde la aplicación. Borrar se lleva también
 * el logro de esa edición de los perfiles que lo tuvieran (ver `deleteSeasonResult`).
 *
 * LO QUE SÍ SE DECIDE AQUÍ, Y AL FINAL DE LA FILA: si el logro de esa edición está puesto o no. Es la única cosa
 * del archivo que se puede ir y volver, porque no toca el resultado —quién ganó no cambia—, solo si sus premiados
 * lucen la medalla en su perfil. Un icono con dos estados y ninguna confirmación: es reversible con la misma
 * pulsada.
 */
export function AdminPremiosHistorico({
  busy,
  ejecutar,
}: {
  busy: boolean;
  ejecutar: (accion: () => Promise<string>) => Promise<void>;
}) {
  const [seasons, setSeasons] = useState<Array<PremiosSeasonResult & { id: string }>>([]);
  const [palmares, setPalmares] = useState<Record<string, PalmaresRecord>>({});

  const recargar = useCallback(async () => {
    const [archivos, registros] = await Promise.all([
      listSeasonResults().catch(() => []),
      fetchPalmaresRecords().catch(() => ({})),
    ]);
    setSeasons(archivos);
    setPalmares(registros);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /**
   * ¿Está puesto el logro de esta edición?
   *
   * SIN REGISTRO SE DA POR PUESTO, y no es un descuido: las ediciones publicadas antes de que existiera este
   * interruptor concedieron el trofeo siempre, así que lo honesto es enseñarlo encendido. El primer apagado deja
   * ya su registro, y a partir de ahí manda el dato.
   */
  const concedido = (seasonId: string) => palmares[seasonId]?.granted !== false;

  const renombrar = (season: PremiosSeasonResult & { id: string }) => {
    const nombre = window.prompt(L.rename, season.name || season.id);
    if (nombre === null || !nombre.trim()) return;
    void ejecutar(async () => {
      await renameSeasonResult(season.id, nombre);
      await recargar();
      return L.renamed(nombre.trim());
    });
  };

  const alternarLogro = (season: PremiosSeasonResult & { id: string }) => {
    const nombre = season.name || season.id;
    const dar = !concedido(season.id);
    void ejecutar(async () => {
      const cuantos = await setSeasonPalmaresGranted(season.id, nombre, dar);
      await recargar();
      if (cuantos === 0) return L.awardNone;
      return dar ? L.awardGranted(cuantos) : L.awardRevoked(cuantos);
    });
  };

  const borrar = (season: PremiosSeasonResult & { id: string }) => {
    const nombre = season.name || season.id;
    if (!window.confirm(L.removeConfirm(nombre))) return;
    void ejecutar(async () => {
      const result = await deleteSeasonResult(season.id);
      await recargar();
      // El logro se va con la edición: decirlo, porque es lo que se ve en los perfiles de otra gente.
      const conLogros = result.revoked > 0 ? ` ${L.removedAwards(result.revoked)}` : '';
      // Si era la publicada, la pantalla pública pasa a enseñar otra: decirlo evita el susto de ver cambiar algo
      // que no se ha tocado.
      if (!result.wasPublished) return `${L.removed(nombre)}${conLogros}`;
      const destino = result.lastPublishedId ? L.repointed(result.lastPublishedId) : L.repointedEmpty;
      return `${L.removed(nombre)}${conLogros} ${destino}`;
    });
  };

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{L.hint}</p>

      {seasons.length === 0 ? <p>{L.empty}</p> : null}

      <ul className="premios-admin__cats">
        {seasons.map((season) => {
          const nombre = season.name || season.id;
          const puesto = concedido(season.id);
          const rotulo = puesto ? L.awardOn(nombre) : L.awardOff(nombre);
          return (
            <li key={season.id} className="premios-admin__cat">
              <div className="premios-admin__cat-head">
                <strong>{nombre}</strong>
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
                  {/* AL FINAL DE TODO, y solo el icono: el trofeo dice de qué va y encendido o apagado dice cómo
                      está. Su nombre va en el `aria-label` y en el `title`, como los botones de mover de las
                      categorías. */}
                  <button
                    type="button"
                    className={`btn premios-admin__icon-btn premios-admin__award${puesto ? ' is-on' : ''}`}
                    aria-pressed={puesto}
                    aria-label={rotulo}
                    title={rotulo}
                    disabled={busy}
                    onClick={() => alternarLogro(season)}
                  >
                    <Icon name="trophy" />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
