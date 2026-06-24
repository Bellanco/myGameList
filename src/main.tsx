import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initializeFirebaseServices } from './model/repository/firebaseRepository';
import { runMigration } from './model/repository/dataMigrationRepository';
import './styles/index.scss';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
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
