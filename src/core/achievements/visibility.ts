// QUÉ SE ENSEÑA Y QUÉ NO. La ocultación de un logro, con el interruptor del panel de administración por encima
// del catálogo. Ver docs/plan-logros.md §6.7.
//
// DOS CAPAS Y UNA GANA: el catálogo declara si una escalera nace oculta (`hidden: true`) y el documento de
// configuración puede DARLE LA VUELTA a esa decisión sin desplegar. Sin documento —o sin sesión, o sin red— manda
// el catálogo, que es el lado seguro: un secreto sigue siendo secreto si la configuración no llega.
//
// ES SOLO PRESENTACIÓN, y esto es lo que la hace segura de tocar en caliente:
//
//  - no toca los `id` ni el orden de los bits (`mirrorOrder.ts`), así que **no cambia ni un espejo publicado**;
//  - no toca la fracción ni los puntos (`SCORING_ACHIEVEMENTS`): ocultar un logro no se lo quita a nadie;
//  - y quien YA lo tiene lo sigue viendo, con su medalla y su fecha. Ocultar solo afecta a quien no lo tiene.
//
// POR ESCALERA Y NO POR ESCALÓN, porque es donde vive la propiedad y porque media escalera a la vista deja
// adivinar la otra mitad: enseñar «Obra maestra I» y esconder el II no esconde nada.
import type { AchievementDef, AchievementItem } from './types';

/**
 * Lo que decide el panel: `true` = oculta, `false` = a la vista, ausente = lo que diga el catálogo.
 *
 * La clave es la de la ESCALERA (`obra-maestra`), no el `id` del escalón.
 */
export type HiddenOverrides = Readonly<Record<string, boolean>>;

/** ¿Está oculto este escalón? El interruptor manda; si no dice nada, el catálogo. */
export function isHidden(def: AchievementDef, overrides: HiddenOverrides = {}): boolean {
  const override = overrides[def.ladder];
  return typeof override === 'boolean' ? override : Boolean(def.hidden);
}

/**
 * LOS OCULTOS QUE NO TIENES DESAPARECEN. No ocupan una fila con un «?»: no están.
 *
 * Es un cambio deliberado sobre la primera versión del §6.7, que les daba su fila con «se revela al
 * conseguirlo». La fila tapada tenía dos problemas: contaba que existe algo que no puedes saber qué es —lo que
 * convierte el catálogo en una lista de acertijos— y, al ser una fila más, gastaba el sitio de la pantalla en no
 * decir nada. Al conseguirlo aparece con su nombre, que es la sorpresa que el oculto quería ser.
 *
 * Y NO SE FILTRA LO CONSEGUIDO, nunca: una medalla ganada no se le esconde a su dueño ni aunque el logro se
 * oculte después.
 */
export function withoutHidden(
  items: readonly AchievementItem[],
  overrides: HiddenOverrides = {},
): AchievementItem[] {
  return items.filter((entry) => entry.state.level >= 1 || !isHidden(entry.def, overrides));
}
