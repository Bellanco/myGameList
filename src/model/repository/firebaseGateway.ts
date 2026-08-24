// Frontera perezosa hacia Firebase. Este módulo NO importa 'firebase/*' de forma estática:
// solo carga la fachada `firebaseRepository` (y con ella todo el SDK) mediante import() dinámico.
//
// Motivo (auditoría de optimización, #1): el chunk de Firebase (~172 KB gzip) entraba en el grafo
// estático del entry y se descargaba en `modulepreload` en cada arranque, compitiendo con el render
// inicial. La app funciona con listas locales (IndexedDB) sin Firebase; este se necesita solo para
// restaurar la sesión de Google, sincronizar y publicar en social. Enrutando a los consumidores
// EAGER (main, error boundary, sesión, preferencias, sync VM) por aquí, el SDK sale del preload y
// se carga en segundo plano tras el montaje, sin bloquear la interactividad.
//
// Los tipos se importan con `import type` (se borran en build → no crean arista de runtime), así que
// no se pierde type-safety. Todas las funciones expuestas son las que consume el código eager y ya
// eran async (telemetría fire-and-forget, consultas de auth, hidratación post-login) salvo la
// suscripción de auth, que replica el contrato síncrono-teardown de `onSocialAuthChanged`.
import type { FirebaseServices, SocialAuthUser, SocialProfileReference } from './firebaseClient';
import type { FirestorePrivateConfig, FirestorePublicConfig } from '../types/firestore';

type FacadeModule = typeof import('./firebaseRepository');

let facadePromise: Promise<FacadeModule> | null = null;

/** Carga (una vez) la fachada de Firebase. El propio SDK queda en un chunk perezoso. */
function loadFacade(): Promise<FacadeModule> {
  if (!facadePromise) {
    // El RECHAZO no se cachea: si el chunk no se pudo bajar (sin red, o un despliegue que rotó los hashes con la
    // pestaña abierta), la siguiente llamada vuelve a intentarlo en vez de heredar el fallo el resto de la sesión.
    facadePromise = import('./firebaseRepository').catch((error: unknown) => {
      facadePromise = null;
      throw error;
    });
  }
  return facadePromise;
}

/**
 * Envoltorio de los caminos BEST-EFFORT (telemetría): ni la carga del chunk ni el envío pueden propagar el fallo,
 * porque sus llamantes invocan con `void` y no hay nadie detrás para capturarlo.
 *
 * Sin esto, un chunk que no baja se convierte en un `unhandledrejection`, y el gancho global de `main.tsx` lo
 * atiende con `reportHandledError` —que vuelve por aquí y vuelve a rechazar—, realimentando el fallo. En los tests
 * pasaba la otra cara: la carga que `void trackAnalyticsEvent(...)` deja en vuelo al acabar el test rechaza cuando
 * el entorno ya está desmontado, y esos rechazos tumbaban la suite en CI con todos los tests en verde.
 */
async function bestEffort(send: (facade: FacadeModule) => Promise<void>): Promise<void> {
  try {
    await send(await loadFacade());
  } catch {
    // Telemetría: si no se puede informar, no se informa.
  }
}

// --- Arranque / servicios ---
export async function initializeFirebaseServices(): Promise<FirebaseServices | null> {
  const m = await loadFacade();
  return m.initializeFirebaseServices();
}

/**
 * L2 — activa GA4 tras aceptar el aviso, sin recargar (los servicios ya están cacheados sin analítica). Best-effort
 * como el resto de la analítica: sus dos llamantes (banner y hook de consentimiento) invocan con `void`.
 */
export async function enableAnalyticsAfterConsent(): Promise<void> {
  await bestEffort((m) => m.enableAnalyticsAfterConsent());
}

// --- Telemetría (best-effort, no bloqueante: nunca rechaza, ver `bestEffort`) ---
export async function reportHandledError(error: unknown, fatal = false, context = ''): Promise<void> {
  await bestEffort((m) => m.reportHandledError(error, fatal, context));
}

export async function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): Promise<void> {
  await bestEffort((m) => m.trackAnalyticsEvent(eventName, params));
}

export async function setAnalyticsUser(uid: string): Promise<void> {
  await bestEffort((m) => m.setAnalyticsUser(uid));
}

export async function clearAnalyticsUser(): Promise<void> {
  await bestEffort((m) => m.clearAnalyticsUser());
}

// --- Auth ---
export async function getCurrentSocialAuthUser(): Promise<SocialAuthUser | null> {
  const m = await loadFacade();
  return m.getCurrentSocialAuthUser();
}

export async function signInWithGoogle(): Promise<SocialAuthUser> {
  const m = await loadFacade();
  return m.signInWithGoogle();
}

/**
 * Suscripción a los cambios de sesión de Google, cargando la fachada de forma perezosa. Conserva el
 * contrato de `onSocialAuthChanged`: devuelve una función de teardown SÍNCRONA que cancela la carga
 * en curso o desuscribe si ya se resolvió. Best-effort: si la carga falla, emite null una vez.
 */
export function subscribeSocialAuth(callback: (user: SocialAuthUser | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void loadFacade()
    .then((m) => {
      if (cancelled) return;
      unsubscribe = m.onSocialAuthChanged(callback);
    })
    .catch(() => {
      if (!cancelled) callback(null);
    });
  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

// --- Perfil / configuración ---
/** L1 — perfil propio por uid (con fallback legacy por email dentro de la fachada). */
export async function resolveOwnProfile(user: { uid: string; email?: string }): Promise<SocialProfileReference | null> {
  const m = await loadFacade();
  return m.resolveOwnProfile(user);
}

export async function resolveStableProfileId(uid: string): Promise<string> {
  const m = await loadFacade();
  return m.resolveStableProfileId(uid);
}

export async function recoverGithubToken(uid: string): Promise<string | null> {
  const m = await loadFacade();
  return m.recoverGithubToken(uid);
}

export async function getPrivateConfig(uid: string): Promise<FirestorePrivateConfig | null> {
  const m = await loadFacade();
  return m.getPrivateConfig(uid);
}

export async function setPrivateConfig(uid: string, config: Partial<FirestorePrivateConfig>): Promise<void> {
  const m = await loadFacade();
  return m.setPrivateConfig(uid, config);
}

export async function getPublicConfig(uid: string): Promise<FirestorePublicConfig | null> {
  const m = await loadFacade();
  return m.getPublicConfig(uid);
}

export async function setPublicConfig(uid: string, config: Partial<FirestorePublicConfig>): Promise<void> {
  const m = await loadFacade();
  return m.setPublicConfig(uid, config);
}
