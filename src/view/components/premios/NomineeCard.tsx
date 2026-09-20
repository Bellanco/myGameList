import { memo } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { coverUrl } from '../../../core/utils/coverUrl';
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
 * LA TARJETA NO DICE LO QUE TÚ SABES DE ESE JUEGO. Llevó debajo del nombre en qué lista lo tenías y con qué nota
 * —el cruce de `core/premios/library`— y se retiró el 20-09-2026: en una rejilla de cinco portadas, esa línea
 * sobraba en la mayoría de tarjetas (casi ningún nominado está en tu biblioteca) y le robaba sitio al título
 * justo cuando la rejilla va justa de alto.
 */
export interface NomineeCardProps {
  option: PremiosOption;
  selected: boolean;
  /** ¿Se piden carátulas? Es la preferencia de la app, resuelta por la pantalla. */
  covers: boolean;
  onChoose: (option: PremiosOption) => void;
}

function NomineeCardBase({ option, selected, covers, onChoose }: NomineeCardProps) {
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
      </span>
    </button>
  );
}

export const NomineeCard = memo(NomineeCardBase);
