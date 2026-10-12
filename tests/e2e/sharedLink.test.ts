import { devices, expect, test, type Page } from '@playwright/test';

/**
 * UN ENLACE COMPARTIDO LO ABRE CUALQUIERA, y casi siempre alguien que no tiene la app. Esa página (el «modo
 * artículo» de `main.tsx`) promete tres cosas: que se lee sin errores, que no carga Firebase y que no contacta con
 * ningún tercero. Aquí se comprueban las tres, también en el caso que se escapó.
 *
 * EL CASO QUE SE ESCAPÓ (30-09-2026): con el almacenamiento bloqueado —cookies bloqueadas en Safari o Chrome—
 * `hasStoredAuthSession` responde «sí» por prudencia, y el pie de sugerencias se suscribía a la sesión solo para
 * saber si quien mira es administrador (`useIsAdmin`, desde `useReviewCover`), aunque allí no se pinta ninguna
 * carátula. Resultado: se descargaba el SDK de Firebase y, en MÓVIL, Auth abría además el iframe de Google.
 * Ningún error a la vista, y por eso nada lo detectaba.
 *
 * `/api/share/*` se simula: `vite preview` no ejecuta las Pages Functions. Lo que se prueba es la página, no el
 * servidor (el servidor se probó con `wrangler pages dev`, ver `docs/plan-capacidad-gratuita.md`).
 */
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';
const OTRO = 'BBBBBBBBBBBBBBBBBBBBBB';
const CADUCADO = 'EEEEEEEEEEEEEEEEEEEEEE';
const RESUMEN = 'YYYYYYYYYYYYYYYYYYYYYY';
const AHORA = Date.now();

const articulo = {
  v: 1,
  gameId: 1,
  gameName: 'Hollow Knight',
  grade: 92,
  rating: 5,
  review: 'Un juego precioso, con un mundo que se descubre a pie y una música que no se olvida.',
  platforms: ['PC'],
  genres: ['Metroidvania'],
  strengths: ['Arte'],
  weaknesses: ['Dificultad'],
  authorNick: 'Bellanco',
  reviewedAt: AHORA - 3 * 86_400_000,
  createdAt: AHORA - 86_400_000,
  expiresAt: AHORA + 7 * 86_400_000,
};

/** Un resumen del año compartido (`kind: 'year'`), con la forma que deja salir `publicYearSummary`. */
const resumen = {
  v: 1,
  kind: 'year',
  year: 2026,
  summary: {
    year: 2026,
    count: 3,
    covers: [
      { name: 'Hollow Knight', platforms: ['PC'] },
      { name: 'Celeste', platforms: ['PC'] },
      { name: 'Hades', platforms: ['PC'] },
    ],
    avgGrade: 90,
    withReview: 2,
    platforms: [{ name: 'PC', count: 3 }],
    best: { name: 'Hollow Knight', grade: 95, genre: 'Metroidvania', platform: 'PC', platforms: ['PC'], quote: '' },
    podium: [{ name: 'Celeste', grade: 90 }, { name: 'Hades', grade: 85 }],
    genres: [{ name: 'Metroidvania', count: 2, avgGrade: 92.5, bestName: 'Hollow Knight' }],
    when: {
      precision: 'month',
      months: [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
      topMonths: [0, 3, 9],
      topCount: 1,
      dated: 3,
      undated: 0,
      first: { month: 0, names: ['Hades'] },
      last: { month: 9, names: ['Hollow Knight'] },
    },
    strengths: [{ name: 'Arte', count: 2 }],
    weaknesses: [{ name: 'Dificultad', count: 1 }],
    previous: null,
    common: null,
    palmares: null,
  },
  authorNick: 'Bellanco',
  createdAt: AHORA - 86_400_000,
  updatedAt: AHORA - 86_400_000,
  expiresAt: AHORA + 7 * 86_400_000,
};

const sugerencias = {
  items: [{ token: OTRO, gameName: 'Hollow Knight: Silksong', grade: 95, rating: 5, snippet: 'Mejor aún.', reviewedAt: AHORA }],
};

/** Simula el servidor de enlaces y apunta todo lo que la página no debería hacer. */
async function vigilar(page: Page) {
  const problemas: string[] = [];
  await page.route(/\/api\/share\/related\//, (route) => route.fulfill({ json: sugerencias }));
  await page.route(/\/api\/share\/[A-Za-z0-9_-]+$/, (route) =>
    route.request().url().endsWith(CADUCADO)
      ? route.fulfill({ status: 404, json: { error: 'Este enlace ya no está disponible' } })
      : route.fulfill({ json: route.request().url().endsWith(RESUMEN) ? resumen : articulo }),
  );
  page.on('pageerror', (error) => problemas.push(`error de página: ${error.message}`));
  page.on('request', (peticion) => {
    const url = new URL(peticion.url());
    if (url.hostname !== '127.0.0.1') problemas.push(`tercero: ${url.origin}`);
    if (/\/assets\/(firebase-|firebaseRepository-|firebaseClient-)/.test(url.pathname)) problemas.push(`Firebase: ${url.pathname}`);
    // Sin cuenta, un resumen compartido no pide carátulas: son las visitas que pueden ser miles.
    if (url.pathname.startsWith('/cover')) problemas.push(`carátula: ${url.pathname}`);
  });
  return problemas;
}

/** Como un navegador con las cookies bloqueadas: tocar el almacenamiento lanza, y no hay IndexedDB. */
async function bloquearAlmacenamiento(page: Page) {
  await page.addInitScript(() => {
    const rompe = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    for (const nombre of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, nombre, { get: rompe, configurable: true });
    }
    Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
  });
}

async function leerEnlace(page: Page, problemas: string[]) {
  await page.goto(`/r/${TOKEN}`);
  await expect(page.getByText('Un juego precioso', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Abrir el análisis sobre Hollow Knight: Silksong')).toBeVisible();
  await expect(page.getByText('Ir a la página principal')).toBeVisible();
  // Lo que llega tarde —el pie, una suscripción perezosa— también cuenta.
  await page.waitForTimeout(2500);
  expect([...new Set(problemas)]).toEqual([]);
}

test.describe('enlace compartido, visto por quien no tiene la app', () => {
  test('se lee con sus sugerencias, sin Firebase y sin terceros', async ({ page }) => {
    const problemas = await vigilar(page);
    await leerEnlace(page, problemas);
  });

  test('un enlace caducado lo dice, sin errores', async ({ page }) => {
    const problemas = await vigilar(page);
    await page.goto(`/r/${CADUCADO}`);
    await expect(page.getByText('Este enlace ya no está disponible')).toBeVisible();
    await expect(page.getByText('Ir a la página principal')).toBeVisible();
    await page.waitForTimeout(1500);
    expect([...new Set(problemas)]).toEqual([]);
  });

  test('con el almacenamiento bloqueado, tampoco carga Firebase', async ({ page }) => {
    await bloquearAlmacenamiento(page);
    const problemas = await vigilar(page);
    await leerEnlace(page, problemas);
  });

  test('un resumen del año se lee sin Firebase, sin carátulas y sin pedir sugerencias', async ({ page }) => {
    const problemas = await vigilar(page);
    const pedidas: string[] = [];
    page.on('request', (peticion) => pedidas.push(new URL(peticion.url()).pathname));
    await page.goto(`/r/${RESUMEN}`);
    await expect(page.getByRole('heading', { name: 'Resumen de 2026' })).toBeVisible();
    await expect(page.getByText('De Bellanco')).toBeVisible();
    await expect(page.getByText('Ir a la página principal')).toBeVisible();
    await page.waitForTimeout(2500);
    expect(pedidas.filter((path) => path.startsWith('/api/share/related/'))).toEqual([]);
    expect([...new Set(problemas)]).toEqual([]);
  });
});

test.describe('enlace compartido en el móvil', () => {
  // Todo el dispositivo menos `defaultBrowserType`, que no se puede cambiar dentro de un grupo (el proyecto ya es
  // Chromium, que es el motor del Pixel).
  const { defaultBrowserType: _motor, ...pixel } = devices['Pixel 7'];
  test.use(pixel);

  // En móvil es donde se notaba: Auth abre el iframe de Google en cuanto se carga el SDK.
  test('con el almacenamiento bloqueado no contacta con Google', async ({ page }) => {
    await bloquearAlmacenamiento(page);
    const problemas = await vigilar(page);
    await leerEnlace(page, problemas);
  });
});
