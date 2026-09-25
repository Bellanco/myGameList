// Piezas comunes para verificar en el borde los JWT que firma Google con RS256: el ID token de Firebase Auth
// (`firebaseAuth.ts`) y el token de App Check (`appCheck.ts`).
//
// Aquí solo vive lo que es IGUAL para los dos —decodificar, traer y cachear las claves públicas, comprobar la
// firma—. Lo que distingue a cada token (emisor, audiencia, sujeto) se queda en su fichero, junto al motivo de
// cada comprobación. Antes esto estaba dentro de `firebaseAuth.ts`; se sacó al llegar el segundo verificador
// para no tener dos copias de la parte delicada.
import type { KVNamespace } from './keys';

export interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty?: string;
}

/** Un JWT partido y decodificado, todavía SIN verificar: nada de aquí es de fiar hasta `verifyRs256Signature`. */
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Las tres partes tal cual llegaron, que es sobre lo que se comprueba la firma. */
  parts: [string, string, string];
}

/** Margen para el desfase de reloj entre Google y el borde. Un minuto: suficiente sin abrir la mano. */
export const CLOCK_SKEW_SECONDS = 60;

// El `ArrayBuffer` explícito no es adorno: `new Uint8Array(n)` se tipa como `Uint8Array<ArrayBufferLike>`, que
// TypeScript no acepta donde WebCrypto pide un `BufferSource` (podría ser un `SharedArrayBuffer`).
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
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

/**
 * Parte el token y exige RS256. Lanza si no tiene tres partes, si alguna no es JSON o si el algoritmo es otro:
 * rechazar cualquier otro algoritmo es lo que cierra el ataque clásico de `alg: none` / cambio a HMAC.
 */
export function decodeRs256Jwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token mal formado');
  }
  const header = decodeJsonSegment(parts[0]);
  const payload = decodeJsonSegment(parts[1]);
  if (!header || !payload) {
    throw new Error('Token ilegible');
  }
  if (header.alg !== 'RS256') {
    throw new Error('Algoritmo no admitido');
  }
  return { header, payload, parts: [parts[0], parts[1], parts[2]] };
}

/** Claves públicas de Google, cacheadas en KV para no pedirlas en cada petición. */
export async function loadJwks(kv: KVNamespace, url: string, cacheKey: string, ttlSeconds: number): Promise<Jwk[]> {
  const cached = await kv.get(cacheKey, 'json');
  if (cached && Array.isArray((cached as { keys?: Jwk[] }).keys)) {
    return (cached as { keys: Jwk[] }).keys;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('No se pudieron leer las claves públicas de Google');
  }
  const body = (await response.json().catch(() => null)) as { keys?: Jwk[] } | null;
  const keys = body?.keys || [];
  if (keys.length === 0) {
    // Sin claves no se puede verificar nada, y cachear una respuesta vacía dejaría la verificación rota durante
    // todo el TTL aunque el endpoint se recuperase al minuto siguiente.
    throw new Error('Las claves públicas de Google llegaron vacías');
  }
  try {
    await kv.put(cacheKey, JSON.stringify({ keys }), { expirationTtl: ttlSeconds });
  } catch {
    // Cupo diario de escrituras agotado, o dos peticiones renovando la misma clave en el mismo segundo (429 de
    // KV). Las claves ya están aquí y son buenas: se verifica con ellas. Dejar que esto lanzara tumbaba TODAS las
    // peticiones autenticadas hasta el día siguiente, porque sin caché cada una volvía a intentar escribir.
  }
  return keys;
}

/** Busca la clave del `kid` del token y comprueba la firma. Lanza si la clave no existe o la firma no cuadra. */
export async function verifyRs256Signature(jwt: DecodedJwt, keys: Jwk[]): Promise<void> {
  const jwk = keys.find((key) => key.kid === jwt.header.kid);
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
  const [headerPart, payloadPart, signaturePart] = jwt.parts;
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(signaturePart), signed);
  if (!valid) {
    throw new Error('Firma inválida');
  }
}
