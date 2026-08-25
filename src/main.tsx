import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './view/components/AppErrorBoundary';
import { initializeFirebaseServices, reportHandledError } from './model/repository/firebaseGateway';
import { readPublicShareToken } from './model/repository/publicShareRepository';
import { runMigration } from './model/repository/dataMigrationRepository';
import { runWhenIdle } from './core/utils/idle';
import { registerServiceWorker } from './core/utils/appUpdate';
import { isOffline } from './core/utils/network';
import { SOCIAL_GIST_CFG_KEY, STORAGE_KEY } from './core/constants/storageKeys';
import './styles/index.scss';

const root = createRoot(document.getElementById('root') as HTMLElement);

/**
 * ¿Hay una instalación de la app en ESTE navegador? Se mira el almacenamiento local, que es una señal barata y
 * suficiente. A propósito NO se carga Firebase para averiguarlo: eso es justo lo que se quiere evitar en la
 * página pública de una reseña compartida.
 */
function hasLocalApp(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(SOCIAL_GIST_CFG_KEY));
  } catch {
    return false;
  }
}

// MODO ARTÍCULO: alguien ha abierto un enlace compartido y no tiene la app en este navegador.
//
// Se monta SOLO la pantalla de la reseña, sin enrutador, sin hub social, sin Firebase, sin App Check, sin
// analítica y sin service worker. Son dos cosas a la vez: la navegación queda cerrada (no hay a dónde ir salvo
// el enlace explícito a la app) y la página se queda en lo mínimo, sin instalar nada ni contactar con terceros
// a espaldas de quien solo venía a leer una reseña.
// Perezosa a propósito, aunque aquí se necesite enseguida: importarla de forma estática la metería en el chunk
// de ARRANQUE, que carga todo el mundo y tiene presupuesto vigilado (`BOOT_PAYLOAD_BUDGET_KB`). Así solo la
// descarga quien abre un enlace compartido.
const PublicReviewScreen = lazy(() =>
  import('./view/components/PublicReviewScreen').then((module) => ({ default: module.PublicReviewScreen })),
);

const publicShareToken = readPublicShareToken(window.location.pathname);
if (publicShareToken && !hasLocalApp()) {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <Suspense fallback={null}>
          <PublicReviewScreen token={publicShareToken} standalone />
        </Suspense>
      </AppErrorBoundary>
    </StrictMode>,
  );
} else {
  bootApp();
}

function bootApp(): void {

  // Red de seguridad global para errores que NO pasan por un error boundary de React (código async, promesas
  // rechazadas sin catch, event handlers). Best-effort: reporta a la telemetría sin bloquear ni relanzar.
  window.addEventListener('error', (event) => {
    void reportHandledError(event.error ?? event.message, false, 'window.error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    void reportHandledError(event.reason, false, 'unhandledrejection');
  });

  // Tras un despliegue, un index.html cacheado apunta a chunks que ya no existen: cualquier `import()` diferido
  // (modales, hub social, y con él la publicación de actividad de reseña) falla en silencio hasta recargar.
  // Vite emite `vite:preloadError` en ese caso: se recarga UNA vez por pestaña (el flag evita el bucle si el
  // fallo no era de caché sino de red persistente).
  const PRELOAD_RELOAD_FLAG = 'myGameList.preloadReloaded';
  window.addEventListener('vite:preloadError', (event) => {
    // SIN RED no se recarga: el chunk no falló por un despliegue nuevo, sino porque no hay conexión y todavía no
    // estaba en la caché del service worker. Recargar no lo traería —y además tira el estado de la pantalla y la
    // navegación en curso—, así que se deja que el error siga su camino hasta el boundary, que sabe contarlo como
    // falta de conexión (ver `SocialErrorBoundary`).
    if (isOffline()) {
      return;
    }
    try {
      if (sessionStorage.getItem(PRELOAD_RELOAD_FLAG)) {
        return; // ya se recargó en esta pestaña: dejar que el error siga su curso normal
      }
      sessionStorage.setItem(PRELOAD_RELOAD_FLAG, '1');
    } catch {
      return; // sin sessionStorage no hay forma de acotar el bucle: mejor no recargar
    }

    event.preventDefault();
    window.location.reload();
  });

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </StrictMode>,
  );

  // Herramientas de diagnóstico de fechas de reseña (`__socialDateAudit`, `__socialFixHistoryDates`,
  // `__socialReviewDates`), SOLO EN DESARROLLO. Vivían aquí, en tres bloques `DEV` seguidos que sumaban más
  // líneas que el propio arranque; ahora son un módulo aparte (`dev/socialDateTools`). Al colgar de un `DEV`
  // falso, en producción el bundler se lleva por delante el `import()` y el módulo entero.
  if (import.meta.env.DEV) {
    void import('./dev/socialDateTools').then((m) => m.installSocialDateTools());
  }

  runWhenIdle(() => {
    void initializeFirebaseServices();
    // Migración local (Vía A): puebla el store `games` (v4) en idle. Es idempotente (guardada por
    // migrationVersion) y NO destructiva (appState sigue siendo la fuente de verdad), así que la app
    // funciona igual. Cualquier error queda aislado y no afecta al arranque.
    void runMigration().catch(() => {});
  });

  // Registro del service worker Y vigilancia de versiones nuevas: antes esto era solo un `register()`, y una
  // pestaña abierta podía quedarse días con el bundle viejo porque nadie volvía a mirar `/service-worker.js`
  // (ver `core/utils/appUpdate`).
  registerServiceWorker();
}
