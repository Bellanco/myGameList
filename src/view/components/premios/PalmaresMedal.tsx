import { memo, type CSSProperties } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
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
 *  · **Aura excepcional siempre.** En el catálogo la rareza dice cuánta gente lo tiene; aquí no hace falta
 *    medirla — solo hay cinco puestos por edición, y casi nadie los va a tener.
 *  · **El temple dice el PUESTO**, que es la información que de verdad importa: oro el primero, plata el
 *    segundo, cobre del tercero en adelante. Es el mismo canal que en el catálogo usa el tramo de la escalera.
 *  · **La píldora del canto lleva el puesto**, no un umbral.
 */
export interface PalmaresMedalProps {
  entry: PalmaresEntry;
  size?: PalmaresMedalSize;
}

/** Oro, plata y cobre: el filo dice en qué puesto se quedó. */
function templeDelPuesto(rank: number): string {
  if (rank <= 1) return 'is-temple-3';
  if (rank === 2) return 'is-temple-2';
  return 'is-temple-1';
}

export const PalmaresMedal = memo(function PalmaresMedal({ entry, size = 'md' }: PalmaresMedalProps) {
  const side = SIZES[size];
  const L = PREMIOS_UI.palmares;

  return (
    <span
      className={`ach-medal premios-palmares-medal is-excepcional ${templeDelPuesto(entry.rank)}`}
      style={{ '--sz': `${side}px` } as CSSProperties}
      role="img"
      aria-label={L.medalAria(entry.rank, entry.seasonName)}
      data-rarity={L.rarity}
    >
      <span className="ach-canvas" aria-hidden="true">
        <svg className="ach-art" viewBox="0 0 24 24">
          <g className="ach-sh"><use href="#ach-palmares" /></g>
          <g className="ach-fg"><use href="#ach-palmares" /></g>
          <g className="ach-hl"><use href="#ach-palmares" /></g>
        </svg>
        <span className="ach-light" />
        <span className="ach-grain" />
      </span>
      {/* La píldora del canto, con el PUESTO. Fuera del lienzo, como en las medallas del catálogo: montada en el
          borde de abajo es lo que la hace caber a 48 px sin tapar el dibujo. A 28 no sale, que es donde no cabe
          nada legible. */}
      {size === 'sm' ? null : <span className="ach-step" aria-hidden="true">{entry.rank}</span>}
    </span>
  );
});
