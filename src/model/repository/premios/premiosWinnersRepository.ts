/**
 * Los ganadores de la edición en curso, antes de publicarla.
 *
 * Viven en UN solo documento —`premiosAdmin/winners`, con la forma `{ winners: { categoría: optionId }, updatedAt }`—
 * que solo lee y escribe el administrador.
 *
 * POR QUÉ NO EN LA CATEGORÍA: el ganador fue un campo de `categories`, pero esa colección tiene que ser legible
 * para poder votar, y **las reglas de Firestore protegen documentos enteros, no campos sueltos**. El resultado
 * era que cualquiera podía leer los ganadores en cuanto se marcaban, mucho antes del anuncio. El único canal
 * público de los ganadores es el archivo publicado.
 */
import { deleteDoc, deleteField, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore/lite';
import { resolveWinnerId } from '../../../core/premios/archivable';
import type { PremiosCategory, PremiosWinnersMap } from '../../types/premios';
import {
  ADMIN_COLLECTION,
  ADMIN_WINNERS_DOC,
  CATEGORIES_COLLECTION,
  requireServices,
} from './premiosShared';

/** Tope de operaciones por lote que admite Firestore. */
const BATCH_LIMIT = 500;

/**
 * Ganadores de la edición en curso.
 *
 * Si el documento todavía no existe, reconstruye el mapa desde el campo `winner` de las categorías que se le
 * pasen. Es la ruta de MIGRACIÓN: las categorías que lleguen del modelo anterior siguen enseñando sus ganadores,
 * y el primer guardado los traslada al sitio bueno.
 */
export async function fetchWinners(categories: PremiosCategory[] = []): Promise<PremiosWinnersMap> {
  const { firestore } = await requireServices();
  const snapshot = await getDoc(doc(firestore, ADMIN_COLLECTION, ADMIN_WINNERS_DOC));
  if (snapshot.exists()) {
    return (snapshot.data()?.winners || {}) as PremiosWinnersMap;
  }

  const legacy: PremiosWinnersMap = {};
  (categories || []).forEach((category) => {
    if (category?.id && category.winner) legacy[category.id] = category.winner;
  });
  return legacy;
}

export interface SaveWinnersResult {
  saved: number;
  skipped: number;
  migrated: number;
}

/**
 * Guarda los ganadores de TODAS las categorías en una sola escritura.
 *
 * Fue una escritura por categoría: con veinticinco categorías, veinticinco viajes al servidor y, si fallaba a
 * medias, ganadores a medias. Ahora es un documento: o se guarda entero o no se guarda.
 *
 * Y ARRASTRA LA MIGRACIÓN, borrando el campo `winner` de las categorías que todavía lo tengan. Mientras ese campo
 * siga en una colección legible, el ganador sigue siendo consultable — que es justo el agujero que esto cierra.
 */
export async function saveWinners(
  categories: PremiosCategory[],
  winners: PremiosWinnersMap,
): Promise<SaveWinnersResult> {
  const { firestore } = await requireServices();

  // Solo las categorías CON nominados pueden tener ganador; el resto ni entra en el mapa.
  const writable = (categories || []).filter((category) => category?.id && category.options?.length > 0);
  const skipped = (categories || []).length - writable.length;

  // Y SE CAEN LOS GANADORES HUÉRFANOS: se marcó uno y después se le quitó ese nominado a la categoría. El id
  // seguía en el mapa, así que la categoría pasaba por marcada cuando en el recuento no puntúa a nadie.
  const clean: PremiosWinnersMap = {};
  writable.forEach((category) => {
    const optionId = resolveWinnerId(category, winners?.[category.id]);
    if (optionId) clean[category.id] = optionId;
  });

  await setDoc(doc(firestore, ADMIN_COLLECTION, ADMIN_WINNERS_DOC), {
    winners: clean,
    updatedAt: new Date().toISOString(),
  });

  const migrated = await clearLegacyWinnerField(categories);

  return { saved: Object.keys(clean).length, skipped, migrated };
}

/**
 * Borra el campo `winner` de las categorías que lo conserven del modelo anterior. Idempotente: si no queda
 * ninguna, no escribe nada.
 */
export async function clearLegacyWinnerField(categories: PremiosCategory[]): Promise<number> {
  const stale = (categories || []).filter((category) => category?.id && category.winner);
  if (stale.length === 0) return 0;

  const { firestore } = await requireServices();
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const category of stale.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(firestore, CATEGORIES_COLLECTION, category.id), {
        winner: deleteField(),
        winnerSelectedAt: deleteField(),
      });
    }
    await batch.commit();
  }

  return stale.length;
}

/** Borra los ganadores de la edición en curso. Parte del reinicio entre ediciones. */
export async function clearWinners(): Promise<void> {
  const { firestore } = await requireServices();
  await deleteDoc(doc(firestore, ADMIN_COLLECTION, ADMIN_WINNERS_DOC));
}
