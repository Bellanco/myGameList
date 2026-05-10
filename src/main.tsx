import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initializeFirebaseServices } from './model/repository/firebaseRepository';
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

if (typeof idleScheduler === 'function') {
  idleScheduler(() => {
    void initializeFirebaseServices();
  });
} else {
  setTimeout(() => {
    void initializeFirebaseServices();
  }, 0);
}

if ('serviceWorker' in navigator) {
  if (location.hostname === 'localhost') {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  } else {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Keep silent: service worker is optional for local fallback scenarios.
    });
  }
}
