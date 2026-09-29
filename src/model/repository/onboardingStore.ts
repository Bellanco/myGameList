// El estado de la guía de primeros pasos, guardado en ESTE dispositivo (ver `ONBOARDING_KEY`).
//
// Tiene la forma de las preferencias (`get` / `set` / `subscribe`, para `useSyncExternalStore`), pero NO sale de
// `createPreferenceStore` a propósito: esa fábrica trae la réplica en la nube y, con ella, un chunk más en el
// arranque de todo el mundo —medido: 18 → 19 ficheros— para una guía que casi nadie tiene en marcha. `get()`
// devuelve el JSON tal cual (un primitivo, como pide el snapshot), y lo interpreta quien lo lee (`parseTourState`).
import { GIST_CFG_KEY, ONBOARDING_KEY, STORAGE_KEY } from '../../core/constants/storageKeys';
import { LEGACY_STORAGE_KEYS } from '../migration/legacyLocalStorage';
import { serializeTourState, type TourState } from '../../core/onboarding/tourState';

const listeners = new Set<() => void>();

export const onboardingStore = {
  get(): string {
    try {
      return localStorage.getItem(ONBOARDING_KEY) ?? '';
    } catch {
      return '';
    }
  },
  set(value: string): void {
    try {
      localStorage.setItem(ONBOARDING_KEY, value);
    } catch {
      // Sin persistencia la guía sigue funcionando en esta visita; solo no se recordará.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function saveTourState(state: TourState): void {
  onboardingStore.set(serializeTourState(state));
}

/**
 * ¿Había en este navegador rastro de la aplicación ANTES de arrancar? Las listas (también en sus claves viejas,
 * que la carga migra al vuelo) o una sincronización configurada.
 *
 * Se pregunta UNA vez, al evaluar `App`, y no al decidir si se ofrece la guía: para entonces la carga ya puede
 * haber escrito la clave de las listas, y quien llega por primera vez parecería alguien que vuelve. Es la primera
 * de las dos llaves de «primera visita»; la otra —que las listas estén vacías una vez cargadas— la pone `App`, y
 * cubre lo que solo está en IndexedDB.
 */
export function hadLocalFootprint(): boolean {
  try {
    return [STORAGE_KEY, ...LEGACY_STORAGE_KEYS, GIST_CFG_KEY].some((key) => localStorage.getItem(key) !== null);
  } catch {
    // Sin almacenamiento no hay forma de saberlo, y tampoco de recordar la guía: mejor no ofrecerla.
    return true;
  }
}
