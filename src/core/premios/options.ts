/**
 * Construcción de los nominados de una categoría con ids ESTABLES.
 *
 * El `optionId` es la clave con la que se guardan los votos y los ganadores, así que tiene dos obligaciones que
 * conviven mal:
 *
 *  - **Estable**: un nominado que ya existía conserva su id al editar la categoría, o los votos emitidos dejarían
 *    de apuntar a él.
 *  - **Único**: dos nominados de la misma categoría no pueden compartir id, o la búsqueda por id devolvería
 *    siempre el primero y el recuento sería falso.
 *
 * ⚠️ NUNCA DERIVES UN `optionId` DEL ÍNDICE DEL ARRAY. Así se hacía antes (`<categoría>_option_<n>`) y rompe la
 * segunda: al borrar el nominado 0 y añadir otro, el nuevo recibe `_option_1`, que es el id que ya tenía un
 * superviviente — y a partir de ahí los votos de uno cuentan para el otro. El respaldo por índice de
 * `localize.getOptionId` existe solo para LEER datos viejos sin id.
 */

/** Genera un identificador irrepetible. `crypto.randomUUID` cuando está; si no, el equivalente a mano. */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Un nominado tal y como sale del formulario del panel. */
export interface PremiosOptionForm {
  /** Id que ya tenía, si lo tenía. */
  id?: string | null;
  value: string;
}

/**
 * Construye la lista de nominados de una categoría a partir del formulario.
 *
 * Conserva el id de los que ya lo tenían y da uno irrepetible a los nuevos —y a cualquier duplicado que llegue de
 * datos antiguos, que es la otra forma de acabar con dos nominados compartiendo id—.
 *
 * `generateId` se inyecta para poder probar la construcción sin depender del azar.
 */
export function buildStableOptions(
  formOptions: PremiosOptionForm[] | null | undefined,
  docId: string,
  generateId: () => string = generateUUID,
): Array<{ id: string; name: string }> {
  const usedIds = new Set<string>();

  return (formOptions || []).map((option) => {
    const canKeepId = Boolean(option.id) && !usedIds.has(option.id as string);
    const id = canKeepId ? (option.id as string) : `${docId}_option_${generateId()}`;
    usedIds.add(id);
    return { id, name: (option.value || '').trim() };
  });
}
