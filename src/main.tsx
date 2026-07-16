import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './view/components/AppErrorBoundary';
import { initializeFirebaseServices, reportHandledError } from './model/repository/firebaseGateway';
import { runMigration } from './model/repository/dataMigrationRepository';
import './styles/index.scss';

// Red de seguridad global para errores que NO pasan por un error boundary de React (código async, promesas
// rechazadas sin catch, event handlers). Best-effort: reporta a la telemetría sin bloquear ni relanzar.
window.addEventListener('error', (event) => {
  void reportHandledError(event.error ?? event.message, false, 'window.error');
});
window.addEventListener('unhandledrejection', (event) => {
  void reportHandledError(event.reason, false, 'unhandledrejection');
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

const idleScheduler = (globalThis as unknown as {
  requestIdleCallback?: (callback: () => void) => number;
}).requestIdleCallback;

function runIdleStartupTasks(): void {
  void initializeFirebaseServices();
  // Migración local (Vía A): puebla el store `games` (v4) en idle. Es idempotente (guardada por
  // migrationVersion) y NO destructiva (appState sigue siendo la fuente de verdad), así que la app
  // funciona igual. Cualquier error queda aislado y no afecta al arranque.
  void runMigration().catch(() => {});
}

if (typeof idleScheduler === 'function') {
  idleScheduler(() => {
    runIdleStartupTasks();
  });
} else {
  setTimeout(() => {
    runIdleStartupTasks();
  }, 0);
}

if ('serviceWorker' in navigator) {
  const hostnameParts = location.hostname.split('.');
  const isCloudflarePreview = location.hostname.endsWith('.pages.dev') && hostnameParts.length > 3;

  if (location.hostname === 'localhost' || isCloudflarePreview) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  } else {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Keep silent: service worker is optional for local fallback scenarios.
    });
  }
}
