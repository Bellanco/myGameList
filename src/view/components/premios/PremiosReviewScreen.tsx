import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { BALLOT_NAME_MAX_LENGTH } from '../../../core/premios/limits';
import { getCategoryTitle } from '../../../core/premios/localize';
import { coverUrl } from '../../../core/utils/coverUrl';
import { votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';
import { useCovers } from '../../hooks/useCovers';
import { GameCover } from '../GameCover';
import { PremiosProgress } from './PremiosProgress';

const L = PREMIOS_UI.revisar;

export interface PremiosReviewScreenProps {
  categories: PremiosCategory[];
  votes: PremiosVotes;
  /** Nombre propuesto: el que ya usó, o el de su cuenta. */
  defaultName: string;
  /** Oportunidades que le quedan, esta incluida. */
  remainingOpportunities: number;
  isEdit: boolean;
  submitting: boolean;
  error: string;
  onSubmit: (displayName: string) => void;
}

/**
 * La última pantalla antes de enviar: TODA la papeleta a la vista, y el nombre con el que saldrá en la
 * clasificación.
 *
 * ES UN ÍNDICE, NO UNA LISTA PARA LEER. Cada categoría es una tarjeta con lo que votaste —con su carátula, como
 * en la votación— y pulsarla lleva a esa categoría. Antes era una lista de renglones: con veintisiete categorías
 * había que leerla entera para encontrar la que querías cambiar, y el nombre del juego votado quedaba en un
 * texto suelto a la derecha. En rejilla se reconoce por la portada, que es como se reconoce un juego.
 *
 * SE PUEDE ENVIAR CON CATEGORÍAS SIN VOTAR, a propósito. Obligar a votarlas todas suena razonable hasta que
 * alguien no tiene opinión sobre «Mejor juego de esports» y abandona la papeleta entera. Lo que falta se dice,
 * con su atajo para ir a la primera, y ya decide quien vota.
 */
export function PremiosReviewScreen({
  categories,
  votes,
  defaultName,
  remainingOpportunities,
  isEdit,
  submitting,
  error,
  onSubmit,
}: PremiosReviewScreenProps) {
  const [name, setName] = useState(defaultName);
  const { covers } = useCovers();

  const votadas = categories.filter((category) => Boolean(votes[category.id])).length;
  const pendientes = categories.length - votadas;
  // La primera sin votar: es a donde lleva el atajo, porque es donde se seguiría votando.
  const primeraPendiente = categories.findIndex((category) => !votes[category.id]);
  const destinoSeguir = votePath((primeraPendiente >= 0 ? primeraPendiente : 0) + 1);

  return (
    <section className="premios-review" aria-label={L.sectionAria}>
      <PremiosProgress
        title={L.title}
        subtitle={L.subtitle}
        current={votadas}
        total={categories.length}
      />

      <div className="premios-review__submit">
        <label className="premios-review__label" htmlFor="premios-name">
          {L.nameLabel}
        </label>
        <input
          id="premios-name"
          className="input"
          type="text"
          value={name}
          maxLength={BALLOT_NAME_MAX_LENGTH}
          placeholder={L.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="premios-review__hint">{L.nameHint}</p>

        {pendientes > 0 ? (
          <p className="premios-review__pending">
            {L.pending(pendientes)}
            <Link className="premios-review__jump" to={destinoSeguir}>
              {L.firstPending}
            </Link>
          </p>
        ) : null}

        {isEdit ? (
          <p className="premios-review__edits">
            {remainingOpportunities > 1 ? L.editsLeft(remainingOpportunities - 1) : L.noEditsLeft}
          </p>
        ) : null}

        {error ? (
          <p className="premios-review__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="premios-review__actions">
          <Link className="btn" to={destinoSeguir}>
            {L.editVotes}
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || name.trim().length === 0 || votadas === 0}
            onClick={() => onSubmit(name.trim())}
          >
            {submitting ? L.submitting : L.submit}
          </button>
        </div>
      </div>

      <h3 className="premios-review__all">{L.allVotes}</h3>
      <ol className="premios-review__grid">
        {categories.map((category, index) => {
          const vote = votes[category.id];
          const titulo = getCategoryTitle(category);
          return (
            <li key={category.id}>
              <Link
                className={`premios-review__card${vote ? '' : ' is-empty'}${covers ? '' : ' is-flat'}`}
                to={votePath(index + 1)}
                aria-label={L.goToCategory(titulo)}
              >
                {/* La misma caja que en la votación, y con la misma regla: con las imágenes encendidas se ve la
                    portada de lo votado —que es como se reconoce un juego de un vistazo—, y apagadas la tarjeta
                    se queda en sus dos líneas de texto. Sin voto el hueco se queda VACÍO, sin la portada de casa
                    del nombre de la categoría: ese nombre ya va debajo, y las dos juntas lo decían dos veces. */}
                {covers ? (
                  <span className={`premios-review__slot${vote ? '' : ' is-empty'}`}>
                    {vote ? (
                      <GameCover
                        name={vote.name}
                        src={coverUrl(vote.name)}
                        src2x={coverUrl(vote.name, [], false, 'medio')}
                      />
                    ) : null}
                  </span>
                ) : null}
                <span className="premios-review__card-body">
                  <span className="premios-review__cat">{titulo}</span>
                  <span className="premios-review__pick">{vote ? vote.name : L.notVoted}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
