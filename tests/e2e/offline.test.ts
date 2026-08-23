import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { APP_ERROR_UI } from '../../src/core/constants/labels';

/**
 * SIN CONEXIÓN, en el build de producción y con el service worker de verdad.
 *
 * El arranque offline lo cubre el smoke; esto cubre lo que pasa DESPUÉS, al entrar en el espacio social, que es la
 * parte de la aplicación que vive de la red. Antes salía el error de la librería que fallara primero (`network
 * offline`, `Failed to fetch`, «Failed to get document because the client is offline») y, si el chunk del hub no
 * estaba en la caché, se caía el árbol entero con un «algo ha ido mal / vuelve a cargar» que no era ni verdad ni
 * accionable. Estos dos recorridos afirman lo que ve el usuario en cada caso.
 *
 * `context.setOffline` y NO la emulación de red por página: la de las herramientas de desarrollo no corta la red
 * del propio service worker y daría un falso positivo (misma nota que en el smoke).
 */
test.describe('espacio social sin conexión', () => {
  test('con el hub ya visitado: avisa con las palabras del tema y no con un error de red', async ({ page, context }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Primera visita CON red: además de instalar el service worker, deja el chunk del hub en su caché (es lo que
    // hace la regla de caché-primero de `/assets/*`).
    await page.goto('/social');
    await expect(page.getByRole('heading', { name: /Espacio social/ })).toBeVisible();

    // Dos cosas, porque hacen falta las dos: cortar la red de verdad (`setOffline`, que sí afecta al service
    // worker) y que `navigator.onLine` diga que no hay red, que es lo que hace un navegador real al perderla y
    // Playwright no simula. Sin lo segundo el recorrido comprobaría el otro camino (el del aviso por fallo, que
    // cubre el test de componente del hub) en vez de éste.
    await context.setOffline(true);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    });
    await page.goto('/social');

    // La pantalla se monta y el aviso está a la vista, con el titular del tema por defecto.
    const aviso = page.getByLabel(SOCIAL_UI.offline.sectionAria);
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(SOCIAL_UI.offline.leadByPalette.steam);
    // Y en ningún sitio aparece el error crudo de la capa de red.
    await expect(page.getByText(/network offline|Failed to fetch|client is offline/i)).toHaveCount(0);
  });

  test('sin el hub en la caché: se cuenta como falta de conexión, no como avería de la aplicación', async ({ page, context }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Sin haber entrado nunca en social, su chunk no está guardado: el `import()` no puede resolverse.
    await context.setOffline(true);
    await page.getByRole('button', { name: /Social/ }).first().click();

    await expect(page.getByText(APP_ERROR_UI.offlineLeadByPalette.steam)).toBeVisible();
    await expect(page.getByText(APP_ERROR_UI.leadByPalette.steam)).toHaveCount(0);

    // Y hay salida: recargar aquí volvería a fallar, así que la acción lleva a las listas, que sí funcionan
    // sin conexión. Sin esto el usuario se quedaba dando vueltas en la pantalla de error.
    await page.getByRole('button', { name: APP_ERROR_UI.offlineAction }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
  });
});
