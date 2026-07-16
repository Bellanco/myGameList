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
import type { FirestorePublicConfig } from '../types/firestore';

type FacadeModule = typeof import('./firebaseRepository');

let facadePromise: Promise<FacadeModule> | null = null;

/** Carga (una vez) la fachada de Firebase. El propio SDK queda en un chunk perezoso. */
function loadFacade(): Promise<FacadeModule> {
  if (!facadePromise) {
    facadePromise = import('./firebaseRepository');
  }
  return facadePromise;
}

// --- Arranque / servicios ---
export async function initializeFirebaseServices(): Promise<FirebaseServices | null> {
  const m = await loadFacade();
  return m.initializeFirebaseServices();
}

// --- Telemetría (best-effort, no bloqueante) ---
export async function reportHandledError(error: unknown, fatal = false, context = ''): Promise<void> {
  const m = await loadFacade();
  return m.reportHandledError(error, fatal, context);
}

export async function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): Promise<void> {
  const m = await loadFacade();
  return m.trackAnalyticsEvent(eventName, params);
}

export async function setAnalyticsUser(uid: string): Promise<void> {
  const m = await loadFacade();
  return m.setAnalyticsUser(uid);
}

export async function clearAnalyticsUser(): Promise<void> {
  const m = await loadFacade();
  return m.clearAnalyticsUser();
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
export async function findSocialProfileByEmail(email: string): Promise<SocialProfileReference | null> {
  const m = await loadFacade();
  return m.findSocialProfileByEmail(email);
}

export async function resolveStableProfileId(uid: string): Promise<string> {
  const m = await loadFacade();
  return m.resolveStableProfileId(uid);
}

export async function recoverGithubToken(uid: string): Promise<string | null> {
  const m = await loadFacade();
  return m.recoverGithubToken(uid);
}

export async function getPublicConfig(uid: string): Promise<FirestorePublicConfig | null> {
  const m = await loadFacade();
  return m.getPublicConfig(uid);
}

export async function setPublicConfig(uid: string, config: Partial<FirestorePublicConfig>): Promise<void> {
  const m = await loadFacade();
  return m.setPublicConfig(uid, config);
}
