import { defineConfig, devices } from '@playwright/test';

/**
 * Config del smoke test end-to-end (`tests/e2e/`). Se ejecuta con `npm run test:e2e`.
 *
 * Corre contra el BUILD DE PRODUCCIÓN servido por `vite preview`, no contra el servidor de desarrollo. Es la
 * diferencia entre que el test valga o no: lo que puede romperse en un despliegue —un chunk que no entra en el
 * grafo, la sustitución de marcadores del service worker, el CSS con hash, la inicialización en modo minificado—
 * solo existe en el build.
 *
 * El host es `127.0.0.1` A PROPÓSITO: en `localhost` la app DESREGISTRA el service worker (ver el final de
 * `src/main.tsx`), así que ahí no se puede comprobar nada del precache.
 */
const PORT = 4321;

export default defineConfig({
  testDir: './tests/e2e',
  // Un smoke test que se reintenta esconde justo lo que debe delatar: si es inestable, es un test malo.
  retries: 0,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --outDir dist`,
    url: `http://127.0.0.1:${PORT}/`,
    // No se reutiliza un servidor ya levantado en CI, pero sí en local (iterar sin reconstruir).
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
