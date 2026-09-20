import { memo } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import type { LibraryMatch } from '../../../core/premios/library';
import type { PremiosOption } from '../../../model/types/premios';

const L = PREMIOS_UI.votar;

/**
 * Un nominado.
 *
 * LA SELECCIÓN SE MARCA CON UNA FRANJA DE ACENTO EN EL BORDE INFERIOR, más borde y halo, y no con un icono
 * flotante: en una tarjeta estrecha ese icono se montaba sobre la primera línea del nombre. El estado va además
 * en `aria-pressed`, que es lo que oye quien no ve el color.
 *
 * DEBAJO DEL NOMBRE, LO QUE TÚ SABES DE ESE JUEGO: si lo tienes en la biblioteca, en qué lista y con qué nota.
 * Es el cruce de `core/premios/library`, y es opcional por naturaleza — la mayoría de nominados no estarán en tu
 * biblioteca, y ahí la tarjeta no enseña nada.
 */
export interface NomineeCardProps {
  option: PremiosOption;
  selected: boolean;
  /** Lo que se sabe de este juego en la biblioteca de quien vota. */
  match: LibraryMatch | null;
  /** Nota ya formateada según la escala que tenga elegida (0–5 o 0–100). */
  gradeLabel: string;
  onChoose: (option: PremiosOption) => void;
}

function NomineeCardBase({ option, selected, match, gradeLabel, onChoose }: NomineeCardProps) {
  return (
    <button
      type="button"
      className={`premios-nominee${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={selected ? L.nomineeChosenAria(option.name) : L.nomineeAria(option.name)}
      onClick={() => onChoose(option)}
    >
      <span className="premios-nominee__name">{option.name}</span>
      {match ? (
        <span className="premios-nominee__mine">
          {L.inYourLibrary[match.tab]}
          {gradeLabel ? <span className="premios-nominee__grade">{L.yourGrade(gradeLabel)}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

export const NomineeCard = memo(NomineeCardBase);
