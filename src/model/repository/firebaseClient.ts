// Cliente Firebase compartido: init perezoso de App/Auth/Firestore/Analytics, config web, y helpers de error.
// Responsabilidad: ser la base que importan los demás módulos firebase* (telemetry/auth/social) y la fachada.
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento. NO importa de los módulos que lo consumen.
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { ProfileTier } from '../../core/constants/tiers';
import { readAnalyticsConsent } from './analyticsConsentRepository';

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
  /**
   * Versión del esquema con la que se escribió el documento (0 si no la trae, es decir si es anterior a que
   * existiera la marca). Solo la rellenan las lecturas del perfil PROPIO: la usa el auto-saneado del arranque para
   * saber si hay que volver a sellarlo sin tener que releer el documento aparte.
   */
  schemaVersion?: number;
  /**
   * LEGACY, solo lectura del documento PROPIO: los perfiles nuevos no publican el email. Se conserva para saber
   * que un perfil antiguo aún lo arrastra y borrarlo en el siguiente guardado. Nunca se lee de perfiles ajenos.
   */
  email: string;
  displayName: string;
  photoURL: string;
  socialGistId: string;
  /** LEGACY: el id canónico del gist de juegos vive en `privateConfig` (owner-only) y en el doc de amistad. */
  gamesGistId: string;
  githubToken: string;
  socialEnabled: boolean;
  /** Rango asignado por el administrador. Determina la frescura del feed de QUIEN MIRA (ver `tiers.ts`). */
  tier: ProfileTier;
}

export interface SocialDirectoryEntry {
  id: string;
  uid: string; // uid de Firebase del perfil — necesario para relaciones de amistad (id del doc canónico) y robusto ante el cutover uid→profileId
  displayName: string;
  photoURL: string;
  socialGistId: string;
  /**
   * LEGACY del documento público: vacío en los perfiles ya purgados. Para un AMIGO, la fuente buena es
   * `friendships.{requester|recipient}GamesGistId`; para un no-amigo simplemente no hay lista de juegos.
   */
  gamesGistId: string;
  /**
   * Última actividad conocida del perfil en ms (`profiles.updatedAt`): se refresca al publicar y, una vez al
   * día, al abrir el hub. Ordena el directorio por uso reciente y permite que el feed no lea la actividad de
   * quien hace mucho que no aparece. 0 si el doc no lo trae.
   */
  updatedAt: number;
  /** Rango del perfil: es lo que pinta el punto de color en su tarjeta del directorio. */
  tier: ProfileTier;
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

  if (!parseEnvBoolean(import.meta.env.VITE_ENABLE_ANALYTICS, true)) {
    return false;
  }

  // L2 — CONSENTIMIENTO PREVIO: GA4 escribe identificadores en el dispositivo, así que no puede inicializarse
  // mientras el usuario no lo acepte. Sin `analytics`, toda la telemetría queda inerte.
  return readAnalyticsConsent() === 'granted';
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

  return { app, auth, firestore, analytics: await startAnalytics(app) };
}

/**
 * Arranca GA4 si procede (config + entorno + CONSENTIMIENTO otorgado). Devuelve null en cualquier otro caso.
 * Compartido por el arranque y por `enableAnalyticsAfterConsent`.
 */
async function startAnalytics(app: FirebaseApp): Promise<Analytics | null> {
  if (!getFirebaseWebConfig().measurementId || !isAnalyticsEnabledInCurrentEnv() || typeof window === 'undefined') {
    return null;
  }

  try {
    const analyticsModule = await getAnalyticsModule();
    if (!analyticsModule) {
      return null;
    }

    return (await analyticsModule.isSupported()) ? analyticsModule.getAnalytics(app) : null;
  } catch {
    // Keep silent: analytics is optional and should not block app bootstrap.
    return null;
  }
}

/**
 * L2 — Activa la analítica cuando el usuario ACEPTA en el banner, sin recargar: los servicios ya están cacheados
 * (se construyeron sin `analytics` porque aún no había consentimiento), así que basta con enchufárselos. Si el
 * usuario rechaza, no hay nada que apagar: nunca llegó a inicializarse.
 */
export async function enableAnalyticsAfterConsent(): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services || services.analytics) {
    return;
  }
  services.analytics = await startAnalytics(services.app);
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
