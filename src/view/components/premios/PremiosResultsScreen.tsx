import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { hasAward } from '../../../core/premios/awards';
import { getOptionLabel, tField } from '../../../core/premios/localize';
import type { PremiosArchivedEntry, PremiosSeasonResult } from '../../../model/types/premios';

const L = PREMIOS_UI.resultados;

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
 * ES LA ÚNICA PANTALLA PÚBLICA de la sección: se abre con el enlace, sin cuenta. Por eso el archivo del que se
 * alimenta no lleva identificadores reales ni fotos (ver `docs/plan-unificar-premios.md` §4.1) y aquí la fila
 * propia se reconoce por el PSEUDÓNIMO, que es un dato público que no dice quién eres fuera de esta app.
 *
 * Los cinco primeros PUESTOS van marcados. Puesto, no posición: con dos primeros, quien les sigue es segundo, así
 * que puede haber más de cinco personas marcadas y nunca más de cinco puestos distintos.
 */
export function PremiosResultsScreen({ result, leaderboard, ownProfileId, profiles }: PremiosResultsScreenProps) {
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
        <p className="premios-results__count">{PREMIOS_UI.admin.history.ballots(result.totalBallots || 0)}</p>
      </header>

      {ganadores.length > 0 ? (
        <>
          <h3>{L.winners}</h3>
          <ul className="premios-results__winners">
            {ganadores.map((category) => (
              <li key={category.id}>
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
        </>
      ) : null}

      <h3>{L.leaderboard}</h3>
      <ol className="premios-results__board">
        {leaderboard.map((entry, index) => {
          const propia = Boolean(ownProfileId) && entry.profileId === ownProfileId;
          return (
            <li
              key={`${entry.profileId || entry.nickname}-${index}`}
              className={`premios-results__row${propia ? ' is-own' : ''}${hasAward(entry.rank) ? ' is-award' : ''}`}
              aria-label={propia ? L.yourRow : undefined}
            >
              <span className="premios-results__rank">{L.rank(entry.rank)}</span>
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
