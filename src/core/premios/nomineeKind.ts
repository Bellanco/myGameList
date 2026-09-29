/**
 * Qué se nomina en una categoría —un juego, una interpretación o una adaptación— y si sus nominados llevan
 * carátula de IGDB.
 *
 * EL TIPO LO MARCA EL ADMINISTRADOR, NO SE DEDUCE DEL TÍTULO. «Mejor actuación» se ha llamado también «Best
 * performance», y el título se puede editar cualquier año: una regla por nombre dejaría de funcionar en silencio
 * el día que alguien lo retoque.
 *
 * SOLO LOS JUEGOS SE BUSCAN EN IGDB. Para lo demás, una carátula sería casi siempre la equivocada, y sin aviso:
 * la serie «The Last of Us» casa con el juego, «Fallout» con el de 1997 y «Arcane» con cualquier homónimo. Es
 * preferible la portada de casa con el nombre, que no promete nada, a una imagen que nadie ha confirmado.
 */
import type { PremiosCategory, PremiosNomineeKind } from '../../model/types/premios';

/** Los tres tipos, en el orden en que se ofrecen en el panel. */
export const NOMINEE_KINDS: readonly PremiosNomineeKind[] = ['game', 'person', 'screen'];

/** El tipo de una categoría. Ausente o desconocido cuenta como `game`: es lo que eran todas antes del campo. */
export function nomineeKindOf(category: Pick<PremiosCategory, 'nomineeKind'> | null | undefined): PremiosNomineeKind {
  const kind = category?.nomineeKind;
  return kind && NOMINEE_KINDS.includes(kind) ? kind : 'game';
}

/** ¿Sus nominados se buscan en IGDB? Solo si son juegos. */
export function hasGameCovers(category: Pick<PremiosCategory, 'nomineeKind'> | null | undefined): boolean {
  return nomineeKindOf(category) === 'game';
}
