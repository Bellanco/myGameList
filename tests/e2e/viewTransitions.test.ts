import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LAS VIEW TRANSITIONS DEL CAMBIO DE PANTALLA (`<ViewTransition>` en `App`, `ProfileReviewsList` y `ReviewScreen`;
 * la coreografía en `_motion.scss`).
 *
 * Lo que se vigila es lo que se puede romper sin que nada falle a la vista:
 *  · que al ARRANCAR no se anime nada (las redirecciones del arranque también son transiciones);
 *  · que cambiar de pestaña anime la pantalla (`pantalla`);
 *  · que al abrir una reseña la tarjeta de la lista y la del detalle se emparejen por nombre (`resena-<id>`): si
 *    un lado pierde el nombre, la tarjeta deja de crecer y el detalle entra como cualquier pantalla.
 */

const LISTA_CARGADA = { timeout: 15_000 };

/** Cada `startViewTransition`, con los pseudo-elementos que se animan cuando arranca. */
async function registrarTransiciones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registro: string[][] = [];
    (window as unknown as { __vt: string[][] }).__vt = registro;
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = ((...args: Parameters<typeof original>) => {
      const transicion = original(...args);
      const pseudos: string[] = [];
      registro.push(pseudos);
      void transicion.ready.then(() => {
        for (const animacion of document.getAnimations()) {
          const pseudo = (animacion.effect as KeyframeEffect | null)?.pseudoElement;
          if (pseudo && !pseudos.includes(pseudo)) pseudos.push(pseudo);
        }
      }).catch(() => {});
      return transicion;
    }) as typeof document.startViewTransition;
  });
}

const transiciones = (page: Page) => page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt);

test.describe('view transitions del cambio de pantalla', () => {
  test.beforeEach(async ({ page }) => {
    await registrarTransiciones(page);
    await sembrarBiblioteca(page, { amplia: true });
  });

  test('al arrancar no anima nada, y cambiar de pestaña anima la pantalla', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/completados$/, LISTA_CARGADA);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await transiciones(page)).toEqual([]);

    await page.locator('.tab-btn').nth(2).click();
    await expect(page).toHaveURL(/\/en-curso$/);
    await expect.poll(async () => (await transiciones(page)).flat()).toContainEqual(expect.stringMatching(/^::view-transition-new\(/));
  });

  test('al abrir una reseña, la tarjeta de la lista crece hasta la del detalle', async ({ page }) => {
    await page.goto('/stats/resenas');
    const abrir = page.locator('.hub-review-open').first();
    await abrir.waitFor(LISTA_CARGADA);

    await abrir.click();
    await expect(page.locator('.hub-feed-card-detail')).toBeVisible();
    await expect.poll(async () => (await transiciones(page)).flat())
      .toContainEqual(expect.stringMatching(/^::view-transition-group\(resena-/));
  });
});
