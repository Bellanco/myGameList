import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { hasAward } from '../../../core/premios/awards';
import { getOptionLabel, tField } from '../../../core/premios/localize';
import { resultsPath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosArchivedEntry, PremiosSeasonResult } from '../../../model/types/premios';
import { PremiosCompartir } from './PremiosCompartir';

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
  // Qué trofeo se está mirando. La lámina solo se ofrece CON SESIÓN: en la página pública va la medalla.
  const [trofeo, setTrofeo] = useState<PremiosArchivedEntry | null>(null);

  // La fila propia, si quien mira está en esta clasificación y se llevó algo. Va arriba del todo: si te ha
  // tocado, es lo primero que has venido a ver.
  const propio = useMemo(
    () =>
      ownProfileId
        ? leaderboard.find((entry) => entry.profileId === ownProfileId && hasAward(entry.rank)) || null
        : null,
    [leaderboard, ownProfileId],
  );

  if (!result) {
    return (
      <section className="premios-estado" aria-label={L.sectionAria}>
        <h2>{L.title}</h2>
        <p>{L.empty}</p>
      </section>
    );
  }

  const ganadores = (result.categoriesSnapshot || []).filter((category) => category.winner);

  return (
    <section className="premios-results" aria-label={L.sectionAria}>
      <header className="premios-results__head">
        <h2>{result.name || L.title}</h2>
        <p className="premios-results__count">{L.ballots(result.totalBallots || 0)}</p>
        {/* El enlace que se comparte es el de ESTA edición, con su identificador, y no el de «la última
            publicada»: quien lo abra dentro de un año tiene que ver los resultados de los que se le hablaba.
            Se ven sin cuenta, así que llega a cualquiera. */}
        <PremiosCompartir
          path={resultsPath(result.seasonId)}
          title={PREMIOS_UI.compartir.resultsTitle(result.name || result.seasonId)}
          text={PREMIOS_UI.compartir.resultsText}
        />
      </header>

      {/* EL PREMIO PROPIO, a lo ancho de las dos columnas. No se incrusta la lámina: son 240 kB de arte y una
          tipografía, y se descargan al abrirla, no al llegar. Lo que va aquí es el aviso de que te toca. */}
      {propio ? (
        <div className="premios-results__own">
          <div>
            <h3>{L.yourAward}</h3>
            <p>{L.yourAwardHint(propio.rank)}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setTrofeo(propio)}>
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

          {ganadores.length === 0 ? (
            <p className="premios-results__muted">{L.noWinners}</p>
          ) : (
            <ul className="premios-results__winners">
              {ganadores.map((category) => (
                <li key={category.id} className="premios-results__winner-card">
                  <span className="premios-results__cat">{tField(category.title)}</span>
                  <strong className="premios-results__winner">
                    {getOptionLabel(
                      { id: category.id, title: category.title, options: category.options },
                      category.winner || '',
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="premios-results__panel premios-results__panel--board" aria-label={L.leaderboard}>
          <div className="premios-results__panel-head">
            <h3>{L.leaderboard}</h3>
            <span className="premios-results__panel-count">{L.participants(leaderboard.length)}</span>
          </div>

          <ol className="premios-results__board">
            {leaderboard.map((entry, index) => {
              const propia = Boolean(ownProfileId) && entry.profileId === ownProfileId;
              return (
                <li
                  key={`${entry.profileId || entry.nickname}-${index}`}
                  className={`premios-results__row${propia ? ' is-own' : ''}${hasAward(entry.rank) ? ' is-award' : ''}`}
                  aria-label={propia ? L.yourRow : undefined}
                >
                  {/* EL PUESTO SE DICE SIEMPRE EN TEXTO, aunque se vea como disco: el color del disco lo pone el
                      puesto, y quien no ve el color necesita oírlo igual. */}
                  <span className={`premios-results__rank ${METAL[entry.rank - 1] || ''}`}>
                    <span className="sr-only">{L.positionAria(entry.rank)}</span>
                    <span aria-hidden="true">{entry.rank}</span>
                  </span>

                  {/* La fila lleva a su perfil cuando esa persona tiene uno visible. Es lo que convierte la
                      clasificación en un sitio por el que seguir tirando, y no una lista que se lee y se cierra. */}
                  {profiles?.get(entry.profileId) ? (
                    <Link
                      className="premios-results__name premios-results__link"
                      to={`/social/profiles/${encodeURIComponent(profiles.get(entry.profileId) as string)}`}
                      aria-label={L.avatarAria(entry.nickname)}
                    >
                      {entry.nickname}
                    </Link>
                  ) : (
                    <span className="premios-results__name">{entry.nickname}</span>
                  )}

                  <span className="premios-results__points">{L.points(entry.points)}</span>

                  {/* El trofeo, solo para quien tiene sesión: el arte no se enseña en abierto (ver `AwardDialog`). */}
                  {hasAward(entry.rank) && ownProfileId ? (
                    <button type="button" className="btn premios-results__trophy" onClick={() => setTrofeo(entry)}>
                      {propia ? L.trophy : L.download}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {trofeo ? (
        <Suspense fallback={null}>
          <AwardDialog
            rank={trofeo.rank}
            name={trofeo.nickname}
            seasonName={result.name || result.seasonId}
            onClose={() => setTrofeo(null)}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
