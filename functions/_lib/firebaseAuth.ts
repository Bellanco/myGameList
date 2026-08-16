// Verificación del ID token de Firebase en el borde, con WebCrypto.
//
// POR QUÉ AQUÍ Y NO CON EL ADMIN SDK: el Admin SDK no corre en Workers, y una cuenta de servicio en el Worker
// sería una llave maestra (se salta reglas y App Check) guardada para algo que no la necesita. Un ID token es
// un JWT firmado por Google: verificarlo son ~80 líneas y no exige ningún secreto nuestro.
//
// QUÉ SE COMPRUEBA (todo o se rechaza): algoritmo RS256, que el `kid` esté entre las claves públicas vigentes de
// Google, la firma, el emisor, la audiencia (= projectId), que no haya caducado y que traiga `sub`. Sin alguna de
// esas comprobaciones el token sería falsificable, así que no hay atajos "de desarrollo" en este fichero.
import type { KVNamespace } from './keys';

/** Claves públicas con las que Google firma los ID tokens de Firebase Auth. */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwks/securetoken@system.gserviceaccount.com';
const JWKS_CACHE_KEY = 'jwks:securetoken';
const JWKS_CACHE_TTL_SECONDS = 3_600; // Google rota las claves cada pocas horas; una hora es prudente y barata.

/** Margen para el desfase de reloj entre Google y el borde. Un minuto: suficiente sin abrir la mano. */
const CLOCK_SKEW_SECONDS = 60;

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** El token tal cual llegó: se reenvía a Firestore para leer el perfil con los permisos de su dueño. */
  idToken: string;
}

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty?: string;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Claves públicas de Google, cacheadas en KV para no pedirlas en cada petición. */
async function loadJwks(kv: KVNamespace): Promise<Jwk[]> {
  const cached = await kv.get(JWKS_CACHE_KEY, 'json');
  if (cached && Array.isArray((cached as { keys?: Jwk[] }).keys)) {
    return (cached as { keys: Jwk[] }).keys;
  }
  const response = await fetch(JWKS_URL);
  if (!response.ok) {
    throw new Error('No se pudieron leer las claves públicas de Google');
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = body.keys || [];
  await kv.put(JWKS_CACHE_KEY, JSON.stringify({ keys }), { expirationTtl: JWKS_CACHE_TTL_SECONDS });
  return keys;
}

/**
 * Verifica el ID token y devuelve quién es. Lanza si algo no cuadra: quien llama responde 401 sin detallar el
 * motivo (un atacante no necesita saber en qué comprobación falló).
 */
export async function verifyIdToken(idToken: string, projectId: string, kv: KVNamespace): Promise<AuthUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token mal formado');
  }
  const header = decodeJsonSegment(parts[0]);
  const payload = decodeJsonSegment(parts[1]);
  if (!header || !payload) {
    throw new Error('Token ilegible');
  }
  if (header.alg !== 'RS256') {
    // Rechazar cualquier otro algoritmo es lo que cierra el ataque clásico de `alg: none` / cambio a HMAC.
    throw new Error('Algoritmo no admitido');
  }

  const keys = await loadJwks(kv);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error('Clave de firma desconocida');
  }

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(parts[2]), signed);
  if (!valid) {
    throw new Error('Firma inválida');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp) || 0;
  const iat = Number(payload.iat) || 0;
  const sub = String(payload.sub || '');
  if (exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error('Token caducado');
  }
  if (iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error('Token emitido en el futuro');
  }
  if (payload.aud !== projectId) {
    throw new Error('Audiencia incorrecta');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Emisor incorrecto');
  }
  if (!sub) {
    throw new Error('Token sin sujeto');
  }

  return {
    uid: sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    idToken,
  };
}

/** Extrae el ID token de la cabecera `Authorization: Bearer …`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * ¿Es el administrador? MISMO criterio que `firestore.rules` (`isAdmin`): correo verificado e igual al del
 * administrador. El correo se lee de la variable de entorno para no tener el literal en dos sitios que puedan
 * divergir.
 */
export function isAdmin(user: AuthUser, adminEmail: string | undefined): boolean {
  const expected = String(adminEmail || '').trim().toLowerCase();
  return Boolean(expected) && user.emailVerified && (user.email || '').toLowerCase() === expected;
}
