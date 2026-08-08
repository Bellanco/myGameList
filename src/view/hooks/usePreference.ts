import { useSyncExternalStore } from 'react';
import type { PreferenceStore } from '../../model/repository/preferenceStore';

/**
 * Lee una preferencia de forma reactiva. Es el único puente entre los stores y React, y sustituye al patrón
 * anterior (`useState` + evento propio en `window` por preferencia).
 *
 * `useSyncExternalStore` es la API pensada exactamente para esto y arregla de paso el agujero del patrón viejo:
 * la suscripción vivía en un `useEffect`, así que un cambio ocurrido entre el primer render y el montaje —la
 * hidratación desde la nube, sin ir más lejos— podía perderse y dejar el componente mostrando un valor caduco.
 *
 * Tercer argumento (snapshot de servidor) = `store.get` porque no hay SSR: todo se renderiza en el navegador.
 */
export function usePreference<T>(store: PreferenceStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
