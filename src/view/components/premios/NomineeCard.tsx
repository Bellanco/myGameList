import { memo } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { nomineeImageUrls } from '../../../core/premios/nomineeImage';
import type { PremiosOption } from '../../../model/types/premios';
import { GameCover } from '../GameCover';

const L = PREMIOS_UI.votar;

/**
 * Un nominado, con la misma CAJA que un juego de la biblioteca.
 *
 * SIEMPRE CON CARÁTULA, y se reutiliza `GameCover`, no se imita: la misma ranura 3:4 del mosaico, con la misma
 * portada de casa debajo mientras la imagen llega y el mismo gesto de entrada. Un nominado y un juego tuyo se ven
 * entonces como lo que son: la misma cosa. No depende del check de imágenes (decidido el 24-09-2026): los
 * nominados son los mismos para todos y se resuelven una vez, al abrir la edición o guardar la categoría desde
 * admin (ver `resolverCaratulasDeNominados`). Por eso aquí se piden con `c=1`: solo lo ya resuelto, sin
 * resolver nada mientras la gente vota.
 *
 * LA SELECCIÓN SE MARCA CON UNA FRANJA DE ACENTO EN EL BORDE INFERIOR, más borde y halo, y no con un icono
 * flotante: en una tarjeta estrecha ese icono se montaba sobre la primera línea del nombre. El estado va además
 * en `aria-pressed`, que es lo que oye quien no ve el color.
 *
 * SALVO QUE NO SEA UN JUEGO: en las categorías de interpretaciones y de cine o serie (`withCover` a `false`, ver
 * `core/premios/nomineeKind`) no se busca en IGDB. Sale la imagen que el administrador eligió en TMDB, si la
 * eligió, y si no la portada de casa con el nombre. Quién gana a quién lo decide `core/premios/nomineeImage`.
 *
 * LA TARJETA NO DICE LO QUE TÚ SABES DE ESE JUEGO. Llevó debajo del nombre en qué lista lo tenías y con qué nota
 * —el cruce de `core/premios/library`— y se retiró el 20-09-2026: en una rejilla de cinco portadas, esa línea
 * sobraba en la mayoría de tarjetas (casi ningún nominado está en tu biblioteca) y le robaba sitio al título
 * justo cuando la rejilla va justa de alto.
 */
export interface NomineeCardProps {
  option: PremiosOption;
  selected: boolean;
  /** Si la categoría es de juegos: carátula de IGDB. Si no, la imagen elegida en TMDB, si la hay. */
  withCover: boolean;
  /** Lo que oye quien no ve la tarjeta. Por defecto, el de votar; el panel de ganadores pone el suyo. */
  ariaLabel?: string;
  onChoose: (option: PremiosOption) => void;
}

function NomineeCardBase({ option, selected, withCover, ariaLabel, onChoose }: NomineeCardProps) {
  const imagen = nomineeImageUrls(option, option.name, withCover);

  return (
    <button
      type="button"
      className={`premios-nominee${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={ariaLabel ?? (selected ? L.nomineeChosenAria(option.name) : L.nomineeAria(option.name))}
      onClick={() => onChoose(option)}
    >
      <span className="premios-nominee__slot">
        <GameCover name={option.name} src={imagen?.src} src2x={imagen?.src2x} />
      </span>

      <span className="premios-nominee__body">
        <span className="premios-nominee__name">{option.name}</span>
      </span>
    </button>
  );
}

export const NomineeCard = memo(NomineeCardBase);
