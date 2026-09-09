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
import { applyExtraSteps } from '../../core/achievements/catalog';
import type { ExtraSteps } from '../../core/achievements/types';

const COLLECTION = 'appConfig';
const DOC_ID = 'achievements';

/**
 * Tope de escalones extra por escalera. Cada uno viaja en la COLA del espejo por su `id` —unos veinte caracteres
 * de los 1.024 que valida la regla— así que el tope no es cosmético: es lo que impide que ampliar el catálogo
 * desde el panel empiece a comerse las fechas de los demás logros. Diez por escalera es de sobra para insertar
 * umbrales; una escalera que necesite más es un rediseño, y eso se hace en el código.
 */
const EXTRA_STEPS_PER_LADDER = 10;

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
 * Lo mismo para los escalones EXTRA: clave de escalera → umbrales. Se descarta lo que no sea un entero positivo
 * y se ordena, porque es como se van a leer siempre; el tope por escalera acota cuánto puede crecer el catálogo
 * sin desplegar. Un umbral que ya esté declarado en el código lo descarta `applyExtraSteps`, que es quien tiene
 * el catálogo delante.
 */
function sanitizeExtraSteps(raw: unknown): ExtraSteps {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !Array.isArray(value)) continue;
    const steps = value
      .map((step) => Number(step))
      .filter((step) => Number.isInteger(step) && step > 0)
      .filter((step, index, all) => all.indexOf(step) === index)
      .sort((a, b) => a - b)
      .slice(0, EXTRA_STEPS_PER_LADDER);
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
        ? (snapshot.data() as { hidden?: unknown; open?: unknown; extraSteps?: unknown })
        : {};
      cached = {
        hidden: sanitizeHidden(data?.hidden),
        open: sanitizeOpen(data?.open),
        extraSteps: sanitizeExtraSteps(data?.extraSteps),
      };
      // EL CATÁLOGO SE RECONSTRUYE AQUÍ, y no en cada pantalla: es el único sitio por el que pasa la
      // configuración, así que es donde se puede garantizar que el catálogo y el documento no divergen nunca.
      // `applyExtraSteps` es idempotente y barato: una pasada por las 64 escaleras.
      applyExtraSteps(cached.extraSteps);
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
 * AMPLÍA UNA ESCALERA con escalones nuevos, para todo el mundo y sin desplegar (§6.4bis). Solo el admin puede (lo
 * impone la regla, no esta función).
 *
 * ES CATÁLOGO DE VERDAD: al escribir se reconstruye el catálogo de este cliente (`applyExtraSteps`) y los demás
 * lo reconstruyen al leer la configuración, así que el escalón se desbloquea, cuenta en la fracción y viaja en el
 * espejo por su `id`. Lo que NO puede añadir es una escalera nueva: su métrica es código.
 *
 * QUITAR UN UMBRAL RETIRA MEDALLAS AJENAS (§6.4), y esta función no lo puede impedir —no sabe quién tiene qué—,
 * así que la guarda vive donde hay con qué decidirlo: el panel solo ofrece quitar lo que todavía no tiene nadie.
 *
 * Se escribe la LISTA ENTERA de esa escalera y se devuelve el mapa resultante, para que el panel pinte lo que de
 * verdad ha quedado guardado en vez de lo que creía. Una lista vacía borra la entrada: así «quitar el último»
 * deja el documento como estaba y no una escalera con una lista vacía dentro. Si falla, LANZA: el admin tiene
 * que enterarse.
 */
export async function setExtraSteps(ladderKey: string, steps: readonly number[]): Promise<ExtraSteps> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');

  const current = await loadAchievementsConfig(true);
  const limpio = sanitizeExtraSteps({ [ladderKey]: steps })[ladderKey] || [];
  const next: Record<string, readonly number[]> = { ...current.extraSteps };
  if (limpio.length > 0) next[ladderKey] = limpio;
  else delete next[ladderKey];

  await setDoc(doc(services.firestore, COLLECTION, DOC_ID), { extraSteps: next }, { merge: true });
  cached = { ...current, extraSteps: next };
  // El catálogo de ESTE cliente, al día sin esperar a la siguiente sesión: es el que la pantalla está mirando.
  applyExtraSteps(next);
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
