import { defineConfig } from '@playwright/test';

/**
 * Config de las CAPTURAS del manifest (`npm run screenshots`), aparte de la del smoke.
 *
 * Aparte y no un proyecto más de `playwright.config.ts` por una razón simple: esto no comprueba nada, ESCRIBE
 * en `public/screenshots/`. Un recorrido que deja ficheros en el repo no puede correr en CI junto a los que
 * solo miran, ni entrar por descuido en `npm run test:e2e`.
 *
 * Contra el BUILD, como el smoke y por lo mismo llevado a las imágenes: lo que se enseña en el diálogo de
 * instalación tiene que ser la app que se instala —su CSS con hash, sus tipografías del propio origen—, no lo
 * que pinta el servidor de desarrollo. Hay que construir antes (`npm run build`); el puerto es distinto del
 * suyo para poder tener los dos levantados.
 */
const PORT = 4322;

export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.spec.ts',
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Las capturas del manifest son de la app en español (ver `playwright.config.ts`).
    locale: 'es-ES',
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --outDir dist`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
