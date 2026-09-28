import { memo, type CSSProperties } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { isParticipation, palmaresYear, shortYear } from '../../../core/premios/palmares';
import type { PalmaresEntry } from '../../../model/types/premios';
// La hoja de las medallas se importa AQUÍ, igual que hace `AchievementMedal`: esta medalla se pinta en chunks
// perezosos distintos (el perfil social y la sección de premios), y colgar sus estilos de la hoja de uno de los
// dos dejaría al otro sin ellos SIN QUE SALTE NINGÚN ERROR.
import '../../../styles/achievements.scss';
import '../../../styles/premios.scss';

/** Lados, los mismos que usan las medallas del catálogo: la vitrina del perfil no puede descuadrarse. */
const SIZES = { md: 48, lg: 72, sm: 28 } as const;
export type PalmaresMedalSize = keyof typeof SIZES;

/**
 * EL TROFEO DE UNA EDICIÓN GANADA, con forma de logro.
 *
 * Es una medalla como las del catálogo —mismo disco en penumbra, mismo relieve de tres pasadas, misma aura— y
 * eso es deliberado: para quien la mira es un logro más de su perfil. Lo que cambia por dentro es de dónde sale
 * el dato (ver `PalmaresEntry`): esto lo concede el administrador al publicar, no se deriva de la biblioteca, y
 * por eso no entra en el catálogo ni en su mapa de bits.
 *
 * QUÉ LA HACE ESPECIAL, y se nota sin leer nada:
 *
 *  · **EL METAL DICE EL PUESTO, y lo dice entero**: filo, aura exterior y trofeo. Oro el primero, plata el
 *    segundo, bronce el tercero, cobre el cuarto y el quinto —más rojizo que el bronce, para que no se
 *    confundan— y azul la participación (decisiones del 28-09-2026). Con solo el filo distinto, el aura naranja
 *    de «excepcional» y el trofeo dorado igualaban las seis a simple vista. El aura aquí no mide rareza, como en
 *    el catálogo: solo hay cinco puestos por edición y medirla no diría nada. Los metales viven en la hoja de
 *    premios y los degradados del trofeo en el sprite (`#ach-lux-*`).
 *  · **La píldora del canto lleva el puesto** («3.º»), no un umbral. El AÑO va en el rótulo de debajo («3.º en
 *    Game Awards 2021»), que es lo que separa las ediciones de la hoja de cálculo (2020–2024) de las jugadas
 *    aquí, y ordena la vitrina.
 *
 * LA PARTICIPACIÓN (puesto `0`) es la misma medalla en azul —no es un metal a propósito, porque no es un
 * puesto—, con la escarapela en lugar de la copa y el año en la píldora (no hay puesto que poner).
 */
export interface PalmaresMedalProps {
  entry: PalmaresEntry;
  size?: PalmaresMedalSize;
}

/** El metal de cada puesto: oro, plata, bronce y cobre. */
function metalDelPuesto(rank: number): string {
  if (rank <= 1) return 'is-oro';
  if (rank === 2) return 'is-plata';
  if (rank === 3) return 'is-bronce';
  return 'is-cobre';
}

export const PalmaresMedal = memo(function PalmaresMedal({ entry, size = 'md' }: PalmaresMedalProps) {
  const side = SIZES[size];
  const L = PREMIOS_UI.palmares;
  const participa = isParticipation(entry);
  // La participación no es un puesto, así que no lleva metal: su azul lo pone `.is-participation`.
  const clase = participa ? 'is-participation' : metalDelPuesto(entry.rank);
  const simbolo = participa ? '#ach-participacion' : '#ach-palmares';

  return (
    <span
      className={`ach-medal premios-palmares-medal ${clase}`}
      style={{ '--sz': `${side}px` } as CSSProperties}
      role="img"
      aria-label={L.medalAria(entry.rank, entry.seasonName)}
      data-rarity={participa ? L.rarityParticipation : L.rarity}
    >
      <span className="ach-canvas" aria-hidden="true">
        <svg className="ach-art" viewBox="0 0 24 24">
          <g className="ach-sh"><use href={simbolo} /></g>
          <g className="ach-fg"><use href={simbolo} /></g>
          <g className="ach-hl"><use href={simbolo} /></g>
        </svg>
        <span className="ach-light" />
        <span className="ach-grain" />
      </span>
      {/* La píldora del canto, con el PUESTO (o el año, si es de participar). Fuera del lienzo, como en las
          medallas del catálogo: montada en el borde de abajo es lo que la hace caber a 48 px sin tapar el dibujo.
          A 28 no sale, que es donde no cabe nada legible. */}
      {size === 'sm' ? null : (
        <span className="ach-step" aria-hidden="true">
          {L.pill(participa ? 0 : entry.rank, shortYear(palmaresYear(entry)))}
        </span>
      )}
    </span>
  );
});
