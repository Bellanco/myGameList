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
  type PendingSteps,
} from '../../core/achievements/visibility';

const COLLECTION = 'appConfig';
const DOC_ID = 'achievements';

/**
 * Tope de escalones pendientes por escalera. No es una limitación de producto: es que esto es una nota de
 * trabajo —lo que hay que llevar al código— y una escalera con veinte umbrales pendientes es un rediseño, no una
 * inserción. La regla de Firestore acota el documento entero por su lado.
 */
const PENDING_STEPS_PER_LADDER = 10;

/** Cache de sesión. `null` = todavía no se ha leído. Se invalida al escribir, que es cuando puede cambiar. */
let cached: AchievementsConfig | null = null;

/**
 * La lectura EN VUELO, para que varias pantallas pidiendo a la vez sean una sola petición. Hace falta desde que
 * la apertura la necesitan cuatro sitios —el listado, la ficha de otra persona, el catálogo global y el hub— que
 * pueden montarse en el mismo render: la caché se siembra al RESOLVER, así que sin esto cada uno se traía el
 * documento por su cuenta.
 */
let inFlight: Promise<AchievementsConfig> | null = null;

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
 * Lo mismo para los escalones PENDIENTES: clave de escalera → umbrales. Se descarta lo que no sea un entero
 * positivo y se ordena, porque es como se van a leer siempre; el tope por escalera evita que una nota de trabajo
 * se convierta en un almacén. Un umbral que ya esté en el código lo descarta el panel, que es quien tiene el
 * catálogo delante.
 */
function sanitizePendingSteps(raw: unknown): PendingSteps {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !Array.isArray(value)) continue;
    const steps = value
      .map((step) => Number(step))
      .filter((step) => Number.isInteger(step) && step > 0)
      .filter((step, index, all) => all.indexOf(step) === index)
      .sort((a, b) => a - b)
      .slice(0, PENDING_STEPS_PER_LADDER);
    if (steps.length > 0) clean[key] = steps;
  }
  return clean;
}

/**
 * Lee la configuración. Ante cualquier problema devuelve los tres mapas vacíos, que es el lado seguro: manda el
 * catálogo, y cada quien abre su escalera con su propio progreso (el comportamiento de toda la vida).
 *
 * `force` la vuelve a pedir aunque esté en caché: lo usa el panel después de guardar, para no quedarse
 * enseñando el estado anterior.
 */
export async function loadAchievementsConfig(force = false): Promise<AchievementsConfig> {
  if (!force && cached) return cached;
  if (!force && inFlight) return inFlight;

  const request = (async () => {
    try {
      const services = await initializeFirebaseServices();
      if (!services) return NO_ACHIEVEMENTS_CONFIG;
      const snapshot = await getDoc(doc(services.firestore, COLLECTION, DOC_ID));
      const data = snapshot.exists()
        ? (snapshot.data() as { hidden?: unknown; open?: unknown; pendingSteps?: unknown })
        : {};
      cached = {
        hidden: sanitizeHidden(data?.hidden),
        open: sanitizeOpen(data?.open),
        pendingSteps: sanitizePendingSteps(data?.pendingSteps),
      };
      return cached;
    } catch {
      // Sin permisos, sin red o sin documento: el catálogo manda.
      return cached || NO_ACHIEVEMENTS_CONFIG;
    }
  })();

  inFlight = request;
  try {
    return await request;
  } finally {
    inFlight = null;
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
 * GUARDA LOS ESCALONES PENDIENTES de una escalera, para todos los administradores. Solo el admin puede (lo impone
 * la regla, no esta función).
 *
 * NO ES CATÁLOGO: nada de esto entra en `catalog.ts`, así que un umbral guardado aquí no existe para el
 * evaluador, ni para la fracción, ni para el espejo, ni para la pantalla de logros de nadie (ver `PendingSteps`).
 * Es la nota de «esto hay que llevarlo al código», compartida en vez de apuntada en un papel.
 *
 * Se escribe la LISTA ENTERA de esa escalera y se devuelve el mapa resultante, para que el panel pinte lo que de
 * verdad ha quedado guardado en vez de lo que creía. Una lista vacía borra la entrada: así «quitar el último»
 * deja el documento como estaba y no una escalera con una lista vacía dentro. Si falla, LANZA: el admin tiene
 * que enterarse.
 */
export async function setPendingSteps(ladderKey: string, steps: readonly number[]): Promise<PendingSteps> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');

  const current = await loadAchievementsConfig(true);
  const limpio = sanitizePendingSteps({ [ladderKey]: steps })[ladderKey] || [];
  const next: Record<string, readonly number[]> = { ...current.pendingSteps };
  if (limpio.length > 0) next[ladderKey] = limpio;
  else delete next[ladderKey];

  await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { pendingSteps: next }, { merge: true });
  cached = { ...current, pendingSteps: next };
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

/**
 * ADELANTA LA FRONTERA COMUNITARIA DESDE EL CLIENTE, que es lo que hace que el denominador sea el mismo en todos
 * los aparatos: en cuanto alguien alcanza un escalón, su propio navegador lo abre para el resto.
 *
 * ESCRIBE SOLO `open`, y las reglas no le dejan más: `hidden` sigue siendo del administrador (es una decisión de
 * producto, no una medición), y la regla exige además que no se pierda ninguna escalera ya abierta.
 *
 * BEST-EFFORT Y EN SILENCIO, al contrario que las dos de arriba: aquí no hay un administrador mirando. Sin
 * sesión, sin red o con las reglas denegando, la frontera se queda como estaba —cada cliente sigue abriendo con
 * su propio progreso, el comportamiento anterior— y se reintenta en la apertura siguiente. Nada de lo que el
 * usuario esté haciendo depende de esta escritura.
 *
 * El mapa que se pasa ya viene FUSIONADO con lo publicado (`mergeFrontiers`): esta función no decide, escribe.
 */
export async function advanceOpenFrontier(open: OpenFrontier): Promise<void> {
  try {
    const services = await initializeFirebaseServices();
    if (!services) return;
    const current = await loadAchievementsConfig();
    await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { open }, { merge: true });
    // La caché de sesión se pone al día para que la pantalla no vuelva a creer que hay algo que publicar.
    cached = { ...current, open };
  } catch {
    // Se queda sin abrir para los demás hasta la próxima. Nadie pierde nada de lo suyo por esto.
  }
}
