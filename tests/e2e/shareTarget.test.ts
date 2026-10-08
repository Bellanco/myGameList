import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * EL MENÚ «COMPARTIR» DE ANDROID (`share_target` del manifiesto): lo compartido llega a `/compartir` y la app
 * abre el alta en Próximos con el nombre puesto.
 *
 * End-to-end y no de componente porque lo que puede fallar está entre piezas: que `/compartir` no rebote al
 * catch-all, que se vaya a Próximos sin dejar `/compartir` en el historial, y que el intérprete —que llega por
 * `import()`— conteste a tiempo de abrir el formulario.
 */

const LISTA_CARGADA = { timeout: 15_000 };
const STEAM = 'https://store.steampowered.com/app/1030300/Hollow_Knight_Silksong/';

test.describe('compartir un juego con la aplicación', () => {
  test.beforeEach(async ({ page }) => {
    // La siembra de siempre: Hollow Knight, Celeste y Hades en Completados.
    await sembrarBiblioteca(page);
  });

  test('abre el alta en Próximos con el nombre que trae la ficha de Steam', async ({ page }) => {
    await page.goto(`/compartir?title=${encodeURIComponent('Hollow Knight: Silksong on Steam')}&url=${encodeURIComponent(STEAM)}`);

    await expect(page).toHaveURL(/\/proximos$/, LISTA_CARGADA);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#draft-name')).toHaveValue('Hollow Knight: Silksong');

    // `replace`: atrás no vuelve a `/compartir`, que repetiría el alta. Son dos entradas, la `about:blank` con la
    // que nace la página de Playwright y `/proximos`; con `/compartir` dentro serían tres.
    expect(await page.evaluate(() => window.history.length)).toBe(2);
  });

  test('si el juego ya está en una lista, el formulario lo dice', async ({ page }) => {
    await page.goto(`/compartir?text=${encodeURIComponent(`Save 50% on Hades on Steam ${STEAM}`)}`);

    await expect(page.locator('#draft-name')).toHaveValue('Hades', LISTA_CARGADA);
    await expect(page.locator('#draft-name-error')).toBeVisible();
  });

  test('sin un nombre que sacar, se queda en Próximos sin abrir nada', async ({ page }) => {
    await page.goto(`/compartir?url=${encodeURIComponent('https://example.com/algo')}`);

    await expect(page).toHaveURL(/\/proximos$/, LISTA_CARGADA);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
