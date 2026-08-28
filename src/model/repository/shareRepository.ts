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

/**
 * Retira TODOS mis enlaces. Lo llama el borrado de cuenta, antes de borrar el perfil.
 *
 * No toca el veto ni el ajuste de cuota: si los borrase, bastaría con llamar aquí para quitarse un veto. Esos
 * dos quedan como residuo de un uid que ya no existirá, y los limpia el administrador.
 */
export async function removeAllMyShares(): Promise<number> {
  const response = await fetch(`${API_BASE}/mine`, { method: 'DELETE', headers: await authHeaders() });
  const body = await parse(response);
  return Number(body.removed) || 0;
}

// La LECTURA del artículo vive en `publicShareRepository.ts`, no aquí: la usa la página pública, que no debe
// arrastrar Firebase por importar este módulo.

export type { SharedReviewIndexEntry };
