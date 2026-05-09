import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

type AnalyticsModule = typeof import('firebase/analytics');
type Analytics = ReturnType<AnalyticsModule['getAnalytics']>;

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  analytics: Analytics | null;
}

let cachedServicesPromise: Promise<FirebaseServices | null> | null = null;

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

function isFirebaseConfigReady(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET &&
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
  const hasMeasurementId = Boolean(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);
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
