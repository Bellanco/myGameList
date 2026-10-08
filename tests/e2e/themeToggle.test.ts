import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * EL CAMBIO DE CLARO A OSCURO. Los temas lo funden en 350 ms (`.theme-anim`, `_base.scss`), salvo el de casa,
 * «No puedes pasar», que cambia en seco: su salto de bosque casi negro a pergamino se veía roto con el fundido
 * (iba a tirones y el mapa, la franja de abajo y los degradados cambiaban antes que el resto). Ver
 * `themes/tierramedia/tierramedia.scss`.
 *
 * End-to-end porque lo que se comprueba son las transiciones que el navegador lanza de verdad sobre el CSS del
 * build, y jsdom no tiene ni una cosa ni la otra.
 */

const LISTA_CARGADA = { timeout: 15_000 };

/** Las transiciones de CSS que siguen en marcha dos fotogramas después de pulsar el botón de tema. */
async function transicionesTrasCambiar(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((listo) => {
    document.querySelector<HTMLButtonElement>('.theme-toggle-btn')?.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      listo(document.getAnimations().filter((a) => a instanceof CSSTransition && a.playState === 'running').length);
    }));
  }));
}

test.describe('cambiar de claro a oscuro', () => {
  for (const desde of ['dark', 'light'] as const) {
    test(`en «No puedes pasar» es en seco (desde ${desde === 'dark' ? 'oscuro' : 'claro'})`, async ({ page }) => {
      await sembrarBiblioteca(page, { palette: 'tierramedia', theme: desde });
      await page.goto('/completados');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(LISTA_CARGADA);

      expect(await transicionesTrasCambiar(page)).toBe(0);
      await expect(page.locator('html')).toHaveAttribute('data-palette', 'tierramedia');
    });
  }

  test('los demás temas conservan su fundido', async ({ page }) => {
    await sembrarBiblioteca(page, { palette: 'witcher', theme: 'dark' });
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(LISTA_CARGADA);

    expect(await transicionesTrasCambiar(page)).toBeGreaterThan(0);
  });
});
