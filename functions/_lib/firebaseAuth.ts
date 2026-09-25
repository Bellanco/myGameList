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
import { CLOCK_SKEW_SECONDS, decodeRs256Jwt, loadJwks, verifyRs256Signature } from './jwt';

/**
 * Claves públicas con las que Google firma los ID tokens de Firebase Auth.
 *
 * OJO CON EL NOMBRE: la ruta es `/jwk/`, en SINGULAR. La forma en plural (`/jwks/`, que es como se llama el
 * formato) devuelve un 404 en HTML, y como el fallo es cerrado el síntoma sería desconcertante: todos los
 * usuarios recibirían 401 y parecería un problema de sesión. Comprobado a mano contra el endpoint real.
 * (La de App Check es justo al revés, `/v1/jwks` en plural: ver `appCheck.ts`.)
 */
export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const JWKS_CACHE_KEY = 'jwks:securetoken';
const JWKS_CACHE_TTL_SECONDS = 3_600; // Google rota las claves cada pocas horas; una hora es prudente y barata.

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** El token tal cual llegó: se reenvía a Firestore para leer el perfil con los permisos de su dueño. */
  idToken: string;
}

/**
 * Verifica el ID token y devuelve quién es. Lanza si algo no cuadra: quien llama responde 401 sin detallar el
 * motivo (un atacante no necesita saber en qué comprobación falló).
 */
export async function verifyIdToken(idToken: string, projectId: string, kv: KVNamespace): Promise<AuthUser> {
  const jwt = decodeRs256Jwt(idToken);
  const keys = await loadJwks(kv, JWKS_URL, JWKS_CACHE_KEY, JWKS_CACHE_TTL_SECONDS);
  await verifyRs256Signature(jwt, keys);
  const { payload } = jwt;

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
