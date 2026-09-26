import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';
import { DEFAULT_PALETTE } from '../../src/core/constants/palettes';
import { PALETTE_KEY, PALETTE_LOCK_KEY } from '../../src/core/constants/storageKeys';

/**
 * LOS TEMAS SON DE QUIEN TIENE ESPACIO SOCIAL, en el build de verdad: el anti-flash de `index.html` y la puerta de
 * `useAppliedPalette` juntos. Aquí no hay sesión, así que no hay social.
 */
test.describe('temas sin espacio social', () => {
  test('se pinta el de por defecto aunque haya otro guardado, y lo guardado no se pierde', async ({ page }) => {
    await sembrarBiblioteca(page, { palette: 'witcher', sinSocial: true });
    await page.goto('/completados');

    await expect(page.locator('html')).toHaveAttribute('data-palette', DEFAULT_PALETTE);
    expect(await page.evaluate((key) => localStorage.getItem(key), PALETTE_LOCK_KEY)).toBe('on');
    expect(await page.evaluate((key) => localStorage.getItem(key), PALETTE_KEY)).toBe('witcher');
  });

  test('con la marca puesta, el anti-flash ya pinta el de por defecto antes de que arranque la app', async ({ page }) => {
    await sembrarBiblioteca(page, { palette: 'witcher', sinSocial: true });
    await page.goto('/completados');
    await expect(page.locator('html')).toHaveAttribute('data-palette', DEFAULT_PALETTE);

    // Se lee el atributo en el primer script de la página tras el anti-flash, antes de cualquier módulo.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' && !('__paletaInicial' in window)) {
          (window as unknown as { __paletaInicial: string | null }).__paletaInicial =
            document.documentElement.getAttribute('data-palette');
        }
      });
    });
    await page.reload();
    expect(await page.evaluate(() => (window as unknown as { __paletaInicial: string | null }).__paletaInicial))
      .toBe(DEFAULT_PALETTE);
  });
});

test('`steam` guardado, que fue el tema de casa, se pinta como el de por defecto', async ({ page }) => {
  // Con social (la siembra lo simula por defecto al pasar `palette`): el id viejo ya no lleva a The Witcher.
  await sembrarBiblioteca(page, { palette: 'steam' });
  await page.goto('/completados');
  await expect(page.locator('html')).toHaveAttribute('data-palette', DEFAULT_PALETTE);
});
