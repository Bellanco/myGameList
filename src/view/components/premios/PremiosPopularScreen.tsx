import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getOptionLabel, tField } from '../../../core/premios/localize';
import { popularWinners, type PopularWinner } from '../../../core/premios/popularVote';
import { resultsPath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosSeasonResult } from '../../../model/types/premios';
import { HubBackButton } from '../socialhub/HubBackButton';

const L = PREMIOS_UI.votos;

export interface PremiosPopularScreenProps {
  result: PremiosSeasonResult | null;
}

/**
 * LO MÁS VOTADO de una edición: qué eligió más gente en cada categoría.
 *
 * Es la otra lectura de los resultados —allí manda el jurado y se puntúa acertarle; aquí manda la gente— y por
 * eso se pinta con LA MISMA REJILLA de ganadores: se reconoce de un vistazo como la misma edición contada de otra
 * manera. Lo que añade cada ficha es cuántos votos tuvo, y la marca de si coincidió con el jurado.
 *
 * UN EMPATE ENSEÑA A TODOS LOS EMPATADOS. Con los votos iguales no hay uno más votado que otro, y elegir el
 * primero de la lista sería inventarse un ganador.
 *
 * Pública, como la de resultados: el archivo solo guarda cifras, nunca quién votó qué.
 */
export function PremiosPopularScreen({ result }: PremiosPopularScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const ganadores = useMemo(() => popularWinners(result), [result]);

  // Mismo criterio que el «volver» de resultados: deshacer el paso, y solo si se llega en frío, a los resultados
  // de esta edición, que es de donde cuelga esta pantalla.
  const volver = () => {
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate(resultsPath(result?.seasonId));
  };

  if (!result || ganadores.length === 0) {
    return (
      <section className="premios-estado" aria-label={L.sectionAria}>
        <div className="premios-results__back">
          <HubBackButton onBack={volver} label={L.back} />
        </div>
        <h2>{L.title}</h2>
        <p>{L.empty}</p>
      </section>
    );
  }

  const nombre = (winner: PopularWinner, optionId: string) =>
    getOptionLabel(
      { id: winner.category.id, title: winner.category.title, options: winner.category.options },
      optionId,
    );

  return (
    <section className="premios-results premios-popular" aria-label={L.sectionAria}>
      <div className="premios-results__back">
        <HubBackButton onBack={volver} label={L.back} />
      </div>

      <header className="premios-results__head">
        <h2>{L.title}</h2>
        <p className="premios-results__count">{result.name || result.seasonId}</p>
      </header>

      <ul className="premios-results__winners">
        {ganadores.map((winner) => {
          const empate = winner.optionIds.length > 1;
          const delJurado = Boolean(winner.category.winner) && winner.optionIds.includes(winner.category.winner || '');
          return (
            <li key={winner.category.id} className="premios-results__winner-card premios-popular__card">
              <span className="premios-results__cat">{tField(winner.category.title)}</span>
              <span className="premios-popular__names">
                {winner.optionIds.map((optionId) => (
                  <strong key={optionId} className="premios-results__winner">
                    {nombre(winner, optionId)}
                  </strong>
                ))}
              </span>
              <span className="premios-popular__meta">
                <span className="premios-popular__votes">{L.votes(winner.votes, winner.total)}</span>
                {empate ? <span className="premios-results__tie">{L.tie}</span> : null}
                {delJurado ? <span className="premios-popular__jury">{L.matchesJury}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
