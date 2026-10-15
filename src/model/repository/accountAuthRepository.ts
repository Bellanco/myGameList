/**
 * LA BAJA COMPLETA EN EL SERVIDOR (`functions/api/account.ts`): todo lo de la cuenta, también lo que el cliente no
 * puede borrar (registros de los premios, el archivo de cada edición, el registro del panel) y la cuenta de Google de
 * Firebase Auth. Módulo aparte para que la baja lo cargue solo cuando llega a este paso.
 */
import { shareAuthHeaders } from './shareRepository';

/** Más que de sobra para la baja en el borde (once llamadas a Google); sin tope, una red colgada la dejaría esperando. */
const DELETE_TIMEOUT_MS = 30_000;

/** Por qué no se pudo borrar. `unavailable`: el servicio no atiende ahora (se puede reintentar más tarde). */
export class AuthAccountDeletionError extends Error {
  constructor(message: string, readonly unavailable: boolean) {
    super(message);
    this.name = 'AuthAccountDeletionError';
  }
}

/**
 * Pide al servidor la baja completa de la cuenta con sesión. `deleted`: no queda nada. `not-configured`: el servidor
 * no puede hacerla (sin cuenta de servicio, o en `npm run dev`, donde no existe el endpoint) y quien llama borra lo que
 * pueda por su cuenta. Lanza `AuthAccountDeletionError` si se intentó y no se completó.
 */
export async function deleteMyAccountOnServer(): Promise<'deleted' | 'not-configured'> {
  const headers = await shareAuthHeaders(() => new AuthAccountDeletionError('sin sesión', false));
  let response: Response;
  try {
    response = await fetch('/api/account', { method: 'DELETE', headers, signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) });
  } catch {
    // Sin respuesta (red cortada, tiempo agotado): no se sabe qué se borró, y cerrar la sesión ahora dejaría lo que
    // quede sin forma de borrarlo desde la app. Se reintenta: borrar lo ya borrado no falla.
    throw new AuthAccountDeletionError('sin respuesta', true);
  }
  if (response.ok) return 'deleted';
  if (response.status === 404) return 'not-configured';
  // Un 503 es «no atiende ahora», lo diga nuestro middleware (`unavailable`) o la propia plataforma con su página.
  if (response.status === 503) throw new AuthAccountDeletionError('respuesta 503', true);
  const body = (await response.json().catch(() => null)) as { configured?: unknown; failures?: unknown } | null;
  if (body?.configured === false) return 'not-configured';
  const failures = Array.isArray(body?.failures) ? body.failures.filter((item): item is string => typeof item === 'string') : [];
  throw new AuthAccountDeletionError(failures.length ? failures.join('; ').slice(0, 300) : `respuesta ${response.status}`, false);
}
