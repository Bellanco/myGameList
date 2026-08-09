// App Check (atestación de cliente) — MÓDULO AISLADO Y DESMONTABLE A PROPÓSITO.
//
// QUÉ RESUELVE: la clave web de Firebase es pública por diseño, así que cualquiera con una cuenta puede hablar
// con Firestore desde fuera de la app. Las reglas dicen QUIÉN puede hacer QUÉ, pero no CUÁNTO: sin esto, un
// autenticado puede recorrer el directorio entero de perfiles o inundar de peticiones de amistad, y la cuota la
// paga el proyecto. App Check exige que la petición venga de esta app de verdad.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CÓMO QUITARLO (si Google retira reCAPTCHA v3, empieza a cobrarlo o simplemente deja de compensar):
//
//   Opción A — apagarlo sin tocar código: borra `VITE_RECAPTCHA_SITE_KEY` del entorno de build. Sin clave, este
//   módulo NO carga nada, NO contacta con Google y `ensureAppCheck` es un no-op. La app queda exactamente como
//   estaba. Es el interruptor pensado para una urgencia; no hace falta desplegar código nuevo, solo rebuild.
//
//   Opción B — extirparlo del todo: borra este fichero, las dos llamadas a `ensureAppCheck` de
//   `firebaseAuthRepository` y las líneas de reCAPTCHA de la CSP en `public/_headers` (google.com y
//   gstatic.com en `script-src`, google.com en `frame-src`). No hay nada más enganchado: ningún otro módulo
//   importa de aquí.
//
//   Cambiar de proveedor (v3 → Enterprise) es UNA línea: la de `ReCaptchaV3Provider` de abajo. Se eligió v3
//   porque para App Check ambos son invisibles para el usuario (ninguno plantea desafíos) y Enterprise exige
//   proyecto de Google Cloud con facturación para dar exactamente el mismo resultado a esta escala.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
import type { FirebaseApp } from 'firebase/app';

/** Clave de SITIO de reCAPTCHA: pública, viaja en el bundle igual que el client_id de GitHub. La clave SECRETA
 *  no vive aquí ni en el repositorio: se pega una sola vez en la consola de Firebase. */
function getRecaptchaSiteKey(): string {
  return String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
}

/** ¿Está configurado? Lo consulta también la política de cookies para no prometer de menos ni de más. */
export function isAppCheckConfigured(): boolean {
  return getRecaptchaSiteKey().length > 0;
}

let appCheckPromise: Promise<void> | null = null;

/**
 * Inicializa App Check UNA sola vez por sesión. Idempotente: se puede llamar desde varios sitios sin coordinar.
 *
 * CUÁNDO SE LLAMA, Y POR QUÉ IMPORTA: solo cuando hay sesión de Google (al iniciarla o al restaurarla). NO en el
 * arranque en idle de `main.tsx`, que corre para TODO visitante. La diferencia no es cosmética: reCAPTCHA carga
 * un script de Google y puede poner cookies, así que inicializarlo en el arranque convertiría en falsa la promesa
 * de la política de cookies —"si solo abres la app y usas tus listas no contacta con ningún servidor ajeno ni
 * guarda cookies"— y pondría en rojo el test e2e que la vigila.
 *
 * Y es suficiente: las reglas de Firestore exigen estar autenticado para TODA lectura y escritura, así que sin
 * sesión no hay ninguna petición que atestiguar. Un visitante anónimo nunca necesita un token de App Check.
 *
 * Falla ABIERTO: si el script no carga (sin red, un bloqueador, o Google caído) no se propaga el error. Con la
 * exigencia desactivada da igual, y con ella activada el resultado es un 403 del backend, que es justo lo que se
 * quiere y se diagnostica solo. Lo que NUNCA debe hacer es impedir que la app arranque o se use.
 */
export async function ensureAppCheck(app: FirebaseApp): Promise<void> {
  const siteKey = getRecaptchaSiteKey();
  if (!siteKey) {
    return; // Interruptor de la Opción A: sin clave, ni se carga el módulo de App Check.
  }

  if (!appCheckPromise) {
    appCheckPromise = (async () => {
      try {
        // Import dinámico: `firebase/app-check` y el script de reCAPTCHA quedan fuera del chunk de arranque y
        // fuera incluso del chunk de Firebase, así que solo lo descarga quien inicia sesión.
        const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        /* falla abierto: ver nota de arriba. */
      }
    })();
  }

  return appCheckPromise;
}

/** Solo para pruebas: olvida la inicialización memoizada. */
export function resetAppCheckForTests(): void {
  appCheckPromise = null;
}
