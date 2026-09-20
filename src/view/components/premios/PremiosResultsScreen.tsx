import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { hasAward } from '../../../core/premios/awards';
import { getOptionLabel, tField } from '../../../core/premios/localize';
import { PREMIOS_ROUTES, resultsPath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosArchivedEntry, PremiosSeasonResult } from '../../../model/types/premios';
import { Icon } from '../Icon';
import { PremiosCompartir } from './PremiosCompartir';
import { HubBackButton } from '../socialhub/HubBackButton';

// La lámina va aparte y perezosa: son 240 kB de arte y una tipografía que solo necesita quien ha ganado algo.
const AwardDialog = lazy(() => import('./AwardDialog').then((m) => ({ default: m.AwardDialog })));

const L = PREMIOS_UI.resultados;

/**
 * El metal de los tres primeros puestos. Son las MISMAS clases que visten los rangos del perfil
 * (`_tiers.scss`), así que el oro de un primer puesto y el de una cuenta de oro son el mismo oro, y cada tema
 * puede matizarlos en un solo sitio. Del cuarto en adelante, sin metal: el disco se queda en el color del texto
 * atenuado.
 */
const METAL = ['tier-gold', 'tier-silver', 'tier-bronze'] as const;

/** Puestos que suben al podio. Tres, como en cualquier podio: el cuarto ya es lista. */
const PODIUM_RANKS = 3;

/** Un escalón del podio: el puesto y quienes lo comparten (un empate no parte el escalón en dos). */
interface PodiumStep {
  rank: number;
  entries: PremiosArchivedEntry[];
}

export interface PremiosResultsScreenProps {
  result: PremiosSeasonResult | null;
  leaderboard: PremiosArchivedEntry[];
  /** Pseudónimo de quien mira, para reconocer su fila. Vacío si no tiene perfil o no hay sesión. */
  ownProfileId: string;
  /** Pseudónimo → uid, para los que tienen perfil social: su fila lleva a su ficha. */
  profiles?: Map<string, string>;
}

/**
 * Ganadores y clasificación de una edición publicada.
 *
 * EMPIEZA POR EL PODIO, que es lo que se viene a mirar. Antes la pantalla abría con veintiséis fichas de
 * categoría y una lista de catorce renglones iguales, donde el que ganó la porra pesaba lo mismo que el
 * decimotercero y solo se distinguía por el color de un disco de dos centímetros. Los tres primeros puestos
 * suben arriba, con su metal y su puntuación en grande, y la lista sigue desde el cuarto: no se repite a nadie.
 *
 * UN ESCALÓN POR PUESTO, no por persona. Los empatados comparten escalón —ese es el sentido del puesto denso—,
 * así que un podio puede tener dos nombres en el segundo y ninguno perdido en una fila suelta.
 *
 * DOS COLUMNAS EN PANTALLA ANCHA, como en la porra de origen: los GANADORES por categoría a un lado y la
 * PUNTUACIÓN al otro. Apilados obligaban a recorrer veintisiete categorías antes de llegar a la clasificación,
 * que es justo lo que la mayoría viene a mirar. Por debajo de la anchura de dos columnas se apilan, ganadores
 * primero, que es el orden con el que se cuenta una edición.
 *
 * ES LA ÚNICA PANTALLA PÚBLICA de la sección: se abre con el enlace, sin cuenta. Por eso el archivo del que se
 * alimenta no lleva identificadores reales ni fotos (ver `docs/plan-unificar-premios.md` §4.1) y aquí la fila
 * propia se reconoce por el PSEUDÓNIMO, que es un dato público que no dice quién eres fuera de esta app.
 *
 * Los cinco primeros PUESTOS van marcados. Puesto, no posición: con dos primeros, quien les sigue es segundo, así
 * que puede haber más de cinco personas marcadas y nunca más de cinco puestos distintos.
 */
export function PremiosResultsScreen({ result, leaderboard, ownProfileId, profiles }: PremiosResultsScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Por qué premiado se abre la galería; `null` = cerrada. La lámina solo se ofrece CON SESIÓN: en la página
  // pública va la medalla.
  const [galeria, setGaleria] = useState<number | null>(null);

  /** Los premiados de la edición, en orden: es lo que recorre la galería. */
  const premiados = useMemo(() => leaderboard.filter((entry) => hasAward(entry.rank)), [leaderboard]);

  /**
   * VOLVER A DONDE SE VINO. Aquí se llega desde tres sitios —la portada de la sección, el histórico del panel y
   * un enlace compartido—, así que el botón deshace el paso en vez de llevar siempre al mismo destino. Solo
   * cuando esta es la PRIMERA pantalla de la visita (un enlace abierto en frío, sin historia detrás) se cae a
   * la portada, que es lo único que tiene sentido ofrecer ahí.
   */
  const volver = () => {
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate(PREMIOS_ROUTES.home);
  };

  // La fila propia, si quien mira está en esta clasificación y se llevó algo. Va arriba del todo: si te ha
  // tocado, es lo primero que has venido a ver.
  const propio = useMemo(
    () => (ownProfileId ? premiados.findIndex((entry) => entry.profileId === ownProfileId) : -1),
    [premiados, ownProfileId],
  );

  /** Los tres primeros PUESTOS, agrupados: los empatados comparten escalón en vez de repetirlo. */
  const podio = useMemo<PodiumStep[]>(() => {
    const porPuesto = new Map<number, PremiosArchivedEntry[]>();
    for (const entry of leaderboard) {
      if (!Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > PODIUM_RANKS) continue;
      const iguales = porPuesto.get(entry.rank);
      if (iguales) iguales.push(entry);
      else porPuesto.set(entry.rank, [entry]);
    }
    return [...porPuesto.entries()].sort(([a], [b]) => a - b).map(([rank, entries]) => ({ rank, entries }));
  }, [leaderboard]);

  /** Del cuarto en adelante. Lo que ya está en el podio no se repite debajo. */
  const resto = useMemo(() => leaderboard.filter((entry) => entry.rank > PODIUM_RANKS), [leaderboard]);

  if (!result) {
    return (
      <section className="premios-estado" aria-label={L.sectionAria}>
        <h2>{L.title}</h2>
        <p>{L.empty}</p>
      </section>
    );
  }

  const ganadores = (result.categoriesSnapshot || []).filter((category) => category.winner);

  /**
   * EL TITULAR DE LA EDICIÓN: la categoría que más pesaba, si hay UNA sola que pese más que las demás («Juego
   * del año» vale 3 y el resto 1). Sale del peso archivado y no de su nombre: el rótulo se escribe a mano cada
   * año y en inglés, y una comparación de cadenas se rompería el día que alguien lo tilde distinto. Si todas
   * pesan igual, no hay titular y las veintiséis van a la rejilla, que es lo honesto.
   */
  const pesoMayor = ganadores.reduce((mayor, category) => Math.max(mayor, category.weight || 1), 1);
  const conPesoMayor = ganadores.filter((category) => (category.weight || 1) === pesoMayor);
  const titular = pesoMayor > 1 && conPesoMayor.length === 1 ? conPesoMayor[0] : null;
  const restoGanadores = titular ? ganadores.filter((category) => category !== titular) : ganadores;

  /** El nombre del ganador de una categoría, resuelto contra sus nominados archivados. */
  const ganadorDe = (category: (typeof ganadores)[number]) =>
    getOptionLabel({ id: category.id, title: category.title, options: category.options }, category.winner || '');

  /** El nombre de alguien: enlace a su ficha si tiene perfil visible, y texto si no. */
  const nombreDe = (entry: PremiosArchivedEntry, className: string) => {
    const uid = profiles?.get(entry.profileId);
    return uid ? (
      <Link
        key={`${entry.profileId}-${entry.nickname}`}
        className={`${className} premios-results__link`}
        to={`/social/profiles/${encodeURIComponent(uid)}`}
        aria-label={L.avatarAria(entry.nickname)}
      >
        {entry.nickname}
      </Link>
    ) : (
      <span key={`${entry.profileId}-${entry.nickname}`} className={className}>
        {entry.nickname}
      </span>
    );
  };

  const esPropia = (entry: PremiosArchivedEntry) => Boolean(ownProfileId) && entry.profileId === ownProfileId;

  return (
    <section className="premios-results" aria-label={L.sectionAria}>
      {/* Volver y compartir, en la misma barra y a los lados. Compartir estaba centrado debajo del título, con su
          rótulo largo, y era la pieza más grande de la cabecera: el nombre de la edición competía con un botón.
          El enlace que se comparte es el de ESTA edición, con su identificador, y no el de «la última
          publicada»: quien lo abra dentro de un año tiene que ver los resultados de los que se le hablaba. Se
          ven sin cuenta, así que llega a cualquiera. */}
      <div className="premios-results__back">
        <HubBackButton onBack={volver} label={L.back} />
        <PremiosCompartir
          path={resultsPath(result.seasonId)}
          title={PREMIOS_UI.compartir.resultsTitle(result.name || result.seasonId)}
          text={PREMIOS_UI.compartir.resultsText}
        />
      </div>

      <header className="premios-results__head">
        <h2>{result.name || L.title}</h2>
        <p className="premios-results__count">{L.ballots(result.totalBallots || 0)}</p>
      </header>

      {/* EL PODIO. Lo primero y en grande, porque es la respuesta a la pregunta con la que se entra: quién ha
          ganado. Un escalón por PUESTO —los empatados juntos— y el metal de cada uno con las clases de rango de
          la casa, así que el oro de aquí es el mismo oro de todo lo demás. */}
      {podio.length > 0 ? (
        <ol className="premios-results__podium" aria-label={L.podium}>
          {podio.map(({ rank, entries }) => {
            // Los empatados tienen, por definición del puesto denso, los mismos puntos: se dicen una vez.
            const puntos = entries[0]?.points || 0;
            const mio = entries.some(esPropia);
            const destino = entries.find(esPropia) || entries[0];
            return (
              <li
                key={rank}
                className={`premios-results__step is-rank-${rank}${mio ? ' is-own' : ''}`}
                aria-label={mio ? L.yourRow : undefined}
              >
                <span className={`premios-results__medal ${METAL[rank - 1] || ''}`}>
                  <span className="sr-only">{L.positionAria(rank)}</span>
                  <span aria-hidden="true">{rank}</span>
                </span>

                <div className="premios-results__step-who">
                  <span className="premios-results__step-names">
                    {entries.map((entry) => nombreDe(entry, 'premios-results__step-name'))}
                  </span>
                  {entries.length > 1 ? <span className="premios-results__tie">{L.tie}</span> : null}
                </div>

                <p className="premios-results__step-points">
                  <span className="sr-only">{L.points(puntos)}</span>
                  <strong aria-hidden="true">{L.pointsShort(puntos)}</strong>
                  <span aria-hidden="true">{L.pointsUnit}</span>
                </p>

                {/* La lámina, solo con sesión: el arte no se enseña en abierto (ver `AwardDialog`). */}
                {ownProfileId && premiados.includes(destino) ? (
                  <button
                    type="button"
                    className="btn premios-results__step-trophy"
                    aria-label={mio ? L.trophy : L.see}
                    title={mio ? L.trophy : L.see}
                    onClick={() => setGaleria(premiados.indexOf(destino))}
                  >
                    <Icon name="trophy" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* EL PREMIO PROPIO, SOLO SI NO ESTÁS EN EL PODIO. Era una banda con titular y resplandor, y con el podio
          delante resultaba que lo más llamativo de la pantalla no era quién había ganado, sino un aviso para una
          sola persona que además ya se estaba viendo a sí misma tres centímetros más arriba. Queda para los
          puestos cuarto y quinto, que también se llevan lámina y no suben al podio. */}
      {propio >= 0 && premiados[propio].rank > PODIUM_RANKS ? (
        <div className="premios-results__own">
          <p>
            <strong>{L.yourAward}</strong> {L.yourAwardHint(premiados[propio].rank)}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setGaleria(propio)}>
            {L.trophy}
          </button>
        </div>
      ) : null}

      <div className="premios-results__cols">
        <section className="premios-results__panel" aria-label={L.winners}>
          <div className="premios-results__panel-head">
            <h3>{L.winners}</h3>
            <span className="premios-results__panel-count">{L.winnersCount(ganadores.length)}</span>
          </div>

          {ganadores.length === 0 ? <p className="premios-results__muted">{L.noWinners}</p> : null}

          {/* La categoría que más valía, a lo ancho y con el nombre del juego en grande: en una edición hay un
              titular y veinticinco notas al pie, y la rejilla los daba todos por igual. */}
          {titular ? (
            <div className="premios-results__headline">
              <span className="premios-results__cat">{tField(titular.title)}</span>
              <strong className="premios-results__headline-name">{ganadorDe(titular)}</strong>
            </div>
          ) : null}

          {restoGanadores.length > 0 ? (
            <ul className="premios-results__winners">
              {restoGanadores.map((category) => (
                <li key={category.id} className="premios-results__winner-card">
                  <span className="premios-results__cat">{tField(category.title)}</span>
                  <strong className="premios-results__winner">{ganadorDe(category)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* La clasificación solo aparece si queda alguien fuera del podio: con tres participantes, el podio YA es
            la clasificación entera y un panel repitiéndola sería un eco. */}
        {resto.length > 0 ? (
          <section className="premios-results__panel premios-results__panel--board" aria-label={L.leaderboard}>
            {/* Sin contador: «14 participantes» repetía el «14 participaciones» de la cabecera y además mentía
                un poco, porque en esta lista hay diez —los otros cuatro están en el podio—. */}
            <div className="premios-results__panel-head">
              <h3>{L.leaderboard}</h3>
            </div>

            <ol className="premios-results__board">
              {resto.map((entry, index) => {
                const propia = esPropia(entry);
                return (
                  <li
                    key={`${entry.profileId || entry.nickname}-${index}`}
                    className={`premios-results__row${propia ? ' is-own' : ''}${hasAward(entry.rank) ? ' is-award' : ''}`}
                    aria-label={propia ? L.yourRow : undefined}
                  >
                    {/* EL PUESTO SE DICE SIEMPRE EN TEXTO, aunque se vea como disco: el color del disco lo pone
                        el puesto, y quien no ve el color necesita oírlo igual. */}
                    <span className="premios-results__rank">
                      <span className="sr-only">{L.positionAria(entry.rank)}</span>
                      <span aria-hidden="true">{entry.rank}</span>
                    </span>

                    {/* La fila lleva a su perfil cuando esa persona tiene uno visible. Es lo que convierte la
                        clasificación en un sitio por el que seguir tirando, y no una lista que se lee y se
                        cierra. */}
                    {nombreDe(entry, 'premios-results__name')}

                    <span className="premios-results__points">
                      <span className="sr-only">{L.points(entry.points)}</span>
                      <span aria-hidden="true">{L.pointsShort(entry.points)}</span>
                    </span>

                    {/* El trofeo, solo para quien tiene sesión, y como icono: cinco botones con rótulo en cinco
                        renglones seguidos tapaban los nombres, que es lo que se viene a leer. */}
                    {hasAward(entry.rank) && ownProfileId ? (
                      <button
                        type="button"
                        className="btn premios-results__trophy"
                        aria-label={propia ? L.trophy : L.see}
                        title={propia ? L.trophy : L.see}
                        // POR IDENTIDAD, no por pseudónimo: quien vota sin perfil se archiva con `profileId: ''`
                        // (ver `scoring`), así que buscando por ese campo dos premiados sin pseudónimo casaban
                        // entre sí y pulsar en el segundo abría la lámina del primero. `premiados` es un filtrado
                        // de `leaderboard`, de modo que son el mismo objeto.
                        onClick={() => setGaleria(premiados.indexOf(entry))}
                      >
                        <Icon name="trophy" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </div>

      {galeria !== null ? (
        <Suspense fallback={null}>
          <AwardDialog
            entries={premiados}
            inicial={galeria}
            seasonName={result.name || result.seasonId}
            onClose={() => setGaleria(null)}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
