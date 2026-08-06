import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test sobre el BUILD DE PRODUCCIÓN: ¿arranca la app y se puede usar?
 *
 * Qué cubre que ningún otro test puede cubrir: los tests unitarios y de componente corren sobre módulos en jsdom,
 * así que no ven nada de lo que solo existe al desplegar —el grafo de chunks, la minificación, el CSS con hash, el
 * service worker y su precache—. Un fallo ahí no rompe ningún test y sí rompe la app entera para todo el mundo.
 *
 * Deliberadamente CORTO y sin automatizar el formulario de alta: un smoke test que pelea con campos de etiquetas
 * se vuelve inestable, y un test inestable se acaba ignorando. Los datos se siembran en localStorage antes de
 * cargar, que es como se comprueba el render de verdad sin depender de la UI de creación.
 *
 * (Este fichero sustituye por completo al smoke original, que probaba una app imaginaria: pulsaba "Add Game",
 * rellenaba `input[name="gameName"]` y migraba juegos arrastrándolos. Nada de eso existe —la UI está en español y
 * migrar es por botones—, así que habría fallado en el primer clic. Estaba excluido de todos los runners.)
 */

const JUEGOS = [
  { id: 1, name: 'Hollow Knight', grade: 96, score: 5 },
  { id: 2, name: 'Celeste', grade: 88, score: 4 },
  { id: 3, name: 'Hades', grade: 92, score: 5 },
];

/** Siembra la biblioteca ANTES de que cargue la app (la clave la fija `core/constants/storageKeys`). */
async function sembrarBiblioteca(page: Page): Promise<void> {
  await page.addInitScript((juegos) => {
    const now = Date.now();
    const c = juegos.map((j) => ({
      ...j, _ts: now, listedAt: now, genres: ['Acción'], platforms: ['PC'], steamDeck: false,
      years: [2024], strengths: ['Ritmo'], weaknesses: [], reasons: [], replayable: true, retry: false,
      hours: 20, review: 'Reseña de prueba.',
    }));
    localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
      c, v: [], e: [], p: [], deleted: [], updatedAt: now, schemaVersion: 1,
    }));
    // Decidido el consentimiento para que el banner no tape la interfaz durante el test.
    localStorage.setItem('mis-listas-analytics-consent', 'denied');
  }, JUEGOS);
}

test.describe('smoke del build de producción', () => {
  test('arranca, pinta la lista y responde a la interacción', async ({ page }) => {
    const errores: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text()); });
    page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`));

    await sembrarBiblioteca(page);
    await page.goto('/completados');

    // 1) La app ha montado y ha pintado los juegos sembrados.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    for (const juego of JUEGOS) {
      await expect(page.getByRole('button', { name: new RegExp(juego.name) })).toBeVisible();
    }

    // 2) Interacción: desplegar el detalle de una fila. Se localiza por `aria-controls` (el atributo que
    // identifica al disparador de ESE detalle) y no por nombre: al desplegarse aparecen los botones "Editar",
    // "Eliminar" y "Pasa a…", que llevan el nombre del juego en su etiqueta y harían ambigua la búsqueda.
    const fila = page.locator(`button[aria-controls="game-detail-${JUEGOS[0].id}"]`);
    await expect(fila).toHaveAttribute('aria-expanded', 'false');
    await fila.click();
    await expect(fila).toHaveAttribute('aria-expanded', 'true');
    // El detalle desplegado trae las acciones de la fila, que es la prueba de que se ha abierto de verdad.
    await expect(page.getByRole('button', { name: `Editar - ${JUEGOS[0].name}` })).toBeVisible();

    // 3) Interacción: cambiar de lista. La vergüenza está vacía, así que debe salir su estado vacío.
    await page.getByRole('button', { name: /Lista de la vergüenza/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista de la vergüenza');
    await expect(page.getByText('No hay juegos aquí todavía')).toBeVisible();

    // 4) Ni un error en consola durante todo el recorrido.
    expect(errores).toEqual([]);
  });

  /**
   * ARRANCAR SIN RED. Era un bug real y grave: el service worker anterior decía funcionar offline, precacheaba
   * solo el HTML y pedía los chunks a la red sin respaldo, así que sin conexión se servía el shell y la app se
   * quedaba en blanco. Nada lo detectaba.
   *
   * `context.setOffline` de Playwright SÍ corta la red de los `fetch` que hace el propio service worker —
   * comprobado saboteando el SW (volviéndolo red-solo para `/assets/*`): con esa versión este test falla y la
   * página no pinta nada. Ojo, no confundir con la emulación de red por PÁGINA de las herramientas de desarrollo,
   * que no afecta al service worker y da un falso positivo.
   *
   * A propósito NO se comprueba "la caché contiene los assets": eso pasa igual con el precache vacío, porque la
   * regla de caché-primero los guarda al navegar. Lo que hay que afirmar es lo que le pasa al usuario.
   */
  test('arranca sin red después de haber entrado una vez', async ({ page, context }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    // El primer arranque instala el service worker; hace falta una recarga para que controle la página.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    // La app tiene que MONTARSE y pintar los datos locales, no un rectángulo en blanco.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    for (const juego of JUEGOS) {
      await expect(page.getByRole('button', { name: new RegExp(juego.name) })).toBeVisible();
    }
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  });
});
