import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { BALLOT_NAME_MAX_LENGTH } from '../../../core/premios/limits';
import { getCategoryTitle } from '../../../core/premios/localize';
import { coverUrl } from '../../../core/utils/coverUrl';
import { votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';
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
  /**
   * SOLO MIRAR. Sin oportunidades no se puede reenviar, pero sí ver lo que se votó: la pantalla se queda con la
   * papeleta y pierde lo que no lleva a ninguna parte —el nombre y el botón de enviar—. Antes, a quien se le
   * acababan las oportunidades se le enseñaba un cartel diciendo que ya había votado, sin decirle QUÉ.
   */
  readOnly?: boolean;
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
 * LA PAPELETA SE ENVÍA COMPLETA. Hubo una versión que dejaba enviarla con categorías sin votar —el argumento
 * era no perder a quien no tiene opinión sobre «Mejor juego de esports»—, y se revirtió el 20-09-2026: una
 * papeleta a medias compite en la misma clasificación que las enteras, así que lo que parecía una comodidad era
 * una ventaja para quien votaba solo lo fácil. Mientras falte una, el botón no se ofrece; lo que falta se dice,
 * con su atajo para ir a la primera.
 *
 * ESTO LO APLICA EL CLIENTE, no las reglas: en `firestore.rules` una papeleta vale con una sola selección. Es
 * una regla de producto, como el cupo de oportunidades, y quien manipule su copia puede saltársela.
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
  readOnly = false,
}: PremiosReviewScreenProps) {
  const [name, setName] = useState(defaultName);

  const votadas = categories.filter((category) => Boolean(votes[category.id])).length;
  const pendientes = categories.length - votadas;
  // La primera sin votar: es a donde lleva el atajo, porque es donde se seguiría votando.
  const primeraPendiente = categories.findIndex((category) => !votes[category.id]);
  const destinoSeguir = votePath((primeraPendiente >= 0 ? primeraPendiente : 0) + 1);

  return (
    <section className="premios-review" aria-label={L.sectionAria}>
      {/* EN MODO LECTURA NO SE PROMETE LO QUE NO HAY: ni «revisa» —no se va a enviar nada— ni «puedes cambiar
          cualquier voto antes de enviarla», que ahí sencillamente no se cumple. */}
      <PremiosProgress
        title={readOnly ? L.readTitle : L.title}
        subtitle={readOnly ? undefined : L.subtitle}
        current={votadas}
        total={categories.length}
      />

      {readOnly ? null : (
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
            <span>
              {L.pending(pendientes)}. {L.mustComplete}
            </span>
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
            disabled={submitting || name.trim().length === 0 || votadas === 0 || pendientes > 0}
            onClick={() => onSubmit(name.trim())}
          >
            {submitting ? L.submitting : L.submit}
          </button>
        </div>
      </div>
      )}

      {/* SIN RÓTULO: la rejilla de categorías con lo elegido en cada una no necesita que le pongan nombre, y el
          que tenía («Toda tu papeleta») repetía lo que el título de la pantalla ya dice. */}
      <ol className="premios-review__grid">
        {categories.map((category, index) => {
          const vote = votes[category.id];
          const titulo = getCategoryTitle(category);
          return (
            <li key={category.id}>
              {(() => {
                const clase = `premios-review__card${vote ? '' : ' is-empty'}`;
                const Caja = readOnly
                  ? ({ children }: { children: React.ReactNode }) => <div className={clase}>{children}</div>
                  : ({ children }: { children: React.ReactNode }) => (
                    <Link className={clase} to={votePath(index + 1)} aria-label={L.goToCategory(titulo)}>
                      {children}
                    </Link>
                  );
                return (
                  <Caja>
                {/* La misma caja que en la votación, con la portada de lo votado —que es como se reconoce un
                    juego de un vistazo— y pedida igual, solo de lo ya resuelto (ver `NomineeCard`). Sin voto el
                    hueco se queda VACÍO, sin la portada de casa del nombre de la categoría: ese nombre ya va
                    debajo, y las dos juntas lo decían dos veces. */}
                <span className={`premios-review__slot${vote ? '' : ' is-empty'}`}>
                  {vote ? (
                    <GameCover
                      name={vote.name}
                      src={coverUrl(vote.name, [], false, 'normal', true)}
                      src2x={coverUrl(vote.name, [], false, 'medio', true)}
                    />
                  ) : null}
                </span>
                    <span className="premios-review__card-body">
                      <span className="premios-review__cat">{titulo}</span>
                      <span className="premios-review__pick">{vote ? vote.name : L.notVoted}</span>
                    </span>
                  </Caja>
                );
              })()}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
