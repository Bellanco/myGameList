// El estado de la guía de primeros pasos, guardado en ESTE dispositivo (ver `ONBOARDING_KEY`).
//
// Es un `createPreferenceStore` sin réplica en la nube, y guarda el JSON tal cual: la fábrica exige que `get()`
// devuelva un primitivo para valer como snapshot de `useSyncExternalStore`, así que el texto se interpreta en
// quien lo lee (`parseTourState`), no aquí.
import { GIST_CFG_KEY, ONBOARDING_KEY, STORAGE_KEY } from '../../core/constants/storageKeys';
import { LEGACY_STORAGE_KEYS } from '../migration/legacyLocalStorage';
import { serializeTourState, type TourState } from '../../core/onboarding/tourState';
import { createPreferenceStore } from './preferenceStore';

export const onboardingStore = createPreferenceStore<string>({
  key: ONBOARDING_KEY,
  parse: (raw) => raw ?? '',
  serialize: (value) => value,
});

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
