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
  try {
    const response = await fetch(API_BASE, {
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

  const generation = mySharesGeneration;
  const promise = (async () => {
    const response = await fetch(`${API_BASE}/mine`, { headers: await authHeaders() });
    const value = (await parse(response)) as unknown as MySharesSnapshot;
    if (uid && generation === mySharesGeneration) {
      mySharesCache = { uid, at: Date.now(), value };
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

/** Retira un enlace. Idempotente: retirar lo ya retirado no es un error. */
export async function removeShare(token: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(token)}`, {
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
    const response = await fetch(`${API_BASE}/mine`, { method: 'DELETE', headers: await authHeaders() });
    const body = await parse(response);
    return Number(body.removed) || 0;
  } finally {
    invalidateMySharesCache();
  }
}

// La LECTURA del artículo vive en `publicShareRepository.ts`, no aquí: la usa la página pública, que no debe
// arrastrar Firebase por importar este módulo.

export type { SharedReviewIndexEntry };
