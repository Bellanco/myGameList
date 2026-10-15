// LA CUENTA DE SERVICIO del panel (docs/plan-cuentas-inactivas.md): un token de acceso de Google firmado en el
// borde con WebCrypto, sin Admin SDK (no corre en Workers).
//
// ES UNA LLAVE MAESTRA y por eso está acotada (ver la cabecera de `firebaseAuth.ts`, que explica por qué el resto de
// las Functions no la usa): solo la piden los endpoints que pasan por `requireAdmin` y la baja de la propia cuenta
// (`/api/account`), y sus permisos en IAM son dos roles —Firebase Authentication Admin y Cloud Datastore User—, no
// Owner ni Editor. Vive en el secreto `FIREBASE_ADMIN_SA` (el JSON entero de la clave), nunca en `wrangler.toml`.
//
// Lo que NO hace: no guarda el token en KV (sería dejar una credencial en un almacén que leen otros endpoints). Se
// guarda en la memoria del aislado mientras viva, que es lo que dura de verdad una petición del panel.
import { ServiceUnavailableError } from './http';

export interface ServiceAccountEnv {
  /** El JSON de la clave de la cuenta de servicio, tal cual lo descarga la consola de Google Cloud. */
  FIREBASE_ADMIN_SA?: string;
}

interface ServiceAccountKey {
  clientEmail: string;
  privateKeyPem: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** Google da tokens de una hora; se renueva cinco minutos antes para no usar uno a punto de caducar. */
const TOKEN_TTL_SECONDS = 3600;
const RENEW_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_FETCH_TIMEOUT_MS = 5000;

let cached: { token: string; expiresAt: number; clientEmail: string } | null = null;

/** El JSON del secreto, o `null` si falta o no tiene la forma de una clave de cuenta de servicio. */
export function parseServiceAccount(raw: string | undefined): ServiceAccountKey | null {
  if (!raw || !raw.trim()) return null;
  try {
    const data = JSON.parse(raw) as { type?: unknown; client_email?: unknown; private_key?: unknown };
    if (data.type !== 'service_account') return null;
    if (typeof data.client_email !== 'string' || typeof data.private_key !== 'string') return null;
    if (!data.private_key.includes('PRIVATE KEY')) return null;
    return { clientEmail: data.client_email, privateKeyPem: data.private_key };
  } catch {
    return null;
  }
}

export function hasServiceAccount(env: ServiceAccountEnv): boolean {
  return parseServiceAccount(env.FIREBASE_ADMIN_SA) !== null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** La clave privada PEM (PKCS#8) como `CryptoKey` de firma. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  const binary = atob(body);
  const der = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) der[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** El JWT firmado que se canjea por el token de acceso (flujo «JWT bearer» de OAuth 2.0 para cuentas de servicio). */
export async function signAssertion(key: ServiceAccountKey, nowSeconds: number): Promise<string> {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iss: key.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  });
  const signingKey = await importPrivateKey(key.privateKeyPem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export class ServiceAccountMissingError extends Error {
  constructor() {
    super('Falta la cuenta de servicio (FIREBASE_ADMIN_SA)');
    this.name = 'ServiceAccountMissingError';
  }
}

/**
 * Un token de acceso de la cuenta de servicio. Lanza `ServiceAccountMissingError` sin secreto,
 * `ServiceUnavailableError` si Google no atiende, y un `Error` con el estado HTTP si no lo da (clave revocada, reloj
 * desfasado…). Nunca incluye la clave ni el token en el mensaje.
 */
export async function serviceAccessToken(env: ServiceAccountEnv, fetcher: typeof fetch = fetch): Promise<string> {
  const key = parseServiceAccount(env.FIREBASE_ADMIN_SA);
  if (!key) throw new ServiceAccountMissingError();
  const now = Date.now();
  if (cached && cached.clientEmail === key.clientEmail && cached.expiresAt - RENEW_MARGIN_MS > now) {
    return cached.token;
  }
  const assertion = await signAssertion(key, Math.floor(now / 1000));
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new ServiceUnavailableError('Google no respondió al pedir el token');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ServiceUnavailableError(`Google respondió ${response.status} al pedir el token`);
  }
  if (!response.ok) {
    throw new Error(`Google no dio el token de la cuenta de servicio (${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const token = typeof body?.access_token === 'string' ? body.access_token : '';
  if (!token) throw new Error('Google devolvió un token vacío');
  const ttlMs = (Number(body?.expires_in) || TOKEN_TTL_SECONDS) * 1000;
  cached = { token, expiresAt: now + ttlMs, clientEmail: key.clientEmail };
  return token;
}

/** Solo para las pruebas: olvida el token guardado en memoria. */
export function forgetServiceToken(): void {
  cached = null;
}
