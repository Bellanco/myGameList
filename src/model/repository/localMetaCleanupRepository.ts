// LIMPIEZA DE `LocalMeta`: lo que se retiró y los dispositivos siguen guardando. Módulo aparte de
// `indexedDbRepository` porque ese viaja en el arranque y esto solo lo carga `IdleWork`, una vez por dispositivo.
import { META_KEY, META_STORE, openSharedDatabase } from './idbConnectionRepository';

/**
 * Claves de `LocalMeta` que ya no usa nadie y que los dispositivos siguen guardando: `patchLocalMeta` solo añade, así
 * que lo retirado se quedaba para siempre. Si se retira otra, se añade aquí (y se cambia la marca de
 * `LEGACY_META_CLEANUP_KEY` para que los dispositivos ya limpios vuelvan a pasar).
 *   · `achievementsPeerSeen`: la línea base del feed de logros, retirada el 10-10-2026
 *     (docs/plan-feed-sin-vacio.md, Fase 5).
 */
const LEGACY_LOCAL_META_KEYS = ['achievementsPeerSeen'] as const;

/**
 * Quita de `LocalMeta` las claves retiradas, dentro de una transacción (leer y escribir en el mismo paso, para no
 * pisar lo que otra pestaña escriba a la vez). Sin nada que quitar no escribe. Devuelve cuántas ha quitado.
 */
export async function removeLegacyLocalMetaKeys(): Promise<number> {
  const db = await openSharedDatabase();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    const getReq = store.get(META_KEY);
    let removed = 0;
    getReq.onsuccess = () => {
      const current = getReq.result as Record<string, unknown> | undefined;
      if (!current) return;
      const next = { ...current };
      for (const key of LEGACY_LOCAL_META_KEYS) {
        if (key in next) {
          delete next[key];
          removed += 1;
        }
      }
      if (removed > 0) store.put(next);
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error || new Error('removeLegacyLocalMetaKeys failed'));
    tx.onabort = () => reject(tx.error || new Error('removeLegacyLocalMetaKeys aborted'));
  });
}
