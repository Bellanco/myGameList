// Cliente HTTP de los enlaces públicos de reseñas (ver docs/plan-compartir-resenas.md).
//
// Habla con las Pages Functions de `/api/share`, que son quienes deciden: la cuota, la caducidad y el veto los
// aplica el servidor. Aquí NO se calcula nada de eso — lo que se recibe se muestra tal cual. Si este fichero
// empezara a decidir cuántos enlaces caben, habría dos verdades y una de ellas sería manipulable.
//
// Cada petición autenticada lleva dos cabeceras:
//   Authorization: Bearer <ID token>   quién eres (lo verifica la Function contra las claves de Google)
//   X-Firebase-AppCheck: <token>       que la petición viene de la app de verdad; la Function lo reenvía a
//                                      Firestore al leer tu rango, así funciona esté o no exigido App Check.
import { initializeFirebaseServices } from './firebaseGateway';
import type { MySharesResponse, SharedReview, SharedReviewIndexEntry } from '../types/share';
import type { ShareQuota } from '../../core/constants/tiers';
import { SHARE_DOWN_UNTIL_KEY, shareLastMineKey } from '../../core/constants/storageKeys';

const API_BASE = '/api/share';

export interface ShareError extends Error {
  status: number;
  /** Lo que la Function adjunta al error para poder decir algo útil: cuota, caducidad del más antiguo, veto. */
  details: Record<string, unknown>;
  /**
   * El SERVICIO no atiende (cupo de Cloudflare o de Firestore agotado, Function caída, sin red), no la petición.
   * Con esto la interfaz deja de ofrecer compartir un rato en vez de enseñar un error. No sale del estado 429: esta
   * API lo usa también para el límite diario, que sí hay que explicar. Ver `parse`.
   */
  unavailable?: boolean;
}

function shareError(status: number, message: string, details: Record<string, unknown> = {}): ShareError {
  const error = new Error(message) as ShareError;
  error.status = status;
  error.details = details;
  return error;
}

/** Más que esto no se espera aunque `Retry-After` pida hasta medianoche: un fallo pasajero no esconde el día entero. */
const SHARE_DOWN_MAX_MS = 60 * 60 * 1000;
/** Sin `Retry-After` (sin red, la página de error de Cloudflare). */
const SHARE_DOWN_DEFAULT_MS = 15 * 60 * 1000;

function unavailableError(retryAfterMs = 0): ShareError {
  const error = shareError(503, SHARE_UI_UNAVAILABLE, { unavailable: true });
  error.unavailable = true;
  markShareServiceDown(retryAfterMs);
  return error;
}

const SHARE_UI_UNAVAILABLE = 'Compartir no está disponible ahora mismo. Inténtalo más tarde.';

function readDownUntil(): number {
  try {
    return Number(localStorage.getItem(SHARE_DOWN_UNTIL_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function markShareServiceDown(retryAfterMs: number): void {
  const wait = Math.min(SHARE_DOWN_MAX_MS, retryAfterMs > 0 ? retryAfterMs : SHARE_DOWN_DEFAULT_MS);
  try {
    localStorage.setItem(SHARE_DOWN_UNTIL_KEY, String(Date.now() + wait));
  } catch {
    // Sin almacenamiento: se volverá a preguntar en la siguiente apertura, que tampoco es grave.
  }
}

/** ¿Se sabe que el servicio de compartir no atiende ahora? Entonces no se pregunta ni se ofrece. */
export function isShareServiceDown(): boolean {
  return Date.now() < readDownUntil();
}

/** Lo olvida: el servicio ha vuelto a responder bien. */
function clearShareServiceDown(): void {
  try {
    localStorage.removeItem(SHARE_DOWN_UNTIL_KEY);
  } catch {
    // ignore
  }
}

/** ¿Es este error un «no disponible»? Para los llamadores que no saben de `ShareError`. */
export function isShareUnavailable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as ShareError).unavailable === true);
}

/** `fetch` que convierte el fallo de red en «no disponible» (si no hay red, compartir tampoco). */
async function shareFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw unavailableError();
  }
}

/**
 * Cabeceras de identidad para la API de compartir. Lanza si no hay sesión: todo lo que hay detrás la exige.
 *
 * Se exporta porque el panel de moderación (`shareAdminRepository`) necesita exactamente las mismas, y tenerlas
 * escritas dos veces significaba que el día que cambie el nombre de la cabecera de App Check hay que acordarse
 * de los dos sitios. El error de "sin sesión" sí es de cada llamante —el usuario ve un aviso y el panel un fallo
 * técnico—, así que llega como parámetro en vez de fijarse aquí.
 */
export async function shareAuthHeaders(missingSession: () => Error): Promise<Record<string, string>> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw missingSession();
  }
  await services.auth.authStateReady();
  const user = services.auth.currentUser;
  if (!user) {
    throw missingSession();
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${await user.getIdToken()}`,
    'Content-Type': 'application/json',
  };

  // App Check es opcional por diseño (se puede apagar borrando la clave de reCAPTCHA, ver appCheckRepository) y
  // falla abierto: sin token se manda la petición igual, porque la Function funciona sin él mientras la
  // exigencia esté desactivada. Import dinámico para no arrastrar el módulo a quien nunca comparte.
  const { getAppCheckToken } = await import('./appCheckRepository');
  const appCheck = await getAppCheckToken();
  if (appCheck) {
    headers['X-Firebase-AppCheck'] = appCheck;
  }
  return headers;
}

/** Las de este repositorio: sin sesión, el aviso que el usuario puede accionar. */
const authHeaders = (): Promise<Record<string, string>> =>
  shareAuthHeaders(() => shareError(401, 'Necesitas iniciar sesión para compartir'));

async function parse(response: Response): Promise<Record<string, unknown>> {
  // Lo que NO es una respuesta de esta API dice que el servicio no está: la página de error de Cloudflare (cupo de
  // Functions agotado) o el `404.html` estático en modo «fail open». Las respuestas de verdad son siempre JSON.
  const type = response.headers?.get?.('content-type') || '';
  if (type.includes('text/html')) {
    throw unavailableError();
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.unavailable === true || response.status >= 500) {
      const retryAfterSeconds = Number(response.headers?.get?.('retry-after') || 0);
      throw unavailableError(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0);
    }
    const { error, ...details } = body;
    throw shareError(response.status, String(error || 'No se ha podido completar la operación'), details);
  }
  clearShareServiceDown();
  return body;
}

export interface PublishedShare {
  token: string;
  url: string;
  expiresAt: number;
  renewed: boolean;
  quota: ShareQuota;
  active: number;
}

/**
 * Publica (o renueva) el enlace de una reseña.
 *
 * El borrador NO lleva `authorNick` ni fechas de publicación: el nick lo pone el servidor desde el perfil (nadie
 * firma con el nombre de otro) y la caducidad sale del rango (si la decidiera el cliente, la cuota no sería una
 * barrera).
 */
export async function publishShare(
  draft: Omit<SharedReview, 'v' | 'createdAt' | 'expiresAt' | 'authorNick'>,
): Promise<PublishedShare> {
  try {
    const response = await shareFetch(API_BASE, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(draft),
    });
    return (await parse(response)) as unknown as PublishedShare;
  } finally {
    invalidateMySharesCache();
  }
}

type MySharesSnapshot = MySharesResponse & { tier: string };

/**
 * CUÁNTO VALE LA COPIA DE «MIS ENLACES». Cada `GET /api/share/mine` es un `list()` de KV, y ese cupo es de 1.000 al
 * día para la cuenta entera: con el botón de compartir pidiéndolo al montarse en cada detalle de reseña propia,
 * era el primer techo de la app (ver «Revisión del 04-10-2026» en docs/plan-capacidad-gratuita.md).
 *
 * Lo que puede quedarse viejo es poco: lo que cambia desde ESTE navegador (publicar, retirar) tira la copia al
 * momento; solo un veto o un ajuste de cupo del administrador, o un enlace publicado desde otro dispositivo,
 * tardan hasta esto en verse. La caducidad de cada enlace la decide el servidor al leerlo, no esta copia.
 */
export const MY_SHARES_MAX_AGE_MS = 5 * 60 * 1000;

let mySharesCache: { uid: string; at: number; value: MySharesSnapshot } | null = null;
let mySharesInFlight: { uid: string; promise: Promise<MySharesSnapshot> } | null = null;
/** Sube con cada invalidación: una lectura que salió antes no puede guardar lo que ya se sabe viejo. */
let mySharesGeneration = 0;

/** Olvida la copia de «mis enlaces». La llaman publicar y retirar; exportada para las pruebas. */
export function invalidateMySharesCache(): void {
  mySharesCache = null;
  mySharesInFlight = null;
  mySharesGeneration += 1;
}

async function sessionUid(): Promise<string> {
  const services = await initializeFirebaseServices();
  if (!services) return '';
  await services.auth.authStateReady();
  return services.auth.currentUser?.uid || '';
}

/**
 * Mis enlaces activos, mi cuota ya resuelta y mi veto si lo hubiera.
 *
 * Con copia en memoria de `MY_SHARES_MAX_AGE_MS` por usuario, y una sola petición en vuelo: varios botones que se
 * montan a la vez comparten la misma respuesta.
 */
export async function listMyShares(): Promise<MySharesSnapshot> {
  const uid = await sessionUid();
  if (uid && mySharesCache?.uid === uid && Date.now() - mySharesCache.at < MY_SHARES_MAX_AGE_MS) {
    return mySharesCache.value;
  }
  if (uid && mySharesInFlight?.uid === uid) {
    return mySharesInFlight.promise;
  }

  // Se sabe que no atiende: ni se pregunta (cada pregunta es una invocación más contra un cupo ya agotado).
  if (isShareServiceDown()) {
    throw unavailableError(readDownUntil() - Date.now());
  }

  const generation = mySharesGeneration;
  const promise = (async () => {
    const response = await shareFetch(`${API_BASE}/mine`, { headers: await authHeaders() });
    const value = (await parse(response)) as unknown as MySharesSnapshot;
    if (uid && generation === mySharesGeneration) {
      mySharesCache = { uid, at: Date.now(), value };
      saveLastMine(uid, value);
    }
    return value;
  })();
  if (!uid) return promise;

  const entry = { uid, promise };
  mySharesInFlight = entry;
  try {
    return await promise;
  } finally {
    if (mySharesInFlight === entry) mySharesInFlight = null;
  }
}

/** Guarda la última lista buena de este usuario: es lo que Ajustes enseña mientras el servicio no atiende. */
function saveLastMine(uid: string, value: MySharesSnapshot): void {
  try {
    localStorage.setItem(shareLastMineKey(uid), JSON.stringify({ shares: value.shares || [], quota: value.quota || null }));
  } catch {
    // best-effort
  }
}

/** La última lista buena de quien tiene la sesión abierta, o `null`. Solo para pintar, nunca para decidir. */
export async function readLastMyShares(): Promise<Pick<MySharesSnapshot, 'shares' | 'quota'> | null> {
  const uid = await sessionUid();
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(shareLastMineKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pick<MySharesSnapshot, 'shares' | 'quota'>;
    return Array.isArray(parsed?.shares) ? parsed : null;
  } catch {
    return null;
  }
}

/** Retira un enlace. Idempotente: retirar lo ya retirado no es un error. */
export async function removeShare(token: string): Promise<void> {
  try {
    const response = await shareFetch(`${API_BASE}/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    await parse(response);
  } finally {
    // También si falla: no se sabe en qué estado ha quedado, y la siguiente lectura lo dirá.
    invalidateMySharesCache();
  }
}

/**
 * Retira TODOS mis enlaces. Lo llama el borrado de cuenta, antes de borrar el perfil.
 *
 * No toca el veto ni el ajuste de cuota: si los borrase, bastaría con llamar aquí para quitarse un veto. Esos
 * dos quedan como residuo de un uid que ya no existirá, y los limpia el administrador.
 */
export async function removeAllMyShares(): Promise<number> {
  try {
    const response = await shareFetch(`${API_BASE}/mine`, { method: 'DELETE', headers: await authHeaders() });
    const body = await parse(response);
    return Number(body.removed) || 0;
  } finally {
    invalidateMySharesCache();
  }
}

// La LECTURA del artículo vive en `publicShareRepository.ts`, no aquí: la usa la página pública, que no debe
// arrastrar Firebase por importar este módulo.

export type { SharedReviewIndexEntry };
