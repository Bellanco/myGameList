/**
 * Estado de la CONEXIÓN y clasificación de fallos de RED, en un único sitio.
 *
 * Por qué hace falta: la aplicación arranca sin red (el service worker sirve el shell y los chunks del arranque
 * desde su caché), pero en cuanto una pantalla toca la red el fallo llegaba a la interfaz EN CRUDO. En el espacio
 * social eso se traducía en avisos como `network offline`, `Failed to fetch` o `Failed to get document because the
 * client is offline`: mensajes de librería, en inglés, que no dicen qué ha pasado ni qué hacer. Aquí se reconoce
 * ese tipo de fallo para poder contarlo con las palabras de la aplicación.
 *
 * Cada capa lanza su propio error para lo mismo, así que se miran los tres rastros que dejan:
 *  - `deferred === true` → `NetworkDeferredError` de la capa HTTP de gists (offline / timeout / transporte);
 *  - `code` → `FirebaseError` (autenticación y Firestore no comparten vocabulario con el resto);
 *  - `message` → `fetch` a secas, que solo deja un `TypeError` con un texto distinto en cada navegador.
 */

/** Códigos de Firebase (auth y Firestore) que significan «no se ha podido llegar al servidor». */
const NETWORK_ERROR_CODES = new Set([
  'auth/network-request-failed',
  'auth/timeout',
  'unavailable',
  'deadline-exceeded',
]);

/**
 * Fragmentos, en minúscula, de los mensajes que dejan los fallos de red. Los dos primeros son el MISMO fallo de
 * `fetch` dicho por navegadores distintos (Chromium/Firefox y Safari); `failed to fetch dynamically imported
 * module` es el chunk perezoso que no se pudo descargar, que es exactamente lo que pasa al entrar en una sección
 * todavía no visitada estando sin red.
 */
const NETWORK_ERROR_HINTS = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'network error',
  'network offline',
  'network timeout',
  'client is offline',
];

/** ¿El navegador dice que NO hay red? `navigator.onLine` no garantiza lo contrario, pero un `false` es fiable. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** ¿Este error viene de no haber podido llegar a la red (y no de una respuesta del servidor)? */
export function isNetworkFailure(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === 'string') {
    return matchesHint(error);
  }

  if (typeof error !== 'object') {
    return false;
  }

  const candidate = error as { deferred?: unknown; code?: unknown; name?: unknown; message?: unknown };

  // Capa HTTP de gists: ya ha clasificado el fallo como diferible (offline, timeout o transporte).
  if (candidate.deferred === true) {
    return true;
  }
  if (typeof candidate.code === 'string' && NETWORK_ERROR_CODES.has(candidate.code)) {
    return true;
  }
  // Timeout propio (`AbortController`): sin red, un socket colgado acaba aquí y no en un `TypeError`.
  if (candidate.name === 'AbortError') {
    return true;
  }
  return typeof candidate.message === 'string' && matchesHint(candidate.message);
}

function matchesHint(message: string): boolean {
  const normalized = message.toLowerCase();
  return NETWORK_ERROR_HINTS.some((hint) => normalized.includes(hint));
}
