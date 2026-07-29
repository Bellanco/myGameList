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

// Tras un despliegue, un index.html cacheado apunta a chunks que ya no existen: cualquier `import()` diferido
// (modales, hub social, y con él la publicación de actividad de reseña) falla en silencio hasta recargar.
// Vite emite `vite:preloadError` en ese caso: se recarga UNA vez por pestaña (el flag evita el bucle si el
// fallo no era de caché sino de red persistente).
const PRELOAD_RELOAD_FLAG = 'myGameList.preloadReloaded';
window.addEventListener('vite:preloadError', (event) => {
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

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

// Herramienta de diagnóstico SOLO EN DESARROLLO: audita, sin escribir nada, qué fechas de publicación de mis
// reseñas sobreviven en el historial de revisiones del gist social. Se lanza desde la consola con
// `__socialDateAudit()`. Fuera de `dev` no se expone.
if (import.meta.env.DEV) {
  (window as unknown as { __socialDateAudit?: (o?: { maxRevisions?: number }) => Promise<unknown> }).__socialDateAudit = async (
    options?: { maxRevisions?: number },
  ) => {
    const { auditPublishedReviewDates } = await import('./model/repository/socialActivityHistory');
    const report = await auditPublishedReviewDates(options);
    if (!report) {
      console.warn('[social] auditoría: sin sesión de Google o sin canal social en este dispositivo');
      return null;
    }
    const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    console.warn(
      `[social] auditoría de fechas — gist ${report.gistId}: ${report.publishedNow} reseñas publicadas, ` +
        `${report.scannedRevisions}/${report.totalRevisions} revisiones recorridas → ` +
        `${report.recoverable.length} con fecha original recuperable, ${report.withoutOlderDate} sin fecha anterior`,
    );
    report.inspected.forEach((gist) => {
      console.warn(
        `   gist ${gist.gistId.slice(0, 10)}${gist.isCurrent ? ' (ACTUAL)' : ' (abandonado)'}: ` +
          `${gist.scannedRevisions}/${gist.revisions} revisiones, ${gist.reviewEntries} reseñas vistas, ` +
          `más antigua ${gist.oldestDate ? fecha(gist.oldestDate) : '—'}`,
      );
    });
    console.warn('   día        | en el gist | en el listado');
    report.datesByDay.forEach((row) => {
      console.warn(`   ${row.day} | ${String(row.enGist).padStart(10)} | ${String(row.enListado).padStart(13)}`);
    });
    report.recoverable.forEach((item) => {
      console.warn(
        `   ${item.gameName}: ${fecha(item.currentUpdatedAt)} → ${fecha(item.originalUpdatedAt)} ` +
          `(gist ${item.fromGistId.slice(0, 10)}, rev ${item.fromRevision.slice(0, 8)})`,
      );
    });
    return report;
  };
}

// Herramienta de diagnóstico SOLO EN DESARROLLO: reasigna a una fecha ancla el histórico de reseñas que se
// publicó con un `_ts` sellado en bloque (importación / sobrescritura), dejando intactas las publicadas en su
// día. Simulacro por defecto: `__socialFixHistoryDates({ date: '2026-05-12' })`; escribe con `apply: true`.
if (import.meta.env.DEV) {
  (window as unknown as {
    __socialFixHistoryDates?: (o: { date: string; apply?: boolean }) => Promise<unknown>;
  }).__socialFixHistoryDates = async (options: { date: string; apply?: boolean }) => {
    const { repairUndatedHistoryDates } = await import('./model/repository/socialActivityHistory');
    const plan = await repairUndatedHistoryDates(options);
    if (!plan) {
      console.warn('[social] sin sesión de Google o sin canal social en este dispositivo');
      return null;
    }
    const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    console.warn(
      `[social] histórico ${plan.applied ? 'REASIGNADO' : '(simulacro, sin escribir)'} a ${options.date}: ` +
        `${plan.toMove.length} entradas se mueven, ${plan.keeping.length} conservan su fecha. ` +
        `Días sellados en bloque detectados: ${plan.bulkDays.join(', ') || 'ninguno'}`,
    );
    plan.keeping
      .slice()
      .sort((a, b) => a.date - b.date)
      .forEach((item) => console.warn(`   conserva  ${fecha(item.date)}  ${item.gameName}`));
    return plan;
  };
}

// Diagnóstico SOLO EN DESARROLLO: por qué el feed y la pestaña Reseñas pueden mostrar fechas distintas.
// Compara la fecha publicada en el gist con la de la caché del directorio (lo que sirve el hub) y las locales.
if (import.meta.env.DEV) {
  (window as unknown as { __socialReviewDates?: () => Promise<unknown> }).__socialReviewDates = async () => {
    const { inspectReviewDates } = await import('./model/repository/socialActivityHistory');
    const report = await inspectReviewDates();
    if (!report) {
      console.warn('[social] sin sesión de Google o sin canal social en este dispositivo');
      return null;
    }
    const fecha = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—');
    console.warn(
      `[social] fechas de reseña — gist ${report.gistId}: ${report.rows.length} publicadas | ` +
        `entrada propia en la caché del directorio: ${report.cacheEntryFound ? 'sí' : 'NO'} ` +
        `(${report.cacheActivityCount} actividades) | discrepancias gist vs caché: ${report.mismatchesGistVsCache}`,
    );
    console.warn('   juego | en gist | en caché | _ts local | reviewedAt');
    report.rows.slice(0, 12).forEach((row) => {
      console.warn(
        `   ${row.gameName} | ${fecha(row.enGist)} | ${fecha(row.enCache)} | ${fecha(row.ts)} | ${fecha(row.reviewedAt)}`,
      );
    });
    return report;
  };
}

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
