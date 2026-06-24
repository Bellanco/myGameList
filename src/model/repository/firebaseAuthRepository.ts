// Autenticación social (Google): sign-in/out y usuario actual, con mensajes de error contextualizados.
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento.
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirebaseErrorCode,
  getFirebaseWebConfig,
  initializeFirebaseServices,
  type SocialAuthUser,
} from './firebaseClient';

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
  if (!services?.auth.currentUser) {
    return null;
  }

  return toSocialAuthUser(services.auth.currentUser);
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
