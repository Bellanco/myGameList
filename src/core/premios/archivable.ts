/**
 * QUÉ CATEGORÍAS CUENTAN AL PUBLICAR, y cuáles se han quedado sin ganador.
 *
 * Existe porque el criterio estaba escrito CUATRO VECES —en el panel, en la pestaña de ganadores, en la carga de
 * categorías y en `readLiveEdition`— y no decían todas lo mismo: el panel daba por votable cualquier categoría
 * con nominados, mientras que lo que de verdad entra en el archivo descarta además los placeholders y las que no
 * tienen título. Una categoría sin título con nominados exigía ganador para publicar y luego no se archivaba.
 *
 * Y UN GANADOR PUEDE QUEDARSE HUÉRFANO: se marca, y después se le quitan los nominados a la categoría o se borra
 * justo ese. El mapa sigue guardando su id, así que contarlo por la simple presencia de la clave daba por marcada
 * una categoría que en el recuento no puntúa a nadie. Aquí se comprueba que el id siga existiendo.
 */
import type { PremiosCategory, PremiosWinnersMap } from '../../model/types/premios';
import { getOptionById, hasTitle, resolveOptionId } from './localize';

/**
 * ¿Esta categoría entra en el archivo publicado?
 *
 * Es el MISMO filtro de `readLiveEdition`, que es quien lo decide de verdad al publicar: sin título o sin
 * nominados no hay nada que archivar, y un placeholder es el documento vacío que se deja para que la colección
 * no desaparezca de Firestore.
 */
export function isArchivableCategory(category: PremiosCategory | null | undefined): boolean {
  if (!category) return false;
  return !category.isPlaceholder && hasTitle(category) && (category.options?.length || 0) > 0;
}

/** Las categorías que se van a archivar, que son las únicas que pueden tener ganador. */
export function archivableCategories(
  categories: PremiosCategory[] | null | undefined,
): PremiosCategory[] {
  return (categories || []).filter(isArchivableCategory);
}

/**
 * Valida un ganador GUARDADO: devuelve su id estable si el nominado sigue existiendo, y cadena vacía si no.
 *
 * Acepta lo que sea que se guardara —id nuevo o nombre viejo—, como el resto del recuento.
 */
export function resolveWinnerId(
  category: PremiosCategory | null | undefined,
  stored: string | null | undefined,
): string {
  if (!category || !stored) return '';
  const optionId = resolveOptionId(category, stored);
  return getOptionById(category, optionId) ? optionId : '';
}

/**
 * Ganador VÁLIDO de una categoría, mirando el mapa y, si no está ahí, el campo embebido.
 *
 * El respaldo por `category.winner` es el mismo del recuento: los archivos históricos y los datos sin migrar lo
 * llevan dentro de la categoría.
 */
export function getValidWinnerId(
  category: PremiosCategory | null | undefined,
  winners: PremiosWinnersMap | null | undefined,
): string {
  if (!category) return '';
  return resolveWinnerId(category, winners?.[category.id] || category.winner || '');
}

/** Las categorías del archivo que se han quedado sin ganador. Mientras quede una, no se publica. */
export function categoriesMissingWinner(
  categories: PremiosCategory[] | null | undefined,
  winners: PremiosWinnersMap | null | undefined,
): PremiosCategory[] {
  return archivableCategories(categories).filter((category) => !getValidWinnerId(category, winners));
}
