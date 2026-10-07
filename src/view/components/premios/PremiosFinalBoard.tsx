import { useState, type ReactNode } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { hasAward } from '../../../core/premios/awards';
import type { RevealedRow } from '../../../core/premios/revealedVotes';
import type { PremiosRevealedBallot } from '../../../model/types/premios';
import { Icon } from '../Icon';

const L = PREMIOS_UI.resultados;

/** El metal de los tres primeros puestos: las mismas clases que los rangos del perfil (ver `PremiosResultsScreen`). */
const METAL = ['tier-gold', 'tier-silver', 'tier-bronze'] as const;

export interface PremiosFinalBoardProps {
  rows: RevealedRow[];
  /** Rótulo del panel: «Clasificación final» en resultados; en el panel, el que toque a la edición en curso. */
  title?: string;
  /**
   * ¿Hay recuento? Sin él (la votación sigue abierta) la fila no lleva puesto, aciertos ni puntos: el orden es el
   * de quien llama, y lo que importa es lo que votó cada uno.
   */
  scored?: boolean;
  /** ¿Es la fila de quien mira? Se marca como en la clasificación de siempre. */
  isOwn?: (entry: PremiosRevealedBallot) => boolean;
  /** El nombre, si quien llama sabe enlazarlo a un perfil. Por defecto, texto. */
  renderName?: (entry: PremiosRevealedBallot, index: number) => ReactNode;
  /** Lo que va al final de la fila, por encima del botón que la despliega (en el panel: correcciones y retirar). */
  renderAside?: (row: RevealedRow, index: number) => ReactNode;
  /** Prefijo de los ids de cada detalle: dos tableros en la misma página no pueden repetirlos. */
  idPrefix?: string;
}

/**
 * LA CLASIFICACIÓN FINAL: una fila por persona y, al desplegarla, lo que votó en cada categoría.
 *
 * La usan la pantalla de resultados —para quien votó, con la edición ya publicada— y la pestaña de votos del panel
 * de administración, que enseña con ella la edición EN CURSO: abierta (sin recuento) o cerrada sin publicar (con el
 * recuento de los ganadores marcados hasta ahora). Por eso una categoría puede llegar sin ganador: ahí se dice qué
 * se votó, sin acierto ni fallo.
 *
 * LA FILA ENTERA DESPLIEGA, y con un solo control: un botón que la cubre de punta a punta, debajo del nombre. Así el
 * ratón y el teclado hacen lo mismo, y el nombre solo navega cuando esa persona tiene perfil (si no, es texto y la
 * pulsación cae en el botón). Sin trofeo ni flecha al final (decisión del 05-10-2026). No es un `<details>`: el
 * nombre enlaza, y dentro de un `<summary>` —o de cualquier botón— no puede haber otro control. Por eso son
 * hermanos y no van uno dentro de otro; lo mismo vale para lo que añada `renderAside`.
 */
export function PremiosFinalBoard({
  rows,
  title = L.finalBoard,
  scored = true,
  isOwn,
  renderName,
  renderAside,
  idPrefix = 'premios-final',
}: PremiosFinalBoardProps) {
  /** Las filas desplegadas, por puesto en la lista. Empiezan todas plegadas. */
  const [desplegadas, setDesplegadas] = useState<ReadonlySet<number>>(() => new Set());
  const alternar = (indice: number) =>
    setDesplegadas((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(indice)) siguientes.delete(indice);
      else siguientes.add(indice);
      return siguientes;
    });

  return (
    <section className="premios-results__panel premios-results__panel--final" aria-label={title}>
      <div className="premios-results__panel-head">
        <h3>{title}</h3>
      </div>

      <ol className="premios-results__board">
        {rows.map((row, index) => {
          const { entry, picks, hits, decided } = row;
          const propia = isOwn?.(entry) ?? false;
          const abierta = desplegadas.has(index);
          const idVotos = `${idPrefix}-${index}`;
          return (
            <li key={`${entry.profileId || entry.nickname}-${index}`} aria-label={propia ? L.yourRow : undefined}>
              <div
                className={`premios-results__row premios-results__row--final${propia ? ' is-own' : ''}${scored && hasAward(entry.rank) ? ' is-award' : ''}${abierta ? ' is-open' : ''}${scored ? '' : ' is-unscored'}`}
              >
                <button
                  type="button"
                  className="premios-results__row-hit"
                  aria-expanded={abierta}
                  aria-controls={idVotos}
                  aria-label={abierta ? L.hideVotes(entry.nickname) : L.showVotes(entry.nickname)}
                  onClick={() => alternar(index)}
                />
                {scored ? (
                  <span className={`premios-results__rank ${METAL[entry.rank - 1] || ''}`}>
                    <span className="sr-only">{L.positionAria(entry.rank)}</span>
                    <span aria-hidden="true">{entry.rank}</span>
                  </span>
                ) : null}

                {renderName ? renderName(entry, index) : <span className="premios-results__name">{entry.nickname}</span>}

                {scored ? (
                  <>
                    <span className="premios-results__hits">
                      <span className="sr-only">{L.hitsAria(hits, decided)}</span>
                      <span aria-hidden="true">{L.hitsShort(hits, decided)}</span>
                    </span>

                    <span className="premios-results__points">
                      <span className="sr-only">{L.points(entry.points)}</span>
                      <span aria-hidden="true">{L.pointsShort(entry.points)}</span>
                    </span>
                  </>
                ) : null}

                {renderAside ? <span className="premios-results__row-aside">{renderAside(row, index)}</span> : null}
              </div>

              {abierta ? (
                <ul id={idVotos} className="premios-results__picks" aria-label={L.votesOf(entry.nickname)}>
                  {picks.map((pick) => (
                    <li
                      key={pick.categoryId}
                      className={`premios-results__pick ${pick.decided ? (pick.hit ? 'is-hit' : 'is-miss') : 'is-undecided'}`}
                    >
                      {pick.decided ? (
                        <Icon name={pick.hit ? 'check' : 'close'} className="ui-icon premios-results__pick-mark" />
                      ) : null}
                      <span className="premios-results__pick-head">
                        <span className="premios-results__pick-cat">{pick.title}</span>
                        {pick.weight !== 1 ? (
                          <span className="premios-results__pick-weight">
                            <span aria-hidden="true">{L.weight(pick.weight)}</span>
                            <span className="sr-only">{L.weightAria(pick.weight)}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="premios-results__pick-voted">
                        {pick.decided ? <span className="sr-only">{pick.hit ? L.hit : L.miss}: </span> : null}
                        {pick.voted || L.noVote}
                      </span>
                      {pick.decided && !pick.hit ? (
                        <span className="premios-results__pick-winner">{L.winnerWas(pick.winner)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
