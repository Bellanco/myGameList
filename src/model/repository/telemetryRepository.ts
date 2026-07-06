// Observabilidad: reporte de errores manejados y eventos de Analytics (cuando el servicio está disponible).
// Extraído de firebaseRepository.ts (M2). Enriquecido con contexto (versión, ruta, stack) e identidad de usuario.
import { getAnalyticsModule, initializeFirebaseServices, type Analytics, type AnalyticsModule } from './firebaseClient';

// Versión de build inyectada por Vite (`define`). En entornos sin bundling (tests) cae a 'dev'.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// GA4 recorta los valores de parámetro a 100 caracteres; truncamos nosotros para no perder señal silenciosamente.
const GA4_PARAM_MAX = 100;

function truncate(value: string, max = GA4_PARAM_MAX): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Ruta actual (sin query ni datos personales) para localizar dónde ocurrió el error/evento. */
function currentPage(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return truncate(`${window.location.pathname}${window.location.hash}`);
}

/** Primeras líneas del stack, sin rutas absolutas largas, recortadas al límite de GA4. */
function summarizeStack(error: unknown): string {
  if (!(error instanceof Error) || !error.stack) {
    return '';
  }
  const lines = error.stack
    .split('\n')
    .slice(0, 4)
    .map((line) => line.trim())
    .join(' | ');
  return truncate(lines);
}

/** Resuelve Analytics + módulo si el servicio está disponible; null si no (dev, sin config, sin soporte). */
async function getAnalyticsPair(): Promise<{ analytics: Analytics; module: AnalyticsModule } | null> {
  const services = await initializeFirebaseServices();
  if (!services?.analytics) {
    return null;
  }
  const module = await getAnalyticsModule();
  if (!module) {
    return null;
  }
  return { analytics: services.analytics, module };
}

/**
 * Reporta errores manejados en web usando el evento `exception` de Analytics.
 *
 * Nota: Firebase Crashlytics no está disponible para apps web JS; el evento `exception` de Analytics es la
 * alternativa oficial. Adjunta contexto (nombre del error, stack resumido, ruta, versión) para diagnóstico.
 *
 * @param {unknown} error - Error capturado por la aplicación.
 * @param {boolean} fatal - true si el error tumbó una parte de la UI (boundary) o el arranque.
 * @param {string} [context] - Etiqueta de origen (p. ej. 'app-boundary', 'unhandledrejection') para agrupar.
 */
export async function reportHandledError(error: unknown, fatal = false, context = ''): Promise<void> {
  const pair = await getAnalyticsPair();
  if (!pair) {
    return;
  }

  const description = truncate(error instanceof Error ? error.message : String(error));
  const errorName = error instanceof Error ? truncate(error.name) : 'unknown';

  pair.module.logEvent(pair.analytics, 'exception', {
    description,
    fatal,
    error_name: errorName,
    error_context: truncate(context),
    error_stack: summarizeStack(error),
    page: currentPage(),
    app_version: APP_VERSION,
  });
}

/**
 * Registra un evento de Analytics solo cuando el servicio está disponible. Añade `app_version` y `page` a cada
 * evento para poder segmentar por versión y pantalla sin instrumentar eso en cada llamada.
 *
 * @param {string} eventName - Nombre del evento.
 * @param {Record<string, string | number | boolean>} params - Parámetros del evento.
 */
export async function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): Promise<void> {
  const pair = await getAnalyticsPair();
  if (!pair) {
    return;
  }

  pair.module.logEvent(pair.analytics, eventName, {
    ...params,
    page: currentPage(),
    app_version: APP_VERSION,
  });
}

/**
 * Asocia los eventos e informes de error posteriores a un usuario (uid de Firebase, opaco). Best-effort: si
 * Analytics no está disponible, no hace nada. Se llama al iniciar sesión.
 *
 * @param {string} uid - Identificador opaco del usuario (uid de Firebase).
 */
export async function setAnalyticsUser(uid: string): Promise<void> {
  const pair = await getAnalyticsPair();
  if (!pair || !uid) {
    return;
  }
  pair.module.setUserId(pair.analytics, uid);
  pair.module.setUserProperties(pair.analytics, { app_version: APP_VERSION });
}

/** Desvincula al usuario de los eventos posteriores (cierre de sesión). Best-effort. */
export async function clearAnalyticsUser(): Promise<void> {
  const pair = await getAnalyticsPair();
  if (!pair) {
    return;
  }
  pair.module.setUserId(pair.analytics, null);
}
