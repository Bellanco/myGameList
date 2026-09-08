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

/**
 * HASTA DÓNDE HA ABIERTO CADA ESCALERA LA COMUNIDAD: clave de escalera → `id` del escalón MÁS ALTO al que ha
 * llegado alguien. `{}` = no se sabe de nadie, y entonces cada quien abre solo con lo suyo (ver `openThrough`).
 *
 * EL `id` Y NO LA POSICIÓN NI EL UMBRAL, por lo de siempre: la posición se corre en cuanto se inserta un escalón
 * intermedio —es justo el motivo de que exista `mirrorOrder.ts`— y el umbral no ordena en una escalera
 * DESCENDENTE, donde «más lejos» es un número más pequeño. El `id` es contrato y no se renombra jamás (§6.4),
 * así que un mapa guardado hoy sigue queriendo decir lo mismo dentro de un año.
 */
export type OpenFrontier = Readonly<Record<string, string>>;

/** Lo que el panel de administración decide para todo el mundo. Vive en `appConfig/achievements`. */
export interface AchievementsConfig {
  hidden: HiddenOverrides;
  open: OpenFrontier;
}

/** Sin configuración manda el catálogo, y cada quien abre con su propio progreso. Es el lado seguro. */
export const NO_ACHIEVEMENTS_CONFIG: AchievementsConfig = { hidden: {}, open: {} };

/**
 * HASTA QUÉ ÍNDICE ESTÁ ABIERTA UNA ESCALERA. Devuelve el último índice que se le enseña a CUALQUIERA, o -1 si
 * la escalera no tiene ni un escalón que ofrecer.
 *
 * LA REGLA: en cuanto UN usuario ve un escalón, ese escalón queda abierto PARA TODOS. No es una visibilidad por
 * persona —el que va en cabeza no abre una pantalla distinta de la del que empieza—: lo que hay es una sola línea
 * comunitaria, y se enseña igual a todo el mundo. Lo que cambia de una persona a otra es lo que tiene CONSEGUIDO,
 * no lo que ve.
 *
 * Y como para ver un escalón hay que tener el de debajo, la línea sale de un solo dato: el escalón más alto al
 * que ha llegado alguien. Lo alcanzado se ve (lo tiene alguien) y el siguiente que se ofrezca también (es su
 * reto). De ahí para arriba, nadie lo ha visto todavía y no se enseña.
 *
 * TÚ TAMBIÉN ERES «ALGUIEN», y esa es la pieza que hace que esto se pueda desplegar hoy: la línea es el máximo
 * entre lo que ha abierto la comunidad y lo que has abierto tú. Con el mapa vacío —sin espejos publicados, sin
 * sesión, sin red o sin Firebase— se queda exactamente en tu propio progreso, que es el comportamiento de
 * siempre. Nadie pierde un escalón ni se queda sin reto porque la configuración no llegue.
 *
 * Un RETIRADO no cuenta como escalón que ofrecer: no se le enseña a quien no lo tenga y deja pasar el turno al
 * siguiente (§6.4).
 */
export function openThrough(
  steps: readonly AchievementDef[],
  frontier: OpenFrontier,
  isEarned: (def: AchievementDef) => boolean,
): number {
  if (steps.length === 0) return -1;

  // Lo más lejos que ha llegado alguien: la comunidad, y tú.
  let reached = -1;
  const community = frontier[steps[0].ladder];
  if (community) {
    // Un `id` que no está en la escalera se ignora en vez de romper nada: puede venir de una versión anterior
    // del catálogo, y el lado seguro es «no lo tengo en cuenta», no «abro toda la escalera».
    const index = steps.findIndex((def) => def.id === community);
    if (index > reached) reached = index;
  }
  steps.forEach((def, index) => {
    if (index > reached && isEarned(def)) reached = index;
  });

  // Y un escalón más: el siguiente que se OFREZCA, que es el reto de quien está en la línea.
  for (let index = reached + 1; index < steps.length; index += 1) {
    if (!steps[index].retired) return index;
  }
  // Sin nada que ofrecer por encima, la escalera está abierta hasta donde se ha llegado y no más.
  return reached;
}

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
