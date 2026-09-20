// LA FOTO DEL CALENDARIO DE LA PORRA, contra la API del PROPIO ORIGEN (`/api/premios`, una Pages Function
// sobre KV).
//
// ⚑ Y NO CONTRA FIRESTORE, donde vive el calendario de verdad. El motivo es de privacidad y está comprobado:
// esta respuesta la necesita el menú de Ajustes, que lo ve todo el mundo —también quien usa sus listas sin
// cuenta—, y una lectura de Firestore desde el navegador es una petición a `firestore.googleapis.com`. La
// política promete que abrir la app sin sesión no contacta con nadie, y `tests/e2e/smoke.test.ts` lo verifica.
// Ver `functions/api/premios.ts` y `core/premios/visibilitySnapshot.ts`.
//
// NUNCA LANZA AL LEER: sin red, con la función sin desplegar o con la respuesta rota, devuelve la foto vacía y
// no se ofrece nada. Al ESCRIBIR sí lanza, porque ahí hay un administrador esperando saber si se guardó.
import {
  EMPTY_PREMIOS_SNAPSHOT,
  sanitizePremiosSnapshot,
  type PremiosVisibilitySnapshot,
} from '../../core/premios/visibilitySnapshot';
import type { PremiosVotingConfig } from '../../model/types/premios';
import { shareAuthHeaders } from './shareRepository';

/**
 * La foto que le toca a un calendario.
 *
 * Es la única traducción entre las dos formas de lo mismo —el documento de Firestore y lo que se publica en
 * KV—, y vive aquí para que no haya dos sitios decidiendo qué campos viajan.
 */
export function snapshotFromConfig(
  config: PremiosVotingConfig | null | undefined,
): PremiosVisibilitySnapshot {
  if (!config) return EMPTY_PREMIOS_SNAPSHOT;
  return sanitizePremiosSnapshot({
    visible: config.visible ?? null,
    isOpen: config.isOpen ?? null,
    opensAtMillis: config.opensAtMillis ?? null,
    closesAtMillis: config.closesAtMillis ?? null,
    lastPublishedId: config.lastPublishedId ?? null,
    updatedAt: config.updatedAt ?? null,
  });
}

const API = '/api/premios';

/** Lo leído en esta sesión. `undefined` = todavía no se ha leído. */
let cached: PremiosVisibilitySnapshot | undefined;

/** La lectura EN VUELO, para que el menú y el espacio social pidiéndolo a la vez sean una sola petición. */
let inFlight: Promise<PremiosVisibilitySnapshot> | null = null;

export function loadPremiosSnapshot(force = false): Promise<PremiosVisibilitySnapshot> {
  if (!force) {
    if (cached !== undefined) return Promise.resolve(cached);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<PremiosVisibilitySnapshot> => {
    try {
      const response = await fetch(API, force ? { cache: 'no-store' } : undefined);
      if (!response.ok) return EMPTY_PREMIOS_SNAPSHOT;
      return sanitizePremiosSnapshot(await response.json());
    } catch {
      // Sin red o con la función sin desplegar: no se ofrece nada. No se recuerda el fallo — la próxima apertura
      // reintenta.
      return EMPTY_PREMIOS_SNAPSHOT;
    }
  })();

  if (!force) inFlight = request;
  return request.then((value) => {
    cached = value;
    inFlight = null;
    return value;
  });
}

/**
 * PUBLICA LA FOTO. Quién puede NO lo decide este fichero: lo decide la Pages Function comprobando en el ID token
 * verificado que quien llama es el administrador (`requireAdmin`), igual que con el aviso.
 *
 * Devuelve lo que de verdad ha quedado guardado. Si falla, LANZA.
 */
export async function savePremiosSnapshot(
  next: PremiosVisibilitySnapshot,
): Promise<PremiosVisibilitySnapshot> {
  // EN LOCAL NO HAY SESIÓN QUE MANDAR, y no es una excepción de seguridad: en `npm run dev` no hay Firebase
  // configurado, así que pedir el token aquí dejaría esto imposible de probar en la propia máquina. Quien
  // atiende la petición en desarrollo es el plugin de Vite; en producción, la Pages Function exige el token.
  const headers = import.meta.env.DEV
    ? { 'Content-Type': 'application/json' }
    : await shareAuthHeaders(() => new Error('Necesitas iniciar sesión'));

  const response = await fetch(API, { method: 'PUT', headers, body: JSON.stringify(next) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || 'No se ha podido publicar la visibilidad de los premios'));
  }

  cached = sanitizePremiosSnapshot(body);
  return cached;
}
