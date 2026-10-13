// LO YA VISTO EN LA CAMPANA: qué «me gusta» recibidos se han enseñado ya en este dispositivo
// (docs/plan-notificaciones-y-buscador.md). Vive en `LocalMeta.seenLikes`, nunca se sube.
//
// SE PODA POR TAMAÑO, NO POR EXISTENCIA. Podar las claves que no aparecen en el directorio actual parece lo limpio,
// pero el directorio llega a medias a menudo (una amistad inactiva no se lee, un gist falla): sus claves se perderían y
// sus «me gusta» de siempre volverían a avisar en cuanto se leyeran. Con un tope, lo que cae es lo más antiguo.
import { getLocalMeta, patchLocalMeta } from './indexedDbRepository';

/** Cuántas claves se guardan como mucho. Cada una ronda los 80 caracteres: ~80 kB en el peor caso. */
export const SEEN_LIKES_MAX = 1000;

/** Las claves vistas de esta cuenta. Vacío si no hay o si IndexedDB no responde: entonces todo cuenta como nuevo. */
export async function getSeenLikeKeys(uid: string): Promise<Set<string>> {
  if (!uid) return new Set();
  const meta = await getLocalMeta();
  const seen = meta?.seenLikes;
  return new Set(seen && seen.uid === uid ? seen.keys : []);
}

/** Apunta claves como vistas, sin duplicar y con el tope de `SEEN_LIKES_MAX` (caen las más antiguas). */
export async function addSeenLikeKeys(uid: string, keys: readonly string[]): Promise<void> {
  if (!uid || keys.length === 0) return;
  const meta = await getLocalMeta();
  const previous = meta?.seenLikes?.uid === uid ? meta.seenLikes.keys : [];
  const fresh = new Set(keys);
  const next = [...previous.filter((key) => !fresh.has(key)), ...fresh].slice(-SEEN_LIKES_MAX);
  await patchLocalMeta({ seenLikes: { uid, keys: next } });
}
