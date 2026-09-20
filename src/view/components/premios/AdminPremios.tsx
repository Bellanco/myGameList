import { useCallback, useEffect, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { AdminPremiosCategorias } from './AdminPremiosCategorias';
import { todayInVotingZone, toVotingZoneDay } from '../../../core/premios/closingDate';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { SEASON_STAGE, getSeasonStage, validateClosingDay } from '../../../core/premios/votingSchedule';
import { loadAndSortCategories } from '../../../model/repository/premios/premiosCategoriesRepository';
import {
  closeSeasonNow,
  fetchVotingConfig,
  openSeason,
  publishAndArchiveSeason,
} from '../../../model/repository/premios/premiosSeasonRepository';
import type { PremiosCategory, PremiosVotingConfig } from '../../../model/types/premios';
import '../../../styles/premios.scss';

const L = PREMIOS_UI.admin;

/**
 * La administración de la porra, como UNA VISTA MÁS del panel de la aplicación.
 *
 * No hay un segundo `/admin` ni una segunda guarda: quien llega aquí ya ha pasado la de `AdminHub`, y por debajo
 * manda `isAdmin()` en las reglas, que es donde se cumple de verdad.
 *
 * DOS PESTAÑAS, y son las dos que hacen falta para tener una edición en marcha: el CICLO (abrir, cerrar,
 * publicar) y los NOMINADOS. Las demás cosas del panel de origen —el censo de votos, los ganadores y el
 * histórico— llegan después; sin estas dos no se puede ni empezar.
 */
export interface AdminPremiosProps {
  onBack: () => void;
}

export function AdminPremios({ onBack }: AdminPremiosProps) {
  const [tab, setTab] = useState<'season' | 'categories'>('season');
  const [config, setConfig] = useState<PremiosVotingConfig | null>(null);
  const [categories, setCategories] = useState<PremiosCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Formulario de apertura.
  const [name, setName] = useState('');
  const [closesDay, setClosesDay] = useState('');


  const recargar = useCallback(async () => {
    const [nextConfig, nextCategories] = await Promise.all([
      fetchVotingConfig(),
      loadAndSortCategories(true),
    ]);
    setConfig(nextConfig);
    setCategories(nextCategories);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const stage = useMemo(() => getSeasonStage(config), [config]);

  /** Envoltorio común: marca ocupado, traduce el fallo y recarga, que es lo que cambia lo que se ve. */
  const ejecutar = useCallback(
    async (accion: () => Promise<string>) => {
      setBusy(true);
      setError('');
      setNotice('');
      try {
        setNotice(await accion());
        await recargar();
      } catch (fallo) {
        setError(fallo instanceof Error ? fallo.message : String(fallo));
      } finally {
        setBusy(false);
      }
    },
    [recargar],
  );

  const abrir = () =>
    ejecutar(async () => {
      const hoy = todayInVotingZone();
      if (validateClosingDay(closesDay, hoy)) throw new Error(L.season.errorDay);
      const result = await openSeason({ name, closesDay, season: new Date().getFullYear() });
      const aviso = L.season.opened(result.name || String(new Date().getFullYear()));
      return result.leftovers > 0 ? `${aviso} ${L.season.leftovers(result.leftovers)}` : aviso;
    });

  const cerrar = () =>
    ejecutar(async () => {
      await closeSeasonNow();
      return L.season.closed;
    });

  const publicar = () =>
    ejecutar(async () => {
      const result = await publishAndArchiveSeason({
        season: Number(config?.season) || new Date().getFullYear(),
        seasonId: config?.seasonId,
        seasonName: config?.seasonName,
      });
      return L.season.published(result.name, result.totalBallots);
    });


  return (
    <section className="admin-hub premios-admin" aria-label={L.sectionAria}>
      <div className="admin-card">
        <h2>{L.title}</h2>

        <p className="admin-card-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            {L.back}
          </button>
          <button
            type="button"
            className={`btn${tab === 'season' ? ' btn-primary' : ''}`}
            onClick={() => setTab('season')}
          >
            {L.tabs.season}
          </button>
          <button
            type="button"
            className={`btn${tab === 'categories' ? ' btn-primary' : ''}`}
            onClick={() => setTab('categories')}
          >
            {L.tabs.categories}
          </button>
        </p>

        {notice ? <p className="premios-admin__notice">{notice}</p> : null}
        {error ? (
          <p className="premios-admin__error" role="alert">
            {error}
          </p>
        ) : null}

        {tab === 'season' ? (
          <div className="premios-admin__block">
            <h3>{L.season.title}</h3>
            <p className="premios-admin__stage">
              {stage === SEASON_STAGE.OPEN
                ? L.season.stageOpen
                : stage === SEASON_STAGE.PENDING
                  ? L.season.stagePending
                  : L.season.stageNone}
            </p>

            {config?.closesAt && stage !== SEASON_STAGE.NONE ? (
              <p className="premios-admin__muted">
                {`${getSeasonLabel({ name: config.seasonName, season: config.season })} · ${L.season.closesAt(
                  toVotingZoneDay(config.closesAt),
                )}`}
              </p>
            ) : null}

            {stage === SEASON_STAGE.NONE ? (
              <div className="premios-admin__form">
                <label htmlFor="premios-season-name">{L.season.nameLabel}</label>
                <input
                  id="premios-season-name"
                  className="input"
                  type="text"
                  value={name}
                  placeholder={L.season.namePlaceholder}
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="premios-admin__muted">{L.season.nameHint}</p>

                <label htmlFor="premios-season-closes">{L.season.closesLabel}</label>
                <input
                  id="premios-season-closes"
                  className="input"
                  type="date"
                  value={closesDay}
                  min={todayInVotingZone()}
                  onChange={(event) => setClosesDay(event.target.value)}
                />
                <p className="premios-admin__muted">{L.season.closesHint}</p>

                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void abrir()}>
                  {L.season.openAction}
                </button>
              </div>
            ) : null}

            {stage === SEASON_STAGE.OPEN ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void cerrar()}>
                {L.season.closeAction}
              </button>
            ) : null}

            {stage === SEASON_STAGE.PENDING ? (
              <div className="premios-admin__form">
                <p className="premios-admin__warn">{L.season.publishWarn}</p>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publicar()}>
                  {L.season.publishAction}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <AdminPremiosCategorias categories={categories} busy={busy} ejecutar={ejecutar} />
        )}
      </div>
    </section>
  );
}
