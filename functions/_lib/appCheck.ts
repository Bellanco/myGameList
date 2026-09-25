// Verificación del token de App Check EN EL BORDE (ver docs/plan-seguridad-rendimiento-steam.md, fase 1).
//
// QUÉ HUECO CIERRA: el cliente ya atestigua sus peticiones (`src/model/repository/appCheckRepository.ts`) y la
// exigencia de la consola de Firebase protege Firestore. Pero nuestras Pages Functions solo REENVIABAN el token
// a Firestore al leer el perfil: sus propias escrituras a KV (enlaces compartidos, cupo de carátulas, premios)
// las podía disparar cualquiera con una cuenta y un script. Aquí la Function lo comprueba ella misma.
//
// QUÉ SE COMPRUEBA (la lista de la documentación de Firebase, «Verify App Check tokens from a custom backend»):
// RS256, cabecera `typ: JWT`, `kid` entre las claves vigentes, firma, emisor = App Check de NUESTRO proyecto,
// audiencia que incluya `projects/<número>`, que no haya caducado, y el sujeto = el App ID de la app web (la
// documentación lo da por opcional; aquí se exige porque el proyecto tiene una sola app y es gratis).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// EL INTERRUPTOR, `APPCHECK_EDGE_MODE` en wrangler.toml:
//   off      no se mira nada (también si falta la variable o trae un valor que no es ninguno de los tres).
//   monitor  se verifica y se registra el veredicto en el log, pero NO se rechaza ninguna petición. Es el modo
//            para desplegar primero y comprobar con `wrangler pages deployment tail` que todo llega `ok`.
//   enforce  sin un token válido, 401.
//
// SI SE APAGA APP CHECK EN EL CLIENTE (vaciar `VITE_RECAPTCHA_SITE_KEY`, la «Opción A» de appCheckRepository),
// HAY QUE PONER ESTO EN `off` EN EL MISMO DESPLIEGUE: el borde no ve las variables del build, y en `enforce`
// rechazaría a todo el mundo.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
import type { Env, KVNamespace } from './keys';
import { fail } from './http';
import { CLOCK_SKEW_SECONDS, decodeRs256Jwt, loadJwks, verifyRs256Signature } from './jwt';

/** Claves públicas de App Check. En PLURAL (`/jwks`), al revés que las de Auth: comprobado contra el endpoint. */
export const APPCHECK_JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const APPCHECK_JWKS_CACHE_KEY = 'jwks:appcheck';
/** Seis horas: el máximo que recomienda Google. Cada fallo de caché es una escritura de KV, que tiene cupo diario. */
const APPCHECK_JWKS_CACHE_TTL_SECONDS = 6 * 3_600;

export type AppCheckMode = 'off' | 'monitor' | 'enforce';

export function appCheckMode(env: Env): AppCheckMode {
  const value = String(env.APPCHECK_EDGE_MODE || '').trim();
  return value === 'monitor' || value === 'enforce' ? value : 'off';
}

/** Lanza si el token no es de App Check, de este proyecto y de esta app. No explica el motivo hacia fuera. */
export async function verifyAppCheckToken(token: string, projectNumber: string, appId: string, kv: KVNamespace): Promise<void> {
  const jwt = decodeRs256Jwt(token);
  if (jwt.header.typ !== 'JWT') {
    throw new Error('Tipo de token incorrecto');
  }
  const keys = await loadJwks(kv, APPCHECK_JWKS_URL, APPCHECK_JWKS_CACHE_KEY, APPCHECK_JWKS_CACHE_TTL_SECONDS);
  await verifyRs256Signature(jwt, keys);
  const { payload } = jwt;

  const now = Math.floor(Date.now() / 1000);
  if ((Number(payload.exp) || 0) + CLOCK_SKEW_SECONDS < now) {
    throw new Error('Token caducado');
  }
  if (payload.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) {
    throw new Error('Emisor incorrecto');
  }
  // La audiencia llega como LISTA (`["projects/<número>", "projects/<id>"]`); se acepta también una cadena suelta
  // por si Google la simplifica, pero lo que tiene que estar es el NÚMERO de proyecto, no el id.
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audience.includes(`projects/${projectNumber}`)) {
    throw new Error('Audiencia incorrecta');
  }
  if (payload.sub !== appId) {
    throw new Error('App desconocida');
  }
}

/** Qué se registra: nunca el token ni el uid, solo lo que hace falta para decidir si se puede pasar a `enforce`. */
export type AppCheckVerdict = 'ok' | 'missing' | 'invalid' | 'misconfigured';

/**
 * La ruta, recortada a sus dos primeros tramos (`/api/share`). Algunas rutas llevan un token de enlace
 * compartido (`/api/share/<token>`), y un token en el log es un enlace que cualquiera con acceso al log podría
 * abrir o retirar.
 */
function routeForLog(request: Request): string {
  try {
    return new URL(request.url).pathname.split('/').slice(0, 3).join('/');
  } catch {
    return '?';
  }
}

/**
 * Aplica el interruptor a una petición YA autenticada. Devuelve la `Response` de rechazo o `null` para seguir,
 * con la misma forma que `requireUser`.
 */
export async function gateAppCheck(request: Request, env: Env): Promise<Response | null> {
  const mode = appCheckMode(env);
  if (mode === 'off') {
    return null;
  }

  const projectNumber = String(env.FIREBASE_PROJECT_NUMBER || '').trim();
  const appId = String(env.FIREBASE_APP_ID || '').trim();
  const token = request.headers.get('X-Firebase-AppCheck');

  let verdict: AppCheckVerdict = 'ok';
  let reason = '';
  if (!projectNumber || !appId) {
    verdict = 'misconfigured';
  } else if (!token) {
    verdict = 'missing';
  } else {
    try {
      await verifyAppCheckToken(token, projectNumber, appId, env.SHARES);
    } catch (error) {
      verdict = 'invalid';
      // El motivo SÍ va al log (es nuestro, y sin él no hay forma de saber qué falla); nunca a la respuesta.
      reason = error instanceof Error ? error.message : 'desconocido';
    }
  }

  if (mode === 'monitor' || verdict !== 'ok') {
    // `warn` y no `log`: es lo que admite la regla `no-console` del proyecto, y en `wrangler pages deployment tail`
    // sale igual. Una línea JSON por petición para poder filtrarla (`grep '"evt":"appcheck"'`).
    console.warn(JSON.stringify({ evt: 'appcheck', mode, verdict, reason, route: routeForLog(request) }));
  }

  if (mode === 'monitor' || verdict === 'ok') {
    return null;
  }
  if (verdict === 'misconfigured') {
    // Fallo NUESTRO, como la falta de FIREBASE_PROJECT_ID en `requireUser`: que se note al desplegar.
    return fail(500, 'La verificación de la app no está configurada en este entorno');
  }
  return fail(401, 'No se ha podido comprobar que la petición venga de la app. Recarga la página e inténtalo de nuevo');
}
