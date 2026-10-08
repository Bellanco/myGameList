/**
 * QUÉ CARÁTULA PIDE CADA PIEZA DEL LISTADO: la caja del mosaico (dos tamaños, con `srcset`) y el renglón (una, de
 * fondo). Vive fuera de `GameTable` porque hay un segundo que necesita la MISMA respuesta: la precarga del cambio de
 * lista (`precargarCaratulasDeLista`), que tiene que pedir exactamente las URL que el listado va a pintar o no
 * precarga nada.
 */
import type { GameItem } from '../../model/types/game';
import { coverUrl } from './coverUrl';
import { sabemosQueNoTiene } from './coverMemory';
import { peticionDeCaratula, type PeticionDeCaratula } from './coverDone';

function coverBase(covers: boolean, peticion: PeticionDeCaratula): string | null {
  if (!covers) return null;
  const url = coverUrl(peticion.nombre, peticion.plataformas);
  return sabemosQueNoTiene(url) ? null : url;
}

/** Cómo se pide la carátula de un juego en esta lista: la política de `coverPolicy`, ya traducida. */
export interface PedidoDePortada {
  preferirConocidas: boolean;
  soloCache: boolean;
}

/**
 * Las dos URL que el mosaico ofrece juntas con `srcset` (ver `GameCover`), de UNA pasada: la de la ranura y la
 * de densidad doble.
 *
 * Que salgan juntas no es cosmético. Pedirlas por separado significaba llamar dos veces a una función que
 * construía DOS URL cada vez —la del tamaño y la normal para preguntar a la memoria—, o sea cuatro por caja y
 * por render; con las ~150 cajas que la rejilla mantiene montadas, son seiscientas en cada repintado del
 * listado. Aquí la normal se construye una vez y sirve para las dos cosas, y la de densidad doble ni se llega a
 * componer cuando ya se sabe que ese juego no tiene carátula.
 *
 * Con qué nombre, plataformas y marca se pide lo decide `peticionDeCaratula` (ver `coverDone`), una vez por juego
 * y para todos los tamaños.
 */
export function coverDeCaja(
  covers: boolean,
  game: GameItem,
  pedido: PedidoDePortada,
): { src: string | null; src2x: string | null } {
  const peticion = peticionDeCaratula(game.name, game.platforms, pedido);
  const base = coverBase(covers, peticion);
  if (!base) return { src: null, src2x: null };
  const { nombre, plataformas, soloCache } = peticion;
  const siNoEstaResuelta = soloCache ? 'ajeno' : 'resolver';
  return {
    // La normal sale ya compuesta de la memoria de «no tiene», que se guarda sin la marca: solo se rehace con ella.
    src: soloCache ? coverUrl(nombre, plataformas, 'normal', siNoEstaResuelta) : base,
    src2x: coverUrl(nombre, plataformas, 'medio', siNoEstaResuelta),
  };
}

/**
 * La del renglón: una sola, y `medio` (508×720) para todo el mundo.
 *
 * La `ancho` (762×1080) se reservaba a la cuenta de administración, y no compensaba. Se compararon las dos en la
 * franja, con su velo encima, y a 151 px de alto con el 90 % de la superficie del tema delante el detalle de más
 * no llega a la pantalla. Lo que sí llegaba era el coste, medido en producción el 01-10-2026 con 149 renglones:
 * casi el doble de tiempo descodificando imágenes (660 ms frente a 363 por recorrido) y un 45 % más de
 * fotogramas perdidos al bajar, además de ~100 kB por juego en vez de ~65.
 */
export function coverDeRenglon(
  covers: boolean,
  game: GameItem,
  pedido: PedidoDePortada,
): string | null {
  const peticion = peticionDeCaratula(game.name, game.platforms, pedido);
  if (!coverBase(covers, peticion)) return null;
  return coverUrl(peticion.nombre, peticion.plataformas, 'medio', peticion.soloCache ? 'ajeno' : 'resolver');
}
