import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { HubBackButton } from '../socialhub/HubBackButton';
import { Icon } from '../Icon';
import { AdminPremiosCategorias } from './AdminPremiosCategorias';
import { AdminPremiosGanadores } from './AdminPremiosGanadores';
import { AdminPremiosHistorico } from './AdminPremiosHistorico';
import { AdminPremiosVotos } from './AdminPremiosVotos';
import { todayInVotingZone, toVotingZoneDay } from '../../../core/premios/closingDate';
import { getCategoryTitle } from '../../../core/premios/localize';
import { getSeasonLabel } from '../../../core/premios/seasonId';
import { SEASON_STAGE, getSeasonStage, validateClosingDay } from '../../../core/premios/votingSchedule';
import {
  archivableCategories,
  categoriesMissingWinner,
  isArchivableCategory,
} from '../../../core/premios/archivable';
import { shouldOfferPremios } from '../../../core/premios/visibility';
import { loadAndSortCategories } from '../../../model/repository/premios/premiosCategoriesRepository';
import { fetchWinners } from '../../../model/repository/premios/premiosWinnersRepository';
import {
  loadPremiosSnapshot,
  savePremiosSnapshot,
  snapshotFromConfig,
} from '../../../model/repository/premiosVisibilityRepository';
import { samePremiosSnapshot, type PremiosVisibilitySnapshot } from '../../../core/premios/visibilitySnapshot';
import {
  closeSeasonNow,
  fetchVotingConfig,
  openSeason,
  publishAndArchiveSeason,
  setPremiosVisible,
  updateLiveSeason,
} from '../../../model/repository/premios/premiosSeasonRepository';
import type { PremiosCategory, PremiosVotingConfig, PremiosWinnersMap } from '../../../model/types/premios';
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
  /** Los ganadores marcados hasta ahora: son los que deciden si se puede publicar. */
  const [winners, setWinners] = useState<PremiosWinnersMap>({});
  /**
   * LA FOTO QUE ESTÁ PUBLICADA en `/api/premios`, para no reescribir KV en cada apertura del panel.
   *
   * El menú de Ajustes de TODO EL MUNDO lee esa foto y no Firestore (ver `premiosVisibilityRepository`), así que
   * cada cambio del calendario tiene que republicarla o la entrada se quedaría diciendo lo de ayer.
   */
  const publicado = useRef<PremiosVisibilitySnapshot | null>(null);
  /** ¿Ha terminado ya la primera lectura? Sin esto, el bloqueo de abrir saltaría con la pantalla aún vacía. */
  const [cargado, setCargado] = useState(false);
  /** ¿Se está preguntando si abrir con categorías a medias? */
  const [pidiendoAbrir, setPidiendoAbrir] = useState(false);
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
    // Los ganadores se leen aquí y no solo en su pestaña: de ellos depende que se pueda publicar, que es la
    // acción irreversible de esta pantalla.
    setWinners(await fetchWinners(nextCategories).catch(() => ({})));
    setCargado(true);

    // Y SE REPUBLICA LA FOTO si ha cambiado algo del calendario. Es lo que hace que la entrada aparezca o se
    // retire para quien no ha iniciado sesión, que es casi todo el mundo. Si falla no se interrumpe nada: el
    // panel ya ha guardado lo suyo en Firestore y esto se reintenta al siguiente cambio.
    const foto = snapshotFromConfig(nextConfig);
    if (publicado.current === null) {
      publicado.current = await loadPremiosSnapshot(true).catch(() => null);
    }
    if (!samePremiosSnapshot(foto, publicado.current)) {
      publicado.current = await savePremiosSnapshot(foto).catch(() => publicado.current);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const stage = useMemo(() => getSeasonStage(config), [config]);
  /**
   * Las que van a archivarse, que son las únicas que pueden tener ganador. El criterio es el de `archivable`,
   * el mismo que aplica `readLiveEdition` al publicar: si aquí se contara alguna que allí se descarta —una sin
   * título, un placeholder con nominados— se pediría un ganador que no serviría para nada y no habría forma de
   * publicar nunca.
   */
  const votables = useMemo(() => archivableCategories(categories).length, [categories]);

  /**
   * LAS QUE FALTAN POR MARCAR. Mientras quede una, no se publica: la clasificación sale de cruzar cada voto con
   * el ganador de su categoría, así que una categoría con nominados y sin ganador archiva esos votos sin puntos
   * — y al publicar se retiran las papeletas, con lo que ya no hay con qué rehacerla.
   *
   * Un ganador cuyo nominado ya no exista NO cuenta: ver `categoriesMissingWinner`.
   */
  const faltanGanadores = useMemo(
    () => categoriesMissingWinner(categories, winners).length,
    [categories, winners],
  );

  /**
   * LAS QUE ESTÁN A MEDIAS: existen como categoría —tienen título o nominados— pero no llegan a votables. Con una
   * así, quien entre a votar se encuentra una categoría sin nada que elegir y no puede completar la papeleta, que
   * se envía entera. Los placeholders no cuentan: son el documento vacío que queda al borrar la última, no una
   * categoría a medio hacer.
   */
  const incompletas = useMemo(
    () => categories.filter((category) => !category.isPlaceholder && !isArchivableCategory(category)),
    [categories],
  );

  const nombresIncompletos = useMemo(
    () => incompletas.map((category) => getCategoryTitle(category) || L.categories.newTitle),
    [incompletas],
  );

  /**
   * SE ABRE CON UNA CATEGORÍA LISTA, AUNQUE OTRAS SE QUEDEN A MEDIAS. Las categorías se conservan de un año para
   * otro y no todas se reparten siempre, así que una sin nominados es muchas veces una decisión, no un olvido:
   * se avisa (arriba, y otra vez al pulsar) y decide quien administra. Lo que no tiene sentido es abrir sin
   * NINGUNA: sería una votación sin nada que votar, y eso sí se impide.
   */
  /**
   * LO QUE HACE FALTA PARA ABRIR: nombre, día de cierre y al menos una categoría lista.
   *
   * El nombre ya no es opcional. Lo era —sin él se usaba el año— y con eso el identificador del archivo salía a
   * suerte: dos ediciones del mismo año chocaban, y en el histórico quedaba «2026» sin decir de qué. Que falte
   * se ve solo, con los dos campos vacíos justo encima del botón apagado, así que no lleva aviso.
   *
   * Las categorías a medias NO cuentan aquí: esas avisan y dejan seguir (`pedirAbrir`).
   */
  const puedeAbrir = cargado && votables > 0 && Boolean(name.trim()) && Boolean(closesDay);

  /** ¿Se está ofreciendo la entrada ahora mismo? Con la MISMA función que lo decide en Ajustes y en lo social. */
  const seOfrece = useMemo(() => shouldOfferPremios(config), [config]);

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

  /**
   * EL ÚLTIMO AVISO, con el dedo ya en el botón: abrir retira las papeletas sueltas y arranca el plazo. Va en el
   * diálogo de la casa (`<dialog>` nativo, con su foco atrapado y su Esc) y no en el `confirm()` del navegador,
   * que se pinta fuera de la aplicación, con la dirección del sitio de cabecera y sin una sola de sus formas.
   */
  const pedirAbrir = () => {
    if (nombresIncompletos.length > 0) setPidiendoAbrir(true);
    else void abrir();
  };

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

                {/* LO QUE FALTA PARA PODER ABRIR, con nombre y apellidos. Una categoría sin nominados no se puede
                    votar ni se archiva: abrir con ella dentro es empezar una edición rota, y el aviso genérico
                    («faltan categorías») obligaba a repasar veintiséis a mano para dar con la que era. */}
                {cargado && votables === 0 ? (
                  <p className="premios-admin__warn" id="premios-open-blocked">
                    {L.season.openNoCategories}
                  </p>
                ) : nombresIncompletos.length > 0 ? (
                  <p className="premios-admin__warn">{L.season.openIncomplete(nombresIncompletos)}</p>
                ) : null}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !puedeAbrir}
                  aria-describedby={cargado && !puedeAbrir ? 'premios-open-blocked' : undefined}
                  onClick={pedirAbrir}
                >
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
              {/* DOS ESTADOS, no tres: se dice sí o no. El tercero era «según el calendario» y se leía como una
                  opción cuando era la ausencia de decisión — con él puesto, nadie sabía mirando el panel si la
                  entrada estaba o no. Lo que el calendario aportaba (cuándo deja de tener sentido enseñarla) se
                  dice ahora con su fecha, debajo. */}
              <div className="premios-admin__weights" role="group" aria-label={L.season.visibility}>
                {([
                  [true, L.season.visibleOn],
                  [false, L.season.visibleOff],
                ] as Array<[boolean, string]>).map(([valor, rotulo]) => (
                  <button
                    key={rotulo}
                    type="button"
                    className={`btn${seOfrece === valor ? ' btn-primary' : ''}`}
                    aria-pressed={seOfrece === valor}
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

              {/* DÓNDE aparece, y nada más. Aquí hubo también hasta cuándo convenía dejarla y qué se encontraría
                  quien entrase: son cosas que ya se leen en el ciclo de arriba, y repetidas debajo del
                  interruptor lo que hacían era tapar la única pregunta que este bloque responde. */}
              <p className="premios-admin__muted">{L.season.visibilityHint}</p>
            </div>

            {stage === SEASON_STAGE.PENDING ? (
              <div className="premios-admin__form">
                {/* SI FALTAN GANADORES, NO SE PUBLICA: se dice cuántos faltan y el botón queda inerte. Esto era
                    un aviso que se podía ignorar de un clic, y era el único error de la pantalla sin arreglo
                    posible — al publicar se retiran las papeletas, así que la clasificación ya no se rehace. */}
                {faltanGanadores > 0 ? (
                  <p className="premios-admin__warn" id="premios-publish-blocked">
                    {L.season.publishBlocked(faltanGanadores, votables)}
                  </p>
                ) : (
                  <>
                    {votables === 0 ? (
                      <p className="premios-admin__warn">{L.season.publishNoCategories}</p>
                    ) : null}
                    {/* Lo irreversible solo se cuenta cuando se puede hacer: encima de un botón apagado sería
                        ruido delante del motivo por el que está apagado. */}
                    <p className="premios-admin__warn">{L.season.publishWarn}</p>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || faltanGanadores > 0}
                  aria-describedby={faltanGanadores > 0 ? 'premios-publish-blocked' : undefined}
                  onClick={() => void publicar()}
                >
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

      <ConfirmModal
        open={pidiendoAbrir}
        title={L.season.openConfirmTitle}
        body={L.season.openIncomplete(nombresIncompletos)}
        confirmLabel={L.season.openAction}
        tone="primary"
        onCancel={() => setPidiendoAbrir(false)}
        onConfirm={() => {
          setPidiendoAbrir(false);
          void abrir();
        }}
      />
    </section>
  );
}
