// CONFIGURACIÓN DEL CATÁLOGO DE LOGROS (`appConfig/achievements`): qué escaleras están ocultas, decidido desde
// el panel de administración y sin desplegar. Ver `core/achievements/visibility.ts` y firestore.rules.
//
// UNA LECTURA POR SESIÓN, cacheada en este módulo. No hay tiempo real y no lo va a haber: la app usa
// `firebase/firestore/lite`, que NO tiene `onSnapshot` (y `ci-validate` lo vigila a propósito), así que el
// cambio del panel se ve en la siguiente apertura de la pantalla de logros de cada usuario. Para algo que se
// toca dos veces al año, un listener abierto en todos los dispositivos sería un precio absurdo.
//
// NUNCA LANZA AL LEER. Sin Firebase configurado, sin sesión, sin red o con las reglas denegando, devuelve el
// mapa vacío y la app cae a lo que dice el código: un logro oculto sigue oculto. El lado seguro es ese, y por eso
// el fallo es silencioso aquí y ruidoso al ESCRIBIR (donde el admin tiene que saber que no se ha guardado).
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { initializeFirebaseServices } from './firebaseClient';
import type { HiddenOverrides } from '../../core/achievements/visibility';

const COLLECTION = 'appConfig';
const DOC_ID = 'achievements';

/** Cache de sesión. `null` = todavía no se ha leído. Se invalida al escribir, que es cuando puede cambiar. */
let cached: HiddenOverrides | null = null;

/** Solo booleanos y solo claves de escalera: lo que venga raro del documento se ignora en vez de propagarse. */
function sanitize(raw: unknown): HiddenOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && key) clean[key] = value;
  }
  return clean;
}

/**
 * Lee la configuración. Devuelve `{}` ante cualquier problema, que es «lo que diga el catálogo».
 *
 * `force` la vuelve a pedir aunque esté en caché: lo usa el panel después de guardar, para no quedarse
 * enseñando el estado anterior.
 */
export async function loadHiddenOverrides(force = false): Promise<HiddenOverrides> {
  if (!force && cached) return cached;
  try {
    const services = await initializeFirebaseServices();
    if (!services) return {};
    const snapshot = await getDoc(doc(services.firestore, COLLECTION, DOC_ID));
    const data = snapshot.exists() ? (snapshot.data() as { hidden?: unknown }) : {};
    cached = sanitize(data?.hidden);
    return cached;
  } catch {
    // Sin permisos, sin red o sin documento: el catálogo manda.
    return cached || {};
  }
}

/**
 * Muestra u oculta una escalera para TODO EL MUNDO. Solo el admin puede (lo impone la regla, no esta función).
 *
 * Escribe el mapa completo con `merge` y devuelve el estado resultante, para que el panel pinte lo que de verdad
 * ha quedado guardado en vez de lo que creía. Si falla, LANZA: el admin tiene que enterarse.
 */
export async function setLadderHidden(key: string, hidden: boolean): Promise<HiddenOverrides> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');

  const current = await loadHiddenOverrides(true);
  const next = { ...current, [key]: hidden };
  await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { hidden: next }, { merge: true });
  cached = next;
  return next;
}
