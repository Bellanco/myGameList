/**
 * DE DÓNDE SALE LA IMAGEN DE UN NOMINADO, en un solo sitio: la votación, el resumen de la papeleta y el panel de
 * ganadores la piden igual, y si cada uno lo decidiera por su cuenta, el administrador comprobaría en el panel
 * una imagen distinta de la que luego ve quien vota.
 *
 * Por orden:
 *  1. **La que el administrador eligió en TMDB** (`image`), en las categorías que no son de juegos. Se sirve por
 *     `/poster`, desde el propio dominio.
 *  2. **La carátula de IGDB que el administrador eligió** (`cover`), en las de juegos: una imagen concreta, por
 *     su id (`/cover?i=`). Es la salida cuando el nombre se empareja con la ficha equivocada —el *Ocarina of Time*
 *     de N64 en vez del remake—, porque aquí no hay plataforma que desempate.
 *  3. **La carátula de IGDB por el nombre**, en las de juegos, pedida solo de lo ya resuelto (`c=1`, ver
 *     `NomineeCard`).
 *  4. **Nada**: la portada de casa con el nombre. Es lo que sale en una categoría de cine o serie mientras no se
 *     elija imagen, y nunca una adivinada (ver `core/premios/nomineeKind`).
 */
import { coverUrl, coverUrlPorId } from '../utils/coverUrl';
import type { PremiosNomineeCover, PremiosNomineeImage, PremiosOptionLike } from '../../model/types/premios';

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
 * La carátula elegida de un nominado, si la tiene y tiene buena forma. Se comprueba por lo mismo que la de TMDB:
 * el id acaba en una URL, y uno raro solo daría un 400 en `/cover`.
 */
export function nomineeCoverOf(option: PremiosOptionLike | null | undefined): PremiosNomineeCover | null {
  if (!option || typeof option !== 'object' || !('cover' in option)) return null;
  const cover = option.cover;
  if (!cover || cover.source !== 'igdb' || typeof cover.imageId !== 'string') return null;
  if (!/^[a-z0-9_-]{1,64}$/i.test(cover.imageId)) return null;
  return cover;
}

/**
 * Las URLs de la imagen de un nominado, o `null` para la portada de casa.
 *
 * `withGameCover` es si la categoría es de juegos (`hasGameCovers`). La imagen de TMDB solo cuenta FUERA de las de
 * juegos, y la carátula elegida solo DENTRO: si una categoría cambia de tipo, el nominado conserva las dos y cada
 * una vuelve a pintarse cuando la categoría vuelve a ser lo que era.
 */
export function nomineeImageUrls(
  option: PremiosOptionLike | null | undefined,
  name: string,
  withGameCover: boolean,
): NomineeImageUrls | null {
  if (withGameCover) {
    const elegida = nomineeCoverOf(option);
    if (elegida) return { src: coverUrlPorId(elegida.imageId), src2x: coverUrlPorId(elegida.imageId, 'medio') };
    // SIN PLATAFORMAS: aquí no hay más dato que el nombre, que es con lo que lo resolvió el panel.
    return {
      src: coverUrl(name, [], 'normal', 'solo-cache'),
      src2x: coverUrl(name, [], 'medio', 'solo-cache'),
    };
  }
  const image = nomineeImageOf(option);
  return image ? { src: posterUrl(image.path), src2x: posterUrl(image.path, 'medio') } : null;
}
