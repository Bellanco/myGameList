/**
 * Las categorías de premio y sus nominados: cargar, guardar, borrar y reordenar.
 *
 * La colección es de lectura para cualquiera con sesión —hace falta para poder votar— y de escritura solo para el
 * administrador. Por eso el ganador NO vive aquí: ver `premiosWinnersRepository`.
 */
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore/lite';
import { isArchivableCategory } from '../../../core/premios/archivable';
import { hasTitle, tField } from '../../../core/premios/localize';
import { buildStableOptions, generateUUID, type PremiosOptionForm } from '../../../core/premios/options';
import type { PremiosCategory } from '../../types/premios';
import { CATEGORIES_COLLECTION, requireServices } from './premiosShared';

/**
 * Carga todas las categorías, ordenadas.
 *
 * DOS SALVAGUARDAS QUE NO SON ADORNO:
 *
 *  1. **Los duplicados por título se descartan siempre en memoria, pero solo se BORRAN si lo pide el
 *     administrador.** La ruta de lectura pública no puede escribir en la base de datos.
 *  2. **Tope de seguridad**: si el borrado alcanzara a la mitad o más de la colección, casi seguro es un falso
 *     positivo por datos sin migrar —un cambio de formato que deje los títulos sin resolver los agruparía todos
 *     juntos—. En ese caso no se borra nada, y tampoco se ocultan en memoria: es preferible enseñar duplicados un
 *     rato que quedarse sin categorías y sin poder votar.
 *
 * Ante un error de lectura devuelve una lista vacía en vez de lanzar: la pantalla sabe decir «no hay categorías»,
 * y un fallo de red no debería tumbar la sección entera.
 */
export async function loadAndSortCategories(
  includeInvalid = false,
  autoCleanDuplicates = false,
): Promise<PremiosCategory[]> {
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDocs(collection(firestore, CATEGORIES_COLLECTION));

    const allDocs = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Array<PremiosCategory & { isPlaceholder?: boolean; updatedAt?: string; createdAt?: string }>;

    // Duplicados por TÍTULO, conservando el más reciente. El título puede ser bilingüe o una cadena antigua.
    const titleGroups = new Map<string, typeof allDocs>();
    allDocs.forEach((category) => {
      if (!hasTitle(category)) return; // un placeholder vacío no es un duplicado
      const key = (tField(category.title, 'es') || tField(category.title, 'en')).trim().toLowerCase();
      if (!key) return;
      const group = titleGroups.get(key) || [];
      group.push(category);
      titleGroups.set(key, group);
    });

    const toDelete: string[] = [];
    titleGroups.forEach((group) => {
      if (group.length <= 1) return;
      group.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      toDelete.push(...group.slice(1).map((category) => category.id));
    });

    const safeToDelete =
      toDelete.length > 0 && toDelete.length < Math.ceil(allDocs.length / 2) ? toDelete : [];

    if (autoCleanDuplicates && safeToDelete.length > 0) {
      const { firestore: db } = await requireServices();
      for (const docId of safeToDelete) {
        await deleteDoc(doc(db, CATEGORIES_COLLECTION, docId)).catch(() => {
          // Un duplicado que no se deja borrar no puede impedir cargar el resto.
        });
      }
    }

    const filtered = allDocs.filter((category) => !safeToDelete.includes(category.id));

    const valid = includeInvalid ? filtered : filtered.filter(isArchivableCategory);

    return sortCategoriesByOrder(valid);
  } catch {
    return [];
  }
}

/** Ordena por `orderIndex`, de menor a mayor. Sin índice cuenta como 0. */
export function sortCategoriesByOrder<T extends { orderIndex?: number }>(categories: T[]): T[] {
  if (!Array.isArray(categories)) return [];
  return [...categories].sort((a, b) => {
    const indexA = typeof a.orderIndex === 'number' ? a.orderIndex : 0;
    const indexB = typeof b.orderIndex === 'number' ? b.orderIndex : 0;
    return indexA - indexB;
  });
}

export interface SaveCategoryParams {
  /** Id existente, o `null` para crear una categoría nueva. */
  docId?: string | null;
  titleEs: string;
  /** Si va vacío, cae al español: una categoría sin traducir es mejor que una sin título. */
  titleEn?: string;
  options: PremiosOptionForm[];
  weight: number;
  /** Solo para categorías nuevas. */
  orderIndex?: number;
}

/**
 * Guarda una categoría, nueva o existente.
 *
 * Los ids de los nominados se construyen con `buildStableOptions`: los que ya existían conservan el suyo —los
 * votos emitidos siguen apuntando a ellos— y los nuevos reciben uno irrepetible.
 *
 * `merge: true` SIEMPRE, y al editar no se tocan `orderIndex`, `createdAt` ni `isActive`: sin eso, guardar una
 * categoría le borraba su orden.
 */
export async function saveCategory({
  docId,
  titleEs,
  titleEn = '',
  options,
  weight,
  orderIndex,
}: SaveCategoryParams): Promise<{ docId: string; isNew: boolean }> {
  const isNew = !docId;
  const id = docId || generateUUID();

  const { firestore } = await requireServices();
  const builtOptions = buildStableOptions(options, id);
  const now = new Date().toISOString();

  await setDoc(
    doc(firestore, CATEGORIES_COLLECTION, id),
    {
      title: {
        es: titleEs.trim(),
        en: titleEn.trim() || titleEs.trim(),
      },
      options: builtOptions,
      // Espejo plano de los ids, por compatibilidad con lecturas antiguas.
      optionIds: builtOptions.map((option) => option.id),
      weight,
      // DEJA DE SER EL DOCUMENTO VACÍO. Borrar la última categoría con título convierte su documento en un
      // placeholder; si después se reutiliza para escribir una categoría de verdad, la marca se quedaba puesta y
      // la categoría no se archivaba ni se podía votar —pero sí pedía ganador en el panel—.
      isPlaceholder: false,
      updatedAt: now,
      ...(isNew ? { orderIndex, createdAt: now, isActive: true } : {}),
    },
    { merge: true },
  );

  return { docId: id, isNew };
}

/**
 * Borra una categoría.
 *
 * Si es la ÚLTIMA con título, en vez de borrarla se convierte en un placeholder vacío: una colección sin
 * documentos deja de existir en Firestore, y con ella se va el rastro de la colección en la consola.
 */
export async function deleteCategory(docId: string, isLastWithTitle: boolean): Promise<{ kept: boolean }> {
  const { firestore } = await requireServices();

  if (isLastWithTitle) {
    const now = new Date().toISOString();
    await setDoc(doc(firestore, CATEGORIES_COLLECTION, docId), {
      title: { es: '', en: '' },
      options: [],
      optionIds: [],
      weight: 1,
      isPlaceholder: true,
      createdAt: now,
      updatedAt: now,
    });
    return { kept: true };
  }

  await deleteDoc(doc(firestore, CATEGORIES_COLLECTION, docId));
  return { kept: false };
}

/**
 * Reasigna un `orderIndex` contiguo (0..n-1) en un único lote: una secuencia limpia, sin huecos ni repetidos.
 */
export async function reorderCategories(
  orderedCategories: Array<{ id: string }>,
): Promise<{ reordered: number }> {
  const { firestore } = await requireServices();
  const updatedAt = new Date().toISOString();
  const batch = writeBatch(firestore);

  orderedCategories.forEach((category, index) => {
    batch.update(doc(firestore, CATEGORIES_COLLECTION, category.id), { orderIndex: index, updatedAt });
  });

  await batch.commit();
  return { reordered: orderedCategories.length };
}
