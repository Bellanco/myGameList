/**
 * S3 (robustez de sync): capa HTTP de GitHub con TIMEOUT, clasificación offline/transporte y lectura de
 * rate-limit. Centraliza todos los `fetch` del repositorio de gists para que:
 *  - un socket colgado no deje la máquina de sync atascada en `checking`/`writing` (AbortController + timeout);
 *  - el offline / fallo de transporte se distinga de un error HTTP real (→ `NetworkDeferredError`, reintentable
 *    al volver la red en vez de notificar un error duro);
 *  - los 403/429 con `Retry-After` / `X-RateLimit-Reset` se respeten en el backoff.
 *
 * NO lanza por status HTTP: devuelve la `Response` y el llamador decide (p. ej. el 304 de los gists).
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/** Error de red DIFERIBLE: offline, fallo de transporte o timeout. No es un error HTTP del servidor. */
export class NetworkDeferredError extends Error {
  readonly deferred = true as const;
  readonly reason: 'offline' | 'timeout' | 'network';
  constructor(reason: 'offline' | 'timeout' | 'network', cause?: unknown) {
    super(`network ${reason}`);
    this.name = 'NetworkDeferredError';
    this.reason = reason;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** ¿El error proviene de un fallo de red diferible (offline/timeout/transporte) y no de un status HTTP? */
export function isDeferredNetworkError(error: unknown): boolean {
  return (
    error instanceof NetworkDeferredError ||
    (typeof error === 'object' && error !== null && (error as { deferred?: unknown }).deferred === true)
  );
}

/** ms a esperar antes de reintentar, leídos de un error que los lleve adjuntos (rate-limit). 0 si no aplica. */
export function getRetryAfterMs(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const v = (error as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

/**
 * `fetch` con AbortController + timeout. Offline (`navigator.onLine === false`), fallo de transporte (`TypeError`)
 * y timeout (`AbortError`) se reescriben a `NetworkDeferredError`. El status HTTP NO se interpreta aquí.
 */
export async function githubFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new NetworkDeferredError('offline');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkDeferredError('timeout', error);
    }
    // Un fetch que falla por red (DNS, conexión rechazada, offline en mitad de vuelo) lanza TypeError.
    if (error instanceof TypeError) {
      throw new NetworkDeferredError('network', error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calcula los ms a esperar a partir de las cabeceras de rate-limit de GitHub en un 403/429.
 * Prioriza `Retry-After` (segundos o fecha HTTP); si no, usa `X-RateLimit-Remaining == 0` + `X-RateLimit-Reset`
 * (epoch en segundos). Devuelve 0 si el status no es de rate-limit o no hay información utilizable.
 */
export function parseRetryAfterMs(response: Response, nowMs: number): number {
  if (response.status !== 403 && response.status !== 429) return 0;

  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);
  }

  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (remaining === '0' && reset) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) return Math.max(0, resetMs - nowMs);
  }

  return 0;
}
