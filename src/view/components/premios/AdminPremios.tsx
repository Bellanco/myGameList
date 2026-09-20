import { useCallback, useEffect, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { HubBackButton } from '../socialhub/HubBackButton';
import { Icon } from '../Icon';
import { AdminPremiosCategorias } from './AdminPremiosCategorias';
import { AdminPremiosGanadores } from './AdminPremiosGanadores';
import { AdminPremiosHistorico } from './AdminPremiosHistorico';
import { AdminPremiosVotos } from './AdminPremiosVotos';
import { todayInVotingZone, toVotingZoneDay } from '../../../core/premios/closingDate';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { SEASON_STAGE, getSeasonStage, validateClosingDay } from '../../../core/premios/votingSchedule';
import { shouldOfferPremios } from '../../../core/premios/visibility';
import { loadAndSortCategories } from '../../../model/repository/premios/premiosCategoriesRepository';
import {
  closeSeasonNow,
  fetchVotingConfig,
  openSeason,
  publishAndArchiveSeason,
  setPremiosVisible,
  updateLiveSeason,
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
  const [tab, setTab] = useState<'season' | 'categories' | 'winners' | 'ballots' | 'history'>('season');
  const [config, setConfig] = useState<PremiosVotingConfig | null>(null);
  const [categories, setCategories] = useState<PremiosCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Formulario de apertura, que sirve también para corregir la edición en marcha.
  const [name, setName] = useState('');
  const [closesDay, setClosesDay] = useState('');
  const [editando, setEditando] = useState(false);


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


  /**
   * LAS CINCO PESTAÑAS, EN EL ORDEN EN QUE SE TOCAN: se abre la edición, se ponen los nominados, se marcan los
   * ganadores, se mira quién ha votado y al final se publica y queda en el histórico. Antes eran seis botones
   * sueltos en la misma fila que el de volver, sin distinguir lo que NAVEGA de lo que SALE, y en un móvil
   * quedaban en dos líneas de cajas iguales donde no se sabía cuál estaba activa.
   */
  const pestanas = [
    ['season', L.tabs.season],
    ['categories', L.tabs.categories],
    ['winners', L.winners.title],
    ['ballots', L.ballots.title],
    ['history', L.history.title],
  ] as const;

  return (
    <section className="admin-hub premios-admin" aria-label={L.sectionAria}>
      {/* EL VOLVER, ARRIBA Y SOLO, como en el resto de pantallas del panel (`AdminAnnouncement`,
          `AdminAchievements`): mismo componente, mismo sitio y misma flecha. */}
      <div className="admin-ann-bar">
        <HubBackButton onBack={onBack} label={L.back} />
      </div>

      <div className="admin-card">
        <h2>{L.title}</h2>

        <nav className="premios-admin__tabs" aria-label={L.tabsAria}>
          {pestanas.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className={`premios-admin__tab${tab === id ? ' is-current' : ''}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {rotulo}
            </button>
          ))}
        </nav>

        {notice ? <p className="premios-admin__notice">{notice}</p> : null}
        {error ? (
          <p className="premios-admin__error" role="alert">
            {error}
          </p>
        ) : null}

        {tab === 'season' ? (
          <div className="premios-admin__block">
            <h3>{L.season.title}</h3>
            {/* EL CICLO ENTERO, con el actual marcado. Antes esto era una frase suelta («Se está votando»), que
                dice dónde estás pero no qué hay ni qué viene después — y con tres estados, un interruptor de
                visibilidad que depende de ellos y un histórico de por medio, esa frase se quedaba corta. */}
            <ol className="premios-admin__stages" aria-label={L.season.stagesTitle}>
              {L.season.stages.map((momento) => {
                const actual = momento.id === stage;
                // EL PASO ABIERTO DICE LA FECHA DE VERDAD, no la regla general: con una edición en marcha, lo
                // que hace falta saber es cuándo se cierra ESTA, no a qué hora cierran todas.
                const detalle =
                  actual && momento.id === SEASON_STAGE.OPEN && config?.closesAt
                    ? L.season.closesAt(toVotingZoneDay(config.closesAt))
                    : momento.hint;
                return (
                  <li
                    key={momento.id}
                    className={`premios-admin__stage-step${actual ? ' is-current' : ''}`}
                    aria-current={actual ? 'step' : undefined}
                  >
                    <span className="premios-admin__stage-name">
                      {momento.label}
                      {actual ? <span className="premios-admin__stage-now">{L.season.stageCurrent}</span> : null}
                    </span>
                    <span className="premios-admin__stage-hint">{detalle}</span>
                  </li>
                );
              })}
            </ol>

            {/* EL RESUMEN, EN UNA LÍNEA Y CON SU ACCIÓN AL LADO: qué edición hay y cómo se llama. Antes esto
                eran cuatro párrafos sueltos —lo que pasa al publicar, si se ofrece, la última publicada y el
                nombre con su fecha— que había que leer enteros para sacar dos datos. */}
            {stage !== SEASON_STAGE.NONE ? (
              <div className="premios-admin__season-bar">
                <strong>{getSeasonLabel({ name: config?.seasonName, season: config?.season })}</strong>
                {stage === SEASON_STAGE.OPEN ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      if (!editando) {
                        setName(config?.seasonName || '');
                        setClosesDay(config?.closesAt ? toVotingZoneDay(config.closesAt) : '');
                      }
                      setEditando((abierto) => !abierto);
                    }}
                  >
                    <Icon name={editando ? 'close' : 'edit'} />
                    <span>{editando ? L.categories.cancel : L.season.edit}</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Corregir lo que hay: el mismo formulario que abre una edición, con los valores puestos. Cambia el
                nombre visible y el día de cierre; el identificador del archivo NO se toca (ver el repositorio). */}
            {editando && stage === SEASON_STAGE.OPEN ? (
              <div className="premios-admin__form">
                <label htmlFor="premios-season-edit-name">{L.season.nameLabel}</label>
                <input
                  id="premios-season-edit-name"
                  className="input"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <label htmlFor="premios-season-edit-closes">{L.season.closesLabel}</label>
                <input
                  id="premios-season-edit-closes"
                  className="input"
                  type="date"
                  value={closesDay}
                  min={todayInVotingZone()}
                  onChange={(event) => setClosesDay(event.target.value)}
                />
                <p className="premios-admin__muted">{L.season.closesHint}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void ejecutar(async () => {
                      if (validateClosingDay(closesDay, todayInVotingZone())) throw new Error(L.season.errorDay);
                      await updateLiveSeason({ name, closesDay });
                      setEditando(false);
                      return L.season.edited;
                    })
                  }
                >
                  {L.season.editSave}
                </button>
              </div>
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

            {/* DÓNDE SE VE LA SECCIÓN. Va con la temporada porque es la misma decisión: abrir una edición y
                enseñarla son dos gestos del mismo momento, y esconderla, el de después. */}
            <div className="premios-admin__form">
              <span className="premios-admin__label">{L.season.visibility}</span>
              <div className="premios-admin__weights" role="group" aria-label={L.season.visibility}>
                {([
                  [null, L.season.visibleAuto],
                  [true, L.season.visibleOn],
                  [false, L.season.visibleOff],
                ] as Array<[boolean | null, string]>).map(([valor, rotulo]) => (
                  <button
                    key={rotulo}
                    type="button"
                    className={`btn${(config?.visible ?? null) === valor ? ' btn-primary' : ''}`}
                    aria-pressed={(config?.visible ?? null) === valor}
                    disabled={busy}
                    onClick={() =>
                      void ejecutar(async () => {
                        await setPremiosVisible(valor);
                        return L.season.visibilitySaved;
                      })
                    }
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <p className="premios-admin__muted">{L.season.visibilityHint}</p>
              {/* Lo que de verdad está pasando ahora mismo con esas tres opciones, resuelto con la MISMA función
                  que lo decide en Ajustes y en el espacio social: aquí no se puede decir una cosa y hacerse
                  otra. Con la última publicada al lado, que es el otro dato de una línea. */}
              <p className="premios-admin__stage">
                {[
                  shouldOfferPremios(config) ? L.season.offeredYes : L.season.offeredNo,
                  config?.lastPublishedId ? L.season.lastPublished(config.lastPublishedId) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {stage === SEASON_STAGE.PENDING ? (
              <div className="premios-admin__form">
                <p className="premios-admin__warn">{L.season.publishWarn}</p>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publicar()}>
                  {L.season.publishAction}
                </button>
              </div>
            ) : null}
          </div>
        ) : tab === 'categories' ? (
          <AdminPremiosCategorias categories={categories} busy={busy} ejecutar={ejecutar} />
        ) : tab === 'winners' ? (
          <AdminPremiosGanadores categories={categories} busy={busy} ejecutar={ejecutar} />
        ) : tab === 'ballots' ? (
          // Se remonta con cada entrada a la pestaña —clave por pestaña— para que las papeletas sean las de
          // ahora y no las de cuando se abrió el panel.
          <AdminPremiosVotos key="ballots" categories={categories} />
        ) : (
          <AdminPremiosHistorico busy={busy} ejecutar={ejecutar} />
        )}
      </div>
    </section>
  );
}
