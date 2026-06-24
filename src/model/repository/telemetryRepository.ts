// Observabilidad: reporte de errores manejados y eventos de Analytics (cuando el servicio está disponible).
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento.
import { getAnalyticsModule, initializeFirebaseServices } from './firebaseClient';

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

  const analyticsModule = await getAnalyticsModule();
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

  const analyticsModule = await getAnalyticsModule();
  if (!analyticsModule) {
    return;
  }

  analyticsModule.logEvent(services.analytics, eventName, params);
}
