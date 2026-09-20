import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { BALLOT_NAME_MAX_LENGTH } from '../../../core/premios/limits';
import { getCategoryTitle } from '../../../core/premios/localize';
import { votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';

const L = PREMIOS_UI.revisar;

export interface PremiosReviewScreenProps {
  categories: PremiosCategory[];
  votes: PremiosVotes;
  /** Nombre propuesto: el que ya usó, o el de su cuenta. */
  defaultName: string;
  remainingEdits: number;
  isEdit: boolean;
  submitting: boolean;
  error: string;
  onSubmit: (displayName: string) => void;
}

/**
 * La última pantalla antes de enviar: todo lo votado, en una lista, y el nombre con el que saldrá en la
 * clasificación.
 *
 * SE PUEDE ENVIAR CON CATEGORÍAS SIN VOTAR, a propósito. Obligar a votarlas todas suena razonable hasta que
 * alguien no tiene opinión sobre «Mejor juego de esports» y abandona la papeleta entera. Lo que falta se dice,
 * con su enlace para volver, y ya decide quien vota.
 */
export function PremiosReviewScreen({
  categories,
  votes,
  defaultName,
  remainingEdits,
  isEdit,
  submitting,
  error,
  onSubmit,
}: PremiosReviewScreenProps) {
  const [name, setName] = useState(defaultName);
  const votadas = categories.filter((category) => Boolean(votes[category.id])).length;
  const pendientes = categories.length - votadas;

  return (
    <section className="premios-review" aria-label={L.sectionAria}>
      <header className="premios-review__head">
        <h2>{L.title}</h2>
        <p>{L.subtitle}</p>
        <p className="premios-review__count">{L.voted(votadas, categories.length)}</p>
        {pendientes > 0 ? <p className="premios-review__pending">{L.pending(pendientes)}</p> : null}
      </header>

      <ol className="premios-review__list">
        {categories.map((category, index) => {
          const vote = votes[category.id];
          return (
            <li key={category.id} className={`premios-review__row${vote ? '' : ' is-empty'}`}>
              <Link to={votePath(index + 1)} className="premios-review__cat">
                {getCategoryTitle(category)}
              </Link>
              <span className="premios-review__pick">{vote ? vote.name : L.notVoted}</span>
            </li>
          );
        })}
      </ol>

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

        {isEdit ? (
          <p className="premios-review__edits">
            {remainingEdits > 1 ? L.editsLeft(remainingEdits) : L.noEditsLeft}
          </p>
        ) : null}

        {error ? (
          <p className="premios-review__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting || name.trim().length === 0 || votadas === 0}
          onClick={() => onSubmit(name.trim())}
        >
          {submitting ? L.submitting : L.submit}
        </button>
      </div>
    </section>
  );
}
