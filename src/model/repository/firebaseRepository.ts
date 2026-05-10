import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, setPersistence, browserLocalPersistence, signInWithPopup, signOut, type Auth } from 'firebase/auth';
import { collection, doc, documentId, getDocs, getFirestore, limit, query, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';

type AnalyticsModule = typeof import('firebase/analytics');
type Analytics = ReturnType<AnalyticsModule['getAnalytics']>;

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  analytics: Analytics | null;
}

export interface SocialAuthUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}

export interface SocialProfileReference {
  id: string;
  email: string;
  displayName: string;
  socialGistId: string;
  gamesGistId: string;
  githubToken: string;
  socialEnabled: boolean;
}

export interface SocialDirectoryEntry {
  id: string;
  email: string;
  displayName: string;
  socialGistId: string;
  gamesGistId: string;
}

export interface GameRecommendation {
  id: string;
  fromUid: string;
  fromEmail: string;
  fromDisplayName: string;
  toEmail: string;
  gameId: number;
  gameName: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  updatedAt: number;
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  const code = String(candidate.code || '');
  const message = String(candidate.message || '');

  return (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    /missing or insufficient permissions/i.test(message)
  );
}

let cachedServicesPromise: Promise<FirebaseServices | null> | null = null;

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

// Firebase web config is public by design; security is enforced by Auth and Firestore rules.
const FALLBACK_FIREBASE_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyBfMLi-pJfUiLqsfoUYsXQSgiAw1hWHfKg',
  authDomain: 'mylists-f7313.firebaseapp.com',
  projectId: 'mylists-f7313',
  storageBucket: 'mylists-f7313.firebasestorage.app',
  messagingSenderId: '721023375695',
  appId: '1:721023375695:web:da7ab55e6d8afc73470d3a',
  measurementId: 'G-V3BT053S55',
};

function parseEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isAnalyticsEnabledInCurrentEnv(): boolean {
  // Analytics is disabled by default in dev and enabled by default in prod.
  if (!import.meta.env.PROD) {
    return false;
  }

  return parseEnvBoolean(import.meta.env.VITE_ENABLE_ANALYTICS, true);
}

function getFirebaseWebConfig(): FirebaseWebConfig {
  const envConfig: FirebaseWebConfig = {
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
    measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim(),
  };

  const hasRequiredEnv = Boolean(
    envConfig.apiKey &&
      envConfig.authDomain &&
      envConfig.projectId &&
      envConfig.storageBucket &&
      envConfig.messagingSenderId &&
      envConfig.appId,
  );

  return hasRequiredEnv ? envConfig : FALLBACK_FIREBASE_WEB_CONFIG;
}

function isFirebaseConfigReady(): boolean {
  const config = getFirebaseWebConfig();
  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId,
  );
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  const config = getFirebaseWebConfig();

  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
  });
}

/**
 * Inicializa Firebase para web de forma perezosa y segura.
 *
 * Retorna null cuando faltan variables de entorno para evitar errores
 * en entornos locales o ramas sin configuracion.
 */
async function buildFirebaseServices(): Promise<FirebaseServices | null> {
  if (!isFirebaseConfigReady()) {
    return null;
  }

  const app = getFirebaseApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  void setPersistence(auth, browserLocalPersistence).catch(() => {
    // Keep silent: auth persistence can fail in hardened privacy modes.
  });

  let analytics: Analytics | null = null;
  const hasMeasurementId = Boolean(getFirebaseWebConfig().measurementId);
  const analyticsEnabled = isAnalyticsEnabledInCurrentEnv();

  if (hasMeasurementId && analyticsEnabled && typeof window !== 'undefined') {
    try {
      const analyticsModule = await import('firebase/analytics');
      const supported = await analyticsModule.isSupported();
      if (supported) {
        analytics = analyticsModule.getAnalytics(app);
      }
    } catch {
      // Keep silent: analytics is optional and should not block app bootstrap.
    }
  }

  return { app, auth, firestore, analytics };
}

/**
 * Punto de entrada unico para obtener servicios de Firebase en la app.
 *
 * @returns {Promise<FirebaseServices | null>} servicios inicializados o null.
 */
export function initializeFirebaseServices(): Promise<FirebaseServices | null> {
  if (!cachedServicesPromise) {
    cachedServicesPromise = buildFirebaseServices();
  }

  return cachedServicesPromise;
}

/**
 * Reporta errores manejados en web usando Analytics.
 *
 * Nota: Firebase Crashlytics no esta disponible para apps web JS.
 * Este helper usa el evento exception de Analytics como alternativa.
 *
 * @param {unknown} error - Error capturado por la aplicacion.
 * @param {boolean} fatal - Indica si el error es fatal.
 */
export async function reportHandledError(error: unknown, fatal = false): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services?.analytics) {
    return;
  }

  const analyticsModule = await import('firebase/analytics').catch(() => null);
  if (!analyticsModule) {
    return;
  }

  const description = error instanceof Error ? error.message : String(error);
  analyticsModule.logEvent(services.analytics, 'exception', {
    description,
    fatal,
  });
}

/**
 * Registra un evento de Analytics solo cuando el servicio esta disponible.
 *
 * @param {string} eventName - Nombre del evento.
 * @param {Record<string, string | number | boolean>} params - Parametros del evento.
 */
export async function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services?.analytics) {
    return;
  }

  const analyticsModule = await import('firebase/analytics').catch(() => null);
  if (!analyticsModule) {
    return;
  }

  analyticsModule.logEvent(services.analytics, eventName, params);
}

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

function getFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const candidate = error as { code?: string };
  return String(candidate.code || '');
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

/**
 * Guarda referencia mínima de perfil en Firestore.
 * No lee ni elimina documentos de placeholder en colecciones sociales.
 */
export async function upsertProfileSocialReferences(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
}): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const profileName = (input.preferredName || input.user.displayName || input.user.email || '').trim();

  await setDoc(
    doc(services.firestore, 'profiles', input.user.uid),
    {
      uid: input.user.uid,
      email: input.user.email,
      displayName: profileName,
      photoURL: input.user.photoURL,
      social: {
        gistId: input.socialGistId,
        gamesGistId: String(input.gamesGistId || ''),
        githubToken: String(input.githubToken || ''),
        gistFile: 'myGameList.social.json',
        etag: input.socialGistEtag,
        enabled: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Busca perfil social por correo para evitar duplicados y mantener mínimo en Firestore.
 * No lee ni modifica documentos placeholder que no contengan email.
 */
export async function findSocialProfileByEmail(email: string): Promise<SocialProfileReference | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return null;
  }

  const q = query(
    collection(services.firestore, 'profiles'),
    where('email', '==', cleanEmail),
    limit(1),
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (error) {
    // If rules deny reads, keep flow alive and continue with gist-only profile resolution.
    if (isPermissionDeniedError(error)) {
      return null;
    }

    throw error;
  }

  if (snapshot.empty) {
    return null;
  }

  const docEntry = snapshot.docs[0];
  const data = docEntry.data() as {
    email?: string;
    displayName?: string;
    social?: { gistId?: string; gamesGistId?: string; githubToken?: string; enabled?: boolean };
  };

  return {
    id: docEntry.id,
    email: String(data.email || ''),
    displayName: String(data.displayName || ''),
    socialGistId: String(data.social?.gistId || ''),
    gamesGistId: String(data.social?.gamesGistId || ''),
    githubToken: String(data.social?.githubToken || ''),
    socialEnabled: Boolean(data.social?.enabled),
  };
}

/**
 * Garantiza que exista perfil por correo con correo, nombre y gist id.
 */
export async function ensureProfileByEmail(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
}): Promise<SocialProfileReference> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanEmail = input.user.email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('La cuenta de Google no tiene email válido');
  }

  let existing: SocialProfileReference | null = null;
  try {
    existing = await findSocialProfileByEmail(cleanEmail);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
  }

  const profileName = (input.preferredName || input.user.displayName || cleanEmail).trim();
  const targetId = existing?.id || input.user.uid;

  await setDoc(
    doc(services.firestore, 'profiles', targetId),
    {
      uid: input.user.uid,
      email: cleanEmail,
      displayName: profileName,
      photoURL: input.user.photoURL,
      social: {
        gistId: input.socialGistId,
        gamesGistId: String(input.gamesGistId || ''),
        githubToken: String(input.githubToken || ''),
        gistFile: 'myGameList.social.json',
        etag: input.socialGistEtag,
        enabled: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    id: targetId,
    email: cleanEmail,
    displayName: profileName,
    socialGistId: input.socialGistId,
    gamesGistId: String(input.gamesGistId || ''),
    githubToken: String(input.githubToken || ''),
    socialEnabled: true,
  };
}

/**
 * Devuelve un listado reducido de perfiles para feed social.
 * Si las reglas no permiten lectura, retorna array vacío para no bloquear la UI.
 */
export async function listSocialDirectory(limitCount = 12): Promise<SocialDirectoryEntry[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const q = query(
    collection(services.firestore, 'profiles'),
    where('social.enabled', '==', true),
    where(documentId(), '!=', '_placeholder'),
    limit(Math.max(1, limitCount)),
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error('Permisos insuficientes para leer perfiles sociales en Firestore');
    }
    throw error;
  }

  return snapshot.docs
    .map((entry) => {
      const data = entry.data() as {
        email?: string;
        displayName?: string;
        social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
      };

      return {
        id: entry.id,
        email: String(data.email || ''),
        displayName: String(data.displayName || ''),
        socialGistId: String(data.social?.gistId || ''),
        gamesGistId: String(data.social?.gamesGistId || ''),
        enabled: Boolean(data.social?.enabled),
      };
    })
    .filter((entry) => entry.enabled && Boolean(entry.socialGistId))
    .map((entry) => ({
      id: entry.id,
      email: entry.email,
      displayName: entry.displayName,
      socialGistId: entry.socialGistId,
      gamesGistId: entry.gamesGistId,
    }));
}

/**
 * Envía una recomendación de juego a un amigo.
 * Guarda en la colección 'recommendations' de Firestore.
 */
export async function sendGameRecommendation(input: {
  fromUid: string;
  fromEmail: string;
  fromDisplayName: string;
  toEmail: string;
  gameId: number;
  gameName: string;
  message?: string;
}): Promise<{ id: string }> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const toEmailClean = input.toEmail.trim().toLowerCase();
  if (!toEmailClean) {
    throw new Error('Email del destinatario es requerido');
  }

  if (input.gameId <= 0) {
    throw new Error('ID de juego inválido');
  }

  const now = Date.now();
  const docRef = doc(collection(services.firestore, 'recommendations'));

  await setDoc(docRef, {
    fromUid: input.fromUid,
    fromEmail: input.fromEmail.toLowerCase(),
    fromDisplayName: input.fromDisplayName || input.fromEmail,
    toEmail: toEmailClean,
    gameId: input.gameId,
    gameName: String(input.gameName || `Juego ${input.gameId}`).trim(),
    message: String(input.message || '').trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  return { id: docRef.id };
}

/**
 * Obtiene recomendaciones pendientes recibidas para un correo.
 * Si las reglas denegan permisos, retorna array vacío.
 */
export async function getReceivedRecommendations(toEmail: string): Promise<GameRecommendation[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const toEmailClean = toEmail.trim().toLowerCase();
  if (!toEmailClean) {
    return [];
  }

  const q = query(
    collection(services.firestore, 'recommendations'),
    where('toEmail', '==', toEmailClean),
    where('status', '==', 'pending'),
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return [];
    }

    throw error;
  }

  return snapshot.docs
    .map((docEntry) => {
      const data = docEntry.data() as {
        fromUid?: string;
        fromEmail?: string;
        fromDisplayName?: string;
        toEmail?: string;
        gameId?: number;
        gameName?: string;
        message?: string;
        status?: string;
        createdAt?: number;
        updatedAt?: number;
      };

      return {
        id: docEntry.id,
        fromUid: String(data.fromUid || ''),
        fromEmail: String(data.fromEmail || ''),
        fromDisplayName: String(data.fromDisplayName || ''),
        toEmail: String(data.toEmail || ''),
        gameId: Number(data.gameId || 0),
        gameName: String(data.gameName || ''),
        message: String(data.message || ''),
        status: (data.status === 'pending' || data.status === 'accepted' || data.status === 'declined' ? data.status : 'pending') as 'pending' | 'accepted' | 'declined',
        createdAt: Number(data.createdAt || 0),
        updatedAt: Number(data.updatedAt || 0),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Actualiza el estado de una recomendación (accept/decline).
 */
export async function updateRecommendationStatus(
  recommendationId: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  await setDoc(
    doc(services.firestore, 'recommendations', recommendationId),
    {
      status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

