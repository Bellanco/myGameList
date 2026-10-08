import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LAS VIEW TRANSITIONS DEL CAMBIO DE PANTALLA (`<ViewTransition>` en `App`, `ProfileReviewsList` y `ReviewScreen`;
 * la coreografía en `_motion.scss`).
 *
 * Lo que se vigila es lo que se puede romper sin que nada falle a la vista:
 *  · que al ARRANCAR no se anime nada (las redirecciones del arranque también son transiciones);
 *  · que cambiar de pantalla la funda (`pantalla`) y que entre listas se deslice hacia el lado de la pestaña
 *    (`lista-adelante` / `lista-atras`);
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
          // Y la animación que le toca a cada uno: es lo que dice hacia dónde se desliza una lista.
          const nombre = (animacion as CSSAnimation).animationName;
          if (pseudo && nombre && !nombre.startsWith('-ua-')) pseudos.push(`${pseudo}:${nombre}`);
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

  test('entre listas se desliza hacia el lado de la pestaña pulsada', async ({ page }) => {
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(LISTA_CARGADA);

    await page.locator('.tab-btn').nth(2).click();
    await expect.poll(async () => (await transiciones(page)).at(-1) ?? []).toContainEqual(expect.stringMatching(/vt-entra-derecha$/));

    await page.locator('.tab-btn').nth(0).click();
    await expect.poll(async () => (await transiciones(page)).at(-1) ?? []).toContainEqual(expect.stringMatching(/vt-entra-izquierda$/));
  });

  /* La captura del `<main>` sube por encima de todo lo que no tiene nombre, y mide la lista entera: sin nombre propio,
     la barra inferior y los botones flotantes desaparecían debajo de la lista mientras se deslizaba. Con nombre
     suben a su propia capa (quieta, sin animación de grupo, así que no sale en `getAnimations`: se mira el nombre). */
  test('la barra inferior y los botones flotantes tienen capa propia en la transición', async ({ page }) => {
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(LISTA_CARGADA);

    const nombres = await page.evaluate(() => Object.fromEntries(
      ['.bottom-nav', '.fab', '.fab-roulette', '.floating-controls', '.scroll-top-btn'].map((selector) => {
        const el = document.querySelector(selector);
        return [selector, el ? getComputedStyle(el).viewTransitionName : null];
      }),
    ));
    expect(nombres).toEqual({
      '.bottom-nav': 'barra-inferior',
      '.fab': 'boton-anadir',
      '.fab-roulette': 'boton-ruleta',
      '.floating-controls': 'controles-flotantes',
      // El de subir, oculto arriba del todo, no: capturado aparte pintaba un cuadrado borroso sobre la lista.
      '.scroll-top-btn': 'none',
    });

    // Y con ellas la transición sigue arrancando: dos nombres repetidos la cancelarían entera.
    await page.locator('.tab-btn').nth(2).click();
    await expect.poll(async () => (await transiciones(page)).at(-1) ?? []).toContainEqual(expect.stringMatching(/vt-entra-derecha$/));
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
