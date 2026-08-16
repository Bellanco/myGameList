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

const API_BASE = '/api/share';

export interface ShareError extends Error {
  status: number;
  /** Lo que la Function adjunta al error para poder decir algo útil: cuota, caducidad del más antiguo, veto. */
  details: Record<string, unknown>;
}

function shareError(status: number, message: string, details: Record<string, unknown> = {}): ShareError {
  const error = new Error(message) as ShareError;
  error.status = status;
  error.details = details;
  return error;
}

/** Cabeceras de identidad. Lanza si no hay sesión: compartir exige haber entrado con Google. */
async function authHeaders(): Promise<Record<string, string>> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw shareError(401, 'Necesitas iniciar sesión para compartir');
  }
  await services.auth.authStateReady();
  const user = services.auth.currentUser;
  if (!user) {
    throw shareError(401, 'Necesitas iniciar sesión para compartir');
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

async function parse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const { error, ...details } = body;
    throw shareError(response.status, String(error || 'No se ha podido completar la operación'), details);
  }
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
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(draft),
  });
  return (await parse(response)) as unknown as PublishedShare;
}

/** Mis enlaces activos, mi cuota ya resuelta y mi veto si lo hubiera. */
export async function listMyShares(): Promise<MySharesResponse & { tier: string }> {
  const response = await fetch(`${API_BASE}/mine`, { headers: await authHeaders() });
  return (await parse(response)) as unknown as MySharesResponse & { tier: string };
}

/** Retira un enlace. Idempotente: retirar lo ya retirado no es un error. */
export async function removeShare(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await parse(response);
}

/** El artículo público. Sin sesión: lo usa la página que ve quien abre el enlace. */
export async function readSharedReview(token: string): Promise<SharedReview | null> {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(token)}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SharedReview;
  } catch {
    return null;
  }
}

export type { SharedReviewIndexEntry };
