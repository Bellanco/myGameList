/**
 * Identidad de una edición: su identificador y su nombre.
 *
 * Una edición FUE un año: el archivo se guardaba en `results/{año}` y no cabían dos en el mismo año. Ahora cada
 * una tiene identificador propio (`2026`, `2026-verano`…) y un nombre para mostrar, y el año es un dato más. Eso
 * es lo que permite «Reto de invierno» y «Reto de verano» a la vez.
 *
 * Todo tolera lo antiguo: una edición archivada sin identificador ni nombre usa su año para las dos cosas.
 */

/** Longitud máxima del identificador: es el id de un documento de Firestore. */
export const MAX_SEASON_ID_LENGTH = 40;

/**
 * Convierte un texto en un identificador usable como id de documento.
 *
 * Firestore rechaza la barra en un id, y los espacios y los acentos se llevan mal con las URLs: se normaliza a
 * minúsculas, sin diacríticos y con guiones. Devuelve cadena vacía si no queda nada aprovechable.
 */
export function toSeasonId(texto: string | null | undefined): string {
  return String(texto || '')
    .normalize('NFD')
    // Quita los diacríticos YA SEPARADOS por la normalización anterior (el bloque Unicode de marcas combinantes).
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SEASON_ID_LENGTH)
    // Otra vez al final: el corte por longitud puede dejar un guión colgando.
    .replace(/-+$/g, '');
}

/** Lo mínimo que hace falta saber de una edición para nombrarla. */
export interface PremiosSeasonLike {
  seasonId?: string;
  seasonName?: string;
  name?: string;
  season?: number | string;
  id?: string;
}

/**
 * Identificador de la edición en curso. Sin él, el año: es lo que usaban las ediciones anteriores.
 */
export function getSeasonId(config: PremiosSeasonLike | null | undefined): string {
  return toSeasonId(config?.seasonId) || String(config?.season || new Date().getFullYear());
}

/**
 * Nombre visible de una edición, sea la activa o una archivada. Sin nombre, cae al año, que es lo único que
 * tenían las antiguas.
 */
export function getSeasonLabel(edicion: PremiosSeasonLike | null | undefined): string {
  const nombre = (edicion?.name || edicion?.seasonName || '').trim();
  if (nombre) return nombre;
  return String(edicion?.season || edicion?.seasonId || edicion?.id || '');
}
