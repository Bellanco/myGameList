import { memo } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { coverUrl } from '../../../core/utils/coverUrl';
import type { LibraryMatch } from '../../../core/premios/library';
import type { PremiosOption } from '../../../model/types/premios';
import { GameCover } from '../GameCover';

const L = PREMIOS_UI.votar;

/**
 * Un nominado, con la misma CAJA que un juego de la biblioteca.
 *
 * DOS CAJAS, y las decide la preferencia de imágenes de la aplicación (`useCovers`), no una propia de la porra:
 *
 *   · CARÁTULAS ENCENDIDAS → se reutiliza `GameCover`, no se imita: la misma ranura 3:4 del mosaico, con la
 *     misma portada de casa debajo mientras la imagen llega y el mismo gesto de entrada. Un nominado y un juego
 *     tuyo se ven entonces como lo que son: la misma cosa.
 *   · APAGADAS → la caja BÁSICA: el nombre, grande y centrado, sin ranura. No se pinta la portada de casa con el
 *     título dentro porque el nombre ya va debajo, y las dos juntas lo dicen dos veces en la misma tarjeta.
 *     Quien tiene las imágenes apagadas no pide ni una petición aquí tampoco, que es lo que esa preferencia
 *     promete.
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
  /** ¿Se piden carátulas? Es la preferencia de la app, resuelta por la pantalla. */
  covers: boolean;
  onChoose: (option: PremiosOption) => void;
}

function NomineeCardBase({ option, selected, match, gradeLabel, covers, onChoose }: NomineeCardProps) {
  // SIN PLATAFORMAS: aquí no hay más dato que el nombre del nominado, que es lo que el administrador escribió.
  // El emparejador de `/cover` resuelve por título igual que en la biblioteca de otra persona.
  const src = covers ? coverUrl(option.name) : null;
  const src2x = covers ? coverUrl(option.name, [], false, 'medio') : null;

  return (
    <button
      type="button"
      className={`premios-nominee${selected ? ' is-selected' : ''}${covers ? '' : ' is-flat'}`}
      aria-pressed={selected}
      aria-label={selected ? L.nomineeChosenAria(option.name) : L.nomineeAria(option.name)}
      onClick={() => onChoose(option)}
    >
      {covers ? (
        <span className="premios-nominee__slot">
          <GameCover name={option.name} src={src} src2x={src2x} />
        </span>
      ) : null}

      <span className="premios-nominee__body">
        <span className="premios-nominee__name">{option.name}</span>
        {match ? (
          <span className="premios-nominee__mine">
            {L.inYourLibrary[match.tab]}
            {gradeLabel ? <span className="premios-nominee__grade">{L.yourGrade(gradeLabel)}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export const NomineeCard = memo(NomineeCardBase);
