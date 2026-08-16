/**
 * Detección de versión nueva en una app ya abierta (PWA).
 *
 * EL PROBLEMA QUE CIERRA: `service-worker.js` ya hace `skipWaiting()` + `clients.claim()`, y `public/_headers`
 * sirve el HTML con `no-store` y el propio SW con `no-cache`. Es decir, en cuanto el navegador VUELVE A MIRAR
 * `/service-worker.js`, la versión nueva entra sola. El agujero estaba en ese "vuelve a mirar": el navegador solo
 * lo comprueba en una NAVEGACIÓN de verdad (o, por su cuenta, cada ~24 h), y esta app es un SPA con
 * `BrowserRouter` — moverse por ella no genera ninguna navegación. Una pestaña abierta, o una PWA instalada en
 * móvil (que no se cierra nunca del todo), podía pasar días ejecutando el bundle anterior. Volver a la app desde
 * la bfcache tampoco ayuda: restaura el documento tal cual, con el JavaScript viejo dentro. Por eso el único
 * gesto que "funcionaba" era Ctrl+Shift+R, que es lo único que salta a la vez el service worker y la caché HTTP.
 *
 * QUÉ HACE: le pregunta al servidor por un SW nuevo en los momentos en los que el usuario vuelve a la app
 * (visible, foco, restauración de bfcache, recuperación de red) y, si no vuelve, cada `CHECK_INTERVAL_MS`.
 * Cuando el SW nuevo toma el control, avisa por `APP_UPDATE_EVENT`; la política de QUÉ hacer con ese aviso
 * (recargar o preguntar) vive en `view/hooks/useAppUpdate`, que es quien sabe si el usuario tiene trabajo a
 * medias. Este módulo no decide nada de eso.
 *
 * Este fichero no toca `model/`: es infraestructura del navegador, y mezclarlo con el estado de la app le daría
 * a la capa equivocada la decisión de recargar.
 */

/** Evento (en `window`) con el que se anuncia que hay una versión nueva YA ACTIVA. Sin detalle: solo el aviso. */
export const APP_UPDATE_EVENT = 'mygamelist:app-update';

/**
 * Cada cuánto se comprueba si hay versión nueva con la app abierta y sin que el usuario vuelva a ella.
 * Es la red de seguridad para la sesión que se queda horas en primer plano; el caso normal lo cubren los
 * disparadores de vuelta a la app, que son gratis y llegan antes.
 */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Mínimo entre dos comprobaciones. Los disparadores se solapan a propósito (volver a la app dispara a la vez
 * `visibilitychange`, `focus` y a veces `pageshow`), así que sin este tope una sola vuelta pediría el SW tres
 * veces seguidas.
 */
const CHECK_THROTTLE_MS = 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let lastCheckAt = 0;
let triggersAttached = false;

/**
 * ¿Tiene esta página un service worker controlándola? Se lee de forma SÍNCRONA al registrar, antes de nada.
 *
 * Es el filtro que distingue las dos cosas que disparan `controllerchange`: la PRIMERA toma de control (visita
 * inicial, no había SW y ahora sí) NO es una actualización y no debe avisar de nada. Es una variable y no una
 * constante para que un segundo cambio de controlador en esa misma sesión —dos despliegues seguidos mientras la
 * página sigue abierta— sí se anuncie.
 */
let hasController = false;

function checkForUpdate(): void {
  if (!registration) {
    return;
  }
  const now = Date.now();
  if (now - lastCheckAt < CHECK_THROTTLE_MS) {
    return;
  }
  lastCheckAt = now;
  // Sin red, `update()` rechaza. No es un error que reportar: el siguiente disparador reintentará.
  void registration.update().catch(() => {});
}

/**
 * Momentos en los que se pregunta por una versión nueva. Todos son "el usuario ha vuelto a la app": es cuando
 * hace falta estar al día y cuando una recarga molesta menos.
 */
function attachTriggers(): void {
  if (triggersAttached) {
    return;
  }
  triggersAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });
  window.addEventListener('focus', checkForUpdate);
  // Al recuperar la red: si el usuario ha estado sin conexión, es probable que se haya perdido comprobaciones.
  window.addEventListener('online', checkForUpdate);
  // Restauración desde la bfcache: el documento vuelve intacto, sin ejecutar nada de arranque. Es justo el caso
  // en el que la app puede llevar días con el bundle viejo, así que se salta el tope y se comprueba siempre.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) {
      lastCheckAt = 0;
      checkForUpdate();
    }
  });

  window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

/**
 * Punto único de recarga. Está aislado en una función a propósito: `location.reload` no se puede sustituir en
 * jsdom, así que sin esto la política de recarga automática (`view/hooks/useAppUpdate`) no sería comprobable.
 */
export function reloadNow(): void {
  window.location.reload();
}

/**
 * Registra el service worker y engancha la vigilancia de actualizaciones.
 *
 * En localhost y en las vistas previas de Cloudflare se DESREGISTRA en lugar de instalarse: un SW cacheando en
 * esos orígenes deja copias viejas por medio y confunde cualquier prueba.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const hostnameParts = location.hostname.split('.');
  const isCloudflarePreview = location.hostname.endsWith('.pages.dev') && hostnameParts.length > 3;

  if (location.hostname === 'localhost' || isCloudflarePreview) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((entry) => entry.unregister());
    });
    return;
  }

  // ANTES del `register()`, y de forma síncrona: si ya había un SW instalado con una versión nueva a medio
  // activar, su `controllerchange` puede llegar antes de que la promesa del registro resuelva. Enganchado
  // después, ese aviso —el único que habrá— se perdería.
  hasController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = hasController;
    hasController = true;
    if (!wasControlled) {
      return; // primera toma de control, no hay versión anterior de la que venir
    }
    window.dispatchEvent(new CustomEvent(APP_UPDATE_EVENT));
  });

  navigator.serviceWorker
    .register('/service-worker.js')
    .then((reg) => {
      registration = reg;
      lastCheckAt = Date.now(); // el propio registro ya ha comprobado el script: no repetirlo al instante
      attachTriggers();
    })
    .catch(() => {
      // Keep silent: service worker is optional for local fallback scenarios.
    });
}
