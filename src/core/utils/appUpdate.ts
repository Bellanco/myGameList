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
 * Cuando el SW nuevo toma el control Y TRAE UNA VERSIÓN DISTINTA DE LA QUE ESTA PÁGINA EJECUTA, avisa por
 * `APP_UPDATE_EVENT`; la política de QUÉ hacer con ese aviso (recargar o preguntar) vive en
 * `view/hooks/useAppUpdate`, que es quien sabe si el usuario tiene trabajo a medias. Este módulo no decide nada
 * de eso.
 *
 * ⚑ EL SEGUNDO FALLO QUE CIERRA: «actualiza la web» en la PRIMERA apertura después de cada despliegue. El relevo
 * de controlador se estaba leyendo como «tú tienes la versión vieja», y no lo es. Al publicar, la primera
 * navegación la sirve todavía el SW ANTERIOR, pero red-primero y con el HTML en `no-store`: el documento que se
 * pinta es YA el nuevo, con los chunks nuevos. Un instante después, `register()` instala el SW nuevo, que hace
 * `skipWaiting()` + `clients.claim()` y dispara `controllerchange` — con lo que la página anunciaba una
 * actualización que llevaba puesta desde el primer milisegundo. Era un falso positivo GARANTIZADO en cada
 * despliegue, y encima el único que la mayoría de la gente llegaba a ver.
 *
 * Ahora se comparan dos identificadores del MISMO build: el que el documento lleva en `<meta name="app-build">`
 * y el que el service worker lleva dentro (`BUILD_ID`), los dos puestos por el plugin `service-worker-precache`
 * de `vite.config.ts`. Iguales → esta página ya es la versión que el worker sirve y no hay nada que anunciar.
 * Distintos, o no hay forma de saberlo → se avisa, que es el lado seguro: perder una actualización de verdad
 * deja a alguien días con el bundle viejo, y de eso trata todo este fichero.
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

/**
 * Cuánto se espera a que el service worker diga qué versión sirve antes de dar el aviso igualmente.
 *
 * Es un intercambio de mensajes entre dos hilos del mismo navegador: si en tres segundos no ha contestado, o no
 * está escuchando (un worker anterior a esta comprobación) o algo va mal, y ante la duda vale más un aviso de
 * sobra que una pestaña encallada en la versión de la semana pasada.
 */
const BUILD_ANSWER_MS = 3000;

/** El marcador sin sustituir: en desarrollo no hay build que comparar (ver `index.html`). */
const BUILD_TOKEN = '__BUILD_ID__';

let registration: ServiceWorkerRegistration | null = null;
let lastCheckAt = 0;
let triggersAttached = false;

/** Un aviso en espera de saber si de verdad hace falta. `null` cuando no hay ninguna comprobación en marcha. */
let pendingNotice: ReturnType<typeof setTimeout> | null = null;

/**
 * ¿Ya se ha avisado de ESTE relevo? El worker contesta a la pregunta Y además difunde su versión al activarse,
 * así que la misma noticia llega por dos caminos; el consumidor es idempotente, pero un evento repetido es un
 * evento que alguien acabará contando dos veces.
 */
let noticeGiven = false;

/** La versión que ejecuta ESTE documento. Cadena vacía cuando no se puede saber (desarrollo, HTML sin parchear). */
function documentBuild(): string {
  const meta = document.querySelector('meta[name="app-build"]');
  const value = meta?.getAttribute('content')?.trim() || '';
  return value === BUILD_TOKEN ? '' : value;
}

function cancelPendingNotice(): void {
  if (pendingNotice !== null) {
    clearTimeout(pendingNotice);
    pendingNotice = null;
  }
}

function announceUpdate(): void {
  cancelPendingNotice();
  if (noticeGiven) {
    return;
  }
  noticeGiven = true;
  window.dispatchEvent(new CustomEvent(APP_UPDATE_EVENT));
}

/**
 * ¿El relevo de controlador deja vieja a esta página? Se le pregunta al worker que acaba de tomar el mando.
 *
 * El aviso queda ARMADO mientras se espera la respuesta, no descartado: si nadie contesta, sale de todas formas
 * (ver `BUILD_ANSWER_MS`). Solo una respuesta con el mismo identificador lo desactiva, y eso lo hace el
 * manejador de mensajes.
 */
function checkBuildOfNewController(): void {
  noticeGiven = false; // un relevo nuevo es una noticia nueva: dos despliegues seguidos son dos avisos
  const controller = navigator.serviceWorker.controller;
  if (!controller || !documentBuild()) {
    announceUpdate(); // sin con qué comparar, se avisa como se hacía siempre
    return;
  }
  if (pendingNotice !== null) {
    return; // ya hay una comprobación en vuelo: dos relevos seguidos no son dos avisos
  }
  pendingNotice = setTimeout(announceUpdate, BUILD_ANSWER_MS);
  try {
    controller.postMessage({ tipo: 'build-id' });
  } catch {
    announceUpdate();
  }
}

/**
 * La respuesta del worker, y también lo que difunde por su cuenta al activarse (que cubre a la pestaña cuyo
 * relevo lo provocó otra). Si los dos identificadores se conocen y coinciden, el aviso armado se desactiva; si
 * difieren, se anuncia sin esperar al plazo.
 */
function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as { tipo?: string; buildId?: string } | null;
  if (data?.tipo !== 'build' || !data.buildId) {
    return;
  }
  const own = documentBuild();
  if (!own) {
    return; // no se sabe qué ejecuta esta página: manda el flujo normal
  }
  if (data.buildId === own) {
    cancelPendingNotice();
    return;
  }
  announceUpdate();
}

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
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage as EventListener);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = hasController;
    hasController = true;
    if (!wasControlled) {
      return; // primera toma de control, no hay versión anterior de la que venir
    }
    // Y TAMPOCO BASTA CON QUE HAYA RELEVO: hay que saber si el relevo trae otra versión (ver la cabecera).
    checkBuildOfNewController();
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
