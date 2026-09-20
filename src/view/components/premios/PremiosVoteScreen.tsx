import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getCategoryTitle, getOptionId, tField } from '../../../core/premios/localize';
import { findInLibrary, type LibraryMatch } from '../../../core/premios/library';
import { PREMIOS_ROUTES, votePath } from '../../../viewmodel/premios/premiosRoutes';
import type { PremiosCategory, PremiosOption } from '../../../model/types/premios';
import type { PremiosVotes } from '../../../viewmodel/premios/usePremiosVoting';
import { NomineeCard } from './NomineeCard';

const L = PREMIOS_UI.votar;

export interface PremiosVoteScreenProps {
  categories: PremiosCategory[];
  /** Paso pedido en la dirección, 1..n. */
  paso: number;
  votes: PremiosVotes;
  libraryIndex: Map<string, LibraryMatch>;
  /** Formatea una nota 0–100 según la escala elegida por quien mira. */
  formatGrade: (grade: number | null) => string;
  onChoose: (categoryId: string, option: PremiosOption) => void;
}

/**
 * Una categoría por pantalla.
 *
 * EL PASO VIENE DE LA DIRECCIÓN, no del estado: avanzar es navegar. Eso es lo que hace que el botón «atrás» del
 * navegador funcione sin que nadie lo programe, que se pueda enlazar una categoría y que recargar no devuelva al
 * principio.
 *
 * Un paso fuera de rango se trata sin drama: por encima del total se va a la revisión —es lo que quiere quien
 * escribe un número grande— y por debajo, a la primera.
 */
export function PremiosVoteScreen({
  categories,
  paso,
  votes,
  libraryIndex,
  formatGrade,
  onChoose,
}: PremiosVoteScreenProps) {
  const navigate = useNavigate();
  const total = categories.length;
  const indice = Math.min(Math.max(paso, 1), total) - 1;
  const category = categories[indice];

  const nominados = useMemo<PremiosOption[]>(
    () =>
      (category?.options || []).map((option, i) => ({
        id: getOptionId(option, category.id, i),
        name: tField(option),
      })),
    [category],
  );

  if (!category) return null;

  const elegido = votes[category.id];
  const esUltima = indice === total - 1;

  return (
    <section className="premios-vote" aria-label={L.sectionAria}>
      <header className="premios-vote__head">
        <p className="premios-vote__step">{L.categoryOf(indice + 1, total)}</p>
        <h2 className="premios-vote__title">{getCategoryTitle(category)}</h2>
        <p className="premios-vote__hint">{elegido ? `${L.chosen}: ${elegido.name}` : L.chooseOne}</p>
      </header>

      <div className="premios-vote__grid" role="group" aria-label={getCategoryTitle(category)}>
        {nominados.map((option) => {
          const match = findInLibrary(libraryIndex, option.name);
          return (
            <NomineeCard
              key={option.id}
              option={option}
              selected={elegido?.id === option.id}
              match={match}
              gradeLabel={match ? formatGrade(match.grade) : ''}
              onChoose={(chosen) => {
                onChoose(category.id, chosen);
                // Elegir avanza. Es el gesto que la gente espera, y el botón «Siguiente» sigue ahí para quien
                // prefiera mirar antes de pasar.
                navigate(esUltima ? PREMIOS_ROUTES.review : votePath(indice + 2));
              }}
            />
          );
        })}
      </div>

      <nav className="premios-vote__nav" aria-label={L.sectionAria}>
        <button
          type="button"
          className="btn"
          disabled={indice === 0}
          onClick={() => navigate(votePath(indice))}
        >
          {L.previous}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(esUltima ? PREMIOS_ROUTES.review : votePath(indice + 2))}
        >
          {esUltima ? L.review : elegido ? L.next : L.skip}
        </button>
      </nav>
    </section>
  );
}
