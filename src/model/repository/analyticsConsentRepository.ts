// L2 — Consentimiento de la analítica (GA4), previo y revocable.
//
// Firebase Analytics escribe identificadores en el dispositivo, así que solo puede arrancar DESPUÉS de que el
// usuario lo acepte: `firebaseClient` no llama a `getAnalytics()` mientras esto no devuelva 'granted'. Sin
// Analytics inicializado, `telemetryRepository` es un no-op completo (sus funciones salen si no hay servicio),
// de modo que rechazar no deja ningún rastro de telemetría.
//
// La preferencia vive SOLO en localStorage: el consentimiento es de quien usa este navegador, no de la cuenta,
// así que no se sincroniza (a diferencia de la apariencia o la escala de puntuación). Es también la razón de no
// guardarlo en Firestore: haría falta sesión para algo que debe funcionar antes de iniciarla.
import { ANALYTICS_CONSENT_KEY } from '../../core/constants/storageKeys';

/** 'granted' | 'denied' aceptado/rechazado explícitamente; null = aún sin decidir (procede mostrar el banner). */
export type AnalyticsConsent = 'granted' | 'denied';

/** Evento para que la UI (banner, ajustes) reaccione al cambio sin recargar. */
export const ANALYTICS_CONSENT_EVENT = 'mgl:analytics-consent';

export function readAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const raw = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    // Sin localStorage (modo privado estricto) no hay forma de recordar la decisión: se trata como "sin decidir",
    // que es lo conservador — nunca se activa la analítica por defecto.
    return null;
  }
}

export function persistAnalyticsConsent(value: AnalyticsConsent): void {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // sin persistencia: la decisión vale para esta sesión y se volverá a preguntar
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
  }
}
