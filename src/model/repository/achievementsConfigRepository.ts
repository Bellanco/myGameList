// CONFIGURACIÓN DEL CATÁLOGO DE LOGROS (`appConfig/achievements`), decidida desde el panel de administración y
// sin desplegar. Ver `core/achievements/visibility.ts` y firestore.rules. Lleva dos mapas:
//
//   · `hidden` — qué escaleras están ocultas para quien no las tiene.
//   · `open`   — hasta qué escalón ha abierto cada escalera la comunidad: en cuanto un usuario ve un escalón,
//                queda abierto para todo el mundo. Es el dato que ningún cliente puede calcular por su cuenta
//                (haría falta leerse los espejos de todos), y por eso viaja aquí.
//
// LOS DOS EN EL MISMO DOCUMENTO Y EN LA MISMA LECTURA: la app ya se bajaba este documento una vez por sesión
// para `hidden`, así que la apertura comunitaria no cuesta ni una petición más.
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
import {
  NO_ACHIEVEMENTS_CONFIG,
  type AchievementsConfig,
  type HiddenOverrides,
  type OpenFrontier,
} from '../../core/achievements/visibility';

const COLLECTION = 'appConfig';
const DOC_ID = 'achievements';

/** Cache de sesión. `null` = todavía no se ha leído. Se invalida al escribir, que es cuando puede cambiar. */
let cached: AchievementsConfig | null = null;

/** Solo booleanos y solo claves de escalera: lo que venga raro del documento se ignora en vez de propagarse. */
function sanitizeHidden(raw: unknown): HiddenOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && key) clean[key] = value;
  }
  return clean;
}

/**
 * Lo mismo para la apertura: clave de escalera → `id` de escalón. Se descarta lo que no sea una cadena con algo
 * dentro; un `id` que ya no exista en el catálogo lo ignora después `openThrough`, que es donde se sabe.
 */
function sanitizeOpen(raw: unknown): OpenFrontier {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && key && value.trim()) clean[key] = value.trim();
  }
  return clean;
}

/**
 * Lee la configuración. Ante cualquier problema devuelve los dos mapas vacíos, que es el lado seguro: manda el
 * catálogo, y cada quien abre su escalera con su propio progreso (el comportamiento de toda la vida).
 *
 * `force` la vuelve a pedir aunque esté en caché: lo usa el panel después de guardar, para no quedarse
 * enseñando el estado anterior.
 */
export async function loadAchievementsConfig(force = false): Promise<AchievementsConfig> {
  if (!force && cached) return cached;
  try {
    const services = await initializeFirebaseServices();
    if (!services) return NO_ACHIEVEMENTS_CONFIG;
    const snapshot = await getDoc(doc(services.firestore, COLLECTION, DOC_ID));
    const data = snapshot.exists() ? (snapshot.data() as { hidden?: unknown; open?: unknown }) : {};
    cached = { hidden: sanitizeHidden(data?.hidden), open: sanitizeOpen(data?.open) };
    return cached;
  } catch {
    // Sin permisos, sin red o sin documento: el catálogo manda.
    return cached || NO_ACHIEVEMENTS_CONFIG;
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

  const current = await loadAchievementsConfig(true);
  const next = { ...current.hidden, [key]: hidden };
  await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { hidden: next }, { merge: true });
  cached = { ...current, hidden: next };
  return next;
}

/**
 * PUBLICA HASTA DÓNDE HA ABIERTO CADA ESCALERA LA COMUNIDAD. Solo el admin puede (lo impone la regla).
 *
 * Se escribe el mapa ENTERO y no escalera a escalera: sale de una sola medición de los espejos del censo, así
 * que partirlo en cincuenta escrituras solo serviría para dejarlo a medias si una falla. Si falla, LANZA: el
 * panel tiene que decir que no se ha guardado.
 */
export async function publishOpenFrontier(open: OpenFrontier): Promise<OpenFrontier> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');

  const current = await loadAchievementsConfig(true);
  await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { open }, { merge: true });
  cached = { ...current, open };
  return open;
}
