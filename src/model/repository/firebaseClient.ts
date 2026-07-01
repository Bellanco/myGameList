// Cliente Firebase compartido: init perezoso de App/Auth/Firestore/Analytics, config web, y helpers de error.
// Responsabilidad: ser la base que importan los demás módulos firebase* (telemetry/auth/social) y la fachada.
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento. NO importa de los módulos que lo consumen.
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

type AnalyticsModule = typeof import('firebase/analytics');
type Analytics = ReturnType<AnalyticsModule['getAnalytics']>;

export type { AnalyticsModule, Analytics };

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
  profileId?: string;
  email: string;
  displayName: string;
  photoURL: string;
  socialGistId: string;
  gamesGistId: string;
  githubToken: string;
  socialEnabled: boolean;
}

export interface SocialDirectoryEntry {
  id: string;
  uid: string; // uid de Firebase del perfil — necesario para relaciones de amistad (id del doc canónico) y robusto ante el cutover uid→profileId
  email: string;
  displayName: string;
  photoURL: string;
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

export function isPermissionDeniedError(error: unknown): boolean {
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

export function getFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const candidate = error as { code?: string };
  return String(candidate.code || '');
}

let cachedServicesPromise: Promise<FirebaseServices | null> | null = null;
let analyticsModuleCache: AnalyticsModule | null | undefined = undefined;
let analyticsModulePromise: Promise<AnalyticsModule | null> | null = null;

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
  apiKey: 'AIzaSyD0S3Dn3GXMvJqZLPTOE8t_56iyngl_VZY',
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

export function getFirebaseWebConfig(): FirebaseWebConfig {
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

export async function getAnalyticsModule(): Promise<AnalyticsModule | null> {
  if (analyticsModuleCache !== undefined) {
    return analyticsModuleCache;
  }

  if (!analyticsModulePromise) {
    analyticsModulePromise = import('firebase/analytics')
      .catch(() => null)
      .then((module) => {
        analyticsModuleCache = module;
        return module;
      });
  }

  return analyticsModulePromise;
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
      const analyticsModule = await getAnalyticsModule();
      if (!analyticsModule) {
        return { app, auth, firestore, analytics };
      }

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
