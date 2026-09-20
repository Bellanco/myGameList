// Autenticación social (Google): sign-in/out y usuario actual, con mensajes de error contextualizados.
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento.
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirebaseErrorCode,
  getFirebaseWebConfig,
  initializeFirebaseServices,
  type SocialAuthUser,
} from './firebaseClient';
// Único punto de enganche de App Check en toda la app (ver `appCheckRepository`: lleva escrito cómo quitarlo).
// Va aquí y no en `firebaseClient` porque el criterio es "hay sesión", no "hay servicios": el arranque en idle
// construye servicios para todo el mundo, y ahí NO debe cargarse reCAPTCHA.
import { ensureAppCheck } from './appCheckRepository';
import { hasAdminClaim } from '../../core/security/admin';

function toSocialAuthUser(user: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): SocialAuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
}

function isCloudflarePreviewHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const hostnameParts = hostname.split('.');
  return hostname.endsWith('.pages.dev') && hostnameParts.length > 3;
}

function getAuthRuntimeContext(): { hostname: string; projectId: string; authDomain: string } {
  const config = getFirebaseWebConfig();
  return {
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
    projectId: config.projectId,
    authDomain: config.authDomain,
  };
}

/**
 * Devuelve el usuario autenticado actual para el hub social.
 */
export async function getCurrentSocialAuthUser(): Promise<SocialAuthUser | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    return null;
  }

  // La sesión persistida (browserLocalPersistence) se restaura de forma ASÍNCRONA: nada más inicializar,
  // `currentUser` aún es null aunque haya sesión guardada. Sin esperar aquí, al recargar en /social el hub
  // veía authUser=null y rebotaba al gateway/login. `authStateReady()` resuelve cuando el estado inicial ya
  // se ha determinado (sesión restaurada o confirmada como ausente).
  await services.auth.authStateReady();
  if (!services.auth.currentUser) {
    return null;
  }

  return toSocialAuthUser(services.auth.currentUser);
}

/**
 * ¿La sesión actual trae el claim de administrador?
 *
 * Es lo que sustituye a comparar correos: el claim lo emite el servidor (`scripts/set-admin-claim.mjs`) y viaja
 * firmado en el ID token. Aquí solo se LEE, para decidir si la interfaz ofrece el panel; la barrera está en
 * `firestore.rules`.
 *
 * `forceRefresh` existe por el token cacheado: Firebase guarda el ID token hasta una hora, así que un claim
 * recién asignado NO aparece hasta que el token se renueva o el usuario vuelve a entrar. Quien pregunta de
 * pasada (`useIsAdmin`) lee el token que haya, que es gratis; quien de verdad va al panel reintenta forzando, y
 * así el administrador recién nombrado entra sin tener que cerrar sesión (ver `useAdminViewModel`).
 *
 * Nunca lanza: sin sesión, sin servicios o con la red caída responde `false`, que es el valor seguro —esconder
 * el panel a quien manda es un incordio; ofrecérselo a quien no, un reguero de `permission-denied`—.
 */
export async function readAdminClaim(forceRefresh = false): Promise<boolean> {
  const services = await initializeFirebaseServices();
  if (!services) {
    return false;
  }

  // Misma espera que en `getCurrentSocialAuthUser`: la sesión persistida se restaura de forma asíncrona y sin
  // esto `currentUser` es null en la primera llamada tras recargar.
  await services.auth.authStateReady();
  const user = services.auth.currentUser;
  if (!user) {
    return false;
  }

  try {
    const token = await user.getIdTokenResult(forceRefresh);
    return hasAdminClaim(token.claims as Record<string, unknown>);
  } catch {
    return false;
  }
}

/**
 * Suscribe a los cambios de sesión de Google (incluida la restauración de sesión al arrancar, que es asíncrona).
 * Emite el usuario actual (o null) y devuelve la función para desuscribir. Best-effort: si Firebase no está
 * configurado, emite null una vez y no suscribe.
 */
export function onSocialAuthChanged(callback: (user: SocialAuthUser | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void initializeFirebaseServices().then((services) => {
    if (cancelled || !services) {
      callback(null);
      return;
    }
    unsubscribe = onAuthStateChanged(services.auth, (user) => {
      // Sesión RESTAURADA (el usuario ya estaba dentro de una visita anterior): también hay que atestiguar, y
      // antes de que el hub empiece a leer Firestore. Solo con `user`: si es null seguimos siendo un visitante
      // anónimo y no se carga nada de Google.
      if (user) {
        void ensureAppCheck(services.app);
      }
      callback(user ? toSocialAuthUser(user) : null);
    });
  });
  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

/**
 * Inicia sesión con Google para funcionalidades sociales.
 */
export async function signInWithGoogle(): Promise<SocialAuthUser> {
  if (isCloudflarePreviewHost()) {
    throw new Error('Google no está disponible en previews de Cloudflare. Usa el dominio principal o autoriza este subdominio en Firebase Auth.');
  }

  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  // Antes del popup: el usuario ya ha decidido identificarse, así que a partir de aquí toda petición a Firebase
  // debe ir atestiguada. `await` porque el propio inicio de sesión ya es una petición que la exigencia filtrará.
  await ensureAppCheck(services.app);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(services.auth, provider);
    return toSocialAuthUser(result.user);
  } catch (error) {
    const code = getFirebaseErrorCode(error);
    if (code === 'auth/unauthorized-domain') {
      const context = getAuthRuntimeContext();
      throw new Error(
        `El dominio ${context.hostname} no está autorizado en Firebase Auth para Google Sign-In. Proyecto activo: ${context.projectId} (${context.authDomain}). Revisa Authorized domains.`,
      );
    }

    if (code === 'auth/internal-error') {
      const context = getAuthRuntimeContext();
      throw new Error(
        `Firebase devolvió auth/internal-error en ${context.hostname} usando el proyecto ${context.projectId} (${context.authDomain}). Suele deberse a bloqueo de popup/cookies/extensiones o a configuración OAuth del proveedor Google.`,
      );
    }

    throw error;
  }
}

/**
 * Cierra sesión del usuario social actual.
 */
export async function signOutSocialUser(): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    return;
  }

  await signOut(services.auth);
}
