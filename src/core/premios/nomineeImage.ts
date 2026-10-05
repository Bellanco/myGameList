/**
 * DE DÓNDE SALE LA IMAGEN DE UN NOMINADO, en un solo sitio: la votación, el resumen de la papeleta y el panel de
 * ganadores la piden igual, y si cada uno lo decidiera por su cuenta, el administrador comprobaría en el panel
 * una imagen distinta de la que luego ve quien vota.
 *
 * Por orden:
 *  1. **La que el administrador eligió en TMDB** (`image`), en las categorías que no son de juegos. Se sirve por
 *     `/poster`, desde el propio dominio.
 *  2. **La carátula de IGDB**, en las de juegos, pedida solo de lo ya resuelto (`c=1`, ver `NomineeCard`).
 *  3. **Nada**: la portada de casa con el nombre. Es lo que sale en una categoría de cine o serie mientras no se
 *     elija imagen, y nunca una adivinada (ver `core/premios/nomineeKind`).
 */
import { coverUrl } from '../utils/coverUrl';
import type { PremiosNomineeImage, PremiosOptionLike } from '../../model/types/premios';

export interface NomineeImageUrls {
  src: string;
  src2x: string;
}

/** URL de una imagen de TMDB servida desde este dominio (ver `functions/poster.ts`). */
export function posterUrl(path: string, tamano: 'normal' | 'medio' = 'normal'): string {
  const parametros = new URLSearchParams({ p: path });
  // `s` en la URL y no en una cabecera, como en `/cover`: el service worker cachea por URL y sin `Vary`.
  if (tamano !== 'normal') parametros.set('s', tamano);
  return `/poster?${parametros.toString()}`;
}

/**
 * La imagen elegida de un nominado, si la tiene y tiene buena forma. El dato llega de Firestore y lo escribe el
 * panel, pero se comprueba igual: una ruta rara solo daría un 400 en `/poster`, y aquí es más barato no pedirla.
 */
export function nomineeImageOf(option: PremiosOptionLike | null | undefined): PremiosNomineeImage | null {
  if (!option || typeof option !== 'object' || !('image' in option)) return null;
  const image = option.image;
  if (!image || image.source !== 'tmdb' || typeof image.path !== 'string') return null;
  if (!/^\/[A-Za-z0-9]{10,64}\.(jpg|png)$/.test(image.path)) return null;
  return image;
}

/**
 * Las URLs de la imagen de un nominado, o `null` para la portada de casa.
 *
 * `withGameCover` es si la categoría es de juegos (`hasGameCovers`). La imagen de TMDB solo cuenta FUERA de las de
 * juegos: si una categoría vuelve a «Juegos», manda la carátula de IGDB aunque el nominado conserve la que se
 * eligió cuando era otra cosa.
 */
export function nomineeImageUrls(
  option: PremiosOptionLike | null | undefined,
  name: string,
  withGameCover: boolean,
): NomineeImageUrls | null {
  if (withGameCover) {
    // SIN PLATAFORMAS: aquí no hay más dato que el nombre, que es con lo que lo resolvió el panel.
    return {
      src: coverUrl(name, [], false, 'normal', 'solo-cache'),
      src2x: coverUrl(name, [], false, 'medio', 'solo-cache'),
    };
  }
  const image = nomineeImageOf(option);
  return image ? { src: posterUrl(image.path), src2x: posterUrl(image.path, 'medio') } : null;
}
