import { useMemo } from 'react';
import { buildGameSheet, type GameSheet, type GameSheetSignal } from '../../core/gameSheet/buildGameSheet';
import type { TabData } from '../../model/types/game';

const SIN_SENALES: readonly GameSheetSignal[] = [];

/** Lo que necesita la ficha: tu biblioteca, la clave abierta y lo que se sepa de tus amistades. */
export interface GameSheetViewModelInput {
  data: TabData;
  slug: string;
  signals?: readonly GameSheetSignal[];
}

/**
 * LA FICHA ABIERTA, o `null` si no hay ninguna o si de ese juego no se sabe nada (ni lo tienes ni llega de ninguna
 * amistad). Pura derivación: monta el modelo con `buildGameSheet` cada vez que cambia la biblioteca, la clave o las
 * señales, así que editar, mover o borrar el juego se ve en el panel sin hacer nada más. No toca Firebase.
 *
 * Las señales de tus amistades llegan en F3 (canal social) y F4 (índice de bibliotecas); sin ellas, la ficha es la
 * de tu biblioteca.
 */
export function useGameSheetViewModel({ data, slug, signals = SIN_SENALES }: GameSheetViewModelInput): GameSheet | null {
  return useMemo(() => {
    if (!slug) return null;
    const sheet = buildGameSheet({ slug, own: data, signals });
    return sheet.own || sheet.friends.length || sheet.wishers.length ? sheet : null;
  }, [data, slug, signals]);
}
